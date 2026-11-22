create temp table ir_results(name text,ok boolean,detail jsonb) on commit drop;
create function pg_temp.ir_check(n text,v boolean,d jsonb default '{}') returns void language sql as $$
 insert into ir_results values(n,coalesce(v,false),d) $$;
create function pg_temp.ir_fixture(tag text,used_n int default 3) returns jsonb language plpgsql as $$
declare m text:='CC-IR-M-'||tag;t text:='CC-IR-T-'||tag;bid text:='CC-IR-B-'||tag;
 typ text:='CC-IR-TYPE';u uuid;emp text;j jsonb;k int;
begin
 select id,auth_id into emp,u from employees where role::text='admin' and auth_id is not null limit 1;
 if u is null then raise exception 'TEST.NO_ADMIN';end if;
 if not exists(select 1 from ticket_types where id=typ) then
  select to_jsonb(x) into j from ticket_types x where category::text='私人教練' limit 1;
  insert into ticket_types select * from jsonb_populate_record(null::ticket_types,j||jsonb_build_object('id',typ,'name','測試分期教練課','time_restricted',false));
 end if;
 insert into members(id,name,status) values(m,'測試會員','active');
 select to_jsonb(x) into j from member_tickets x limit 1;
 insert into member_tickets select * from jsonb_populate_record(null::member_tickets,j||jsonb_build_object('id',t,'member_id',m,'ticket_type_id',typ,
 'sessions_total',12,'sessions_remaining',12-used_n,'unlocked_sessions',case when used_n>=7 then 8 else 4 end,
 'installment',jsonb_build_object('count',3,'current',case when used_n>=7 then 2 else 1 end,'paid',case when used_n>=7 then '[true,true,false]'::jsonb else '[true,false,false]'::jsonb end,'segments','[4,4,4]'::jsonb),
 'status','usable','source_plan_id',null,'payment_status','paid','activated_at',now()-interval '40 days','start_date',fn_tk_today()-40,'expire_date',fn_tk_today()+365,'valid_days',365,'shared_with',null,'plan_name','測試分期票'));
 select to_jsonb(x) into j from bookings x where status='booked' limit 1;
 j:=j||jsonb_build_object('member_id',m,'ticket_type_id',typ,'category','私人教練','coach_id',emp,'contract_id',null,'sibling_of',null,'partner_id',null,
 'status','booked','pending_contract',true,'ticket_id',null,'checked_in_at',null,'no_show',false,'coach_leave',false,'refund_waived',false,
 'note','分期待繳費保留（收款後自動補扣）','member_ids','[]'::jsonb,'attendance',null,'seat_tickets',null,'trial_name',null,'trial_phone',null,
 'date',fn_tk_today()+5,'start_time','21:00','duration',60,'created_at',now(),'cancelled_at',null,'cancelled_by',null,'cancel_reason',null,'idempotency_key',null);
 insert into bookings select * from jsonb_populate_record(null::bookings,j||jsonb_build_object('id',bid));
 insert into bookings select * from jsonb_populate_record(null::bookings,j||jsonb_build_object('id',bid||'-OTHER','date',fn_tk_today()+12));
 for k in 1..used_n loop
  insert into bookings select * from jsonb_populate_record(null::bookings,j||jsonb_build_object('id',bid||'-PAST-'||k,'date',fn_tk_today()-30+k,
   'status','checked_in','pending_contract',false,'ticket_id',t,'checked_in_at',now()-interval '20 days','note',null));
  insert into ticket_logs(id,ticket_id,booking_id,action,delta,note) values('CC-IR-L-'||tag||'-'||k,t,bid||'-PAST-'||k,'deduct',-1,'Synthetic prior use');
 end loop;
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 return jsonb_build_object('m',m,'t',t,'b',bid,'other',bid||'-OTHER');
end$$;
create temp table ir_repro(p jsonb) on commit drop;
do $$declare p jsonb;r jsonb;begin
 p:=pg_temp.ir_fixture('repro');insert into ir_repro values(p);
 r:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);
 perform pg_temp.ir_check('original rejects paid-quota installment hold',r->>'error_code'='ANCHOR_NOT_ELIGIBLE',r);
end$$;
-- INSERT_CANDIDATE_HERE
do $tests$
declare p jsonb;r jsonb;x jsonb;plan jsonb;plan2 jsonb;snap jsonb;signed_hash text;mode text;used_n int;
begin
 for used_n in 3..7 by 4 loop
 p:=pg_temp.ir_fixture('used'||used_n,used_n);
 select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into signed_hash from bookings b where ticket_id=p->>'t';
 r:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);plan:=r->'plan';
 perform pg_temp.ir_check('used'||used_n||': preview accepts selected hold',r->>'ok'='true' and plan->'bind'=jsonb_build_array(p->>'b'),r);
 perform pg_temp.ir_check('used'||used_n||': preview excludes every other hold',plan->'hold'='[]'::jsonb and plan->'cancel'='[]'::jsonb and jsonb_array_length(r->'rows')=1,r);
 perform pg_temp.ir_check('used'||used_n||': preview does not debit',(select sessions_remaining=12-used_n from member_tickets where id=p->>'t'));
 x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'b',plan);
 perform pg_temp.ir_check('used'||used_n||': execution succeeds',x->>'ok'='true',x);
 perform pg_temp.ir_check('used'||used_n||': debits exactly one paid session',(select sessions_remaining=11-used_n and unlocked_sessions=case when used_n=7 then 8 else 4 end from member_tickets where id=p->>'t'));
 perform pg_temp.ir_check('used'||used_n||': selected booking bound without recreation',(select ticket_id=p->>'t' and not pending_contract and status='booked' from bookings where id=p->>'b'));
 perform pg_temp.ir_check('used'||used_n||': other hold stays untouched',(select ticket_id is null and pending_contract and status='booked' from bookings where id=p->>'other'));
 perform pg_temp.ir_check('used'||used_n||': one new ledger debit',(select count(*)=1 and sum(delta)=-1 from ticket_logs where ticket_id=p->>'t' and booking_id=p->>'b' and action='deduct'));
 perform pg_temp.ir_check('used'||used_n||': prior signed lessons unchanged',signed_hash=(select md5(string_agg(to_jsonb(b)::text,'|' order by id)) from bookings b where ticket_id=p->>'t' and checked_in_at is not null));
 x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'b',plan);
 perform pg_temp.ir_check('used'||used_n||': replay already without another debit',x->>'already'='true' and (select sessions_remaining=11-used_n from member_tickets where id=p->>'t'),x);
 x:=fn_hold_settle_new_ticket(p->>'t',true,p->>'other',null);
 perform pg_temp.ir_check('used'||used_n||': unpaid sessions cannot be borrowed',x->>'error_code'='INSTALLMENT_PAID_QUOTA_REQUIRED' and (select ticket_id is null and pending_contract from bookings where id=p->>'other'),x);
 end loop;

 p:=pg_temp.ir_fixture('stale');r:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);plan:=r->'plan';
 r:=fn_hold_settle_new_ticket(p->>'t',true,p->>'other',null);plan2:=r->'plan';
 x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'b',plan);
 x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'other',plan2);
 perform pg_temp.ir_check('last paid quota consumed after preview rejects second hold',x->>'error_code'='PLAN_CHANGED' and (select sessions_remaining=8 from member_tickets where id=p->>'t'),x);
 perform pg_temp.ir_check('stale-plan rejection leaves other hold unchanged',(select pending_contract and ticket_id is null and status='booked' from bookings where id=p->>'other'));

 foreach mode in array array['member','type','expired','signed','cancelled','contract'] loop
 p:=pg_temp.ir_fixture('bad-'||mode);
 case mode
 when 'member' then update bookings set member_id=(select id from members where id<>p->>'m' limit 1) where id=p->>'b';
 when 'type' then update bookings set ticket_type_id=(select id from ticket_types where id<>'CC-IR-TYPE' limit 1) where id=p->>'b';
 when 'expired' then update member_tickets set expire_date=fn_tk_today()-1 where id=p->>'t';
 when 'signed' then update bookings set checked_in_at=now() where id=p->>'b';
 when 'cancelled' then update bookings set status='cancelled' where id=p->>'b';
 when 'contract' then
  perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claims','{}',true);
  insert into contracts(id,member_id,sign_type,sessions,ticket_type_id) values('CC-IR-OTHER-C',p->>'m','paper',12,'CC-IR-TYPE');
  update bookings set contract_id='CC-IR-OTHER-C' where id=p->>'b';
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
 end case;
 x:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);
 perform pg_temp.ir_check('invalid '||mode||' still refused',x->>'error_code'='ANCHOR_NOT_ELIGIBLE' and (select sessions_remaining=9 from member_tickets where id=p->>'t'),x);
 end loop;

 p:=pg_temp.ir_fixture('changed');r:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);plan:=r->'plan';
 update bookings set start_time='20:00' where id=p->>'b';
 x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'b',plan);
 perform pg_temp.ir_check('changed time invalidates plan',x->>'error_code'='PLAN_CHANGED' and (select sessions_remaining=9 from member_tickets where id=p->>'t'),x);
 p:=pg_temp.ir_fixture('missing-plan');x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'b',null);
 perform pg_temp.ir_check('execution requires confirmation plan',x->>'error_code'='EXPECT_REQUIRED',x);
 p:=pg_temp.ir_fixture('auto');x:=fn_hold_settle_new_ticket(p->>'t',true,null,null);
 perform pg_temp.ir_check('new-ticket automatic cleanup still excludes legacy holds',x->>'ok'='true' and x->'plan'->'bind'='[]'::jsonb and x->'plan'->'cancel'='[]'::jsonb,x);
end$tests$;
create function pg_temp.ir_fail() returns trigger language plpgsql as $$begin if new.id='CC-IR-B-fault' and new.ticket_id is not null then raise exception 'TEST.BIND_FAILURE_AFTER_DEBIT';end if;return new;end$$;
create trigger zz_ir_fail before update of ticket_id on bookings for each row execute function pg_temp.ir_fail();
do $extra$
declare p jsonb;r jsonb;x jsonb;plan jsonb;
begin
 p:=pg_temp.ir_fixture('fault');r:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);plan:=r->'plan';
 x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'b',plan);
 perform pg_temp.ir_check('legacy hold bind failure returns atomic failure',x->>'error_code'='SETTLE.FAILED',x);
 perform pg_temp.ir_check('legacy hold bind failure restores paid balance',(select sessions_remaining=9 from member_tickets where id=p->>'t'));
 perform pg_temp.ir_check('legacy hold bind failure leaves no debit or binding',not exists(select 1 from ticket_logs where booking_id=p->>'b' and action='deduct') and (select ticket_id is null and pending_contract from bookings where id=p->>'b'));
 p:=pg_temp.ir_fixture('mixed');update bookings set note=null,date=fn_tk_today()+1 where id=p->>'other';
 r:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);plan:=r->'plan';x:=fn_hold_settle_new_ticket(p->>'t',false,p->>'b',plan);
 perform pg_temp.ir_check('explicit legacy hold does not steal quota for earlier ordinary hold',x->>'ok'='true' and x->'bound'=jsonb_build_array(p->>'b'),x);
 perform pg_temp.ir_check('earlier ordinary hold is not cancelled or modified',(select ticket_id is null and pending_contract and status='booked' and note is null from bookings where id=p->>'other'));
 p:=pg_temp.ir_fixture('unauthorized');perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 x:=fn_hold_settle_new_ticket(p->>'t',true,p->>'b',null);
 perform pg_temp.ir_check('non-staff legacy conversion remains forbidden',x->>'error_code'='NOT_STAFF',x);
end$extra$;
select jsonb_build_object('passed',count(*) filter(where ok),'failed',count(*) filter(where not ok),'failures',coalesce(jsonb_agg(to_jsonb(ir_results)) filter(where not ok),'[]'::jsonb)) result from ir_results;
