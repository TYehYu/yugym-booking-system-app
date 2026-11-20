'''TEST-only transaction rehearsal. Exact release files differ only in cluster ID and outer transaction envelope.'''
from pathlib import Path
import subprocess,json,hashlib
p=Path(__file__).resolve().parent;root=p.parent
prod='7637215626725903220';test='7662742571317219726'
install=subprocess.check_output(['python3',str(root/'acceptance/build_environment.py')],text=True)
prefix=install[:install.index('-- Candidate only, TEST database only;')]
assert prefix.startswith('begin;\n');prefix=prefix[len('begin;\n'):]
missing=json.loads((p/'rehearsal_missing_columns.json').read_text())
already={('contracts',c) for c in ['fill_snapshot','installment_signs','pending_sign_n','pending_sign_at']}|{('member_tickets','sold_by'),('member_tickets','sale_kind')}
for c in missing:
 if c['table']=='invoices' or (c['table'],c['column']) in already:continue
 assert c['udt'] in ['text','timestamptz','date','bool','jsonb','numeric']
 prefix+='alter table public.'+c['table']+' add column '+c['column']+' '+c['type']+(' default '+c['default'] if c['default'] else '')+(' not null' if c['nullable']=='NO' else '')+';\n'
# Rehearsal parity includes every pinned dependency, not just earlier UI dependencies.
pre=json.loads((root/'acceptance/production_release_preflight.json').read_text())
def exact(definition):
 def repl(m):
  body=m[2].replace('\\','\\\\').replace("'","''").replace('\r','\\r').replace('\n','\\n');return "AS E'"+body+"'"
 import re
 return re.sub(r'AS (\$[A-Za-z_0-9]*\$)([\s\S]*?)\1',repl,definition,count=1,flags=re.I)
for f in pre['functions']:
 prefix+=exact(f['definition'])+';\n'
 if f.get('acl') is not None:
  prefix+='revoke all on function '+f['signature']+' from public,anon,authenticated,service_role;\n'
  for acl in f['acl'].strip('{}').split(','):
   role,rights=acl.split('=');role=role or 'public';assert role in ['postgres','authenticated','anon','service_role','public']
   if 'X' in rights:prefix+='grant execute on function '+f['signature']+' to '+role+(' with grant option' if 'X*' in rights else '')+';\n'

prefix+="create trigger trg_change_log after insert or update or delete on ticket_types for each row execute function fn_log_change();\n"
prefix+=(root/'original_sign_rpc.sql').read_text()+"\nrevoke all on function fn_member_sign_installment(text,integer,text) from public,anon,authenticated,service_role;grant execute on function fn_member_sign_installment(text,integer,text) to authenticated;\n"
def body(name):
 s=(p/name).read_text();assert s.count('\nbegin;\n')==1 and s.endswith('commit;\n') and s.count(prod)==1
 return s.replace('\nbegin;\n','\n',1)[:-len('commit;\n')].replace(prod,test)
a=body('apply_prod.sql');b=body('rollback_unused_prod.sql')
catalog=(root/'acceptance/recheck_catalog_query.sql').read_text().strip().rstrip(';')
sql='begin;\n'+prefix+'\ncreate function pg_temp.ic_catalog() returns jsonb language sql as $catalog$'+catalog+'$catalog$;\ncreate temp table ic_rehearsal_catalog as select pg_temp.ic_catalog() before;\ncreate temp table ic_rehearsal_results(name text,ok boolean);\n'+a+"\ninsert into ic_rehearsal_results values('complete apply and unchanged data/catalog checks',true);\n"
def negative(name,body,expected):
 return "do $negative$declare blocked boolean:=false;begin begin execute $body$"+body+"$body$;exception when others then blocked:="+expected+";end;if not blocked then raise exception 'NEGATIVE_TEST_FAILED: "+name+"';end if;insert into ic_rehearsal_results values('"+name+"',true);end $negative$;\n"
sql+=negative('production file refuses test cluster',a.replace(test,prod),"sqlerrm='WRONG_PRODUCTION_CLUSTER'")
sql+=negative('repeat apply refuses installed version',a,"sqlerrm like 'FUNCTION_VERSION_MISMATCH:%'")
post_sql=(p/'verify_post_readonly.sql').read_text();post_sql='\n'.join(x for x in post_sql.splitlines() if not x.startswith('--')).strip().rstrip(';')
sql+="create temp table ic_post_readonly as "+post_sql+";\ndo $$begin if exists(select 1 from ic_post_readonly r cross join lateral jsonb_each(to_jsonb(r)) e where e.value is distinct from 'true'::jsonb) then raise exception 'POST_READONLY_VERIFY_FAILED';end if;end$$;\ninsert into ic_rehearsal_results values('complete readonly post verifier',true);\n"
for name,settings,expected in [('no removal settings',"select set_config('app.ic_frontend_retired','',true);select set_config('app.ic_removal_authorization','',true);",'EXPLICIT_REMOVAL_AUTHORIZATION_REQUIRED'),('missing authorization record',"select set_config('app.ic_frontend_retired','yes',true);select set_config('app.ic_removal_authorization','',true);",'EXPLICIT_REMOVAL_AUTHORIZATION_REQUIRED')]:
 sql+=settings+"\ndo $negative$declare blocked boolean:=false;begin begin execute $rb$"+b+"$rb$;exception when others then blocked:=sqlerrm='"+expected+"';end;if not blocked then raise exception 'NEGATIVE_TEST_FAILED';end if;insert into ic_rehearsal_results values('"+name+"',blocked);end $negative$;\n"
sql+="select set_config('app.ic_frontend_retired','yes',true);select set_config('app.ic_removal_authorization','TEST-only',true);\ninsert into installment_receipts(id,ticket_id,contract_id,terms,purchase_id,operator) values('CC-IC-RELEASE-RECEIPT','CC-IC-NONREAL','CC-IC-NONREAL','{}','CC-IC-NONREAL','TEST');\n"
sql+=negative('receipt prevents full removal',b,"sqlerrm='RECEIPTS_EXIST_KEEP_OBJECTS'")
sql+="delete from installment_receipts where id='CC-IC-RELEASE-RECEIPT';insert into members(id,name) values('CC-IC-RELEASE-M','TEST RELEASE GUARD');insert into contracts(id,member_id,installment_signs) values('CC-IC-RELEASE-C','CC-IC-RELEASE-M','[{\"request_id\":\"TEST-REQUEST\"}]');\n"
sql+=negative('signature request prevents full removal',b,"sqlerrm='V2_SIGNATURE_EVIDENCE_EXISTS_KEEP_OBJECTS'")
sql+="delete from contracts where id='CC-IC-RELEASE-C';delete from members where id='CC-IC-RELEASE-M';\n"
sql+="drop table ic_release_before;\nselect set_config('app.ic_frontend_retired','yes',true);select set_config('app.ic_removal_authorization','TEST-only rehearsal; no production authorization',true);\n"+b+"\ninsert into ic_rehearsal_results values('complete unused rollback',true);\ninsert into ic_rehearsal_results select 'full parity catalog restored',(select before from ic_rehearsal_catalog)=pg_temp.ic_catalog();\ndo $$begin if exists(select 1 from ic_rehearsal_results where not ok) then raise exception 'REHEARSAL_FAILED';end if;end$$;\nselect jsonb_build_object('passed',count(*) filter(where ok),'failed',count(*) filter(where not ok),'results',jsonb_agg(to_jsonb(r))) rehearsal from ic_rehearsal_results r;\nrollback;\n"
print(sql,end='')
