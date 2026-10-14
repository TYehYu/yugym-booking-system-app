-- 2026-10-14 使用者：「右上角新增一個備註方便教練紀錄今天訓練狀況」
--
-- 「今日備註」是**一堂課一則**的狀況紀錄（膝蓋緊、今天狀況好、下週要加重…），
-- 跟「某個動作的備註」是兩回事 —— 後者已經在 training_logs.note 裡。
--
-- ⚠ 為什麼不借用 bookings.note：那一欄是系統在寫的（「超出票券堂數，補扣時自動取消」、
--   舊匯入的「教室:…」、教練請假補登…），混進教練手寫的字之後兩邊都讀不乾淨。
--
-- ⚠ 為什麼是 jsonb 而不是 text：1V2 的課表有兩份（會員 A／會員 B，見 _tlSlot），
--   兩位的狀況本來就不一樣。鍵用 slot 字串：{"1":"…","2":"…"}。
--   非 1V2 的課只會用到 "1"。
--
-- ⚠ 既有的表不必重下 GRANT（2026/10/30 那條公告只管「新建立的 table」）；
--   新欄位自動沿用 bookings 既有的 grants 與 RLS policy。
--   RLS 也不用動：寫得進 bookings 的人本來就是能改這堂課的人。
--
-- ⚠ LEAN_DROP 不必加：dbGetAll 的精簡欄位是「學到的欄位扣掉 LEAN_DROP」，
--   新欄位自動被帶進來；而課表抽屜走的是單筆 dbGet（select *），一定拿得到。

alter table public.bookings
  add column if not exists training_note jsonb;

comment on column public.bookings.training_note is
  '教練寫的「今日備註」，一堂課一則；1V2 兩位各一則，鍵是 slot 字串（{"1":"…","2":"…"}）。動作本身的備註在 training_logs.note。';
