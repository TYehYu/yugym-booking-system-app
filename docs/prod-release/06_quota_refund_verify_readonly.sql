-- 正式庫｜額度防護＋原子退票｜部署後驗證（唯讀 SELECT；尚未執行）。全部結果以「預期」欄為準；任何一項不符＝依該階段回復檔處理。
select (select count(*) from pg_trigger where not tgisinternal and tgenabled='O' and tgname='trg_tk_quota_guard' and tgrelid='public.member_tickets'::regclass) as quota_trg_expected_1,
       (select proacl::text from pg_proc where pronamespace='public'::regnamespace and proname='fn_refund_ticket') as refund_acl_expected_postgres_authenticated,
       (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('trg_tk_quota_guard','fn_tk_refund_once') and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))) as internal_exposed_expected_0;
-- 已超額的分期票（預期 0；若 >0 代表歷史超額，需另案處理，防護只攔新增的超額）：
select id, sessions_total, sessions_remaining, unlocked_sessions from member_tickets where unlocked_sessions is not null and unlocked_sessions < sessions_total and status::text <> 'refunded' and (sessions_total - sessions_remaining) > unlocked_sessions;
