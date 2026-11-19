from pathlib import Path
import json
p=Path('docs/booking-health');r=p/'create-stability';s=json.loads((p/'evidence/create_prod_20261119.json').read_text())[0]['definition']
s=s.replace("p_ticket_id text DEFAULT NULL::text)","p_ticket_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)",1).replace('  v_actor text;','  v_actor text;\n  v_existing bookings%rowtype;')
a="""  if p_idempotency_key is not null then
    if length(btrim(p_idempotency_key))=0 or length(p_idempotency_key)>200 then
      return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.BAD_KEY');
    end if;
    -- Serialise only the same operation, before checking its receipt or consuming tickets.
    perform pg_advisory_xact_lock(hashtextextended('booking-create:'||p_idempotency_key,0));
    select * into v_existing from bookings where idempotency_key=p_idempotency_key;
    if found then
      if jsonb_build_array(v_existing.member_id,v_existing.coach_id,v_existing.category::text,
           v_existing.benefit_type,v_existing.date,v_existing.start_time,v_existing.duration,
           v_existing.space_id,v_existing.resource_id,v_existing.note,v_existing.requested_ticket_id,v_existing.created_by)
         is distinct from jsonb_build_array(p_member_id,p_coach_id,p_category,p_benefit_type,
           p_date,p_start_time,p_duration,p_space_id,p_resource_id,p_note,p_ticket_id,v_actor) then
        return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
      end if;
      if v_existing.status::text='cancelled' then
        return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CANCELLED');
      end if;
      return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,
        'already',true,'remaining_after',(select sessions_remaining from member_tickets where id=v_existing.ticket_id));
    end if;
  end if;
"""
s=s.replace('  perform space_check(',a+'\n  perform space_check(',1)
s=s.replace('status, space_id, resource_id, reward_status, note, created_by, created_at)', 'status, space_id, resource_id, reward_status, note, created_by, created_at, idempotency_key, requested_ticket_id)')
s=s.replace("p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, v_actor, now());", "p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, v_actor, now(), p_idempotency_key, p_ticket_id);")
assert 'idempotency_key, requested_ticket_id)' in s
(r/'fn_create_booking_candidate.sql').write_text(s)
# Dependency parity, candidate and fixtures all live only inside one forced-rollback statement.
dep=json.loads((p/'evidence/create_dependencies_prod.json').read_text())['functions'];ddl=Path('/private/tmp/two-ai-install-combined.sql').read_text()+'\n'+'\n'.join(x['definition'].rstrip().rstrip(';')+';' for x in dep if x['name'] in ['benefit_consume_ticket','benefit_consume'])+'\n'+s+';'
(r/'test_bootstrap.sql').write_text(ddl)
print('candidate built')
wrapper="""
create or replace function public.zz_cs_call(k text,d int,t text,n text,s text,bt text) returns jsonb language sql as $call$
 select public.fn_create_booking('CC-CS-M','e_coach','私人教練',bt,current_date+d,'09:00',60,s,'general_area',n,t,k)
$call$;
"""
(r/'verify_rollback.sql').write_text("do $test$ declare u uuid;r jsonb;r2 jsonb;b text;i int;out jsonb:='[]'::jsonb;begin\nif (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY';end if;\nexecute $boot$"+ddl+'\n'+wrapper+'$boot$;\n'+(r/'cases.sql').read_text()+'\nend $test$;')
fp="""
create or replace function public.zz_cs_fingerprint() returns jsonb language sql security definer set search_path to 'public','pg_temp' as $fp$
select jsonb_build_object('create',(select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)')),
 'unique_key',exists(select 1 from pg_index where indexrelid=to_regclass('public.bookings_idem_key_uq') and indisunique and indisvalid))
$fp$;
revoke all on function public.zz_cs_fingerprint() from public,anon,authenticated,service_role;
grant execute on function public.zz_cs_fingerprint() to anon,authenticated;
"""
(r/'install_test.sql').write_text("do $cs$ begin\nif (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY';end if;\nexecute $boot$"+ddl+'\n'+fp+"\ncreate policy bookings_select_member_group on public.bookings for select to public using ((category='小班肌力'::public.ticket_category) and ((select public.current_member_id()) is not null));\n$boot$;end $cs$;")
import re,hashlib
md=hashlib.md5(re.search(r'AS (\$\w*\$)([\s\S]*?)\1',s,re.I)[2].encode()).hexdigest()
original=json.loads((p/'evidence/create_test_20261119.json').read_text())[0]['definition'];testdeps=json.loads((p/'evidence/create_dependencies_test.json').read_text())['functions'];restore='\n'.join(x['definition'].rstrip().rstrip(';')+';' for x in testdeps if x['name'] in ['benefit_consume_ticket','benefit_consume'])+'\n'+original+';\ndrop function public.zz_cs_fingerprint();\ndrop policy bookings_select_member_group on public.bookings;'
(r/'restore_before_main_test.sql').write_text("do $cs$ begin\nif (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY';end if;\nif (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)')) is distinct from '"+md+"' then raise exception 'CREATE_VERSION_CHANGED';end if;\nif exists(select 1 from members where id like 'CC-PF-%') or exists(select 1 from bookings where member_id like 'CC-PF-%') then raise exception 'FIXTURE_CLEANUP_REQUIRED';end if;\nexecute $restore$"+restore+'$restore$;end $cs$;')
