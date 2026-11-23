-- 人事權限修補 2a「相容階段」（只新增、不收權；舊前端照常運作）。2026-11-19 起草。
-- ⚠ 只套「測試庫 kucvxpjatptfckhlxptj」驗證。正式庫 rlpiomzplckzqnqrvrwc 未執行，須使用者明確授權。
-- 內容：新表（hr_grants／manager_scope／hr_settings）、函式、去敏檢視、補打卡兩個新欄位。
-- 不做：不改任何既有政策、不掛任何觸發器、不改既有資料列 → 新舊前端都能用，隨時可單獨回復（rollback_2a_hr_perm_compat.sql）。
-- 順序：2a →（上新版前端、驗收）→ 2b（20261119b_hr_perm_revoke.sql）。回復順序相反：先回 2b（恢復權限），再退前端，最後才（視需要）回 2a。
-- 規則（第一版）：所有人都不可核准自己的補打卡；主管只能核准所管（manager_scope）員工；薪資查看只讀必要欄位；
--   系統管理員的人事權限另外授予（hr_settings.admin_implicit_hr；過渡期預設 'true'＝管理員自動擁有，維持現行營運）。

-- ===== 1) 職責、主管範圍、設定（新表；四件事：建表→RLS→GRANT→policy）=====
create table if not exists public.hr_grants (
  employee_id text not null references public.employees(id) on delete cascade,
  duty        text not null check (duty in ('pay_view','pay_adjust','pay_publish','insure','employment','leave_settle')),
  granted_by  text,
  granted_at  timestamptz not null default now(),
  primary key (employee_id, duty)
);
alter table public.hr_grants enable row level security;
grant select, insert, update, delete on public.hr_grants to authenticated;
grant select, insert, update, delete on public.hr_grants to service_role;
drop policy if exists hr_grants_admin on public.hr_grants;
drop policy if exists hr_grants_self_read on public.hr_grants;
create policy hr_grants_admin     on public.hr_grants for all    to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy hr_grants_self_read on public.hr_grants for select to authenticated using (employee_id = (select current_employee_id()));

create table if not exists public.manager_scope (
  manager_id  text not null references public.employees(id) on delete cascade,
  employee_id text not null references public.employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (manager_id, employee_id),
  check (manager_id <> employee_id)
);
alter table public.manager_scope enable row level security;
grant select, insert, update, delete on public.manager_scope to authenticated;
grant select, insert, update, delete on public.manager_scope to service_role;
drop policy if exists manager_scope_admin on public.manager_scope;
drop policy if exists manager_scope_self_read on public.manager_scope;
create policy manager_scope_admin     on public.manager_scope for all    to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy manager_scope_self_read on public.manager_scope for select to authenticated using (manager_id = (select current_employee_id()));

create table if not exists public.hr_settings (
  key text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.hr_settings enable row level security;
grant select, insert, update, delete on public.hr_settings to authenticated;
grant select, insert, update, delete on public.hr_settings to service_role;
drop policy if exists hr_settings_admin on public.hr_settings;
create policy hr_settings_admin on public.hr_settings for all to authenticated using ((select is_admin())) with check ((select is_admin()));
insert into public.hr_settings(key, value) values ('admin_implicit_hr', 'true') on conflict (key) do nothing;
-- 新表一律不給 anon（正式庫的預設權限會替新表給 anon 少數權限；明確收回，與 CLAUDE.md 新表規矩一致）
revoke all on public.hr_grants, public.manager_scope, public.hr_settings from public, anon;

-- ===== 2) 函式 =====
-- 管理員「自動」擁有人事職責（過渡期預設 true）。員工表基表、薪資檢視、薪資歷史都靠它決定管理員能不能讀。
create or replace function public.admin_full_hr() returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(public.is_admin(), false)
     and coalesce((select value from public.hr_settings where key = 'admin_implicit_hr'), 'true') <> 'false';
$$;
create or replace function public.has_hr_duty(p_duty text) returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select public.admin_full_hr()
      or exists (select 1 from public.hr_grants g join public.employees e on e.id = g.employee_id
                  where g.employee_id = public.current_employee_id() and g.duty = p_duty and e.status::text = 'active');
$$;
create or replace function public.is_my_report(p_emp text) returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select exists (select 1 from public.manager_scope s join public.employees m on m.id = s.manager_id
                  where s.manager_id = public.current_employee_id() and s.employee_id = p_emp
                    and coalesce(m.is_manager, false) and m.status::text = 'active');
$$;
-- 前端要知道「我能不能讀員工基表整列」：回傳 {admin_full_hr, duties[]}
create or replace function public.fn_my_hr_access() returns jsonb
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object('admin_full_hr', public.admin_full_hr(),
    'duties', coalesce((select jsonb_agg(g.duty order by g.duty) from public.hr_grants g join public.employees e on e.id = g.employee_id
                         where g.employee_id = public.current_employee_id() and e.status::text = 'active'), '[]'::jsonb));
$$;
revoke all on function public.admin_full_hr(), public.has_hr_duty(text), public.is_my_report(text), public.fn_my_hr_access() from public, anon;
grant execute on function public.admin_full_hr(), public.has_hr_duty(text), public.is_my_report(text), public.fn_my_hr_access() to authenticated, service_role;

-- 補打卡新欄位（2b 才會用到；舊前端不帶這兩欄，完全不受影響）
alter table public.punch_requests add column if not exists requested_by text;   -- 代登人（本人送出時為空或本人）
alter table public.punch_requests add column if not exists reviewed_by  text;   -- 核准／駁回人

-- 補打卡核准／駁回（規則在資料庫把關）：任何人都不可核准自己的；管理員核准「別人」的；主管只能核准 manager_scope 內的人。
-- 2a 階段舊的直接寫表路徑仍開著（舊前端用），這支函式新舊並存；2b 才把直接寫表收回。
create or replace function public.fn_punch_decide(p_id text, p_approve boolean) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_me text := public.current_employee_id();
  r public.punch_requests%rowtype; a public.attendance%rowtype; v_found boolean;
  v_in text; v_out text; v_hours numeric; v_mins int; v_status text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  select * into r from public.punch_requests where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'PR.NOT_FOUND'); end if;
  if r.status is distinct from 'pending' then return jsonb_build_object('ok', false, 'error_code', 'PR.NOT_PENDING'); end if;
  if r.emp_id = v_me then return jsonb_build_object('ok', false, 'error_code', 'PR.SELF'); end if;
  if not (coalesce(public.is_admin(), false) or public.is_my_report(r.emp_id)) then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH.NOT_IN_SCOPE'); end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;
  if p_approve then
    -- 與前端既有 approvePunchReq 同一套：補哪一欄就覆蓋哪一欄；上下班都有時重算工時（0.5 小時為單位、跨午夜 +24h）
    select * into a from public.attendance where emp_id = r.emp_id and date = r.date order by created_at nulls last limit 1 for update;
    v_found := found;
    v_in  := coalesce(nullif(r.clock_in,  ''), case when v_found then a.clock_in  end);
    v_out := coalesce(nullif(r.clock_out, ''), case when v_found then a.clock_out end);
    v_hours := case when v_found then a.work_hours end;
    if coalesce(v_in, '') <> '' and coalesce(v_out, '') <> '' then
      v_mins := (split_part(v_out, ':', 1)::int * 60 + split_part(v_out, ':', 2)::int) - (split_part(v_in, ':', 1)::int * 60 + split_part(v_in, ':', 2)::int);
      if v_mins < 0 then v_mins := v_mins + 1440; end if;
      v_hours := round(v_mins / 30.0) / 2.0;
    end if;
    if v_found then
      update public.attendance set clock_in = v_in, clock_out = v_out, work_hours = v_hours where id = a.id;
    else
      insert into public.attendance (id, emp_id, emp_name, date, clock_in, clock_out, work_hours, created_at)
      values ('AT' || substr(md5(random()::text || clock_timestamp()::text), 1, 12), r.emp_id, r.emp_name, r.date, v_in, v_out, v_hours, now());
    end if;
  end if;
  update public.punch_requests set status = v_status, reviewed_at = now(), reviewed_by = v_me where id = p_id;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;
revoke all on function public.fn_punch_decide(text, boolean) from public, anon;
grant execute on function public.fn_punch_decide(text, boolean) to authenticated, service_role;

-- 櫃檯（與管理員）改他人的「一般欄位」：只有 name_en／email／birthday；其餘一律拒絕（員工表守衛觸發器仍照常把關）
create or replace function public.fn_employee_update_general(p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare k text;
begin
  if not coalesce((select public.current_staff_role()) in ('admin','front_desk'), false) then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then return jsonb_build_object('ok', false, 'error_code', 'EMP.BAD_PATCH'); end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (array['name_en','email','birthday']) then
      return jsonb_build_object('ok', false, 'error_code', 'EMP.FIELD_NOT_ALLOWED:' || k); end if;
  end loop;
  update public.employees set
    name_en  = case when p_patch ? 'name_en'  then nullif(p_patch->>'name_en','')  else name_en  end,
    email    = case when p_patch ? 'email'    then nullif(p_patch->>'email','')    else email    end,
    birthday = case when p_patch ? 'birthday' then nullif(p_patch->>'birthday','')::date else birthday end
  where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'EMP.NOT_FOUND'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_employee_update_general(text, jsonb) from public, anon;
grant execute on function public.fn_employee_update_general(text, jsonb) to authenticated, service_role;

-- ===== 3) 去敏檢視（檢視以擁有者身分執行、繞過基表 RLS；各自在 where 內做身分判斷）=====
-- 去敏名單：排除薪資、證件、銀行、投保、Email、生日、到職與特休日期、邀請碼、LINE 綁定；欄位採「白名單」，日後新增欄位預設不外露。
-- phone 只有櫃檯／管理員／店長看得到（員工限定方案與場租要比對員工電話），一般教練為空。非員工（會員）整張 0 列。
create or replace view public.employees_public as
  select id, auth_id, name, nickname, name_en, role, employment_type, is_manager, is_supervisor, status, invite_status, created_at,
         emp_no, is_device, job_title, can_teach, can_substitute, need_punch, need_duty, weekly_work_days, weekly_min_shift_days,
         weekly_shift, fixed_off_days, available_slots, default_shift, resign_date, avatar_url, duty_order, duty_matrix,
         case when public.is_staff_desk() then phone end as phone
    from public.employees
   where public.is_any_staff();
-- 主管只看所管人員的到職日、年資、特休（無薪資、無證件）
create or replace view public.employees_manager_scope as
  select id, hire_date, permanent_date, promote_date, resign_date, annual_leave_total, annual_leave_used
    from public.employees where public.is_my_report(id);
-- 薪資查看（pay_view）：只含算薪必要欄位——不含身分證、銀行帳號、電話、Email、地址、投保單位／日期
create or replace view public.employees_pay as
  select id, name, role, employment_type, status, is_manager, is_supervisor,
         hire_date, permanent_date, promote_date, resign_date, birthday, birth_date, birthday_bonus_off,
         base_salary, pay_rate, pt_rate, group_rate, duty_hourly, pt_mode, pt_tiers, pt_bonus, pt_bonus_enabled, pt_bonus_mode,
         custom_salary, count_salary, pay_rules, manager_bonus, supervisor_bonus,
         leader_members, leader_t1, leader_b1, leader_t2, leader_b2,
         insurance_identity, insured_grade, labor_insurance_status, health_insurance_status, pension_status,
         weekly_work_days, need_duty
    from public.employees where public.has_hr_duty('pay_view');
-- 投保（insure）：投保明細，不含身分證與銀行帳號
create or replace view public.employees_insure as
  select id, name, status, employment_type, insurance_identity, insured_unit, insured_grade,
         insured_enroll_date, insured_withdraw_date, labor_insurance_status, health_insurance_status, pension_status
    from public.employees where public.has_hr_duty('insure');
-- 任用（employment）：到職、轉正、離職、特休
create or replace view public.employees_employment as
  select id, name, role, employment_type, job_title, status, is_manager, is_supervisor, emp_no,
         hire_date, permanent_date, promote_date, resign_date, annual_leave_total, annual_leave_used,
         al_carry_hours, al_earned_hours, al_settled_year, al_settlement, weekly_work_days, weekly_min_shift_days, need_punch, need_duty
    from public.employees where public.has_hr_duty('employment');
-- 帳號管理（系統管理員專用；與人事權限脫鉤）：建立／邀請／重設密碼／停用／LINE 綁定「真正需要」的欄位，
-- 不含薪資、單價、證件、銀行、投保、特休、生日、到職日。管理員即使關掉「自動人事權限」也能做帳號管理。
create or replace view public.employees_account as
  select id, auth_id, name, nickname, name_en, phone, email, role, status, is_manager, is_supervisor, employment_type, job_title,
         invite_status, invite_token, must_setup, line_user_id, line_bind_token, line_notify, emp_no, need_punch, can_teach, created_at
    from public.employees where public.is_admin();
revoke all on public.employees_public, public.employees_manager_scope, public.employees_pay, public.employees_insure, public.employees_employment, public.employees_account from public, anon;
grant select on public.employees_public, public.employees_manager_scope, public.employees_pay, public.employees_insure, public.employees_employment, public.employees_account to authenticated, service_role;

-- 到班狀態（給「主管」看每日值班進度用）：2b 之後主管只能讀本人與所管員工的出勤明細，
-- 全店「誰到了、誰下班了」改由這個最少欄位的檢視提供——只有今天與昨天、只有「有沒有打上班／下班」，沒有時間、沒有工時。
create or replace view public.attendance_presence as
  select emp_id, date, (clock_in is not null and clock_in <> '') as has_in, (clock_out is not null and clock_out <> '') as has_out
    from public.attendance
   where date >= (now() at time zone 'Asia/Taipei')::date - 1 and public.is_staff_desk();
revoke all on public.attendance_presence from public, anon;
grant select on public.attendance_presence to authenticated, service_role;
notify pgrst, 'reload schema';
