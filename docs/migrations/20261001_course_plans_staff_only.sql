/* 教練培訓方案：只有員工買得到（2026-10-01 使用者：
   「我要新增一個員工才能購買的方案 教練培訓1v1跟1v2 12堂 單價1500/1700 可分期」）

   兩個決定（使用者在 AskUserQuestion 上選的）：
   ⚠ **授課教練照拿課費**，跟一般教練課一樣 —— 算進堂數、達標獎金、總堂數。
     所以票種直接用現有的「教練課」（tt-mqdt435bbizd，category='私人教練'），
     **不另立 category**。多一個 category 就要在 isPtPayClass、bkCounts、
     salesValue、課卡顏色…十幾處同步，而規則上它本來就是一堂教練課。
   ⚠ 「只有員工能買」＝**賣票時選到非員工就擋下來**（看得到但用不了，
     與 VIP 方案、主顧客方案同一套語彙 —— 見前端的 blockOf）。
     不是「非員工就不顯示」：清單裡突然少兩張卡，櫃檯會以為系統壞了。

   旗標取名 staff_only、預設 false：既有 20 幾個方案完全不受影響，不必回填。 */

alter table public.course_plans
  add column if not exists staff_only boolean not null default false;

comment on column public.course_plans.staff_only is
  '限員工購買（預設 false）。true 時賣票視窗選到非員工會擋下並寫原因，與 VIP／主顧客方案同一套 blockOf 機制。2026-10-01 新增。';

/* 兩個方案。欄位對齊既有的 12 堂方案（valid_days 365、installment true、
   member_applyable false＝會員端不能自助申請，要櫃檯開）。 */
insert into public.course_plans
  (id, name, ticket_type_id, format, unit_price, sessions_base, sessions_bonus,
   valid_days, plan_type, installment, member_applyable, active, archived, staff_only)
values
  ('plan-staff-1v1', '教練培訓 1V1', 'tt-mqdt435bbizd', '1v1', 1500, 12, 0,
   365, 'staff', true, false, true, false, true),
  ('plan-staff-1v2', '教練培訓 1V2', 'tt-mqdt435bbizd', '1v2', 1700, 12, 0,
   365, 'staff', true, false, true, false, true)
on conflict (id) do update set
  name=excluded.name, ticket_type_id=excluded.ticket_type_id, format=excluded.format,
  unit_price=excluded.unit_price, sessions_base=excluded.sessions_base,
  valid_days=excluded.valid_days, plan_type=excluded.plan_type,
  installment=excluded.installment, member_applyable=excluded.member_applyable,
  active=excluded.active, archived=excluded.archived, staff_only=excluded.staff_only;
