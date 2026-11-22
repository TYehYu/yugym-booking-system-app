-- TEST DATABASE ONLY: service_role can operate only the fixed disposable fixtures below.
create or replace function public.zz_ir_call(p_case text,p_role text,p_plan jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare bid text;tid text;anc text;u uuid;r jsonb;deadline timestamptz;wpid int;key_text text;kind text;
 started timestamptz:=clock_timestamp();seen timestamptz;tag text;
begin
 if (pg_control_system()).system_identifier::text<>'7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;
 if coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'TEST.SERVICE_ONLY';end if;
 if p_case not in ('SAME','LAST') or p_case is null or p_role not in ('preview_holder','preview_waiter','holder','waiter') or p_role is null then raise exception 'TEST.BAD_ARGS';end if;
 if (select md5(prosrc) from pg_proc where oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure)<>'ddc9aeb7399d65055d6ee27ae8317e79' then raise exception 'TEST.VERSION_MISMATCH';end if;
 bid:='CC-IR-B-PAR-'||p_case;tid:='CC-IR-T-PAR-'||p_case;
 if not exists(select 1 from bookings b join member_tickets t on t.id=tid and t.member_id=b.member_id where b.id=bid and t.plan_name='測試分期票') then raise exception 'TEST.MISSING_FIXTURE';end if;
 anc:=case when p_case='LAST' and p_role in ('preview_waiter','waiter') then bid||'-OTHER' else bid end;
 select auth_id into u from employees where role::text='admin' and auth_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 if p_role in ('preview_holder','preview_waiter') then
  return fn_hold_settle_new_ticket(tid,true,anc,null);
 end if;
 tag:='ir:'||p_case||':waiter';
 if p_role='waiter' then perform set_config('application_name',tag,true);end if;
 r:=fn_hold_settle_new_ticket(tid,false,anc,p_plan);
 if p_role='holder' then
  deadline:=clock_timestamp()+interval '5 seconds';
  loop
   perform pg_stat_clear_snapshot();
   select w.pid,w.locktype,concat_ws(':',w.classid::text,w.objid::text,w.objsubid::text,w.transactionid::text)
    into wpid,kind,key_text from pg_locks w join pg_stat_activity a on a.pid=w.pid
    join pg_locks h on h.pid=pg_backend_pid() and h.granted and h.locktype=w.locktype
     and ((w.locktype='advisory' and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid)
       or (w.locktype='transactionid' and h.transactionid=w.transactionid))
    where not w.granted and a.application_name=tag limit 1;
   if wpid is not null then seen:=clock_timestamp();exit;end if;
   exit when clock_timestamp()>deadline;perform pg_sleep(0.05);
  end loop;
  perform pg_sleep(0.2);
 end if;
 return jsonb_build_object('case',p_case,'role',p_role,'pid',pg_backend_pid(),'txid',txid_current(),'result',r,
  'waiter_pid',wpid,'same_holder_lock_seen',wpid is not null,'lock_type',kind,'lock_key',key_text,'observed_at',seen,
  'started_at',started,'completed_at',clock_timestamp(),
  'remaining',(select sessions_remaining from member_tickets where id=tid),
  'new_debits',(select count(*) from ticket_logs where ticket_id=tid and booking_id in (bid,bid||'-OTHER') and action='deduct'),
  'other_pending',(select pending_contract and ticket_id is null and status='booked' from bookings where id=bid||'-OTHER'));
end $function$;
revoke all on function public.zz_ir_call(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zz_ir_call(text,text,jsonb) to service_role;
