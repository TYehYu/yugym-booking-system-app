begin;
set local lock_timeout='3s';set local statement_timeout='30s';
do $$begin if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
CREATE OR REPLACE FUNCTION public.benefit_refund(p_benefit_ref text, p_qty integer, p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int; did_refund boolean;
begin
 if p_benefit_ref is null then return jsonb_build_object('ok',true,'refunded',false,'skipped','no_ticket'); end if;
 -- Existing caller fn_cancel_booking refunds one unit. Never trust an arbitrary amount.
 if p_qty is distinct from 1 or p_booking_id is null then raise exception 'REFUND.BAD_ARGS'; end if;
 perform 1 from bookings where id=p_booking_id for update;
 if not found then raise exception 'REFUND.NO_BOOKING'; end if;
 perform 1 from member_tickets where id=p_benefit_ref for update;
 if not found then raise exception 'REFUND.NO_TICKET'; end if;
 n:=public.fn_ticket_net_checked(p_benefit_ref,p_booking_id);
 if n=0 then return jsonb_build_object('ok',true,'refunded',false,'skipped','no_deduct'); end if;
 did_refund:=public.fn_tk_refund_once(p_benefit_ref,p_booking_id,'取消返還原票');
 if not did_refund then raise exception 'REFUND.BALANCE_FULL'; end if;
 return jsonb_build_object('ok',true,'refunded',true);
end $function$;
CREATE OR REPLACE FUNCTION public.current_employee_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from employees where auth_id = auth.uid() limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.current_member_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from members where auth_id = auth.uid() limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select role::text from employees where auth_id = auth.uid() limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.fn_ticket_net_checked(p_ticket text, p_booking text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d int; r int; bad int; b public.bookings%rowtype;
begin
 select count(*) filter(where action::text='deduct' and delta=-1),
        count(*) filter(where action::text='refund' and delta=1),
        count(*) filter(where (action::text='deduct' and (delta is null or delta not in (-1,0)))
                          or (action::text='refund' and (delta is null or delta<>1)))
 into d,r,bad from public.ticket_logs where ticket_id=p_ticket and booking_id=p_booking;
 if bad>0 then raise exception 'TICKET.LEDGER_AMBIGUOUS'; end if;
 if r>d then raise exception 'TICKET.LEDGER_NEGATIVE'; end if;
 -- An existing debit is not proof that this reservation still owns it.
 -- Older clients moved only ticket_id. Never refund or reuse that orphan debit.
 -- Group seats and self-training multi-point accounting retain their existing rules.
 if d>r then
  select * into b from public.bookings where id=p_booking;
  if found and b.category::text in ('私人教練','運動按摩')
     and b.ticket_id is distinct from p_ticket then
   raise exception 'TICKET.LEDGER_OWNERSHIP';
  end if;
 end if;
 return d-r;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t member_tickets%rowtype; v_net integer; v_op text := coalesce(nullif(current_setting('app.tk_operator', true), ''), 'system');
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  v_net := public.fn_ticket_net_checked(p_ticket,p_booking);
  if v_net <= 0 then return false; end if;
  if coalesce(t.sessions_total, 0) > 0 and coalesce(t.sessions_remaining, 0) >= t.sessions_total then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, v_op, '⚠ 已阻擋：餘額已滿，未再退課（效期屆滿自動取消）');
    return false;
  end if;
  update member_tickets
     set sessions_remaining = coalesce(sessions_remaining, 0) + 1,
         status = case when status::text = 'used_up' then 'usable' else status end
   where id = p_ticket;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'refund', 1, p_booking, v_op, coalesce(p_note, '取消返還原票'));
  return true;
end
$function$;
CREATE OR REPLACE FUNCTION public.is_staff_desk()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select current_staff_role() in ('admin','front_desk')
   or exists(select 1 from employees e where e.auth_id=auth.uid()
       and e.role='coach' and coalesce(e.is_manager,false) and e.status is distinct from 'inactive'); $function$;
CREATE OR REPLACE FUNCTION public.fn_cancel_booking(p_booking_id text, p_reason text DEFAULT NULL::text, p_refund boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  b bookings%rowtype;
  v_hours_before numeric;
  v_should_refund boolean;
  v_start_ts timestamptz;
  v_actor text;                 -- 'desk' | 'coach' | 'member'
  v_emp text;
  v_grace boolean;
  v_self_training boolean;
  v_legacy_group boolean;
  v_why text; v_ret jsonb;
begin
  select * into b from bookings where id=p_booking_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;

  -- ── 判定身分 ──
  -- is_staff_desk() 對非員工回的是 NULL 不是 false，一律用 coalesce 收斂。
  if coalesce(is_staff_desk(), false) then
    v_actor := 'desk';
  elsif current_staff_role() is not null then
    v_actor := 'coach';
    v_emp := current_employee_id();
    if v_emp is null or b.coach_id is distinct from v_emp then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
    if b.category::text = '小班肌力' then
      return jsonb_build_object('ok',false,'error_code','GROUP.DESK_ONLY','actor','coach');
    end if;
  else
    v_actor := 'member';
    if current_member_id() is null or b.member_id is null or current_member_id() is distinct from b.member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  -- A free second treadmill is part of its main reservation, never a paid unit.
  -- Main row is already locked. Lock children in stable order before ticket locks.
  if v_actor='member' and b.sibling_of is not null then
    return jsonb_build_object('ok',false,'error_code','BOOKING.IS_SIBLING');
  end if;
  if b.sibling_of is null and b.category::text='自主訓練'
     and b.venue_unit in ('treadmill_1','treadmill_2') then
    perform 1 from public.bookings where sibling_of=b.id order by id for update;
    if exists (select 1 from public.bookings s where s.sibling_of=b.id and s.status<>'cancelled'
      and (s.status::text<>'booked' or s.ticket_id is not null or s.member_id is distinct from b.member_id
        or s.category::text is distinct from b.category::text
        or s.date is distinct from b.date or s.start_time is distinct from b.start_time
        or s.duration is distinct from b.duration or s.venue_unit not in ('treadmill_1','treadmill_2')
        or s.venue_unit is null or s.venue_unit=b.venue_unit or s.checked_in_at is not null)) then
      return jsonb_build_object('ok',false,'error_code','BOOKING.SIBLING_MISMATCH');
    end if;
    update public.bookings set status='cancelled',cancelled_at=now(),
      cancelled_by=coalesce(current_employee_id(),current_member_id()),
      cancel_reason=coalesce(p_reason,'主預約取消：同步釋放同行跑步機'),refund_waived=false
    where sibling_of=b.id and status<>'cancelled';
  end if;

  if b.status='cancelled' then return jsonb_build_object('ok',true,'already',true); end if;

  v_start_ts := ((b.date || ' ' || b.start_time)::timestamp at time zone 'Asia/Taipei');
  v_hours_before := extract(epoch from (v_start_ts - now()))/3600;
  v_grace := coalesce(b.created_at is not null and now() - b.created_at <= interval '10 minutes', false);
  -- ⚠ benefit_type 可能是 NULL，一定要 coalesce（0821 修過一次：NULL 會讓整條規則失效）
  v_self_training := coalesce(b.benefit_type = 'training_pass', false)
                     or coalesce(b.category::text = '自主訓練', false);
  v_legacy_group := coalesce(b.category::text = '小班肌力', false)
                    and coalesce(jsonb_array_length(coalesce(b.member_ids,'[]'::jsonb)), 0) = 0;

  -- ── 會員自助只限團課與自主訓練（2026-08-21）──
  if v_actor = 'member' and not v_self_training and not v_legacy_group then
    return jsonb_build_object('ok',false,'error_code','CANCEL.DESK_ONLY',
      'category', b.category::text, 'actor', v_actor);
  end if;

  -- ── 24 小時內不能自行取消：2026-08-21 起**只擋會員**（原本連教練一起擋）──
  -- 教練改時間本來就不受限，擋取消只是讓他多繞一步；櫃檯與管理員一向不受限。
  if v_actor = 'member' and v_hours_before < 24 and not v_grace and not v_self_training then
    return jsonb_build_object('ok',false,'error_code','CANCEL.TOO_LATE',
      'hours_before', round(v_hours_before,2), 'actor', v_actor);
  end if;

  if v_actor='desk' then
    v_should_refund := coalesce(p_refund, true);
    v_why := null;
  else
    v_should_refund := true;
    v_why := case
      when v_self_training then '（自主訓練，已退回 1 點）'
      when v_grace then '（預約後 10 分鐘內取消，已退回 1 堂）'
      else '（已退回 1 堂）' end;
  end if;

  if v_should_refund and b.ticket_id is not null then
    v_ret:=public.benefit_refund(b.ticket_id,1,b.id);
    if not coalesce((v_ret->>'refunded')::boolean,false) then raise exception 'REFUND.NO_DEDUCT'; end if;
  end if;

  update bookings set status='cancelled', cancelled_at=now(), refund_waived=(not v_should_refund),
    reward_status = case when reward_status='issued' then 'revoked' else reward_status end,
    makeup_status = case when not v_should_refund and b.benefit_type in ('coaching_session','friendly_session')
                         then 'eligible_pending' else 'not_requested' end
  where id=b.id;

  if v_actor='member' then
    perform desk_alert(b.member_id,'self_cancel','　自行取消了'||b.category::text,
      to_char(b.date,'MM/DD')||' '||b.start_time||'　'||b.category::text||coalesce(v_why,''));
  end if;

  return jsonb_build_object('ok',true,'booking_id',b.id,
    'cancellation_result', case when v_should_refund then 'refunded' else 'forfeited' end,
    'hours_before', round(v_hours_before,2),
    'refunded_ticket', case when v_should_refund then b.ticket_id else null end,
    'makeup','not_requested');
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm);
end
$function$;

create or replace function public.fn_treadmill_sibling_parent_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare p public.bookings%rowtype;
begin
  if new.sibling_of is null or new.status::text='cancelled'
     or new.category::text is distinct from '自主訓練'
     or new.venue_unit is null or new.venue_unit not in ('treadmill_1','treadmill_2') then
    return new;
  end if;
  -- Serialize new/revived shadow rows against main cancellation. Cancelled shadows skip this lock.
  select * into p from public.bookings where id=new.sibling_of for update;
  if not found or p.status::text='cancelled' then
    raise exception 'BOOKING.MAIN_CANCELLED';
  end if;
  return new;
end $function$;
revoke all on function public.fn_treadmill_sibling_parent_guard() from public,anon,authenticated,service_role;
create trigger trg_treadmill_sibling_parent_guard
before insert or update of sibling_of,status,category,venue_unit on public.bookings
for each row execute function public.fn_treadmill_sibling_parent_guard();

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

select pg_temp.tc_fixture('RACE-CANCEL');
select pg_temp.tc_fixture('RACE-INSERT');
commit;
