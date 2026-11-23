-- 還原 2a（20261119a_hr_perm_compat.sql）。⚠ 必須先還原 2b（rollback_2b_hr_perm_revoke.sql），否則 2b 的政策還在引用這裡的函式。
-- 新表資料（hr_grants、manager_scope、hr_settings）會一併消失，回復前先匯出。補打卡新增的 requested_by／reviewed_by 兩欄保留不刪（有資料時避免遺失）。
drop view if exists public.attendance_presence;
drop view if exists public.employees_account;
drop view if exists public.employees_employment;
drop view if exists public.employees_insure;
drop view if exists public.employees_pay;
drop view if exists public.employees_manager_scope;
drop view if exists public.employees_public;
drop function if exists public.fn_employee_update_general(text, jsonb);
drop function if exists public.fn_punch_decide(text, boolean);
drop function if exists public.fn_my_hr_access();
drop function if exists public.is_my_report(text);
drop function if exists public.has_hr_duty(text);
drop function if exists public.admin_full_hr();
drop table if exists public.hr_settings;
drop table if exists public.manager_scope;
drop table if exists public.hr_grants;
notify pgrst, 'reload schema';
