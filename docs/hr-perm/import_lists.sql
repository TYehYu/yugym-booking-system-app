-- 上線前名單匯入範本（⚠ 寫入；正式庫必須先取得使用者明確授權，且 2a 已套用）。
-- 先跑 validate_lists.sql 確認每列 problem 都是空的，再把同一份名單貼進來。冪等：重複執行不會重複列。
insert into public.manager_scope (manager_id, employee_id) values
  ('E-MGR-001','E-COACH-101'),('E-MGR-001','E-COACH-102'),('E-MGR-002','E-COACH-103')     -- ← 換成真實名單
on conflict do nothing;
insert into public.hr_grants (employee_id, duty, granted_by) values
  ('E-HR-001','pay_view','上線設定'),('E-HR-001','pay_adjust','上線設定'),('E-HR-002','insure','上線設定')   -- ← 換成真實名單
on conflict do nothing;
-- 回復（只刪你這批）：delete from public.manager_scope where (manager_id, employee_id) in (…同一份名單…);
--                      delete from public.hr_grants where granted_by = '上線設定';
-- 確認：select * from public.manager_scope order by 1,2;  select * from public.hr_grants order by 1,2;
-- 說明：hr_settings.admin_implicit_hr 維持 'true'（過渡期）。改成 'false' 之前須先完成 ADMIN_BASE_TABLE_AND_ATTENDANCE_TIME.md 的三個前提。
