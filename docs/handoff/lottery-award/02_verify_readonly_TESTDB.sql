-- ═══ 抽獎登記／更正原子化：套用後唯讀驗證（測試庫 kucvxpjatptfckhlxptj）═══
-- 唯讀（不改任何東西）。成功＝例外訊息以 VERIFY.PASS 開頭；失敗＝VERIFY.FAIL 或 TARGET.GUARD。
do $v$
declare v_src text; v_def boolean; v_cfg text[]; v_acl text; v_bad text := '';
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TARGET.GUARD 這支檔案只能在 測試庫 kucvxpjatptfckhlxptj 執行（目前叢集識別不符），已中止，沒有任何變更';
  end if;
  v_bad := '';
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_ops_guard()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_ops_guard 不存在; ';
  else
    if md5(v_src) <> '480437aadc1516648ab1e92825eb3241' then v_bad := v_bad || 'fn_lottery_ops_guard 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_ops_guard ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_ops_guard 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_prize(text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_prize 不存在; ';
  else
    if md5(v_src) <> '48e06027c5fd333b74e1609f7dbb4bec' then v_bad := v_bad || 'fn_lottery_prize 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_prize ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_prize 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_award(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_award 不存在; ';
  else
    if md5(v_src) <> 'b4a92cafedfafaf0b20f266dd4943d48' then v_bad := v_bad || 'fn_lottery_award 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_award ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_award 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_award search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_fix(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_fix 不存在; ';
  else
    if md5(v_src) <> 'bb9a984c6ec2fad841e9022e31aa1e7e' then v_bad := v_bad || 'fn_lottery_fix 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_fix ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_fix 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_fix search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_tk()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_tk 不存在; ';
  else
    if md5(v_src) <> '1f9014a25d335ed23641f88e846b2406' then v_bad := v_bad || 'fn_lottery_gate_tk 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_tk ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_tk 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_log()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_log 不存在; ';
  else
    if md5(v_src) <> '17bcc2ecde655864a1870fec523feb24' then v_bad := v_bad || 'fn_lottery_gate_log 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_log ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_log 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_pu()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_pu 不存在; ';
  else
    if md5(v_src) <> 'fad961b2da0167c86b71d2adceed4582' then v_bad := v_bad || 'fn_lottery_gate_pu 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_pu ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_pu 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_tk' and not g.tgisinternal and g.tgrelid = 'public.member_tickets'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_tk()') and g.tgtype = 31 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_tk 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_log' and not g.tgisinternal and g.tgrelid = 'public.ticket_logs'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_log()') and g.tgtype = 11 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_log 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_pu' and not g.tgisinternal and g.tgrelid = 'public.purchases'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_pu()') and g.tgtype = 23 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_pu 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_immutable' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 27 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_immutable 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_notruncate' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 34 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_notruncate 不存在或不是預期的定義; '; end if;
  if to_regclass('public.lottery_ops') is null then v_bad := v_bad || 'lottery_ops 表不存在; ';
  else
    if (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'lottery_ops')
       is distinct from 'op_id:text,kind:text,member_id:text,purchase_id:text,prize_key:text,result:jsonb,created_by:text,created_at:timestamp with time zone' then
      v_bad := v_bad || 'lottery_ops 欄位不符; '; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = 'public.lottery_ops'::regclass) then v_bad := v_bad || 'lottery_ops 未開 RLS; '; end if;
    if not has_table_privilege('authenticated', 'public.lottery_ops', 'select') then v_bad := v_bad || 'authenticated 缺 select; '; end if;
    if has_table_privilege('authenticated', 'public.lottery_ops', 'insert,update,delete,truncate') or has_table_privilege('service_role', 'public.lottery_ops', 'insert,update,delete,truncate')
       or has_table_privilege('anon', 'public.lottery_ops', 'select,insert,update,delete,truncate') then v_bad := v_bad || 'lottery_ops 權限過寬（只能 select）; '; end if;
    if (select count(*) from pg_policy where polrelid = 'public.lottery_ops'::regclass) <> 1
       or not exists (select 1 from pg_policy p where p.polrelid = 'public.lottery_ops'::regclass and p.polname = 'lottery_ops_staff_read'
                        and p.polcmd = 'r' and p.polpermissive
                        and p.polroles = array[(select r.oid from pg_roles r where r.rolname = 'authenticated')]::oid[]
                        and pg_get_expr(p.polqual, p.polrelid) = 'is_staff_desk()' and p.polwithcheck is null) then
      v_bad := v_bad || 'lottery_ops policy 不符（需精確：僅 authenticated、僅 SELECT、USING is_staff_desk()、無 WITH CHECK、permissive）; '; end if;
  end if;
  if (select count(*) from pg_trigger g where g.tgname like 'trg_lottery_gate%' and not g.tgisinternal) <> 3 then
    v_bad := v_bad || '出現預期以外的 trg_lottery_gate* 觸發器; '; end if;
  if v_bad <> '' then raise exception 'VERIFY.FAIL %', v_bad; end if;
  raise exception 'VERIFY.PASS 6 支函式（本體指紋、ACL、SECURITY DEFINER、search_path）與 3 個觸發器皆符合預期（此例外只是為了不留任何交易）';
end $v$;
