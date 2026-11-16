-- ═══════════════════════════════════════════════════════════════════════
-- 教練請假補償 SQL 交易測試（尚未執行）。⚠ 只能對測試庫 kucvxpjatptfckhlxptj；需先套用 p0e_10_apply_leave_comp_testdb.sql。
-- 單一 DO、全部夾具建在裡面，結尾（含提早離開）必定 raise exception → 全部回滾；結果在錯誤訊息 LEAVECOMP_TESTS_RESULT: 之後。
-- 以資料庫擁有者連線，並用 request.jwt.claims 模擬登入身分（auth.uid()）；員工夾具若因 auth 外鍵等原因建不起來，
--   授權相關案例記成 SKIP（不算通過）。併發（兩條連線同時請假）無法在單一交易內做，見 p0e_10_leave_comp_concurrency_manual.md。
-- ═══════════════════════════════════════════════════════════════════════
do $pe$
declare
  v_has_cl boolean; v_has_partner boolean;
  v_r record; v_n integer; v_d date := (now() at time zone 'Asia/Taipei')::date; v_msg text;
  v_mon date := date_trunc('week', (now() at time zone 'Asia/Taipei')::timestamp)::date; v_e date; v_res jsonb; v_emp_ok boolean := false;
  v_uid_desk uuid; v_uid_c1 uuid; v_c1id text; v_c2id text; v_x integer;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫，停止執行';
  end if;
  if to_regprocedure('public.fn_tk_activate(text,date,text)') is null then
    raise exception 'P0E.PRECONDITION: 尚未套用 P0-E migration';
  end if;
  if to_regprocedure('public.fn_coach_leave_comp(text,text[])') is null or to_regprocedure('public.fn_tk_leave_comp_days(text)') is null then
    raise exception 'LEAVECOMP.PRECONDITION: 尚未套用教練請假補償 migration（p0e_10_apply_leave_comp_testdb.sql）';
  end if;

  create temp table pe_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.pe_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as
    $f$ insert into pe_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 300)) $f$;
  create function pg_temp.pe_skip(p_name text, p_why text) returns void language sql as
    $f$ insert into pe_res(name, ok, detail) values ('SKIP ' || p_name, null, p_why) $f$;
  -- 精簡輸出（工具只保留錯誤訊息頭尾各約 5,000 字元；只列 FAIL 與 SKIP、FAIL 優先、≤ 8000 字元、被截斷不會判為通過；與 P0-C 的 mv_summary 相同邏輯）
  create function pg_temp.pe_summary() returns text language plpgsql as $f$
  declare
    v_pass integer; v_fail integer; v_skip integer; v_total integer;
    v_items jsonb := '[]'::jsonb; v_item jsonb; v_len integer; v_budget constant integer := 8000;
    v_full boolean := false; v_om_fail integer := 0; v_om_skip integer := 0;
    v_verdict text; v_out text; v_last jsonb;
    r record;
  begin
    select count(*) filter (where ok is true), count(*) filter (where ok is false), count(*) filter (where ok is null), count(*)
      into v_pass, v_fail, v_skip, v_total from pe_res;
    v_verdict := case when v_total = 0 then 'NO_TESTS' when v_fail > 0 then 'FAIL' when v_skip > 0 then 'INCOMPLETE_SKIPS' else 'PASS' end;
    v_len := 700;                                                       -- 標頭（計數、verdict、omitted、說明）預留
    for r in select n, name, ok, detail from pe_res where ok is not true order by (ok is null), n loop
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

  create function pg_temp.pe_today() returns date language sql as $f$ select (now() at time zone 'Asia/Taipei')::date $f$;
  create function pg_temp.pe_ticket(p_id text, p_vd integer, p_start date default null, p_exp date default null,
                                    p_act timestamptz default null, p_mode text default null, p_member text default null,
                                    p_total integer default 8, p_rem integer default 6) returns void language plpgsql as $f$
  begin
    insert into members(id, name) values (coalesce(p_member, 'PE-M-' || p_id), 'PE測試會員') on conflict (id) do nothing;
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status,
                               valid_days, start_date, expire_date, activated_at, activation_mode)
    values (p_id, coalesce(p_member, 'PE-M-' || p_id), 'PE-T-PT', 'PE方案', p_total, p_rem, 'usable',
            p_vd, p_start, p_exp, p_act, p_mode);
  end $f$;
  -- 單人預約＋一筆 deduct 帳（日期＝今天＋偏移）
  create function pg_temp.pe_bk(p_id text, p_ticket text, p_off integer, p_status text default 'booked',
                                p_cat text default '私人教練') returns void language plpgsql as $f$
  begin
    insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance)
    values (p_id, (select member_id from member_tickets where id = p_ticket), p_cat::ticket_category, 'PE-T-PT',
            pg_temp.pe_today() + p_off, '10:00', 60, p_status::booking_status, false, p_ticket, '[]'::jsonb, '{}'::jsonb);
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values ('PE-LG-' || md5(random()::text || clock_timestamp()::text), p_ticket, 'deduct', -1, p_id, 'petest', 'pe fixture');
  end $f$;
  create function pg_temp.pe_checkin(p_id text) returns void language sql as
    $f$ update bookings set status = 'checked_in', checked_in_at = now() where id = p_id $f$;
  create function pg_temp.pe_undo(p_id text) returns void language sql as
    $f$ update bookings set status = 'booked', checked_in_at = null where id = p_id $f$;
  create function pg_temp.pe_net(p_tk text, p_bk text) returns integer language sql as
    $f$ select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)::int
          from ticket_logs where ticket_id = p_tk and booking_id = p_bk $f$;
  create function pg_temp.pe_tk(p_id text) returns member_tickets language sql as $f$ select * from member_tickets where id = p_id $f$;

  v_has_cl := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'coach_leave');
  v_has_partner := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'partner_id');

  -- 測試庫的列舉 notify_recipient 只有 member／coach（缺 desk），desk_alert 內部會吞錯、實際寫不進 notifications。
  --   這裡在「本測試交易內」暫時以攔截版取代 public.desk_alert（只記錄呼叫的 type／title／body 到暫存表），
  --   用來驗證 P0-E 有在該警示的時候呼叫它、內容對；交易結尾一律 raise exception 回滾，函式定義隨之復原（測後會核對指紋）。
  create temp table pe_alerts(n serial primary key, member text, typ text, title text, body text) on commit drop;
  create or replace function public.desk_alert(p_member_id text, p_type text, p_title text, p_body text) returns void language sql as
    $f$ insert into pe_alerts(member, typ, title, body) values (p_member_id, p_type, p_title, p_body) $f$;

  insert into ticket_types(id, name, category) values ('PE-T-PT', 'PE 教練課', '私人教練'), ('PE-T-GRP', 'PE 團課', '小班肌力');
  -- ═══ 補償測試用 helper ═══
  create function pg_temp.lc_leave(p_bk text, p_on boolean default true) returns void language plpgsql as $f$
  begin
    if p_on then update bookings set status = 'coach_leave', coach_leave = true where id = p_bk;
    else update bookings set status = 'booked', coach_leave = false where id = p_bk; end if;
  end $f$;
  create function pg_temp.lc_call(p_bk text, p_tk text[] default null) returns jsonb language sql as
    $f$ select public.fn_coach_leave_comp(p_bk, p_tk) $f$;
  create function pg_temp.lc_act(p_res jsonb, p_i integer default 0) returns text language sql as
    $f$ select coalesce(p_res->'results'->p_i->>'action', 'ERR:' || coalesce(p_res->>'error_code', '?')) $f$;
  create function pg_temp.lc_why(p_res jsonb, p_i integer default 0) returns text language sql as
    $f$ select p_res->'results'->p_i->>'reason' $f$;
  create function pg_temp.lc_nlog(p_tk text, p_like text) returns integer language sql as
    $f$ select count(*)::int from ticket_logs where ticket_id = p_tk and action::text = 'adjust' and note like p_like $f$;
  create function pg_temp.lc_claims(p_uid uuid) returns void language sql as
    $f$ select set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true) $f$;
  -- 單人預約的票：已啟用（start=今天、60 天）
  create function pg_temp.lc_tk(p_id text, p_exp date default null) returns void language plpgsql as $f$
  begin
    perform pg_temp.pe_ticket(p_id, 60, pg_temp.pe_today(), coalesce(p_exp, pg_temp.pe_today() + 59), now(), 'checkin', null, 8, 6);
  end $f$;

  -- 借用測試庫現有員工的身分（不建立帳號、不改 employees；employees.auth_id 有外鍵指向 Auth，無法在交易內另造）：
  --   櫃檯一位、有登入的教練一位、另一位教練（當「非該堂教練」）。找不到就整段授權案例 SKIP。
  select auth_id into v_uid_desk from employees where role::text = 'front_desk' and status::text = 'active' and auth_id is not null limit 1;
  select auth_id, id into v_uid_c1, v_c1id from employees where role::text = 'coach' and status::text = 'active' and auth_id is not null limit 1;
  select id into v_c2id from employees where role::text = 'coach' and id is distinct from v_c1id limit 1;
  v_emp_ok := v_uid_desk is not null and v_uid_c1 is not null and v_c2id is not null;
  if not v_emp_ok then perform pg_temp.pe_skip('授權案例（現有員工身分）', '測試庫缺少有登入的櫃檯／教練或第二位教練'); end if;

  if not v_has_cl then
    perform pg_temp.pe_skip('補償全部案例', 'bookings 沒有 coach_leave 欄位（需先同步 P0-C）');
  elsif v_emp_ok then
    perform pg_temp.lc_claims(v_uid_desk);

    -- ═══ L1 展延：同週只一次 ═══
    perform pg_temp.lc_tk('PE-L1X'); v_e := pg_temp.pe_today() + 59;
    perform pg_temp.pe_bk('PE-L1X-a', 'PE-L1X', 0 + (v_mon + 8 - pg_temp.pe_today()));   -- 下週二
    perform pg_temp.pe_bk('PE-L1X-b', 'PE-L1X', 0 + (v_mon + 10 - pg_temp.pe_today()));  -- 下週四（同週）
    perform pg_temp.lc_leave('PE-L1X-a');
    v_res := pg_temp.lc_call('PE-L1X-a');
    perform pg_temp.pe_rec('L1 第一次請假：展延 7 天', pg_temp.lc_act(v_res) = 'grant' and (select expire_date from member_tickets where id = 'PE-L1X') = v_e + 7, v_res::text);
    perform pg_temp.pe_rec('L1 不增加堂數、valid_days 不變', (select sessions_remaining = 6 and valid_days = 60 from member_tickets where id = 'PE-L1X'), '');
    perform pg_temp.pe_rec('L1 帳本一筆展延痕跡（adjust／delta 0／帶預約 id）',
      (select count(*) from ticket_logs where ticket_id = 'PE-L1X' and action::text = 'adjust' and delta = 0 and booking_id = 'PE-L1X-a' and note like '%教練請假展延 7 天%') = 1, '');
    perform pg_temp.lc_leave('PE-L1X-b');
    v_res := pg_temp.lc_call('PE-L1X-b');
    perform pg_temp.pe_rec('L2 同週第二堂請假：不再延長（week_done）', pg_temp.lc_act(v_res) = 'none' and pg_temp.lc_why(v_res) = 'week_done' and (select expire_date from member_tickets where id = 'PE-L1X') = v_e + 7, v_res::text);
    v_res := pg_temp.lc_call('PE-L1X-a');
    perform pg_temp.pe_rec('L3 重複呼叫同一堂：冪等', pg_temp.lc_act(v_res) = 'none' and (select expire_date from member_tickets where id = 'PE-L1X') = v_e + 7
      and pg_temp.lc_nlog('PE-L1X', '%教練請假展延 7 天%') = 1, v_res::text);
    perform pg_temp.pe_rec('L3 補償天數函式＝7', public.fn_tk_leave_comp_days('PE-L1X') = 7, public.fn_tk_leave_comp_days('PE-L1X')::text);

    -- ═══ 不同週累加 ═══
    perform pg_temp.pe_bk('PE-L1X-c', 'PE-L1X', 0 + (v_mon + 15 - pg_temp.pe_today()));  -- 第 2 週
    perform pg_temp.pe_bk('PE-L1X-d', 'PE-L1X', 0 + (v_mon + 22 - pg_temp.pe_today()));  -- 第 3 週
    perform pg_temp.lc_leave('PE-L1X-c'); v_res := pg_temp.lc_call('PE-L1X-c');
    perform pg_temp.pe_rec('W1 第二週有效請假：累加到 +14', pg_temp.lc_act(v_res) = 'grant' and (select expire_date from member_tickets where id = 'PE-L1X') = v_e + 14, v_res::text);
    perform pg_temp.lc_leave('PE-L1X-d'); v_res := pg_temp.lc_call('PE-L1X-d');
    perform pg_temp.pe_rec('W2 第三週有效請假：累加到 +21', pg_temp.lc_act(v_res) = 'grant' and (select expire_date from member_tickets where id = 'PE-L1X') = v_e + 21 and public.fn_tk_leave_comp_days('PE-L1X') = 21, v_res::text);

    -- ═══ 週日／週一邊界 ═══
    perform pg_temp.lc_tk('PE-B1');
    perform pg_temp.pe_bk('PE-B1-sun', 'PE-B1', 0 + (v_mon + 13 - pg_temp.pe_today()));  -- 第 1 週週日
    perform pg_temp.pe_bk('PE-B1-mon', 'PE-B1', 0 + (v_mon + 14 - pg_temp.pe_today()));  -- 第 2 週週一
    perform pg_temp.lc_leave('PE-B1-sun'); perform pg_temp.lc_leave('PE-B1-mon');
    v_res := pg_temp.lc_call('PE-B1-sun'); perform pg_temp.pe_rec('B1 週日請假屬上一週：展延', pg_temp.lc_act(v_res) = 'grant', v_res::text);
    v_res := pg_temp.lc_call('PE-B1-mon'); perform pg_temp.pe_rec('B2 隔天週一請假屬下一週：另外展延', pg_temp.lc_act(v_res) = 'grant'
      and (select expire_date from member_tickets where id = 'PE-B1') = pg_temp.pe_today() + 59 + 14, v_res::text);

    -- ═══ 撤銷規則 ═══
    perform pg_temp.lc_tk('PE-U1'); v_e := pg_temp.pe_today() + 59;
    perform pg_temp.pe_bk('PE-U1-a', 'PE-U1', 0 + (v_mon + 8 - pg_temp.pe_today()));
    perform pg_temp.pe_bk('PE-U1-b', 'PE-U1', 0 + (v_mon + 9 - pg_temp.pe_today()));
    perform pg_temp.lc_leave('PE-U1-a'); perform pg_temp.lc_leave('PE-U1-b');
    v_res := pg_temp.lc_call('PE-U1-a');                                                  -- 展延
    perform pg_temp.lc_leave('PE-U1-a', false); v_res := pg_temp.lc_call('PE-U1-a');      -- 撤銷 a，b 仍有效
    perform pg_temp.pe_rec('U1 撤銷其中一堂、同週還有別堂有效請假：不撤回',
      pg_temp.lc_act(v_res) = 'none' and pg_temp.lc_why(v_res) = 'week_done' and (select expire_date from member_tickets where id = 'PE-U1') = v_e + 7, v_res::text);
    perform pg_temp.lc_leave('PE-U1-b', false); v_res := pg_temp.lc_call('PE-U1-b');      -- 全部撤銷
    perform pg_temp.pe_rec('U2 同週全部有效請假撤銷：撤回 7 天', pg_temp.lc_act(v_res) = 'revoke' and (select expire_date from member_tickets where id = 'PE-U1') = v_e
      and public.fn_tk_leave_comp_days('PE-U1') = 0, v_res::text);
    v_res := pg_temp.lc_call('PE-U1-b');
    perform pg_temp.pe_rec('U2 撤回後重複呼叫：不再撤回', pg_temp.lc_act(v_res) = 'none' and (select expire_date from member_tickets where id = 'PE-U1') = v_e, v_res::text);
    perform pg_temp.lc_leave('PE-U1-a'); v_res := pg_temp.lc_call('PE-U1-a');             -- 同週撤銷後再請假
    perform pg_temp.pe_rec('U3 撤回後同週再請假：重新展延 7 天（不是 14）', pg_temp.lc_act(v_res) = 'grant' and (select expire_date from member_tickets where id = 'PE-U1') = v_e + 7
      and public.fn_tk_leave_comp_days('PE-U1') = 7, v_res::text);
    perform pg_temp.pe_rec('U3 帳本：展延 2 筆、收回 1 筆（可追溯）',
      pg_temp.lc_nlog('PE-U1', '%教練請假展延 7 天%') = 2 and pg_temp.lc_nlog('PE-U1', '%教練請假展延已收回%') = 1, '');
    -- 未撤銷時（沒有任何請假預約）呼叫：不動
    perform pg_temp.lc_tk('PE-U2');
    perform pg_temp.pe_bk('PE-U2-a', 'PE-U2', 0 + (v_mon + 8 - pg_temp.pe_today()));
    v_res := pg_temp.lc_call('PE-U2-a');
    perform pg_temp.pe_rec('U4 預約根本不是請假：不展延（no_leave）', pg_temp.lc_act(v_res) = 'none' and pg_temp.lc_why(v_res) = 'no_leave' and (select expire_date from member_tickets where id = 'PE-U2') = pg_temp.pe_today() + 59, v_res::text);

    -- ═══ 沒有到期日的票 ═══
    perform pg_temp.pe_ticket('PE-N1', 28);
    perform pg_temp.pe_bk('PE-N1-a', 'PE-N1', 0 + (v_mon + 8 - pg_temp.pe_today()));
    perform pg_temp.lc_leave('PE-N1-a'); v_res := pg_temp.lc_call('PE-N1-a');
    perform pg_temp.pe_rec('N1 未啟用／無到期日的票：不補償、不寫紀錄', pg_temp.lc_why(v_res) = 'noexp' and pg_temp.lc_nlog('PE-N1', '%教練請假%') = 0
      and (select expire_date is null from member_tickets where id = 'PE-N1'), v_res::text);

    -- ═══ 其他票／會員不受影響 ═══
    perform pg_temp.lc_tk('PE-O1');
    select md5(string_agg(id || coalesce(expire_date::text, '') || sessions_remaining::text, ',' order by id)) into v_msg from member_tickets where id in ('PE-O1', 'PE-N1', 'PE-U2');
    perform pg_temp.lc_tk('PE-O2');
    perform pg_temp.pe_bk('PE-O2-a', 'PE-O2', 0 + (v_mon + 8 - pg_temp.pe_today()));
    perform pg_temp.lc_leave('PE-O2-a'); perform pg_temp.lc_call('PE-O2-a');
    perform pg_temp.pe_rec('O1 其他票券與其他會員的效期與堂數不變',
      (select md5(string_agg(id || coalesce(expire_date::text, '') || sessions_remaining::text, ',' order by id)) from member_tickets where id in ('PE-O1', 'PE-N1', 'PE-U2')) = v_msg, '');

    -- ═══ 效期重算不得清掉補償（fn_tk_recalc／fn_tk_activate）═══
    perform pg_temp.pe_ticket('PE-R1', 28);
    perform pg_temp.pe_bk('PE-R1-b1', 'PE-R1', 3);
    perform pg_temp.pe_bk('PE-R1-b2', 'PE-R1', 1);
    perform pg_temp.pe_bk('PE-R1-lv', 'PE-R1', 8);
    perform pg_temp.pe_checkin('PE-R1-b1');                                               -- 啟用：start=+3
    perform pg_temp.pe_checkin('PE-R1-b2');                                               -- 冪等，start 仍 +3
    perform pg_temp.lc_leave('PE-R1-lv'); v_res := pg_temp.lc_call('PE-R1-lv');
    perform pg_temp.pe_rec('R1 啟用後請假：展延 7 天', pg_temp.lc_act(v_res) = 'grant' and (select expire_date from member_tickets where id = 'PE-R1') = pg_temp.pe_today() + 3 + 27 + 7, v_res::text);
    perform pg_temp.pe_undo('PE-R1-b1');                                                  -- 撤銷 → fn_tk_recalc（改依 b2 的 +1）
    perform pg_temp.pe_rec('R2 撤銷簽到重算：補償 7 天仍在（start+27+7）', (select start_date = pg_temp.pe_today() + 1 and expire_date = pg_temp.pe_today() + 1 + 27 + 7 from member_tickets where id = 'PE-R1'),
      (select start_date::text || '/' || expire_date::text from member_tickets where id = 'PE-R1'));
    perform pg_temp.pe_undo('PE-R1-b2');                                                  -- 回到未啟用
    perform pg_temp.pe_rec('R3 回到未啟用：效期欄位清空、補償紀錄仍在', (select expire_date is null and start_date is null from member_tickets where id = 'PE-R1')
      and public.fn_tk_leave_comp_days('PE-R1') = 7, '');
    perform pg_temp.pe_checkin('PE-R1-b2');                                               -- 再啟用 → fn_tk_activate
    perform pg_temp.pe_rec('R4 重新啟用：補償 7 天仍在（start+27+7）', (select expire_date = pg_temp.pe_today() + 1 + 27 + 7 from member_tickets where id = 'PE-R1'),
      (select expire_date::text from member_tickets where id = 'PE-R1'));
    perform pg_temp.pe_rec('R4 全程堂數不變（6）', (select sessions_remaining = 6 from member_tickets where id = 'PE-R1'), '');
    -- 補償撤回後，重算不會多給
    perform pg_temp.lc_leave('PE-R1-lv', false); perform pg_temp.lc_call('PE-R1-lv');
    perform pg_temp.pe_rec('R5 補償撤回後到期日回到 start+27', (select expire_date = pg_temp.pe_today() + 1 + 27 from member_tickets where id = 'PE-R1'),
      (select expire_date::text from member_tickets where id = 'PE-R1'));

    -- ═══ 團課：明確票券清單 ═══
    perform pg_temp.lc_tk('PE-G1'); perform pg_temp.lc_tk('PE-G2'); perform pg_temp.lc_tk('PE-G3');
    perform pg_temp.pe_bk('PE-G-bk', 'PE-G1', 0 + (v_mon + 8 - pg_temp.pe_today()), 'booked', '小班肌力');
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values ('PE-LG-G2', 'PE-G2', 'deduct', -1, 'PE-G-bk', 'petest', 'pe fixture');
    update bookings set ticket_id = null where id = 'PE-G-bk';
    perform pg_temp.lc_leave('PE-G-bk');
    v_res := pg_temp.lc_call('PE-G-bk', array['PE-G1', 'PE-G2']);
    perform pg_temp.pe_rec('G1 團課依清單各自展延 7 天',
      pg_temp.lc_act(v_res, 0) = 'grant' and pg_temp.lc_act(v_res, 1) = 'grant'
      and (select expire_date from member_tickets where id = 'PE-G1') = pg_temp.pe_today() + 66 and (select expire_date from member_tickets where id = 'PE-G2') = pg_temp.pe_today() + 66, v_res::text);
    perform pg_temp.pe_rec('G1 不在清單的票不動', (select expire_date = pg_temp.pe_today() + 59 from member_tickets where id = 'PE-G3'), '');
    v_res := pg_temp.lc_call('PE-G-bk', array['PE-G1', 'PE-G2']);
    perform pg_temp.pe_rec('G2 團課重複呼叫：冪等', pg_temp.lc_act(v_res, 0) = 'none' and pg_temp.lc_act(v_res, 1) = 'none' and public.fn_tk_leave_comp_days('PE-G1') = 7, v_res::text);

    -- ═══ 帳本解析：校正／壞日期紀錄不算 ═══
    perform pg_temp.lc_tk('PE-P1');
    insert into ticket_logs(id, ticket_id, action, delta, operator, note) values
      ('PE-LG-P1a', 'PE-P1', 'adjust', 0, 'petest', '2026-01-05 教練請假展延 7 天（校正：舊紀錄）'),
      ('PE-LG-P1b', 'PE-P1', 'adjust', 0, 'petest', '2026-13-45 教練請假展延 7 天（日期壞掉）');
    perform pg_temp.pe_rec('P1 含「校正」的舊紀錄與壞日期紀錄不計入補償', public.fn_tk_leave_comp_days('PE-P1') = 0, public.fn_tk_leave_comp_days('PE-P1')::text);

    -- ═══ 授權 ═══
    perform pg_temp.lc_tk('PE-A1X');
    perform pg_temp.pe_bk('PE-A1X-a', 'PE-A1X', 0 + (v_mon + 8 - pg_temp.pe_today()));
    update bookings set coach_id = v_c2id where id = 'PE-A1X-a';
    perform pg_temp.lc_leave('PE-A1X-a');
    perform pg_temp.lc_claims(null);
    v_res := pg_temp.lc_call('PE-A1X-a');
    perform pg_temp.pe_rec('A1 未登入：AUTH.FORBIDDEN', v_res->>'error_code' = 'AUTH.FORBIDDEN' and (select expire_date = pg_temp.pe_today() + 59 from member_tickets where id = 'PE-A1X'), v_res::text);
    perform pg_temp.lc_claims(v_uid_c1);
    v_res := pg_temp.lc_call('PE-A1X-a');
    perform pg_temp.pe_rec('A2 非該堂教練：COMP.FORBIDDEN 且不動', v_res->>'error_code' = 'COMP.FORBIDDEN' and (select expire_date = pg_temp.pe_today() + 59 from member_tickets where id = 'PE-A1X'), v_res::text);
    update bookings set coach_id = v_c1id where id = 'PE-A1X-a';
    v_res := pg_temp.lc_call('PE-A1X-a');
    perform pg_temp.pe_rec('A3 該堂主責教練：可以', pg_temp.lc_act(v_res) = 'grant', v_res::text);
    perform pg_temp.lc_claims(v_uid_desk);
    perform pg_temp.pe_rec('A4 預約不存在：COMP.NOT_FOUND', pg_temp.lc_call('PE-NO-SUCH')->>'error_code' = 'COMP.NOT_FOUND', '');
    perform pg_temp.pe_rec('A4 參數為空：COMP.BAD_ARGS', pg_temp.lc_call(null)->>'error_code' = 'COMP.BAD_ARGS', '');
    perform pg_temp.lc_claims(null);
  end if;

  -- ═══ 權限表（不需要員工夾具）═══
  perform pg_temp.pe_rec('X1 RPC：authenticated 可執行、anon／service_role 不可',
    has_function_privilege('authenticated', to_regprocedure('public.fn_coach_leave_comp(text,text[])'), 'EXECUTE')
    and not has_function_privilege('anon', to_regprocedure('public.fn_coach_leave_comp(text,text[])'), 'EXECUTE')
    and not has_function_privilege('service_role', to_regprocedure('public.fn_coach_leave_comp(text,text[])'), 'EXECUTE'), '');
  perform pg_temp.pe_rec('X2 內部三個函式不對任何 API 角色開放',
    not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                 and p.proname in ('fn_tk_leave_comp_weeks','fn_tk_leave_comp_days','fn_coach_leave_comp_week')
                 and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE'))), '');
  perform pg_temp.pe_rec('X3 沒有補償紀錄的票＝0 天', public.fn_tk_leave_comp_days('LC-NO-SUCH') = 0, '');
  perform pg_temp.pe_skip('X4 併發（兩條連線同時請假同一週）', '單一交易內無法驗證；列入 p0e_10_leave_comp_concurrency_manual.md');

  raise exception 'LEAVECOMP_TESTS_RESULT: %', pg_temp.pe_summary();
end
$pe$;
