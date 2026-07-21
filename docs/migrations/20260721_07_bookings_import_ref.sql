-- ============================================================
-- 20260721_07：舊系統匯入冪等鍵（A5 匯入計畫）
-- ------------------------------------------------------------
-- bookings 增加 import_ref（舊系統預約編號，如 IMPB-B2026...）＋部分唯一索引。
-- 用途：8 月會員上線前會定期匯入舊系統匯出檔，匯入以 import_ref 去重、可重複執行。
-- 匯入資料一律 created_by='import-20260721'（含日期批次），回退：
--   delete from bookings where import_ref like 'IMP%';
--
-- 套用狀態：測試庫已於 2026-07-21 套用；正式庫由使用者於 SQL Editor 執行。
-- ============================================================
alter table bookings add column if not exists import_ref text;
create unique index if not exists bookings_import_ref_uq on bookings(import_ref) where import_ref is not null;
