import hashlib,json
from pathlib import Path
P=Path(__file__).parent
s=(P/'original.sql').read_text()
needle="  if b.status='cancelled' then return jsonb_build_object('ok',true,'already',true); end if;"
assert s.count(needle)==1
block="""  -- A free second treadmill is part of its main reservation, never a paid unit.
  -- Main row is already locked. Lock children in stable order before ticket locks.
  if v_actor='member' and b.sibling_of is not null then
    return jsonb_build_object('ok',false,'error_code','BOOKING.IS_SIBLING');
  end if;
  if b.sibling_of is null and b.category::text='自主訓練'
     and b.venue_unit in ('treadmill_1','treadmill_2') then
    perform 1 from public.bookings where sibling_of=b.id order by id for update;
    if exists (select 1 from public.bookings s where s.sibling_of=b.id and s.status<>'cancelled'
      and (s.status::text<>'booked' or s.ticket_id is not null or s.member_id is distinct from b.member_id
        or s.category::text is distinct from b.category::text
        or s.date is distinct from b.date or s.start_time is distinct from b.start_time
        or s.duration is distinct from b.duration or s.venue_unit not in ('treadmill_1','treadmill_2')
        or s.venue_unit is null or s.venue_unit=b.venue_unit or s.checked_in_at is not null)) then
      return jsonb_build_object('ok',false,'error_code','BOOKING.SIBLING_MISMATCH');
    end if;
    update public.bookings set status='cancelled',cancelled_at=now(),
      cancelled_by=coalesce(current_employee_id(),current_member_id()),
      cancel_reason=coalesce(p_reason,'主預約取消：同步釋放同行跑步機'),refund_waived=false
    where sibling_of=b.id and status<>'cancelled';
  end if;
"""
s=s.replace(needle,block+'\n'+needle)
(P/'candidate.sql').write_text(s)
print('Candidate body md5:',hashlib.md5(s.split('AS $function$')[1].split('$function$')[0].encode()).hexdigest())
