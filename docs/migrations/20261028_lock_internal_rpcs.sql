-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-28　把「內部用」的 SECURITY DEFINER 函式從 API 收回來
-- ════════════════════════════════════════════════════════════════════════
-- 起因：使用者「順便整理一下系統」，跑 Supabase advisors 掃出來的。
--
-- 問題：下面這幾支是 SECURITY DEFINER（執行時變成 postgres、繞過 RLS），
--       但它們**沒有任何身分檢查**，而且靠 PUBLIC 的預設 EXECUTE 開放出去。
--       anon key 印在 config.js、隨 GitHub Pages 公開 ⇒
--       任何人都能直接打 /rest/v1/rpc/benefit_refund 之類的端點改票券堂數，
--       完全不用登入。
--
-- 為什麼收回來是安全的：
--   ① 前端一支都沒呼叫過（查過 index.html 全部 27 支 .rpc() 呼叫，
--      只有 fn_* 那一層；這幾支只出現在註解裡）。
--   ② 它們全部由 postgres 擁有，而呼叫它們的包裝函式
--      （fn_create_booking／fn_cancel_booking／fn_checkin_booking／
--        fn_member_self_* …）也是 postgres 擁有的 SECURITY DEFINER，
--      執行時的有效身分就是 postgres＝擁有者，**擁有者永遠有 EXECUTE**，
--      不受 GRANT／REVOKE 影響。所以內部呼叫完全不變。
--   ③ service_role 另外明確 GRANT（它原本是靠 PUBLIC 來的，
--      只 REVOKE 不 GRANT 會把 Edge Function 的路一起切斷）。
--
-- ⚠ 日後新增「只給別的函式呼叫」的 helper，記得照這裡一起收 ——
--   Postgres 的預設是「建好就對 PUBLIC 開放 EXECUTE」，不收就是開著的。
-- ⚠ 觸發器函式（trigger／event_trigger）直接呼叫本來就會報錯，
--   但不該出現在 API 清單上，一併收掉。
-- ════════════════════════════════════════════════════════════════════════

-- ── ① 真正有風險的六支：沒有身分檢查、會動到票券與預約 ──────────────────
revoke execute on function public.benefit_consume(text, text, integer, text)        from public, anon, authenticated;
revoke execute on function public.benefit_consume_ticket(text, text, integer, text) from public, anon, authenticated;
revoke execute on function public.benefit_refund(text, integer, text)               from public, anon, authenticated;
revoke execute on function public.space_check(text, text, date, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.desk_alert(text, text, text, text)                from public, anon, authenticated;
revoke execute on function public.handle_checkin_reward(text)                       from public, anon, authenticated;

grant execute on function public.benefit_consume(text, text, integer, text)         to service_role;
grant execute on function public.benefit_consume_ticket(text, text, integer, text)  to service_role;
grant execute on function public.benefit_refund(text, integer, text)                to service_role;
grant execute on function public.space_check(text, text, date, text, integer, text, text) to service_role;
grant execute on function public.desk_alert(text, text, text, text)                 to service_role;
grant execute on function public.handle_checkin_reward(text)                        to service_role;

-- ── ② 觸發器函式：直接呼叫會報錯，但不該列在 API 上 ────────────────────
revoke execute on function public.trg_bookings_touch()        from public, anon, authenticated;
revoke execute on function public.trg_bookings_cancelled_by() from public, anon, authenticated;
revoke execute on function public.fn_log_change()             from public, anon, authenticated;
revoke execute on function public.fn_employees_guard()        from public, anon, authenticated;
revoke execute on function public.fn_members_guard()          from public, anon, authenticated;
revoke execute on function public.fn_bookings_group_guard()   from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()           from public, anon, authenticated;

-- ⚠ trg_bookings_touch 另外補 search_path（advisor 的 function_search_path_mutable）。
--   SECURITY INVOKER 的觸發器函式風險低，但釘死 search_path 不花錢。
alter function public.trg_bookings_touch() set search_path = public, pg_temp;

-- ── ③ 清掉用完的暫存表與沒用過的索引 ──────────────────────────────────
-- _bf_alloc        0 筆，表註解自己寫著「分析用，套用後可刪」（2026-07-31）
-- import_ticket_check 326 筆，0725–0726 匯入對帳的工作表；那條線 0820 已結案。
--   內容已經存進 repo：docs/archive/import_ticket_check_20261028.json
-- ⚠ 兩張回滾表**刻意留著**：_bf_undo（0801 預約↔票券回填 36 筆）、
--   _tkfix1028_undo（1028 劉筱媛／胡霆易改綁 8 筆）。要還原就靠它們。
drop table if exists public._bf_alloc;
drop table if exists public.import_ticket_check;

-- 自從 2026-06-14 統計歸零以來一次都沒被用到；表都很小，seq scan 本來就夠快。
-- 要還原就是下面兩行反過來建回去。
drop index if exists public.idx_punch_requests_emp;      -- create index idx_punch_requests_emp on public.punch_requests(emp_id);
drop index if exists public.ix_ticket_types_category;    -- create index ix_ticket_types_category on public.ticket_types(category_id);
