-- 2026-08-03 店長回報：排班「編輯常用時段」出現沒有權限。（已套用正式庫）
--
-- 常用時段設定存在 salary_templates 的 _shift_quick 這一筆，而該表 RLS 原本
-- 只有一條 sal_admin（is_admin()）。店長（教練＋is_manager）與櫃檯管排班，
-- 這筆設定要能讀寫；其餘薪資範本屬敏感設定維持管理員限定 —— 所以政策
-- 鎖定 id='_shift_quick' 這一列，而不是放寬整張表。
-- is_staff_desk() 已涵蓋 admin / front_desk / 店長（is_manager，2026-07-29 起）。
--
-- 驗證（模擬店長 JWT）：can_read_quick=1、其他範本可見數=0、update 可寫。
create policy sal_shift_quick_staff on public.salary_templates
  for all to authenticated
  using (id = '_shift_quick' and is_staff_desk())
  with check (id = '_shift_quick' and is_staff_desk());
