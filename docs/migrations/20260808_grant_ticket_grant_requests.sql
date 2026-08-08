-- 2026-08-08 使用者回報：「櫃檯帳號在切換導覽列的時候都會跳權限不足的提示」「管理員帳號也是」
--
-- 成因：ticket_grant_requests 是用 create table 建的，只有 RLS policy，卻沒有 grant ——
-- policy 是「這一列給不給看」，grant 是「這個角色能不能碰這張表」，
-- 兩個都要。authenticated 沒有 SELECT，於是每次換頁的待審核提示都被擋成 42501（權限不足）。
--
-- 其他表沒踩到，是因為它們是更早透過 Supabase 介面／既有 migration 建的，當時就帶了 grant。
grant select, insert, update, delete on public.ticket_grant_requests to authenticated;
grant select, insert, update, delete on public.ticket_grant_requests to service_role;
