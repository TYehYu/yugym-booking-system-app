-- 移除新票轉正整理並行驗證的測試專用函式（只測試庫）。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
drop function if exists public.zz_hs_call(text, text, jsonb, int, int, int);
drop function if exists public.zz_hs_fingerprint();
notify pgrst, 'reload schema';
