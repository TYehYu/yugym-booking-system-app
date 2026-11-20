'''Print TEST-only SQL; does not connect, read credentials, or execute it.'''
from pathlib import Path
import sys
p=Path(__file__).resolve().parent
pre="""begin;
do $$begin if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_DATABASE_ONLY';end if;end$$;
alter table contracts add column installment_signs jsonb not null default '[]', add column pending_sign_n int, add column pending_sign_at timestamptz;
alter table member_tickets add column sold_by text;
"""
rollback=(p/'rollback_candidate.sql').read_text()
if '--restore' in sys.argv:
 sql=pre+(p/'original_sign_rpc.sql').read_text()+(p/'candidate.sql').read_text()+rollback+"\nselect to_regclass('public.installment_receipts') is null as removed,(select md5(prosrc)='8cc549573ff226306c138e85ad3f2950' from pg_proc where oid='public.fn_member_sign_installment(text,integer,text)'::regprocedure) as original_restored;\nrollback;"
else:
 sql=pre+(p/'candidate.sql').read_text()+(p/'verify_rollback.sql').read_text()+"\ndo $negative$ declare blocked boolean:=false;begin begin execute $rollbacktext$"+rollback+"$rollbacktext$;exception when others then blocked:=sqlerrm='INSTALLMENT.RECEIPTS_EXIST_KEEP_OBJECTS';end;perform pg_temp.ic_test('rollback preserves existing financial receipts',blocked);end $negative$;\nselect jsonb_build_object('passed',count(*) filter(where ok),'failed',count(*) filter(where not ok),'failures',coalesce(jsonb_agg(name) filter(where not ok),'[]')) as final_result from ic_results;\nrollback;"
print(sql)
