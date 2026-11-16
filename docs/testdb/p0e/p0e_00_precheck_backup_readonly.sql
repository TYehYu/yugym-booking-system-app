-- ═══════════════════════════════════════════════════════════════════════
-- P0-E 套用前的唯讀檢查與備份快照（測試庫 kucvxpjatptfckhlxptj；純 SELECT，尚未執行）
-- P0-E 沒有「被取代」的既有函式或觸發器（全是新增），所以備份＝套用前狀態快照：
--   ① 庫識別  ② 新物件不存在  ③ activation_mode 欄位不存在  ④ 依賴函式存在
--   ⑤ 歷史快照（member_tickets 的效期／餘額／狀態雜湊）——套用後 p0e_04_verify 會比對，證明沒有改動任何既有票券
--   ⑥ bookings／ticket_logs／member_tickets 現有觸發器清單（與新觸發器共存檢查）
-- 請把 ⑤ 的 n_tickets 與 hist_md5 記錄下來（填入 p0e_04_verify 的 <PRE_N>、<PRE_HASH>）。
-- ═══════════════════════════════════════════════════════════════════════
-- ① 庫識別（兩項都必須 true）
select (select system_identifier::text from pg_control_system()) = '7662742571317219726' as sysid_is_testdb,
       (to_regclass('public.change_log') is null and not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs')) as no_prod_marks;

-- ② 新物件不得已存在（預期 0 列）
select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
   and (p.proname like 'fn_tk_%' and p.proname <> 'fn_tk_shared_has' or p.proname like 'trg_tk_%' or p.proname = 'fn_bk_attended') limit 30;
select tgname from pg_trigger where not tgisinternal and tgname in ('trg_tk_window_ledger','trg_tk_window_booking_ins','trg_tk_window_booking_upd','trg_tk_checkin_activate');

-- ③ 欄位不得已存在（預期 0 列）
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'member_tickets' and column_name = 'activation_mode';

-- ④ 依賴函式（預期 3 列：desk_alert、fn_tk_shared_has、gen_short_id）
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('desk_alert','fn_tk_shared_has','gen_short_id') order by 1;

-- ⑤ 歷史快照
select count(*) as n_tickets,
       md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) as hist_md5
  from member_tickets;

-- ⑥ 現有觸發器
select tgrelid::regclass::text as tbl, tgname, tgenabled::text as en from pg_trigger
 where not tgisinternal and tgrelid in ('public.bookings'::regclass,'public.member_tickets'::regclass,'public.ticket_logs'::regclass) order by 1, 2 limit 40;
