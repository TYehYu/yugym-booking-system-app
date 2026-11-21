import hashlib
from pathlib import Path
P=Path(__file__).parent
old=(P/'original.sql').read_text();new=(P/'candidate.sql').read_text()
def body(s):return hashlib.md5(s.split('AS $function$')[1].split('$function$')[0].encode()).hexdigest()
def guard(pin):return """do $guard$begin
if (pg_control_system()).system_identifier::text <> '7637215626725903220' then raise exception 'RELEASE.WRONG_ENV';end if;
if not exists(select 1 from pg_proc where oid='public.fn_cancel_booking(text,text,boolean)'::regprocedure
 and md5(prosrc)='%s' and proacl::text='{postgres=X/postgres,=X/postgres}'
 and prosecdef and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.VERSION_OR_ACL';end if;
end $guard$;
"""%pin
for name,source,before,after in [('apply_prod.sql',new,body(old),body(new)),('rollback_prod.sql',old,body(new),body(old))]:
 (P/name).write_text('-- Review artifact only. Production execution requires release authorization.\n'
  +'begin;\nset local lock_timeout=\'3s\';\nset local statement_timeout=\'30s\';\n'
  +guard(before)+source+'\n'+guard(after)+'commit;\n')
(P/'verify_readonly.sql').write_text("select md5(prosrc)='"+body(new)+"' as body_matches, proacl::text='{postgres=X/postgres,=X/postgres}' as acl_preserved, prosecdef and proconfig=array['search_path=public, pg_temp'] as security_preserved from pg_proc where oid='public.fn_cancel_booking(text,text,boolean)'::regprocedure;\n")
