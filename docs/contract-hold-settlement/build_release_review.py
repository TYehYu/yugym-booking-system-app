from pathlib import Path
import hashlib,json
r=Path(__file__).resolve().parent
old=(r.parents[1]/'docs/migrations/20261121_hold_settle_new_ticket.sql').read_text();old=old[old.index('create function public.fn_hold_settle_new_ticket('):old.index('revoke all on function public.fn_hold_settle_new_ticket')].replace('create function public.','create or replace function public.',1)
new=(r/'candidate.sql').read_text()
def digest(s):return hashlib.md5(s.split('as $fn$',1)[1].split('$fn$;',1)[0].encode()).hexdigest()
a,b=digest(old),digest(new);assert a=='550c28a816b6e46f636287d7fa33405a'
deps=json.loads((r/'RELEASE_DEPENDENCIES.json').read_text())['deps'];pins=json.dumps(deps,separators=(',',':'))
state="""select jsonb_build_object('other_functions',(select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and oid<>'public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure),'policies',(select md5(string_agg(to_jsonb(p)::text,'|' order by schemaname,tablename,policyname)) from pg_policies p where schemaname='public'),'triggers',(select md5(string_agg(pg_get_triggerdef(t.oid),'|' order by c.relname,t.tgname)) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),'bookings',(select md5(string_agg(to_jsonb(b)::text,'|' order by id)) from bookings b),'tickets',(select md5(string_agg(to_jsonb(t)::text,'|' order by id)) from member_tickets t),'logs',(select md5(string_agg(to_jsonb(l)::text,'|' order by id)) from ticket_logs l),'contracts',(select md5(string_agg(to_jsonb(c)::text,'|' order by id)) from contracts c))"""
for filename,body,before,after in [('apply_review_only.sql',new,a,b),('rollback_review_only.sql',old,b,a)]:
 q=f'''-- 合約卡位承接發布檔。正式庫；僅在使用者明確授權本次正式套用後執行。不修改任何業務資料。
begin;
set local lock_timeout='5s';
do $guard$ declare d jsonb; p record; begin
 if (select system_identifier::text from pg_control_system()) <> '7637215626725903220' then raise exception 'PROD_ONLY'; end if;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='fn_hold_settle_new_ticket')<>1 then raise exception 'SIGNATURE_CHANGED';end if;
 select * into p from pg_proc where oid=to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)');
 if not found or md5(p.prosrc) is distinct from '{before}' then raise exception 'BODY_CHANGED';end if;
 if not p.prosecdef or p.proowner::regrole::text<>'postgres' or p.proconfig is distinct from array['search_path=public, pg_temp'] or p.proacl::text is distinct from '{{postgres=X/postgres,authenticated=X/postgres}}' then raise exception 'ACL_OR_DEFINER_CHANGED';end if;
 for d in select * from jsonb_array_elements('{pins}'::jsonb) loop
  if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.'||(d->>'signature'))) is distinct from (d->>'md5') then raise exception 'DEPENDENCY_CHANGED:%',d->>'signature';end if;
 end loop;
end $guard$;
create temp table ch_release_acl on commit drop as select proacl::text acl,proowner from pg_proc where oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure;
create temp table ch_release_state on commit drop as {state} value;
'''+body+f'''
do $verify$ declare s jsonb; begin
 if (select md5(prosrc) from pg_proc where oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure) <> '{after}' then raise exception 'BODY_MISMATCH';end if;
 if exists(select 1 from pg_proc p,ch_release_acl a where p.oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure and (p.proacl::text is distinct from a.acl or p.proowner<>a.proowner or not p.prosecdef or p.proconfig is distinct from array['search_path=public, pg_temp'])) then raise exception 'ACL_CHANGED';end if;
 {state.replace('select jsonb_build_object','select jsonb_build_object',1)} into s;
 if s is distinct from (select value from ch_release_state) then raise exception 'OTHER_OBJECTS_OR_DATA_CHANGED';end if;
end $verify$;
commit;
select md5(prosrc) body_md5,proacl::text acl,proconfig from pg_proc where oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure;
'''
 (r/filename).write_text(q)
(r/'BODY_FINGERPRINTS.txt').write_text('old '+a+'\nnew '+b+'\n')
# 演練版僅替換庫識別，不修改守門或驗證條件。
for name in ['apply_review_only.sql','rollback_review_only.sql']:
 s=(r/name).read_text();assert s.count('7637215626725903220')==1
 (r/('test_'+name)).write_text(s.replace('7637215626725903220','7662742571317219726'))
# 測試庫準備：原版本＋依賴；目前身分函式僅換行字元與正式庫不同，在演練期間使用正式庫原文。
auth=json.loads((r/'AUTH_HELPER_PARITY.json').read_text())
prep=(r/'acceptance_install_test.sql').read_text().replace(new,old)
assert prep.count('end $pre$;')==1
prep=prep.replace('end $pre$;','end $pre$;\n'+auth['production']+';',1)
(r/'release_rehearsal_prep.sql').write_text(prep)
restore=(r/'acceptance_restore_test.sql').read_text().replace(b,a)
restore=restore.replace('do $check$begin',auth['test']+';\ndo $check$begin',1)
(r/'release_rehearsal_restore.sql').write_text(restore)
print('new body md5',b)
