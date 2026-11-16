-- ═══════════════════════════════════════════════════════════════════════
-- fn_move_booking_ticket 的 SQL 交易測試（P0-C）。尚未執行；⚠ 只能對測試庫（kucvxpjatptfckhlxptj）執行。
--
-- 這份是「SQL 交易測試」：以資料庫擁有者（postgres）連線，用 request.jwt.claims 設定模擬登入身分，
--   驗證的是：業務邏輯、鎖定與回滾、帳本不變量、錯誤碼對應、守門觸發器的互動。
-- 它「不能取代」真正的角色驗證：擁有者連線本來就繞過 GRANT 與 RLS，所以 anon／authenticated／service_role
--   能不能呼叫，必須用 docs/testdb/move_ticket_02_authenticated_rpc_test.md 的真實 PostgREST 呼叫來驗，
--   本檔的 T15 只做 catalog 層級的授權矩陣檢查（不是角色驗證）。
--
-- 前置：已套用 20261115_move_ticket_testdb_01_sync.sql 與 20261115_fn_move_booking_ticket.sql。
-- 執行方式：整份只有「一個 DO 語句」（暫時表、暫時函式與所有夾具都建在它裡面），結尾（含任何提早離開的路徑）必定 raise exception，
--   單一語句的例外會讓它的全部寫入回滾，與工具是否另外包交易無關；結果以精簡 JSON 放在錯誤訊息 MOVE_TESTS_RESULT: 之後（pass／fail／skip 總數＋只列 FAIL 與 SKIP，≤ 8000 字元；見 pg_temp.mv_summary）。
--   庫識別守門（叢集 system_identifier＋無 change_log／fn_table_sigs）在 DO 最前面，不符直接中止。
-- 已核對（2026-11-14 唯讀）：enum 型別 ticket_category／ticket_log_action／booking_status／ticket_status 與用到的值皆存在；
--   bookings 必填只有 id/date/start_time；ticket_logs 只有 id/action；ticket_types 只有 id/name/category；members 只有 id。
--   members 刪除會級聯 bookings、member_tickets（再級聯 ticket_logs）；bookings.sibling_of 無外鍵。
-- 帳號：測試會從測試庫現有員工挑選（front_desk、啟用中的店長教練、一般教練、第二位教練）；
--   找不到的角色，相關測試記成 SKIP（不是通過）。員工的 auth_id 有外鍵到 auth.users，所以不自行建立帳號。
-- ⚠ 草稿：夾具欄位與列舉值是依 baseline schema 與測試庫目錄推定，第一次在測試庫實跑時可能需要微調。
-- ═══════════════════════════════════════════════════════════════════════

do $mvt$
declare
  v_desk uuid; v_mgr uuid; v_coach uuid; v_coach_id text; v_coach2_id text; v_member_auth uuid;
  v_any uuid;
  v_r jsonb; v_n integer; v_ok boolean; v_det text;
  v_case record;
  v_limit_end date;
begin
  -- 庫識別守門
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫，停止執行';
  end if;
  -- 夾具／暫時物件全部建立在這個 DO 之內
create temp table mv_res(n serial primary key, name text, ok boolean, detail text) on commit drop;

create function pg_temp.mv_rec(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into mv_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail,''), 300)) $$;

create function pg_temp.mv_skip(p_name text, p_why text) returns void
language sql as $$ insert into mv_res(name, ok, detail) values ('SKIP '||p_name, null, p_why) $$;

-- 精簡輸出（工具只保留錯誤訊息頭尾各約 5,000 字元、截掉中間 → 完整 JSON 會丟失中段）：
--   先給 pass／fail／skip／total 與 verdict，再只列 FAIL 與 SKIP（FAIL 優先），整體 ≤ 8000 字元；
--   放不下的以 omitted_fail／omitted_skip 計數。pass 不含 skip；verdict 只有在 fail=0 且 skip=0 且至少有 1 筆時才是 PASS；
--   有 skip → INCOMPLETE_SKIPS、有 fail → FAIL、沒有任何結果 → NO_TESTS；被截斷（omitted_* > 0）時絕不會是 PASS。
create function pg_temp.mv_summary() returns text language plpgsql as $f$
declare
  v_pass integer; v_fail integer; v_skip integer; v_total integer;
  v_items jsonb := '[]'::jsonb; v_item jsonb; v_len integer; v_budget constant integer := 8000;
  v_full boolean := false; v_om_fail integer := 0; v_om_skip integer := 0;
  v_verdict text; v_out text; v_last jsonb;
  r record;
begin
  select count(*) filter (where ok is true), count(*) filter (where ok is false), count(*) filter (where ok is null), count(*)
    into v_pass, v_fail, v_skip, v_total from mv_res;
  v_verdict := case when v_total = 0 then 'NO_TESTS' when v_fail > 0 then 'FAIL' when v_skip > 0 then 'INCOMPLETE_SKIPS' else 'PASS' end;
  v_len := 700;                                                       -- 標頭（計數、verdict、omitted、說明）預留
  for r in select n, name, ok, detail from mv_res where ok is not true order by (ok is null), n loop
    v_item := jsonb_build_object('n', r.n, 'r', case when r.ok is null then 'SKIP' else 'FAIL' end,
                                 'name', left(r.name, 160), 'detail', left(coalesce(r.detail, ''), 160));
    if v_full or v_len + length(v_item::text) + 1 > v_budget then
      v_full := true;                                                 -- 一旦放不下就停止，維持 FAIL 優先、不讓後面的 SKIP 插隊
      if r.ok is null then v_om_skip := v_om_skip + 1; else v_om_fail := v_om_fail + 1; end if;
    else
      v_items := v_items || v_item; v_len := v_len + length(v_item::text) + 1;
    end if;
  end loop;
  loop                                                                -- 最後保險：真實長度超過上限就從尾端再拿掉，並計入 omitted
    v_out := jsonb_build_object('verdict', v_verdict, 'pass', v_pass, 'fail', v_fail, 'skip', v_skip, 'total', v_total,
               'listed', jsonb_array_length(v_items), 'omitted_fail', v_om_fail, 'omitted_skip', v_om_skip,
               'note', 'pass 不含 skip；只列 FAIL 與 SKIP（FAIL 優先）；omitted_* > 0 代表還有未列出的項目，不得視為全部通過',
               'items', v_items)::text;
    exit when length(v_out) <= v_budget or jsonb_array_length(v_items) = 0;
    v_last := v_items -> (jsonb_array_length(v_items) - 1);
    if v_last->>'r' = 'SKIP' then v_om_skip := v_om_skip + 1; else v_om_fail := v_om_fail + 1; end if;
    v_items := v_items - (jsonb_array_length(v_items) - 1);
  end loop;
  return v_out;
end $f$;

create function pg_temp.mv_today() returns date language sql as $$ select (now() at time zone 'Asia/Taipei')::date $$;

-- 模擬登入身分（auth.uid()／auth.role() 都讀這幾個設定）；p_uid 為 null＝未登入／維運
create function pg_temp.mv_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',  coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', case when p_uid is null then '' else 'authenticated' end, true);
  perform set_config('request.jwt.claims', case when p_uid is null then ''
                                                else json_build_object('sub', p_uid::text, 'role', 'authenticated')::text end, true);
end $$;

create function pg_temp.mv_call(p_uid uuid, p_from text, p_to text, p_mode text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.mv_as(p_uid);
  r := public.fn_move_booking_ticket(p_from, p_to, p_mode);
  perform pg_temp.mv_as(null);
  return r;
end $$;

create function pg_temp.mv_type(p_id text, p_name text, p_cat text, p_tr boolean default false) returns void language sql as $$
  insert into ticket_types(id, name, category, time_restricted) values (p_id, p_name, p_cat::ticket_category, p_tr) on conflict (id) do nothing $$;

create function pg_temp.mv_log(p_ticket text, p_bk text, p_action text, p_delta integer, p_note text default 'mvtest') returns void language sql as $$
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values ('MVT-LG-' || md5(random()::text || clock_timestamp()::text), p_ticket, p_action::ticket_log_action, p_delta, p_bk, 'mvtest', p_note) $$;

create function pg_temp.mv_net(p_tk text, p_bk text) returns integer language sql as $$
  select coalesce(sum(case when action = 'deduct' then 1 when action = 'refund' then -1 else 0 end), 0)::int
    from ticket_logs where ticket_id = p_tk and booking_id = p_bk $$;
create function pg_temp.mv_rem(p_tk text) returns integer language sql as $$ select sessions_remaining from member_tickets where id = p_tk $$;
create function pg_temp.mv_sum(p_tk text) returns integer language sql as $$ select coalesce(sum(delta), 0)::int from ticket_logs where ticket_id = p_tk $$;

-- 一組標準夾具：會員、票券、原預約（已綁票、在後）、新預約（待簽約、在前）、原預約的一筆扣課帳
create function pg_temp.mv_pair(p_key text, p_ticket_type text default 'MVT-T-PT', p_booking_type text default 'MVT-T-PT',
    p_cat text default '私人教練', p_total integer default 4, p_rem integer default 2, p_coach text default null,
    p_partner_from text default null, p_partner_to text default null, p_to_days integer default 9, p_from_days integer default 10,
    p_to_time text default '10:00', p_from_time text default '11:00') returns void language plpgsql as $$
begin
  insert into members(id, name) values ('MVT-M-' || p_key, 'MVT測試會員') on conflict (id) do nothing;
  insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status)
    values ('MVT-TK-' || p_key, 'MVT-M-' || p_key, p_ticket_type, 'MVT方案', p_total, p_rem, 'usable');
  insert into bookings(id, member_id, coach_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, partner_id)
    values ('MVT-F-' || p_key, 'MVT-M-' || p_key, p_coach, p_cat::ticket_category, p_ticket_type, pg_temp.mv_today() + p_from_days, p_from_time, 60,
            'booked', false, 'MVT-TK-' || p_key, p_partner_from);
  insert into bookings(id, member_id, coach_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, partner_id)
    values ('MVT-T-' || p_key, 'MVT-M-' || p_key, p_coach, p_cat::ticket_category, p_booking_type, pg_temp.mv_today() + p_to_days, p_to_time, 60,
            'booked', true, null, p_partner_to);
  perform pg_temp.mv_log('MVT-TK-' || p_key, 'MVT-F-' || p_key, 'deduct', -1);
end $$;

  perform pg_temp.mv_as(null);

  -- 帳號探索（不建立 auth.users）
  select auth_id into v_desk from employees where role::text = 'front_desk' and auth_id is not null and status::text is distinct from 'inactive' order by id limit 1;
  select auth_id into v_mgr from employees where role::text = 'coach' and coalesce(is_manager, false) and auth_id is not null and status::text is distinct from 'inactive' order by id limit 1;
  select auth_id, id into v_coach, v_coach_id from employees where role::text = 'coach' and not coalesce(is_manager, false) and auth_id is not null and status::text is distinct from 'inactive' order by id limit 1;
  select id into v_coach2_id from employees where role::text = 'coach' and id is distinct from v_coach_id order by id limit 1;
  select auth_id into v_member_auth from members where auth_id is not null order by id limit 1;
  v_any := coalesce(v_desk, v_mgr);
  if v_any is null then
    perform pg_temp.mv_rec('PRECONDITION 找得到櫃檯或店長帳號', false, '測試庫沒有可用的 front_desk 或啟用中的店長教練（需要 auth_id）');
    raise exception 'MOVE_TESTS_RESULT: %', pg_temp.mv_summary();
  end if;

  -- 共用票種
  perform pg_temp.mv_type('MVT-T-PT',   'MVT 一般教練課', '私人教練');
  perform pg_temp.mv_type('MVT-T-FR',   'MVT 友善教練課', '私人教練');
  perform pg_temp.mv_type('MVT-T-VIP',  'MVT VIP教練課',  '私人教練');
  perform pg_temp.mv_type('tt-discount-mvt', 'MVT 折抵券', '私人教練');
  perform pg_temp.mv_type('MVT-T-SELF', 'MVT 自主訓練',   '自主訓練');
  perform pg_temp.mv_type('MVT-T-SELF2','MVT 自主訓練二', '自主訓練');
  perform pg_temp.mv_type('MVT-T-TR',   'MVT 限時段教練課', '私人教練', true);

  -- ── T01 hold 成功：搬票、搬帳、餘額與帳本合計不變 ──
  perform pg_temp.mv_pair('t01');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t01', 'MVT-T-t01', 'hold');
  perform pg_temp.mv_rec('T01 hold 成功', v_r->>'ok' = 'true', v_r::text);
  perform pg_temp.mv_rec('T01 餘額不變（2）', pg_temp.mv_rem('MVT-TK-t01') = 2, pg_temp.mv_rem('MVT-TK-t01')::text);
  perform pg_temp.mv_rec('T01 淨額：原預約 0、新預約 1', pg_temp.mv_net('MVT-TK-t01','MVT-F-t01') = 0 and pg_temp.mv_net('MVT-TK-t01','MVT-T-t01') = 1, '');
  perform pg_temp.mv_rec('T01 帳本 delta 合計不變（−1）', pg_temp.mv_sum('MVT-TK-t01') = -1, pg_temp.mv_sum('MVT-TK-t01')::text);
  perform pg_temp.mv_rec('T01 新預約已綁票且不再待簽約', (select ticket_id = 'MVT-TK-t01' and not coalesce(pending_contract,false) from bookings where id = 'MVT-T-t01'), '');
  perform pg_temp.mv_rec('T01 原預約變待簽約且無票', (select ticket_id is null and coalesce(pending_contract,false) and status::text = 'booked' from bookings where id = 'MVT-F-t01'), '');
  perform pg_temp.mv_rec('T01 寫了 3 筆帳（refund、deduct、adjust 0）', (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t01' and note like '調課%') = 3, '');

  -- ── T02 cancel 成功 ──
  perform pg_temp.mv_pair('t02');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t02', 'MVT-T-t02', 'cancel');
  perform pg_temp.mv_rec('T02 cancel 成功', v_r->>'ok' = 'true', v_r::text);
  perform pg_temp.mv_rec('T02 原預約已取消、無票', (select status::text = 'cancelled' and ticket_id is null and cancelled_at is not null from bookings where id = 'MVT-F-t02'), '');
  perform pg_temp.mv_rec('T02 餘額不變、淨額 0／1', pg_temp.mv_rem('MVT-TK-t02') = 2 and pg_temp.mv_net('MVT-TK-t02','MVT-F-t02') = 0 and pg_temp.mv_net('MVT-TK-t02','MVT-T-t02') = 1, '');

  -- ── T03 partner_id：搬到新預約、原預約清空、衝突拒絕、相同值通過 ──
  perform pg_temp.mv_pair('t03a', p_partner_from => 'MVT-P1');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t03a', 'MVT-T-t03a', 'cancel');
  perform pg_temp.mv_rec('T03a partner 搬移成功', v_r->>'ok' = 'true'
    and (select partner_id from bookings where id = 'MVT-T-t03a') = 'MVT-P1'
    and (select partner_id from bookings where id = 'MVT-F-t03a') is null, v_r::text);
  perform pg_temp.mv_pair('t03b', p_partner_from => 'MVT-P1', p_partner_to => 'MVT-P2');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t03b', 'MVT-T-t03b', 'cancel');
  perform pg_temp.mv_rec('T03b partner 衝突拒絕', v_r->>'error_code' = 'MOVE.PARTNER_CONFLICT', v_r::text);
  perform pg_temp.mv_pair('t03c', p_partner_from => 'MVT-P1', p_partner_to => 'MVT-P1');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t03c', 'MVT-T-t03c', 'cancel');
  perform pg_temp.mv_rec('T03c partner 相同值通過', v_r->>'ok' = 'true', v_r::text);
  perform pg_temp.mv_pair('t03d', p_partner_to => 'MVT-P2');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t03d', 'MVT-T-t03d', 'cancel');
  perform pg_temp.mv_rec('T03d 新預約有值、原預約為空 → 拒絕（嚴格解讀）', v_r->>'error_code' = 'MOVE.PARTNER_CONFLICT', v_r::text);

  -- ── T04 帳本驗證（原預約）──
  perform pg_temp.mv_pair('t04a');   -- 先把唯一的 deduct 換成無任何紀錄
  delete from ticket_logs where ticket_id = 'MVT-TK-t04a';
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t04a', 'MVT-T-t04a', 'cancel');
  perform pg_temp.mv_rec('T04a 原預約無帳本 → LEDGER_MISSING', v_r->>'error_code' = 'MOVE.LEDGER_MISSING', v_r::text);
  perform pg_temp.mv_pair('t04b');   -- 多點扣課（delta −2）
  delete from ticket_logs where ticket_id = 'MVT-TK-t04b';
  perform pg_temp.mv_log('MVT-TK-t04b', 'MVT-F-t04b', 'deduct', -2);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t04b', 'MVT-T-t04b', 'cancel');
  perform pg_temp.mv_rec('T04b deduct delta −2 → LEDGER_UNSUPPORTED', v_r->>'error_code' = 'MOVE.LEDGER_UNSUPPORTED', v_r::text);
  perform pg_temp.mv_pair('t04c');   -- 有人工 adjust +1
  perform pg_temp.mv_log('MVT-TK-t04c', 'MVT-F-t04c', 'adjust', 1);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t04c', 'MVT-T-t04c', 'cancel');
  perform pg_temp.mv_rec('T04c adjust delta ≠ 0 → LEDGER_UNSUPPORTED', v_r->>'error_code' = 'MOVE.LEDGER_UNSUPPORTED', v_r::text);
  perform pg_temp.mv_pair('t04d');   -- 淨 0（已退過）
  perform pg_temp.mv_log('MVT-TK-t04d', 'MVT-F-t04d', 'refund', 1);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t04d', 'MVT-T-t04d', 'cancel');
  perform pg_temp.mv_rec('T04d 淨額 0 → LEDGER_UNSUPPORTED', v_r->>'error_code' = 'MOVE.LEDGER_UNSUPPORTED', v_r::text);
  perform pg_temp.mv_pair('t04e');   -- 出現 grant
  perform pg_temp.mv_log('MVT-TK-t04e', 'MVT-F-t04e', 'grant', 1);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t04e', 'MVT-T-t04e', 'cancel');
  perform pg_temp.mv_rec('T04e 出現 grant → LEDGER_UNSUPPORTED', v_r->>'error_code' = 'MOVE.LEDGER_UNSUPPORTED', v_r::text);
  perform pg_temp.mv_pair('t04f');   -- 扣、退、再扣（淨 1、delta −1）→ 通過
  perform pg_temp.mv_log('MVT-TK-t04f', 'MVT-F-t04f', 'refund', 1);
  perform pg_temp.mv_log('MVT-TK-t04f', 'MVT-F-t04f', 'deduct', -1);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t04f', 'MVT-T-t04f', 'cancel');
  perform pg_temp.mv_rec('T04f 扣退再扣（淨 1）→ 通過', v_r->>'ok' = 'true', v_r::text);

  -- ── T05 新預約的帳本殘留 ──
  perform pg_temp.mv_pair('t05a');
  perform pg_temp.mv_log('MVT-TK-t05a', 'MVT-T-t05a', 'deduct', -1);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t05a', 'MVT-T-t05a', 'cancel');
  perform pg_temp.mv_rec('T05a 新預約淨 1 → TO_LEDGER_DIRTY', v_r->>'error_code' = 'MOVE.TO_LEDGER_DIRTY', v_r::text);
  perform pg_temp.mv_pair('t05b');
  perform pg_temp.mv_log('MVT-TK-t05b', 'MVT-T-t05b', 'deduct', 0);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t05b', 'MVT-T-t05b', 'cancel');
  perform pg_temp.mv_rec('T05b 新預約有 delta 0 的 deduct → TO_LEDGER_DIRTY', v_r->>'error_code' = 'MOVE.TO_LEDGER_DIRTY', v_r::text);
  perform pg_temp.mv_pair('t05c');   -- 新預約曾扣後退（淨 0、delta 0）→ 允許
  perform pg_temp.mv_log('MVT-TK-t05c', 'MVT-T-t05c', 'deduct', -1);
  perform pg_temp.mv_log('MVT-TK-t05c', 'MVT-T-t05c', 'refund', 1);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t05c', 'MVT-T-t05c', 'cancel');
  perform pg_temp.mv_rec('T05c 新預約曾扣後退（淨 0）→ 通過', v_r->>'ok' = 'true', v_r::text);

  -- ── T06 票種相容矩陣（逐條對應前端；用 cancel 模式避開月份守門）──
  for v_case in
    select * from (values
      ('t06a','MVT-T-PT','MVT-T-PT','私人教練', true,  '相同票種'),
      ('t06b','MVT-T-PT','MVT-T-FR','私人教練', true,  '友善課用一般教練票（規則 3）'),
      ('t06c','MVT-T-VIP','MVT-T-PT','私人教練', true, '一般教練課用 VIP／限定票（規則 2）'),
      ('t06d','MVT-T-VIP','MVT-T-FR','私人教練', true, '友善課用 VIP／限定票（規則 3 的結果，需與前端對照）'),
      ('t06e','MVT-T-FR','MVT-T-PT','私人教練', false,'一般教練課不能用友善票'),
      ('t06f','MVT-T-FR','MVT-T-FR','私人教練', true, '友善票上友善課（相同票種）'),
      ('t06g','tt-discount-mvt','MVT-T-PT','私人教練', false,'折抵券不能上一般教練課'),
      ('t06h','tt-discount-mvt','MVT-T-FR','私人教練', false,'折抵券不能上友善課'),
      ('t06i','MVT-T-SELF','MVT-T-SELF2','自主訓練', true, '自主訓練：同類別不同票種'),
      ('t06j','MVT-T-SELF','MVT-T-PT','私人教練', false,'自主訓練票不能上教練課'),
      ('t06k','MVT-T-PT','MVT-T-SELF','自主訓練', false,'教練票不能上自主訓練（票類別為私人教練、NULL 安全）')
    ) as x(k, tk_type, bk_type, cat, expect_ok, why)
  loop
    perform pg_temp.mv_pair(v_case.k, p_ticket_type => v_case.tk_type, p_booking_type => v_case.bk_type, p_cat => v_case.cat);
    v_r := pg_temp.mv_call(v_any, 'MVT-F-' || v_case.k, 'MVT-T-' || v_case.k, 'cancel');
    perform pg_temp.mv_rec('T06 ' || v_case.k || ' ' || v_case.why,
      case when v_case.expect_ok then v_r->>'ok' = 'true' else v_r->>'error_code' = 'MOVE.TYPE_MISMATCH' end, v_r::text);
  end loop;
  -- 預約票種為空（NULL）→ TYPE_UNKNOWN；搬票後新預約仍維持自己的票種
  perform pg_temp.mv_pair('t06n');
  update bookings set ticket_type_id = null where id = 'MVT-T-t06n';
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t06n', 'MVT-T-t06n', 'cancel');
  perform pg_temp.mv_rec('T06n 預約票種為空 → TYPE_UNKNOWN', v_r->>'error_code' = 'MOVE.TYPE_UNKNOWN', v_r::text);
  perform pg_temp.mv_pair('t06p', p_ticket_type => 'MVT-T-VIP', p_booking_type => 'MVT-T-FR');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t06p', 'MVT-T-t06p', 'cancel');
  perform pg_temp.mv_rec('T06p 搬票後新預約票種不變（仍是友善課）、票券票種不變',
    (select ticket_type_id = 'MVT-T-FR' from bookings where id = 'MVT-T-t06p')
    and (select ticket_type_id = 'MVT-T-VIP' from member_tickets where id = 'MVT-TK-t06p'), v_r::text);
  -- 限時段票：平日 10:00 通過；下課超過 18:00 拒絕；週末拒絕
  perform pg_temp.mv_pair('t06q', p_ticket_type => 'MVT-T-TR', p_booking_type => 'MVT-T-TR', p_to_days => 9, p_from_days => 10);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t06q', 'MVT-T-t06q', 'cancel');
  perform pg_temp.mv_rec('T06q 限時段票：目標日若是平日且 10:00 → 通過；若落在週末則 TIME_RESTRICTED（依執行當天而定）',
    (v_r->>'ok' = 'true' and extract(isodow from pg_temp.mv_today() + 9) < 6)
    or (v_r->>'error_code' = 'MOVE.TIME_RESTRICTED' and extract(isodow from pg_temp.mv_today() + 9) >= 6), v_r::text);
  perform pg_temp.mv_pair('t06r', p_ticket_type => 'MVT-T-TR', p_booking_type => 'MVT-T-TR', p_to_days => 16, p_from_days => 17, p_to_time => '17:30', p_from_time => '18:30');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t06r', 'MVT-T-t06r', 'cancel');
  perform pg_temp.mv_rec('T06r 限時段票：17:30 開始、下課超過 18:00 → TIME_RESTRICTED', v_r->>'error_code' = 'MOVE.TIME_RESTRICTED', v_r::text);

  -- ── T07 NULL 安全：票券狀態為 NULL、原預約狀態為 NULL 都不能放行 ──
  perform pg_temp.mv_pair('t07a');
  update member_tickets set status = null where id = 'MVT-TK-t07a';
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t07a', 'MVT-T-t07a', 'cancel');
  perform pg_temp.mv_rec('T07a 票券狀態 NULL → 拒絕（TICKET_STATE）', v_r->>'error_code' = 'MOVE.TICKET_STATE', v_r::text);
  perform pg_temp.mv_pair('t07b');
  update bookings set status = null where id = 'MVT-F-t07b';
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t07b', 'MVT-T-t07b', 'cancel');
  perform pg_temp.mv_rec('T07b 原預約狀態 NULL → 拒絕（FROM_STATE）', v_r->>'error_code' = 'MOVE.FROM_STATE', v_r::text);

  -- ── T08 時間規則 ──
  perform pg_temp.mv_pair('t08a', p_to_days => -1, p_from_days => 5);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t08a', 'MVT-T-t08a', 'cancel');
  perform pg_temp.mv_rec('T08a 目標時段早於台北現在 → TARGET_PAST', v_r->>'error_code' = 'MOVE.TARGET_PAST', v_r::text);
  perform pg_temp.mv_pair('t08b', p_to_days => 12, p_from_days => 11);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t08b', 'MVT-T-t08b', 'cancel');
  perform pg_temp.mv_rec('T08b 原預約不晚於新預約 → ORDER', v_r->>'error_code' = 'MOVE.ORDER', v_r::text);

  -- ── T09 影子卡 ──
  perform pg_temp.mv_pair('t09a');
  insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, sibling_of, venue_unit)
    values ('MVT-S-t09a', 'MVT-M-t09a', '私人教練', 'MVT-T-PT', pg_temp.mv_today() + 10, '11:00', 60, 'booked', 'MVT-F-t09a', 'treadmill_2');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t09a', 'MVT-T-t09a', 'cancel');
  perform pg_temp.mv_rec('T09a 原預約有未取消的子卡 → SHADOW_CARD', v_r->>'error_code' = 'MOVE.SHADOW_CARD', v_r::text);
  perform pg_temp.mv_pair('t09b');
  insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, sibling_of, venue_unit)
    values ('MVT-S-t09b', 'MVT-M-t09b', '私人教練', 'MVT-T-PT', pg_temp.mv_today() + 10, '11:00', 60, 'cancelled', 'MVT-F-t09b', 'treadmill_2');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t09b', 'MVT-T-t09b', 'cancel');
  perform pg_temp.mv_rec('T09b 子卡已取消 → 不擋', v_r->>'ok' = 'true', v_r::text);
  perform pg_temp.mv_pair('t09c');
  update bookings set sibling_of = 'MVT-F-t09c' where id = 'MVT-T-t09c';
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t09c', 'MVT-T-t09c', 'cancel');
  perform pg_temp.mv_rec('T09c 新預約本身是影子卡 → SHADOW_CARD', v_r->>'error_code' = 'MOVE.SHADOW_CARD', v_r::text);

  -- ── T10 身分與權限（SQL 層：模擬 JWT；真正的角色驗證見 02 文件）──
  perform pg_temp.mv_pair('t10a');
  v_r := pg_temp.mv_call(null, 'MVT-F-t10a', 'MVT-T-t10a', 'cancel');
  perform pg_temp.mv_rec('T10a 未登入 → AUTH.FORBIDDEN', v_r->>'error_code' = 'AUTH.FORBIDDEN', v_r::text);
  if v_member_auth is not null then
    perform pg_temp.mv_pair('t10b');
    v_r := pg_temp.mv_call(v_member_auth, 'MVT-F-t10b', 'MVT-T-t10b', 'cancel');
    perform pg_temp.mv_rec('T10b 會員身分 → AUTH.FORBIDDEN', v_r->>'error_code' = 'AUTH.FORBIDDEN', v_r::text);
  else perform pg_temp.mv_skip('T10b 會員身分', '測試庫沒有帶 auth_id 的會員'); end if;
  if v_desk is not null then
    perform pg_temp.mv_pair('t10c');
    v_r := pg_temp.mv_call(v_desk, 'MVT-F-t10c', 'MVT-T-t10c', 'cancel');
    perform pg_temp.mv_rec('T10c 櫃檯可調任何教練的課', v_r->>'ok' = 'true', v_r::text);
  else perform pg_temp.mv_skip('T10c 櫃檯', '測試庫沒有 front_desk 帳號'); end if;
  if v_mgr is not null then
    perform pg_temp.mv_pair('t10d');
    v_r := pg_temp.mv_call(v_mgr, 'MVT-F-t10d', 'MVT-T-t10d', 'cancel');
    perform pg_temp.mv_rec('T10d 啟用中的店長可調（需 S2 已同步 is_staff_desk）', v_r->>'ok' = 'true', v_r::text);
  else perform pg_temp.mv_skip('T10d 店長', '測試庫沒有啟用中的店長教練'); end if;
  if v_coach is not null then
    perform pg_temp.mv_pair('t10e', p_coach => v_coach_id);
    v_r := pg_temp.mv_call(v_coach, 'MVT-F-t10e', 'MVT-T-t10e', 'cancel');
    perform pg_temp.mv_rec('T10e 教練調自己的課（兩筆都是自己的）→ 通過', v_r->>'ok' = 'true', v_r::text);
    if v_coach2_id is not null then
      perform pg_temp.mv_pair('t10f', p_coach => v_coach2_id);
      v_r := pg_temp.mv_call(v_coach, 'MVT-F-t10f', 'MVT-T-t10f', 'cancel');
      perform pg_temp.mv_rec('T10f 教練調別人的課 → MOVE.FORBIDDEN', v_r->>'error_code' = 'MOVE.FORBIDDEN', v_r::text);
      perform pg_temp.mv_pair('t10g', p_coach => v_coach_id);
      update bookings set coach_id = v_coach2_id where id = 'MVT-F-t10g';
      v_r := pg_temp.mv_call(v_coach, 'MVT-F-t10g', 'MVT-T-t10g', 'cancel');
      perform pg_temp.mv_rec('T10g 兩筆其中一筆不是自己的 → MOVE.FORBIDDEN', v_r->>'error_code' = 'MOVE.FORBIDDEN', v_r::text);
    else perform pg_temp.mv_skip('T10f/g 教練調別人的課', '測試庫只有一位教練'); end if;
  else perform pg_temp.mv_skip('T10e/f/g 教練身分', '測試庫沒有一般教練帳號'); end if;

  -- ── T11 重複請求：第二次必定失敗、不再寫帳 ──
  perform pg_temp.mv_pair('t11');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t11', 'MVT-T-t11', 'hold');
  select count(*) into v_n from ticket_logs where ticket_id = 'MVT-TK-t11';
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t11', 'MVT-T-t11', 'hold');
  perform pg_temp.mv_rec('T11 重複呼叫被拒（FROM_STATE 或 TO_STATE）且帳本筆數不變',
    v_r->>'error_code' in ('MOVE.FROM_STATE', 'MOVE.TO_STATE') and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t11') = v_n, v_r::text);

  -- ── T12 未知錯誤 → MOVE.INTERNAL_ERROR，整段回滾，不外洩內部訊息 ──
  perform pg_temp.mv_pair('t12');
  create function pg_temp.mv_boom() returns trigger language plpgsql as $b$ begin raise exception 'boom_secret_text'; end $b$;
  create trigger mv_boom_trg before insert on ticket_logs for each row when (new.note like '調課帳本搬移%') execute function pg_temp.mv_boom();
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t12', 'MVT-T-t12', 'cancel');
  drop trigger mv_boom_trg on ticket_logs;
  perform pg_temp.mv_rec('T12 內部錯誤回 MOVE.INTERNAL_ERROR 且不含內部訊息', v_r->>'error_code' = 'MOVE.INTERNAL_ERROR' and v_r::text not like '%boom%', v_r::text);
  perform pg_temp.mv_rec('T12 整段回滾（新預約仍待簽約、原預約仍綁票、無新帳）',
    (select pending_contract and ticket_id is null from bookings where id = 'MVT-T-t12')
    and (select ticket_id = 'MVT-TK-t12' from bookings where id = 'MVT-F-t12')
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t12') = 1, '');

  -- ── T13 HOLD.MONTH_LIMIT：hold 被守門擋下、整段回滾並透傳；cancel 模式同樣的資料可通過 ──
  v_limit_end := public.fn_hold_month_limit_end(pg_temp.mv_today());
  perform pg_temp.mv_pair('t13a', p_rem => 0, p_to_days => (v_limit_end - pg_temp.mv_today()) + 19, p_from_days => (v_limit_end - pg_temp.mv_today()) + 20);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t13a', 'MVT-T-t13a', 'hold');
  perform pg_temp.mv_rec('T13a hold 超過可保留日期 → 透傳 HOLD.MONTH_LIMIT:日期', v_r->>'error_code' like 'HOLD.MONTH_LIMIT:%', v_r::text);
  perform pg_temp.mv_rec('T13a 回滾（新預約仍待簽約、原預約仍綁票）',
    (select pending_contract and ticket_id is null from bookings where id = 'MVT-T-t13a')
    and (select ticket_id = 'MVT-TK-t13a' from bookings where id = 'MVT-F-t13a'), '');
  perform pg_temp.mv_pair('t13b', p_rem => 0, p_to_days => (v_limit_end - pg_temp.mv_today()) + 19, p_from_days => (v_limit_end - pg_temp.mv_today()) + 20);
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t13b', 'MVT-T-t13b', 'cancel');
  perform pg_temp.mv_rec('T13b 同樣資料改選 cancel → 通過（前端提示可改選原課取消）', v_r->>'ok' = 'true', v_r::text);

  -- ── T14 調課後取消新預約（用 zz_prod_fn_cancel_booking＝正式庫版本複本）→ 真的退 1 堂；重複取消不重複退 ──
  perform pg_temp.mv_pair('t14');
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t14', 'MVT-T-t14', 'hold');
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-T-t14', null, null);   -- 一律用 3 個位置參數，避開重載歧義
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T14 取消新預約成功且退堂（餘額 2→3）', v_r->>'ok' = 'true' and pg_temp.mv_rem('MVT-TK-t14') = 3, v_r::text || ' rem=' || pg_temp.mv_rem('MVT-TK-t14'));
  perform pg_temp.mv_rec('T14 取消後新預約淨額 0', pg_temp.mv_net('MVT-TK-t14', 'MVT-T-t14') = 0, '');
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-T-t14', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T14 重複取消不重複退（餘額仍 3、回 already）', pg_temp.mv_rem('MVT-TK-t14') = 3 and (v_r->>'already') = 'true', v_r::text);

  -- ── T15 授權矩陣（catalog 層級；不是角色驗證）──
  perform pg_temp.mv_rec('T15 anon 不可執行', not has_function_privilege('anon', 'public.fn_move_booking_ticket(text,text,text)', 'EXECUTE'), '');
  perform pg_temp.mv_rec('T15 service_role 不可執行（不預設授權）', not has_function_privilege('service_role', 'public.fn_move_booking_ticket(text,text,text)', 'EXECUTE'), '');
  perform pg_temp.mv_rec('T15 authenticated 可執行', has_function_privilege('authenticated', 'public.fn_move_booking_ticket(text,text,text)', 'EXECUTE'), '');
  perform pg_temp.mv_rec('T15 PUBLIC 沒有 EXECUTE', not exists (
      select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = 'public.fn_move_booking_ticket(text,text,text)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '');

  -- ── T16 合約保留卡拒絕 ──
  perform pg_temp.mv_pair('t16');
  update bookings set contract_id = 'MVT-CONTRACT' where id = 'MVT-T-t16';
  v_r := pg_temp.mv_call(v_any, 'MVT-F-t16', 'MVT-T-t16', 'cancel');
  perform pg_temp.mv_rec('T16 帶 contract_id → CONTRACT_HOLD', v_r->>'error_code' = 'MOVE.CONTRACT_HOLD', v_r::text);

  -- ── T17 其他欄位保護：每個成功案例都不得改 member_tickets 的餘額與狀態（以 T01/T02/T04f 的票券快照驗證）──
  perform pg_temp.mv_rec('T17 成功案例後票券狀態仍為 usable', (select count(*) from member_tickets where id in ('MVT-TK-t01','MVT-TK-t02','MVT-TK-t04f') and status::text = 'usable') = 3, '');

  -- ── T18 測試專用退款 zz_prod_benefit_refund：不得重複、超額、錯誤數量；找不到票不報錯 ──
  perform pg_temp.mv_pair('t18a');   -- 票剩 2、總 4；原預約有一筆 deduct（淨額 1）
  v_r := public.zz_prod_benefit_refund('MVT-TK-t18a', 1, 'MVT-F-t18a');
  perform pg_temp.mv_rec('T18a 第一次退：成功、餘額 2→3、淨額 0', (v_r->>'skipped') is null and pg_temp.mv_rem('MVT-TK-t18a') = 3 and pg_temp.mv_net('MVT-TK-t18a','MVT-F-t18a') = 0, v_r::text);
  v_r := public.zz_prod_benefit_refund('MVT-TK-t18a', 1, 'MVT-F-t18a');
  perform pg_temp.mv_rec('T18a 重複退：跳過（no_deduct），餘額仍 3、不新增 refund 帳',
    v_r->>'skipped' = 'no_deduct' and pg_temp.mv_rem('MVT-TK-t18a') = 3
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t18a' and action::text = 'refund') = 1, v_r::text);
  perform pg_temp.mv_pair('t18b', p_total => 4, p_rem => 4);       -- 帳不一致：餘額已滿卻還有淨扣課 1
  v_r := public.zz_prod_benefit_refund('MVT-TK-t18b', 1, 'MVT-F-t18b');
  perform pg_temp.mv_rec('T18b 退了會超過總堂數：阻擋（over_total），餘額仍 4、留一筆 adjust 0 警示、沒有 refund 帳',
    v_r->>'skipped' = 'over_total' and pg_temp.mv_rem('MVT-TK-t18b') = 4
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t18b' and action::text = 'adjust' and delta = 0 and note like '%超過總堂數%') = 1
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t18b' and action::text = 'refund') = 0, v_r::text);
  perform pg_temp.mv_pair('t18c');
  perform pg_temp.mv_rec('T18c qty＝0／2／null／-1 一律跳過（bad_qty）、餘額不變、無 refund 帳',
    (public.zz_prod_benefit_refund('MVT-TK-t18c', 0, 'MVT-F-t18c')->>'skipped') = 'bad_qty'
    and (public.zz_prod_benefit_refund('MVT-TK-t18c', 2, 'MVT-F-t18c')->>'skipped') = 'bad_qty'
    and (public.zz_prod_benefit_refund('MVT-TK-t18c', null, 'MVT-F-t18c')->>'skipped') = 'bad_qty'
    and (public.zz_prod_benefit_refund('MVT-TK-t18c', -1, 'MVT-F-t18c')->>'skipped') = 'bad_qty'
    and pg_temp.mv_rem('MVT-TK-t18c') = 2
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t18c' and action::text = 'refund') = 0, '');
  perform pg_temp.mv_rec('T18d 沒有扣課紀錄的預約：跳過（no_deduct）', (public.zz_prod_benefit_refund('MVT-TK-t18c', 1, 'MVT-NO-SUCH-BOOKING')->>'skipped') = 'no_deduct' and pg_temp.mv_rem('MVT-TK-t18c') = 2, '');
  perform pg_temp.mv_rec('T18e 找不到票券：回 no_ticket、不報錯、不寫帳', (public.zz_prod_benefit_refund('MVT-NO-SUCH-TICKET', 1, 'X')->>'skipped') = 'no_ticket', '');
  perform pg_temp.mv_rec('T18f 函式內含鎖票（for update）— 併發重複退款的防線（真正併發需手動兩連線驗證）',
    pg_get_functiondef('public.zz_prod_benefit_refund(text,integer,text)'::regprocedure) ilike '%from member_tickets where id = p_benefit_ref for update%', '');
  perform pg_temp.mv_pair('t18g');
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t18g', null, null);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t18g', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T18g 取消兩次（zz 取消流程）：只退一次（餘額 2→3、refund 帳 1 筆）', pg_temp.mv_rem('MVT-TK-t18g') = 3 and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t18g' and action::text = 'refund') = 1, '');

  -- ── T19 zz_prod_fn_cancel_booking 的退款結果一致性：需退款卻退不成 → 不取消、不回報 refunded ──
  perform pg_temp.mv_pair('t19a', p_total => 4, p_rem => 4);       -- 帳不一致：餘額已滿、卻有淨扣課 1 → 退款會被 over_total 擋下
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19a', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19a 退款被異常跳過 → ok:false、REFUND.FAILED:over_total（不回報 refunded）', (v_r->>'ok') = 'false' and (v_r->>'error_code') = 'REFUND.FAILED:over_total' and (v_r->>'cancellation_result') is null, v_r::text);
  perform pg_temp.mv_rec('T19a 預約仍 booked、餘額 4、淨額 1、沒有 refund 帳、連警示帳也一起回滾（預約／票券／帳本一致）',
    (select status::text = 'booked' and cancelled_at is null from bookings where id = 'MVT-F-t19a')
    and pg_temp.mv_rem('MVT-TK-t19a') = 4 and pg_temp.mv_net('MVT-TK-t19a', 'MVT-F-t19a') = 1
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19a' and action::text in ('refund', 'adjust')) = 0, '');
  perform pg_temp.mv_pair('t19b');
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19b', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19b 正常退款 → refunded、refunded_ticket 為該票、預約已取消、餘額 2→3、淨額 0',
    (v_r->>'ok') = 'true' and (v_r->>'cancellation_result') = 'refunded' and (v_r->>'refunded_ticket') = 'MVT-TK-t19b'
    and (select status::text = 'cancelled' from bookings where id = 'MVT-F-t19b') and pg_temp.mv_rem('MVT-TK-t19b') = 3 and pg_temp.mv_net('MVT-TK-t19b', 'MVT-F-t19b') = 0, v_r::text);
  perform pg_temp.mv_pair('t19c');                                  -- 先「真正退款」：餘額 2→3、淨額 0，再取消
  v_r := public.zz_prod_benefit_refund('MVT-TK-t19c', 1, 'MVT-F-t19c');
  perform pg_temp.mv_rec('T19c 前置：先真正退款成功（餘額 2→3、淨額 0、refund 帳 1 筆、delta 合計 0）',
    (v_r->>'skipped') is null and pg_temp.mv_rem('MVT-TK-t19c') = 3 and pg_temp.mv_net('MVT-TK-t19c', 'MVT-F-t19c') = 0
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19c' and action::text = 'refund') = 1 and pg_temp.mv_sum('MVT-TK-t19c') = 0, v_r::text);
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19c', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19c 已有扣課且已退回（淨額 0）→ 照常取消、回 no_refund_needed（不是 refunded）、餘額仍 3、不新增 refund 帳、delta 合計仍 0',
    (v_r->>'ok') = 'true' and (v_r->>'cancellation_result') = 'no_refund_needed' and (v_r->>'refunded_ticket') is null
    and (select status::text = 'cancelled' from bookings where id = 'MVT-F-t19c') and pg_temp.mv_rem('MVT-TK-t19c') = 3
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19c' and action::text = 'refund') = 1 and pg_temp.mv_sum('MVT-TK-t19c') = 0, v_r::text);
  perform pg_temp.mv_pair('t19d');                                  -- 允許的不退款取消（櫃檯選擇不退）
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19d', null, false);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19d 櫃檯指定不退款 → 仍可取消、回 forfeited、餘額不變、無 refund 帳（原規則保留）',
    (v_r->>'ok') = 'true' and (v_r->>'cancellation_result') = 'forfeited' and (v_r->>'refunded_ticket') is null
    and (select status::text = 'cancelled' and refund_waived is true from bookings where id = 'MVT-F-t19d') and pg_temp.mv_rem('MVT-TK-t19d') = 2
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19d' and action::text = 'refund') = 0, v_r::text);
  perform pg_temp.mv_pair('t19e');                                  -- 沒綁票的預約
  update bookings set ticket_id = null where id = 'MVT-F-t19e';
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19e', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19e 沒綁票 → 可取消，回 no_refund_needed（不是 refunded）', (v_r->>'ok') = 'true' and (v_r->>'cancellation_result') = 'no_refund_needed' and (v_r->>'refunded_ticket') is null, v_r::text);
  -- ── T19g/h/i：no_deduct 的「異常」情況 → 拒絕取消、整筆回滾（預約、餘額、帳本都不變）──
  perform pg_temp.mv_pair('t19g');                                  -- 綁票卻完全沒有任何帳本紀錄
  delete from ticket_logs where ticket_id = 'MVT-TK-t19g';
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19g', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19g 綁票但完全沒有扣課紀錄 → ok:false、REFUND.FAILED:ledger_anomaly:deduct=0,refund=0（拒絕取消）',
    (v_r->>'ok') = 'false' and (v_r->>'error_code') = 'REFUND.FAILED:ledger_anomaly:deduct=0,refund=0' and (v_r->>'cancellation_result') is null, v_r::text);
  perform pg_temp.mv_rec('T19g 預約仍 booked、仍綁原票、餘額 2、帳本仍為 0 筆（三者都不變）',
    (select status::text = 'booked' and ticket_id = 'MVT-TK-t19g' and cancelled_at is null from bookings where id = 'MVT-F-t19g')
    and pg_temp.mv_rem('MVT-TK-t19g') = 2 and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19g') = 0, '');
  perform pg_temp.mv_pair('t19h');                                  -- 只有 adjust 痕跡、沒有 deduct
  delete from ticket_logs where ticket_id = 'MVT-TK-t19h';
  perform pg_temp.mv_log('MVT-TK-t19h', 'MVT-F-t19h', 'adjust', 0);
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19h', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19h 只有 adjust 痕跡、沒有 deduct → 同樣拒絕（ledger_anomaly:deduct=0,refund=0），預約／餘額／帳本不變',
    (v_r->>'ok') = 'false' and (v_r->>'error_code') = 'REFUND.FAILED:ledger_anomaly:deduct=0,refund=0'
    and (select status::text = 'booked' and ticket_id = 'MVT-TK-t19h' from bookings where id = 'MVT-F-t19h')
    and pg_temp.mv_rem('MVT-TK-t19h') = 2 and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19h') = 1, v_r::text);
  perform pg_temp.mv_pair('t19i');                                  -- 退多於扣（淨額 -1）
  perform pg_temp.mv_log('MVT-TK-t19i', 'MVT-F-t19i', 'refund', 1);
  perform pg_temp.mv_log('MVT-TK-t19i', 'MVT-F-t19i', 'refund', 1);
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19i', null, null);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19i 退多於扣（deduct=1、refund=2，淨額 -1）→ 拒絕（ledger_anomaly:deduct=1,refund=2），預約／餘額／帳本不變',
    (v_r->>'ok') = 'false' and (v_r->>'error_code') = 'REFUND.FAILED:ledger_anomaly:deduct=1,refund=2'
    and (select status::text = 'booked' and ticket_id = 'MVT-TK-t19i' from bookings where id = 'MVT-F-t19i')
    and pg_temp.mv_rem('MVT-TK-t19i') = 2 and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19i') = 3, v_r::text);
  perform pg_temp.mv_pair('t19j');                                  -- 同樣的異常帳，但櫃檯「選擇不退款」→ 原規則保留，仍可取消（forfeited），不碰帳
  delete from ticket_logs where ticket_id = 'MVT-TK-t19j';
  perform pg_temp.mv_as(v_any);
  v_r := public.zz_prod_fn_cancel_booking('MVT-F-t19j', null, false);
  perform pg_temp.mv_as(null);
  perform pg_temp.mv_rec('T19j 異常帳但櫃檯明確選「不退款」→ 仍可取消（forfeited）、不動帳與餘額（不退款取消規則保留）',
    (v_r->>'ok') = 'true' and (v_r->>'cancellation_result') = 'forfeited'
    and (select status::text = 'cancelled' from bookings where id = 'MVT-F-t19j') and pg_temp.mv_rem('MVT-TK-t19j') = 2
    and (select count(*) from ticket_logs where ticket_id = 'MVT-TK-t19j') = 0, v_r::text);
  perform pg_temp.mv_rec('T19f 取消流程不再「吞掉」退款結果：函式內有 REFUND.FAILED 與 no_refund_needed',
    pg_get_functiondef('public.zz_prod_fn_cancel_booking(text,text,boolean)'::regprocedure) like '%REFUND.FAILED%'
    and pg_get_functiondef('public.zz_prod_fn_cancel_booking(text,text,boolean)'::regprocedure) like '%no_refund_needed%', '');

  raise exception 'MOVE_TESTS_RESULT: %', pg_temp.mv_summary();
end
$mvt$;
