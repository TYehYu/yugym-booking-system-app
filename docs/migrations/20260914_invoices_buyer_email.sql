-- 2026-09-14 invoices 補 buyer_email 欄位
-- 使用者：「還是可以請客人填寫email 發票除了用雲端條碼之外的都統一存放去email」
--          「然後中獎通知 去超商列印」
--
-- 定案的收法：
--   ・客人有手機條碼 → CarrierType=3，存進他自己的載具，中獎通知走財政部平台（不需要我們的 email）
--   ・沒有手機條碼   → CarrierType=1 存綠界載具 ＋ CustomerEmail，
--                      開立與中獎都由綠界寄信通知，客人憑通知到超商列印
--
-- ⚠ 為什麼一定要存下來：**「重開」那條路會把 email 弄丟**。
--   _invRetry（index.html 64086）是「用當初存下來的那組條件重組」，
--   而 invoices 原本沒有任何欄位放 email —— 重開出來的發票就沒有通知信箱了，
--   散客（member_id 是 null）更是完全救不回來。
--   買受人 email 本來就是發票的一部分，跟著發票存才對。
--
-- ⚠ 既有 0 筆，不需要回填（新系統上線測試那張刻意沒寫表）。

alter table public.invoices
  add column if not exists buyer_email text;
