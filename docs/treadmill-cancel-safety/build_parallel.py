import json
from pathlib import Path
P=Path(__file__).parent
sql="""begin;
set local lock_timeout='3s';set local statement_timeout='30s';
do $$begin if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
"""
sql+='\n'.join(x['def'].rstrip()+';' for x in json.loads((P/'dependencies.json').read_text()))
sql+='\n'+(P/'candidate.sql').read_text()+'\n'+(P/'sibling_guard.sql').read_text()
sql+='\n'+(P/'cases.sql').read_text().split('do $tests$')[0]
sql+="\nselect pg_temp.tc_fixture('RACE-CANCEL');\nselect pg_temp.tc_fixture('RACE-INSERT');\ncommit;\n"
(P/'parallel_install_test.sql').write_text(sql)
