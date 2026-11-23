-- 測試用安裝腳本；正式庫尚未授權，正式發布需另備守門與指紋。
-- 僅保護員工職務／費率／勞健保異動；全域模板與已發布薪資快照另案處理。
create or replace function public.fn_payroll_rule_at(p_row jsonb,p_month text) returns jsonb
language plpgsql immutable set search_path to 'public','pg_temp' as $fn$
declare v_rules jsonb:=coalesce(p_row->'pay_rules','{}'::jsonb);v_rule jsonb;v_effective jsonb;
begin
 if v_rules='null'::jsonb then v_rules:='{}'::jsonb;end if;
 if jsonb_typeof(v_rules)<>'object' then raise exception 'PRH.BAD_RULES';end if;
 select value into v_rule from jsonb_each(v_rules) where key ~ '^\d{4}-(0[1-9]|1[0-2])$' and key<=p_month order by key desc limit 1;
 if v_rule is not null and jsonb_typeof(v_rule)<>'object' then raise exception 'PRH.BAD_RULES';end if;
 v_effective:=p_row||coalesce(v_rule,'{}'::jsonb);
 return (select jsonb_object_agg(k,coalesce(v_effective->k,'null'::jsonb)) from unnest(array['employment_type','need_duty','weekly_work_days','weekly_min_shift_days','base_salary','duty_hourly','pt_mode','pt_rate','pt_tiers','group_rate','pt_bonus_enabled','pt_bonus_mode','pt_bonus','custom_salary','is_manager','is_supervisor','supervisor_bonus','leader_members','leader_t1','leader_b1','leader_t2','leader_b2','insured_grade','insurance_identity','labor_insurance_status','health_insurance_status']) k);
end $fn$;
revoke all on function public.fn_payroll_rule_at(jsonb,text) from public,anon;
grant execute on function public.fn_payroll_rule_at(jsonb,text) to authenticated,service_role;

create or replace function public.fn_salary_history_guard() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $fn$
declare
 v_keys text[]:=array['employment_type','need_duty','weekly_work_days','weekly_min_shift_days','base_salary','duty_hourly','pt_mode','pt_rate','pt_tiers','group_rate','pt_bonus_enabled','pt_bonus_mode','pt_bonus','custom_salary','is_manager','is_supervisor','supervisor_bonus','leader_members','leader_t1','leader_b1','leader_t2','leader_b2','insured_grade','insurance_identity','labor_insurance_status','health_insurance_status'];
 v_old jsonb:=to_jsonb(old); v_new jsonb:=to_jsonb(new); v_rules jsonb; v_previous jsonb;v_requested jsonb;v_rule jsonb;
 v_current jsonb; v_changed boolean:=false;
 v_month text; v_first text; v_now text:=to_char(now() at time zone 'Asia/Taipei','YYYY-MM');
 v_req text[]:=array['employment_type','base_salary','pt_mode','pt_rate','group_rate','duty_hourly'];
 k text;
begin
 -- 維護 SQL／可信服務匯入保留既有作法；員工 JWT 的定義者 RPC 仍受保護。
 if current_user<>'authenticated' and coalesce(auth.role(),'') not in ('authenticated','anon') then return new;end if;
 if (v_old->'pay_rules') is not distinct from (v_new->'pay_rules') and not exists(select from unnest(v_keys) x where v_old->x is distinct from v_new->x) then return new;end if;
 v_rules:=coalesce(new.pay_rules,'{}'::jsonb);
 if jsonb_typeof(v_rules)<>'object' or (old.pay_rules is not null and jsonb_typeof(old.pay_rules)<>'object') then raise exception 'PRH.BAD_RULES';end if;
 if exists(select from jsonb_each(v_rules) where key !~ '^\d{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(value)<>'object') then raise exception 'PRH.BAD_RULES';end if;
 v_first:=greatest('2026-07',coalesce(left(old.hire_date::text,7),'2026-07'));
 for v_month in select to_char(d,'YYYY-MM') from generate_series((v_first||'-01')::date,(v_now||'-01')::date-interval '1 month',interval '1 month') d loop
   if old.resign_date is not null and v_month>left(old.resign_date::text,7) then continue;end if;
   select value into v_rule from jsonb_each(coalesce(old.pay_rules,'{}'::jsonb)) where key ~ '^\d{4}-(0[1-9]|1[0-2])$' and key<=v_month order by key desc limit 1;
   if v_rule is null or jsonb_typeof(v_rule)<>'object' then raise exception 'PRH.HISTORY_INCOMPLETE:%',v_month;end if;
   foreach k in array v_req loop
     if not(v_rule?k) or v_rule->k='null'::jsonb then raise exception 'PRH.HISTORY_INCOMPLETE:%:%',v_month,k;end if;
   end loop;
   v_previous:=public.fn_payroll_rule_at(v_old,v_month);
   -- 使用舊現值解讀請求快照，區分自動凍結與真的改寫歷史。
   v_requested:=public.fn_payroll_rule_at(v_old||jsonb_build_object('pay_rules',v_rules),v_month);
   if v_requested is distinct from v_previous then raise exception 'PRH.HISTORY_LOCKED:%',v_month;end if;
   v_rules:=jsonb_set(v_rules,array[v_month],v_previous,true);
 end loop;
 v_current:=public.fn_payroll_rule_at(v_new||jsonb_build_object('pay_rules',v_rules),v_now);
 foreach k in array v_keys loop
   if v_old->k is distinct from v_new->k then
     v_changed:=true;v_current:=jsonb_set(v_current,array[k],coalesce(v_new->k,'null'::jsonb),true);
   end if;
 end loop;
 if v_changed then v_rules:=jsonb_set(v_rules,array[v_now],v_current,true);end if;
 new.pay_rules:=v_rules;
 return new;
end $fn$;
revoke all on function public.fn_salary_history_guard() from public,anon;
drop trigger if exists trg_salary_history_guard on public.employees;
create trigger trg_salary_history_guard before update on public.employees for each row execute function public.fn_salary_history_guard();
