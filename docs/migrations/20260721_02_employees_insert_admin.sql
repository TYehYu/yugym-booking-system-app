-- ============================================================
-- 20260721_02：修復管理員無法儲存員工資料（employees 缺 INSERT 政策）
-- ------------------------------------------------------------
-- 根因：20260719_03 移除 employees_insert（原政策開放任何人 insert，
-- 有 pending 邀請接管風險）。但前端 dbPut 一律走 upsert（INSERT ... ON CONFLICT），
-- upsert 需要 INSERT 政策 → 政策拿掉後，管理員在員工詳情/薪資設定按「儲存」
-- 一律被 RLS 擋（console：new row violates row-level security policy for "employees"，
-- 畫面 toast：權限不足…）。測試庫自 2026-07-19 套 03 之後即處於此狀態。
--
-- 修法：補回「僅管理員」可 insert。anon / 會員 / 教練仍不可 insert，
-- 不會重開 03 要堵的邀請漏洞。
--
-- 套用狀態：測試庫待使用者於 SQL Editor 執行（MCP 被權限分類器擋）。
-- 正式庫：尚未套 03，故此問題尚未發生；日後套 03 時本檔需一併執行。
-- 回退：drop policy employees_insert_admin on public.employees;
-- ============================================================
create policy employees_insert_admin on public.employees
for insert to authenticated
with check (is_admin());
