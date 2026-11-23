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
