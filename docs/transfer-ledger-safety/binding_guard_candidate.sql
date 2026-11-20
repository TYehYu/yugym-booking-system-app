-- Deferred check: a ticket binding can move only together with its ledger.
-- Applies to future UPDATEs only; historical rows are not rewritten or scanned.
create or replace function public.fn_booking_transfer_ledger_guard() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp'
as $guard$
declare b public.bookings%rowtype; n integer;
begin
 -- Maintenance connections are outside the app path. No client-controlled bypass flag.
 if coalesce(auth.role(),'') not in ('authenticated','anon') then return null; end if;
 select * into b from public.bookings where id=new.id;
 if not found then return null; end if;
 if coalesce(old.category::text,'') not in ('私人教練','運動按摩')
    and coalesce(b.category::text,'') not in ('私人教練','運動按摩') then return null; end if;
 -- Every participating row is already locked by the UPDATE. Lock tickets afterwards,
 -- in stable order, matching the existing booking -> ticket RPC lock order.
 perform 1 from public.member_tickets where id in (old.ticket_id,b.ticket_id) order by id for update;
 if old.ticket_id is not null and old.ticket_id is distinct from b.ticket_id then
  n:=public.fn_ticket_net_checked(old.ticket_id,b.id);
  if n<>0 then raise exception 'TICKET.TRANSFER_LEDGER_MISMATCH'; end if;
 end if;
 if b.ticket_id is not null then
  n:=public.fn_ticket_net_checked(b.ticket_id,b.id);
  if n<1 then raise exception 'TICKET.TRANSFER_LEDGER_MISMATCH'; end if;
 end if;
 return null;
end $guard$;
revoke all on function public.fn_booking_transfer_ledger_guard() from public,anon,authenticated,service_role;
create constraint trigger trg_booking_transfer_ledger_guard
after update on public.bookings deferrable initially deferred
for each row when (old.ticket_id is distinct from new.ticket_id)
execute function public.fn_booking_transfer_ledger_guard();
