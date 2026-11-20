CREATE OR REPLACE FUNCTION public.fn_ticket_net_checked(p_ticket text, p_booking text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d int; r int; bad int;
begin
 select count(*) filter(where action::text='deduct' and delta=-1),
        count(*) filter(where action::text='refund' and delta=1),
        count(*) filter(where (action::text='deduct' and (delta is null or delta not in (-1,0)))
                          or (action::text='refund' and (delta is null or delta<>1)))
 into d,r,bad from public.ticket_logs where ticket_id=p_ticket and booking_id=p_booking;
 if bad>0 then raise exception 'TICKET.LEDGER_AMBIGUOUS'; end if;
 if r>d then raise exception 'TICKET.LEDGER_NEGATIVE'; end if;
 return d-r;
end $function$
;
