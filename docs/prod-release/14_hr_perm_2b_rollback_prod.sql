-- 人事權限 2b 回復：恢復舊權限、移除出勤守衛，回到 2a 狀態（政策指紋必須等於正式庫原貌）。順序：先跑這支，再退前端。
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
  if not ((select system_identifier::text from pg_control_system()) = '7637215626725903220') then raise exception 'HR2BRB.GUARD: 叢集識別不是預期的資料庫，停止（沒有任何變更）'; end if;
  if not exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) then raise exception 'HR2BRB.GUARD: 2b 沒有套用，停止'; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='punch_requests'),'') <> 'pr_del_admin,pr_ins_desk,pr_ins_self,pr_read_admin,pr_read_desk,pr_read_scope,pr_read_self' then raise exception 'HR2BRB.GUARD: punch_requests 的政策清單不是2b 預期的清單（現況不是已知狀態，停止）'; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='attendance'),'') <> 'att_admin,att_self_ins,att_self_read,att_self_upd,att_staff_read' then raise exception 'HR2BRB.GUARD: attendance 的政策清單不是2b 預期的清單（現況不是已知狀態，停止）'; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='employees'),'') <> 'employees_delete,employees_insert_admin,employees_select_v2,employees_update_v2' then raise exception 'HR2BRB.GUARD: employees 的政策清單不是2b 預期的清單（現況不是已知狀態，停止）'; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='salary_history'),'') <> 'sh_read_hr,sh_self,sh_write_del,sh_write_ins,sh_write_upd' then raise exception 'HR2BRB.GUARD: salary_history 的政策清單不是2b 預期的清單（現況不是已知狀態，停止）'; end if;
  create temp table _hr2brb_pre on commit drop as select pg_temp.hr_fp(array['fn_attendance_self_guard']::text[],array['employees','punch_requests','attendance','salary_history']::text[],array['attendance.trg_attendance_self_guard']::text[],array[]::text[],array[]::text[],array[]::text[]) fp;
end
$guard$;

-- 還原 2b（20261119b_hr_perm_revoke.sql）→ 回到 2a 狀態（舊政策全部恢復）。順序：先跑這支（恢復權限），再退前端，最後才視需要回 2a。
drop policy if exists sh_read_hr on public.salary_history;
drop policy if exists sh_write_ins on public.salary_history;
drop policy if exists sh_write_upd on public.salary_history;
drop policy if exists sh_write_del on public.salary_history;
drop policy if exists sh_write on public.salary_history;
drop policy if exists sh_read on public.salary_history;
create policy sh_read  on public.salary_history for select using (((select is_staff_desk()) or (select is_admin())));
create policy sh_write on public.salary_history for all    using ((select is_admin())) with check ((select is_admin()));   -- 正式庫原貌：明確寫 WITH CHECK

drop policy if exists employees_select_v2 on public.employees;
drop policy if exists employees_update_v2 on public.employees;
drop policy if exists employees_select on public.employees;
drop policy if exists employees_select_all_coach on public.employees;
drop policy if exists employees_update on public.employees;
create policy employees_select on public.employees for select using (((select is_staff_desk()) or (auth_id = (select auth.uid()))));
create policy employees_select_all_coach on public.employees for select using ((select is_coach()));
create policy employees_update on public.employees for update to authenticated   -- 正式庫原貌：roles＝authenticated
  using      ((((select is_staff_desk()) or (auth_id = (select auth.uid()))) and (invite_status is distinct from 'pending')))
  with check ((((select is_staff_desk()) or (auth_id = (select auth.uid()))) and (invite_status is distinct from 'pending')));

drop policy if exists att_staff_read on public.attendance;
create policy att_staff_read on public.attendance for select using ((select is_staff_desk()));
drop trigger if exists trg_attendance_self_guard on public.attendance;
drop function if exists public.fn_attendance_self_guard();

drop policy if exists pr_read_admin on public.punch_requests;
drop policy if exists pr_read_self on public.punch_requests;
drop policy if exists pr_read_desk on public.punch_requests;
drop policy if exists pr_read_scope on public.punch_requests;
drop policy if exists pr_ins_self on public.punch_requests;
drop policy if exists pr_ins_desk on public.punch_requests;
drop policy if exists pr_del_admin on public.punch_requests;
drop policy if exists pr_self on public.punch_requests;
drop policy if exists pr_staff on public.punch_requests;
create policy pr_self  on public.punch_requests for all using (emp_id = (select current_employee_id())) with check (emp_id = (select current_employee_id()));
create policy pr_staff on public.punch_requests for all using ((select is_staff_desk())) with check ((select is_staff_desk()));
notify pgrst, 'reload schema';

do $post$
declare v_diff text;
begin
  select string_agg(e.key, '、') into v_diff from jsonb_each(pg_temp.hr_fp(array['fn_attendance_self_guard']::text[],array['employees','punch_requests','attendance','salary_history']::text[],array['attendance.trg_attendance_self_guard']::text[],array[]::text[],array[]::text[],array[]::text[])) e where e.value is distinct from ((select fp from _hr2brb_pre) -> e.key);
  if v_diff is not null then raise exception 'HR2BRB.POST: 其他物件變了（{%}），整筆回滾', v_diff; end if;
  if (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename = any(array['employees','punch_requests','attendance','salary_history'])) <> '6632d2f1681c741deef8f7248f98e196' then raise exception 'HR2BRB.POST: 四張表的政策沒有回到正式庫原貌（指紋不符），整筆回滾'; end if;
  if exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) or exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_attendance_self_guard') then raise exception 'HR2BRB.POST: 出勤守衛沒有移除乾淨'; end if;
end
$post$;
commit;
