-- 還原 01_testdb_parity_prep_b.sql（只對測試庫）。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
drop function if exists public.fn_set_employment_type(text, text);
drop function if exists public.fn_table_sigs();
drop trigger if exists trg_change_log on public.attendance;
drop trigger if exists trg_change_log on public.employees;
drop trigger if exists trg_change_log on public.punch_requests;
drop trigger if exists trg_change_log on public.salary_history;
drop function if exists public.fn_log_change();
drop table if exists public.change_log;
notify pgrst, 'reload schema';
