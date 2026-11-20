-- REVIEW ONLY. Production execution requires separate explicit authorization.
-- No business-row updates/deletes; each statement runs in a single transaction.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin if (select system_identifier::text from pg_control_system())<>'7637215626725903220' then raise exception 'WRONG_PRODUCTION_CLUSTER';end if;end$$;
lock table contracts,member_tickets,purchases,ticket_logs,invoices in share row exclusive mode;
do $pin$ declare x record;begin for x in select * from jsonb_each_text('{"fn_installment_signature_guard()": "f58ed4dcd15059b321f8c7fd3531375b", "fn_installment_collection_guard()": "f9006eecee5cc6943661c080e46aa0f5", "fn_installment_request_v2(text,jsonb)": "f483f6a2b8b0ba52f6255c4c718163dd", "fn_member_sign_installment(text,integer,text)": "372f889a5647658f2b6a32a454cfe971", "fn_member_sign_installment_v2(text,text,text)": "c6b26028608a87f2dbf9c7118a025a84", "fn_installment_terms(text,integer,numeric,text,integer)": "bb7a75d11c0ce0634af87e03eda10e00", "fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)": "eb223c042b68f429a036040da4b9ba05"}'::jsonb) loop if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.'||x.key)) is distinct from x.value then raise exception 'FUNCTION_VERSION_MISMATCH: %',x.key;end if;end loop;end $pin$;
do $acl$declare s text;begin for s in select jsonb_array_elements_text('["fn_installment_request_v2(text,jsonb)", "fn_member_sign_installment_v2(text,text,text)", "fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)", "fn_member_sign_installment(text,integer,text)"]'::jsonb) loop if not has_function_privilege('authenticated',s,'execute') or has_function_privilege('anon',s,'execute') then raise exception 'API_ACL_MISMATCH: %',s;end if;end loop;for s in select jsonb_array_elements_text('["fn_installment_signature_guard()", "fn_installment_collection_guard()", "fn_installment_terms(text,integer,numeric,text,integer)"]'::jsonb) loop if has_function_privilege('authenticated',s,'execute') or has_function_privilege('anon',s,'execute') then raise exception 'INTERNAL_ACL_MISMATCH: %',s;end if;end loop;if not exists(select 1 from pg_class where oid='public.installment_receipts'::regclass and relrowsecurity) or exists(select 1 from pg_policies where schemaname='public' and tablename='installment_receipts') then raise exception 'PRIVATE_RECEIPTS_RLS_MISMATCH';end if;for s in select unnest(array['anon','authenticated','service_role']) loop if has_table_privilege(s,'public.installment_receipts','select,insert,update,delete,truncate,references,trigger') then raise exception 'RECEIPTS_ACL_MISMATCH: %',s;end if;end loop;if exists(select 1 from pg_proc where oid in (to_regprocedure('fn_installment_signature_guard()'),to_regprocedure('fn_installment_collection_guard()'),to_regprocedure('fn_installment_request_v2(text,jsonb)'),to_regprocedure('fn_member_sign_installment(text,integer,text)'),to_regprocedure('fn_member_sign_installment_v2(text,text,text)'),to_regprocedure('fn_installment_terms(text,integer,numeric,text,integer)'),to_regprocedure('fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)')) and (not prosecdef or not coalesce(proconfig @> array['search_path=public, pg_temp'],false))) then raise exception 'DEFINER_CONFIG_MISMATCH';end if;if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and t.tgenabled='O' and ((c.relname='contracts' and t.tgname='trg_installment_signature_guard' and t.tgfoid='fn_installment_signature_guard()'::regprocedure) or (c.relname='member_tickets' and t.tgname='trg_installment_collection_guard' and t.tgfoid='fn_installment_collection_guard()'::regprocedure)))<>2 then raise exception 'GUARD_TRIGGER_MISMATCH';end if;end $acl$;
do $unused$declare n text;begin if current_setting('app.ic_frontend_retired',true) is distinct from 'yes' or coalesce(nullif(btrim(current_setting('app.ic_removal_authorization',true)),''),'')='' then raise exception 'EXPLICIT_REMOVAL_AUTHORIZATION_REQUIRED';end if;if exists(select 1 from installment_receipts) then raise exception 'RECEIPTS_EXIST_KEEP_OBJECTS';end if;if exists(select 1 from contracts c cross join lateral jsonb_array_elements(coalesce(c.installment_signs,'[]')) a where a->>'request_id' is not null) then raise exception 'V2_SIGNATURE_EVIDENCE_EXISTS_KEEP_OBJECTS';end if;for n in select proname from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('fn_installment_signature_guard','fn_installment_collection_guard','fn_installment_request_v2','fn_member_sign_installment','fn_member_sign_installment_v2','fn_installment_terms','fn_installment_collect_v2') and (pg_get_functiondef(oid) ilike '%fn_installment_signature_guard%' or pg_get_functiondef(oid) ilike '%fn_installment_collection_guard%' or pg_get_functiondef(oid) ilike '%fn_installment_request_v2%' or pg_get_functiondef(oid) ilike '%fn_member_sign_installment_v2%' or pg_get_functiondef(oid) ilike '%fn_installment_terms%' or pg_get_functiondef(oid) ilike '%fn_installment_collect_v2%') loop raise exception 'EXTERNAL_FUNCTION_REFERENCE: %',n;end loop;end $unused$;
create temp table ic_release_before on commit drop as select jsonb_build_object(
 'functions',(select md5(coalesce(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) order by p.oid::regprocedure::text)::text,'[]')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('fn_installment_signature_guard','fn_installment_collection_guard','fn_installment_request_v2','fn_member_sign_installment','fn_member_sign_installment_v2','fn_installment_terms','fn_installment_collect_v2')),
 'columns',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) order by c.relname,a.attnum)::text,'[]')) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and c.relname<>'installment_receipts' and a.attnum>0 and not a.attisdropped),
 'policies',(select md5(coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname)::text,'[]')) from pg_policies where schemaname='public' and tablename<>'installment_receipts'),
 'grants',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl::text) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') and c.relname<>'installment_receipts'),
 'triggers',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)::text,'[]')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and t.tgname not in ('trg_installment_collection_guard','trg_installment_signature_guard')),
 'constraints',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,x.conname,pg_get_constraintdef(x.oid)) order by c.relname,x.conname)::text,'[]')) from pg_constraint x join pg_class c on c.oid=x.conrelid where c.relnamespace='public'::regnamespace and c.relname<>'installment_receipts'),
 'indexes',(select md5(coalesce(jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) order by tablename,indexname)::text,'[]')) from pg_indexes where schemaname='public' and tablename<>'installment_receipts'),
 'views',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.reloptions,pg_get_viewdef(c.oid)) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m'))
) catalog,jsonb_build_object('contracts',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.contracts x),'member_tickets',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.member_tickets x),'purchases',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.purchases x),'ticket_logs',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.ticket_logs x),'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.invoices x)) data;
drop trigger trg_installment_signature_guard on contracts;
drop trigger trg_installment_collection_guard on member_tickets;
drop function public.fn_installment_signature_guard();
drop function public.fn_installment_collection_guard();
drop function public.fn_installment_collect_v2(text,text,jsonb,boolean,jsonb);
drop function public.fn_member_sign_installment_v2(text,text,text);
drop function public.fn_installment_request_v2(text,jsonb);
drop function public.fn_installment_terms(text,integer,numeric,text,integer);
drop table public.installment_receipts;
CREATE OR REPLACE FUNCTION public.fn_member_sign_installment(p_contract_id text, p_n integer, p_signature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c contracts%rowtype;
  arr jsonb;
  idx int;
  hit jsonb;
begin
  select * into c from contracts where id=p_contract_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','CONTRACT.NOT_FOUND'); end if;
  if current_member_id() is null or c.member_id <> current_member_id() then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
  end if;
  if p_signature is null or length(p_signature) < 200 then
    return jsonb_build_object('ok',false,'error_code','SIGNATURE.INVALID');
  end if;

  arr := coalesce(c.installment_signs,'[]'::jsonb);
  select i, e into idx, hit
    from jsonb_array_elements(arr) with ordinality t(e,ord), lateral (select ord-1) s(i)
   where (e->>'n')::int = p_n
   limit 1;

  if hit is null then return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_PENDING'); end if;
  if (hit->>'signature') is not null then return jsonb_build_object('ok',true,'already',true); end if;
  if coalesce(hit->>'sign_type','remote') <> 'remote' then
    return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_REMOTE');
  end if;

  arr := jsonb_set(arr, array[idx::text],
           hit || jsonb_build_object('signature',p_signature,'signed_at',to_jsonb(now())));
  update contracts
     set installment_signs=arr,
         pending_sign_n  = case when pending_sign_n = p_n then null else pending_sign_n end,
         pending_sign_at = case when pending_sign_n = p_n then null else pending_sign_at end
   where id=c.id;
  return jsonb_build_object('ok',true,'contract_id',c.id,'n',p_n);
exception when others then
  return jsonb_build_object('ok',false,'error_code',sqlerrm);
end $function$;

revoke all on function fn_member_sign_installment(text,integer,text) from public,anon,authenticated,service_role;grant execute on function fn_member_sign_installment(text,integer,text) to authenticated;
do $pin$ declare x record;begin for x in select * from jsonb_each_text('{"fn_member_sign_installment(text,integer,text)": "8cc549573ff226306c138e85ad3f2950"}'::jsonb) loop if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.'||x.key)) is distinct from x.value then raise exception 'FUNCTION_VERSION_MISMATCH: %',x.key;end if;end loop;end $pin$;
do $same$begin if (select catalog from ic_release_before) is distinct from (select jsonb_build_object(
 'functions',(select md5(coalesce(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) order by p.oid::regprocedure::text)::text,'[]')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('fn_installment_signature_guard','fn_installment_collection_guard','fn_installment_request_v2','fn_member_sign_installment','fn_member_sign_installment_v2','fn_installment_terms','fn_installment_collect_v2')),
 'columns',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) order by c.relname,a.attnum)::text,'[]')) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and c.relname<>'installment_receipts' and a.attnum>0 and not a.attisdropped),
 'policies',(select md5(coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname)::text,'[]')) from pg_policies where schemaname='public' and tablename<>'installment_receipts'),
 'grants',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl::text) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') and c.relname<>'installment_receipts'),
 'triggers',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)::text,'[]')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and t.tgname not in ('trg_installment_collection_guard','trg_installment_signature_guard')),
 'constraints',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,x.conname,pg_get_constraintdef(x.oid)) order by c.relname,x.conname)::text,'[]')) from pg_constraint x join pg_class c on c.oid=x.conrelid where c.relnamespace='public'::regnamespace and c.relname<>'installment_receipts'),
 'indexes',(select md5(coalesce(jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) order by tablename,indexname)::text,'[]')) from pg_indexes where schemaname='public' and tablename<>'installment_receipts'),
 'views',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.reloptions,pg_get_viewdef(c.oid)) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m'))
)) then raise exception 'UNRELATED_CATALOG_CHANGED';end if;if (select data from ic_release_before) is distinct from (select jsonb_build_object('contracts',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.contracts x),'member_tickets',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.member_tickets x),'purchases',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.purchases x),'ticket_logs',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.ticket_logs x),'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.invoices x))) then raise exception 'BUSINESS_DATA_CHANGED';end if;end $same$;
notify pgrst,'reload schema';
commit;
