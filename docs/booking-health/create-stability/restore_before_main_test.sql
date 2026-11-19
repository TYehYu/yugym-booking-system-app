do $cs$ begin
if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY';end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)')) is distinct from '193f26c8fd7164fa8b97de8ed6a829c5' then raise exception 'CREATE_VERSION_CHANGED';end if;
if exists(select 1 from members where id like 'CC-PF-%') or exists(select 1 from bookings where member_id like 'CC-PF-%') then raise exception 'FIXTURE_CLEANUP_REQUIRED';end if;
execute $restore$CREATE OR REPLACE FUNCTION public.benefit_consume(p_member_id text, p_benefit_type text, p_qty integer, p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ticket member_tickets%ROWTYPE;
BEGIN
  IF p_benefit_type = 'none' THEN RETURN jsonb_build_object('ok',true,'benefit_ref',NULL,'remaining_after',NULL); END IF;
  SELECT mt.* INTO v_ticket FROM member_tickets mt JOIN ticket_types tt ON tt.id = mt.ticket_type_id
   WHERE mt.member_id = p_member_id AND tt.benefit_type = p_benefit_type AND mt.sessions_remaining >= p_qty AND mt.status = 'usable' AND (mt.expire_date IS NULL OR mt.expire_date >= CURRENT_DATE)
   ORDER BY mt.expire_date ASC NULLS LAST LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM member_tickets mt JOIN ticket_types tt ON tt.id=mt.ticket_type_id WHERE mt.member_id=p_member_id AND tt.benefit_type=p_benefit_type) THEN
      RAISE EXCEPTION '%', CASE WHEN p_benefit_type='training_pass' THEN 'POINT.EMPTY' ELSE 'TICKET.EXPIRED' END;
    ELSE
      RAISE EXCEPTION '%', CASE WHEN p_benefit_type='training_pass' THEN 'POINT.EMPTY' ELSE 'TICKET.EMPTY' END;
    END IF;
  END IF;
  UPDATE member_tickets SET sessions_remaining = sessions_remaining - p_qty WHERE id = v_ticket.id;
  INSERT INTO ticket_logs (id, ticket_id, action, delta, booking_id, operator, note) VALUES (gen_short_id('LG-'), v_ticket.id, 'deduct', -p_qty, p_booking_id, 'system', '預約扣除');
  RETURN jsonb_build_object('ok',true,'benefit_ref',v_ticket.id,'remaining_after', v_ticket.sessions_remaining - p_qty);
END $function$;
CREATE OR REPLACE FUNCTION public.benefit_consume_ticket(p_ticket_id text, p_member_id text, p_qty integer, p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v member_tickets%rowtype;
begin
  select * into v from member_tickets where id = p_ticket_id for update;
  if not found then raise exception 'TICKET.NOT_FOUND'; end if;

  if not (v.member_id = p_member_id
          or (v.shared_with is not null and v.shared_with ? p_member_id)) then
    raise exception 'TICKET.NOT_YOURS';
  end if;

  if v.status <> 'usable' then raise exception 'TICKET.EXPIRED'; end if;
  if v.expire_date is not null and v.expire_date < current_date then raise exception 'TICKET.EXPIRED'; end if;
  if coalesce(v.sessions_remaining,0) < p_qty then raise exception 'TICKET.EMPTY'; end if;
  if v.installment is not null
     and least(v.sessions_remaining,
               coalesce(v.unlocked_sessions, v.sessions_total) - (v.sessions_total - v.sessions_remaining)) < p_qty
  then raise exception 'TICKET.INSTALLMENT_LOCKED'; end if;

  update member_tickets set sessions_remaining = sessions_remaining - p_qty where id = v.id;

  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), v.id, 'deduct', -p_qty, p_booking_id, 'system', '預約扣除（櫃檯指定票券）');

  return jsonb_build_object('ok',true,'benefit_ref',v.id,
                            'remaining_after', v.sessions_remaining - p_qty);
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer DEFAULT 60, p_space_id text DEFAULT 'general'::text, p_resource_id text DEFAULT 'general_area'::text, p_note text DEFAULT NULL::text, p_ticket_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_booking text := gen_short_id('BK-');
  v_consume jsonb;
  v_qty int := 1;
  v_ref text;
  v_actor text;
  v_existing record;
begin
  if not is_any_staff() then
    if current_member_id() is null or current_member_id() <> p_member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  if p_idempotency_key is not null then
    select id, member_id, coach_id, category, date, start_time, duration, ticket_id, requested_ticket_id
      into v_existing from bookings where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.member_id is not distinct from p_member_id
         and v_existing.coach_id is not distinct from p_coach_id
         and v_existing.category::text = p_category
         and v_existing.date = p_date
         and v_existing.start_time = p_start_time
         and v_existing.duration = p_duration
         and v_existing.requested_ticket_id is not distinct from p_ticket_id
      then
        return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,'already',true);
      else
        return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
      end if;
    end if;
  end if;

  v_actor := coalesce(current_employee_id(), current_member_id());

  begin
    perform space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, null);
  exception when others then
    if p_idempotency_key is not null and sqlerrm = 'BOOKING.TIME_CONFLICT' then
      select id, member_id, coach_id, category, date, start_time, duration, ticket_id, requested_ticket_id
        into v_existing from bookings where idempotency_key = p_idempotency_key;
      if found then
        if v_existing.member_id is not distinct from p_member_id
           and v_existing.coach_id is not distinct from p_coach_id
           and v_existing.category::text = p_category
           and v_existing.date = p_date
           and v_existing.start_time = p_start_time
           and v_existing.duration = p_duration
           and v_existing.requested_ticket_id is not distinct from p_ticket_id
        then
          return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,'already',true);
        else
          return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
        end if;
      end if;
    end if;
    raise;
  end;

  begin
    insert into bookings (id, member_id, coach_id, category, benefit_type, date, start_time, duration,
                          status, space_id, resource_id, reward_status, note, created_by, idempotency_key, created_at, requested_ticket_id)
    values (v_booking, p_member_id, p_coach_id, p_category::ticket_category, p_benefit_type, p_date,
            p_start_time, p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, v_actor, p_idempotency_key, now(), p_ticket_id);
  exception when unique_violation then
    if p_idempotency_key is not null then
      select id, member_id, coach_id, category, date, start_time, duration, ticket_id, requested_ticket_id
        into v_existing from bookings where idempotency_key = p_idempotency_key;
      if found then
        if v_existing.member_id is not distinct from p_member_id
           and v_existing.coach_id is not distinct from p_coach_id
           and v_existing.category::text = p_category
           and v_existing.date = p_date
           and v_existing.start_time = p_start_time
           and v_existing.duration = p_duration
           and v_existing.requested_ticket_id is not distinct from p_ticket_id
        then
          return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,'already',true);
        else
          return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
        end if;
      end if;
    end if;
    raise;
  end;

  if p_ticket_id is not null and p_benefit_type <> 'none' then
    v_consume := benefit_consume_ticket(p_ticket_id, p_member_id, v_qty, v_booking);
  else
    v_consume := benefit_consume(p_member_id, p_benefit_type, v_qty, v_booking);
  end if;

  v_ref := v_consume->>'benefit_ref';
  update bookings b set ticket_id = v_ref,
         ticket_type_id = (select mt.ticket_type_id from member_tickets mt where mt.id = v_ref)
   where b.id = v_booking;

  return jsonb_build_object('ok',true,'booking_id',v_booking,'benefit_ref',v_ref,
                            'remaining_after', v_consume->'remaining_after');
exception when others then
  return jsonb_build_object('ok',false,'error_code',sqlerrm);
end
$function$
;
drop function public.zz_cs_fingerprint();
drop policy bookings_select_member_group on public.bookings;$restore$;end $cs$;