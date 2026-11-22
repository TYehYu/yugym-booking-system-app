from pathlib import Path
import json,hashlib
P=Path(__file__).parent
def pin(s):return hashlib.md5(s.split('AS $function$')[1].split('$function$')[0].encode()).hexdigest()
old=(P/'original.sql').read_text();new=(P/'candidate.sql').read_text()
def guard(body):return """do $guard$begin
if (pg_control_system()).system_identifier::text<>'7637215626725903220' then raise exception 'RELEASE.WRONG_ENV';end if;
if not exists(select 1 from pg_proc where oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure and md5(prosrc)='%s' and proacl::text='{postgres=X/postgres,authenticated=X/postgres}' and prosecdef and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.VERSION_OR_ACL';end if;
end $guard$;
"""%body
depcheck='do $deps$begin\n'
for f in json.loads((P/'dependencies.json').read_text()):
 depcheck+="if (select md5(prosrc) from pg_proc where oid='public.%s(%s)'::regprocedure) is distinct from '%s' then raise exception 'RELEASE.DEPENDENCY_CHANGED:%s';end if;\n"%(f['proname'],','.join(x.strip().split(' ')[-1] for x in f['args'].split(',')) if f['args'] else '',f['md5'],f['proname'])
depcheck+='end $deps$;\n'
snapshot="""create temp table ir_release_snapshot on commit drop as select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) h from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname<>'fn_hold_settle_new_ticket';
"""
post="""do $post$begin if (select h from ir_release_snapshot) is distinct from (select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname<>'fn_hold_settle_new_ticket') then raise exception 'RELEASE.UNRELATED_FUNCTION_CHANGED';end if;end $post$;
"""
for name,text,before,after in [('apply_prod.sql',new,pin(old),pin(new)),('rollback_prod.sql',old,pin(new),pin(old))]:
 q="-- Authorized release only; no historical data changes.\nbegin;\nset local lock_timeout='3s';set local statement_timeout='30s';\n"+guard(before)+depcheck+snapshot+text+'\n'+guard(after)+post+'commit;\n'
 (P/name).write_text(q);(P/('test_'+name)).write_text(q.replace('7637215626725903220','7662742571317219726'))
(P/'verify_readonly.sql').write_text("select md5(prosrc)='"+pin(new)+"' as body_matches,proacl::text='{postgres=X/postgres,authenticated=X/postgres}' as acl_preserved,prosecdef and proconfig=array['search_path=public, pg_temp'] as security_preserved from pg_proc where oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure;\n")
