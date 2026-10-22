/* bookings.cancel_reason（2026-10-23，已套用）

   臨時停課（_cdayRun）在取消前會寫一句「天災停課（日期）」留查，
   但 bookings **根本沒有這一欄** —— cancel_reason 是 ticket_grant_requests 的欄位，
   當初抄錯表。於是每一圈都在 dbPut 丟出 PGRST204，連 cancelBooking 都沒走到：
   使用者看到「已停課 0 堂（34 堂失敗，請重按一次）」，一堂都沒停掉。

   ⚠ 既有的表，不動任何 grants（2026/10/30 的公告只影響之後新建的表）。
   ⚠ 前端已把它加進 LEAN_DROP：列表讀取不搬這一欄，
     單筆 dbGet 與 dbPut 照樣拿得到／寫得進去（dbPut 會先補回被精簡掉的欄位）。 */
alter table public.bookings add column if not exists cancel_reason text;

comment on column public.bookings.cancel_reason is
  '取消原因（目前只有臨時停課會寫，例：天災停課（2026-10-23））';
