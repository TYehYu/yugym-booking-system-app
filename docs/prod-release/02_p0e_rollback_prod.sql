-- ═══════════════════════════════════════════════════════════════════════
-- 正式庫 2/4 階段｜P0-E 簽到才啟用｜回復（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc）
-- ⚠ 需使用者「逐階段」明確授權後才可執行；前一階段必須已部署且驗證通過；整檔單一交易，任何一項檢查失敗整段回滾。
-- ⚠ 若失敗原因是「套用期間有人正在改票券（雜湊不符）」：整段已回滾、沒有影響，請在低流量時段重跑。
-- 守門：叢集識別 7637215626725903220＋有 change_log／fn_table_sigs；測試庫識別會在守門直接中止。
-- ═══════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then
    raise exception 'PROD.GUARD: 叢集識別與正式庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is null or not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'PROD.GUARD: 缺少正式庫標記（change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;
do $pre02r$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_coach_leave_comp','fn_coach_leave_comp_week','fn_tk_leave_comp_days','fn_tk_leave_comp_weeks','fn_refund_ticket'))
     or exists (select 1 from pg_trigger where tgname = 'trg_tk_quota_guard') then
    raise exception 'P0E.ROLLBACK_ABORT: 後續階段（補償／退票／額度）還在，請依反向順序先回復它們'; end if;
end
$pre02r$;

drop trigger if exists trg_tk_checkin_activate on public.bookings;
drop trigger if exists trg_tk_window_booking_upd on public.bookings;
drop trigger if exists trg_tk_window_booking_ins on public.bookings;
drop trigger if exists trg_tk_window_ledger on public.ticket_logs;
drop function if exists public.fn_tk_today();
drop function if exists public.fn_tk_is_unopened(public.member_tickets);
drop function if exists public.fn_tk_seat_member(text);
drop function if exists public.fn_bk_attended(public.bookings);
drop function if exists public.fn_tk_holding(text,text);
drop function if exists public.fn_tk_window_check(text);
drop function if exists public.fn_tk_refund_once(text,text,text);
drop function if exists public.fn_tk_cancel_overdue(text,date,text);
drop function if exists public.fn_tk_activate(text,date,text);
drop function if exists public.fn_tk_attended_dates(text);
drop function if exists public.fn_tk_recalc(text,text);
drop function if exists public.fn_tk_group_seat(text,date,text,boolean);
drop function if exists public.trg_tk_window_ledger();
drop function if exists public.trg_tk_window_booking();
drop function if exists public.trg_tk_checkin_activate();

-- 正式庫版：預設「保留」activation_mode 欄位（可為空、無預設值，留著無害；回復後已用簽到開通的票日期也會保留）。
-- 刪欄位是不可逆動作，需另外決定與授權；要刪時再另開一支，且只在沒有任何票券帶 activation_mode 時。


do $chk$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and ((p.proname like 'fn_tk_%' and p.proname <> 'fn_tk_shared_has') or p.proname like 'trg_tk_%' or p.proname = 'fn_bk_attended')) then
    raise exception 'P0E.ROLLBACK_INCOMPLETE: 仍有 fn_tk_／trg_tk_ 函式殘留';
  end if;
end
$chk$;
commit;
