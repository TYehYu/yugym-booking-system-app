-- ═══════════════════════════════════════════════════════════════════════
-- P0-E 回復（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj；DROP 需明確授權）。
-- 只移除 P0-E 新增的東西：4 個觸發器、15 個函式、activation_mode 欄位（僅當欄位帶有本次標記註解時才刪）。
-- 不碰任何既有函式、觸發器、票券與預約資料。整檔單一交易。
-- ⚠ 回復前請先確認：沒有票券帶 activation_mode='checkin'（若有，代表已有票券被簽到啟用，刪欄位會丟失「簽到啟用」的標記；
--   此時請先決定這些票的處置，腳本會中止並提示）。回復「函式與觸發器」不會改動任何票券的 start_date／expire_date／activated_at。
-- ═══════════════════════════════════════════════════════════════════════
begin;
-- ── 庫識別守門（fail-closed）：不是測試庫就中止，不靠註解或表名 ──
-- 依據：2026-11-14 唯讀取得測試庫（kucvxpjatptfckhlxptj，專案名 yugym-sprint3-test）叢集 system_identifier = 7662742571317219726，
--       且測試庫沒有 public.change_log 表與 fn_table_sigs（正式庫有）。任何一項不符、或 pg_control_system() 取不到 → 一律中止。
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫（有 change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;

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

do $col$
begin
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.member_tickets'::regclass and a.attname = 'activation_mode' and not a.attisdropped
              and col_description('public.member_tickets'::regclass, a.attnum) like 'P0E-20261116%') then
    if exists (select 1 from member_tickets where activation_mode is not null) then
      raise exception 'P0E.ROLLBACK_ABORT: 已有票券帶 activation_mode，請先決定處置再刪欄位（函式與觸發器的回復不受影響，可註解掉本區塊單獨執行）';
    end if;
    alter table public.member_tickets drop column activation_mode;
  else
    raise notice 'activation_mode 沒有 P0-E 標記（原本就存在或已移除），不動';
  end if;
end
$col$;

do $chk$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and ((p.proname like 'fn_tk_%' and p.proname <> 'fn_tk_shared_has') or p.proname like 'trg_tk_%' or p.proname = 'fn_bk_attended')) then
    raise exception 'P0E.ROLLBACK_INCOMPLETE: 仍有 fn_tk_／trg_tk_ 函式殘留';
  end if;
end
$chk$;
commit;
