create or replace function public.fn_treadmill_sibling_parent_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare p public.bookings%rowtype;
begin
  if new.sibling_of is null or new.status::text='cancelled'
     or new.category::text is distinct from '自主訓練'
     or new.venue_unit is null or new.venue_unit not in ('treadmill_1','treadmill_2') then
    return new;
  end if;
  -- Serialize new/revived shadow rows against main cancellation. Cancelled shadows skip this lock.
  select * into p from public.bookings where id=new.sibling_of for update;
  if not found or p.status::text='cancelled' then
    raise exception 'BOOKING.MAIN_CANCELLED';
  end if;
  return new;
end $function$;
revoke all on function public.fn_treadmill_sibling_parent_guard() from public,anon,authenticated,service_role;
create trigger trg_treadmill_sibling_parent_guard
before insert or update of sibling_of,status,category,venue_unit on public.bookings
for each row execute function public.fn_treadmill_sibling_parent_guard();
