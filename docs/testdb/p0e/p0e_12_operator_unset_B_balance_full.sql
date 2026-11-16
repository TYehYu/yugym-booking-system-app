-- ═══════════════════════════════════════════════════════════════════════
-- P0E-12｜app.tk_operator「真正未設定」起始——路徑 B：餘額已滿拒絕（BALANCE_FULL）（待執行；僅建檔，本輪**沒有執行**；⚠ 只能對測試庫 kucvxpjatptfckhlxptj）
-- ⚠ 使用規則（違反就不能把結果當成「未設定」的證據）：
--   1. **這個檔必須在一條全新的資料庫連線上單獨執行**，而且是該連線的第一個工作；四個路徑檔（A／B／C／D）各自需要自己的全新連線，
--      不能在同一條連線上依序執行（前一個檔設過 app.tk_operator 之後，後面的就不是「未設定」了）。
--   2. 檔案第一個動作就檢查 current_setting('app.tk_operator', true) IS NULL（在任何 set_config 或 fn_refund_ticket 呼叫之前）；
--      **不是 NULL 就以 UNSET.NOT_VERIFIED 中止——那代表「未驗證」，不是 PASS，也不是 FAIL**。連線池可能重用已被設過的後端連線，這個 NULL 檢查才是證據，
--      不是「我開了新連線」這句話。
--   3. 結果在錯誤訊息 UNSET_RESULT 之後（交易必定回滾）；請原樣回報 before_is_null／after_is_null／after_is_empty／after_value／verdict，
--      **不要用 coalesce 把 NULL 與空字串合併後宣稱相同**——本檔分開記錄。
-- 預期（只是對 fn_refund_ticket 程式碼的推論，**PostgreSQL 的實際行為尚無實測證據**）：這條路徑會走到核心：先把設定設成員工 id，核心回 false 之後在判斷結果之前還原成呼叫前的值——預期結束後是**空字串**。判定 PASS 的條件：error_code＝REFUND.BALANCE_FULL、after 嚴格等於空字串。
-- 前置：p0e_12 已套用。這份測試本路徑不做任何 DDL，只有資料列夾具（隨回滾消失）。
-- ═══════════════════════════════════════════════════════════════════════
do $u$
declare
  v_after text; v_uid uuid; v_emp text; v_res jsonb; v_verdict text; v_ref_op text; v_ref_n integer;
begin
  -- 第一個動作：確認起始真的是「未設定」（NULL）。在此之前沒有任何 set_config、也沒有任何 fn_refund_ticket／fn_tk_refund_once 呼叫。
  if current_setting('app.tk_operator', true) is not null then
    raise exception 'UNSET.NOT_VERIFIED: 這條連線的 app.tk_operator 不是 NULL（值=%），不是未設定的起始 → 本項未驗證（不是 PASS）', quote_literal(current_setting('app.tk_operator', true));
  end if;
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: 看起來像正式庫'; end if;
  if to_regprocedure('public.fn_refund_ticket(text,text,text)') is null then raise exception 'UNSET.PRECONDITION: 尚未套用 p0e_12'; end if;
  select auth_id, id into v_uid, v_emp from employees where role::text = 'front_desk' and status::text = 'active' and auth_id is not null limit 1;
  if v_uid is null then raise exception 'UNSET.PRECONDITION: 測試庫沒有有登入的櫃檯員工'; end if;
  insert into ticket_types(id, name, category) values ('UN-T', 'UN 教練課', '私人教練');
  insert into members(id, name) values ('UN-M', 'UN測試會員');
  insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status) values ('UN-TKF', 'UN-M', 'UN-T', 'UN方案', 4, 4, 'usable');
  insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance) values ('UN-B4', 'UN-M', '私人教練', 'UN-T', (now() at time zone 'Asia/Taipei')::date + 3, '10:00', 60, 'booked', false, 'UN-TKF', '[]'::jsonb, '{}'::jsonb);
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values ('UN-LG4', 'UN-TKF', 'deduct', -1, 'UN-B4', 'untest', 'fixture');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  v_res := public.fn_refund_ticket('UN-TKF', 'UN-B4');
  v_after := current_setting('app.tk_operator', true);
  select count(*), max(operator) into v_ref_n, v_ref_op from ticket_logs where ticket_id = 'UN-TKF' and booking_id = 'UN-B4' and action::text = 'refund';
  v_verdict := case when v_res->>'error_code' = 'REFUND.BALANCE_FULL' and v_after = '' and v_ref_n = 0 then 'PASS' when v_after is null then 'FAIL: after 是 NULL（與推論不符）' else 'FAIL: 結果或 after 不符預期' end;
  raise exception 'UNSET_RESULT: %', jsonb_build_object('path', 'B', 'before_is_null', true, 'result', v_res, 'after_is_null', v_after is null, 'after_is_empty', v_after = '',
    'after_value', v_after, 'ledger_refund_rows', v_ref_n, 'ledger_refund_operator', v_ref_op, 'employee_id', v_emp, 'verdict', v_verdict)::text;
end
$u$;
