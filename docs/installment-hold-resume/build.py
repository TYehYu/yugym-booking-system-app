from pathlib import Path
import hashlib
P=Path(__file__).parent
s=(P/'original.sql').read_text()
changes=[
 ('v_has_anc boolean := false;', 'v_has_anc boolean := false; v_resume_inst boolean := false;'),
 ("    if not v_has_anc then return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_FOUND'); end if;", """    if not v_has_anc then return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_FOUND'); end if;
    -- Reuse released PAID quota for an explicitly selected installment hold.
    -- This path never adopts/cancels another booking or consumes unpaid quota.
    v_resume_inst := coalesce(v_anc.note,'') like '%分期待繳費保留%';"""),
 ("       and coalesce(b.note, '') not like '%分期待繳費保留%'", """       and (coalesce(b.note, '') not like '%分期待繳費保留%'
            or (v_resume_inst and b.id=p_anchor_booking_id))
       and (not v_resume_inst or b.id=p_anchor_booking_id)"""),
 ("  v_locked := case when v_inst", """  if v_resume_inst and not v_inst then
    return jsonb_build_object('ok',false,'error_code','ANCHOR_NOT_ELIGIBLE');
  end if;
  if v_resume_inst and v_avail<1
     and (coalesce(p_dry,true) or coalesce(array_length(v_ids,1),0)>0) then
    return jsonb_build_object('ok',false,'error_code',case when coalesce(p_dry,true)
      then 'INSTALLMENT_PAID_QUOTA_REQUIRED' else 'PLAN_CHANGED' end);
  end if;
  v_locked := case when v_inst"""),
]
for a,b in changes:
 assert s.count(a)==1,(a,s.count(a))
 s=s.replace(a,b,1)
(P/'candidate.sql').write_text(s)
body=s.split('AS $function$')[1].split('$function$')[0]
print('candidate md5',hashlib.md5(body.encode()).hexdigest())
