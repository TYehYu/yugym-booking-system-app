-- 【只裝測試庫 kucvxpjatptfckhlxptj】parity 暫補 B：正式庫有、測試庫沒有的「並存驗證依賴」。（來源與回復：TESTDB_STATE.md 第 5 節）
--  ① 變更日誌：change_log 表、fn_log_change、四張相關表的 trg_change_log、fn_table_sigs（前端簽章快取／增量補資料用）
--  ② fn_set_employment_type（主管調整僱用別；SECURITY DEFINER，靠 app.emp_type_rpc 旗標通過員工表守衛）
-- 內容取自正式庫定義（唯讀 pg_get_functiondef／information_schema 查得）；還原見 rollback_01_parity_prep_b.sql。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;

create table if not exists public.change_log (
  seq bigint generated always as identity primary key,
  tbl text not null, row_id text, op char(1), at timestamptz not null default now());
create index if not exists change_log_at_idx on public.change_log (at);
alter table public.change_log enable row level security;
grant select on public.change_log to authenticated;
grant select, insert, update, delete on public.change_log to service_role;
drop policy if exists change_log_select_staff on public.change_log;
create policy change_log_select_staff on public.change_log for select using ((select is_any_staff()));

CREATE OR REPLACE FUNCTION public.fn_log_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.change_log(tbl,row_id,op)
  values (tg_table_name,
          coalesce((case when tg_op='DELETE' then old.id else new.id end), '')::text,
          left(tg_op,1));
  return null;   -- AFTER trigger，回傳值不影響原本的寫入
end $function$;
drop trigger if exists trg_change_log on public.attendance;      create trigger trg_change_log after insert or delete or update on public.attendance      for each row execute function public.fn_log_change();
drop trigger if exists trg_change_log on public.employees;       create trigger trg_change_log after insert or delete or update on public.employees       for each row execute function public.fn_log_change();
drop trigger if exists trg_change_log on public.punch_requests;  create trigger trg_change_log after insert or delete or update on public.punch_requests  for each row execute function public.fn_log_change();
drop trigger if exists trg_change_log on public.salary_history;  create trigger trg_change_log after insert or delete or update on public.salary_history  for each row execute function public.fn_log_change();

CREATE OR REPLACE FUNCTION public.fn_table_sigs()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t text; v text; res jsonb := '{}'::jsonb;
  tabs text[] := array[
    'bookings','member_tickets','members','employees','ticket_logs','purchases',
    'attendance','shifts','notifications','purchase_applications','punch_requests',
    'member_link_requests','course_plans','ticket_types','contracts','contract_templates',
    'expenses','training_logs','exercises','venues','duty_slots','salary_templates',
    'salary_history','leave_settlements','staff_applications','reward_rules','ticket_grant_requests','line_templates',
    'invoices','member_credits','vat_periods','workout_plans','coach_exercises'
  ];
begin
  foreach t in array tabs loop
    begin
      execute format('select count(*)::text||'':''||coalesce(sum(hashtext(x::text))::text,''0'') from %I x', t) into v;
      res := res || jsonb_build_object(t, v);
    exception when others then null;
    end;
  end loop;
  begin
    select coalesce(max(at)::text,'') into v from public.change_log;
    res := res || jsonb_build_object('_log', v);
  exception when others then null;
  end;
  return res;
end $function$;
revoke all on function public.fn_table_sigs() from public, anon;
grant execute on function public.fn_table_sigs() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_set_employment_type(p_emp_id text, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_me    text := current_employee_id();
  v_admin boolean := is_admin();
  v_meRow employees%rowtype;
  v_t     employees%rowtype;
  v_ym    text := to_char((now() at time zone 'Asia/Taipei')::date,'YYYY-MM');
  v_prev  text;
  v_rules jsonb;
  v_snap  jsonb;
  v_tpl   jsonb;
  v_old   text;
  v_lb    jsonb := '{"full_time":"正職","part_time":"兼職","contractor":"合作教練","intern":"工讀"}'::jsonb;
begin
  if p_type not in ('full_time','part_time','contractor','intern') then
    return jsonb_build_object('ok',false,'error_code','TYPE.INVALID');
  end if;
  if v_me is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select * into v_meRow from employees where id=v_me;
  if not found or v_meRow.status::text <> 'active' then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  if not (v_admin or coalesce(v_meRow.is_manager,false)) then
    return jsonb_build_object('ok',false,'error_code','AUTH.NOT_MANAGER'); end if;

  select * into v_t from employees where id=p_emp_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','EMP.NOT_FOUND'); end if;
  if v_t.id = v_me then return jsonb_build_object('ok',false,'error_code','EMP.SELF'); end if;
  if v_t.role::text = 'admin' and not v_admin then
    return jsonb_build_object('ok',false,'error_code','EMP.IS_ADMIN'); end if;

  v_old := v_t.employment_type::text;
  if v_old = p_type then
    return jsonb_build_object('ok',true,'unchanged',true,'employment_type',p_type); end if;

  v_prev  := to_char((date_trunc('month', (v_ym||'-01')::date) - interval '1 month')::date,'YYYY-MM');
  v_rules := case when jsonb_typeof(v_t.pay_rules)='object' then v_t.pay_rules else '{}'::jsonb end;

  if not exists (select 1 from jsonb_object_keys(v_rules) k where k < v_ym) then
    v_rules := v_rules || jsonb_build_object(v_prev, jsonb_strip_nulls(jsonb_build_object(
      'employment_type',v_old,'need_duty',v_t.need_duty,
      'weekly_work_days',v_t.weekly_work_days,'weekly_min_shift_days',v_t.weekly_min_shift_days,
      'base_salary',v_t.base_salary,'duty_hourly',v_t.duty_hourly,
      'pt_mode',v_t.pt_mode,'pt_rate',v_t.pt_rate,'pt_tiers',v_t.pt_tiers,
      'group_rate',v_t.group_rate,'pt_bonus_enabled',v_t.pt_bonus_enabled,
      'pt_bonus_mode',v_t.pt_bonus_mode,'pt_bonus',v_t.pt_bonus,
      'custom_salary',v_t.custom_salary,'is_manager',v_t.is_manager,
      'is_supervisor',v_t.is_supervisor,'supervisor_bonus',v_t.supervisor_bonus)));
  end if;

  if v_rules ? v_ym and (v_rules->v_ym->>'employment_type') = p_type then
    v_snap := v_rules->v_ym;
  else
    select config into v_tpl from salary_templates where id = p_type;
    v_tpl := coalesce(v_tpl,'{}'::jsonb);
    v_snap := jsonb_strip_nulls(jsonb_build_object(
      'employment_type', p_type,
      'need_duty',      case when p_type='contractor' then false else coalesce(v_t.need_duty,true) end,
      'weekly_work_days',      case when p_type='full_time' then v_t.weekly_work_days else null end,
      'weekly_min_shift_days', case when p_type='part_time' then v_t.weekly_min_shift_days else null end,
      'base_salary',    coalesce((v_tpl->>'base_salary')::numeric,0),
      'duty_hourly',    coalesce((v_tpl->>'duty_hourly')::numeric,0),
      'pt_mode',        coalesce(v_tpl->>'pt_mode','flat'),
      'pt_rate',        coalesce((v_tpl->>'pt_rate')::numeric,0),
      'pt_tiers',       coalesce(v_tpl->'pt_tiers','[]'::jsonb),
      'group_rate',     coalesce((v_tpl->>'group_per_head')::numeric,0),
      'pt_bonus_enabled', (p_type='full_time'),
      'pt_bonus_mode',  coalesce(v_t.pt_bonus_mode,'cumulative'),
      'pt_bonus',       coalesce(v_tpl->'pt_bonus','[]'::jsonb),
      'custom_salary',  true,
      'is_manager',     coalesce(v_t.is_manager,false),
      'is_supervisor',  coalesce(v_t.is_supervisor,false),
      'supervisor_bonus', v_t.supervisor_bonus));
  end if;
  v_rules := v_rules || jsonb_build_object(v_ym, v_snap);

  perform set_config('app.emp_type_rpc','1', true);   -- 只放行僱用別那一組欄位
  update employees set
    pay_rules        = v_rules,
    employment_type  = p_type::employment_type,
    need_duty        = coalesce((v_snap->>'need_duty')::boolean, need_duty),
    weekly_work_days      = nullif(v_snap->>'weekly_work_days','')::int,
    weekly_min_shift_days = nullif(v_snap->>'weekly_min_shift_days','')::int,
    base_salary      = coalesce((v_snap->>'base_salary')::numeric, 0),
    duty_hourly      = coalesce((v_snap->>'duty_hourly')::numeric, 0),
    pt_mode          = coalesce(v_snap->>'pt_mode','flat'),
    pt_rate          = coalesce((v_snap->>'pt_rate')::numeric, 0),
    pay_rate         = coalesce((v_snap->>'pt_rate')::numeric, 0),
    pt_tiers         = coalesce(v_snap->'pt_tiers','[]'::jsonb),
    group_rate       = coalesce((v_snap->>'group_rate')::numeric, 0),
    pt_bonus_enabled = coalesce((v_snap->>'pt_bonus_enabled')::boolean, false),
    pt_bonus         = coalesce(v_snap->'pt_bonus','[]'::jsonb),
    custom_salary    = true
  where id = v_t.id;
  perform set_config('app.emp_type_rpc','', true);    -- 立刻熄掉，不要蓋住後面的寫入

  begin
    insert into notifications (id, recipient_type, recipient_id, type, title, body, read, created_at)
    values (gen_short_id('NT-'),'desk','desk','emp_type',
            coalesce(v_meRow.name,v_me)||'　調整了僱用別',
            coalesce(v_t.name,v_t.id)||'：'||coalesce(v_lb->>v_old,v_old)||' → '
            ||coalesce(v_lb->>p_type,p_type)||'（'||replace(v_ym,'-','/')||' 起）',
            false, now());
  exception when others then null;
  end;

  return jsonb_build_object('ok',true,'employment_type',p_type,'ym',v_ym,'from',v_old);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;
revoke all on function public.fn_set_employment_type(text, text) from public, anon;
grant execute on function public.fn_set_employment_type(text, text) to authenticated, service_role;
notify pgrst, 'reload schema';
