-- gsm_v2_02_verify.sql — 套用後核對（唯讀）
do $$
begin
  if to_regprocedure('public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)') is null then raise exception 'VERIFY: 缺 v2'; end if;
  if to_regprocedure('public.fn_gsm_msg(text,text)') is null then raise exception 'VERIFY: 缺 fn_gsm_msg'; end if;
  if to_regclass('public.group_op_log') is null then raise exception 'VERIFY: 缺 group_op_log'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.group_op_log'::regclass) then raise exception 'VERIFY: group_op_log 沒開 RLS'; end if;
  if has_table_privilege('anon', 'public.group_op_log', 'select') then raise exception 'VERIFY: anon 不該能讀 group_op_log'; end if;
  if not has_function_privilege('authenticated', 'public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'VERIFY: authenticated 不能執行 v2'; end if;
  if has_function_privilege('anon', 'public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'VERIFY: anon 不該能執行 v2'; end if;
  if not has_function_privilege('authenticated', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'VERIFY: authenticated 不能執行相容入口'; end if;
  if has_function_privilege('anon', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'VERIFY: anon 不該能執行相容入口'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)'::regprocedure) then raise exception 'VERIFY: v2 不是 SECURITY DEFINER'; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_group_save_members') <> 1 then raise exception 'VERIFY: fn_group_save_members 出現重載'; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_group_save_members_v2') <> 1 then raise exception 'VERIFY: v2 出現重載'; end if;
  if has_function_privilege('service_role', 'public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'VERIFY: service_role 不該能執行 v2'; end if;
  if has_function_privilege('service_role', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'VERIFY: service_role 不該能執行 相容入口'; end if;
  if has_function_privilege('service_role', 'public.fn_gsm_msg(text,text)', 'execute') then raise exception 'VERIFY: service_role 不該能執行 fn_gsm_msg'; end if;
  if position('LEGACY_WRITE_BLOCKED' in pg_get_functiondef('public.fn_group_save_members(text,integer,text,jsonb,jsonb)'::regprocedure)) = 0 or position('fn_group_save_members_v2' in pg_get_functiondef('public.fn_group_save_members(text,integer,text,jsonb,jsonb)'::regprocedure)) > 0 then raise exception 'VERIFY: 相容入口不是「一律拒絕且不呼叫 v2」'; end if;
  if position('REV_REQUIRED' in pg_get_functiondef('public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)'::regprocedure)) = 0 then raise exception 'VERIFY: v2 沒有必帶版本的檢查'; end if;
  if position('legacy' in pg_get_functiondef('public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)'::regprocedure)) > 0 then raise exception 'VERIFY: v2 仍有 legacy 前綴例外'; end if;
  raise notice 'VERIFY 全部通過';
end $$;
