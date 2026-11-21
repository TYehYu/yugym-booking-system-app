begin;set local lock_timeout='3s';set local statement_timeout='30s';
do $$begin if (pg_control_system()).system_identifier::text<>'7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;
if (select md5(prosrc) from pg_proc where oid='public.fn_cancel_booking(text,text,boolean)'::regprocedure)<>'f8a5ac30094b81d9f46e00f6e6d8f842' then raise exception 'TEST.VERSION_CHANGED';end if;end$$;
create temp table tc_cleanup_ids on commit drop as
select id from bookings where id in ('CC-TC-B-RACE-CANCEL','CC-TC-B-RACE-CANCEL-S','CC-TC-B-RACE-INSERT','CC-TC-B-RACE-INSERT-S','CC-TC-LATE-PARALLEL')
union select id from member_tickets where id in ('CC-TC-T-RACE-CANCEL','CC-TC-T-RACE-INSERT')
union select id from ticket_logs where ticket_id in ('CC-TC-T-RACE-CANCEL','CC-TC-T-RACE-INSERT');
delete from ticket_logs where ticket_id in ('CC-TC-T-RACE-CANCEL','CC-TC-T-RACE-INSERT');
delete from bookings where id in ('CC-TC-B-RACE-CANCEL','CC-TC-B-RACE-CANCEL-S','CC-TC-B-RACE-INSERT','CC-TC-B-RACE-INSERT-S','CC-TC-LATE-PARALLEL');
delete from member_tickets where id in ('CC-TC-T-RACE-CANCEL','CC-TC-T-RACE-INSERT');
delete from change_log where row_id in(select id from tc_cleanup_ids);
drop function public.zz_tc_parallel(text,text);
drop trigger trg_treadmill_sibling_parent_guard on public.bookings;
drop function public.fn_treadmill_sibling_parent_guard();
drop function public.fn_cancel_booking(text,text,boolean);
CREATE OR REPLACE FUNCTION public.benefit_refund(p_benefit_ref text, p_qty integer, p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_benefit_ref IS NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  UPDATE member_tickets SET sessions_remaining = sessions_remaining + p_qty WHERE id = p_benefit_ref;
  INSERT INTO ticket_logs (id, ticket_id, action, delta, booking_id, operator, note) VALUES (gen_short_id('LG-'), p_benefit_ref, 'refund', p_qty, p_booking_id, 'system', '取消返還原票');
  RETURN jsonb_build_object('ok',true);
END $function$
;
CREATE OR REPLACE FUNCTION public.current_employee_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from employees where auth_id = auth.uid() limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.current_member_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from members where auth_id = auth.uid() limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select role::text from employees where auth_id = auth.uid() limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_cancel_booking(p_booking_id text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b bookings%ROWTYPE; v_hours_before numeric; v_should_refund boolean; v_start_ts timestamptz;
BEGIN
  SELECT * INTO b FROM bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); END IF;

  IF NOT is_any_staff() THEN
    IF current_member_id() IS NULL OR current_member_id() <> b.member_id THEN
      RETURN jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    END IF;
  END IF;

  IF b.status='cancelled' THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  v_start_ts := (b.date || ' ' || b.start_time)::timestamptz;
  v_hours_before := EXTRACT(EPOCH FROM (v_start_ts - now()))/3600;
  IF v_hours_before >= 24 THEN v_should_refund := true; ELSE v_should_refund := false; END IF;
  IF v_should_refund AND b.ticket_id IS NOT NULL THEN PERFORM benefit_refund(b.ticket_id, 1, b.id); END IF;
  UPDATE bookings SET status='cancelled', cancelled_at=now(), reward_status = CASE WHEN reward_status='issued' THEN 'revoked' ELSE reward_status END,
    makeup_status = CASE WHEN NOT v_should_refund AND b.benefit_type IN ('coaching_session','friendly_session') THEN 'eligible_pending' ELSE 'not_requested' END
  WHERE id=b.id;
  RETURN jsonb_build_object('ok',true,'booking_id',b.id,'cancellation_result', CASE WHEN v_should_refund THEN 'refunded' ELSE 'forfeited' END,
    'refunded_ticket', CASE WHEN v_should_refund THEN b.ticket_id ELSE NULL END,
    'makeup', CASE WHEN NOT v_should_refund AND b.benefit_type IN ('coaching_session','friendly_session') THEN 'eligible_pending' ELSE 'not_requested' END);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error_code',SQLERRM);
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t member_tickets%rowtype; v_net integer;
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)
    into v_net from ticket_logs where ticket_id = p_ticket and booking_id = p_booking;
  if v_net <= 0 then return false; end if;
  if coalesce(t.sessions_total, 0) > 0 and coalesce(t.sessions_remaining, 0) >= t.sessions_total then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system', '⚠ 已阻擋：餘額已滿，未再退課（效期屆滿自動取消）');
    return false;
  end if;
  update member_tickets
     set sessions_remaining = coalesce(sessions_remaining, 0) + 1,
         status = case when status::text = 'used_up' then 'usable' else status end
   where id = p_ticket;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'refund', 1, p_booking, 'system', coalesce(p_note, '取消返還原票'));
  return true;
end
$function$
;
CREATE OR REPLACE FUNCTION public.is_staff_desk()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select current_staff_role() in ('admin','front_desk')
   or exists(select 1 from employees e where e.auth_id=auth.uid()
       and e.role='coach' and coalesce(e.is_manager,false) and e.status is distinct from 'inactive'); $function$
;
drop function public.fn_ticket_net_checked(text,text);
do $$begin
if (select md5(string_agg(oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace) <> '0f4db39b5d66b355945cd2e00e6fa718' then raise exception 'TEST.FUNCTION_BASELINE_MISMATCH';end if;
if (select md5(string_agg(pg_get_triggerdef(oid),'|' order by tgname)) from pg_trigger where not tgisinternal)<>'be9ea68330fbbfedf1d13054afaff845' then raise exception 'TEST.TRIGGER_BASELINE_MISMATCH';end if;
if (select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by id),'')) from bookings b)<>'5d8e3fbcbc0b351eb3b00ba88ce8fa1e' or
(select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by id),'')) from member_tickets b)<>'f84f4145cee2a943f205b75fa546683c' or
(select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by id),'')) from ticket_logs b)<>'4c781c5258c486cb8cca75972f57be7f' then raise exception 'TEST.DATA_BASELINE_MISMATCH';end if;end$$;
commit;
