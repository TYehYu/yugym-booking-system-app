-- 正式庫｜P0-E｜部署後驗證（唯讀 SELECT；尚未執行）。全部結果以「預期」欄為準；任何一項不符＝依該階段回復檔處理。
select (select system_identifier::text from pg_control_system()) = '7637215626725903220' as sysid_is_prod;
-- V2 物件齊全（預期 functions=15、triggers=4、column=1）
select (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('fn_tk_today','fn_tk_is_unopened','fn_tk_seat_member','fn_bk_attended','fn_tk_holding','fn_tk_window_check','fn_tk_refund_once','fn_tk_cancel_overdue','fn_tk_activate','fn_tk_attended_dates','fn_tk_recalc','fn_tk_group_seat','trg_tk_window_ledger','trg_tk_window_booking','trg_tk_checkin_activate')) as functions,
       (select count(*) from pg_trigger where not tgisinternal and tgenabled='O' and tgname in ('trg_tk_window_ledger','trg_tk_window_booking_ins','trg_tk_window_booking_upd','trg_tk_checkin_activate')) as triggers,
       (select count(*) from information_schema.columns where table_schema='public' and table_name='member_tickets' and column_name='activation_mode') as col;
-- V3 權限：預期 0 列（沒有任何 API 角色能執行）
select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and ((p.proname like 'fn_tk_%' and p.proname <> 'fn_tk_shared_has') or p.proname like 'trg_tk_%' or p.proname='fn_bk_attended')
   and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'));
-- V4 沒有任何票券帶 activation_mode（套用當下不得回填）：預期 0
select count(*) as with_mode from member_tickets where activation_mode is not null;
-- V5 原有 bookings 觸發器仍在（預期仍含 bookings_cancelled_by、bookings_touch、trg_bookings_contract_hold_guard、trg_bookings_group_guard、trg_bookings_hold_month_guard、trg_change_log，並多 3 個 trg_tk_*）
select tgname, tgenabled::text from pg_trigger where not tgisinternal and tgrelid='public.bookings'::regclass order by 1;
-- V6 新制未開通票中預約跨度已超過窗口者（2026-11-15 盤點：0）
select t.id, t.valid_days, min(h.bdate) first_d, max(h.bdate) last_d from member_tickets t join lateral public.fn_tk_holding(t.id, null) h on true
 where coalesce(t.valid_days,0)>0 and t.activated_at is null and t.start_date is null and t.expire_date is null
 group by t.id, t.valid_days having (max(h.bdate)-min(h.bdate)) > (t.valid_days-1);
