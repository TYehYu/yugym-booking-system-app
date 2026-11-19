from pathlib import Path
import json,re,hashlib
p=Path('docs/booking-health');out=p/'release';out.mkdir(exist_ok=True)
old=json.loads((p/'evidence/prod_release_before_catalog.json').read_text());c=json.loads((p/'candidate_functions.json').read_text());helper=(p/'ledger_helper_candidate.sql').read_text();names=set(c)|{'fn_ticket_net_checked'}
rows={x['proname']:x for x in old};sig={n:r['signature'] for n,r in rows.items()};sig.update(fn_member_leave_group_v2='fn_member_leave_group_v2(text,text,text)',fn_member_group_cancel_preview='fn_member_group_cancel_preview(text)',fn_ticket_net_checked='fn_ticket_net_checked(text,text)')
def body(s):
 m=re.search(r'\bas\s+(\$\w*\$)([\s\S]*?)\1',s,re.I);assert m;return hashlib.md5(m[2].encode()).hexdigest()
def check(signature,md):return "if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public."+signature+"')) is distinct from '"+md+"' then raise exception 'VERSION_MISMATCH: "+signature+"'; end if;"
def perms(r):
 # actual default function ACL is PUBLIC EXECUTE when ACL is null
 acl=r['acl']; roles=['public'] if acl is None else re.findall(r'(?:\{|,)([^=]+)=X/',acl)
 return [x for x in roles if x!='postgres']
def setacl(signature,roles):return 'revoke all on function public.'+signature+' from public,anon,authenticated,service_role;\n'+''.join('grant execute on function public.'+signature+' to '+x+';\n' for x in roles)
def aclcheck(signature,roles):
 return '\n'.join("if has_function_privilege('"+role+"','public."+signature+"','EXECUTE') is distinct from "+str(role in roles or 'public' in roles).lower()+" then raise exception 'ACL_MISMATCH: "+signature+" "+role+"'; end if;" for role in ['anon','authenticated','service_role'])
pre='\n'.join(check(r['signature'],r['body_md5']) for r in old)
pre+='\n'+'\n'.join("if to_regprocedure('public."+sig[n]+"') is not null then raise exception 'NAME_OCCUPIED: "+n+"'; end if;" for n in names if n not in rows)
pre+='\n'+'\n'.join(aclcheck(r['signature'],perms(r)) for r in old)
ddl=helper+'\n'+'\n'.join(x.rstrip().rstrip(';')+';' for x in c.values())
post='';pins={}
for n in sorted(names):
 src=helper if n=='fn_ticket_net_checked' else c[n];pins[n]=body(src)
 roles=[] if n in ['fn_ticket_net_checked','benefit_refund'] else ['authenticated'] if n not in rows else perms(rows[n])
 ddl+='\n'+setacl(sig[n],roles)
 post+='\n'+check(sig[n],pins[n])+ '\n'+aclcheck(sig[n],roles)
 # all code remains security definer with pinned path
 post+="\nif not exists(select 1 from pg_proc where oid=to_regprocedure('public."+sig[n]+"') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: "+n+"'; end if;"
base="if (select system_identifier::text from pg_control_system())<>'7637215626725903220' then raise exception 'PRODUCTION_ONLY'; end if;"
apply="-- Ticket accounting safety; DDL only, no historical balance rewrite.\nbegin;\nset local lock_timeout='5s';\ndo $release$ begin\n"+base+'\n'+pre+'\nexecute $ddl$'+ddl+'$ddl$;\n'+post+"\nend $release$;\nnotify pgrst,'reload schema';\ncommit;\n"
restore='\n'.join(r['definition'].rstrip().rstrip(';')+';'+'\n'+setacl(r['signature'],perms(r)) for r in old if r['proname'] in c)
restore+='\n'+'\n'.join('drop function public.'+sig[n]+';' for n in ['fn_member_leave_group_v2','fn_member_group_cancel_preview','fn_ticket_net_checked'])
rollback="-- Use only with explicit incident authorization and handling of open new pages.\nbegin;\ndo $undo$ begin\n"+base+"\nif current_setting('app.ticket_rollback_authorized',true) is distinct from 'yes' then raise exception 'AUTHORIZATION_REQUIRED'; end if;\n"+post+'\nexecute $ddl$'+restore+'$ddl$;\n'+'\n'.join(check(r['signature'],r['body_md5']) for r in old)+"\nend $undo$;\nnotify pgrst,'reload schema';\ncommit;\n"
(out/'apply_prod.sql').write_text(apply);(out/'rollback_prod.sql').write_text(rollback);(out/'pins.json').write_text(json.dumps(pins,indent=2))
# Rehearse whole release files with only cluster substitution; bootstrap dependencies in outer rollback.
combined=Path('/private/tmp/two-ai-install-combined.sql').read_text()
bootstrap='\n'.join(r['definition'].rstrip().rstrip(';')+';\n'+setacl(r['signature'],perms(r)) for r in old)
bootstrap+='\n'+'\n'.join('drop function public.'+sig[n]+';' for n in ['fn_member_leave_group_v2','fn_member_group_cancel_preview','fn_ticket_net_checked'])
def inner(sql):
 sql=re.sub(r'(?m)^begin;\s*|^commit;\s*','',sql);return sql.replace('7637215626725903220','7662742571317219726')
rehearse='do $rehearsal$ begin\n'+"if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY'; end if;\n"+'execute $boot$'+combined+'\n'+bootstrap+'$boot$;\nexecute $apply$'+inner(apply)+'$apply$;\n'+"perform set_config('app.ticket_rollback_authorized','yes',true);\n"+'execute $undoall$'+inner(rollback)+'$undoall$;\n'+"raise exception 'RELEASE_REHEARSAL_PASS: apply, postconditions, rollback and original hashes verified; outer rollback';\nend $rehearsal$;"
(out/'rehearse_test_rollback.sql').write_text(rehearse)
print('Release functions:',len(names),'; existing preconditions:',len(old))
