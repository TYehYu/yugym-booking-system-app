-- 正式庫｜TKWIN｜部署後驗證（唯讀 SELECT；尚未執行）。全部結果以「預期」欄為準；任何一項不符＝依該階段回復檔處理。
select md5(prosrc)||':'||length(prosrc) as fp, proacl::text as acl, prosrc like '%tkwin_skip_booking%' as has_marker from pg_proc where pronamespace='public'::regnamespace and proname='fn_move_booking_ticket';
-- 預期：fp＝1f78f02623ce16484004b3cf4aec9934:13628；acl＝{postgres=X/postgres,authenticated=X/postgres}；has_marker＝true
