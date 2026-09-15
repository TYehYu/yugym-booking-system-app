-- 2026-09-15 部分退費：發票折讓（銷貨退回／折讓證明單）
--
-- 為什麼是折讓不是作廢：
--   作廢（Invalid）只適用於「發票開錯、且尚未申報」。課程上了一半要退費時，
--   已使用的那部分是真實的銷售，發票不能整張消失 —— 法規要開的是「折讓」，
--   把退掉的那一段從原發票金額中扣除，原發票仍然有效。
--   （財政部電子發票實施作業要點；折讓單須於開立次日起 2 日內〔買方為消費者〕
--     或 7 日內〔買方為營業人〕上傳，逾期罰 1,500–15,000 元。）
--
-- 綠界允許同一張發票**分多次折讓**，累計金額不得超過原發票金額，
-- 所以 allowance_amt 設計成「累計已折讓金額」而不是單次金額。
alter table public.invoices
  add column if not exists allowance_no   text,          -- 綠界回傳的 IA_Allow_No（折讓單號）
  add column if not exists allowance_amt  integer default 0, -- 累計已折讓金額
  add column if not exists allowance_at   timestamptz,   -- 最後一次折讓成功的時間
  add column if not exists allowance_raw  jsonb;         -- 綠界原始回應（對帳／申訴用）

comment on column public.invoices.allowance_amt is '累計已折讓金額；原發票金額減去這個數字＝目前仍有效的金額';
