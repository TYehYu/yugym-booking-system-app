-- 階段 10 唯讀驗證（只有 SELECT）。套用前：PRE 全部應為 true、POST 全部應為 false；套用後：PRE 的最後一項（名稱尚未存在）會變 false，其餘 PRE 仍為 true，POST 全部應為 true。
-- 另附：新舊物件總覽。其餘物件不變由套用交易內的前後簽章比對保證（見 apply 檔）。
select 'PRE' phase, '叢集識別是正式庫' check_name, ((select system_identifier::text from pg_control_system()) = '7637215626725903220') ok
union all
select 'PRE' phase, '有 change_log（像正式庫）' check_name, (to_regclass('public.change_log') is not null) ok
union all
select 'PRE' phase, 'bookings.seat_notes 存在且為 jsonb' check_name, (exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='seat_notes' and udt_name='jsonb')) ok
union all
select 'PRE' phase, '06／08 物件都在（fn_tk_refund_once、fn_refund_ticket、fn_booking_rev_of、fn_desk_cancel_booking、booking_op_rev、trg_booking_op_rev）' check_name, (to_regprocedure('public.fn_tk_refund_once(text,text,text)') is not null and to_regprocedure('public.fn_refund_ticket(text,text,text)') is not null and to_regprocedure('public.fn_booking_rev_of(text)') is not null and to_regprocedure('public.fn_desk_cancel_booking(text,text)') is not null and to_regclass('public.booking_op_rev') is not null and exists (select 1 from pg_trigger where tgname='trg_booking_op_rev' and not tgisinternal)) ok
union all
select 'PRE' phase, 'fn_tk_refund_once 是釘住的 06 版本（本體 md5 bba19026075474e59d57365e38361f1e）' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_tk_refund_once(text,text,text)')), '') = 'bba19026075474e59d57365e38361f1e') ok
union all
select 'PRE' phase, 'public.fn_booking_rev_of(text) 是釘住的版本（定義 md5 42ab6f3a78b5d3d885b784c1d5818131）' check_name, (coalesce((select md5(pg_get_functiondef(to_regprocedure('public.fn_booking_rev_of(text)'))) where to_regprocedure('public.fn_booking_rev_of(text)') is not null), '') = '42ab6f3a78b5d3d885b784c1d5818131') ok
union all
select 'PRE' phase, 'public.trg_booking_op_rev() 是釘住的版本（定義 md5 5391036bc33b78f0e45353d3d4c09a9b）' check_name, (coalesce((select md5(pg_get_functiondef(to_regprocedure('public.trg_booking_op_rev()'))) where to_regprocedure('public.trg_booking_op_rev()') is not null), '') = '5391036bc33b78f0e45353d3d4c09a9b') ok
union all
select 'PRE' phase, 'public.fn_refund_ticket(text,text,text) 是釘住的版本（定義 md5 2140c88ebd655418775fdb0bfe8dfd9b）' check_name, (coalesce((select md5(pg_get_functiondef(to_regprocedure('public.fn_refund_ticket(text,text,text)'))) where to_regprocedure('public.fn_refund_ticket(text,text,text)') is not null), '') = '2140c88ebd655418775fdb0bfe8dfd9b') ok
union all
select 'PRE' phase, '三支新函式名稱都還不存在（不覆蓋任何同名物件，不論參數）' check_name, (not exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex'))) ok
union all
select 'POST' phase, '三支新函式都已建立（恰 3 支）' check_name, ((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) = 3) ok
union all
select 'POST' phase, 'fn_seat_map_reindex 本體 md5＝0960ccde99493b7d79dd4d40a0fa45c6' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')), '') = '0960ccde99493b7d79dd4d40a0fa45c6') ok
union all
select 'POST' phase, 'fn_seat_map_reindex 的 security definer＝false、search_path 為 public, pg_temp' check_name, (coalesce((select prosecdef::text = 'false' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')), false)) ok
union all
select 'POST' phase, 'fn_seat_map_reindex 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行）' check_name, (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')), '') = '{postgres=X/postgres}') ok
union all
select 'POST' phase, 'fn_group_seat_rev 本體 md5＝5f33108bc3b98e200eefbc23ad8070c8' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_group_seat_rev(text)')), '') = '5f33108bc3b98e200eefbc23ad8070c8') ok
union all
select 'POST' phase, 'fn_group_seat_rev 的 security definer＝true、search_path 為 public, pg_temp' check_name, (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_group_seat_rev(text)')), false)) ok
union all
select 'POST' phase, 'fn_group_seat_rev 權限正好是 {postgres=X/postgres,authenticated=X/postgres}（anon／service_role／public 都不能執行）' check_name, (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_group_seat_rev(text)')), '') = '{postgres=X/postgres,authenticated=X/postgres}') ok
union all
select 'POST' phase, 'fn_cancel_group_seat 本體 md5＝c8a70d1d1d2918660543f0e5c69c89f6' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')), '') = 'c8a70d1d1d2918660543f0e5c69c89f6') ok
union all
select 'POST' phase, 'fn_cancel_group_seat 的 security definer＝true、search_path 為 public, pg_temp' check_name, (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')), false)) ok
union all
select 'POST' phase, 'fn_cancel_group_seat 權限正好是 {postgres=X/postgres,authenticated=X/postgres}（anon／service_role／public 都不能執行）' check_name, (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')), '') = '{postgres=X/postgres,authenticated=X/postgres}') ok
order by 1 desc, 2;
