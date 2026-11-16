-- ═══════════════════════════════════════════════════════════════════════
-- T19：P0-C 調課流程在 P0-E 之下的回歸測試（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj）
-- 前置（缺任一項就中止，不會留下資料）：
--   ① P0-C 已套用到測試庫（同步 migration ＋ fn_move_booking_ticket）
--   ② P0-E 已套用（p0e_02）
--   ③ fn_move_booking_ticket 已加入 P0-E 銜接（見 p0e_07 §P0-C 銜接修改）：放行 'TKWIN.%'、第一個 UPDATE 前
--      set_config('app.tkwin_skip_booking','on',true)、成功後與例外前都還原為 ''
-- 另外請把 P0-C 原有的 docs/testdb/move_ticket_01_sql_tests.sql 在 P0-E 套用後完整重跑一次（T19 的主體）；本檔只補 P0-E 特有的交會案例。
-- 整份只有一個 DO 語句，結尾必定 raise exception 回滾；結果在 P0E_T19_RESULT: 之後。
-- ═══════════════════════════════════════════════════════════════════════
do $t19$
declare
  v_uid uuid; v_r jsonb; v_d date := (now() at time zone 'Asia/Taipei')::date;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫，停止執行';
  end if;
  if to_regprocedure('public.fn_move_booking_ticket(text,text,text)') is null then raise exception 'T19.PRECONDITION: 尚未套用 P0-C'; end if;
  if to_regprocedure('public.fn_tk_activate(text,date,text)') is null then raise exception 'T19.PRECONDITION: 尚未套用 P0-E'; end if;
  if (select pg_get_functiondef('public.fn_move_booking_ticket(text,text,text)'::regprocedure)) not like '%tkwin_skip_booking%' then
    raise exception 'T19.PRECONDITION: fn_move_booking_ticket 尚未加入 P0-E 銜接（app.tkwin_skip_booking）'; end if;

  create temp table t19_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  -- 精簡輸出（工具只保留錯誤訊息頭尾各約 5,000 字元；只列 FAIL 與 SKIP、FAIL 優先、≤ 8000 字元、被截斷不會判為通過；與 P0-C 的 mv_summary 相同邏輯）
  create function pg_temp.t19_summary() returns text language plpgsql as $f$
  declare
    v_pass integer; v_fail integer; v_skip integer; v_total integer;
    v_items jsonb := '[]'::jsonb; v_item jsonb; v_len integer; v_budget constant integer := 8000;
    v_full boolean := false; v_om_fail integer := 0; v_om_skip integer := 0;
    v_verdict text; v_out text; v_last jsonb;
    r record;
  begin
    select count(*) filter (where ok is true), count(*) filter (where ok is false), count(*) filter (where ok is null), count(*)
      into v_pass, v_fail, v_skip, v_total from t19_res;
    v_verdict := case when v_total = 0 then 'NO_TESTS' when v_fail > 0 then 'FAIL' when v_skip > 0 then 'INCOMPLETE_SKIPS' else 'PASS' end;
    v_len := 700;                                                       -- 標頭（計數、verdict、omitted、說明）預留
    for r in select n, name, ok, detail from t19_res where ok is not true order by (ok is null), n loop
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

  create function pg_temp.t19_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as
    $f$ insert into t19_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 300)) $f$;
  create function pg_temp.t19_call(p_uid uuid, p_from text, p_to text, p_mode text) returns jsonb language plpgsql as $f$
  declare r jsonb;
  begin
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    r := public.fn_move_booking_ticket(p_from, p_to, p_mode);
    perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claim.role', '', true); perform set_config('request.jwt.claims', '', true);
    return r;
  end $f$;

  select auth_id into v_uid from employees where role::text = 'front_desk' and auth_id is not null and status::text is distinct from 'inactive' order by id limit 1;
  if v_uid is null then select auth_id into v_uid from employees where role::text = 'admin' and auth_id is not null order by id limit 1; end if;
  if v_uid is null then raise exception 'T19.PRECONDITION: 測試庫沒有可用的櫃檯／管理員帳號'; end if;

  insert into ticket_types(id, name, category) values ('T19-T-PT', 'T19 教練課', '私人教練');
  insert into members(id, name) values ('T19-M', 'T19測試會員');

  -- 共用夾具：未啟用票（vd=7）；F 綁票（d+5）；X 綁票（參數）；G 待簽約（d+3，較早）
  create function pg_temp.t19_fx(p_k text, p_x_off integer) returns void language plpgsql as $f$
  begin
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status, valid_days)
      values ('T19-TK-' || p_k, 'T19-M', 'T19-T-PT', 'T19方案', 8, 5, 'usable', 7);
    insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance)
      values ('T19-F-' || p_k, 'T19-M', '私人教練', 'T19-T-PT', (now() at time zone 'Asia/Taipei')::date + 5, '11:00', 60, 'booked', false, 'T19-TK-' || p_k, '[]'::jsonb, '{}'::jsonb),
             ('T19-X-' || p_k, 'T19-M', '私人教練', 'T19-T-PT', (now() at time zone 'Asia/Taipei')::date + p_x_off, '12:00', 60, 'booked', false, 'T19-TK-' || p_k, '[]'::jsonb, '{}'::jsonb);
    insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance)
      values ('T19-G-' || p_k, 'T19-M', '私人教練', 'T19-T-PT', (now() at time zone 'Asia/Taipei')::date + 3, '10:00', 60, 'booked', true, null, '[]'::jsonb, '{}'::jsonb);
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values
      ('T19-LG-F-' || p_k, 'T19-TK-' || p_k, 'deduct', -1, 'T19-F-' || p_k, 't19', 'x'),
      ('T19-LG-X-' || p_k, 'T19-TK-' || p_k, 'deduct', -1, 'T19-X-' || p_k, 't19', 'x');
  end $f$;

  -- M1 調課後仍在窗口內 → 成功；跳過旗標用完即還原；未啟用票仍未啟用
  perform pg_temp.t19_fx('m1', 8);   -- 調課前 {5,8}，調課後 {3,8} 跨度 5 ≤ 6
  v_r := pg_temp.t19_call(v_uid, 'T19-F-m1', 'T19-G-m1', 'cancel');
  perform pg_temp.t19_rec('M1 調課後窗口內 → 成功', v_r->>'ok' = 'true', v_r::text);
  perform pg_temp.t19_rec('M1 跳過旗標已還原（不外漏到後續語句）', coalesce(current_setting('app.tkwin_skip_booking', true), '') <> 'on', coalesce(current_setting('app.tkwin_skip_booking', true), 'null'));
  perform pg_temp.t19_rec('M1 調課不啟用效期（三欄仍空）', (select start_date is null and expire_date is null and activated_at is null from member_tickets where id = 'T19-TK-m1'), '');
  perform pg_temp.t19_rec('M1 餘額不變、新預約淨額 1、原預約淨額 0',
    (select sessions_remaining from member_tickets where id = 'T19-TK-m1') = 5
    and (select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0) from ticket_logs where ticket_id = 'T19-TK-m1' and booking_id = 'T19-G-m1') = 1
    and (select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0) from ticket_logs where ticket_id = 'T19-TK-m1' and booking_id = 'T19-F-m1') = 0, '');

  -- M2 調課使最早日期提前、跨度超出窗口 → TKWIN 透傳（不是 INTERNAL_ERROR）且整筆回滾
  perform pg_temp.t19_fx('m2', 10);  -- 調課前 {5,10} 跨度 5；調課後 {3,10} 跨度 7 > 6
  v_r := pg_temp.t19_call(v_uid, 'T19-F-m2', 'T19-G-m2', 'cancel');
  perform pg_temp.t19_rec('M2 超出窗口 → error_code 以 TKWIN.OUT_OF_WINDOW 開頭（P0-C 已放行 TKWIN.%）', coalesce(v_r->>'error_code', '') like 'TKWIN.OUT_OF_WINDOW:%', v_r::text);
  perform pg_temp.t19_rec('M2 整筆回滾：原預約仍綁票、新預約仍待簽約、帳不變',
    (select ticket_id = 'T19-TK-m2' from bookings where id = 'T19-F-m2')
    and (select pending_contract and ticket_id is null from bookings where id = 'T19-G-m2')
    and (select count(*) from ticket_logs where ticket_id = 'T19-TK-m2') = 2, '');
  perform pg_temp.t19_rec('M2 旗標也隨回滾還原', coalesce(current_setting('app.tkwin_skip_booking', true), '') <> 'on', '');

  -- M3 調課目標已簽到／原預約已簽到 → 仍被 P0-C 原規則擋下（FROM_STATE），P0-E 不改變其行為
  perform pg_temp.t19_fx('m3', 8);
  update bookings set status = 'checked_in', checked_in_at = now() where id = 'T19-F-m3';   -- 觸發 P0-E 啟用
  v_r := pg_temp.t19_call(v_uid, 'T19-F-m3', 'T19-G-m3', 'cancel');
  perform pg_temp.t19_rec('M3 已簽到的原預約不可調課（P0-C 原規則）', v_r->>'error_code' = 'MOVE.FROM_STATE', v_r::text);
  perform pg_temp.t19_rec('M3 該票已由簽到啟用', (select activation_mode = 'checkin' and start_date = v_d + 5 from member_tickets where id = 'T19-TK-m3'), '');

  raise exception 'P0E_T19_RESULT: %', pg_temp.t19_summary();
end
$t19$;
