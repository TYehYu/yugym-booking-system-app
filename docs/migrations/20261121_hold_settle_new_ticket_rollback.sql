-- 回滾：新票轉正整理（20261121_hold_settle_new_ticket.sql）。只刪這一支函式；不動資料。
-- 注意：前端已發布這一版後再回滾，轉正與新票發放的整理會失敗（顯示錯誤、沒有任何資料變動）；請先退前端（git revert）再回滾資料庫。
begin;
drop function if exists public.fn_hold_settle_new_ticket(text, boolean, text, jsonb);
commit;
