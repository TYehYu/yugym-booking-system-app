import json
from pathlib import Path
P=Path(__file__).parent
deps=json.loads((P/'dependencies.json').read_text())
sql="""begin;
set local lock_timeout='3s';set local statement_timeout='45s';
do $$begin if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
alter table public.bookings add column if not exists partner_id text;
alter table public.bookings add column if not exists updated_at timestamptz;
alter table public.bookings add column if not exists makeup_status text;
-- Keep the baseline two-argument overload; tests explicitly call the three-argument version.
"""
sql+='\n'.join(x['def'].rstrip()+';' for x in deps)
sql+='\n'+(P/'candidate.sql').read_text()+'\n'+(P/'sibling_guard.sql').read_text()+'\n'+(P/'cases.sql').read_text()+'\nrollback;\n'
(P/'test_rollback.sql').write_text(sql)
