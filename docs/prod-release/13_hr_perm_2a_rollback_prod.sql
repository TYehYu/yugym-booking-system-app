-- 人事權限 2a 回復：移除 2a 新增的資料表／檢視／函式（requested_by／reviewed_by 兩欄刻意保留，避免資料遺失）。前提：2b 已先回復。
-- ⚠ 只供審查；正式庫尚未執行，必須取得使用者明確授權。單一交易：前置核對→套用→提交前核對，任何一項不符整筆回滾（沒有任何變更）。
-- 組檔：python3 docs/prod-release/build_hr_release.py prod（由已驗證的 migration／rollback 本體組成，檔尾有 sha256 紀錄在 HR_PERM_FINGERPRINTS.sha256）。
begin;
set local lock_timeout = '5s';
create or replace function pg_temp.hr_fp(p_fn text[], p_pol text[], p_trg text[], p_gr text[], p_rel text[], p_col text[]) returns jsonb language sql stable as $f$
  select jsonb_build_object(
    '函式', (select md5(coalesce(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text),'')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname <> all(p_fn)),
    '政策', (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename <> all(p_pol) and tablename <> all(p_gr)),
    '觸發器', (select md5(coalesce(string_agg(c.relname||'.'||t.tgname||'|'||pg_get_triggerdef(t.oid),E'\n' order by c.relname,t.tgname),'')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace and (c.relname||'.'||t.tgname) <> all(p_trg)),
    '權限', (select md5(coalesce(string_agg(table_name||'|'||grantee||'|'||privilege_type,'|' order by table_name,grantee,privilege_type),'')) from information_schema.role_table_grants where table_schema='public' and table_name <> all(p_gr)),
    '資料表與檢視', (select md5(coalesce(string_agg(relname||':'||relkind::text,',' order by relname),'')) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m') and relname <> all(p_rel)),
    '欄位', (select md5(coalesce(string_agg(table_name||'.'||column_name||':'||data_type,',' order by table_name,column_name),'')) from information_schema.columns where table_schema='public' and column_name <> all(p_col) and table_name <> all(p_rel) and table_name in (select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m'))))
$f$;
do $guard$
begin
  if not ((select system_identifier::text from pg_control_system()) = '7637215626725903220') then raise exception 'HR2ARB.GUARD: 叢集識別不是預期的資料庫，停止（沒有任何變更）'; end if;
  if exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) then raise exception 'HR2ARB.GUARD: 2b 還在，請先跑 2b 回復'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and policyname in ('employees_select_v2','sh_read_hr','pr_read_scope')) then raise exception 'HR2ARB.GUARD: 2b 的政策還在，請先跑 2b 回復'; end if;
  if not (select count(*) = 10 from pg_class where relnamespace='public'::regnamespace and relname = any(array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence'])) then raise exception 'HR2ARB.GUARD: 2a 沒有套用（或不完整），停止'; end if;
  -- 新表資料會一併消失：有資料時必須先匯出，並刻意放行（set hr.allow_data_loss = '1'）
  if coalesce(current_setting('hr.allow_data_loss', true),'') <> '1' and ((select count(*) from public.hr_grants) > 0 or (select count(*) from public.manager_scope) > 0) then raise exception 'HR2ARB.GUARD: hr_grants／manager_scope 有資料，回復會刪掉；請先匯出並 set hr.allow_data_loss = ''1'''; end if;
  create temp table _hr2arb_pre on commit drop as select pg_temp.hr_fp(array['admin_full_hr','has_hr_duty','is_my_report','fn_my_hr_access','fn_punch_decide','fn_employee_update_general']::text[],array[]::text[],array[]::text[],array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence']::text[],array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence']::text[],array['requested_by','reviewed_by']::text[]) fp;
end
$guard$;

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

do $post$
declare v_diff text;
begin
  select string_agg(e.key, '、') into v_diff from jsonb_each(pg_temp.hr_fp(array['admin_full_hr','has_hr_duty','is_my_report','fn_my_hr_access','fn_punch_decide','fn_employee_update_general']::text[],array[]::text[],array[]::text[],array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence']::text[],array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence']::text[],array['requested_by','reviewed_by']::text[])) e where e.value is distinct from ((select fp from _hr2arb_pre) -> e.key);
  if v_diff is not null then raise exception 'HR2ARB.POST: 其他物件變了（{%}），整筆回滾', v_diff; end if;
  if exists (select 1 from pg_class where relnamespace='public'::regnamespace and relname = any(array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence'])) or exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname = any(array['admin_full_hr','has_hr_duty','is_my_report','fn_my_hr_access','fn_punch_decide','fn_employee_update_general'])) then raise exception 'HR2ARB.POST: 2a 物件沒有移除乾淨'; end if;
end
$post$;
commit;
