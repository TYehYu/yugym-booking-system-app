"""Guarded DDL-only release files. Does not connect or deploy."""
import json,hashlib
from pathlib import Path
P=Path(__file__).parent
originals=json.loads((P/'originals.json').read_text());pins=json.loads((P/'ACCEPTANCE_PINS.json').read_text())
names=[x['signature'].split('(')[0] for x in originals]+['fn_booking_transfer_ledger_guard']
quoted=','.join("'"+n+"'" for n in names)
original_sql=json.dumps(originals,ensure_ascii=False).replace("'","''")
guard_def='CREATE CONSTRAINT TRIGGER trg_booking_transfer_ledger_guard AFTER UPDATE ON public.bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((old.ticket_id IS DISTINCT FROM new.ticket_id)) EXECUTE FUNCTION fn_booking_transfer_ledger_guard()'
new_specs=[]
for d in originals:
    x={k:d[k] for k in ('signature','acl')};x['body_md5']=pins[d['signature'].split('(')[0]];new_specs.append(x)
new_specs.append({'signature':'fn_booking_transfer_ledger_guard()','body_md5':pins['fn_booking_transfer_ledger_guard'],'acl':'{postgres=X/postgres}'})
def pinblock(specs,label):
    data=json.dumps(specs,ensure_ascii=False).replace("'","''")
    return """do $pins$ declare r jsonb; p record; begin
for r in select * from jsonb_array_elements('%s'::jsonb) loop
 select md5(prosrc) body,proacl::text acl,prosecdef,proowner::regrole::text owner,proconfig into p from pg_proc where oid=to_regprocedure('public.'||(r->>'signature'));
 if not found or p.body is distinct from r->>'body_md5' or p.acl is distinct from r->>'acl' or not p.prosecdef or p.owner<>'postgres' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] then raise exception '%s.PIN:%%',r->>'signature';end if;
end loop;
end $pins$;
"""%(data,label)
def header(label):
    return """-- %s. DDL only; no member data repair. Single transaction, fail closed.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $env$begin if (pg_control_system()).system_identifier::text <> '7637215626725903220' then raise exception 'RELEASE.WRONG_ENV';end if;end $env$;
"""%label
capture="""create function pg_temp.tls_release_snapshot() returns jsonb language sql as $snap$
select jsonb_build_object(
'other_functions',(select md5(coalesce(string_agg(pg_get_functiondef(p.oid)||coalesce(proacl::text,''),'|' order by p.oid::regprocedure::text),'')) from pg_proc p where pronamespace='public'::regnamespace and prokind='f' and proname not in (%s)),
'other_triggers',(select md5(coalesce(string_agg(pg_get_triggerdef(t.oid)||t.tgenabled::text,'|' order by c.relname,t.tgname),'')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and t.tgname<>'trg_booking_transfer_ledger_guard'),
'policies',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text,'[]')) from pg_policies p where schemaname='public'),
'table_grants',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl::text) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S')),
'columns',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by table_name,ordinal_position)::text,'[]')) from information_schema.columns c where table_schema='public'),
'bookings',(select md5(string_agg(to_jsonb(b)::text,'|' order by id)) from public.bookings b),
'tickets',(select md5(string_agg(to_jsonb(t)::text,'|' order by id)) from public.member_tickets t),
'ledger',(select md5(string_agg(to_jsonb(l)::text,'|' order by id)) from public.ticket_logs l))
$snap$;
create temp table tls_release_before on commit drop as select pg_temp.tls_release_snapshot() snapshot;
"""%quoted
unchanged="""do $unchanged$begin if (select snapshot from tls_release_before) is distinct from pg_temp.tls_release_snapshot() then raise exception 'RELEASE.UNRELATED_STATE_CHANGED';end if;end $unchanged$;
drop function pg_temp.tls_release_snapshot();
"""
old=[{k:x[k] for k in ('signature','body_md5','acl')} for x in originals]
deps=[{'signature':x['signature'],'body_md5':x['body_md5'],'acl':x['acl']} for x in json.loads((P/'test_dependencies.json').read_text()) if x['signature'].split('(')[0] in ('fn_tk_refund_once','fn_desk_deduct_ticket')]
absent="""do $absent$begin if to_regprocedure('public.fn_booking_transfer_ledger_guard()') is not null or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_booking_transfer_ledger_guard') or exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_booking_transfer_ledger_guard') then raise exception 'RELEASE.NAME_OCCUPIED';end if;end $absent$;
"""
trigger="""do $trigger$begin if (select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_booking_transfer_ledger_guard') is distinct from '%s' then raise exception 'RELEASE.TRIGGER_MISMATCH';end if;end $trigger$;
"""%guard_def
apply=header('Apply transfer ledger ownership protection')+pinblock(old,'PRE')+pinblock(deps,'DEPENDENCY')+absent+capture+(P/'candidate.sql').read_text()+'\n'+pinblock(new_specs,'POST')+trigger+unchanged+"notify pgrst,'reload schema';\ncommit;\n"
(P/'apply_prod.sql').write_text(apply)
rollback=header('Rollback transfer ledger ownership protection; requires operator incident review')+pinblock(new_specs,'ROLLBACK_PRE')+trigger+capture+(P/'rollback_candidate.sql').read_text()+'\n'+pinblock(old,'ROLLBACK_POST')+absent+unchanged+"notify pgrst,'reload schema';\ncommit;\n"
(P/'rollback_prod.sql').write_text(rollback)
checks=[]
for label,specs in [('PRE',old),('POST',new_specs)]:
    for d in specs:
        sig=d['signature'];key=label+':'+sig
        checks.append("'%s',coalesce((select md5(prosrc)='%s' and proacl::text='%s' and prosecdef and proowner::regrole::text='postgres' and proconfig=array['search_path=public, pg_temp']::text[] from pg_proc where oid=to_regprocedure('public.%s')),false)"%(key,d['body_md5'],d['acl'],sig))
checks.extend(["'PRE:guard_absent',to_regprocedure('public.fn_booking_transfer_ledger_guard()') is null and not exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_booking_transfer_ledger_guard')","'POST:trigger',coalesce((select pg_get_triggerdef(oid)='%s' from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_booking_transfer_ledger_guard'),false)"%guard_def])
(P/'verify_readonly.sql').write_text('-- SELECT only. PRE should be true before apply; POST true afterwards.\nselect jsonb_build_object(\n'+',\n'.join(checks)+') verification;\n')
print('Built guarded apply, rollback and read-only verification.')
