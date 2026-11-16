-- 階段 11 唯讀驗證（只有 SELECT）。套用前：PRE 全部 true、POST 全部 false；套用後：PRE 的「名稱尚未存在」兩項與「fn_hold_month_guard 是原版」變 false、其餘 PRE 仍 true，POST 全部 true。
-- 其餘物件（函式本體＋權限、policies、table grants、資料表）不變，由套用／回復交易內的前後簽章比對保證。
select 'PRE' phase, '叢集識別是本環境（正式庫）' check_name, ((select system_identifier::text from pg_control_system()) = '7637215626725903220') ok
union all
select 'PRE' phase, '像正式庫（有 change_log）' check_name, (to_regclass('public.change_log') is not null) ok
union all
select 'PRE' phase, '欄位存在且型別正確（bookings.contract_id／pending_contract、contracts.sessions、ticket_grant_requests.payload jsonb）' check_name, (exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='contract_id') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='pending_contract' and data_type='boolean') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='contracts' and column_name='sessions') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='ticket_grant_requests' and column_name='payload' and udt_name='jsonb')) ok
union all
select 'PRE' phase, 'fn_tk_today 是釘住的版本（定義 md5 0e56a027d482cff48c58b18f66adde21）' check_name, (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_tk_today'), '') = '0e56a027d482cff48c58b18f66adde21') ok
union all
select 'PRE' phase, 'fn_hold_month_limit_end 是釘住的版本（定義 md5 25e24e629d5d1ad0a865393cafbd621c）' check_name, (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_hold_month_limit_end'), '') = '25e24e629d5d1ad0a865393cafbd621c') ok
union all
select 'PRE' phase, 'fn_contract_hold_check 是釘住的版本（定義 md5 abfd7b86e0c97d39dbf979c9432909ed）' check_name, (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_contract_hold_check'), '') = 'abfd7b86e0c97d39dbf979c9432909ed') ok
union all
select 'PRE' phase, 'fn_contract_hold_guard 是釘住的版本（定義 md5 83e8d478609db46b91311ad8d148c230）' check_name, (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_contract_hold_guard'), '') = '83e8d478609db46b91311ad8d148c230') ok
union all
select 'PRE' phase, 'fn_tk_shared_has 是釘住的版本（定義 md5 766f04876216f1cdbc7becc3a9f57e49）' check_name, (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_tk_shared_has'), '') = '766f04876216f1cdbc7becc3a9f57e49') ok
union all
select 'PRE' phase, 'is_staff_desk 是釘住的版本（定義 md5 46d2a4db99b29dd44bd667e91d32cbe3）' check_name, (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='is_staff_desk'), '') = '46d2a4db99b29dd44bd667e91d32cbe3') ok
union all
select 'PRE' phase, 'fn_hold_month_guard 是釘住的版本（定義 md5 20399e1ec62751e958ae8c2a1d00064f）＝套用前的原版，才可被覆蓋' check_name, (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_hold_month_guard'), '') = '20399e1ec62751e958ae8c2a1d00064f') ok
union all
select 'PRE' phase, '觸發器 trg_bookings_hold_month_guard 是釘住的版本（定義 md5 bd919dd7342e1a26f1b870538b93de4f）' check_name, (coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_hold_month_guard' and not t.tgisinternal), '') = 'bd919dd7342e1a26f1b870538b93de4f') ok
union all
select 'PRE' phase, '觸發器 trg_bookings_contract_hold_guard 是釘住的版本（定義 md5 82c324805c4aaefc70a4795a35be1c69）' check_name, (coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_contract_hold_guard' and not t.tgisinternal), '') = '82c324805c4aaefc70a4795a35be1c69') ok
union all
select 'PRE' phase, '依賴函式都存在（current_employee_id、fn_tgr_cancel_cascade、fn_contract_cancel_holds、fn_contracts_delete_cascade、fn_tk_holding、gen_short_id）' check_name, (exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='current_employee_id') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_tgr_cancel_cascade') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_contract_cancel_holds') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_contracts_delete_cascade') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_tk_holding') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='gen_short_id')) ok
union all
select 'PRE' phase, '四支新函式名稱都還不存在（不覆蓋任何同名物件，不論參數）；測試專用 zz_rn_adopt 也不存在' check_name, (not exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','zz_rn_adopt'))) ok
union all
select 'PRE' phase, '三個新觸發器名稱都還不存在' check_name, (not exists (select 1 from pg_trigger where not tgisinternal and tgname in ('trg_bookings_hold_state_guard','trg_contract_window_ins','trg_contract_window_upd'))) ok
union all
select 'POST' phase, '四支新函式恰好各一支' check_name, ((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds')) = 4) ok
union all
select 'POST' phase, 'fn_hold_state_guard 本體 md5＝22edb0f9a4893e9d891a420ba4588440' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), '') = '22edb0f9a4893e9d891a420ba4588440') ok
union all
select 'POST' phase, 'fn_hold_state_guard 的 security definer＝true、search_path 為 public, pg_temp' check_name, (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), false)) ok
union all
select 'POST' phase, 'fn_hold_state_guard 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行）' check_name, (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), '') = '{postgres=X/postgres}') ok
union all
select 'POST' phase, 'fn_contract_window_check 本體 md5＝f6dbf9948aa381932b0f8d7fa605dfbe' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), '') = 'f6dbf9948aa381932b0f8d7fa605dfbe') ok
union all
select 'POST' phase, 'fn_contract_window_check 的 security definer＝true、search_path 為 public, pg_temp' check_name, (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), false)) ok
union all
select 'POST' phase, 'fn_contract_window_check 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行）' check_name, (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), '') = '{postgres=X/postgres}') ok
union all
select 'POST' phase, 'trg_contract_window_booking 本體 md5＝d3c291fa4a1d308a9edaee54a5924f7c' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), '') = 'd3c291fa4a1d308a9edaee54a5924f7c') ok
union all
select 'POST' phase, 'trg_contract_window_booking 的 security definer＝true、search_path 為 public, pg_temp' check_name, (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), false)) ok
union all
select 'POST' phase, 'trg_contract_window_booking 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行）' check_name, (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), '') = '{postgres=X/postgres}') ok
union all
select 'POST' phase, 'fn_contract_adopt_holds 本體 md5＝05c51530e595cf296f9b8da951f66093' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), '') = '05c51530e595cf296f9b8da951f66093') ok
union all
select 'POST' phase, 'fn_contract_adopt_holds 的 security definer＝true、search_path 為 public, pg_temp' check_name, (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), false)) ok
union all
select 'POST' phase, 'fn_contract_adopt_holds 權限正好是 {postgres=X/postgres,authenticated=X/postgres}（anon／service_role／public 都不能執行）' check_name, (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), '') = '{postgres=X/postgres,authenticated=X/postgres}') ok
union all
select 'POST' phase, 'fn_hold_month_guard 本體 md5＝e7152b65fbb7d6c5d494cc938757caeb（新版）' check_name, (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')), '') = 'e7152b65fbb7d6c5d494cc938757caeb') ok
union all
select 'POST' phase, 'fn_hold_month_guard 的 security definer／search_path 不變' check_name, (coalesce((select prosecdef and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')), false)) ok
union all
select 'POST' phase, '觸發器 trg_bookings_hold_state_guard 存在於 bookings、已啟用、定義含 BEFORE INSERT OR UPDATE OF status, ticket_id, date ON public.bookings／fn_hold_state_guard()' check_name, (exists (select 1 from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_hold_state_guard' and not t.tgisinternal and t.tgenabled='O' and pg_get_triggerdef(t.oid) like '%BEFORE INSERT OR UPDATE OF status, ticket_id, date ON public.bookings%' and pg_get_triggerdef(t.oid) like '%fn_hold_state_guard()%')) ok
union all
select 'POST' phase, '觸發器 trg_contract_window_ins 存在於 bookings、已啟用、定義含 AFTER INSERT ON public.bookings／trg_contract_window_booking()' check_name, (exists (select 1 from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_contract_window_ins' and not t.tgisinternal and t.tgenabled='O' and pg_get_triggerdef(t.oid) like '%AFTER INSERT ON public.bookings%' and pg_get_triggerdef(t.oid) like '%trg_contract_window_booking()%')) ok
union all
select 'POST' phase, '觸發器 trg_contract_window_upd 存在於 bookings、已啟用、定義含 AFTER UPDATE ON public.bookings／trg_contract_window_booking()' check_name, (exists (select 1 from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_contract_window_upd' and not t.tgisinternal and t.tgenabled='O' and pg_get_triggerdef(t.oid) like '%AFTER UPDATE ON public.bookings%' and pg_get_triggerdef(t.oid) like '%trg_contract_window_booking()%')) ok
union all
select 'POST' phase, '既有的兩個卡位觸發器沒被動到（指紋仍是釘住的版本）' check_name, (coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_hold_month_guard' and not t.tgisinternal), '') = 'bd919dd7342e1a26f1b870538b93de4f' and coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_contract_hold_guard' and not t.tgisinternal), '') = '82c324805c4aaefc70a4795a35be1c69') ok
order by 1 desc, 2;
