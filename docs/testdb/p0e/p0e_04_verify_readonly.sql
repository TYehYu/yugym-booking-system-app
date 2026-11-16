-- ═══════════════════════════════════════════════════════════════════════
-- P0-E 套用後驗證（唯讀 SELECT；測試庫 kucvxpjatptfckhlxptj；尚未執行）。
-- 把 <PRE_N>、<PRE_HASH> 換成 p0e_00 ⑤ 記錄的套用前值（沒換會因轉型失敗）。
-- ═══════════════════════════════════════════════════════════════════════
-- V1 庫識別
select (select system_identifier::text from pg_control_system()) = '7662742571317219726' as sysid_is_testdb;
-- V2 物件齊全（預期 functions=15、triggers=4、column=1）
select (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
          and p.proname in ('fn_tk_today','fn_tk_is_unopened','fn_tk_seat_member','fn_bk_attended','fn_tk_holding','fn_tk_window_check','fn_tk_refund_once',
                            'fn_tk_cancel_overdue','fn_tk_activate','fn_tk_attended_dates','fn_tk_recalc','fn_tk_group_seat','trg_tk_window_ledger','trg_tk_window_booking','trg_tk_checkin_activate')) as functions,
       (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
          and tgname in ('trg_tk_window_ledger','trg_tk_window_booking_ins','trg_tk_window_booking_upd','trg_tk_checkin_activate')) as triggers,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'member_tickets' and column_name = 'activation_mode') as col;
-- V3 權限：預期 0 列（沒有任何 API 角色能執行）
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_x
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and ((p.proname like 'fn_tk_%' and p.proname <> 'fn_tk_shared_has') or p.proname like 'trg_tk_%' or p.proname = 'fn_bk_attended')
   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE')) limit 20;
-- V4 歷史未被改動：預期 same = true、with_mode = 0
select (n = <PRE_N> and h = '<PRE_HASH>') as same, with_mode
  from ( select count(*) as n,
                md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) as h,
                count(*) filter (where activation_mode is not null) as with_mode
           from member_tickets ) x;
-- V5 既有 bookings 觸發器仍在（預期仍含 trg_bookings_contract_hold_guard、trg_bookings_hold_month_guard，並多出本次 3 個）
select tgrelid::regclass::text as tbl, tgname, tgenabled::text as en from pg_trigger
 where not tgisinternal and tgrelid in ('public.bookings'::regclass,'public.ticket_logs'::regclass) order by 1, 2 limit 30;
-- V6 目前新制未開通票中，預約跨度已超過窗口者（預期：測試庫通常 0；正式庫盤點用同一支，需另行授權）
select t.id, t.valid_days, min(h.bdate) as first_d, max(h.bdate) as last_d, (max(h.bdate) - min(h.bdate)) as span
  from member_tickets t join lateral public.fn_tk_holding(t.id, null) h on true
 where coalesce(t.valid_days, 0) > 0 and t.activated_at is null and t.start_date is null and t.expire_date is null
 group by t.id, t.valid_days having (max(h.bdate) - min(h.bdate)) > (t.valid_days - 1) limit 50;
