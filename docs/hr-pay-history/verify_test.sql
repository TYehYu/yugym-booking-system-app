-- 須由外層 BEGIN + 安裝 2a/2b + install_test.sql 後執行；最後刻意拋錯回滾全程。
do $$begin if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'WRONG_TEST_CLUSTER';end if;
if exists(select from public.employees where id like 'CC-PH-%') then raise exception 'FIXTURE_COLLISION';end if;end $$;
create temp table prh_result(label text primary key,ok boolean);
grant select,insert on prh_result to authenticated;
create function pg_temp.prh_expect(p_label text,p_ok boolean) returns void language plpgsql as $$begin if p_ok is distinct from true then raise exception 'FAIL:%',p_label;end if;insert into prh_result values(p_label,true);end $$;
create function pg_temp.prh_reject(p_label text,p_sql text,p_prefix text) returns void language plpgsql as $$
begin
 begin execute p_sql;raise exception 'EXPECTED_REJECTION_NOT_RAISED';
 exception when others then if position(p_prefix in sqlerrm)=0 then raise exception 'FAIL:%:%',p_label,sqlerrm;end if;end;
 insert into prh_result values(p_label,true);
end $$;
insert into auth.users(id) values('bbbbbbbb-1111-4111-8111-000000000091');
insert into public.employees(id,name,role,status,auth_id,employment_type)values('CC-PH-ADMIN','假管理員','admin','active','bbbbbbbb-1111-4111-8111-000000000091','full_time');
insert into public.employees(id,name,role,status,employment_type,hire_date,base_salary,pt_mode,pt_rate,group_rate,duty_hourly,pay_rules)
select 'CC-PH-'||n,'假員工'||n,'coach','active','full_time','2026-07-01',29500,'flat',600,200,0,
 jsonb_build_object('2026-07',jsonb_build_object('employment_type','full_time','base_salary',29500,'pt_mode','flat','pt_rate',600,'group_rate',200,'duty_hourly',0,'insured_grade',29500,'labor_insurance_status','enrolled','health_insurance_status','enrolled'))
from generate_series(1,9)n;
update public.employees set pay_rules='{"2026-07":{"insured_grade":29500}}'::jsonb where id='CC-PH-3';
update public.employees set pay_rules='{}'::jsonb where id='CC-PH-4';
update public.employees set hire_date=date_trunc('month',now() at time zone 'Asia/Taipei')::date,pay_rules='{}'::jsonb where id='CC-PH-5';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"bbbbbbbb-1111-4111-8111-000000000091"}',true);
select set_config('request.jwt.claim.sub','bbbbbbbb-1111-4111-8111-000000000091',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
-- 直接改當月現值，也會自動建立正確當月版本並保住以前月份。
update public.employees set employment_type='contractor',base_salary=0 where id='CC-PH-1';
select pg_temp.prh_expect('直接寫入：七月正職底薪未變',(select pay_rules->'2026-07'->>'employment_type'='full_time' and (pay_rules->'2026-07'->>'base_salary')::numeric=29500 from public.employees where id='CC-PH-1'));
select pg_temp.prh_expect('直接寫入：十月也保留',(select pay_rules->'2026-10'->>'employment_type'='full_time' and (pay_rules->'2026-10'->>'base_salary')::numeric=29500 from public.employees where id='CC-PH-1'));
select pg_temp.prh_expect('直接寫入：當月版本為合作',(select pay_rules->to_char(now() at time zone 'Asia/Taipei','YYYY-MM')->>'employment_type'='contractor' from public.employees where id='CC-PH-1'));
-- 真正呼叫既有 SECURITY DEFINER 職務 RPC，確定不是只有 authenticated 直寫會被守門。
select pg_temp.prh_expect('主管職務 RPC 成功',(public.fn_set_employment_type('CC-PH-2','contractor')->>'ok')::boolean);
select pg_temp.prh_expect('職務 RPC：七月仍正職',(select pay_rules->'2026-07'->>'employment_type'='full_time' and (pay_rules->'2026-07'->>'base_salary')::numeric=29500 from public.employees where id='CC-PH-2'));
select pg_temp.prh_expect('職務 RPC：當月合作',(select pay_rules->to_char(now() at time zone 'Asia/Taipei','YYYY-MM')->>'employment_type'='contractor' from public.employees where id='CC-PH-2'));
select pg_temp.prh_reject('部分歷史：拒絕改底薪',$q$update public.employees set base_salary=1 where id='CC-PH-3'$q$,'PRH.HISTORY_INCOMPLETE');
select pg_temp.prh_expect('部分歷史：拒絕後現值不變',(select base_salary=29500 and pay_rules='{"2026-07":{"insured_grade":29500}}'::jsonb from public.employees where id='CC-PH-3'));
select pg_temp.prh_reject('完全缺歷史：拒絕改底薪',$q$update public.employees set base_salary=1 where id='CC-PH-4'$q$,'PRH.HISTORY_INCOMPLETE');
select pg_temp.prh_expect('職務 RPC 缺歷史同樣拒絕',public.fn_set_employment_type('CC-PH-4','contractor')->>'error_code' like 'PRH.HISTORY_INCOMPLETE%');
select pg_temp.prh_expect('職務 RPC 拒絕後沒有半套',(select employment_type::text='full_time' and base_salary=29500 and pay_rules='{}'::jsonb from public.employees where id='CC-PH-4'));
update public.employees set name_en='Metadata edit' where id='CC-PH-4';
select pg_temp.prh_expect('一般資料修改不被歷史缺漏卡住',(select name_en='Metadata edit' and pay_rules='{}'::jsonb from public.employees where id='CC-PH-4'));
update public.employees set base_salary=31000 where id='CC-PH-5';
select pg_temp.prh_expect('本月新到職者可設定薪資',(select base_salary=31000 and (pay_rules->to_char(now() at time zone 'Asia/Taipei','YYYY-MM')->>'base_salary')::numeric=31000 from public.employees where id='CC-PH-5'));
select pg_temp.prh_reject('故意改舊月份被拒絕',$q$update public.employees set pay_rules=jsonb_set(pay_rules,'{2026-07,base_salary}','1') where id='CC-PH-6'$q$,'PRH.HISTORY_LOCKED');
select pg_temp.prh_reject('壞掉的規則陣列被拒絕',$q$update public.employees set pay_rules='[]'::jsonb where id='CC-PH-6'$q$,'PRH.BAD_RULES');
select pg_temp.prh_reject('壞掉的未來月份內容被拒絕',$q$update public.employees set pay_rules=pay_rules||'{"2026-12":[]}'::jsonb where id='CC-PH-6'$q$,'PRH.BAD_RULES');
update public.employees set pay_rules=pay_rules||jsonb_build_object(to_char((now() at time zone 'Asia/Taipei')+interval '1 month','YYYY-MM'),(pay_rules->'2026-07')||'{"base_salary":35000}'::jsonb) where id='CC-PH-7';
select pg_temp.prh_expect('預排下月不提前改本月現值',(select base_salary=29500 and (public.fn_payroll_rule_at(to_jsonb(e),to_char(now() at time zone 'Asia/Taipei','YYYY-MM'))->>'base_salary')::numeric=29500 from public.employees e where id='CC-PH-7'));
update public.employees set insured_grade=null,labor_insurance_status='withdrawn',health_insurance_status='withdrawn' where id='CC-PH-8';
select pg_temp.prh_expect('退保保留舊月份加保',(select pay_rules->'2026-07'->>'labor_insurance_status'='enrolled' and (pay_rules->'2026-07'->>'insured_grade')::numeric=29500 from public.employees where id='CC-PH-8'));
select pg_temp.prh_expect('退保正確套當月版本',(select pay_rules->to_char(now() at time zone 'Asia/Taipei','YYYY-MM')->>'labor_insurance_status'='withdrawn' from public.employees where id='CC-PH-8'));
reset role;
do $$ begin raise exception 'PRH_RESULT>>%',(select jsonb_agg(to_jsonb(r) order by label) from prh_result r);end $$;
