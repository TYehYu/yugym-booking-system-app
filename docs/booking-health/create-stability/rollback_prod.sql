begin;
set local lock_timeout='5s';
do $undo_create$ begin
if (select system_identifier::text from pg_control_system())<>'7637215626725903220' then raise exception 'PRODUCTION_ONLY';end if;
if current_setting('app.create_rollback_authorized',true) is distinct from 'yes' then raise exception 'AUTHORIZATION_REQUIRED';end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)')) is distinct from '193f26c8fd7164fa8b97de8ed6a829c5' or to_regprocedure('public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text)') is not null then raise exception 'CREATE_POST_VERSION';end if;
if has_function_privilege('anon','public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)','EXECUTE') or not has_function_privilege('authenticated','public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)','EXECUTE') then raise exception 'CREATE_POST_ACL';end if;
if not exists(select 1 from pg_index where indexrelid=to_regclass('public.bookings_create_idem_key_uq') and indisunique and indisvalid) then raise exception 'CREATE_POST_UNIQUE';end if;
if exists(select 1 from bookings where idempotency_key is not null) then raise exception 'NEW_RECEIPTS_EXIST_DO_NOT_DROP';end if;
execute $ddl$drop function public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer DEFAULT 60, p_space_id text DEFAULT 'general'::text, p_resource_id text DEFAULT 'general_area'::text, p_note text DEFAULT NULL::text, p_ticket_id text DEFAULT NULL::text)
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
begin
  if not is_any_staff() then
    if current_member_id() is null or current_member_id() <> p_member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  -- 操作者（2026-08-04）：員工記員工 id、會員記會員 id，事後才追得到是誰建的
  v_actor := coalesce(current_employee_id(), current_member_id());

  perform space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, null);

  insert into bookings (id, member_id, coach_id, category, benefit_type, date, start_time, duration,
                        status, space_id, resource_id, reward_status, note, created_by, created_at)
  values (v_booking, p_member_id, p_coach_id, p_category::ticket_category, p_benefit_type, p_date,
          p_start_time, p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, v_actor, now());

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
$function$;
drop index public.bookings_create_idem_key_uq;
alter table public.bookings drop column idempotency_key,drop column requested_ticket_id;$ddl$;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text)')) is distinct from '27cdcfe3d8495715f4613652c8856a6a' then raise exception 'RESTORE_VERSION';end if;
end $undo_create$;
notify pgrst,'reload schema';
commit;
