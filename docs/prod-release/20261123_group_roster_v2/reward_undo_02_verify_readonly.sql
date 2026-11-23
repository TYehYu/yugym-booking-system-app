-- reward_undo_02_verify_readonly.sql — 唯讀核對（只有 SELECT）。套用前：applied=false、handler_orig=true；套用後相反。
select (pg_control_system()).system_identifier::text system_identifier,
  to_regprocedure('public.fn_undo_checkin(text)') is not null as applied,
  position('checkin_revoked' in pg_get_functiondef('public.handle_checkin_reward(text)'::regprocedure)) > 0 as handler_patched,
  md5(replace(pg_get_functiondef('public.handle_checkin_reward(text)'::regprocedure), E'\r', '')) as handler_md5_no_cr,
  (select proacl::text from pg_proc where oid='public.handle_checkin_reward(text)'::regprocedure) as handler_acl,
  (select proacl::text from pg_proc where proname='fn_undo_checkin' and pronamespace='public'::regnamespace) as undo_acl;
