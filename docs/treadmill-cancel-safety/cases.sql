create temp table tc_results(name text,ok boolean,detail text) on commit drop;
create function pg_temp.tc_check(n text,v boolean,d text default '') returns void language sql as $$
insert into tc_results values(n,coalesce(v,false),left(d,250)) $$;
create function pg_temp.tc_fixture(tag text) returns jsonb language plpgsql as $$
declare m text;u uuid;typ text;b jsonb;t jsonb;tid text:='CC-TC-T-'||tag;bid text:='CC-TC-B-'||tag;
begin
select id,auth_id into m,u from members where auth_id is not null limit 1;
select id into typ from ticket_types where category::text='自主訓練' limit 1;
if m is null or typ is null then raise exception 'TEST.MISSING_TEMPLATE';end if;
select to_jsonb(x) into t from member_tickets x limit 1;
insert into member_tickets select * from jsonb_populate_record(null::member_tickets,t||jsonb_build_object(
 'id',tid,'member_id',m,'ticket_type_id',typ,'sessions_total',2,'sessions_remaining',1,'status','usable',
 'start_date',current_date-1,'expire_date',current_date+365,'source_plan_id',null,'installment',null,'shared_with',null));
select to_jsonb(x) into b from bookings x where status='booked' limit 1;
b:=b||jsonb_build_object('id',bid,'member_id',m,'coach_id',null,'ticket_type_id',typ,'category','自主訓練',
 'date',current_date+14,'start_time','10:30','duration',60,'status','booked','ticket_id',tid,'benefit_type','training_pass',
 'sibling_of',null,'partner_id',null,'contract_id',null,'pending_contract',false,'checked_in_at',null,'no_show',false,
 'cancelled_at',null,'cancelled_by',null,'cancel_reason',null,'refund_waived',false,'created_at',now()-interval '1 day',
 'member_ids','[]'::jsonb,'attendance',null,'seat_tickets',null,'idempotency_key',null,'venue_unit','treadmill_1');
insert into bookings select * from jsonb_populate_record(null::bookings,b);
insert into bookings select * from jsonb_populate_record(null::bookings,b||jsonb_build_object('id',bid||'-S','ticket_id',null,'sibling_of',bid,'venue_unit','treadmill_2'));
insert into ticket_logs(id,ticket_id,booking_id,action,delta,note) values('CC-TC-L-'||tag,tid,bid,'deduct',-1,'Synthetic debit');
perform set_config('request.jwt.claim.sub',u::text,true);
perform set_config('request.jwt.claim.role','authenticated',true);
perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
return jsonb_build_object('b',bid,'s',bid||'-S','t',tid,'m',m);
end$$;
do $tests$
declare p jsonb;r jsonb;n int;col text;v text;caught boolean;
begin
p:=pg_temp.tc_fixture('normal');
r:=fn_cancel_booking(p->>'b',null,null);
perform pg_temp.tc_check('member cancel succeeds',r->>'ok'='true',r::text);
perform pg_temp.tc_check('both treadmill rows cancelled',(select count(*)=2 from bookings where id in(p->>'b',p->>'s') and status='cancelled'));
perform pg_temp.tc_check('refund exactly one point',(select sessions_remaining=2 from member_tickets where id=p->>'t'));
perform pg_temp.tc_check('one refund ledger',(select count(*)=1 from ticket_logs where ticket_id=p->>'t' and action='refund'));
perform pg_temp.tc_check('no shadow ledger',(select count(*)=0 from ticket_logs where booking_id=p->>'s'));
r:=fn_cancel_booking(p->>'b',null,null);
perform pg_temp.tc_check('replay already',r->>'already'='true',r::text);
perform pg_temp.tc_check('replay no extra refund',(select sessions_remaining=2 from member_tickets where id=p->>'t') and (select count(*)=1 from ticket_logs where ticket_id=p->>'t' and action='refund'));

p:=pg_temp.tc_fixture('direct');r:=fn_cancel_booking(p->>'s',null,null);
perform pg_temp.tc_check('member cannot cancel shadow alone',r->>'error_code'='BOOKING.IS_SIBLING',r::text);
perform pg_temp.tc_check('direct shadow attempt leaves main and child',(select count(*)=2 from bookings where id in(p->>'b',p->>'s') and status='booked'));

p:=pg_temp.tc_fixture('failure');delete from ticket_logs where ticket_id=p->>'t';
r:=fn_cancel_booking(p->>'b',null,null);
perform pg_temp.tc_check('refund failure returns failure',r->>'ok'='false',r::text);
perform pg_temp.tc_check('refund failure rolls back both rows',(select count(*)=2 from bookings where id in(p->>'b',p->>'s') and status='booked'));
perform pg_temp.tc_check('refund failure balance unchanged',(select sessions_remaining=1 from member_tickets where id=p->>'t'));

p:=pg_temp.tc_fixture('orphan');
update bookings set status='cancelled' where id=p->>'b';
r:=fn_cancel_booking(p->>'b',null,null);
perform pg_temp.tc_check('already cancelled main clears valid leftover',r->>'already'='true' and (select status='cancelled' from bookings where id=p->>'s'),r::text);
perform pg_temp.tc_check('leftover cleanup never refunds',(select count(*)=0 from ticket_logs where ticket_id=p->>'t' and action='refund'));

foreach col in array array['ticket_id','member_id','date','start_time','checked_in_at','status'] loop
p:=pg_temp.tc_fixture('bad-'||col);
case col
 when 'ticket_id' then update bookings set ticket_id=p->>'t' where id=p->>'s';
 when 'member_id' then update bookings set member_id=null where id=p->>'s';
 when 'date' then update bookings set date=date+1 where id=p->>'s';
 when 'start_time' then update bookings set start_time='11:30' where id=p->>'s';
 when 'checked_in_at' then update bookings set checked_in_at=now() where id=p->>'s';
 when 'status' then update bookings set status='checked_in' where id=p->>'s';
end case;
r:=fn_cancel_booking(p->>'b',null,null);
perform pg_temp.tc_check('mismatched '||col||' blocks whole operation',r->>'error_code'='BOOKING.SIBLING_MISMATCH' and (select status='booked' from bookings where id=p->>'b') and (select status::text=case when col='status' then 'checked_in' else 'booked' end from bookings where id=p->>'s') and (select sessions_remaining=1 from member_tickets where id=p->>'t'),r::text);
end loop;

p:=pg_temp.tc_fixture('forbidden');
perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
r:=fn_cancel_booking(p->>'b',null,null);
perform pg_temp.tc_check('unauthorized cannot cancel either row',r->>'error_code'='AUTH.FORBIDDEN' and (select count(*)=2 from bookings where id in(p->>'b',p->>'s') and status='booked'),r::text);

p:=pg_temp.tc_fixture('desk-no-refund');
select auth_id::text into v from employees where role::text='admin' and auth_id is not null limit 1;
perform set_config('request.jwt.claim.sub',v,true);
perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
r:=fn_cancel_booking(p->>'b',null,false);
perform pg_temp.tc_check('staff no-refund cancels both',r->>'ok'='true' and (select count(*)=2 from bookings where id in(p->>'b',p->>'s') and status='cancelled'),r::text);
perform pg_temp.tc_check('staff no-refund leaves balance and ledger',(select sessions_remaining=1 from member_tickets where id=p->>'t') and (select count(*)=0 from ticket_logs where ticket_id=p->>'t' and action='refund'));

p:=pg_temp.tc_fixture('late-shadow');
r:=fn_cancel_booking(p->>'b',null,null);
caught:=false;
begin
 insert into bookings select * from jsonb_populate_record(null::bookings,(select to_jsonb(x) from bookings x where id=p->>'s')||jsonb_build_object('id','CC-TC-LATE-S','status','booked'));
exception when others then caught:=sqlerrm='BOOKING.MAIN_CANCELLED';end;
perform pg_temp.tc_check('late shadow insert rejected',caught and not exists(select 1 from bookings where id='CC-TC-LATE-S'));
caught:=false;
begin update bookings set status='booked' where id=p->>'s';
exception when others then caught:=sqlerrm='BOOKING.MAIN_CANCELLED';end;
perform pg_temp.tc_check('reviving cancelled shadow rejected',caught and (select status='cancelled' from bookings where id=p->>'s'));
end$tests$;

select jsonb_build_object('passed',count(*) filter(where ok),'failed',count(*) filter(where not ok),'failures',coalesce(jsonb_agg(to_jsonb(tc_results)) filter(where not ok),'[]'::jsonb)) result from tc_results;
