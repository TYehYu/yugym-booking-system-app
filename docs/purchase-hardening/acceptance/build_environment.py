'''Generate guarded test-only DDL from captured definitions. No network/credentials.'''
from pathlib import Path
import json,hashlib,re,sys
p=Path(__file__).resolve().parent;root=p.parent
prod=json.loads((p/'production_dependencies.json').read_text());original=json.loads((p/'original_test_functions.json').read_text());old={x['signature']:x for x in original}
quote=lambda s:'"'+s.replace('"','""')+'"'
def exact(definition):
 def repl(m):
  body=m[2].replace('\\','\\\\').replace("'","''").replace('\r','\\r').replace('\n','\\n');return "AS E'"+body+"'"
 return re.sub(r'AS (\$[A-Za-z_0-9]*\$)([\s\S]*?)\1',repl,definition,count=1,flags=re.I)
guard="do $$begin if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY';end if;end$$;\n"
changed=[x for x in prod if x['signature'] not in old or x['md5']!=old[x['signature']]['md5']]
install='begin;\n'+guard+"do $$begin if to_regclass('public.invoices') is not null or to_regclass('public.installment_receipts') is not null or to_regprocedure('public.fn_member_sign_installment(text,integer,text)') is not null then raise exception 'BASELINE_NOT_EXPECTED';end if;end$$;\n"
install+="alter table contracts add column installment_signs jsonb not null default '[]', add column pending_sign_n integer, add column pending_sign_at timestamptz,add column fill_snapshot text;\nalter table member_tickets add column sold_by text,add column sale_kind text;\n"
baseline=json.loads((p/'catalog_baseline.json').read_text())
install+="do $$begin if (select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f')<>'"+baseline['functions']+"' then raise exception 'BASELINE_FUNCTIONS_CHANGED';end if;end$$;\n"
for f in changed:
 install+=exact(f['definition'])+';\n'
 if f['signature'] not in old and f['name']=='fn_member_sign_contract':install+='revoke all on function '+f['signature']+' from public,anon,authenticated,service_role;grant execute on function '+f['signature']+' to authenticated;\n'
# Mirrors actual invoice shape/policies; no production rows copied.
a=json.loads((p/'invoice_schema.json').read_text());cols=[]
for c in a['columns']:
 cols.append(quote(c['name'])+' '+c['type']+(' default '+c['default'] if c['default'] else '')+(' not null' if c['notnull'] else ''))
cols += ['constraint '+quote(c['name'])+' '+c['definition'] for c in a['constraints']]
install+='create table public.invoices (\n'+',\n'.join(cols)+'\n);\nalter table invoices enable row level security;\n'
for pol in a['policies']:
 roles=','.join('public' if r=='public' else quote(r) for r in pol['roles'])
 install+='create policy '+quote(pol['name'])+' on invoices as '+pol['permissive']+' for '+pol['cmd']+' to '+roles+(' using ('+pol['qual']+')' if pol['qual'] else '')+(' with check ('+pol['check']+')' if pol['check'] else '')+';\n'
for idx in a['indexes']:install+=idx+';\n'
install+='revoke all on invoices from anon;grant select,insert,update,delete on invoices to authenticated,service_role;\n'
for table in ['contracts','member_tickets','ticket_logs','purchases','invoices']:
 install+='create trigger trg_change_log after insert or update or delete on '+table+' for each row execute function fn_log_change();\n'
install+='create trigger trg_tk_quota_guard before update of sessions_remaining,sessions_total,unlocked_sessions on member_tickets for each row execute function trg_tk_quota_guard();\n'
install+=(root/'candidate.sql').read_text()+'\n'+(p/'observer.sql').read_text()+"\nnotify pgrst,'reload schema';\ncommit;\n"
# Guarded retirement is only allowed after all fixture receipts/invoices are independently cleared.
teardown='begin;\n'+guard+"do $$begin if exists(select 1 from invoices) or exists(select 1 from installment_receipts) then raise exception 'FIXTURES_STILL_PRESENT';end if;end$$;\n"
for sig in ['zz_ica_collect(text,text,text,text,jsonb,jsonb)','zz_ica_clean_receipts(text[],text[])','zz_ica_fingerprint()']:teardown+='drop function '+sig+';\n'
teardown+='revoke select on installment_receipts from service_role;\n'+(root/'rollback_candidate.sql').read_text()+'\ndrop function fn_member_sign_installment(text,integer,text);\n'
for table in ['contracts','member_tickets','ticket_logs','purchases','invoices']:teardown+='drop trigger trg_change_log on '+table+';\n'
teardown+='drop trigger trg_tk_quota_guard on member_tickets;\ndrop table invoices;\n'
for f in reversed(changed):
 if f['signature'] in old:teardown+=exact(old[f['signature']]['definition'])+';\n'
 else:teardown+='drop function '+f['signature']+';\n'
teardown+="alter table contracts drop column installment_signs,drop column pending_sign_n,drop column pending_sign_at,drop column fill_snapshot;\nalter table member_tickets drop column sold_by,drop column sale_kind;\nnotify pgrst,'reload schema';\ncommit;\n"
# All expected hashes come from reviewed files / captured production code, not installed objects.
expected=dict(json.loads((root/'sql_result.json').read_text())['pins'])
src=(p/'observer.sql').read_text()
for name,args in [('zz_ica_collect','text,text,text,text,jsonb,jsonb'),('zz_ica_clean_receipts','text[],text[]')]:
 section=src[src.index('create function public.'+name+'('):];body=re.search(r'as \$fn\$([\s\S]*?)\$fn\$',section,re.I)[1];expected[name+'('+args+')']=hashlib.md5(body.encode()).hexdigest()
(p/'expected.json').write_text(json.dumps(expected,indent=2))
guard_pins="do $g$ declare kv record;begin for kv in select * from jsonb_each_text('"+json.dumps(expected,separators=(',',':'))+"'::jsonb) loop if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.'||kv.key)) is distinct from kv.value then raise exception 'OBSERVER_OR_CANDIDATE_CHANGED: %',kv.key;end if;end loop;end $g$;\n"
teardown=teardown.replace(guard,guard+guard_pins,1)
print(teardown if '--teardown' in sys.argv else install,end='')
