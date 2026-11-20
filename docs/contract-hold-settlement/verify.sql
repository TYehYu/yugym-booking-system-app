create temp table ch_results(t text,pass boolean,detail jsonb);
create function pg_temp.mkbk(p_id text, p_mem text, p_type text, p_cat text, p_date date, p_time text, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(b) into t from bookings b where b.status::text='booked' limit 1;
  insert into bookings select * from jsonb_populate_record(null::bookings, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_id',null,'ticket_type_id',p_type,'category',p_cat,
    'pending_contract',true,'date',p_date,'start_time',p_time,'status','booked','contract_id',null,'checked_in_at',null,'note',null,'member_ids','[]'::jsonb,'sibling_of',null,
    'trial_name',null,'trial_phone',null,'seat_tickets',null,'attendance',null,'cancelled_at',null,'cancelled_by',null,'cancel_reason',null,'recurring',false,'duration',60,'coach_id',null) || p_x);
end $$;
create function pg_temp.mktk(p_id text, p_mem text, p_type text, p_total int, p_rem int, p_inst jsonb, p_unl int, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(m) into t from member_tickets m limit 1;
  insert into member_tickets select * from jsonb_populate_record(null::member_tickets, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_type_id',p_type,'status','usable',
    'sessions_total',p_total,'sessions_remaining',p_rem,'installment',p_inst,'unlocked_sessions',p_unl,'expire_date',null,'start_date',null,'activated_at',null,'shared_with',null,'payment_status','paid','plan_name','ZZ測試票') || p_x);
end $$;

do $test$
declare adm record; tt record; m text; m2 text; d date:=fn_tk_today(); r jsonb; i int;
begin
 select id,auth_id into adm from employees where role::text='admin' and auth_id is not null limit 1;
 select id,category::text cat into tt from ticket_types where category::text='私人教練' and not coalesce(time_restricted,false) limit 1;
 select id into m from members order by id limit 1;select id into m2 from members where id<>m order by id limit 1;
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claims','{}',true);
 perform pg_temp.mktk('CC-CH-T',m,tt.id,12,12,'{"count":2,"current":1,"paid":[true,false]}'::jsonb,6,jsonb_build_object('valid_days',365));
 insert into contracts(id,member_id,sign_type,ticket_id,sessions,ticket_type_id) values ('CC-CH-C',m,'paper','CC-CH-T',12,tt.id);
 insert into contracts(id,member_id,sign_type,sessions,ticket_type_id) values ('CC-CH-OTHER',m,'paper',12,tt.id);
 for i in 1..14 loop perform pg_temp.mkbk('CC-CH-B'||lpad(i::text,2,'0'),m,tt.id,tt.cat,d+i,'13:00',jsonb_build_object('contract_id','CC-CH-C'));end loop;
 perform pg_temp.mkbk('CC-CH-OTHER-B',m,tt.id,tt.cat,d+20,'13:00',jsonb_build_object('contract_id','CC-CH-OTHER'));
 perform set_config('request.jwt.claims',json_build_object('sub',adm.auth_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',adm.auth_id::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 r:=fn_hold_settle_new_ticket('CC-CH-T',true,'CC-CH-B01');
 insert into ch_results values('old_reproduces_contract_exclusion',r->>'error_code'='ANCHOR_NOT_ELIGIBLE',r);
end $test$;
