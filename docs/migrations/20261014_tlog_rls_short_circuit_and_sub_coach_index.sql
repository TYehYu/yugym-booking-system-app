-- 2026-10-14 使用者回報：「點開課表的時候稍慢了點」
-- 與同日的 20261014_rls_member_only_policies_short_circuit 同一類，但更嚴重：
--
-- ① tlog_select_partner（同行會員才需要）帶相關子查詢，排在便宜的條件之前 ——
--    教練每讀一次 training_logs，要對 1,802 列各跑一次
--    bookings → member_tickets 的 Nested Loop。
-- ② tlog_select_scoped 呼叫 coach_taught_member_ids()，那支過濾
--    `coach_id = X or substitute_coach_id = X`；substitute_coach_id **沒有索引**，
--    OR 兩邊只要一邊沒索引就整個退回 Seq Scan，掃兩次 10,068 列 —— 單這支 407ms。
--
-- 實測（教練身分，1000 筆）：執行 465ms → 5.5ms／規劃 415ms → 14.6ms
--   （合計 880ms → 20ms）。線上平均 2,198ms、最高 7,803ms。
--
-- ⚠ 純效能改動。驗證：五種身分在交易內改完比對筆數再 rollback —
--   教練 32、同行會員 42／33、無關會員 0、管理員 1,834，改前改後一致；
--   上線後再複驗一次同樣數字。

alter policy tlog_select_partner on public.training_logs
  using ( (select current_member_id()) is not null
          and booking_id is not null
          and exists (select 1 from bookings b
                        join member_tickets t on t.id = b.ticket_id
                      where b.id = training_logs.booking_id
                        and b.member_id is not null
                        and (t.partners ->> b.member_id) = (select current_member_id())) );

-- coach_taught_member_ids() 的 OR 另一邊；部分索引即可（絕大多數是 NULL）
create index if not exists idx_bookings_sub_coach
  on public.bookings(substitute_coach_id) where substitute_coach_id is not null;
