-- Internal helper: zero-value links are not charges; nonstandard legacy deltas need review.
create or replace function public.fn_ticket_net_checked(p_ticket text,p_booking text) returns integer
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $fn$
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
end $fn$;
revoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;
