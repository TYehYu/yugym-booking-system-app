#!/usr/bin/env python3
"""由已驗證的 migration／rollback 本體＋前置核對／提交前核對包成「單一交易」發布檔（人事權限 2a／2b）。
用法：python3 docs/prod-release/build_hr_release.py prod  [輸出目錄=docs/prod-release]
      python3 docs/prod-release/build_hr_release.py test  <輸出目錄>      # 測試庫彩排用（叢集換成測試庫；去掉 begin/commit，方便包進外層交易）
⚠ 本檔只組檔，不連資料庫。正式庫發布須先取得使用者明確授權。"""
import sys, os, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
mode = sys.argv[1] if len(sys.argv) > 1 else 'prod'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'prod-release')
CLUSTER = {'prod': '7637215626725903220', 'test': '7662742571317219726'}[mode]
# 正式庫實測釘住值（2026-11-22 唯讀查得）：測試庫彩排時「先把四張表的政策對齊成正式庫原貌」，所以同一組釘住值兩邊都適用。
POL4 = '6632d2f1681c741deef8f7248f98e196'   # employees／punch_requests／attendance／salary_history 共 15 條政策的指紋（含 roles、qual、with_check）
FN_PINS = {'is_admin': 'e9524c48778ed89cd51ad256e21a5855', 'is_staff_desk': '4843a4de4f5b8e68d141c48215596234', 'is_any_staff': 'f2bf84a74a15a0ee806eca816891aa16',
           'current_employee_id': '28c487679391b2ef4094c9e5ab014e81', 'current_staff_role': 'a68e61e1739e0fb15658f32dd70a2c0f'}
NEW_TABLES = ['hr_grants', 'manager_scope', 'hr_settings']
NEW_VIEWS = ['employees_public', 'employees_manager_scope', 'employees_pay', 'employees_insure', 'employees_employment', 'employees_account', 'attendance_presence']
NEW_FUNCS_2A = ['admin_full_hr', 'has_hr_duty', 'is_my_report', 'fn_my_hr_access', 'fn_punch_decide', 'fn_employee_update_general']
NEW_COLS = ['requested_by', 'reviewed_by']
EMP_COLS = ['id','auth_id','name','nickname','name_en','role','employment_type','is_manager','is_supervisor','status','invite_status','created_at','emp_no','is_device','job_title','can_teach','can_substitute','need_punch','need_duty','weekly_work_days','weekly_min_shift_days','weekly_shift','fixed_off_days','available_slots','default_shift','resign_date','avatar_url','duty_order','duty_matrix','phone','hire_date','permanent_date','promote_date','annual_leave_total','annual_leave_used','birthday','birth_date','birthday_bonus_off','base_salary','pay_rate','pt_rate','group_rate','duty_hourly','pt_mode','pt_tiers','pt_bonus','pt_bonus_enabled','pt_bonus_mode','custom_salary','count_salary','pay_rules','manager_bonus','supervisor_bonus','leader_members','leader_t1','leader_b1','leader_t2','leader_b2','insurance_identity','insured_grade','labor_insurance_status','health_insurance_status','pension_status','insured_unit','insured_enroll_date','insured_withdraw_date','al_carry_hours','al_earned_hours','al_settled_year','al_settlement','email','invite_token','must_setup','line_user_id','line_bind_token','line_notify']
ATT_COLS = ['id','emp_id','emp_name','date','clock_in','clock_out','work_hours','created_at','note','fixed_by','fixed_at']
Q = lambda xs: "array[" + ",".join("'" + x + "'" for x in xs) + "]"

def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read().rstrip() + "\n"
MIG_2A = read('docs/migrations/20261119a_hr_perm_compat.sql')
MIG_2B = read('docs/migrations/20261119b_hr_perm_revoke.sql')
RB_2A = read('docs/hr-perm/rollback_2a_hr_perm_compat.sql')
RB_2B = read('docs/hr-perm/rollback_2b_hr_perm_revoke.sql')

# ---- 指紋：用「本交易內的暫時函式 pg_temp.hr_fp」計算（交易結束即消失，不留任何物件）。排除「本次會新增／改變」的物件，其餘一律必須前後相同 ----
HR_FP = """create or replace function pg_temp.hr_fp(p_fn text[], p_pol text[], p_trg text[], p_gr text[], p_rel text[], p_col text[]) returns jsonb language sql stable as $f$
  select jsonb_build_object(
    '函式', (select md5(coalesce(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text),'')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname <> all(p_fn)),
    '政策', (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename <> all(p_pol) and tablename <> all(p_gr)),
    '觸發器', (select md5(coalesce(string_agg(c.relname||'.'||t.tgname||'|'||pg_get_triggerdef(t.oid),E'\\n' order by c.relname,t.tgname),'')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace and (c.relname||'.'||t.tgname) <> all(p_trg)),
    '權限', (select md5(coalesce(string_agg(table_name||'|'||grantee||'|'||privilege_type,'|' order by table_name,grantee,privilege_type),'')) from information_schema.role_table_grants where table_schema='public' and table_name <> all(p_gr)),
    '資料表與檢視', (select md5(coalesce(string_agg(relname||':'||relkind::text,',' order by relname),'')) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m') and relname <> all(p_rel)),
    '欄位', (select md5(coalesce(string_agg(table_name||'.'||column_name||':'||data_type,',' order by table_name,column_name),'')) from information_schema.columns where table_schema='public' and column_name <> all(p_col) and table_name <> all(p_rel) and table_name in (select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v','m'))))
$f$;
"""
def fp_call(fnx, polx, trgx, grx, relx, colx): return f"pg_temp.hr_fp({Q(fnx)}::text[],{Q(polx)}::text[],{Q(trgx)}::text[],{Q(grx)}::text[],{Q(relx)}::text[],{Q(colx)}::text[])"
def pre_table(name, fnx, polx, trgx, grx, relx, colx):
    return f"create temp table {name} on commit drop as select {fp_call(fnx, polx, trgx, grx, relx, colx)} fp;"
def same(name, fnx, polx, trgx, grx, relx, colx, tag):
    return (f"  select string_agg(e.key, '、') into v_diff from jsonb_each({fp_call(fnx, polx, trgx, grx, relx, colx)}) e where e.value is distinct from ((select fp from {name}) -> e.key);\n"
            f"  if v_diff is not null then raise exception '{tag}.POST: 其他物件變了（{{%}}），整筆回滾', v_diff; end if;")

GUARD_CLUSTER = lambda tag: f"  if not ((select system_identifier::text from pg_control_system()) = '{CLUSTER}') then raise exception '{tag}.GUARD: 叢集識別不是預期的資料庫，停止（沒有任何變更）'; end if;"
DEPS = lambda tag: ("  if not (select count(*) = 5 from pg_proc where pronamespace='public'::regnamespace and proname in ('is_admin','is_staff_desk','is_any_staff','current_employee_id','current_staff_role')) then raise exception '" + tag + ".GUARD: 缺少既有輔助函式'; end if;\n" +
    "\n".join(f"  if coalesce((select md5(replace(prosrc,E'\\r','')) from pg_proc where pronamespace='public'::regnamespace and proname='{k}' limit 1),'') <> '{v}' then raise exception '{tag}.GUARD: 輔助函式 {k} 不是已核對的版本'; end if;" for k, v in FN_PINS.items()))
FRAME_OPEN = "begin;\nset local lock_timeout = '5s';\n" if mode == 'prod' else "set local lock_timeout = '5s';\n"
FRAME_CLOSE = "commit;\n" if mode == 'prod' else ""
HDR = lambda title: (f"-- {title}\n-- ⚠ 只供審查；正式庫尚未執行，必須取得使用者明確授權。單一交易：前置核對→套用→提交前核對，任何一項不符整筆回滾（沒有任何變更）。\n"
                     f"-- 組檔：python3 docs/prod-release/build_hr_release.py {mode}（由已驗證的 migration／rollback 本體組成，檔尾有 sha256 紀錄在 HR_PERM_FINGERPRINTS.sha256）。\n")

def apply_2a():
    pre = pre_table('_hr2a_pre', NEW_FUNCS_2A, [], [], NEW_TABLES + NEW_VIEWS, NEW_TABLES + NEW_VIEWS, NEW_COLS)
    guard = f"""do $guard$
begin
{GUARD_CLUSTER('HR2A')}
{DEPS('HR2A')}
  if not (select count(*) = 4 from pg_class where relnamespace='public'::regnamespace and relname in ('employees','punch_requests','attendance','salary_history') and relkind='r') then raise exception 'HR2A.GUARD: 缺少既有資料表'; end if;
  if not ((select count(*) from information_schema.columns where table_schema='public' and table_name='employees' and column_name = any({Q(EMP_COLS)})) = {len(EMP_COLS)}) then raise exception 'HR2A.GUARD: employees 缺少新檢視要引用的欄位'; end if;
  if not ((select count(*) from information_schema.columns where table_schema='public' and table_name='attendance' and column_name = any({Q(ATT_COLS)})) = {len(ATT_COLS)}) then raise exception 'HR2A.GUARD: attendance 缺少欄位'; end if;
  if exists (select 1 from pg_class where relnamespace='public'::regnamespace and relname = any({Q(NEW_TABLES + NEW_VIEWS)})) then raise exception 'HR2A.GUARD: 新資料表／檢視名稱已被占用，停止（不覆蓋）'; end if;
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname = any({Q(NEW_FUNCS_2A)})) then raise exception 'HR2A.GUARD: 新函式名稱已被占用，停止（不覆蓋）'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='punch_requests' and column_name = any({Q(NEW_COLS)})) then raise exception 'HR2A.GUARD: punch_requests 已有 requested_by／reviewed_by，停止（請先人工核對）'; end if;
  {pre}
end
$guard$;
"""
    post = f"""do $post$
declare v_n int; v_diff text;
begin
{same('_hr2a_pre', NEW_FUNCS_2A, [], [], NEW_TABLES + NEW_VIEWS, NEW_TABLES + NEW_VIEWS, NEW_COLS, 'HR2A')}
  if (select count(*) from pg_class where relnamespace='public'::regnamespace and relname = any({Q(NEW_TABLES + NEW_VIEWS)})) <> {len(NEW_TABLES + NEW_VIEWS)} then raise exception 'HR2A.POST: 新資料表／檢視沒有建齊'; end if;
  select count(*) into v_n from pg_proc p where p.pronamespace='public'::regnamespace and p.proname = any({Q(NEW_FUNCS_2A)}) and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') = 'search_path=public, pg_temp' and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute');
  if v_n <> {len(NEW_FUNCS_2A)} then raise exception 'HR2A.POST: 新函式的 security definer／search_path／權限不符（anon 不得執行、authenticated 要能執行）'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','PUBLIC') and table_name = any({Q(NEW_TABLES + NEW_VIEWS)})) then raise exception 'HR2A.POST: anon／PUBLIC 不得對新表或新檢視有任何權限'; end if;
  if not (select bool_and(has_table_privilege('authenticated', 'public.'||n, 'select')) from unnest({Q(NEW_VIEWS)}) n) then raise exception 'HR2A.POST: authenticated 要能讀新檢視'; end if;
  if (select value from public.hr_settings where key='admin_implicit_hr') is distinct from 'true' then raise exception 'HR2A.POST: admin_implicit_hr 預設值不是 true'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='punch_requests' and column_name = any({Q(NEW_COLS)})) <> 2 then raise exception 'HR2A.POST: punch_requests 新欄位沒建齊'; end if;
end
$post$;
"""
    return HDR('人事權限 2a 相容階段：只新增（3 張表、7 個檢視、6 支函式、補打卡 2 欄），不改任何既有政策／觸發器／函式／權限；舊前端照常運作。回復：14 之前先退 2b，再跑 13_hr_perm_2a_rollback_prod.sql') + FRAME_OPEN + HR_FP + guard + "\n" + MIG_2A + "\n" + post + FRAME_CLOSE

TABLES4 = ['employees', 'punch_requests', 'attendance', 'salary_history']
POL_2B = {'punch_requests': 'pr_del_admin,pr_ins_desk,pr_ins_self,pr_read_admin,pr_read_desk,pr_read_scope,pr_read_self',
          'attendance': 'att_admin,att_self_ins,att_self_read,att_self_upd,att_staff_read',
          'employees': 'employees_delete,employees_insert_admin,employees_select_v2,employees_update_v2',
          'salary_history': 'sh_read_hr,sh_self,sh_write_del,sh_write_ins,sh_write_upd'}
POL_ORIG = {'punch_requests': 'pr_self,pr_staff', 'attendance': 'att_admin,att_self_ins,att_self_read,att_self_upd,att_staff_read',
            'employees': 'employees_delete,employees_insert_admin,employees_select,employees_select_all_coach,employees_update', 'salary_history': 'sh_read,sh_self,sh_write'}
def names_check(expected, tag, label):
    return "\n".join(f"  if coalesce((select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname='public' and tablename='{t}'),'') <> '{v}' then raise exception '{tag}: {t} 的政策清單不是{label}'; end if;" for t, v in expected.items())

def apply_2b():
    fnx = ['fn_attendance_self_guard']; trgx = ['attendance.trg_attendance_self_guard']
    pre = pre_table('_hr2b_pre', fnx, TABLES4, trgx, [], [], [])
    guard = f"""do $guard$
begin
{GUARD_CLUSTER('HR2B')}
{DEPS('HR2B')}
  if not (select count(*) = {len(NEW_FUNCS_2A)} from pg_proc where pronamespace='public'::regnamespace and proname = any({Q(NEW_FUNCS_2A)})) then raise exception 'HR2B.GUARD: 2a 尚未套用（缺新函式）'; end if;
  if not (select count(*) = {len(NEW_TABLES + NEW_VIEWS)} from pg_class where relnamespace='public'::regnamespace and relname = any({Q(NEW_TABLES + NEW_VIEWS)})) then raise exception 'HR2B.GUARD: 2a 尚未套用（缺新資料表／檢視）'; end if;
  if exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) or exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_attendance_self_guard') then raise exception 'HR2B.GUARD: 2b 已套用過，停止'; end if;
  if (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename = any({Q(TABLES4)})) <> '{POL4}' then raise exception 'HR2B.GUARD: 四張表的現行政策不是已核對的原貌（指紋不符），停止'; end if;
  -- 主管管轄名單：每位在職主管至少要有一筆；否則 2b 之後該主管看不到任何人的出勤／申請。要刻意放行：先 set hr.allow_empty_scope = '1'（本次交易）
  if coalesce(current_setting('hr.allow_empty_scope', true),'') <> '1' and exists (select 1 from public.employees e where coalesce(e.is_manager,false) and e.status::text='active' and not exists (select 1 from public.manager_scope s where s.manager_id=e.id)) then raise exception 'HR2B.GUARD: 有在職主管沒有管轄名單（manager_scope）；請先匯入名單，或刻意放行（set hr.allow_empty_scope = ''1''）'; end if;
  {pre}
end
$guard$;
"""
    post = f"""do $post$
declare v_diff text;
begin
{same('_hr2b_pre', fnx, TABLES4, trgx, [], [], [], 'HR2B')}
{names_check(POL_2B, 'HR2B.POST', '2b 預期的清單')}
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='attendance' and policyname='att_staff_read' and qual like '%is_my_report%') then raise exception 'HR2B.POST: att_staff_read 不是主管範圍版'; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='attendance' and t.tgname='trg_attendance_self_guard' and not t.tgisinternal and t.tgenabled='O') <> 1 then raise exception 'HR2B.POST: 出勤守衛觸發器沒掛好'; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='attendance' and t.tgname='trg_change_log' and not t.tgisinternal) <> 1 then raise exception 'HR2B.POST: 變更日誌觸發器被動到'; end if;
  if has_function_privilege('anon', 'public.fn_attendance_self_guard()', 'execute') then raise exception 'HR2B.POST: anon 不得執行出勤守衛函式'; end if;
end
$post$;
"""
    return HDR('人事權限 2b 收權階段：收回舊權限（補打卡直寫、教練／櫃檯讀全員員工表、櫃檯／主管讀薪資歷史、主管讀全員出勤），掛出勤守衛觸發器。前提：2a 已套用、新版前端（v261122.2330 以後）已上線並通過各角色驗收、管轄名單與人事職責已匯入。\n-- 回復：先跑 14_hr_perm_2b_rollback_prod.sql（恢復權限），再退前端。') + FRAME_OPEN + HR_FP + guard + "\n" + MIG_2B + "\n" + post + FRAME_CLOSE

def rollback_2b():
    fnx = ['fn_attendance_self_guard']; trgx = ['attendance.trg_attendance_self_guard']
    pre = pre_table('_hr2brb_pre', fnx, TABLES4, trgx, [], [], [])
    guard = f"""do $guard$
begin
{GUARD_CLUSTER('HR2BRB')}
  if not exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) then raise exception 'HR2BRB.GUARD: 2b 沒有套用，停止'; end if;
{names_check(POL_2B, 'HR2BRB.GUARD', '2b 預期的清單（現況不是已知狀態，停止）')}
  {pre}
end
$guard$;
"""
    post = f"""do $post$
declare v_diff text;
begin
{same('_hr2brb_pre', fnx, TABLES4, trgx, [], [], [], 'HR2BRB')}
  if (select md5(coalesce(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||coalesce(array_to_string(roles,','),'')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\\n' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename = any({Q(TABLES4)})) <> '{POL4}' then raise exception 'HR2BRB.POST: 四張表的政策沒有回到正式庫原貌（指紋不符），整筆回滾'; end if;
  if exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) or exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_attendance_self_guard') then raise exception 'HR2BRB.POST: 出勤守衛沒有移除乾淨'; end if;
end
$post$;
"""
    return HDR('人事權限 2b 回復：恢復舊權限、移除出勤守衛，回到 2a 狀態（政策指紋必須等於正式庫原貌）。順序：先跑這支，再退前端。') + FRAME_OPEN + HR_FP + guard + "\n" + RB_2B + "\n" + post + FRAME_CLOSE

def rollback_2a():
    fnx = NEW_FUNCS_2A; relx = NEW_TABLES + NEW_VIEWS
    pre = pre_table('_hr2arb_pre', fnx, [], [], relx, relx, NEW_COLS)
    guard = f"""do $guard$
begin
{GUARD_CLUSTER('HR2ARB')}
  if exists (select 1 from pg_trigger where tgname='trg_attendance_self_guard' and not tgisinternal) then raise exception 'HR2ARB.GUARD: 2b 還在，請先跑 2b 回復'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and policyname in ('employees_select_v2','sh_read_hr','pr_read_scope')) then raise exception 'HR2ARB.GUARD: 2b 的政策還在，請先跑 2b 回復'; end if;
  if not (select count(*) = {len(NEW_TABLES + NEW_VIEWS)} from pg_class where relnamespace='public'::regnamespace and relname = any({Q(NEW_TABLES + NEW_VIEWS)})) then raise exception 'HR2ARB.GUARD: 2a 沒有套用（或不完整），停止'; end if;
  -- 新表資料會一併消失：有資料時必須先匯出，並刻意放行（set hr.allow_data_loss = '1'）
  if coalesce(current_setting('hr.allow_data_loss', true),'') <> '1' and ((select count(*) from public.hr_grants) > 0 or (select count(*) from public.manager_scope) > 0) then raise exception 'HR2ARB.GUARD: hr_grants／manager_scope 有資料，回復會刪掉；請先匯出並 set hr.allow_data_loss = ''1'''; end if;
  {pre}
end
$guard$;
"""
    post = f"""do $post$
declare v_diff text;
begin
{same('_hr2arb_pre', fnx, [], [], relx, relx, NEW_COLS, 'HR2ARB')}
  if exists (select 1 from pg_class where relnamespace='public'::regnamespace and relname = any({Q(relx)})) or exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname = any({Q(NEW_FUNCS_2A)})) then raise exception 'HR2ARB.POST: 2a 物件沒有移除乾淨'; end if;
end
$post$;
"""
    return HDR('人事權限 2a 回復：移除 2a 新增的資料表／檢視／函式（requested_by／reviewed_by 兩欄刻意保留，避免資料遺失）。前提：2b 已先回復。') + FRAME_OPEN + HR_FP + guard + "\n" + RB_2A + "\n" + post + FRAME_CLOSE

files = {'13_hr_perm_2a_apply_prod.sql': apply_2a(), '13_hr_perm_2a_rollback_prod.sql': rollback_2a(),
         '14_hr_perm_2b_apply_prod.sql': apply_2b(), '14_hr_perm_2b_rollback_prod.sql': rollback_2b()}
os.makedirs(out, exist_ok=True)
sums = []
for name, text in files.items():
    path = os.path.join(out, name if mode == 'prod' else name.replace('_prod.sql', '_test.sql'))
    open(path, 'w', encoding='utf-8').write(text)
    sums.append(f"{hashlib.sha256(text.encode('utf-8')).hexdigest()}  {os.path.basename(path)}")
if mode == 'prod':
    for src in ['docs/migrations/20261119a_hr_perm_compat.sql', 'docs/migrations/20261119b_hr_perm_revoke.sql', 'docs/hr-perm/rollback_2a_hr_perm_compat.sql', 'docs/hr-perm/rollback_2b_hr_perm_revoke.sql']:
        sums.append(f"{hashlib.sha256(read(src).encode('utf-8')).hexdigest()}  (來源本體，已去尾端空白) {src}")
    open(os.path.join(out, 'HR_PERM_FINGERPRINTS.sha256'), 'w').write("\n".join(sums) + "\n")
print("\n".join(sums))
