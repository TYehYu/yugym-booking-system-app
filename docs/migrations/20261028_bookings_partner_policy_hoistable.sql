-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-28　bookings_select_partner：把逐列的 EXISTS 改成算一次的雜湊表
-- ════════════════════════════════════════════════════════════════════════
-- 起因：整理系統時 advisor 報「246 條重複的 permissive 政策」。實際量過之後
--       發現根本不是政策條數的問題 —— 用兩種身分各跑一次
--       `select … from bookings order by id limit 1000`：
--
--         櫃檯（front_desk）   4.9ms　／  1,332 buffers
--         會員（member）     188.8ms　／ 26,972 buffers      ← 慢 38 倍
--
--       櫃檯那邊 is_staff_desk() 一成立，後面的子查詢全部 never executed，
--       完全沒事。慢的只有會員端，而且兇手只有**一條政策**。
--
-- 根因：這一條（0924 做「同行」功能時加的）的 EXISTS 參照到 `bookings.member_id`，
--       所以**提不出去、逐列執行**。實測跑了 6,430 次，每一次還要重新評估
--       member_tickets 自己的 RLS（含一個 jsonb_each_text 的 Function Scan）。
--       光這一條就吃掉 19,305 buffers ＝ 全部的 72%。
--
--       這是 1014「RLS 要先擋身分再 EXISTS」的同一個形狀，只是長在新功能上。
--       （旁邊的 bookings_select_shared_pool 寫成 `ticket_id IN (…)`，
--         計畫裡就是 `hashed SubPlan`、只算一次、415 buffers —— 對照組就在隔壁。）
--
-- 改法：把「對每一列問一次」換成「列出所有 (票, 會員) 配對、算一次做成雜湊表」。
--       子查詢不再參照外層那一列，Postgres 就能提成 hashed SubPlan。
--
-- 結果（同一台、同一筆查詢）：
--       執行 188.8ms → 34.8ms（5.4 倍）
--       buffers 26,972 → 7,801（3.5 倍）
--       規劃 54.7ms → 4.7ms
--       SubPlan 32 的 loops 從 6,430 → 1
--
-- ⚠ 語意必須完全一樣 —— 上線前先比對過：
--     全部 6 位「身為同行人」的會員，新舊兩種寫法看得到的預約集合**逐一相同**
--     （各 86 筆、0 筆不一致）。上線後再用詹月娥（同行 18 堂）實際登入身分複查，
--     同行的課照樣看得到。
-- ⚠ `jsonb_typeof(partners)='object'` 這個條件不能省：
--     舊寫法用 `->>`，碰到非物件只會回 NULL；新寫法的 jsonb_each_text 會**報錯**。
--     （目前 4,321 張票的 partners 全是 object，但不能靠現況。）
-- ⚠ 不要改成 join member_tickets —— 子查詢裡的 member_tickets 仍然吃它自己的 RLS，
--     那是對的（會員只看得到自己的／共享的／自己是同行人的票），兩種寫法都一樣。
-- ════════════════════════════════════════════════════════════════════════

alter policy bookings_select_partner on public.bookings
using (
  (select current_member_id()) is not null
  and ticket_id is not null
  and member_id is not null
  and (ticket_id, member_id) in (
        select t.id, kv.key
          from member_tickets t, lateral jsonb_each_text(t.partners) kv
         where jsonb_typeof(t.partners) = 'object'
           and kv.value = (select current_member_id())
      )
);

-- 還原（改壞了就跑這段）：
-- alter policy bookings_select_partner on public.bookings
-- using (
--   (select current_member_id()) is not null
--   and ticket_id is not null and member_id is not null
--   and exists (select 1 from member_tickets t
--                where t.id = bookings.ticket_id
--                  and (t.partners ->> bookings.member_id) = (select current_member_id()))
-- );
