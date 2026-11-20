-- Review candidate only. Test in a rollback transaction. No data repair.
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
revoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;
