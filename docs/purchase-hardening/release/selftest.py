from pathlib import Path
import subprocess,hashlib,re,json
p=Path(__file__).resolve().parent;root=p.parent
names=['apply_prod.sql','rollback_unused_prod.sql','verify_pre_readonly.sql','verify_post_readonly.sql','pins.json']
before={n:(p/n).read_bytes() for n in names};subprocess.run(['python3',str(p/'build_release.py')],check=True,capture_output=True)
assert all((p/n).read_bytes()==b for n,b in before.items()),'generation must be deterministic'
pins=json.loads((p/'pins.json').read_text())['installed'];a=(p/'apply_prod.sql').read_text();r=(p/'rollback_unused_prod.sql').read_text();passed=1
for sig,h in pins.items():
 name=sig.split('(')[0];pattern=r'create(?: or replace)? function (?:public\.)?'+re.escape(name)+r'\([\s\S]*?\bas (\$[a-z_0-9]*\$)([\s\S]*?)\1'
 match=re.search(pattern,a,re.I);assert match,sig;assert hashlib.md5(match[2].encode()).hexdigest()==h,sig;passed+=1
candidate=(root/'candidate.sql').read_text();candidate=candidate[candidate.index('create table public.installment_receipts'):];assert candidate in a;passed+=1
for sql in [a,r]:
 assert sql.count('\nbegin;\n')==1 and sql.endswith('commit;\n');passed+=1
 assert "lock_timeout='5s'" in sql and "statement_timeout='60s'" in sql;passed+=1
 assert 'UNRELATED_CATALOG_CHANGED' in sql and 'BUSINESS_DATA_CHANGED' in sql;passed+=1
 assert '7637215626725903220' in sql and '7662742571317219726' not in sql;passed+=1
assert 'RECEIPTS_EXIST_KEEP_OBJECTS' in r and 'V2_SIGNATURE_EVIDENCE_EXISTS_KEEP_OBJECTS' in r;passed+=1
assert 'EXPLICIT_REMOVAL_AUTHORIZATION_REQUIRED' in r and 'EXTERNAL_FUNCTION_REFERENCE' in r;passed+=1
for n in ['verify_pre_readonly.sql','verify_post_readonly.sql']:
 sql='\n'.join(x for x in (p/n).read_text().splitlines() if not x.startswith('--'));assert sql.strip().lower().startswith('select ');code=re.sub(r"'(?:''|[^'])*'","''",sql);assert not re.search(r'\b(create|alter|drop|update|insert|delete|grant|revoke|truncate)\s+(table|function|into|on|from|public\.)',code,re.I);passed+=1
assert "role in ['anon','authenticated','service_role']" in (p/'build_release.py').read_text();passed+=1
print(str(passed)+' release-file checks passed; no network or credentials')
