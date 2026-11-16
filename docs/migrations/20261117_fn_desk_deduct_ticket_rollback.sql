-- 階段 08 回滾（⚠ 先看 docs/prod-release/P0E_ONE_SHOT_AUTHORIZATION_SCOPE_DRAFT.md §D：前端已發布後不要直接執行，
-- 仍開著新頁面的人會呼叫這些函式）。表 ticket_deduct_ops、booking_op_rev 預設保留（只是操作登記；要刪另行決定）。
drop function if exists public.fn_desk_cancel_booking(text, text);
drop function if exists public.fn_desk_deduct_ticket(text, text, text, text);
drop function if exists public.fn_desk_op_begin(text, text, text, text);
drop function if exists public.fn_desk_booking_rev(text);
drop function if exists public.fn_booking_rev_of(text);
drop trigger if exists trg_booking_op_rev on public.bookings;
drop trigger if exists trg_booking_op_rev_insdel on public.bookings;
-- 清掉操作登記（資料只是「登記過哪些操作」；已套用的扣課帳在 ticket_logs，不受影響）。表本身保留，重裝時 create table if not exists 會沿用。
delete from public.ticket_deduct_ops;
drop function if exists public.trg_booking_op_rev();
