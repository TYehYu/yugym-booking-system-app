-- ============================================================
-- 20260721_03：修復員工端無法儲存會員資料（members 缺 INSERT 政策）
-- ------------------------------------------------------------
-- 根因：與 20260721_02（employees）同款。測試庫套 20260719_02/03 收斂後
-- members 只剩 select/update/delete 政策；前端 dbPut 一律走 upsert
-- （INSERT ... ON CONFLICT）需要 INSERT 政策 → 管理員/櫃台儲存會員資料、
-- 後台辦理會員一律被 RLS 擋（"new row violates RLS"）。
-- 測試庫自 2026-07-19 套用收斂後即處於此狀態（2026-07-21 名片彈窗編輯實測時發現）。
--
-- 修法：補「員工（管理員＋櫃台）」可 insert。anon / 會員 / 教練仍不可 insert，
-- 不重開會員自行註冊的漏洞（該流程日後走安全 RPC）。
--
-- 套用狀態：測試庫待使用者於 SQL Editor 執行（MCP 被權限分類器擋）。
-- 正式庫：尚未套 02/03 收斂（原開放 insert 政策仍在），故此問題尚未發生；
--         日後正式庫套收斂時本檔需一併執行。
-- 回退：drop policy members_insert_staff on public.members;
-- ============================================================
create policy members_insert_staff on public.members
for insert to authenticated
with check (is_staff_desk());
