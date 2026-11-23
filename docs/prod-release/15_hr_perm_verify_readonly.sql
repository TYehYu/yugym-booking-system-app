-- 人事權限 2a／2b 唯讀驗證（只有 SELECT；套用前、僅 2a、完整 2b、回復後都能跑，新表不存在也不會報錯）
-- 正式庫 rlpiomzplckzqnqrvrwc（叢集 7637215626725903220）。第一列 stage 自動判定階段：pre／2a／2b／partial；
-- 其餘每列 ok=true 才算符合該階段預期。cluster 若不是正式庫（例如測試庫演練）會顯示 false，屬預期。
with f as (
  select
    (select count(*) from pg_class where relnamespace='public'::regnamespace and relname = any(array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence'])) nobj,
    (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname = any(array['admin_full_hr','has_hr_duty','is_my_report','fn_my_hr_access','fn_punch_decide','fn_employee_update_general'])) nfn,
    (select count(*) from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) guard,
    (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='fn_attendance_self_guard') guardfn,
    (select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','PUBLIC') and table_name = any(array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence'])) anon_n,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='punch_requests' and column_name in ('requested_by','reviewed_by')) newcols,
    (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename = any(array['employees','punch_requests','attendance','salary_history'])) polfp,
    (select system_identifier::text from pg_control_system()) cl,
    case when to_regclass('public.hr_settings') is not null then (xpath('/row/c/text()', query_to_xml('select value as c from public.hr_settings where key=''admin_implicit_hr''', false, true, '')))[1]::text end implicit,
    case when to_regclass('public.hr_grants') is not null then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.hr_grants', false, true, '')))[1]::text end n_grants,
    case when to_regclass('public.manager_scope') is not null then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.manager_scope', false, true, '')))[1]::text end n_scope,
    case when to_regclass('public.manager_scope') is not null
         then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.employees e where coalesce(e.is_manager,false) and e.status::text=''active'' and not exists (select 1 from public.manager_scope s where s.manager_id=e.id)', false, true, '')))[1]::text
         else (select count(*)::text from public.employees e where coalesce(e.is_manager,false) and e.status::text='active') end mgr_noscope
), s as (
  select f.*, case when nobj=0 and nfn=0 and guard=0 and guardfn=0 then 'pre'
                   when nobj=10 and nfn=6 and guard=0 and guardfn=0 then '2a'
                   when nobj=10 and nfn=6 and guard=1 and guardfn=1 then '2b' else 'partial' end stage from f)
select 1 n, 'stage（自動判定階段）' k, stage v, '—' expect, (stage <> 'partial') ok from s
union all select 2,'cluster（正式庫）', cl, '7637215626725903220', cl='7637215626725903220' from s
union all select 3,'新表/檢視數', nobj::text, '套用前0；2a/2b 後10', nobj = case when stage='pre' then 0 else 10 end from s
union all select 4,'新函式數', nfn::text, '套用前0；2a/2b 後6', nfn = case when stage='pre' then 0 else 6 end from s
union all select 5,'anon/PUBLIC 對新物件權限數', anon_n::text, '0', anon_n=0 from s
union all select 6,'punch_requests 新欄位數', newcols::text, '套用前0（回復後保留2亦可）；2a/2b 後2', case when stage='pre' then newcols in (0,2) else newcols=2 end from s
union all select 7,'出勤守衛觸發器／函式', guard||'/'||guardfn, '2b 才為 1/1，其餘 0/0', (guard=guardfn) and (guard = case when stage='2b' then 1 else 0 end) from s
union all select 8,'四表政策指紋', polfp, '套用前、2a、回復後＝6632d2f1681c741deef8f7248f98e196；2b 後必須不同', case when stage='2b' then polfp <> '6632d2f1681c741deef8f7248f98e196' else polfp = '6632d2f1681c741deef8f7248f98e196' end from s
union all select 9,'admin_implicit_hr', coalesce(implicit,'(表不存在)'), '套用前（表不存在）；2a/2b 預設 true', case when stage='pre' then implicit is null else implicit='true' end from s
union all select 10,'hr_grants 筆數', coalesce(n_grants,'-'), '依你確認的名單', true from s
union all select 11,'manager_scope 筆數', coalesce(n_scope,'-'), '依你確認的名單', true from s
union all select 12,'在職主管無管轄名單人數', mgr_noscope, '2b 前須為 0（或刻意放行）；2b 後應為 0', case when stage='2b' then mgr_noscope='0' else true end from s
order by n;
