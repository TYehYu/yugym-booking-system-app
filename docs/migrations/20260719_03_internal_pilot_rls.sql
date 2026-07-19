-- 內部試營運 P0：關閉公開員工申辦與 training_logs 全開權限。
-- 試營運期間沿用既有測試帳號；新員工邀請待安全 RPC 完成後再開放。
begin;

-- employees：任何人可 INSERT / 接管 pending invite 風險過高，試營運先關閉。
drop policy if exists employees_insert on public.employees;
drop policy if exists employees_invite_select on public.employees;
drop policy if exists employees_invite_update on public.employees;

-- training_logs：只允許管理員、紀錄所屬教練，以及會員本人唯讀。
drop policy if exists training_logs_all on public.training_logs;
drop policy if exists tlog_delete_auth on public.training_logs;
drop policy if exists tlog_insert_auth on public.training_logs;
drop policy if exists tlog_select_auth on public.training_logs;
drop policy if exists tlog_update_auth on public.training_logs;

create policy tlog_select_scoped on public.training_logs
for select to authenticated
using (
  is_admin()
  or coach_id = current_employee_id()
  or member_id = current_member_id()
);

create policy tlog_insert_coach on public.training_logs
for insert to authenticated
with check (
  is_admin()
  or (is_coach() and coach_id = current_employee_id())
);

create policy tlog_update_coach on public.training_logs
for update to authenticated
using (is_admin() or (is_coach() and coach_id = current_employee_id()))
with check (is_admin() or (is_coach() and coach_id = current_employee_id()));

create policy tlog_delete_coach on public.training_logs
for delete to authenticated
using (is_admin() or (is_coach() and coach_id = current_employee_id()));

commit;
