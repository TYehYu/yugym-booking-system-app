-- 【只裝測試庫 kucvxpjatptfckhlxptj】把測試庫補到「和正式庫一樣」，才能忠實驗證人事權限缺口。（測試庫暫補物件清單：docs/hr-perm/TESTDB_TEMP_OBJECTS.md）
-- 測試庫現況落差（2026-11-17 查證）：缺 fn_employees_guard 與其觸發器、缺 salary_history 資料表、缺正式庫才有的欄位。
-- 內容取自正式庫的定義（唯讀查得）；還原見 rollback_00_parity_prep.sql。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;

alter table public.employees add column if not exists avatar_url text;
alter table public.employees add column if not exists duty_order integer;
alter table public.employees add column if not exists duty_matrix boolean default true;
alter table public.employees add column if not exists line_notify boolean default true;
alter table public.employees add column if not exists birthday_bonus_off boolean default false;
alter table public.employees add column if not exists line_user_id text;
alter table public.employees add column if not exists line_bind_token text;
alter table public.employees add column if not exists leader_members jsonb;
alter table public.employees add column if not exists leader_t1 integer;
alter table public.employees add column if not exists leader_b1 integer;
alter table public.employees add column if not exists leader_t2 integer;
alter table public.employees add column if not exists leader_b2 integer;
alter table public.attendance add column if not exists note text;
alter table public.attendance add column if not exists fixed_by text;
alter table public.attendance add column if not exists fixed_at timestamptz;

CREATE OR REPLACE FUNCTION public.fn_employees_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_changed text[];
  v_allowed text[] := array['name_en','email','birthday','must_setup','line_user_id','line_bind_token'];
  v_bad text[];
begin
  if coalesce(auth.role(),'') not in ('anon','authenticated') then return new; end if;
  if is_admin() then return new; end if;

  -- 主管調整僱用別那條窄門（fn_set_employment_type 會點亮這個旗標）
  if coalesce(current_setting('app.emp_type_rpc', true),'') = '1' then
    v_allowed := v_allowed || array[
      'pay_rules','employment_type','need_duty','weekly_work_days','weekly_min_shift_days',
      'base_salary','duty_hourly','pt_mode','pt_rate','pay_rate','pt_tiers','group_rate',
      'pt_bonus_enabled','pt_bonus','custom_salary'];
  end if;

  select coalesce(array_agg(n.key),'{}') into v_changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value;

  if new.role='admin' and old.role is distinct from 'admin'
     and new.auth_id = auth.uid()
     and not exists (select 1 from employees e where e.role='admin' and e.status='active' and e.id<>new.id)
  then
    v_allowed := v_allowed || array['role','status'];
  end if;

  select coalesce(array_agg(k),'{}') into v_bad
  from unnest(v_changed) k where k <> all(v_allowed);
  if array_length(v_bad,1) > 0 then
    raise exception 'EMP.GUARD: 欄位 % 僅管理員可修改', array_to_string(v_bad,', ');
  end if;
  return new;
end $function$;
drop trigger if exists trg_employees_guard on public.employees;
create trigger trg_employees_guard before update on public.employees for each row execute function public.fn_employees_guard();

-- salary_history（正式庫：匯入的歷史月薪紀錄，205 列；RLS 開、政策如下）
create table if not exists public.salary_history (
  id text primary key, emp_id text not null, ym text not null,
  net numeric, pt numeric, grp numeric, duty numeric, renew numeric, massage numeric,
  grade text, source text, note text, created_at timestamptz default now());
alter table public.salary_history enable row level security;
grant select, insert, update, delete on public.salary_history to authenticated;
grant select, insert, update, delete on public.salary_history to service_role;
drop policy if exists sh_read on public.salary_history; drop policy if exists sh_self on public.salary_history; drop policy if exists sh_write on public.salary_history;
create policy sh_read  on public.salary_history for select using (((select is_staff_desk()) or (select is_admin())));
create policy sh_self  on public.salary_history for select using (emp_id = (select current_employee_id()));
create policy sh_write on public.salary_history for all    using ((select is_admin()));
-- 出勤政策對齊正式庫（測試庫原為 att_self／att_staff 兩條 ALL；正式庫是 att_admin／att_self_ins／att_self_read／att_self_upd／att_staff_read）
drop policy if exists att_self on public.attendance; drop policy if exists att_staff on public.attendance;
drop policy if exists att_admin on public.attendance; drop policy if exists att_self_ins on public.attendance; drop policy if exists att_self_read on public.attendance; drop policy if exists att_self_upd on public.attendance; drop policy if exists att_staff_read on public.attendance;
create policy att_admin      on public.attendance for all    using ((select is_admin())) with check ((select is_admin()));
create policy att_self_ins   on public.attendance for insert with check (emp_id = (select current_employee_id()));
create policy att_self_read  on public.attendance for select using (emp_id = (select current_employee_id()));
create policy att_self_upd   on public.attendance for update using (emp_id = (select current_employee_id())) with check (emp_id = (select current_employee_id()));
create policy att_staff_read on public.attendance for select using ((select is_staff_desk()));
notify pgrst, 'reload schema';
