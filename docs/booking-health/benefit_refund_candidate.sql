create or replace function public.benefit_refund(p_benefit_ref text,p_qty integer,p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
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
