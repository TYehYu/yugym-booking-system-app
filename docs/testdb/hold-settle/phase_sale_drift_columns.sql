-- 測試庫 kucvxpjatptfckhlxptj 專用（正式庫禁用）：為了讓「實際發票入口」畫面能走完，
-- 暫時補上「正式庫有、測試庫沒有」的欄位（皆 nullable、無預設）。驗完用下方 ROLLBACK 整組 drop。
-- 2026-11-17 查證：正式庫 information_schema 與測試庫比對得出此清單（只含發票流程會寫的四張表）。
-- ===== APPLY =====
alter table public.member_tickets
  add column if not exists sale_kind text, add column if not exists sold_by text, add column if not exists family_user text,
  add column if not exists no_refund boolean, add column if not exists manual_uses jsonb, add column if not exists void_mode text,
  add column if not exists partners jsonb, add column if not exists partner_id text,
  add column if not exists renew_noted_at timestamptz, add column if not exists renew_noted_by text, add column if not exists renew_status text,
  add column if not exists extended_at timestamptz, add column if not exists extended_by text, add column if not exists extended_from date;
alter table public.contracts
  add column if not exists fill_snapshot text, add column if not exists installment_signs jsonb,
  add column if not exists pending_sign_at timestamptz, add column if not exists pending_sign_n integer;
alter table public.ticket_grant_requests
  add column if not exists filled_by text, add column if not exists filled_at timestamptz;
alter table public.purchases
  add column if not exists credit_used numeric, add column if not exists invoice_number text, add column if not exists pay_split jsonb;
-- ===== ROLLBACK =====
-- alter table public.member_tickets drop column if exists sale_kind, drop column if exists sold_by, drop column if exists family_user,
--   drop column if exists no_refund, drop column if exists manual_uses, drop column if exists void_mode, drop column if exists partners,
--   drop column if exists partner_id, drop column if exists renew_noted_at, drop column if exists renew_noted_by, drop column if exists renew_status,
--   drop column if exists extended_at, drop column if exists extended_by, drop column if exists extended_from;
-- alter table public.contracts drop column if exists fill_snapshot, drop column if exists installment_signs, drop column if exists pending_sign_at, drop column if exists pending_sign_n;
-- alter table public.ticket_grant_requests drop column if exists filled_by, drop column if exists filled_at;
-- alter table public.purchases drop column if exists credit_used, drop column if exists invoice_number, drop column if exists pay_split;
