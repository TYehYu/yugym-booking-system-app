-- ============================================================
-- Sprint 2：RLS 收斂（移除 USING(true) 全開、改用權限函式）
-- 產出：2026-07-16　狀態：已套用於「測試專案」並通過四角色測試；正式尚未套用
-- 依據 docs/SPRINT2_RLS_DESIGN.md / SECURITY_MODEL.md
-- 回滾：如需暫時恢復某表全開 → create policy <t>_all on <t> for all using(true) with check(true);
-- ============================================================

-- ===== 移除所有 USING(true) 全開政策 =====
drop policy if exists app_state_all on app_state;
drop policy if exists attendance_all on attendance;
drop policy if exists bookings_all on bookings;
drop policy if exists course_plans_all on course_plans;
drop policy if exists employees_all on employees;
drop policy if exists exercises_all on exercises;
drop policy if exists leave_settlements_all on leave_settlements;
drop policy if exists leave_settlements_all_authenticated on leave_settlements;
drop policy if exists member_tickets_all on member_tickets;
drop policy if exists members_all on members;
drop policy if exists notifications_all on notifications;
drop policy if exists punch_requests_all on punch_requests;
drop policy if exists purchase_applications_all on purchase_applications;
drop policy if exists pa_select on purchase_applications;
drop policy if exists pa_update on purchase_applications;
drop policy if exists purchases_all on purchases;
drop policy if exists salary_templates_all on salary_templates;
drop policy if exists shifts_all on shifts;
drop policy if exists space_resources_all on space_resources;
drop policy if exists spaces_all on spaces;
drop policy if exists ticket_logs_all on ticket_logs;
drop policy if exists ticket_types_all on ticket_types;
drop policy if exists training_logs_all on training_logs;
drop policy if exists venues_all on venues;

-- ===== 補上收斂後的政策 =====
-- member_tickets：教練可讀（會員本人 mt_select_member、櫃台 mt_all_staff 已存在）
create policy mt_coach_read on member_tickets for select using (is_coach());

-- bookings：教練可改自己授課的（讀由 bookings_select_all_coach；staff_desk 由 bookings_all_staff）
create policy bk_coach_write on bookings for all
  using (is_coach() and coach_id = current_employee_id())
  with check (is_coach() and coach_id = current_employee_id());

-- ticket_logs：教練可讀、會員讀自己票券的異動（櫃台 tl_all_staff 已存在）
create policy tl_coach_read on ticket_logs for select using (is_coach());
create policy tl_self_read on ticket_logs for select
  using (ticket_id in (select id from member_tickets where member_id = current_member_id()));

-- notifications：會員/教練讀自己的（櫃台 notif_all_staff 已存在）
create policy nt_member on notifications for select
  using (recipient_type = 'member' and recipient_id = current_member_id());
create policy nt_coach on notifications for select
  using (recipient_type = 'coach' and recipient_id = current_employee_id());

-- purchases：僅櫃台/管理員
create policy pur_staff_all on purchases for all using (is_staff_desk()) with check (is_staff_desk());

-- purchase_applications：保留 anon 送出(pa_insert)；讀寫收斂為櫃台
create policy pa_staff_all on purchase_applications for all using (is_staff_desk()) with check (is_staff_desk());

-- 出勤/班表/補打卡：員工讀自己，櫃台/管理員全權
create policy att_self  on attendance for select using (emp_id = current_employee_id());
create policy att_staff on attendance for all    using (is_staff_desk()) with check (is_staff_desk());
create policy sh_self   on shifts for select using (emp_id = current_employee_id());
create policy sh_staff  on shifts for all    using (is_staff_desk()) with check (is_staff_desk());
create policy pr_self   on punch_requests for all using (emp_id = current_employee_id()) with check (emp_id = current_employee_id());
create policy pr_staff  on punch_requests for all using (is_staff_desk()) with check (is_staff_desk());

-- 薪資/特休：僅管理員
create policy sal_admin on salary_templates for all using (is_admin()) with check (is_admin());
create policy ls_admin  on leave_settlements for all using (is_admin()) with check (is_admin());

-- 設定/參考型：登入者可讀，只有 admin 可寫（exercises 例外：員工可寫，供教練建動作）
create policy cat_read   on category for select using (auth.uid() is not null);
create policy cat_admin  on category for all using (is_admin()) with check (is_admin());
create policy ml_read    on member_level for select using (auth.uid() is not null);
create policy ml_admin   on member_level for all using (is_admin()) with check (is_admin());
create policy ttml_read  on ticket_type_member_levels for select using (auth.uid() is not null);
create policy ttml_admin on ticket_type_member_levels for all using (is_admin()) with check (is_admin());
create policy sp_read    on spaces for select using (auth.uid() is not null);
create policy sp_admin   on spaces for all using (is_admin()) with check (is_admin());
create policy spr_read   on space_resources for select using (auth.uid() is not null);
create policy spr_admin  on space_resources for all using (is_admin()) with check (is_admin());
create policy ven_read   on venues for select using (auth.uid() is not null);
create policy ven_admin  on venues for all using (is_admin()) with check (is_admin());
create policy rr_read    on reward_rules for select using (auth.uid() is not null);
create policy rr_admin   on reward_rules for all using (is_admin()) with check (is_admin());
create policy ex_read    on exercises for select using (auth.uid() is not null);
create policy ex_staff   on exercises for all using (is_any_staff()) with check (is_any_staff());

-- 註：members/employees/course_plans/ticket_types 的收斂政策（本人/角色/admin）
--     正式庫已存在（members_select、employees_select、cp_*、tt_*），移除全開後即生效。
