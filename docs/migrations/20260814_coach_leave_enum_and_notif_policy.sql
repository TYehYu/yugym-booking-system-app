-- 2026-08-14（已於當日套用正式庫）
-- 使用者回報兩件：
-- ①「教練手機預約課程會顯示權限不足 但是可預約」——
--    教練預約走 RPC（fn_create_booking，security definer）預約與扣課都成功，
--    但最後前端要寫「預約成立」通知給會員時，notifications 只有 is_staff_desk 的
--    ALL 政策（notif_all_staff），教練 INSERT 被 RLS 擋 → 跳「權限不足（通知）」。
--    症狀：錯誤訊息嚇人、且會員實際上收不到預約成立通知。補一條任何在職員工可寫的 INSERT 政策。
-- ②「教練請假的按鈕 櫃檯反應無法使用」——
--    bkCoachLeave 要把狀態寫成 coach_leave，但 booking_status enum 缺這個值
--    （20260721_05 當時漏套正式庫；全庫 0 筆 coach_leave＝此功能在正式站從未成功過，
--    程式註解甚至寫明「正式庫若尚未套 20260721_05 狀態寫入會先失敗、乾淨中止」）。
alter type booking_status add value if not exists 'coach_leave';
create policy nt_staff_insert on public.notifications for insert to public
  with check ((select is_any_staff()));
