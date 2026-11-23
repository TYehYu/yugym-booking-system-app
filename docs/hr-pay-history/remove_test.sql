-- 僅限測試演練回復；正式環境移除需另行審查。
drop trigger if exists trg_salary_history_guard on public.employees;
drop function if exists public.fn_salary_history_guard();
drop function if exists public.fn_payroll_rule_at(jsonb,text);
