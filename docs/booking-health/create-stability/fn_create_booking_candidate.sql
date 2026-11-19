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
  v_existing bookings%rowtype;
begin
  if not is_any_staff() then
    if current_member_id() is null or current_member_id() <> p_member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  -- 操作者（2026-08-04）：員工記員工 id、會員記會員 id，事後才追得到是誰建的
  v_actor := coalesce(current_employee_id(), current_member_id());

  if p_idempotency_key is not null then
    if length(btrim(p_idempotency_key))=0 or length(p_idempotency_key)>200 then
      return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.BAD_KEY');
    end if;
    -- Serialise only the same operation, before checking its receipt or consuming tickets.
    perform pg_advisory_xact_lock(hashtextextended('booking-create:'||p_idempotency_key,0));
    select * into v_existing from bookings where idempotency_key=p_idempotency_key;
    if found then
      if jsonb_build_array(v_existing.member_id,v_existing.coach_id,v_existing.category::text,
           v_existing.benefit_type,v_existing.date,v_existing.start_time,v_existing.duration,
           v_existing.space_id,v_existing.resource_id,v_existing.note,v_existing.requested_ticket_id,v_existing.created_by)
         is distinct from jsonb_build_array(p_member_id,p_coach_id,p_category,p_benefit_type,
           p_date,p_start_time,p_duration,p_space_id,p_resource_id,p_note,p_ticket_id,v_actor) then
        return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
      end if;
      if v_existing.status::text='cancelled' then
        return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CANCELLED');
      end if;
      return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,
        'already',true,'remaining_after',(select sessions_remaining from member_tickets where id=v_existing.ticket_id));
    end if;
  end if;

  perform space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, null);

  insert into bookings (id, member_id, coach_id, category, benefit_type, date, start_time, duration,
                        status, space_id, resource_id, reward_status, note, created_by, created_at, idempotency_key, requested_ticket_id)
  values (v_booking, p_member_id, p_coach_id, p_category::ticket_category, p_benefit_type, p_date,
          p_start_time, p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, v_actor, now(), p_idempotency_key, p_ticket_id);

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
