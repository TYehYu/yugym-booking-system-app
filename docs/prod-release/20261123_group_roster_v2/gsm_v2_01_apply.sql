-- ════════════════════════════════════════════════════════════════════════════
-- gsm_v2_01_apply.sql — 團課名單儲存：共享票退款修正＋操作識別去重（草案 v2，2026-11-23）
-- 狀態：只在測試庫 kucvxpjatptfckhlxptj 驗證；正式庫 rlpiomzplckzqnqrvrwc「尚未套用」，套用前須使用者明確授權。
-- 套用順序：00_precheck（唯讀）→ 本檔 → 02_verify（唯讀）→ 才切換前端（gsm-frontend.patch）。
-- 回復：gsm_v2_03_rollback.sql（把舊函式還原成正式庫現行版，移除 v2 與操作紀錄表）。
-- 依賴（precheck 會逐項核對）：fn_booking_rev_of／booking_op_rev＋trg_booking_op_rev*、fn_seat_map_reindex、
--   fn_tk_refund_once、fn_ticket_net_checked、fn_tk_shared_has、current_employee_id、is_staff_desk、bookings.seat_notes。
-- 設計：
--   ① 新增 fn_group_save_members_v2(p_booking_id, p_op_id, p_expect_rev, …)：同一個 p_op_id 重送一律「不再執行」，
--      回傳第一次的結果（replayed:true）；p_op_id 被不同內容重用 → OP_ID_REUSED。
--   ② 去重檢查在「鎖住該堂預約之後」：兩個同 op 並行時，後到者等前者提交，再讀到紀錄、回放，不會各做一次。
--   ③ p_expect_rev（開窗時讀的預約版本）：名單在這之間被改過 → REV_MISMATCH，沒有任何變動。
--   ④ 舊函式 fn_group_save_members 保留簽名，但所有寫入一律拒絕並提示更新（沒有操作識別就無法保證重送安全），不呼叫 v2；
--      v2 沒有任何特殊前綴例外：一律必帶版本、一律記操作紀錄。
--   ⑤ 失敗一律整筆回滾並回 ok:false＋error_code＋中文 message；失敗不寫操作紀錄（可用同一個 op 重試）。
-- ════════════════════════════════════════════════════════════════════════════
begin;
create temp table codex_release_snapshot on commit drop as select jsonb_build_object(
'bookings',(select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by id),'')) from public.bookings b),
'tickets',(select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.member_tickets t),
'logs',(select md5(coalesce(string_agg(to_jsonb(l)::text,'|' order by id),'')) from public.ticket_logs l),
'employees',(select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by id),'')) from public.employees e),
'auth',(select md5(coalesce(string_agg(to_jsonb(u)::text,'|' order by id),'')) from auth.users u),
'other_functions',(select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward','fn_undo_checkin','fn_group_save_members','fn_group_save_members_v2','fn_gsm_msg')),
'policies',(select md5(coalesce(string_agg(tablename::text||'.'||policyname::text||'.'||cmd::text||coalesce(array_to_string(roles,','),'')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename::text,policyname::text),'')) from pg_policies where schemaname='public' and tablename<>'group_op_log'),
'grants',(select md5(coalesce(string_agg(table_name::text||grantee::text||privilege_type::text,'|' order by table_name::text,grantee::text,privilege_type::text),'')) from information_schema.role_table_grants where table_schema='public' and table_name<>'group_op_log'),
'triggers',(select md5(coalesce(string_agg(tgrelid::regclass::text||tgname::text||pg_get_triggerdef(oid),'|' order by tgrelid::regclass::text,tgname::text),'')) from pg_trigger where not tgisinternal),
'migrations',(select md5(coalesce(string_agg(version||name,'|' order by version),'')) from supabase_migrations.schema_migrations)
) as snapshot;
set local lock_timeout='3s';set local statement_timeout='30s';
-- gsm_v2_00_precheck.sql — 套用前核對（唯讀；任何硬性項目不符就 RAISE，不要往下套用）
-- 在「要套用的那個資料庫」執行；先在結果裡確認筆數像是你要的環境（測試庫筆數很小、正式庫很大）。
-- 硬性項目：舊函式定義雜湊＝正式庫 2026-11-23 取得的版本（代表沒有別人改過）、依賴物件存在、v2／操作紀錄表尚未存在、權限。
-- 資訊項目（WARN，只列出不擋）：依賴函式定義雜湊與正式庫是否一致。
-- ▶ 環境保護：把下面的 7637215626725903220 換成「你要動的那個資料庫」的 system identifier，不換就不會執行。
--   取得方式：在目標庫跑  select (pg_control_system()).system_identifier::text;
--   已知：正式庫 rlpiomzplckzqnqrvrwc＝7637215626725903220；測試庫 kucvxpjatptfckhlxptj＝7662742571317219726（2026-11-23 取得）
do $guard$ begin
  if (pg_control_system()).system_identifier::text is distinct from '7637215626725903220' then
    raise exception 'ENV_GUARD: 目前連到的資料庫(%)不是你指定的目標，已中止', (pg_control_system()).system_identifier::text;
  end if;
end $guard$;
do $$
declare
  v_old_md5 constant text := 'd53585634cf9e17a618f00fce2229a6a';   -- 正式庫 fn_group_save_members（去除 \r）
  v_md5 text; v_fn text; v_n int;
  v_dep jsonb := '{"fn_booking_rev_of(text)":"42ab6f3a78b5d3d885b784c1d5818131",
                   "fn_seat_map_reindex(jsonb,text[],text[],integer)":"c4df5267d6f1153d873c37f3955a0a72",
                   "fn_tk_refund_once(text,text,text)":"888b48e7e99e126d2e44af11580409d0",
                   "fn_ticket_net_checked(text,text)":"79438df54850bb57513bd41330682f14",
                   "fn_tk_shared_has(jsonb,text)":"766f04876216f1cdbc7becc3a9f57e49",
                   "current_employee_id()":"6a3b99dc85786f39b8c8b6c187131ee4",
                   "is_staff_desk()":"46d2a4db99b29dd44bd667e91d32cbe3",
                   "gen_short_id(text)":"2e06e06aacab780935a8376866f8b309"}'::jsonb;
begin
  raise notice '環境：employees=% members=% bookings=% server=%', (select count(*) from employees), (select count(*) from members), (select count(*) from bookings), current_setting('server_version');
  if current_setting('server_version_num')::int < 150000 then raise exception 'PRECHECK: PostgreSQL 版本過舊'; end if;
  if not has_schema_privilege(current_user, 'public', 'CREATE') then raise exception 'PRECHECK: 目前角色(%)沒有 public schema 的 CREATE 權限', current_user; end if;

  -- 舊函式
  select md5(replace(pg_get_functiondef('public.fn_group_save_members(text,integer,text,jsonb,jsonb)'::regprocedure), E'\r', '')) into v_md5;
  if v_md5 is distinct from v_old_md5 then raise exception 'PRECHECK: fn_group_save_members 定義與預期不同（%）——有人改過或已套用過，請先重新取得現行定義再決定', v_md5; end if;

  -- 依賴存在（硬性）＋雜湊（資訊）
  for v_fn in select jsonb_object_keys(v_dep) loop
    if to_regprocedure('public.'||v_fn) is null then raise exception 'PRECHECK: 缺少依賴函式 %', v_fn; end if;
    select md5(replace(pg_get_functiondef(to_regprocedure('public.'||v_fn)), E'\r', '')) into v_md5;
    if v_md5 is distinct from (v_dep->>v_fn) then raise warning 'PRECHECK(WARN): 依賴 % 的定義與正式庫 2026-11-23 版本不同（%）', v_fn, v_md5; end if;
  end loop;
  if to_regclass('public.booking_op_rev') is null then raise exception 'PRECHECK: 缺少 booking_op_rev'; end if;
  select count(*) into v_n from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname in ('trg_booking_op_rev','trg_booking_op_rev_insdel');
  if v_n <> 2 then raise exception 'PRECHECK: bookings 上的版本觸發器數量=%（應為 2）', v_n; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='seat_notes') then
    raise exception 'PRECHECK: bookings 缺少 seat_notes 欄位'; end if;
  if (select data_type from information_schema.columns where table_schema='public' and table_name='member_tickets' and column_name='shared_with') <> 'jsonb' then
    raise exception 'PRECHECK: member_tickets.shared_with 不是 jsonb'; end if;

  -- 尚未套用
  if to_regclass('public.group_op_log') is not null then raise exception 'PRECHECK: group_op_log 已存在'; end if;
  if to_regprocedure('public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)') is not null then raise exception 'PRECHECK: v2 已存在'; end if;

  -- 權限現況（舊函式只有 authenticated 可執行）
  if not has_function_privilege('authenticated', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'PRECHECK: authenticated 目前不能執行舊函式'; end if;
  if has_function_privilege('anon', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'PRECHECK: anon 竟然能執行舊函式，先查清楚再套用'; end if;

  if has_function_privilege('service_role', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'PRECHECK: service_role 目前竟能執行舊函式（預期只有 authenticated），先查清楚'; end if;
  raise notice 'PRECHECK 全部通過';
end $$;

do $release_dependencies$ begin
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.current_employee_id()') and md5(replace(pg_get_functiondef(oid),E'\r',''))='6a3b99dc85786f39b8c8b6c187131ee4' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:current_employee_id()';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_booking_rev_of(text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='42ab6f3a78b5d3d885b784c1d5818131' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_booking_rev_of(text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_group_save_members(text,integer,text,jsonb,jsonb)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='d53585634cf9e17a618f00fce2229a6a' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_group_save_members(text,integer,text,jsonb,jsonb)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='c4df5267d6f1153d873c37f3955a0a72' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_seat_map_reindex(jsonb,text[],text[],integer)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_ticket_net_checked(text,text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='79438df54850bb57513bd41330682f14' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_ticket_net_checked(text,text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_tk_refund_once(text,text,text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='888b48e7e99e126d2e44af11580409d0' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_tk_refund_once(text,text,text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_tk_shared_has(jsonb,text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='766f04876216f1cdbc7becc3a9f57e49' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:fn_tk_shared_has(jsonb,text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.gen_short_id(text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='2e06e06aacab780935a8376866f8b309' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:gen_short_id(text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.is_any_staff()') and md5(replace(pg_get_functiondef(oid),E'\r',''))='11ce596c050dfb6ac89b95e77da82596' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:is_any_staff()';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.is_staff_desk()') and md5(replace(pg_get_functiondef(oid),E'\r',''))='46d2a4db99b29dd44bd667e91d32cbe3' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:is_staff_desk()';end if;
end $release_dependencies$;
-- ▶ 環境保護：把下面的 7637215626725903220 換成「你要動的那個資料庫」的 system identifier，不換就不會執行。
--   取得方式：在目標庫跑  select (pg_control_system()).system_identifier::text;
--   已知：正式庫 rlpiomzplckzqnqrvrwc＝7637215626725903220；測試庫 kucvxpjatptfckhlxptj＝7662742571317219726（2026-11-23 取得）
do $guard$ begin
  if (pg_control_system()).system_identifier::text is distinct from '7637215626725903220' then
    raise exception 'ENV_GUARD: 目前連到的資料庫(%)不是你指定的目標，已中止', (pg_control_system()).system_identifier::text;
  end if;
end $guard$;

-- ── 操作紀錄表（新表規矩：建表→RLS→GRANT→policy；只有 SECURITY DEFINER 函式會碰，一般使用者看不到任何列）──
create table if not exists public.group_op_log (
  op_id       text primary key,
  booking_id  text not null,
  employee_id text not null,
  req_hash    text not null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists group_op_log_created_idx on public.group_op_log (created_at);
create index if not exists group_op_log_booking_idx on public.group_op_log (booking_id);
alter table public.group_op_log enable row level security;
grant select, insert, update, delete on public.group_op_log to authenticated;
grant select, insert, update, delete on public.group_op_log to service_role;
revoke all on public.group_op_log from anon;   -- 新表不給 anon（2026/10/30 規矩）
drop policy if exists group_op_log_deny_all on public.group_op_log;
create policy group_op_log_deny_all on public.group_op_log for all to authenticated using (false) with check (false);

-- ── 中文錯誤訊息 ──
create or replace function public.fn_gsm_msg(p_code text, p_name text default null)
returns text language sql immutable set search_path to 'public','pg_temp' as $f$
  select case p_code
    when 'BAD_ARGS'            then '送出的資料不完整，整筆沒有儲存；請重新開啟名單再操作'
    when 'REV_REQUIRED'        then '沒有讀到開窗時的名單版本，為避免蓋掉別人的修改，這次沒有儲存；請重新開啟名單再操作'
    when 'LEGACY_WRITE_BLOCKED' then '這個畫面是舊版，無法安全儲存名單（重送可能重複扣票、退票或移錯人），這次沒有儲存；請重新整理頁面（更新到最新版）後再操作'
    when 'NOT_STAFF'           then '你沒有權限儲存名單，整筆沒有儲存'
    when 'NOT_YOUR_BOOKING'    then '這不是你的課，整筆沒有儲存'
    when 'NO_BOOKING'          then '找不到這堂課，整筆沒有儲存'
    when 'NOT_GROUP'           then '這不是團體課，整筆沒有儲存'
    when 'REV_MISMATCH'        then '名單剛剛有變動（可能是別台櫃檯剛改過），這次沒有儲存、名單與票券都沒變；請重新開啟名單再操作'
    when 'OP_ID_REUSED'        then '這次操作的識別碼已被另一份不同的內容使用，沒有儲存；請重新開啟名單再操作'
    when 'TICKET_UNKNOWN'      then '查不清楚「'||coalesce(p_name,'這位學員')||'」這個名額用的是哪一張票，整筆沒有儲存、名單與票券都沒變；請到票券頁確認後再處理'
    when 'REFUND_FAILED'       then '「'||coalesce(p_name,'這位學員')||'」的票退不回去（例如票券餘額已滿），整筆沒有儲存、名單與票券都沒變；請到票券頁確認'
    when 'LEDGER_UNATTRIBUTED' then '這堂課有扣課紀錄對不上名單上的任何人（可能是先前移出名單時沒有退票）；為避免退錯人，移除「'||coalesce(p_name,'這位學員')||'」的動作整筆沒有儲存，請先到票券頁校正'
    when 'BUSY'                then '系統忙碌，整筆沒有儲存，請稍後再按一次'
    when 'TICKET.LEDGER_AMBIGUOUS' then '這堂課的票券帳本有異常，整筆沒有儲存；請通知管理員'
    when 'TICKET.LEDGER_NEGATIVE'  then '這堂課的票券帳本有異常，整筆沒有儲存；請通知管理員'
    when 'TICKET.LEDGER_OWNERSHIP' then '這堂課的票券帳本有異常，整筆沒有儲存；請通知管理員'
    else '儲存沒有完成，整筆已回滾、名單與票券都沒變；請稍後再試或通知管理員（代碼：'||coalesce(p_code,'未知')||'）'
  end
$f$;

-- ── v2 本體 ──
create or replace function public.fn_group_save_members_v2(
  p_booking_id text, p_op_id text, p_expect_rev text DEFAULT NULL::text,
  p_max_heads integer DEFAULT NULL::integer, p_ticket_type_fix text DEFAULT NULL::text,
  p_adds jsonb DEFAULT '[]'::jsonb, p_removes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp  text; v_desk boolean; v_b bookings%rowtype; v_max int; v_leave int; v_cnt int;
  v_member_ids jsonb; v_seat_tickets jsonb; v_attendance jsonb; v_seat_notes jsonb; v_live_keys jsonb;
  v_add jsonb; v_rm jsonb; v_mid text; v_tkid text; v_multi boolean; v_tk record; v_net int; v_seats int; v_key text;
  v_results jsonb := '[]'::jsonb;
  v_mids text[]; v_keys text[]; v_idx int; v_nseat int; v_tid text; v_cand int; v_other int; v_orphan int; v_deducts int;
  v_outcome text; v_prev text; v_ticket member_tickets%rowtype;
  v_hash text; v_log group_op_log%rowtype; v_res jsonb; v_code text; v_who text;
begin
  perform set_config('lock_timeout', '3000', true);
  if p_booking_id is null or p_op_id is null or length(btrim(p_op_id)) = 0 or length(p_op_id) > 120 then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS', 'message', public.fn_gsm_msg('BAD_ARGS'));
  end if;
  if p_expect_rev is null then
    return jsonb_build_object('ok', false, 'error_code', 'REV_REQUIRED', 'message', public.fn_gsm_msg('REV_REQUIRED'));
  end if;
  select current_employee_id() into v_emp;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF', 'message', public.fn_gsm_msg('NOT_STAFF'));
  end if;
  select is_staff_desk() into v_desk;

  select * into v_b from bookings where id = p_booking_id for update;          -- ① 先鎖預約（同一堂的所有名單操作在此排隊）
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING', 'message', public.fn_gsm_msg('NO_BOOKING'));
  end if;
  if not coalesce(v_desk,false) and v_b.coach_id is distinct from v_emp and v_b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_YOUR_BOOKING', 'message', public.fn_gsm_msg('NOT_YOUR_BOOKING'));
  end if;
  if v_b.category::text <> '小班肌力' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_GROUP', 'message', public.fn_gsm_msg('NOT_GROUP'));
  end if;

  -- ② 操作識別去重（在鎖內）：同 op 重送＝回放第一次的結果，不再執行
  v_hash := md5(p_booking_id||'|'||coalesce(p_expect_rev,'')||'|'||coalesce(p_max_heads::text,'')||'|'||coalesce(p_ticket_type_fix,'')
                ||'|'||coalesce(p_adds,'[]'::jsonb)::text||'|'||coalesce(p_removes,'[]'::jsonb)::text);
  select * into v_log from group_op_log where op_id = p_op_id;
  if found then
    if v_log.booking_id <> p_booking_id or v_log.employee_id <> v_emp or v_log.req_hash <> v_hash then
      return jsonb_build_object('ok', false, 'error_code', 'OP_ID_REUSED', 'message', public.fn_gsm_msg('OP_ID_REUSED'));
    end if;
    return v_log.result || jsonb_build_object('replayed', true);
  end if;

  -- ③ 版本檢查：開窗後名單被改過就不做
  if p_expect_rev is not null and public.fn_booking_rev_of(v_b.id) is distinct from p_expect_rev then
    return jsonb_build_object('ok', false, 'error_code', 'REV_MISMATCH', 'message', public.fn_gsm_msg('REV_MISMATCH'));
  end if;

  v_member_ids   := coalesce(v_b.member_ids,'[]'::jsonb);
  v_seat_tickets := coalesce(v_b.seat_tickets,'{}'::jsonb);
  v_attendance   := coalesce(v_b.attendance,'{}'::jsonb);
  v_seat_notes   := case when jsonb_typeof(v_b.seat_notes) = 'object' then v_b.seat_notes else null end;
  v_max := coalesce(p_max_heads, v_b.max_heads, 5);

  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);

  -- ── Remove 路徑 ──
  for v_rm in select * from jsonb_array_elements(coalesce(p_removes,'[]'::jsonb))
  loop
    v_mid := case when jsonb_typeof(v_rm) = 'string' then v_rm#>>'{}' else v_rm->>'member_id' end;
    if v_mid is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',false,'error_code','BAD_INPUT'));
      continue;
    end if;
    select array_agg(val order by ord), array_agg(case when rn > 1 then val || '#' || rn else val end order by ord)
      into v_mids, v_keys
      from (select val, ord, row_number() over (partition by val order by ord) as rn
              from jsonb_array_elements_text(v_member_ids) with ordinality as t(val, ord)) x;
    select max(i) into v_idx from generate_subscripts(coalesce(v_mids,'{}'::text[]), 1) i where v_mids[i] = v_mid;
    if v_idx is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',false,'error_code','NOT_IN_ROSTER'));
      continue;
    end if;
    v_key := v_keys[v_idx];
    select count(*) into v_nseat from unnest(v_mids) m where m = v_mid;

    v_tid := nullif(v_seat_tickets ->> v_key, '');
    if v_tid is null then
      select count(*), min(x.id) into v_cand, v_tid
        from (select mt.id from member_tickets mt
               where (mt.member_id = v_mid or public.fn_tk_shared_has(to_jsonb(mt.shared_with), v_mid))
                 and (select coalesce(sum(case when tl.action::text = 'deduct' and coalesce(tl.delta,0) <> 0 then 1
                                               when tl.action::text = 'refund' then -1 else 0 end), 0)
                        from ticket_logs tl where tl.booking_id = p_booking_id and tl.ticket_id = mt.id) > 0) x;
      if v_cand = 0 then v_tid := null;
      elsif v_cand = 1 and v_nseat = 1 then null;
      else raise exception 'GSM:TICKET_UNKNOWN:%', v_mid; end if;
    end if;

    v_outcome := 'no_deduction';
    if v_tid is not null then
      select * into v_ticket from member_tickets where id = v_tid for update;
      if not found then raise exception 'GSM:TICKET_UNKNOWN:%', v_mid; end if;
      perform public.fn_ticket_net_checked(v_tid, p_booking_id);
      select coalesce(sum(case when action::text = 'deduct' and coalesce(delta,0) <> 0 then 1 when action::text = 'refund' then -1 else 0 end), 0),
             count(*) filter (where action::text = 'deduct' and coalesce(delta,0) <> 0)
        into v_net, v_deducts from ticket_logs where ticket_id = v_tid and booking_id = p_booking_id;
      select (select count(*) from jsonb_each_text(v_seat_tickets) e where e.value = v_tid and e.key <> v_key)
           + (select count(*) from generate_subscripts(v_mids, 1) j
               where j <> v_idx and nullif(v_seat_tickets ->> v_keys[j], '') is null
                 and (v_mids[j] = v_ticket.member_id or public.fn_tk_shared_has(to_jsonb(v_ticket.shared_with), v_mids[j])))
        into v_other;
      if v_net > v_other then
        if not public.fn_tk_refund_once(v_tid, p_booking_id, '取消退課') then raise exception 'GSM:REFUND_FAILED:%', v_mid; end if;
        v_outcome := 'refunded';
      elsif v_deducts > 0 and v_net <= 0 then
        v_outcome := 'already_refunded';
      end if;
    else
      select count(*) into v_orphan
        from member_tickets mt
       where (select coalesce(sum(case when tl.action::text = 'deduct' and coalesce(tl.delta,0) <> 0 then 1 when tl.action::text = 'refund' then -1 else 0 end), 0)
                from ticket_logs tl where tl.booking_id = p_booking_id and tl.ticket_id = mt.id) > 0
         and not exists (select 1 from generate_subscripts(v_mids, 1) j
                          where j <> v_idx
                            and (nullif(v_seat_tickets ->> v_keys[j], '') = mt.id
                                 or v_mids[j] = mt.member_id
                                 or public.fn_tk_shared_has(to_jsonb(mt.shared_with), v_mids[j])));
      if v_orphan > 0 then raise exception 'GSM:LEDGER_UNATTRIBUTED:%', v_mid; end if;
    end if;

    select coalesce(jsonb_agg(val order by ord), '[]'::jsonb) into v_member_ids
      from jsonb_array_elements_text(v_member_ids) with ordinality as t(val, ord) where ord <> v_idx;
    v_seat_tickets := public.fn_seat_map_reindex(v_seat_tickets, v_keys, v_mids, v_idx);
    v_attendance   := public.fn_seat_map_reindex(v_attendance,   v_keys, v_mids, v_idx);
    if v_seat_notes is not null then
      v_seat_notes := public.fn_seat_map_reindex(v_seat_notes, v_keys, v_mids, v_idx);
      if v_seat_notes = '{}'::jsonb then v_seat_notes := null; end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',true,
                   'seat_key',v_key,'outcome',v_outcome,'refunded_ticket_id', case when v_outcome = 'refunded' then v_tid else null end));
  end loop;

  -- ── Add 路徑（與正式庫現行版相同，唯一差異：票可以是「持有人，或共享給這位會員」的票；原版 mt.member_id = v_mid 會把共享上課者擋成 TICKET_INVALID）──
  for v_add in select * from jsonb_array_elements(coalesce(p_adds,'[]'::jsonb))
  loop
    v_mid   := v_add->>'member_id';
    v_tkid  := v_add->>'ticket_id';
    v_multi := coalesce((v_add->>'multi')::boolean, false);
    if v_mid is null or v_tkid is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','BAD_INPUT'));
      continue;
    end if;
    v_leave := (select count(*)::int from jsonb_array_elements_text(v_member_ids) m(mid) where coalesce(v_b.attendance->>m.mid,'') = 'leave');
    v_cnt   := jsonb_array_length(v_member_ids) - v_leave;
    if v_cnt >= v_max then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','FULL'));
      continue;
    end if;
    select mt.* into v_tk from member_tickets mt join ticket_types tt on tt.id = mt.ticket_type_id
     where mt.id = v_tkid and (mt.member_id = v_mid or public.fn_tk_shared_has(to_jsonb(mt.shared_with), v_mid)) and tt.category::text = '小班肌力'
       and (mt.expire_date is null or mt.expire_date >= v_b.date)
     for update;
    if not found then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','TICKET_INVALID'));
      continue;
    end if;
    select coalesce(sum(case when action='deduct' and coalesce(delta,0) <> 0 then 1 when action='refund' then -1 else 0 end), 0)
      into v_net from ticket_logs where ticket_id = v_tk.id and booking_id = p_booking_id;
    if not v_multi and v_net > 0 then
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_tk.id, 'adjust', 0, p_booking_id, v_emp,
              '⚠ 已阻擋：這一堂在這張票上已經扣過 '||v_net||' 堂，不重複扣', now());
    else
      if coalesce(v_tk.sessions_remaining,0) <= 0 then
        v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','NO_REMAINING'));
        continue;
      end if;
      update member_tickets
         set sessions_remaining = sessions_remaining - 1,
             status = case when sessions_remaining-1<=0 then 'used_up' else status end,
             start_date   = coalesce((v_add->>'start_date')::date, start_date),
             expire_date  = coalesce((v_add->>'expire_date')::date, expire_date),
             activated_at = coalesce((v_add->>'activated_at')::timestamptz, activated_at)
       where id = v_tk.id;
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_tk.id, 'deduct', -1, p_booking_id, v_emp,
              coalesce(nullif(v_add->>'note',''), '預約扣課'), now());
    end if;
    select count(*)::int into v_seats from jsonb_array_elements_text(v_member_ids) x where x = v_mid;
    v_key := case when v_seats > 0 then v_mid||'#'||(v_seats+1) else v_mid end;
    v_member_ids   := v_member_ids || to_jsonb(v_mid);
    v_seat_tickets := v_seat_tickets || jsonb_build_object(v_key, v_tk.id);
    v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',true,'ticket_id',v_tk.id));
  end loop;

  select coalesce(jsonb_object_agg(case when rn > 1 then val || '#' || rn else val end, true), '{}'::jsonb)
    into v_live_keys
    from (select val, row_number() over (partition by val order by ord) as rn
            from jsonb_array_elements_text(v_member_ids) with ordinality as t(val, ord)) s;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_attendance
    from jsonb_each(v_attendance) a(k, v) where v_live_keys ? k;

  update bookings
     set member_ids = v_member_ids, seat_tickets = v_seat_tickets, attendance = v_attendance,
         seat_notes = v_seat_notes, max_heads = v_max, ticket_type_id = coalesce(ticket_type_id, p_ticket_type_fix)
   where id = p_booking_id;

  v_res := jsonb_build_object('ok', true, 'results', v_results, 'member_ids', v_member_ids,
                              'rev', public.fn_booking_rev_of(p_booking_id), 'replayed', false);
  -- 結果與去重紀錄在同一個交易提交（沒有任何例外：每次成功寫入都記）
  insert into group_op_log(op_id, booking_id, employee_id, req_hash, result) values (p_op_id, p_booking_id, v_emp, v_hash, v_res);
  delete from group_op_log where created_at < now() - interval '30 days';
  perform set_config('app.tk_operator', v_prev, true);
  return v_res;
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY', 'message', public.fn_gsm_msg('BUSY'));
  when others then
    -- 進到這裡時本函式內所有寫入（名單、座位票、出席、備註、退款、帳本、操作紀錄）都已回滾
    if sqlerrm like 'GSM:%' then
      v_code := split_part(sqlerrm, ':', 2); v_mid := split_part(sqlerrm, ':', 3);
      select name into v_who from members where id = v_mid;
      return jsonb_build_object('ok', false, 'error_code', v_code, 'member_id', v_mid, 'message', public.fn_gsm_msg(v_code, coalesce(v_who, v_mid)));
    end if;
    return jsonb_build_object('ok', false, 'error_code', sqlerrm, 'message', public.fn_gsm_msg(sqlerrm));
end
$function$;

-- ── 舊入口：保留簽名，但所有寫入一律拒絕（與 v2 內部完全分離）──
create or replace function public.fn_group_save_members(p_booking_id text, p_max_heads integer DEFAULT NULL::integer, p_ticket_type_fix text DEFAULT NULL::text, p_adds jsonb DEFAULT '[]'::jsonb, p_removes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- 舊頁面沒有操作識別／版本保護，新增與移除的重送都無法保證安全：本入口所有寫入一律拒絕，不呼叫 v2、不碰任何資料
  return jsonb_build_object('ok', false,
    'error_code', 'OLD_CLIENT：這個畫面是舊版，無法安全儲存名單，請重新整理頁面（更新到最新版）後再操作',
    'reason', 'LEGACY_WRITE_BLOCKED',
    'message', public.fn_gsm_msg('LEGACY_WRITE_BLOCKED'));
end
$function$;

-- ── 權限：與 fn_cancel_group_seat 相同（只給 authenticated；PUBLIC 不給）──
revoke all on function public.fn_gsm_msg(text, text) from public, anon, service_role;
revoke all on function public.fn_group_save_members_v2(text, text, text, integer, text, jsonb, jsonb) from public, anon, service_role;
revoke all on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.fn_gsm_msg(text, text) to authenticated;
grant execute on function public.fn_group_save_members_v2(text, text, text, integer, text, jsonb, jsonb) to authenticated;
grant execute on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) to authenticated;

comment on function public.fn_group_save_members_v2(text, text, text, integer, text, jsonb, jsonb) is 'gsm v2 2026-11-23：共享票退款修正＋op_id 去重＋expect_rev';
comment on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) is 'gsm compat 2026-11-23：舊入口所有寫入一律拒絕（提示更新），不呼叫 v2';

do $release_bodies$ begin
if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='fn_gsm_msg')<>1 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_gsm_msg' and md5(prosrc)='f48d83ab7463c5c820a88f5e4f0587c9' and proacl::text='{postgres=X/postgres,authenticated=X/postgres}' and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.BODY_OR_ACL:fn_gsm_msg';end if;
if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='fn_group_save_members_v2')<>1 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_group_save_members_v2' and md5(prosrc)='7de670c5ad04bf75a816800ee2a47a5a' and proacl::text='{postgres=X/postgres,authenticated=X/postgres}' and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.BODY_OR_ACL:fn_group_save_members_v2';end if;
if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='fn_group_save_members')<>1 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_group_save_members' and md5(prosrc)='64d7f7f4f02fcac638b57d653a796b74' and proacl::text='{postgres=X/postgres,authenticated=X/postgres}' and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.BODY_OR_ACL:fn_group_save_members';end if;
end $release_bodies$;
do $release_unrelated$ begin if (select snapshot from codex_release_snapshot) is distinct from (select jsonb_build_object(
'bookings',(select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by id),'')) from public.bookings b),
'tickets',(select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.member_tickets t),
'logs',(select md5(coalesce(string_agg(to_jsonb(l)::text,'|' order by id),'')) from public.ticket_logs l),
'employees',(select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by id),'')) from public.employees e),
'auth',(select md5(coalesce(string_agg(to_jsonb(u)::text,'|' order by id),'')) from auth.users u),
'other_functions',(select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward','fn_undo_checkin','fn_group_save_members','fn_group_save_members_v2','fn_gsm_msg')),
'policies',(select md5(coalesce(string_agg(tablename::text||'.'||policyname::text||'.'||cmd::text||coalesce(array_to_string(roles,','),'')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename::text,policyname::text),'')) from pg_policies where schemaname='public' and tablename<>'group_op_log'),
'grants',(select md5(coalesce(string_agg(table_name::text||grantee::text||privilege_type::text,'|' order by table_name::text,grantee::text,privilege_type::text),'')) from information_schema.role_table_grants where table_schema='public' and table_name<>'group_op_log'),
'triggers',(select md5(coalesce(string_agg(tgrelid::regclass::text||tgname::text||pg_get_triggerdef(oid),'|' order by tgrelid::regclass::text,tgname::text),'')) from pg_trigger where not tgisinternal),
'migrations',(select md5(coalesce(string_agg(version||name,'|' order by version),'')) from supabase_migrations.schema_migrations)
) as snapshot) then raise exception 'RELEASE.UNRELATED_OBJECT_OR_DATA_CHANGED';end if;end $release_unrelated$;
notify pgrst, 'reload schema';
commit;
