-- TEST DATABASE ONLY. No production data; only CC-TLS objects and CC-EMP-TLS identities.
do $$begin if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
create or replace function public.zz_tls_call(p_role text,p_kind text,p_from text,p_to text,p_ticket text,p_case text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_start timestamptz:=clock_timestamp();v_result jsonb;v_xid text;v_first timestamptz;v_deadline timestamptz;v_blocked jsonb:='[]';v_count integer;
begin
 if coalesce(current_employee_id(),'') not like 'CC-EMP-TLS-%' then raise exception 'NOT_TEST_IDENTITY';end if;
 if p_role not in ('holder','waiter','plain') or p_kind not in ('move_hold','move_cancel','cancel_source','cancel_target')
    or p_from is null or p_from not like 'CC-TLS-%' or p_to is null or p_to not like 'CC-TLS-%'
    or p_ticket is null or p_ticket not like 'CC-TLS-%' or p_case is null or p_case !~ '^CC-TLS-[A-Za-z0-9-]+$' then raise exception 'NOT_TEST_OBJECT';end if;
 if not exists(select 1 from bookings where id=p_from) or not exists(select 1 from bookings where id=p_to)
    or not exists(select 1 from member_tickets where id=p_ticket) then raise exception 'TEST_OBJECT_MISSING';end if;
 perform set_config('application_name',left('tls:'||p_role||':'||p_case,63),true);
 if p_kind in ('move_hold','move_cancel') then v_result:=fn_move_booking_ticket(p_from,p_to,case when p_kind='move_cancel' then 'cancel' else 'hold' end);
 elsif p_kind='cancel_source' then v_result:=fn_desk_cancel_booking(p_from,'auto');
 else v_result:=fn_desk_cancel_booking(p_to,'auto');end if;
 v_xid:=txid_current()::text;
 if p_role='holder' then
  v_deadline:=clock_timestamp()+interval '2500 milliseconds';
  loop
   perform pg_stat_clear_snapshot();
   select coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'application_name',a.application_name,'wait_event',a.wait_event,
    'waits_on_my_txid',exists(select 1 from pg_locks l where l.pid=a.pid and not l.granted and l.locktype='transactionid' and l.transactionid::text=v_xid),
    'waits_on',(select coalesce(jsonb_agg(jsonb_build_object('locktype',l.locktype,'transactionid',l.transactionid::text)),'[]') from pg_locks l where l.pid=a.pid and not l.granted))),'[]'),count(*)
   into v_blocked,v_count from pg_stat_activity a where a.pid<>pg_backend_pid() and a.wait_event_type='Lock' and a.application_name=left('tls:waiter:'||p_case,63) and pg_backend_pid()=any(pg_blocking_pids(a.pid));
   if v_count>0 then v_first:=clock_timestamp();exit;end if;
   exit when clock_timestamp()>v_deadline;
   perform pg_sleep(0.02);
  end loop;
 end if;
 return jsonb_build_object('role',p_role,'kind',p_kind,'result',v_result,'pid',pg_backend_pid(),'txid',v_xid,'start',v_start,'end',clock_timestamp(),'first_blocked_seen_at',v_first,'blocked_waiters',v_blocked,'blocked_count',coalesce(v_count,0));
end $fn$;
revoke all on function public.zz_tls_call(text,text,text,text,text,text) from public,anon,service_role;
grant execute on function public.zz_tls_call(text,text,text,text,text,text) to authenticated;

create or replace function public.zz_tls_fingerprint() returns jsonb language sql security definer set search_path to 'public','pg_temp' as $fp$
 select jsonb_build_object('cluster',(pg_control_system()).system_identifier::text,
 'functions',(select jsonb_object_agg(proname,md5(prosrc)) from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_ticket_net_checked','fn_refund_ticket','fn_move_booking_ticket','fn_desk_cancel_booking','fn_booking_transfer_ledger_guard','fn_tk_refund_once','fn_desk_deduct_ticket')),
 'deferred_guard',exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_booking_transfer_ledger_guard' and tgdeferrable and tginitdeferred),
 'internal_acl',not has_function_privilege('authenticated','public.fn_ticket_net_checked(text,text)','EXECUTE') and not has_function_privilege('anon','public.fn_booking_transfer_ledger_guard()','EXECUTE'));
$fp$;
revoke all on function public.zz_tls_fingerprint() from public;
grant execute on function public.zz_tls_fingerprint() to anon,authenticated;
