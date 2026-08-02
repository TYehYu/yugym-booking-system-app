-- 店長獎金改制（2026-08 起）：依「每位教練達標的課堂」逐位支付
-- 使用者指示（2026-08-02）：
--   「店長的津貼從八月開始調整新的模式，依照每個教練達標的課堂支付獎金。
--     如果該員工有把店長打開，下方要顯示全員工的列表，打勾該員工表示該員工的課堂數
--     才有影響該店長的獎金。還有達標課堂跟達標獎金的設定。
--     這樣可以在之後有分店的時候，每個店長影響的獎金可以單獨設定。」
--
-- 舊制是全域一組數字（全店總堂數 ÷ 80 × $4,000），分店之後兩位店長沒辦法分開設定，
-- 所以名單／門檻／金額都改存在「這位店長」自己的員工資料上。
-- 2026 年 7 月以前的月份仍走舊制，歷史薪資不受影響（見 index.html 的 LEADER_NEW_FROM）。
alter table employees
  add column if not exists leader_members jsonb,    -- 計算名單：員工 id 陣列（null/空＝未設定，獎金算 0）
  add column if not exists leader_target  integer,  -- 達標課堂（每位教練）
  add column if not exists leader_bonus   integer;  -- 達標獎金（每位達標教練給一筆）
