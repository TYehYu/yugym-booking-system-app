'''TEST only, no network/key. Generate committed fixture environment; remove it after runner cleanup.'''
from pathlib import Path
import subprocess,json,re,sys
p=Path(__file__).resolve().parent;root=p.parent
sql=subprocess.check_output(['python3',str(root/'acceptance/build_environment.py')]+(['--teardown'] if '--teardown' in sys.argv else []),text=True)
assert sql.startswith('begin;\n') and sql.endswith('commit;\n')
stage=json.loads((p/'stage12_dependency.json').read_text());assert len(stage)==1;f=stage[0];signature=f['signature'];assert signature=='fn_hold_settle_new_ticket(text,boolean,text,jsonb)'
def exact(s):
 def replace(m):return "AS E'"+m[2].replace('\\','\\\\').replace("'","''").replace('\r','\\r').replace('\n','\\n')+"'"
 return re.sub(r'AS (\$[A-Za-z_0-9]*\$)([\s\S]*?)\1',replace,s,count=1,flags=re.I)
already={('contracts',n) for n in ['fill_snapshot','installment_signs','pending_sign_at','pending_sign_n']}|{('member_tickets','sale_kind'),('member_tickets','sold_by')}
extra=[c for c in json.loads((root/'release/rehearsal_missing_columns.json').read_text()) if c['table']!='invoices' and (c['table'],c['column']) not in already]
extra += [{'table':'ticket_grant_requests','column':n,'type':typ,'default':None,'nullable':'YES'} for n,typ in [('filled_by','text'),('filled_at','timestamp with time zone')]]
if '--teardown' in sys.argv:
 drop="do $$begin if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public."+signature+"')) is distinct from '"+f['md5']+"' then raise exception 'STAGE12_CHANGED';end if;end$$;\ndrop function public."+signature+';\n'
 sql=sql.replace("drop function zz_ica_collect",drop+"drop function zz_ica_collect",1)
 sql=sql[:-len('commit;\n')]+''.join('alter table public.'+c['table']+' drop column '+c['column']+';\n' for c in extra)+"notify pgrst,'reload schema';\ncommit;\n"
else:
 add="do $$begin if to_regprocedure('public."+signature+"') is not null then raise exception 'STAGE12_NAME_OCCUPIED';end if;end$$;\n"+exact(f['definition'])+';\nrevoke all on function '+signature+' from public,anon,authenticated,service_role;grant execute on function '+signature+' to authenticated;\n'
 add+=''.join('alter table public.'+c['table']+' add column '+c['column']+' '+c['type']+(' default '+c['default'] if c['default'] else '')+(' not null' if c['nullable']=='NO' else '')+';\n' for c in extra)
 finger=(root/'acceptance/observer.sql').read_text();finger=finger[finger.index('create function public.zz_ica_fingerprint()'):];finger=finger[:finger.index('$fn$;')+len('$fn$;')];finger=finger.replace('create function public.zz_ica_fingerprint','create or replace function public.zz_ica_fingerprint').replace("'zz_ica_clean_receipts'))","'zz_ica_clean_receipts','fn_hold_settle_new_ticket'))");
 sql=sql[:-len('commit;\n')]+add+finger+'\n'+"notify pgrst,'reload schema';\ncommit;\n"
print(sql,end='')
