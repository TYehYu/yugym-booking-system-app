import json
from pathlib import Path
P=Path(__file__).parent
sql=(P/'test_rollback.sql').read_text()
assert sql.endswith('rollback;\n')
sql=sql[:-len('rollback;\n')]+(P/'rollback_candidate.sql').read_text()+'\n'
defs=json.loads((P/'originals.json').read_text())
sql+='do $verify$begin\n'
for d in defs:
    sig=d['signature'].replace("'","''")
    sql+="if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public."+sig+"')) <> '"+d['body_md5']+"' then raise exception 'ROLLBACK.PIN_MISMATCH';end if;\n"
sql+="if to_regprocedure('public.fn_booking_transfer_ledger_guard()') is not null or exists(select 1 from pg_trigger where tgname='trg_booking_transfer_ledger_guard' and tgrelid='public.bookings'::regclass) then raise exception 'ROLLBACK.OBJECT_LEFT';end if;\n"
sql+="if has_function_privilege('anon','public.fn_refund_ticket(text,text,text)','EXECUTE') or has_function_privilege('anon','public.fn_move_booking_ticket(text,text,text)','EXECUTE') or has_function_privilege('authenticated','public.fn_ticket_net_checked(text,text)','EXECUTE') then raise exception 'ROLLBACK.ACL';end if;\n"
sql+="end $verify$;\nselect jsonb_build_object('rollback_pins_and_acl',true,'new_guard_removed',true,'functional_cases_passed',(select count(*) from tls_results where ok)) rollback_result;\nrollback;\n"
(P/'test_rollback_rehearsal.sql').write_text(sql)
