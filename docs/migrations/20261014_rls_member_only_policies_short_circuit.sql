-- 2026-10-14 使用者回報：「最近在行事曆點開課卡的時候都會慢」
--
-- 根因：bookings 的 RLS 是多條 permissive policy 用 OR 串起來，Postgres 逐列從左到右算。
-- 「會員才需要」的兩條帶相關子查詢，排在便宜的 is_staff_desk() 前面 ——
-- 櫃檯／管理員每讀一次整表就要：
--   ・對 659 筆有票的預約各查一次 member_tickets（SubPlan，loops=659）
--   ・再整張掃 member_tickets 4,094 列，每列跑一次 jsonb_each_text
--
-- 實測（同一頁 1000 筆，管理員身分）：
--   不套 RLS 1.5ms／改前 25.6ms／改後 3.9ms（昂貴子查詢全部 never executed）
--   線上 pg_stat_statements：select * from bookings 平均 1–2.5 秒、最高 7.9 秒，
--   而 dbGetAll 一次全表要抓 11 頁 → 一次就是十幾秒。
--
-- 改法：在三條「會員專用」規則最前面加一句 (select current_member_id()) is not null
--   對櫃檯／教練＝NULL＝整條 false，子查詢連跑都不跑；
--   對會員＝邏輯完全沒變（本來 NULL 比較就是 false，只是 Postgres 不知道能先擋）。
--
-- ⚠ 純效能改動。驗證：挑 5 位有同行／共享票的會員，在交易內改完比對筆數再 rollback，
--   bookings 1043/1050/1048/1084/1110、member_tickets 1/6/3/17/18，改前改後一致；
--   上線後再複驗一次同樣數字。
--
-- ⚠ 日後**新增任何帶 EXISTS 的會員政策，第一句都要先擋身分**。

alter policy bookings_select_partner on public.bookings
  using ( (select current_member_id()) is not null
          and ticket_id is not null and member_id is not null
          and exists (select 1 from member_tickets t
                      where t.id = bookings.ticket_id
                        and (t.partners ->> bookings.member_id) = (select current_member_id())) );

alter policy bookings_select_shared_pool on public.bookings
  using ( (select current_member_id()) is not null
          and ticket_id is not null
          and exists (select 1 from member_tickets t
                      where t.id = bookings.ticket_id
                        and (t.member_id = (select current_member_id())
                             or coalesce(t.shared_with,'[]'::jsonb) @> to_jsonb(array[(select current_member_id())]))) );

alter policy mt_select_partner on public.member_tickets
  using ( (select current_member_id()) is not null
          and partners is not null
          and exists (select 1 from jsonb_each_text(member_tickets.partners) kv
                      where kv.value = (select current_member_id())) );
