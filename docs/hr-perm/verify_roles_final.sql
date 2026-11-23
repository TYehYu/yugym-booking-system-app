-- 人事權限修補（2a 相容／2b 收權）最終版：各角色實測。只跑測試庫 kucvxpjatptfckhlxptj。
-- 這份建立「測試專用」函式 zz_hr_verify(phase)（驗收結束後用 drop function 移除；清單見 TESTDB_STATE.md）。
--   select public.zz_hr_verify('2a');   -- 2a 相容階段：新物件可用＋舊前端行為仍可用
--   select public.zz_hr_verify('2b');   -- 2b 收權階段：全部規則
-- 做法：同一交易內建假資料 → 對每個角色 set local role authenticated＋偽造該員工的 JWT sub → 實際讀／寫／RPC → 記錄 →
--       raise exception 把結果帶出來並強制回滾（不留任何資料；結果會以「錯誤訊息」形式回傳，這是刻意的）。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
create or replace function public.zz_hr_verify(p_phase text) returns void language plpgsql as $zz$
declare
  res jsonb := '[]'::jsonb; t record; pname text; v_uid uuid; v_id text; n int; o text; extra jsonb;
  hm text := to_char(now() at time zone 'Asia/Taipei','HH24:MI');
  hm3 text := to_char((now() at time zone 'Asia/Taipei') - interval '3 minutes','HH24:MI');
  hm30 text := to_char((now() at time zone 'Asia/Taipei') - interval '30 minutes','HH24:MI');
  today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  if p_phase not in ('2a','2b') then raise exception 'phase 只能是 2a 或 2b'; end if;
  insert into auth.users(id) values ('aaaaaaaa-0000-4000-8000-000000000001'),('aaaaaaaa-0000-4000-8000-000000000002'),('aaaaaaaa-0000-4000-8000-000000000003'),('aaaaaaaa-0000-4000-8000-000000000004'),('aaaaaaaa-0000-4000-8000-000000000005');
  insert into employees(id,name,role,status,auth_id,is_manager) values
    ('TST-MGR1','假主管甲','coach','active','aaaaaaaa-0000-4000-8000-000000000001',true),
    ('TST-MGR2','假主管乙','coach','active','aaaaaaaa-0000-4000-8000-000000000002',true),
    ('TST-HR1','假薪資人員','front_desk','active','aaaaaaaa-0000-4000-8000-000000000003',false),
    ('TST-HR2','假投保人員','front_desk','active','aaaaaaaa-0000-4000-8000-000000000004',false);
  update employees set base_salary=50000, id_number='A123456789', bank_account='012-345-6789', insured_grade=11, email='x@test', hire_date='2020-01-01' where id in ('e_c2','e_coach','e_c3');
  update employees set phone='0911000222' where id='e_c2';
  insert into salary_history(id,emp_id,ym,net) values ('TST-SH-1','e_coach','2026-10',50000),('TST-SH-2','e_c2','2026-10',61000);
  insert into punch_requests(id,emp_id,emp_name,date,clock_in,clock_out,reason,status) values
    ('TST-PR-C','e_coach','教練C','2026-11-05','09:00',null,'t','pending'),
    ('TST-PR-A2','e_c2','教練2','2026-11-06','09:00',null,'t','pending'),
    ('TST-PR-L1','e_c2','教練2','2026-11-07','09:00',null,'t','pending'),
    ('TST-PR-LC','e_coach','教練C','2026-11-08','09:00',null,'t','pending'),
    ('TST-PR-D1','e_c2','教練2','2026-11-10','09:00','18:00','t','pending'),
    ('TST-PR-D2','e_c2','教練2','2026-11-10','09:00','18:00','t','pending'),
    ('TST-PR-D3','e_c2','教練2','2026-11-10','09:00','18:00','t','pending'),
    ('TST-PR-D4','e_c2','教練2','2026-11-10','09:00','18:00','t','pending'),
    ('TST-PR-D5','e_c2','教練2','2026-11-11','09:30',null,'t','pending'),
    ('TST-PR-D6','e_c2','教練2','2026-11-12','09:00',null,'t','pending'),
    ('TST-PR-C2','e_coach','教練C','2026-11-09','09:00',null,'t','pending'),
    ('TST-PR-M1','TST-MGR1','假主管甲','2026-11-09','09:00',null,'t','pending'),
    ('TST-PR-AD','e_admin','管理員A','2026-11-09','09:00',null,'t','pending'),
    ('TST-PR-AD2','e_c3','教練3','2026-11-09','09:00',null,'t','pending');
  insert into attendance(id,emp_id,emp_name,date,clock_in,clock_out,work_hours) values
    ('TST-AT-1','e_coach','教練C',today,'09:00',null,null),
    ('TST-AT-2','e_coach','教練C',today-1,'09:00','18:00',9),
    ('TST-AT-0','e_c2','教練2','2026-11-11',null,'18:00',null),
    ('TST-AT-HR1','TST-HR1','假薪資人員',today,'08:00',null,null),
    ('TST-AT-HR2','TST-HR2','假投保人員',today,'07:00',hm3,0.5),
    ('TST-AT-M2','TST-MGR2','假主管乙',today,'07:00',hm30,0.5);
  execute $m$insert into manager_scope(manager_id,employee_id) values ('TST-MGR1','e_c2'),('TST-MGR2','e_c3')$m$;
  execute $m$insert into hr_grants(employee_id,duty) values ('TST-HR1','pay_view'),('TST-HR2','insure')$m$;

  for t in select * from (values
    -- ===== 2a、2b 都要成立：新物件 =====
    ('2a,2b',array['admin','desk','coach','mgr1','hr1','member'],'q','N1 教練名單 employees_public 列數（員工 10、非員工 0）',$s$select id,name,role from employees_public$s$),
    ('2a,2b',array['coach','desk'],'q','N2 教練名單：教練欄位（排班／行事曆用，應 6）',$s$select id,name,role,job_title,can_teach,need_punch from employees_public where role='coach'$s$),
    ('2a,2b',array['desk','coach','mgr1'],'q','N3 名單帶電話的列數（櫃檯、店長 1，一般教練 0）',$s$select id from employees_public where phone is not null$s$),
    ('2a,2b',array['desk'],'q','N4 名單外露敏感欄數（應 0）',$s$select 1 from information_schema.columns where table_schema='public' and table_name='employees_public' and column_name in ('base_salary','pay_rate','pt_rate','group_rate','duty_hourly','pay_rules','id_number','id_no','bank_account','insured_grade','insured_unit','labor_insurance_status','email','birthday','birth_date','hire_date','permanent_date','invite_token','line_user_id','line_bind_token','address','emergency_phone','note')$s$),
    ('2a,2b',array['mgr1','mgr2','desk'],'q','N5 主管所管人員到職日／年資（主管各 1、櫃檯 0）',$s$select id,hire_date from employees_manager_scope$s$),
    ('2a,2b',array['hr1','hr2','desk','coach','admin'],'q','PV1 employees_pay 列數（pay_view 10、管理員過渡期 10、其餘 0）',$s$select id from employees_pay$s$),
    ('2a,2b',array['hr1','hr2','desk','admin'],'q','PV2 employees_insure 列數（insure 10、管理員過渡期 10、其餘 0）',$s$select id from employees_insure$s$),
    ('2a,2b',array['hr1'],'q','PV3 employees_pay 外露證件／銀行／電話／Email／投保單位欄數（應 0）',$s$select 1 from information_schema.columns where table_schema='public' and table_name='employees_pay' and column_name in ('id_number','id_no','bank_account','phone','email','address','insured_unit','insured_enroll_date','invite_token','emergency_phone')$s$),
    ('2a,2b',array['hr1'],'q','PV4 算薪必要欄位齊全（應 11）',$s$select 1 from information_schema.columns where table_schema='public' and table_name='employees_pay' and column_name in ('base_salary','pt_rate','group_rate','duty_hourly','pt_mode','pt_tiers','pay_rules','custom_salary','hire_date','insured_grade','insurance_identity')$s$),
    ('2a,2b',array['hr1'],'q','PV5 薪資人員用 employees_pay 讀證件欄（應 ERR）',$s$select id_number from employees_pay$s$),
    ('2a,2b',array['hr2'],'q','PV6 投保人員用 employees_insure 讀證件欄（應 ERR）',$s$select id_number from employees_insure$s$),
    ('2a,2b',array['admin','desk','coach','hr1'],'q','AC1 帳號管理檢視 employees_account 列數（管理員 10、其餘 0）',$s$select id from employees_account$s$),
    ('2a,2b',array['admin'],'q','AC2 帳號檢視外露薪資／證件／銀行／投保／生日／到職日／特休欄數（應 0）',$s$select 1 from information_schema.columns where table_schema='public' and table_name='employees_account' and column_name in ('base_salary','pay_rate','pt_rate','group_rate','duty_hourly','pay_rules','id_number','id_no','bank_account','insured_grade','insured_unit','labor_insurance_status','birthday','birth_date','hire_date','permanent_date','annual_leave_total','annual_leave_used','al_carry_hours')$s$),
    ('2a,2b',array['admin'],'q','AC3 帳號管理需要的欄位齊全（應 11）',$s$select 1 from information_schema.columns where table_schema='public' and table_name='employees_account' and column_name in ('phone','email','invite_token','invite_status','must_setup','line_user_id','line_bind_token','role','status','auth_id','is_manager')$s$),
    ('2a,2b',array['desk'],'s','D1 櫃檯用 RPC 改他人 name_en（應 ok）',$s$select (public.fn_employee_update_general('e_c2','{"name_en":"DeskEdit"}'::jsonb))::text$s$),
    ('2a,2b',array['desk'],'s','D2 櫃檯用 RPC 改底薪（應拒絕）',$s$select (public.fn_employee_update_general('e_c2','{"base_salary":1}'::jsonb))::text$s$),
    ('2a,2b',array['desk'],'s','D3 櫃檯用 RPC 改身分證（應拒絕）',$s$select (public.fn_employee_update_general('e_c2','{"id_number":"X"}'::jsonb))::text$s$),
    ('2a,2b',array['desk'],'s','D3b 櫃檯用 RPC 改角色（應拒絕）',$s$select (public.fn_employee_update_general('e_c2','{"role":"admin"}'::jsonb))::text$s$),
    ('2a,2b',array['coach','member'],'s','D6 一般教練／非員工呼叫櫃檯 RPC（應 FORBIDDEN）',$s$select (public.fn_employee_update_general('e_c2','{"name_en":"hack"}'::jsonb))::text$s$),
    ('2a,2b',array['admin','coach'],'s','H1 fn_my_hr_access（管理員 admin_full_hr=true；教練 false）',$s$select (public.fn_my_hr_access())::text$s$),
    ('2a,2b',array['mgr1'],'s','R1 範圍內主管核准 e_c2（應 ok、出勤 9 小時）',$s$select (public.fn_punch_decide('TST-PR-D1',true))::text$s$),
    ('2a,2b',array['mgr1'],'s','R1b 同一筆再核准（NOT_PENDING）',$s$select (public.fn_punch_decide('TST-PR-D1',true))::text$s$),
    ('2a,2b',array['mgr2'],'s','R2 範圍外主管核准（NOT_IN_SCOPE）',$s$select (public.fn_punch_decide('TST-PR-D2',true))::text$s$),
    ('2a,2b',array['desk'],'s','R3 櫃檯核准（NOT_IN_SCOPE）',$s$select (public.fn_punch_decide('TST-PR-D3',true))::text$s$),
    ('2a,2b',array['coach'],'s','R4 一般教練核准他人（NOT_IN_SCOPE）',$s$select (public.fn_punch_decide('TST-PR-D4',true))::text$s$),
    ('2a,2b',array['coach'],'s','R5 本人核准自己（PR.SELF）',$s$select (public.fn_punch_decide('TST-PR-C2',true))::text$s$),
    ('2a,2b',array['mgr1'],'s','R5b 主管核准自己（PR.SELF）',$s$select (public.fn_punch_decide('TST-PR-M1',true))::text$s$),
    ('2a,2b',array['admin'],'s','R5c 管理員核准自己（PR.SELF）',$s$select (public.fn_punch_decide('TST-PR-AD',true))::text$s$),
    ('2a,2b',array['admin'],'s','R6 管理員核准別人（補上班 09:30 合併既有下班 18:00，應 ok）',$s$select (public.fn_punch_decide('TST-PR-D5',true))::text$s$),
    ('2a,2b',array['admin'],'s','R6b 管理員核准別人 e_c3（應 ok）',$s$select (public.fn_punch_decide('TST-PR-AD2',true))::text$s$),
    ('2a,2b',array['mgr1'],'s','R7 範圍內主管駁回（應 ok、不寫出勤）',$s$select (public.fn_punch_decide('TST-PR-D6',false))::text$s$),
    ('2a,2b',array['hr1'],'s','R8 薪資人員核准（NOT_IN_SCOPE）',$s$select (public.fn_punch_decide('TST-PR-A2',true))::text$s$),
    -- ===== 只有 2a：舊前端的行為仍可用（相容）=====
    ('2a',array['admin','desk','coach','mgr1'],'q','L1 舊行為：員工表可見列數（全員 10）',$s$select id from employees$s$),
    ('2a',array['coach','desk','mgr1'],'q','L2 舊行為：讀他人底薪（仍可，2b 才收）',$s$select base_salary from employees where id='e_c3'$s$),
    ('2a',array['desk'],'x','L3 舊行為：櫃檯直接把申請改成已核准（仍可，2b 才收）',$s$update punch_requests set status='approved' where id='TST-PR-L1'$s$),
    ('2a',array['coach'],'x','L4 舊行為：本人直接改自己的申請狀態（仍可，2b 才收）',$s$update punch_requests set status='approved' where id='TST-PR-LC'$s$),
    ('2a',array['coach'],'x','L5 舊行為：本人改既有上班時間（仍可，2b 才收）',$s$update attendance set clock_in='08:00' where id='TST-AT-2'$s$),
    ('2a',array['mgr1'],'x','L6 舊行為：打卡寫入前端傳的時間（仍照寫，2b 才改伺服器時間）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in) select 'TST-AT-L6',id,name,(now() at time zone 'Asia/Taipei')::date,'03:33' from employees where auth_id=auth.uid()$s$),
    ('2a',array['hr1'],'x','L7 舊行為：舊版下班打卡（整筆 upsert）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in,clock_out,work_hours) select 'TST-AT-HR1',id,name,(now() at time zone 'Asia/Taipei')::date,'08:00','23:59',15 from employees where auth_id=auth.uid() on conflict (id) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,work_hours=excluded.work_hours$s$),
    ('2a',array['desk'],'x','L8 舊行為：櫃檯直接改他人 name_en',$s$update employees set name_en='legacy' where id='e_c2'$s$),
    ('2a',array['desk','coach'],'q','L9 舊行為：薪資歷史可見列數（櫃檯 2、教練自己 1）',$s$select id from salary_history$s$),
    ('2a',array['coach'],'x','L10 舊行為：送出時直接填已核准（仍可，2b 才擋）',$s$insert into punch_requests(id,emp_id,emp_name,date,clock_in,reason,status) select 'TST-P-L10',id,name,'2026-11-14','09:00','t','approved' from employees where auth_id=auth.uid()$s$),
    ('2a',array['coach'],'x','L11 舊行為：新版 RPC 與舊直寫並存—本人送出 pending',$s$insert into punch_requests(id,emp_id,emp_name,date,clock_in,reason,status) select 'TST-P-L11',id,name,'2026-11-14','09:00','t','pending' from employees where auth_id=auth.uid()$s$),
    -- ===== 只有 2b：收權後的全部規則 =====
    ('2b',array['admin','desk','coach','mgr1','hr1','member'],'q','E1 員工表基表可見列數（管理員過渡期 10；其餘只有自己 1；非員工 0）',$s$select id from employees$s$),
    ('2b',array['admin','desk','coach','mgr1','hr1','hr2'],'q','E2 讀他人底薪（只有管理員讀得到）',$s$select base_salary from employees where id='e_c2'$s$),
    ('2b',array['admin','desk','coach','mgr1','hr1','hr2'],'q','E3 讀他人證件／銀行／投保（只有管理員讀得到）',$s$select id_number,bank_account,insured_grade from employees where id='e_c2'$s$),
    ('2b',array['admin','desk','coach','mgr1','mgr2','hr1'],'q','E4 本人資料：讀自己整列（本人薪資頁來源）',$s$select base_salary,id_number from employees where auth_id=auth.uid()$s$),
    ('2b',array['desk','coach','mgr1'],'x','D4 直接 UPDATE 他人底薪（應 0 列）',$s$update employees set base_salary=1 where id='e_c2'$s$),
    ('2b',array['desk'],'x','D5 直接 UPDATE 他人 name_en（應 0 列，走 RPC）',$s$update employees set name_en='z' where id='e_c2'$s$),
    ('2b',array['coach','desk'],'x','D7 改自己 name_en（應可）',$s$update employees set name_en='me' where auth_id=auth.uid()$s$),
    ('2b',array['coach','desk'],'x','D8 改自己底薪（應擋）',$s$update employees set base_salary=99999 where auth_id=auth.uid()$s$),
    ('2b',array['admin','desk','coach','mgr1','mgr2','hr1','hr2'],'q','S1 薪資歷史可見列數（管理員 2、pay_view 2、教練自己 1、其餘 0）',$s$select id from salary_history$s$),
    ('2b',array['coach','desk','mgr1'],'x','P1 送出自己的申請（pending，應可）',$s$insert into punch_requests(id,emp_id,emp_name,date,clock_in,reason,status) select 'TST-P1-'||substr(md5(random()::text),1,5),id,name,'2026-11-14','09:00','t','pending' from employees where auth_id=auth.uid()$s$),
    ('2b',array['coach'],'x','P1u 前端 dbPut upsert 寫法：新 id（應可）',$s$insert into punch_requests(id,emp_id,emp_name,date,clock_in,reason,status,created_at) select 'TST-P1U-'||substr(md5(random()::text),1,5),id,name,'2026-11-15','09:00','t','pending',now() from employees where auth_id=auth.uid() on conflict (id) do update set status=excluded.status$s$),
    ('2b',array['coach'],'x','P2 送出時直接填已核准（應擋）',$s$insert into punch_requests(id,emp_id,emp_name,date,clock_in,reason,status) select 'TST-P2-'||substr(md5(random()::text),1,5),id,name,'2026-11-14','09:00','t','approved' from employees where auth_id=auth.uid()$s$),
    ('2b',array['desk','admin'],'x','P3 代登他人申請（pending＋requested_by，應可）',$s$insert into punch_requests(id,emp_id,emp_name,date,clock_in,reason,status,requested_by) values ('TST-P3-'||substr(md5(random()::text),1,5),'e_c2','教練2','2026-11-14','09:00','代登','pending',(select current_employee_id()))$s$),
    ('2b',array['coach'],'x','P3b 教練幫別人送申請（應擋）',$s$insert into punch_requests(id,emp_id,emp_name,date,clock_in,reason,status) values ('TST-P3B-'||substr(md5(random()::text),1,5),'e_c2','教練2','2026-11-14','09:00','t','pending')$s$),
    ('2b',array['coach','desk','mgr1','admin'],'x','P4 直接 UPDATE 狀態為已核准（任何角色皆應 0 列）',$s$update punch_requests set status='approved' where id in ('TST-PR-C','TST-PR-A2','TST-PR-L1','TST-PR-LC')$s$),
    ('2b',array['admin','desk','coach','mgr1','mgr2'],'q','P5 補打卡申請可見列數（管理員／櫃檯全部、教練自己、主管所管）',$s$select id from punch_requests$s$),
    ('2b',array['mgr1'],'x','A1 第一次打卡：前端傳 03:33（應可，時間改伺服器現在）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in) select 'TST-AT-N1',id,name,(now() at time zone 'Asia/Taipei')::date,'03:33' from employees where auth_id=auth.uid()$s$),
    ('2b',array['desk'],'x','A1b 第一次打卡就帶下班時間（應擋）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in,clock_out) select 'TST-AT-N2',id,name,(now() at time zone 'Asia/Taipei')::date,'09:00','10:00' from employees where auth_id=auth.uid()$s$),
    ('2b',array['hr2'],'x','A1c 新增昨天的卡（應擋，走補打卡申請）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in) select 'TST-AT-N3',id,name,(now() at time zone 'Asia/Taipei')::date-1,'09:00' from employees where auth_id=auth.uid()$s$),
    ('2b',array['coach'],'x','A2 新增 5 天前的卡（應擋）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in) select 'TST-AT-O',id,name,(now() at time zone 'Asia/Taipei')::date-5,'09:05' from employees where auth_id=auth.uid()$s$),
    ('2b',array['coach'],'x','A3 補打下班：前端傳 03:44＋工時 99（應可，時間與工時改伺服器算）',$s$update attendance set clock_out='03:44', work_hours=99 where id='TST-AT-1'$s$),
    ('2b',array['coach'],'x','A4 改既有上班時間（應擋）',$s$update attendance set clock_in='08:00' where id='TST-AT-2'$s$),
    ('2b',array['coach'],'x','A5 改既有下班時間（應擋）',$s$update attendance set clock_out='20:00' where id='TST-AT-2'$s$),
    ('2b',array['coach'],'x','A6 單獨改工時（應擋）',$s$update attendance set work_hours=12 where id='TST-AT-2'$s$),
    ('2b',array['coach'],'x','A7 改出勤日期（應擋）',$s$update attendance set date=date-1 where id='TST-AT-2'$s$),
    ('2b',array['coach'],'x','A7b 改備註（應擋）',$s$update attendance set note='自己改的' where id='TST-AT-2'$s$),
    ('2b',array['coach'],'x','A7c 改更正人（應擋）',$s$update attendance set fixed_by='e_admin' where id='TST-AT-2'$s$),
    ('2b',array['hr1'],'x','A8 前端 dbPut 整筆 upsert 下班打卡：傳 23:59＋工時 15（應可，改伺服器時間）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in,clock_out,work_hours) select 'TST-AT-HR1',id,name,(now() at time zone 'Asia/Taipei')::date,'08:00','23:59',15 from employees where auth_id=auth.uid() on conflict (id) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,work_hours=excluded.work_hours$s$),
    ('2b',array['hr1'],'x','A8b 同一筆 upsert 想改上班時間（應擋）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in,clock_out,work_hours) select 'TST-AT-HR1',id,name,(now() at time zone 'Asia/Taipei')::date,'05:00','23:59',15 from employees where auth_id=auth.uid() on conflict (id) do update set clock_in=excluded.clock_in,clock_out=excluded.clock_out,work_hours=excluded.work_hours$s$),
    ('2b',array['hr2'],'x','A9 下班後 10 分鐘內取消下班（應可）',$s$update attendance set clock_out=null, work_hours=null where id='TST-AT-HR2'$s$),
    ('2b',array['mgr2'],'x','A9b 下班 30 分鐘後想取消（應擋）',$s$update attendance set clock_out=null, work_hours=null where id='TST-AT-M2'$s$),
    ('2b',array['coach'],'x','A9c 取消昨天的下班（應擋）',$s$update attendance set clock_out=null, work_hours=null where id='TST-AT-2'$s$),
    ('2b',array['admin'],'x','A11 管理員直接更正既有上班時間（維持可）',$s$update attendance set clock_in='08:30' where id='TST-AT-2'$s$),
    ('2b',array['coach','desk','mgr1'],'q','A12 出勤可見列數',$s$select id from attendance$s$),
    ('2a,2b',array['admin','desk','coach','mgr1'],'q','W1 排班 shifts 可見列數（管理員／櫃檯／主管 3、教練 1，與基準相同）',$s$select id from shifts$s$),
    ('2a,2b',array['coach','desk'],'q','W2 bookings 讀取（政策內含員工表自查，50）',$s$select id from bookings limit 50$s$),
    ('2a,2b',array['coach'],'q','W3 本人薪資頁：自己的底薪／單價欄位',$s$select base_salary,pt_rate,group_rate,duty_hourly,pay_rules from employees where auth_id=auth.uid()$s$),
    ('2a,2b',array['coach'],'q','W4 本人薪資歷史（自己 1 列）',$s$select id from salary_history where emp_id=(select current_employee_id())$s$)
  ) as v(ph,pers,k,n,s) where position(p_phase in v.ph)>0 loop
    foreach pname in array t.pers loop
      v_id := case pname when 'admin' then 'e_admin' when 'desk' then 'e_fd' when 'coach' then 'e_coach' when 'mgr1' then 'TST-MGR1' when 'mgr2' then 'TST-MGR2' when 'hr1' then 'TST-HR1' when 'hr2' then 'TST-HR2' else null end;
      if v_id is null then v_uid := 'aaaaaaaa-0000-4000-8000-000000000005'; else select auth_id into v_uid from employees where id=v_id; end if;
      perform set_config('request.jwt.claims', jsonb_build_object('sub',v_uid,'role','authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', v_uid::text, true);
      perform set_config('request.jwt.claim.role','authenticated', true);
      set local role authenticated;
      begin
        if t.k='q' then execute 'select count(*) from ('||t.s||') x' into n; o:='rows='||n;
        elsif t.k='s' then execute t.s into o;
        else execute t.s; get diagnostics n = row_count; o:='affected='||n; end if;
      exception when others then o:='ERR '||left(sqlerrm,90); end;
      reset role;
      res := res || to_jsonb(pname||' | '||t.n||' → '||o);
    end loop;
  end loop;

  -- ===== 第二階段：關閉「管理員自動擁有人事職責」（系統管理員另外授予）=====
  update hr_settings set value='false' where key='admin_implicit_hr';
  for t in select * from (values
    ('2a,2b',array['admin'],'q','X1 關閉後：管理員讀 employees_pay（應 0）',$s$select id from employees_pay$s$),
    ('2a,2b',array['admin'],'q','X1b 關閉後：管理員讀 employees_insure（應 0）',$s$select id from employees_insure$s$),
    ('2a,2b',array['admin'],'q','X2 關閉後：管理員帳號管理檢視 employees_account（應 10，不受影響）',$s$select id,phone,email,invite_token from employees_account$s$),
    ('2a,2b',array['admin'],'s','X2b 關閉後：fn_my_hr_access（admin_full_hr 應為 false）',$s$select (public.fn_my_hr_access())::text$s$),
    ('2b',array['admin'],'q','X3 關閉後：管理員讀員工基表（應只剩自己 1 列）',$s$select id from employees$s$),
    ('2b',array['admin'],'q','X3b 關閉後：管理員讀他人底薪／證件（應 0）',$s$select base_salary,id_number from employees where id='e_c2'$s$),
    ('2b',array['admin'],'q','X4 關閉後：管理員讀薪資歷史（應 0）',$s$select id from salary_history$s$),
    ('2b',array['admin'],'x','X4b 關閉後：管理員 INSERT 薪資歷史仍可（寫入政策獨立）',$s$insert into salary_history(id,emp_id,ym,net) values ('TST-SH-N2','e_c2','2026-08',1)$s$),
    ('2b',array['hr1'],'q','X5 關閉後：有 pay_view 的人不受影響（employees_pay 10、薪資歷史 3）',$s$select id from employees_pay$s$),
    ('2b',array['hr1'],'q','X5b 關閉後：pay_view 讀薪資歷史',$s$select id from salary_history$s$),
    ('2b',array['hr1','hr2'],'q','X6 關閉後：pay_view／insure 人員讀員工基表（仍只有自己 1 列）',$s$select id from employees$s$)
  ) as v(ph,pers,k,n,s) where position(p_phase in v.ph)>0 loop
    foreach pname in array t.pers loop
      v_id := case pname when 'admin' then 'e_admin' when 'hr1' then 'TST-HR1' else 'TST-HR2' end;
      select auth_id into v_uid from employees where id=v_id;
      perform set_config('request.jwt.claims', jsonb_build_object('sub',v_uid,'role','authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', v_uid::text, true);
      set local role authenticated;
      begin
        if t.k='q' then execute 'select count(*) from ('||t.s||') x' into n; o:='rows='||n;
        elsif t.k='s' then execute t.s into o;
        else execute t.s; get diagnostics n = row_count; o:='affected='||n; end if;
      exception when others then o:='ERR '||left(sqlerrm,90); end;
      reset role;
      res := res || to_jsonb(pname||' | '||t.n||' → '||o);
    end loop;
  end loop;
  insert into hr_grants(employee_id,duty) values ('e_admin','pay_view');
  perform set_config('request.jwt.claims', jsonb_build_object('sub',(select auth_id from employees where id='e_admin'),'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', (select auth_id::text from employees where id='e_admin'), true);
  set local role authenticated;
  select count(*) into n from employees_pay; o:='rows='||n;
  reset role;
  res := res || to_jsonb('admin | X7 另外授予 pay_view 後：管理員讀 employees_pay（應 10）→ '||o);

  extra := jsonb_build_object(
    'server_hm_at_start', hm,
    'R1_hours', (select work_hours from attendance where emp_id='e_c2' and date='2026-11-10'),
    'R1_status', (select status||' by '||coalesce(reviewed_by,'-') from punch_requests where id='TST-PR-D1'),
    'R6_in_out_hours', (select clock_in||'~'||clock_out||'='||coalesce(work_hours::text,'null') from attendance where emp_id='e_c2' and date='2026-11-11'),
    'R7_rejected_no_attendance', (select status||' / att rows='||(select count(*) from attendance where emp_id='e_c2' and date='2026-11-12') from punch_requests where id='TST-PR-D6'),
    'should_stay_pending', (select string_agg(id||'='||status, ',' order by id) from punch_requests where id in ('TST-PR-D2','TST-PR-D3','TST-PR-D4','TST-PR-C2','TST-PR-M1','TST-PR-AD')),
    'legacy_or_blocked_P4', (select string_agg(id||'='||status, ',' order by id) from punch_requests where id in ('TST-PR-C','TST-PR-A2','TST-PR-L1','TST-PR-LC')),
    'proxy_requested_by', (select string_agg(distinct requested_by,',') from punch_requests where id like 'TST-P3-%'),
    'e_c2_after', (select base_salary||' / '||coalesce(name_en,'-')||' / '||coalesce(id_number,'-') from employees where id='e_c2'),
    'A1_N1_stored_clock_in', (select clock_in||'（前端傳 03:33；伺服器當時 '||hm||'）' from attendance where id='TST-AT-N1'),
    'A3_AT1_stored', (select clock_in||'~'||clock_out||'='||coalesce(work_hours::text,'null')||'（前端傳 03:44／99；伺服器當時 '||hm||'）' from attendance where id='TST-AT-1'),
    'A8_HR1_stored', (select clock_in||'~'||clock_out||'='||coalesce(work_hours::text,'null')||'（前端傳 23:59／15；伺服器當時 '||hm||'）' from attendance where id='TST-AT-HR1'),
    'A9_HR2_after_undo', (select coalesce(clock_out,'空白')||' / '||coalesce(work_hours::text,'空白') from attendance where id='TST-AT-HR2'),
    'A9b_M2_unchanged', (select clock_out from attendance where id='TST-AT-M2'),
    'L6_stored_clock_in', (select clock_in from attendance where id='TST-AT-L6'),
    'AT2_final', (select clock_in||'~'||clock_out||'='||work_hours from attendance where id='TST-AT-2'));
  raise exception 'RESULT>>%', jsonb_pretty(jsonb_build_object('phase',p_phase,'tests',res,'effects',extra));
end $zz$;
notify pgrst, 'reload schema';
