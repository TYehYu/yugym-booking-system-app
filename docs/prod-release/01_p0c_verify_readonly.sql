-- 正式庫｜P0-C｜部署後驗證（唯讀 SELECT；尚未執行）。全部結果以「預期」欄為準；任何一項不符＝依該階段回復檔處理。
select (select system_identifier::text from pg_control_system()) = '7637215626725903220' as sysid_is_prod;
select p.proname, md5(p.prosrc)||':'||length(p.prosrc) as fp, p.proacl::text as acl,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_x, has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_x, has_function_privilege('service_role',p.oid,'EXECUTE') as svc_x
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_move_booking_ticket';
-- 預期：1 列；fp＝（階段 3 之前）411549f649f4858215e6e03429bb7ce7:13276、（階段 3 之後）1f78f02623ce16484004b3cf4aec9934:13628；acl＝{postgres=X/postgres,authenticated=X/postgres}；anon_x／svc_x＝false，auth_x＝true
