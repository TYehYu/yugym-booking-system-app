import json,re,hashlib
from pathlib import Path
P=Path(__file__).parent;root=P.parents[1]
base=(root/'docs/contract-hold-settlement/release_rehearsal_prep.sql').read_text()
commits=list(re.finditer(r'^commit;\s*$',base,re.M))
assert len(commits)==1
base=base[:commits[0].start()]
deps=json.loads((P/'test_dependencies.json').read_text())
extra='\n'.join(d['def'].rstrip()+';' for d in deps if d['signature'].split('(')[0] in ('fn_tk_refund_once','fn_desk_deduct_ticket'))
guard="""do $$begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='updated_at') then raise exception 'PARITY_COLUMN_ALREADY_PRESENT';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='partner_id' and data_type='text') then raise exception 'PARTNER_BASELINE_CHANGED';end if;
end$$;
alter table public.bookings add column updated_at timestamptz;
"""
install=base+guard+extra+'\n'+(P/'candidate.sql').read_text()+'\n'+(P/'observer.sql').read_text()+"\nnotify pgrst,'reload schema';\ncommit;\n"
(P/'acceptance_install_test.sql').write_text(install)
restore=(root/'docs/contract-hold-settlement/release_rehearsal_restore.sql').read_text()
assert restore.startswith('begin;')
remove="""begin;
set local lock_timeout='5s';
do $$begin
 if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;
 if exists(select 1 from bookings where id like 'CC-TLS-%') or exists(select 1 from member_tickets where id like 'CC-TLS-%') or exists(select 1 from members where id like 'CC-TLS-%') or exists(select 1 from employees where id like 'CC-EMP-TLS-%') or exists(select 1 from auth.users where email like 'cc-tls-%') then raise exception 'FIXTURES_REMAIN';end if;
end$$;
drop function public.zz_tls_call(text,text,text,text,text,text);
drop function public.zz_tls_fingerprint();
"""
remove+=(P/'rollback_candidate.sql').read_text()+"\nalter table public.bookings drop column updated_at;\n"+restore[len('begin;'):]
(P/'acceptance_restore_test.sql').write_text(remove)
pins={}
for filename in ['ledger_candidate.sql','refund_candidate.sql','move_candidate.sql','desk_cancel_candidate.sql','binding_guard_candidate.sql']:
    s=(P/filename).read_text();name=re.search(r'function public\.([a-z_]+)\(',s,re.I)[1];m=re.search(r'\bAS\s+(\$[A-Za-z0-9_]*\$)(.*?)\1',s,re.I|re.S);assert m
    pins[name]=hashlib.md5(m[2].encode()).hexdigest()
for d in deps:
    name=d['signature'].split('(')[0]
    if name in ('fn_tk_refund_once','fn_desk_deduct_ticket'):pins[name]=d['body_md5']
(P/'ACCEPTANCE_PINS.json').write_text(json.dumps(pins,indent=2)+'\n')
print('Built guarded test install/restore and 7 exact function body pins.')
