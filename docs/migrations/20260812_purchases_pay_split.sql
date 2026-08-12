-- 2026-08-12（已於當日套用正式庫）
-- 使用者需求：「有一筆帳 14400，分兩種方式付款 7200 匯款 7200 現金，有辦法在付款的地方設定嗎」
-- 拆帳付款：payment_method='split'，實際拆分記在 pay_split（{"cash":7200,"transfer":7200}）。
-- 首頁現金/匯款 KPI、財務報表的付款方式統計都會把 split 的兩段分別歸進現金與匯款。
alter table public.purchases add column if not exists pay_split jsonb;
