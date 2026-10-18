-- 2026-10-18 使用者回報：「團體課的備註會一次調整到全部的人上面」
--
-- 課卡右上角那顆備註寫的是 bookings.note（整堂一份）。單人課沒問題，
-- 但團課一堂有 2～5 個名額，四張會員卡顯示同一句、而且編輯的是同一格。
-- 1003 當時判斷「那本來就是整堂的備註，這是對的」—— 實際用起來不是：
-- 正式庫裡唯一一筆人寫的團課備註是「魏曉微 8/26請假」，
-- 想記某個人的事，只能把名字塞進整堂備註裡。
--
-- ⚠ 為什麼不借用 bookings.note：它是系統在寫的（舊匯入、補名額鍵、教練請假…）。
--   正式庫 642 筆團課有 note，全部都是系統註記。
--
-- ⚠ 為什麼不借用 training_note：那一欄是「課表的今日備註」，鍵是 slot（1V2 用），
--   而且團課與自主訓練根本沒有課表（0911 定案）。兩件事不要混在同一欄。
--
-- ⚠ 鍵用「名額鍵」而不是 member_id：同一位會員可以在一堂團課佔兩格
--   （替家人報名，鍵是 mid 與 mid#2，見 seatKeys）。用 member_id 當鍵
--   會讓媽媽那格與本人那格共用同一則備註 —— 正是這次要修的毛病。
--   與既有的 bookings.seat_tickets 同一套鍵，兩邊對得起來。
--
-- ⚠ 既有的表不必重下 GRANT；新欄位自動沿用 bookings 的 grants 與 RLS policy。
-- ⚠ 不加進 LEAN_DROP：課卡要畫出這一格的備註，dbGetAll 就得帶著它。

alter table public.bookings
  add column if not exists seat_notes jsonb;

comment on column public.bookings.seat_notes is
  '團課逐名額的備註，鍵是名額鍵（mid 或 mid#2，同 seat_tickets）。整堂的事寫 bookings.note。';
