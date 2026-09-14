-- 2026-09-14 members 補統編／抬頭：開統編的客人不必每次收款重打
-- 使用者：「再來要開統編的客人要怎麼處理」→ 三選一挑「存進會員資料、自動帶入」
--
-- 為什麼是會員欄位而不是每次現問：開統編的多半是固定那幾家公司，
-- 統編打錯開出去要作廢重開（客人已經走了），存起來自動帶入同時省事又少錯。
--
-- ⚠ 命名沿用既有的 invoice_carrier（0914 之前就有、135 位會員已填），
--   發票相關的會員欄位一律 invoice_* 前綴，別自創別的寫法。
--
-- 搭配的規則（寫在 index.html，這裡只記關聯）：
--   ・收款畫面若該會員有 invoice_ubn → 自動切到「打統編」那格並帶入統編＋抬頭
--   ・統編＋綠界載具＝Print=0（不用列印紙本），這條互斥規則沒變
--   ・invoice_carrier（手機條碼）與 email 是通知管道，統編是買受人身份，三者不互斥

alter table public.members
  add column if not exists invoice_ubn   text,
  add column if not exists invoice_title text;
