-- 還原 00_testdb_parity_prep.sql（只對測試庫）。注意：還原後測試庫又回到和正式庫不一致的狀態。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
drop trigger if exists trg_employees_guard on public.employees;
drop function if exists public.fn_employees_guard();
drop table if exists public.salary_history;
alter table public.employees drop column if exists avatar_url, drop column if exists duty_order, drop column if exists duty_matrix, drop column if exists line_notify,
  drop column if exists birthday_bonus_off, drop column if exists line_user_id, drop column if exists line_bind_token,
  drop column if exists leader_members, drop column if exists leader_t1, drop column if exists leader_b1, drop column if exists leader_t2, drop column if exists leader_b2;
alter table public.attendance drop column if exists note, drop column if exists fixed_by, drop column if exists fixed_at;
-- 出勤政策還原成測試庫原貌
drop policy if exists att_admin on public.attendance; drop policy if exists att_self_ins on public.attendance; drop policy if exists att_self_read on public.attendance; drop policy if exists att_self_upd on public.attendance; drop policy if exists att_staff_read on public.attendance;
create policy att_self  on public.attendance for all using (emp_id = current_employee_id()) with check (emp_id = current_employee_id());
create policy att_staff on public.attendance for all using (is_staff_desk()) with check (is_staff_desk());
notify pgrst, 'reload schema';
