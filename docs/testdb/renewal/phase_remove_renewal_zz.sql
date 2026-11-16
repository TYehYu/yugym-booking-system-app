-- 移除續約承接並行驗證的測試專用函式（只測試庫）。續約卡位本體的移除用 docs/migrations/20261120_renewal_hold_slots_rollback.sql。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
drop function if exists public.zz_rn_adopt(text, text, text[], int, int);
notify pgrst, 'reload schema';
