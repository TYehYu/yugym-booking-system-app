-- ============================================================
-- 20260721_04：場地租借＋營收發票拆分（商業規則 A3／規則三）
-- ------------------------------------------------------------
-- ① bookings.category 為 enum ticket_category，補「場租」值（場地租借預約）。
-- ② purchases 增加 invoice_type（none/cloud/paper；null=舊資料=視為無發票）——
--    場租/票券重啟等收款的發票記載；票券本身沿用既有 member_tickets.invoice_status。
--
-- 套用狀態：測試庫已於 2026-07-21 套用。
-- ⚠️ 正式庫必須「先套本檔、再推對應前端」（前端會寫入 category='場租' 與 invoice_type）。
-- 回退：invoice_type 可 drop column；enum 值無法移除（Postgres 限制），不使用即無影響。
-- ============================================================
alter type ticket_category add value if not exists '場租';
alter table purchases add column if not exists invoice_type text;
