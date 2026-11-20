"""Build review candidates from the read-only production definitions; never deploy."""
import json
from pathlib import Path
P=Path(__file__).parent
defs=json.loads((P/'originals.json').read_text())
by={x['signature'].split('(')[0]:x for x in defs}
net=by['fn_ticket_net_checked']['def']
net=net.replace('declare d int; r int; bad int;','declare d int; r int; bad int; b public.bookings%rowtype;')
net=net.replace(' return d-r;', """ -- An existing debit is not proof that this reservation still owns it.
 -- Older clients moved only ticket_id. Never refund or reuse that orphan debit.
 -- Group seats and self-training multi-point accounting retain their existing rules.
 if d>r then
  select * into b from public.bookings where id=p_booking;
  if found and b.category::text in ('私人教練','運動按摩')
     and b.ticket_id is distinct from p_ticket then
   raise exception 'TICKET.LEDGER_OWNERSHIP';
  end if;
 end if;
 return d-r;""")
assert net!=by['fn_ticket_net_checked']['def']
refund=by['fn_refund_ticket']['def'].replace("'TICKET.LEDGER_NEGATIVE')", "'TICKET.LEDGER_NEGATIVE','TICKET.LEDGER_OWNERSHIP')")
assert refund!=by['fn_refund_ticket']['def']
desk_cancel=by['fn_desk_cancel_booking']['def'].replace("'TICKET.LEDGER_NEGATIVE')", "'TICKET.LEDGER_NEGATIVE','TICKET.LEDGER_OWNERSHIP')")
assert desk_cancel!=by['fn_desk_cancel_booking']['def']
move=by['fn_move_booking_ticket']['def']
move=move.replace('  v_op text;', '  v_op text;\n  v_window_prev text;')
move=move.replace("  perform set_config('app.tkwin_skip_booking', 'on', true);", "  v_window_prev := coalesce(current_setting('app.tkwin_skip_booking',true),'');\n  perform set_config('app.tkwin_skip_booking', 'on', true);")
move=move.replace("  perform set_config('app.tkwin_skip_booking', '', true);", """  -- Verify the final association and balance before reporting success.
  if public.fn_ticket_net_checked(v_tk.id,p_from_booking)<>0
     or public.fn_ticket_net_checked(v_tk.id,p_to_booking)<>1
     or (select sessions_remaining from public.member_tickets where id=v_tk.id) is distinct from v_tk.sessions_remaining then
    raise exception 'MOVE.LEDGER_MISMATCH';
  end if;
  perform set_config('app.tkwin_skip_booking', v_window_prev, true);""")
assert 'MOVE.LEDGER_MISMATCH' in move
for name,body in [('ledger_candidate.sql',net),('refund_candidate.sql',refund),('move_candidate.sql',move),('desk_cancel_candidate.sql',desk_cancel)]:
    signature={'ledger_candidate.sql':'fn_ticket_net_checked(text,text)','refund_candidate.sql':'fn_refund_ticket(text,text,text)','move_candidate.sql':'fn_move_booking_ticket(text,text,text)','desk_cancel_candidate.sql':'fn_desk_cancel_booking(text,text)'}[name]
    acl='revoke all on function public.'+signature+' from public,anon,authenticated,service_role;\n'
    if name!='ledger_candidate.sql':acl+='grant execute on function public.'+signature+' to authenticated;\n'
    if 'service_role=X/' in by[signature.split('(')[0]]['acl']:acl+='grant execute on function public.'+signature+' to service_role;\n'
    (P/name).write_text('-- Review candidate only. Test in a rollback transaction. No data repair.\n'+body.rstrip()+';\n'+acl)
guard="""-- Deferred check: a ticket binding can move only together with its ledger.
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
"""
(P/'binding_guard_candidate.sql').write_text(guard)
sql='\n'.join((P/n).read_text() for n in ['ledger_candidate.sql','refund_candidate.sql','move_candidate.sql','desk_cancel_candidate.sql','binding_guard_candidate.sql'])
(P/'candidate.sql').write_text(sql)
restore='drop trigger if exists trg_booking_transfer_ledger_guard on public.bookings;\ndrop function if exists public.fn_booking_transfer_ledger_guard();\n'
restore+='\n'.join(x['def'].rstrip()+';' for x in defs)
restore+='\nrevoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;\n'
for sig in ['fn_refund_ticket(text,text,text)','fn_move_booking_ticket(text,text,text)','fn_desk_cancel_booking(text,text)']:
    restore+='revoke all on function public.'+sig+' from public,anon,authenticated,service_role;\ngrant execute on function public.'+sig+' to authenticated;\n'
    if 'service_role=X/' in by[sig.split('(')[0]]['acl']:restore+='grant execute on function public.'+sig+' to service_role;\n'
(P/'rollback_candidate.sql').write_text('-- Review only; wrap in guarded transaction. Does not reverse completed moves.\n'+restore.rstrip()+'\n')
print('Built 5 function candidates and rollback; no database connection.')
