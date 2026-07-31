/* 2026-07-31 使用者回報「新增固定支出跳權限不足」——
   建表時只加了 RLS policy，忘了 table 層的 GRANT。PostgREST 是以 authenticated 角色連線，
   沒有 GRANT 的話 policy 再怎麼放行也會被擋在更前面（42501）。
   實際權限仍由 policy expenses_admin（is_admin()）把關。

   🔑 教訓：這個專案的新表一律要「RLS policy ＋ table GRANT」兩件一起做。 */
grant select, insert, update, delete on table public.expenses to authenticated;
