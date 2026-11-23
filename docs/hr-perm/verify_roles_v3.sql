-- 人事權限修補 v3 補驗：主管出勤範圍、舊頁面保護、change_log／fn_table_sigs／fn_set_employment_type 並存。只跑測試庫 kucvxpjatptfckhlxptj。
-- 建立「測試專用」函式 zz_hr_verify2(phase)（用完 drop）：  select public.zz_hr_verify2('2b');  或（基準狀態）select public.zz_hr_verify2('base');
-- 同一交易內建假資料 → 各角色 set local role authenticated＋偽造 JWT sub → 實際讀寫／RPC → raise exception 帶出結果並強制回滾。
-- persona 'pg'＝不切角色（以擁有者身分查副作用）。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
create or replace function public.zz_hr_verify2(p_phase text) returns void language plpgsql as $zz$
declare
  res jsonb := '[]'::jsonb; t record; pname text; v_uid uuid; v_id text; n int; o text; extra jsonb; sig0 text; cl0 int;
  hm text := to_char(now() at time zone 'Asia/Taipei','HH24:MI');
  today date := (now() at time zone 'Asia/Taipei')::date;
  d1 date := (now() at time zone 'Asia/Taipei')::date - 3; d2 date := (now() at time zone 'Asia/Taipei')::date - 2;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  if p_phase not in ('2b','base') then raise exception 'phase 只能是 2b 或 base'; end if;
  insert into auth.users(id) values ('aaaaaaaa-0000-4000-8000-000000000001'),('aaaaaaaa-0000-4000-8000-000000000002'),('aaaaaaaa-0000-4000-8000-000000000003'),('aaaaaaaa-0000-4000-8000-000000000005');
  insert into employees(id,name,role,status,auth_id,is_manager) values
    ('TST-MGR1','假主管甲','coach','active','aaaaaaaa-0000-4000-8000-000000000001',true),
    ('TST-MGR2','假主管乙','coach','active','aaaaaaaa-0000-4000-8000-000000000002',true),
    ('TST-HR1','假薪資人員','front_desk','active','aaaaaaaa-0000-4000-8000-000000000003',false);
  update employees set base_salary=50000 where id in ('e_c2','e_c3','e_coach');
  if p_phase='2b' then
    execute $m$insert into manager_scope(manager_id,employee_id) values ('TST-MGR1','e_c2'),('TST-MGR2','e_c3')$m$;
    execute $m$insert into hr_grants(employee_id,duty) values ('TST-HR1','pay_view')$m$;
  end if;
  insert into attendance(id,emp_id,emp_name,date,clock_in,clock_out,work_hours) values
    ('TSTA-C2T','e_c2','教練2',today,'09:00',null,null),('TSTA-C2Y','e_c2','教練2',today-1,'09:00','18:00',9),
    ('TSTA-C3T','e_c3','教練3',today,'10:00',null,null),('TSTA-CC','e_coach','教練C',today,'08:00','17:00',9),
    ('TSTA-M1','TST-MGR1','假主管甲',today,'07:00',null,null),('TSTA-M2','TST-MGR2','假主管乙',today,'07:00',null,null),
    ('TSTA-C3D2','e_c3','教練3',d2,'09:00','12:00',3);
  insert into punch_requests(id,emp_id,emp_name,date,clock_in,clock_out,reason,status) values
    ('TSTR-C2D','e_c2','教練2',d1,'09:00','18:00','t','pending'),
    ('TSTR-C3D2','e_c3','教練3',d2,null,'18:00','t','pending'),
    ('TSTR-M2','TST-MGR2','假主管乙',today,null,'18:00','t','pending'),
    ('TSTR-HR1','TST-HR1','假薪資人員',today,'09:00',null,'t','pending');
  select public.fn_table_sigs()->>'attendance' into sig0;
  select count(*) into cl0 from change_log where tbl='attendance';

  for t in select * from (values
    ('2b',array['mgr1','mgr2','coach','desk','hr1','admin'],'q','M1 出勤明細可見列數（主管只看本人＋所管；教練只看自己；櫃檯／薪資人員(櫃檯身分)／管理員全部 7）',$s$select id from attendance where id like 'TSTA-%'$s$),
    ('2b',array['mgr1','mgr2'],'q','M2 主管讀非所管者的出勤／工時（e_coach，應 0）',$s$select work_hours from attendance where emp_id='e_coach'$s$),
    ('2b',array['mgr1','mgr2','desk','admin','hr1'],'q','M3 到班狀態 attendance_presence 列數（今天＋昨天，6 列；教練 0）',$s$select emp_id from attendance_presence where emp_id in ('e_c2','e_c3','e_coach','TST-MGR1','TST-MGR2')$s$),
    ('2b',array['coach'],'q','M3b 一般教練讀到班狀態（應 0）',$s$select emp_id from attendance_presence$s$),
    ('2b',array['mgr1'],'q','M4 到班狀態的欄位只有 4 個（emp_id／date／has_in／has_out）',$s$select 1 from information_schema.columns where table_schema='public' and table_name='attendance_presence'$s$),
    ('2b',array['mgr1'],'q','M4b 到班狀態讀時間欄（應 ERR）',$s$select clock_in from attendance_presence$s$),
    ('2b',array['mgr1'],'q','M5 主管讀補打卡申請（所管 e_c2 ＋自己，沒有自己的申請＝1）',$s$select id from punch_requests where id like 'TSTR-%'$s$),
    ('2b',array['admin'],'x','O1 舊頁面核准第 1 步：管理員直接寫「別人那天」的出勤（那天有待審申請）→ 應整筆拒絕',$s$insert into attendance(id,emp_id,emp_name,date,clock_in,clock_out,work_hours) values ('TSTA-OLD1','e_c2','教練2',(now() at time zone 'Asia/Taipei')::date-3,'09:00','18:00',9)$s$),
    ('2b',array['admin'],'x','O2 舊頁面核准第 1 步：管理員改別人既有出勤列（那天有待審申請）→ 應整筆拒絕',$s$update attendance set clock_out='18:00', work_hours=6 where id='TSTA-C3D2'$s$),
    ('2b',array['admin'],'x','O3 舊頁面核准第 2 步：直接改申請狀態 → 0 列（前面第 1 步已被拒，所以整個舊請求什麼都沒留下）',$s$update punch_requests set status='approved' where id='TSTR-C2D'$s$),
    ('2b',array['pg'],'q','O3b 副作用核對：e_c2 在那天的出勤列數（應 0）',$s$select id from attendance where emp_id='e_c2' and date=(now() at time zone 'Asia/Taipei')::date-3$s$),
    ('2b',array['mgr1'],'s','O4 新版核准（RPC）：完整成功',$s$select (public.fn_punch_decide('TSTR-C2D',true))::text$s$),
    ('2b',array['pg'],'q','O4b 新版核准後：e_c2 那天出勤已寫入（1 列）',$s$select id from attendance where emp_id='e_c2' and date=(now() at time zone 'Asia/Taipei')::date-3 and clock_in='09:00' and clock_out='18:00'$s$),
    ('2b',array['admin'],'x','O5 管理員直接更正「沒有待審申請」那天的出勤（維持可）',$s$update attendance set clock_in='08:30' where id='TSTA-C2Y'$s$),
    ('2b',array['mgr2'],'x','O6 新版正常打卡：本人補下班，即使本人當天有待審補打卡申請（不被擋）',$s$update attendance set clock_out='04:00', work_hours=99 where id='TSTA-M2'$s$),
    ('2b',array['hr1'],'x','O7 新版正常打卡：本人第一次打卡，即使本人當天有待審申請（不被擋）',$s$insert into attendance(id,emp_id,emp_name,date,clock_in) select 'TSTA-H1',id,name,(now() at time zone 'Asia/Taipei')::date,'03:33' from employees where auth_id=auth.uid()$s$),
    ('2b',array['desk'],'x','O8 櫃檯直接寫別人的出勤（仍被 RLS 擋）',$s$update attendance set clock_in='07:00' where id='TSTA-C2Y'$s$),
    ('2b',array['mgr1'],'x','O9 主管直接寫所管者的出勤（仍被 RLS 擋；走補打卡核准）',$s$update attendance set clock_in='07:00' where id='TSTA-C2Y'$s$),
    ('2b',array['coach'],'s','C2 一般教練呼叫 fn_table_sigs（含 attendance、employees、_log）',$s$select ((public.fn_table_sigs()) ? 'attendance' and (public.fn_table_sigs()) ? 'employees' and (public.fn_table_sigs()) ? '_log')::text$s$),
    ('2b',array['coach','mgr1','desk','member'],'q','C3 讀 change_log（員工 >0、非員工 0）',$s$select seq from change_log where row_id like 'TSTA-%'$s$),
    ('2b,base',array['mgr1'],'s','E1 主管調整僱用別（fn_set_employment_type：e_c2→part_time）',$s$select (public.fn_set_employment_type('e_c2','part_time'))::text$s$),
    ('2b,base',array['coach'],'s','E2 一般教練呼叫（應 NOT_MANAGER）',$s$select (public.fn_set_employment_type('e_c3','part_time'))::text$s$),
    ('2b,base',array['mgr1'],'s','E3 主管對自己（應 EMP.SELF）',$s$select (public.fn_set_employment_type('TST-MGR1','part_time'))::text$s$),
    ('2b,base',array['mgr1'],'s','E4 主管對管理員（應 EMP.IS_ADMIN）',$s$select (public.fn_set_employment_type('e_admin','part_time'))::text$s$),
    ('2b,base',array['mgr1'],'x','E5 呼叫後旗標已熄滅：主管直接改別人底薪（應 0 列或守衛擋）',$s$update employees set base_salary=1 where id='e_c3'$s$),
    ('2b,base',array['mgr1'],'x','E6 主管直接改別人僱用別（應 0 列或守衛擋）',$s$update employees set employment_type='intern' where id='e_c3'$s$)
  ) as v(ph,pers,k,n,s) where position(p_phase in v.ph)>0 loop
    foreach pname in array t.pers loop
      v_id := case pname when 'admin' then 'e_admin' when 'desk' then 'e_fd' when 'coach' then 'e_coach' when 'mgr1' then 'TST-MGR1' when 'mgr2' then 'TST-MGR2' when 'hr1' then 'TST-HR1' else null end;
      if pname='pg' then null; elsif v_id is null then v_uid := 'aaaaaaaa-0000-4000-8000-000000000005'; else select auth_id into v_uid from employees where id=v_id; end if;
      if pname<>'pg' then
        perform set_config('request.jwt.claims', jsonb_build_object('sub',v_uid,'role','authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', v_uid::text, true);
        perform set_config('request.jwt.claim.role','authenticated', true);
        set local role authenticated;
      end if;
      begin
        if t.k='q' then execute 'select count(*) from ('||t.s||') x' into n; o:='rows='||n;
        elsif t.k='s' then execute t.s into o;
        else execute t.s; get diagnostics n = row_count; o:='affected='||n; end if;
      exception when others then o:='ERR '||left(sqlerrm,100); end;
      reset role;
      res := res || to_jsonb(pname||' | '||t.n||' → '||o);
    end loop;
  end loop;

  extra := jsonb_build_object(
    'server_hm', hm,
    'sig_attendance_changed_after_writes', (public.fn_table_sigs()->>'attendance') is distinct from sig0,
    'change_log_attendance_rows_added', (select count(*) from change_log where tbl='attendance') - cl0,
    'change_log_employees_rows', (select count(*) from change_log where tbl='employees' and row_id in ('e_c2','TST-MGR1','TST-MGR2','TST-HR1')),
    'TSTA_C3D2_after_O2', (select clock_in||'~'||clock_out||'='||work_hours from attendance where id='TSTA-C3D2'),
    'TSTA_OLD1_exists', (select count(*) from attendance where id='TSTA-OLD1'),
    'TSTR_C2D_status', (select status||' by '||coalesce(reviewed_by,'-') from punch_requests where id='TSTR-C2D'),
    'TSTA_C2Y_after_O5_O8_O9', (select clock_in||'~'||clock_out from attendance where id='TSTA-C2Y'),
    'O6_M2_stored', (select clock_out||'/'||coalesce(work_hours::text,'null')||'（前端傳 04:00／99；伺服器 '||hm||'）' from attendance where id='TSTA-M2'),
    'O7_H1_stored', (select clock_in||'（前端傳 03:33；伺服器 '||hm||'）' from attendance where id='TSTA-H1'),
    'E1_e_c2', (select employment_type::text||' / base '||base_salary||' / pay_rules keys '||coalesce((select string_agg(k,',' order by k) from jsonb_object_keys(case when jsonb_typeof(pay_rules)='object' then pay_rules else '{}'::jsonb end) k),'-') from employees where id='e_c2'),
    'E5_e_c3_base', (select base_salary from employees where id='e_c3'),
    'E_flag_after', current_setting('app.emp_type_rpc', true));
  raise exception 'RESULT>>%', jsonb_pretty(jsonb_build_object('phase',p_phase,'tests',res,'effects',extra));
end $zz$;
notify pgrst, 'reload schema';
