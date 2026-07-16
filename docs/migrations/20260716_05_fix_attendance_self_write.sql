-- 20260716_05_fix_attendance_self_write.sql
-- 目的：修復 Sprint 2 RLS 收斂造成的「教練無法下班打卡」迴歸
--
-- 【問題】
-- 20260716_03_rls_hardening（台北 18:34 套用）移除了寬鬆的 attendance_all 政策，
-- 改為：
--   att_self  on attendance for select using (emp_id = current_employee_id())  ← 只給 SELECT
--   att_staff on attendance for all    using (is_staff_desk())                 ← 僅管理員/櫃台
-- 教練因此對自己的出勤紀錄只能讀、不能寫。
--
-- 前端 punchOut()（index.html:17605）流程為 dbPut('attendance', rec)（upsert，
-- 需 INSERT + UPDATE），被 RLS 擋下後進入 catch，跳出「打卡失敗」提示。
--
-- 實際影響（正式庫 2026-07-16）：黃美蓉 09:34、曹智詠 15:52、鄭百益 15:56 三位教練
-- 於 18:34 收斂前上班打卡成功，收斂後下班打卡全數失敗，clock_out 皆為 null。
-- 7/15 以前的紀錄 clock_out 均正常，可見為本次收斂造成。
--
-- 【判定為漏寫而非刻意】
-- 同一份 migration 中，punch_requests 的自身政策給的是 ALL：
--   pr_self on punch_requests for all using (emp_id = current_employee_id())
--                                    with check (emp_id = current_employee_id());
-- 相同語意的 att_self 卻只給 select，兩者不一致。補打卡申請寫得進去、實際打卡寫不進去，
-- 不合常理。
--
-- 【修法】
-- att_self 比照 pr_self 改為 for all，範圍仍嚴格限縮在 emp_id = current_employee_id()，
-- 員工只能寫自己的出勤，不會擴大到他人資料。
--
-- 【不動 shifts】
-- sh_self 同樣只有 select，但班表本應由管理員排定，教練不得自行修改，屬正確設計。
--
-- 【回退】
-- drop policy att_self on attendance;
-- create policy att_self on attendance for select using (emp_id = current_employee_id());

begin;

drop policy if exists att_self on attendance;

create policy att_self on attendance
  for all
  using (emp_id = current_employee_id())
  with check (emp_id = current_employee_id());

commit;
