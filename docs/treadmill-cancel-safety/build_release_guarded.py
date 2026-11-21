import runpy,hashlib
from pathlib import Path
P=Path(__file__).parent
d=runpy.run_path(str(P/'build_release.py'))
sg=(P/'sibling_guard.sql').read_text()
pin=hashlib.md5(sg.split('as $function$')[1].split('$function$')[0].encode()).hexdigest()
absent="""do $absent$begin
if to_regprocedure('public.fn_treadmill_sibling_parent_guard()') is not null or exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_treadmill_sibling_parent_guard') then raise exception 'RELEASE.NAME_OCCUPIED';end if;
end $absent$;
"""
installed="""do $installed$begin
if not exists(select 1 from pg_proc where oid='public.fn_treadmill_sibling_parent_guard()'::regprocedure and md5(prosrc)='%s' and prosecdef and proconfig=array['search_path=public, pg_temp'])
 or has_function_privilege('anon','public.fn_treadmill_sibling_parent_guard()','execute')
 or has_function_privilege('authenticated','public.fn_treadmill_sibling_parent_guard()','execute')
 or has_function_privilege('service_role','public.fn_treadmill_sibling_parent_guard()','execute')
 or not exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_treadmill_sibling_parent_guard' and tgfoid='public.fn_treadmill_sibling_parent_guard()'::regprocedure and tgenabled='O' and tgtype=23) then raise exception 'RELEASE.SIBLING_GUARD_INVALID';end if;
end $installed$;
"""%pin
snapshot="""create temp table tc_release_snapshot on commit drop as
select (select md5(string_agg(oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_booking','fn_treadmill_sibling_parent_guard')) functions,
 (select md5(string_agg(pg_get_triggerdef(oid),'|' order by tgrelid,tgname)) from pg_trigger where not tgisinternal and tgname<>'trg_treadmill_sibling_parent_guard') triggers;
"""
compare="""do $unchanged$begin
if exists(select 1 from tc_release_snapshot s where s.functions is distinct from
 (select md5(string_agg(oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_booking','fn_treadmill_sibling_parent_guard'))
 or s.triggers is distinct from (select md5(string_agg(pg_get_triggerdef(oid),'|' order by tgrelid,tgname)) from pg_trigger where not tgisinternal and tgname<>'trg_treadmill_sibling_parent_guard')) then raise exception 'RELEASE.UNRELATED_OBJECT_CHANGED';end if;
end $unchanged$;
"""
a=(P/'apply_prod.sql').read_text();a=a.replace(d['new'],absent+snapshot+d['new']+'\n'+sg,1).replace('commit;',installed+compare+'commit;')
r=(P/'rollback_prod.sql').read_text();r=r.replace(d['old'],installed+snapshot+d['old']+'\ndrop trigger trg_treadmill_sibling_parent_guard on public.bookings;\ndrop function public.fn_treadmill_sibling_parent_guard();\n',1).replace('commit;',absent+compare+'commit;')
(P/'apply_prod.sql').write_text(a);(P/'rollback_prod.sql').write_text(r)
v=(P/'verify_readonly.sql').read_text().rstrip().rstrip(';')
v+=';\n'+"select md5(prosrc)='"+pin+"' as sibling_guard_matches, not has_function_privilege('anon',oid,'execute') and not has_function_privilege('authenticated',oid,'execute') and not has_function_privilege('service_role',oid,'execute') as guard_internal_only, exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_treadmill_sibling_parent_guard' and tgenabled='O' and tgtype=23) as trigger_enabled from pg_proc where oid=to_regprocedure('public.fn_treadmill_sibling_parent_guard()');\n"
(P/'verify_readonly.sql').write_text(v)
