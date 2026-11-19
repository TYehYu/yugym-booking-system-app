-- Old clients cannot prove which revision their request belongs to; never guess a current revision.
create or replace function public.fn_member_leave_group(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$ begin
 if public.current_member_id() is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 return jsonb_build_object('ok',false,'error_code','CLIENT.UPDATE_REQUIRED');
end $function$;
