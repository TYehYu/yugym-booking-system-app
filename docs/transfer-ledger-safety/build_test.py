import json
from pathlib import Path
P=Path(__file__).parent
deps=json.loads((P/'test_dependencies.json').read_text())
names={'current_employee_id','current_staff_role','is_staff_desk','fn_tk_refund_once','benefit_refund','fn_desk_deduct_ticket','fn_deduct_ticket','fn_cancel_booking'}
sql="""begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
do $$begin if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
alter table public.bookings add column if not exists partner_id text;
alter table public.bookings add column if not exists updated_at timestamptz;
alter table public.bookings add column if not exists makeup_status text;
"""
sql+='\n'.join(d['def'].rstrip()+';' for d in deps if d['signature'].split('(')[0] in names)+'\n'
sql+=(P/'candidate.sql').read_text()+'\n'+(P/'cases.sql').read_text()+'\nrollback;\n'
(P/'test_rollback.sql').write_text(sql)
print('Synthetic transaction assembled; fixtures and parity DDL end in rollback.')
