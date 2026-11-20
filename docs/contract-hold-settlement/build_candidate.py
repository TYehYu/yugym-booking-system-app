from pathlib import Path
root=Path(__file__).resolve().parents[2]
s=(root/'docs/migrations/20261121_hold_settle_new_ticket.sql').read_text()
s=s[s.index('create function public.fn_hold_settle_new_ticket('):s.index('revoke all on function public.fn_hold_settle_new_ticket')]
s=s.replace('create function public.', 'create or replace function public.',1)
s=s.replace('v_emp text; v_t record;', 'v_own_sib int := 0; v_contract_sig text; v_emp text; v_t record;')
s=s.replace("  if p_anchor_booking_id is not null then", """  -- 合約先鎖定，再鎖預約、票券；只允許這份合約實際發出的票承接。
  perform 1 from contracts c where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id order by c.id for update;
  select string_agg(c.id || ':' || md5(to_jsonb(c)::text), '|' order by c.id) into v_contract_sig
    from contracts c where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id;

  if p_anchor_booking_id is not null then""",1)
s=s.replace('and b.ticket_id is null and b.contract_id is null', """and b.ticket_id is null
       and (b.contract_id is null or exists (select 1 from contracts c
         where c.id = b.contract_id and c.ticket_id = mt.id and c.member_id = mt.member_id))""",1)
needle="  -- 超額卡位逐筆核對"
pos=s.index(needle)
s=s[:pos]+"""  -- 本合約既有的分期保留已占用未開通額度，不能再次分配。
  select count(*) into v_own_sib from bookings b join contracts c on c.id = b.contract_id
   where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id and b.member_id = v_t.member_id
     and b.ticket_type_id is not distinct from v_t.ticket_type_id and b.status::text = 'booked'
     and b.pending_contract is true and b.ticket_id is null and b.date >= v_today
     and coalesce(b.note, '') like '%分期待繳費保留%';
  if v_own_sib > v_locked then return jsonb_build_object('ok', false, 'error_code', 'INST_AMBIGUOUS'); end if;
  v_locked := greatest(0, v_locked - v_own_sib);
  v_sib := greatest(0, v_sib - v_own_sib);

"""+s[pos:]
s=s.replace("    select b.date into bd from bookings b where b.id = v_id;", """    -- 已歸屬本合約的超額卡位直接取消，不延到其他票券或下一份合約。
    if exists (select 1 from bookings b where b.id = v_id and b.contract_id is not null) then
      v_cancel := v_cancel || v_id; continue;
    end if;
    select b.date into bd from bookings b where b.id = v_id;""")
s=s.replace("      || '#' || case when v_has_anc", "      || '#' || coalesce(v_contract_sig, '') || ':' || v_own_sib\n      || '#' || case when v_has_anc")
(root/'docs/contract-hold-settlement/candidate.sql').write_text('-- 候選修正，尚未發布。替換既有函式，保留原簽名與權限。\n'+s)
