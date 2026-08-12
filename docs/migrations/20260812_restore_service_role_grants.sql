-- 2026-08-12（已於當日套用正式庫，使用者核准後執行）
-- 使用者回報「明天 10:00 邱怡頻、15:00 徐彩蓮應通知 Sandy 收費但沒收到；
-- 會員上課提醒也沒有堂數內容」追查結果：
--
-- 根因：public schema 30 張表（member_tickets、purchases、notifications、ticket_logs…）
-- 的 service_role 權限只剩 REFERENCES/TRIGGER/TRUNCATE（何時被 revoke 不明）。
-- Edge Function（line-push-daily 等，用 SERVICE_ROLE_KEY）查 member_tickets
-- → permission denied → 「第 n/N 堂＋教練收款提醒」整套無聲消失；
-- 連寫 notifications 的失敗通知都被 catch 吞掉，完全無跡可循。
-- members/employees/bookings(僅剩SELECT)/invoices 倖存，所以會員基本提醒一直正常、沒人發現。
--
-- 配套：line-push-daily v16 起，票券判定的查詢失敗會寫 push_detect_fail 櫃檯通知
-- ＋回傳 detect_errors；並新增 {debug:true, target, win} 試算模式（不發訊）供排查。
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
-- 之後新建的表自動帶上，不再重演
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
