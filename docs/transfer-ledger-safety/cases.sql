-- Synthetic data only. Run inside the TEST_DB_ONLY bootstrap transaction, then rollback.
create temp table tls_results(name text,ok boolean,detail text) on commit drop;
create function pg_temp.tls_check(n text,v boolean,d text default '') returns void language sql as $$
insert into tls_results values(n,coalesce(v,false),left(d,300)) $$;
create function pg_temp.tls_login(u uuid) returns void language plpgsql as $$begin
perform set_config('request.jwt.claim.sub',u::text,true);
perform set_config('request.jwt.claim.role','authenticated',true);
perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $$;
create function pg_temp.tls_fixture(tag text) returns jsonb language plpgsql as $$
declare typ text; emp text; u uuid; b jsonb; t jsonb; tid text:='CC-TLS-T-'||tag; src text:='CC-TLS-F-'||tag; dst text:='CC-TLS-D-'||tag;
begin
select id,auth_id into emp,u from employees where role::text='admin' and auth_id is not null limit 1;
if emp is null then raise exception 'TEST.NO_ADMIN';end if;
select id into typ from ticket_types where category::text='私人教練' and not coalesce(time_restricted,false) limit 1;
if typ is null then raise exception 'TEST.NO_TYPE';end if;
insert into members(id,name,status) values('CC-TLS-M-'||tag,'測試會員','active');
select to_jsonb(x) into t from member_tickets x limit 1;
insert into member_tickets select * from jsonb_populate_record(null::member_tickets,t||jsonb_build_object('id',tid,'member_id','CC-TLS-M-'||tag,
'ticket_type_id',typ,'sessions_total',4,'sessions_remaining',3,'unlocked_sessions',4,'installment',null,'status','usable','source_plan_id',null,
'start_date',fn_tk_today()-30,'expire_date',fn_tk_today()+365,'activated_at',now()-interval '30 days','valid_days',365,'shared_with',null,'plan_name','測試四堂票'));
select to_jsonb(x) into b from bookings x where status::text='booked' limit 1;
b:=b||jsonb_build_object('member_id','CC-TLS-M-'||tag,'coach_id',emp,'original_coach_id',null,'substitute_coach_id',null,'ticket_type_id',typ,
'category','私人教練','status','booked','contract_id',null,'start_time','13:00','duration',60,'member_ids','[]'::jsonb,'attendance',null,'seat_tickets',null,
'sibling_of',null,'partner_id',null,'note',null,'trial_name',null,'trial_phone',null,'checked_in_at',null,'no_show',false,'coach_leave',false,
'cancelled_at',null,'cancelled_by',null,'cancel_reason',null,'recurring',false,'idempotency_key',null,'created_at',now());
insert into bookings select * from jsonb_populate_record(null::bookings,b||jsonb_build_object('id',src,'date',fn_tk_today()+14,'ticket_id',tid,'pending_contract',false));
insert into bookings select * from jsonb_populate_record(null::bookings,b||jsonb_build_object('id',dst,'date',fn_tk_today()+1,'ticket_id',null,'pending_contract',true));
insert into ticket_logs(id,ticket_id,booking_id,action,delta,note) values('CC-TLS-L-'||tag,tid,src,'deduct',-1,'Synthetic prepaid lesson');
perform pg_temp.tls_login(u);
return jsonb_build_object('t',tid,'f',src,'d',dst,'u',u,'emp',emp);
end $$;

do $tests$
declare p jsonb;r jsonb;mode text;cnt int;before_hash text;after_hash text;caught boolean;expected text;
begin
-- Normal current flow, both modes; force deferred validation just as COMMIT would.
foreach mode in array array['hold','cancel'] loop
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture(mode);
r:=fn_move_booking_ticket(p->>'f',p->>'d',mode);
perform pg_temp.tls_check(mode||': move succeeds',r->>'ok'='true',r::text);
set constraints trg_booking_transfer_ledger_guard immediate;
perform pg_temp.tls_check(mode||': old net zero',fn_ticket_net_checked(p->>'t',p->>'f')=0);
perform pg_temp.tls_check(mode||': new net one',fn_ticket_net_checked(p->>'t',p->>'d')=1);
perform pg_temp.tls_check(mode||': balance unchanged',(select sessions_remaining=3 from member_tickets where id=p->>'t'));
perform pg_temp.tls_check(mode||': target retains booking id',(select ticket_id=p->>'t' and not pending_contract from bookings where id=p->>'d'));
select count(*) into cnt from ticket_logs where ticket_id=p->>'t';
r:=fn_move_booking_ticket(p->>'f',p->>'d',mode);
perform pg_temp.tls_check(mode||': replay does not move again',r->>'ok'='false' and (select count(*) from ticket_logs where ticket_id=p->>'t')=cnt,r::text);
-- Cancel original hold: must not refund the transferred charge.
r:=fn_cancel_booking(p->>'f','test original cancellation',true);
perform pg_temp.tls_check(mode||': original cancellation safe',r->>'ok'='true' and (select sessions_remaining=3 from member_tickets where id=p->>'t'),r::text);
r:=fn_cancel_booking(p->>'d','test target cancellation',true);
perform pg_temp.tls_check(mode||': target cancellation returns one',r->>'ok'='true' and (select sessions_remaining=4 from member_tickets where id=p->>'t'),r::text);
r:=fn_cancel_booking(p->>'d','test cancellation replay',true);
perform pg_temp.tls_check(mode||': cancel replay cannot return two',r->>'ok'='true' and r->>'already'='true' and (select sessions_remaining=4 from member_tickets where id=p->>'t'),r::text);
end loop;

-- A retained slot is a separate unpaid reservation; settling it later costs one real unit.
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('rebind');
r:=fn_move_booking_ticket(p->>'f',p->>'d','hold');
perform pg_temp.tls_check('rebind: move succeeds',r->>'ok'='true',r::text);
r:=fn_desk_deduct_ticket(p->>'t',p->>'f',null,null);
perform pg_temp.tls_check('rebind: original hold charged afresh',r->>'ok'='true' and coalesce(r->>'already','false')<>'true',r::text);
update bookings set ticket_id=p->>'t',pending_contract=false where id=p->>'f';
set constraints trg_booking_transfer_ledger_guard immediate;
perform pg_temp.tls_check('rebind: two paid bookings cost two',fn_ticket_net_checked(p->>'t',p->>'f')=1 and fn_ticket_net_checked(p->>'t',p->>'d')=1 and (select sessions_remaining=2 from member_tickets where id=p->>'t'));

-- Reproduce legacy source debit: original unbound hold still owns a ledger debit.
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('legacy');
-- Maintenance-only fixture construction; app requests cannot opt out with a flag.
perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claims','{}',true);
update bookings set ticket_id=null,pending_contract=true where id=p->>'f';
update bookings set ticket_id=p->>'t',pending_contract=false where id=p->>'d';
set constraints trg_booking_transfer_ledger_guard immediate;
perform pg_temp.tls_login((p->>'u')::uuid);
select md5(jsonb_build_array((select to_jsonb(t) from member_tickets t where id=p->>'t'),(select jsonb_agg(to_jsonb(l) order by id) from ticket_logs l where ticket_id=p->>'t'))::text) into before_hash;
r:=fn_refund_ticket(p->>'t',p->>'f',null);
perform pg_temp.tls_check('legacy: refund refuses orphan debit',r->>'ok'='false' and r->>'error_code'='TICKET.LEDGER_OWNERSHIP',r::text);
r:=fn_desk_cancel_booking(p->>'f','auto');
perform pg_temp.tls_check('legacy: desk cancellation reports ledger refusal clearly',r->>'ok'='false' and r->>'error_code'='TICKET.LEDGER_OWNERSHIP',r::text);
caught:=false;begin perform fn_desk_deduct_ticket(p->>'t',p->>'f',null,null);exception when others then caught:=sqlerrm='TICKET.LEDGER_OWNERSHIP';end;
perform pg_temp.tls_check('legacy: deduction cannot claim already success',caught);
select md5(jsonb_build_array((select to_jsonb(t) from member_tickets t where id=p->>'t'),(select jsonb_agg(to_jsonb(l) order by id) from ticket_logs l where ticket_id=p->>'t'))::text) into after_hash;
perform pg_temp.tls_check('legacy: refusal leaves balance and history identical',before_hash=after_hash);

-- Old client updates only bindings in separate HTTP requests: reject the FIRST dirty commit.
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('oldclient');caught:=false;
begin
 update bookings set ticket_id=p->>'t',pending_contract=false where id=p->>'d';
 set constraints trg_booking_transfer_ledger_guard immediate;
exception when others then caught:=sqlerrm='TICKET.TRANSFER_LEDGER_MISMATCH';end;
perform pg_temp.tls_check('old client: target-only binding rejected',caught);
perform pg_temp.tls_check('old client: original debit and target unbound retained',fn_ticket_net_checked(p->>'t',p->>'f')=1 and (select ticket_id is null from bookings where id=p->>'d'));
caught:=false;begin
 update bookings set ticket_id=null,pending_contract=true where id=p->>'f';
 set constraints trg_booking_transfer_ledger_guard immediate;
exception when others then caught:=sqlerrm in ('TICKET.TRANSFER_LEDGER_MISMATCH','TICKET.LEDGER_OWNERSHIP');end;
perform pg_temp.tls_check('old client: source-only clearing rejected',caught);

-- Scope: group seat tickets legitimately do not live in bookings.ticket_id.
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('group');
perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claims','{}',true);
update bookings set category='小班肌力',ticket_id=null where id=p->>'f';
set constraints trg_booking_transfer_ledger_guard immediate;
perform pg_temp.tls_login((p->>'u')::uuid);
perform pg_temp.tls_check('group: seat debit semantics unchanged',fn_ticket_net_checked(p->>'t',p->>'f')=1);
update bookings set ticket_id=p->>'t' where id=p->>'f';
set constraints trg_booking_transfer_ledger_guard immediate;
update bookings set ticket_id=null where id=p->>'f';
set constraints trg_booking_transfer_ledger_guard immediate;
perform pg_temp.tls_check('group: normal seat binding updates not restricted',fn_ticket_net_checked(p->>'t',p->>'f')=1);

-- Preserve outer provisional-window flag, and ensure original cancel guard still applies.
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('windowflag');
perform set_config('app.tkwin_skip_booking','outer-value',true);
r:=fn_move_booking_ticket(p->>'f',p->>'d','hold');
perform pg_temp.tls_check('window flag: successful move',r->>'ok'='true',r::text);
perform pg_temp.tls_check('window flag: outer value restored',current_setting('app.tkwin_skip_booking',true)='outer-value');
perform set_config('app.tkwin_skip_booking','',true);
set constraints trg_booking_transfer_ledger_guard immediate;

-- The actual signed lesson remains intact when the original unpaid slot is cancelled.
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('signed');
r:=fn_move_booking_ticket(p->>'f',p->>'d','hold');
perform pg_temp.tls_check('signed: move succeeds',r->>'ok'='true',r::text);
update bookings set status='checked_in',checked_in_at=now() where id=p->>'d';
select md5(to_jsonb(b)::text) into before_hash from bookings b where id=p->>'d';
r:=fn_cancel_booking(p->>'f','original hold after actual attendance',true);
select md5(to_jsonb(b)::text) into after_hash from bookings b where id=p->>'d';
perform pg_temp.tls_check('signed: original cancellation never refunds attended lesson',r->>'ok'='true' and (select sessions_remaining=3 from member_tickets where id=p->>'t'),r::text);
perform pg_temp.tls_check('signed: payroll source row exactly unchanged',before_hash=after_hash);
set constraints trg_booking_transfer_ledger_guard immediate;

-- Shared ticket remains usable by the same reservation member; ownership check is about
-- the booking's ticket binding, not whether the member personally owns the ticket.
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('shared');
insert into members(id,name,status) values('CC-TLS-SHARED-OWNER','測試共享持有人','active');
update member_tickets set member_id='CC-TLS-SHARED-OWNER',shared_with=jsonb_build_array('CC-TLS-M-shared') where id=p->>'t';
r:=fn_move_booking_ticket(p->>'f',p->>'d','hold');
perform pg_temp.tls_check('shared: normal transfer remains supported',r->>'ok'='true',r::text);
set constraints trg_booking_transfer_ledger_guard immediate;
perform pg_temp.tls_check('shared: ownership helper recognizes valid booking debit',fn_ticket_net_checked(p->>'t',p->>'d')=1);

set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('auth');
perform pg_temp.tls_login('00000000-0000-0000-0000-000000000099');
r:=fn_move_booking_ticket(p->>'f',p->>'d','hold');
perform pg_temp.tls_check('auth: nonstaff cannot move tickets',r->>'ok'='false' and r->>'error_code'='AUTH.FORBIDDEN',r::text);
perform pg_temp.tls_login((p->>'u')::uuid);
set constraints trg_booking_transfer_ledger_guard immediate;
end $tests$;

-- Fault injection after both booking updates: the RPC must restore ALL its writes.
create function pg_temp.tls_fail_ledger() returns trigger language plpgsql as $$begin
if new.note like '調課帳本搬移：票券自 %' and new.ticket_id='CC-TLS-T-fault' then raise exception 'TEST.INJECTED_LEDGER_FAILURE';end if;
return new;end $$;
create trigger zz_tls_fail before insert on public.ticket_logs for each row execute function pg_temp.tls_fail_ledger();
do $fault$
declare p jsonb;r jsonb;a text;b text;
begin
set constraints trg_booking_transfer_ledger_guard deferred;
p:=pg_temp.tls_fixture('fault');
select md5(jsonb_build_array((select jsonb_agg(to_jsonb(x) order by id) from bookings x where id in (p->>'f',p->>'d')),(select jsonb_agg(to_jsonb(x) order by id) from ticket_logs x where ticket_id=p->>'t'),(select to_jsonb(x) from member_tickets x where id=p->>'t'))::text) into a;
r:=fn_move_booking_ticket(p->>'f',p->>'d','hold');
select md5(jsonb_build_array((select jsonb_agg(to_jsonb(x) order by id) from bookings x where id in (p->>'f',p->>'d')),(select jsonb_agg(to_jsonb(x) order by id) from ticket_logs x where ticket_id=p->>'t'),(select to_jsonb(x) from member_tickets x where id=p->>'t'))::text) into b;
perform pg_temp.tls_check('fault: RPC reports failure',r->>'ok'='false',r::text);
perform pg_temp.tls_check('fault: bindings balance and ledger rolled back',a=b,r::text);
set constraints trg_booking_transfer_ledger_guard immediate;
end $fault$;
drop trigger zz_tls_fail on public.ticket_logs;
select pg_temp.tls_check('ACL: net helper remains internal',not has_function_privilege('authenticated','public.fn_ticket_net_checked(text,text)','EXECUTE') and not has_function_privilege('anon','public.fn_ticket_net_checked(text,text)','EXECUTE'));
select pg_temp.tls_check('ACL: new guard remains internal',not has_function_privilege('authenticated','public.fn_booking_transfer_ledger_guard()','EXECUTE') and not has_function_privilege('anon','public.fn_booking_transfer_ledger_guard()','EXECUTE'));
select pg_temp.tls_check('ACL: move RPC retains authenticated only',has_function_privilege('authenticated','public.fn_move_booking_ticket(text,text,text)','EXECUTE') and not has_function_privilege('anon','public.fn_move_booking_ticket(text,text,text)','EXECUTE') and not has_function_privilege('service_role','public.fn_move_booking_ticket(text,text,text)','EXECUTE'));
select pg_temp.tls_check('ACL: refund RPC retains authenticated only',has_function_privilege('authenticated','public.fn_refund_ticket(text,text,text)','EXECUTE') and not has_function_privilege('anon','public.fn_refund_ticket(text,text,text)','EXECUTE') and not has_function_privilege('service_role','public.fn_refund_ticket(text,text,text)','EXECUTE'));
select jsonb_build_object('passed',count(*) filter(where ok),'failed',count(*) filter(where not ok),'failures',coalesce(jsonb_agg(jsonb_build_object('name',name,'detail',detail)) filter(where not ok),'[]')) result from tls_results;
do $$begin if exists(select 1 from tls_results where not ok) then raise exception 'TEST_FAILURE';end if;end$$;
