-- TEST DATABASE ONLY. Remove after acceptance.
do $$begin if (pg_control_system()).system_identifier::text<>'7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
create or replace function public.zz_tc_parallel(p_case text,p_role text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare bid text;mid text;u uuid;r jsonb;started timestamptz:=clock_timestamp();deadline timestamptz;
 other_pid int;seen timestamptz;tag text;
begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role'
    and coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'TEST.SERVICE_ONLY';end if;
 if (pg_control_system()).system_identifier::text<>'7662742571317219726' or p_case not in ('cancel','insert') or p_role not in ('holder','waiter') or p_case is null or p_role is null then raise exception 'TEST.BAD_ARGS';end if;
 bid:=case when p_case='cancel' then 'CC-TC-B-RACE-CANCEL' else 'CC-TC-B-RACE-INSERT' end;
 select b.member_id,m.auth_id into mid,u from bookings b join members m on m.id=b.member_id where b.id=bid and b.ticket_id=replace(bid,'CC-TC-B-','CC-TC-T-');
 if u is null then raise exception 'TEST.MISSING_FIXTURE';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 tag:='tc_'||p_case||'_waiter';
 if p_role='holder' then
   r:=fn_cancel_booking(bid,null,null);
   deadline:=clock_timestamp()+interval '15 seconds';
   loop
    select l.pid into other_pid from pg_locks l join pg_stat_activity a on a.pid=l.pid
     where not l.granted and l.locktype='transactionid' and l.transactionid::text=txid_current()::text and a.application_name=tag limit 1;
    if other_pid is not null then seen:=clock_timestamp();exit;end if;
    exit when clock_timestamp()>deadline;perform pg_sleep(0.05);
   end loop;
   perform pg_sleep(0.2);
 else
   perform set_config('application_name',tag,true);
   if p_case='cancel' then r:=fn_cancel_booking(bid,null,null);
   else
     begin
       insert into bookings select * from jsonb_populate_record(null::bookings,
         (select to_jsonb(x) from bookings x where x.id=bid||'-S')||jsonb_build_object('id','CC-TC-LATE-PARALLEL','status','booked'));
       r:=jsonb_build_object('unexpected_insert',true);
     exception when others then r:=jsonb_build_object('error_code',sqlerrm);end;
   end if;
 end if;
 return jsonb_build_object('case',p_case,'role',p_role,'pid',pg_backend_pid(),'txid',txid_current(),
   'started_at',started,'completed_at',clock_timestamp(),'waiter_pid',other_pid,'same_txid_wait_seen',other_pid is not null,'observed_at',seen,'result',r,
   'balance',(select sessions_remaining from member_tickets where id=replace(bid,'CC-TC-B-','CC-TC-T-')),
   'refunds',(select count(*) from ticket_logs where booking_id=bid and action='refund'),
   'active_old_rows',(select count(*) from bookings where id in (bid,bid||'-S') and status<>'cancelled'));
end $function$;
revoke all on function public.zz_tc_parallel(text,text) from public,anon,authenticated;
grant execute on function public.zz_tc_parallel(text,text) to service_role;
