-- 人事權限 2b 收權階段：收回舊權限（補打卡直寫、教練／櫃檯讀全員員工表、櫃檯／主管讀薪資歷史、主管讀全員出勤），掛出勤守衛觸發器。前提：2a 已套用、新版前端（v261122.2330 以後）已上線並通過各角色驗收、管轄名單與人事職責已匯入。
-- 回復：先跑 14_hr_perm_2b_rollback_prod.sql（恢復權限），再退前端。
-- ⚠ 只供審查；正式庫尚未執行，必須取得使用者明確授權。單一交易：前置核對→套用→提交前核對，任何一項不符整筆回滾（沒有任何變更）。
-- 組檔：python3 docs/prod-release/build_hr_release.py prod（由已驗證的 migration／rollback 本體組成，檔尾有 sha256 紀錄在 HR_PERM_FINGERPRINTS.sha256）。
begin;
set local lock_timeout = '5s';
create or replace function pg_temp.hr_fp(p_fn text[], p_pol text[], p_trg text[], p_gr text[], p_rel text[], p_col text[]) returns jsonb language sql stable as $f$
  select jsonb_build_object(
    '函式', (select md5(coalesce(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text),'')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname <> all(p_fn)),
    '政策', (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename <> all(p_pol) and tablename <> all(p_gr)),
    '觸發器', (select md5(coalesce(string_agg(c.relname||'.'||t.tgname||'|'||pg_get_triggerdef(t.oid),E'\n' order by c.relname,t.tgname),'')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace and (c.relname||'.'||t.tgname) <> all(p_trg)),
    '權限', (select md5(coalesce(string_agg(table_name||'|'||grantee||'|'||privilege_type,'|' order by table_name,grantee,privilege_type),'')) from information_schema.role_table_grants where table_schema='public' and table_name <> all(p_gr)),
    '資料表與檢視', (select md5(coalesce(string_agg(relname||':'||relkind::text,',' order by relname),'')) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m') and relname <> all(p_rel)),
    '欄位', (select md5(coalesce(string_agg(table_name||'.'||column_name||':'||data_type,',' order by table_name,column_name),'')) from information_schema.columns where table_schema='public' and column_name <> all(p_col) and table_name <> all(p_rel) and table_name in (select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m'))))
$f$;
do $guard$
begin
  if not ((select system_identifier::text from pg_control_system()) = '7637215626725903220') then raise exception 'HR2B.GUARD: 叢集識別不是預期的資料庫，停止（沒有任何變更）'; end if;
  if not (select count(*) = 5 from pg_proc where pronamespace='public'::regnamespace and proname in ('is_admin','is_staff_desk','is_any_staff','current_employee_id','current_staff_role')) then raise exception 'HR2B.GUARD: 缺少既有輔助函式'; end if;
  if coalesce((select md5(replace(prosrc,E'\r','')) from pg_proc where pronamespace='public'::regnamespace and proname='is_admin' limit 1),'') <> 'e9524c48778ed89cd51ad256e21a5855' then raise exception 'HR2B.GUARD: 輔助函式 is_admin 不是已核對的版本'; end if;
  if coalesce((select md5(replace(prosrc,E'\r','')) from pg_proc where pronamespace='public'::regnamespace and proname='is_staff_desk' limit 1),'') <> '4843a4de4f5b8e68d141c48215596234' then raise exception 'HR2B.GUARD: 輔助函式 is_staff_desk 不是已核對的版本'; end if;
  if coalesce((select md5(replace(prosrc,E'\r','')) from pg_proc where pronamespace='public'::regnamespace and proname='is_any_staff' limit 1),'') <> 'f2bf84a74a15a0ee806eca816891aa16' then raise exception 'HR2B.GUARD: 輔助函式 is_any_staff 不是已核對的版本'; end if;
  if coalesce((select md5(replace(prosrc,E'\r','')) from pg_proc where pronamespace='public'::regnamespace and proname='current_employee_id' limit 1),'') <> '28c487679391b2ef4094c9e5ab014e81' then raise exception 'HR2B.GUARD: 輔助函式 current_employee_id 不是已核對的版本'; end if;
  if coalesce((select md5(replace(prosrc,E'\r','')) from pg_proc where pronamespace='public'::regnamespace and proname='current_staff_role' limit 1),'') <> 'a68e61e1739e0fb15658f32dd70a2c0f' then raise exception 'HR2B.GUARD: 輔助函式 current_staff_role 不是已核對的版本'; end if;
  if not (select count(*) = 6 from pg_proc where pronamespace='public'::regnamespace and proname = any(array['admin_full_hr','has_hr_duty','is_my_report','fn_my_hr_access','fn_punch_decide','fn_employee_update_general'])) then raise exception 'HR2B.GUARD: 2a 尚未套用（缺新函式）'; end if;
  if not (select count(*) = 10 from pg_class where relnamespace='public'::regnamespace and relname = any(array['hr_grants','manager_scope','hr_settings','employees_public','employees_manager_scope','employees_pay','employees_insure','employees_employment','employees_account','attendance_presence'])) then raise exception 'HR2B.GUARD: 2a 尚未套用（缺新資料表／檢視）'; end if;
  if exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) or exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_attendance_self_guard') then raise exception 'HR2B.GUARD: 2b 已套用過，停止'; end if;
  if (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename = any(array['employees','punch_requests','attendance','salary_history'])) <> '6632d2f1681c741deef8f7248f98e196' then raise exception 'HR2B.GUARD: 四張表的現行政策不是已核對的原貌（指紋不符），停止'; end if;
  -- 主管管轄名單：每位在職主管至少要有一筆；否則 2b 之後該主管看不到任何人的出勤／申請。要刻意放行：先 set hr.allow_empty_scope = '1'（本次交易）
  if coalesce(current_setting('hr.allow_empty_scope', true),'') <> '1' and exists (select 1 from public.employees e where coalesce(e.is_manager,false) and e.status::text='active' and not exists (select 1 from public.manager_scope s where s.manager_id=e.id)) then raise exception 'HR2B.GUARD: 有在職主管沒有管轄名單（manager_scope）；請先匯入名單，或刻意放行（set hr.allow_empty_scope = ''1''）'; end if;
  create temp table _hr2b_pre on commit drop as select pg_temp.hr_fp(array['fn_attendance_self_guard']::text[],array['employees','punch_requests','attendance','salary_history']::text[],array['attendance.trg_attendance_self_guard']::text[],array[]::text[],array[]::text[],array[]::text[]) fp;
end
$guard$;

-- 人事權限修補 2b「收權階段」。2026-11-19 起草。
-- ⚠ 只套「測試庫 kucvxpjatptfckhlxptj」驗證。正式庫 rlpiomzplckzqnqrvrwc 未執行，須使用者明確授權。
-- 前提：2a 已套用、新版前端（v261118.0930 以後）已上線並通過各角色驗收。**前端沒更新就套 2b，教練／櫃檯／主管只會看到自己 1 列員工。**
-- 回復：rollback_2b_hr_perm_revoke.sql（先恢復權限，再退前端）。
--
-- 仍開著「舊頁面」（2b 之後尚未重新整理的分頁／舊 PWA）的相容情況：
--   ① 非管理員：員工名單只剩自己 1 列 → 教練名單、行事曆教練欄、員工限定方案比對會缺人，重新整理即恢復。
--   ② 補打卡：舊頁面的「核准／駁回」是直接改表 → 任何角色（含管理員）都會「權限不足」；重新整理後改走 fn_punch_decide。
--      舊頁面的「送出申請」不受影響（本人新增 pending 仍允許）。
--   ③ 打卡：舊頁面的上班／下班打卡不受影響，但時間改由伺服器決定（舊頁面顯示的時間可能與伺服器記錄差幾秒到一分鐘，重新整理後以伺服器為準）；
--      「取消今日下班」只有按下後 10 分鐘內有效，超過會被擋並提示改走補打卡申請。
--   ④ 薪資歷史頁：管理員不受影響（過渡期自動擁有）；其他人本來就看不到。
-- PWA：sw.js 以 HEAD 比對指紋、換版後約 6 秒背景抓新版，下一次開啟才生效；上線 2b 前務必先確認各裝置已更新（APP_VERSION 檢查會提示重新整理）。

-- ===== 1) 補打卡：本人／櫃檯只能送出；核准／駁回一律走 fn_punch_decide（任何角色都沒有直接 UPDATE）=====
drop policy if exists pr_self  on public.punch_requests;
drop policy if exists pr_staff on public.punch_requests;
drop policy if exists pr_read_admin on public.punch_requests;
drop policy if exists pr_read_self on public.punch_requests;
drop policy if exists pr_read_desk on public.punch_requests;
drop policy if exists pr_read_scope on public.punch_requests;
drop policy if exists pr_ins_self on public.punch_requests;
drop policy if exists pr_ins_desk on public.punch_requests;
drop policy if exists pr_del_admin on public.punch_requests;
create policy pr_read_admin on public.punch_requests for select to authenticated using ((select is_admin()));
create policy pr_read_self  on public.punch_requests for select to authenticated using (emp_id = (select current_employee_id()));
create policy pr_read_desk  on public.punch_requests for select to authenticated using ((select current_staff_role()) = 'front_desk');
create policy pr_read_scope on public.punch_requests for select to authenticated using ((select public.is_my_report(emp_id)));
create policy pr_ins_self   on public.punch_requests for insert to authenticated with check (
  emp_id = (select current_employee_id()) and status = 'pending' and reviewed_at is null and reviewed_by is null
  and (requested_by is null or requested_by = (select current_employee_id())));
create policy pr_ins_desk   on public.punch_requests for insert to authenticated with check (
  (select current_staff_role()) in ('front_desk','admin') and status = 'pending' and reviewed_at is null and reviewed_by is null
  and requested_by = (select current_employee_id()));
create policy pr_del_admin  on public.punch_requests for delete to authenticated using ((select is_admin()));   -- 維持現行：管理員可清除（資料維護）

-- ===== 2) 出勤：正常打卡時間由「伺服器」決定；既有時間本人不能直接改，歷史更正走補打卡核准 =====
-- 只管「以 authenticated 身分直接寫表」：定義者函式（fn_punch_decide）、service_role、後台 SQL 不受影響；管理員維持可直接更正。
--  ・第一次打卡（INSERT）：只能是今天、只能記上班；前端送什麼時間都會被換成伺服器現在時間（台北）。
--  ・補下班（空白→有值）：下班時間＝伺服器現在時間；工時由伺服器重算（前端傳的工時、時間一律不採信）。
--  ・已有的上班／下班／工時／員工／日期／備註／更正紀錄：本人不能改。
--  ・按錯取消下班：只限今天、且下班打卡後 10 分鐘內；之後的更正走補打卡申請。
--  ・補下班的列只能是今天或前一天（跨午夜班）。
--  ・upsert 的衝突路徑（前端 dbPut 用的寫法）：INSERT 階段發現同員工同日／同 id 已有列就放行，交給 UPDATE 階段逐欄判斷。
create or replace function public.fn_attendance_self_guard() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Taipei';
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_hm text := to_char(now() at time zone 'Asia/Taipei', 'HH24:MI');
  v_nowmin int := extract(hour from now() at time zone 'Asia/Taipei')::int * 60 + extract(minute from now() at time zone 'Asia/Taipei')::int;
  v_mins int;
begin
  if current_user <> 'authenticated' then return new; end if;
  -- 舊頁面保護（ACCEPTANCE_REPORT 5.3）：舊版核准是「先直接寫出勤、再直接改申請狀態」。2b 之後第二步一定被擋，
  -- 若第一步放行就會留下半套變更。所以：任何人（含管理員）直接寫「別人那一天」的出勤，而那天還有待審的補打卡申請 → 整筆拒絕，
  -- 舊頁面的核准在第一步就明確失敗、什麼都沒寫；新版走 fn_punch_decide（定義者函式，不受此限）。本人自己的打卡不受影響。
  if new.emp_id is distinct from public.current_employee_id()
     and exists (select 1 from public.punch_requests pr where pr.emp_id = new.emp_id and pr.date = new.date and pr.status = 'pending') then
    raise exception 'ATT.PENDING_REQUEST: 這一天有待審的補打卡申請，請先核准或駁回（若頁面是舊版，請先重新整理）';
  end if;
  if coalesce(public.is_admin(), false) then return new; end if;
  if tg_op = 'INSERT' then
    if new.emp_id is distinct from public.current_employee_id() then raise exception 'ATT.NOT_SELF'; end if;
    if exists (select 1 from public.attendance a where a.id = new.id or (a.emp_id = new.emp_id and a.date = new.date)) then return new; end if;
    if new.date is distinct from v_today then raise exception 'ATT.DATE_WINDOW: 只能新增今天的打卡；事後更正請送補打卡申請'; end if;
    if new.clock_out is not null or new.work_hours is not null then raise exception 'ATT.LOCKED: 第一次打卡只能記上班；下班請用下班打卡，時間由系統決定'; end if;
    if new.clock_in is not null then new.clock_in := v_hm; end if;
    return new;
  end if;
  -- UPDATE
  if new.emp_id is distinct from old.emp_id or new.date is distinct from old.date then raise exception 'ATT.LOCKED: 員工與日期不可改'; end if;
  if new.note is distinct from old.note or new.fixed_by is distinct from old.fixed_by or new.fixed_at is distinct from old.fixed_at then
    raise exception 'ATT.LOCKED: 備註與更正紀錄不可自行修改'; end if;
  if (new.clock_in is distinct from old.clock_in or new.clock_out is distinct from old.clock_out) and old.date < v_today - 1 then
    raise exception 'ATT.DATE_WINDOW: 超過一天的打卡不可直接修改，請送補打卡申請'; end if;
  if old.clock_in is not null then
    if new.clock_in is distinct from old.clock_in then raise exception 'ATT.LOCKED: 已打的上班時間不可直接改，請送補打卡申請'; end if;
  elsif new.clock_in is not null then
    new.clock_in := v_hm;
  end if;
  if old.clock_out is not null then
    if new.clock_out is distinct from old.clock_out then
      if new.clock_out is null and old.date = v_today
         and (v_nowmin - (split_part(old.clock_out, ':', 1)::int * 60 + split_part(old.clock_out, ':', 2)::int)) between 0 and 10 then
        new.work_hours := null;     -- 按錯取消下班（10 分鐘內）
      else
        raise exception 'ATT.LOCKED: 已打的下班時間不可直接改（取消下班只限 10 分鐘內），請送補打卡申請';
      end if;
    end if;
  elsif new.clock_out is not null then
    new.clock_out := v_hm;
    if new.clock_in is not null then
      v_mins := (split_part(new.clock_out, ':', 1)::int * 60 + split_part(new.clock_out, ':', 2)::int) - (split_part(new.clock_in, ':', 1)::int * 60 + split_part(new.clock_in, ':', 2)::int);
      if v_mins < 0 then v_mins := v_mins + 1440; end if;
      new.work_hours := round(v_mins / 30.0) / 2.0;
    else
      new.work_hours := null;
    end if;
  end if;
  if new.work_hours is distinct from old.work_hours and not (old.clock_out is null and new.clock_out is not null) and not (old.clock_out is not null and new.clock_out is null) then
    raise exception 'ATT.LOCKED: 工時不可直接改，請送補打卡申請'; end if;
  return new;
end $$;
revoke all on function public.fn_attendance_self_guard() from public, anon;
drop trigger if exists trg_attendance_self_guard on public.attendance;
create trigger trg_attendance_self_guard before insert or update on public.attendance for each row execute function public.fn_attendance_self_guard();

-- ===== 2b) 主管只讀「本人與所管員工」的出勤明細（工時隨明細）；全店到班狀態改讀 attendance_presence（2a）=====
-- 管理員、櫃檯維持全部；本人讀自己（att_self_read）不動。
drop policy if exists att_staff_read on public.attendance;
create policy att_staff_read on public.attendance for select
  using ((select current_staff_role()) in ('admin','front_desk') or (select public.is_my_report(emp_id)));

-- ===== 3) 員工表：基表只給「本人」與「具完整人事權限的管理員」（admin_full_hr）=====
-- 其他人讀 employees_public；薪資／投保／任用人員讀各自職責的檢視；系統管理員關閉自動人事權限後，帳號管理改讀 employees_account。
drop policy if exists employees_select_all_coach on public.employees;
drop policy if exists employees_select on public.employees;
drop policy if exists employees_update on public.employees;
drop policy if exists employees_select_v2 on public.employees;
drop policy if exists employees_update_v2 on public.employees;
create policy employees_select_v2 on public.employees for select to authenticated
  using (auth_id = (select auth.uid()) or (select public.admin_full_hr()));
create policy employees_update_v2 on public.employees for update to authenticated
  using      (((select public.admin_full_hr()) or auth_id = (select auth.uid())) and invite_status is distinct from 'pending')
  with check (((select public.admin_full_hr()) or auth_id = (select auth.uid())) and invite_status is distinct from 'pending');

-- ===== 4) 薪資歷史（salary_history：匯入的歷史月薪）：pay_view 職責（過渡期含管理員）／本人 =====
drop policy if exists sh_read on public.salary_history;
drop policy if exists sh_read_hr on public.salary_history;
drop policy if exists sh_write on public.salary_history;
drop policy if exists sh_write_ins on public.salary_history;
drop policy if exists sh_write_upd on public.salary_history;
drop policy if exists sh_write_del on public.salary_history;
create policy sh_read_hr on public.salary_history for select to authenticated using ((select public.has_hr_duty('pay_view')));
-- 既有 sh_write 是 FOR ALL（連 SELECT 都放行管理員）→ 拆成只管寫入的三條（仍僅管理員）。sh_self（本人讀自己）不動。
create policy sh_write_ins on public.salary_history for insert to authenticated with check ((select is_admin()));
create policy sh_write_upd on public.salary_history for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy sh_write_del on public.salary_history for delete to authenticated using ((select is_admin()));
notify pgrst, 'reload schema';

do $post$
declare v_diff text;
begin
  select string_agg(e.key, '、') into v_diff from jsonb_each(pg_temp.hr_fp(array['fn_attendance_self_guard']::text[],array['employees','punch_requests','attendance','salary_history']::text[],array['attendance.trg_attendance_self_guard']::text[],array[]::text[],array[]::text[],array[]::text[])) e where e.value is distinct from ((select fp from _hr2b_pre) -> e.key);
  if v_diff is not null then raise exception 'HR2B.POST: 其他物件變了（{%}），整筆回滾', v_diff; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='punch_requests'),'') <> 'pr_del_admin,pr_ins_desk,pr_ins_self,pr_read_admin,pr_read_desk,pr_read_scope,pr_read_self' then raise exception 'HR2B.POST: punch_requests 的政策清單不是2b 預期的清單'; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='attendance'),'') <> 'att_admin,att_self_ins,att_self_read,att_self_upd,att_staff_read' then raise exception 'HR2B.POST: attendance 的政策清單不是2b 預期的清單'; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='employees'),'') <> 'employees_delete,employees_insert_admin,employees_select_v2,employees_update_v2' then raise exception 'HR2B.POST: employees 的政策清單不是2b 預期的清單'; end if;
  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='salary_history'),'') <> 'sh_read_hr,sh_self,sh_write_del,sh_write_ins,sh_write_upd' then raise exception 'HR2B.POST: salary_history 的政策清單不是2b 預期的清單'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='attendance' and policyname='att_staff_read' and qual like '%is_my_report%') then raise exception 'HR2B.POST: att_staff_read 不是主管範圍版'; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='attendance' and t.tgname='trg_attendance_self_guard' and not t.tgisinternal and t.tgenabled='O') <> 1 then raise exception 'HR2B.POST: 出勤守衛觸發器沒掛好'; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='attendance' and t.tgname='trg_change_log' and not t.tgisinternal) <> 1 then raise exception 'HR2B.POST: 變更日誌觸發器被動到'; end if;
  if has_function_privilege('anon', 'public.fn_attendance_self_guard()', 'execute') then raise exception 'HR2B.POST: anon 不得執行出勤守衛函式'; end if;
end
$post$;
commit;
