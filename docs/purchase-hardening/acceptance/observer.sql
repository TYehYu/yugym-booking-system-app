do $$begin if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY';end if;end$$;
-- Only this test's service process may inspect the otherwise private receipts.
grant select on installment_receipts to service_role;
create function public.zz_ica_collect(p_role text,p_case text,p_ticket text,p_receipt text,p_terms jsonb,p_invoice jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare emp text:=current_employee_id(); run text; started timestamptz:=clock_timestamp(); deadline timestamptz;
 r jsonb; xid text; blocked jsonb:='[]'; n integer:=0;
begin
 if coalesce(emp,'') !~ '^CC-EMP-ICA-D-[0-9a-f]{6}$' then return jsonb_build_object('error','NOT_TEST_IDENTITY');end if;
 run:=right(emp,6);
 if p_role not in ('holder','waiter') or coalesce(p_case,'') !~ '^ICA-[A-Za-z0-9-]+$' or right(p_case,7)<>'-'||run or length(p_case)>42
  or coalesce(p_ticket,'') !~ '^CC-ICA-[A-Za-z0-9-]+$' or right(p_ticket,7)<>'-'||run
  or coalesce(p_receipt,'') !~ '^ICA-[A-Za-z0-9-]+$' or right(p_receipt,7)<>'-'||run
 then return jsonb_build_object('error','NOT_TEST_OBJECT');end if;
 perform set_config('application_name','ica:'||p_case||':'||p_role,true);
 r:=fn_installment_collect_v2(p_ticket,p_receipt,p_terms,true,p_invoice);
 xid:=txid_current()::text;
 if p_role='holder' then
  deadline:=clock_timestamp()+interval '8 seconds';
  loop
   perform pg_stat_clear_snapshot();
   select coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'application_name',a.application_name,
    'waits_on_my_txid',exists(select 1 from pg_locks l where l.pid=a.pid and not l.granted and l.locktype='transactionid' and l.transactionid::text=xid),
    'waits_on',(select coalesce(jsonb_agg(jsonb_build_object('locktype',l.locktype,'transactionid',l.transactionid::text,'mode',l.mode)),'[]') from pg_locks l where l.pid=a.pid and not l.granted))),'[]'),count(*)::int
   into blocked,n from pg_stat_activity a where a.application_name='ica:'||p_case||':waiter' and a.pid<>pg_backend_pid()
    and pg_backend_pid()=any(pg_blocking_pids(a.pid))
    and exists(select 1 from pg_locks l where l.pid=a.pid and not l.granted and l.locktype='transactionid' and l.transactionid::text=xid);
   exit when n>0 or clock_timestamp()>=deadline;
   perform pg_sleep(0.02);
  end loop;
 end if;
 return jsonb_build_object('pid',pg_backend_pid(),'txid',xid,'start',started,'end',clock_timestamp(),'result',r,'blocked_waiters',blocked);
end $fn$;
revoke all on function zz_ica_collect(text,text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function zz_ica_collect(text,text,text,text,jsonb,jsonb) to authenticated;

create function public.zz_ica_clean_receipts(p_tickets text[],p_receipts text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare i text;n integer;
begin
 if cardinality(p_tickets)>30 or cardinality(p_receipts)>100 or p_tickets is null or p_receipts is null then raise exception 'BAD_SCOPE';end if;
 foreach i in array p_tickets loop if i !~ '^CC-ICA-[A-Za-z0-9-]+-[0-9a-f]{6}$' then raise exception 'NOT_TEST_TICKET';end if;end loop;
 if exists(select 1 from installment_receipts where id=any(p_receipts) and not(ticket_id=any(p_tickets))) then raise exception 'NOT_OWNED';end if;
 delete from installment_receipts where id=any(p_receipts) and ticket_id=any(p_tickets);
 get diagnostics n=row_count;return jsonb_build_object('ok',true,'deleted',n);
end $fn$;
revoke all on function zz_ica_clean_receipts(text[],text[]) from public,anon,authenticated,service_role;
grant execute on function zz_ica_clean_receipts(text[],text[]) to service_role;

create function public.zz_ica_fingerprint()
returns jsonb language sql security definer set search_path=public,pg_temp as $fn$
 select jsonb_build_object('cluster',(select system_identifier::text from pg_control_system()),
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,md5(p.prosrc)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
 ('fn_installment_terms','fn_installment_request_v2','fn_member_sign_installment_v2','fn_installment_collect_v2','fn_installment_collection_guard','fn_installment_signature_guard','fn_member_sign_installment','zz_ica_collect','zz_ica_clean_receipts')),
 'quota',exists(select 1 from pg_trigger where tgname='trg_tk_quota_guard' and tgrelid='member_tickets'::regclass and tgenabled='O'),
 'change_triggers',(select count(*)=5 from pg_trigger where tgname='trg_change_log' and tgrelid in ('member_tickets'::regclass,'contracts'::regclass,'ticket_logs'::regclass,'purchases'::regclass,'invoices'::regclass) and tgenabled='O'),
 'receipt_private',not has_table_privilege('authenticated','installment_receipts','insert') and not has_table_privilege('anon','installment_receipts','select'),
 'anonymous_collect_denied',not has_function_privilege('anon','fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)','execute'));
$fn$;
revoke all on function zz_ica_fingerprint() from public,anon,authenticated,service_role;
grant execute on function zz_ica_fingerprint() to service_role;
notify pgrst,'reload schema';
