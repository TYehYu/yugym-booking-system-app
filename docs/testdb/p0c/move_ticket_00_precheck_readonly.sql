-- 同步／建立 RPC 之前的唯讀檢查（測試庫 kucvxpjatptfckhlxptj）。純 SELECT。
-- 預期：函式 md5 與 20261115_move_ticket_testdb_00_backup_originals_DEFS.sql 清單相符（核對用 00_backup_verify_readonly.sql）；欄位／依賴存在狀況已知。

-- 0) 庫識別（必須兩項皆 true 才可繼續；2026-11-14 唯讀取得測試庫叢集識別）
select (select system_identifier::text from pg_control_system()) = '7662742571317219726' as sysid_is_testdb,
       (to_regclass('public.change_log') is null and not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs')) as no_prod_marks;

-- 1) 相關函式現況 md5（與備份檔預期值對照）
select p.proname, p.oid::regprocedure::text as full_sig, pg_get_function_identity_arguments(p.oid) as args,
       md5(pg_get_functiondef(p.oid)) as md5, length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_staff_desk','fn_hold_month_limit_end','fn_contract_hold_check','fn_contract_hold_guard',
                     'fn_hold_month_guard','benefit_refund','fn_cancel_booking','fn_move_booking_ticket',
                     'zz_prod_benefit_refund','zz_prod_fn_cancel_booking','fn_tk_shared_has','gen_short_id')
 order by 1, 2;

-- 2) bookings 欄位是否已有 partner_id / no_show / coach_leave
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'bookings'
   and column_name in ('partner_id','no_show','coach_leave','sibling_of','venue_unit','contract_id','pending_contract');
-- 預期（同步前）：partner_id／no_show／coach_leave 三欄不存在（2026-11-14 已確認）；其餘存在。

-- 3) bookings 上的觸發器
select tgname, tgenabled::text as enabled from pg_trigger
 where tgrelid = 'public.bookings'::regclass and not tgisinternal order by 1;

-- 4) 可供測試的帳號角色數量（不輸出姓名／帳號）
select role::text as role, coalesce(is_manager,false) as is_manager, count(*) filter (where auth_id is not null) as with_auth
  from employees where status::text is distinct from 'inactive' group by 1,2 order by 1,2;
select count(*) filter (where auth_id is not null) as members_with_auth from members;
