create or replace function public.fn_member_leave_group_v2(p_booking_id text,p_seat_key text,p_expect_rev text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
 v_mid text:=current_member_id(); b bookings%rowtype; t member_tickets%rowtype;
 v_mids text[]; v_keys text[]; v_idx int; v_nseat int; v_tid text; v_cand int;
 v_ids jsonb; v_st jsonb; v_att jsonb; v_nt jsonb; v_net int; v_other int; v_refunded int:=0;
 v_outcome text; v_prev text; v_hours numeric;
begin
 perform set_config('lock_timeout','3000',true);
 if p_booking_id is null or p_seat_key is null or p_expect_rev is null then return jsonb_build_object('ok',false,'error_code','BAD_ARGS'); end if;
 if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select * into b from bookings where id=p_booking_id for update;
 if not found or b.status::text<>'booked' or b.category::text<>'小班肌力' then
  return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
 if not (coalesce(b.member_ids,'[]'::jsonb) @> to_jsonb(v_mid)) then
  return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 if public.fn_booking_rev_of(b.id) is distinct from p_expect_rev then return jsonb_build_object('ok',false,'error_code','REV_MISMATCH'); end if;
 v_hours:=extract(epoch from (((b.date||' '||b.start_time)::timestamp at time zone 'Asia/Taipei')-now()))/3600;
 if v_hours<24 then return jsonb_build_object('ok',false,'error_code','CANCEL.TOO_LATE','hours_before',round(v_hours,2),'actor','member'); end if;
 select array_agg(mid order by ord),array_agg(case when rn>1 then mid||'#'||rn else mid end order by ord)
 into v_mids,v_keys from(select mid,ord,row_number() over(partition by mid order by ord) rn
 from jsonb_array_elements_text(b.member_ids) with ordinality e(mid,ord)) x;
 v_idx:=array_position(v_keys,p_seat_key);
 if v_idx is null or v_mids[v_idx] is distinct from v_mid then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select count(*) into v_nseat from unnest(v_mids) m where m=v_mid;
 v_att:=case when jsonb_typeof(b.attendance)='object' then b.attendance else '{}'::jsonb end;
 if v_att->>v_keys[v_idx] in ('checked_in','leave') then return jsonb_build_object('ok',false,'error_code','SEAT_NOT_CANCELLABLE'); end if;
 v_st:=case when jsonb_typeof(b.seat_tickets)='object' then b.seat_tickets else '{}'::jsonb end;
 v_tid:=nullif(v_st->>v_keys[v_idx],'');
 if v_tid is null then
  -- Only a unique actual deduction on an unambiguous seat may be used as a legacy fallback.
  select count(*),min(x.id) into v_cand,v_tid from(
   select mt.id from member_tickets mt where
    (mt.member_id=v_mid or (mt.shared_with ? v_mid))
    and exists(select 1 from ticket_logs l where l.ticket_id=mt.id and l.booking_id=b.id)
    and public.fn_ticket_net_checked(mt.id,b.id)>0
  ) x;
  if v_cand<>1 or v_nseat<>1 then return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
  -- A different unmapped participant might be using this shared ticket. Do not guess their allocation.
  if exists(select 1 from unnest(v_mids,v_keys) x(mid,sk) join member_tickets mt on mt.id=v_tid
    where x.mid<>v_mid and not(v_st ? x.sk) and (mt.member_id=x.mid or mt.shared_with ? x.mid)) then
   return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
 end if;
 select * into t from member_tickets where id=v_tid for update;
 if not found or not(t.member_id=v_mid or coalesce(t.shared_with ? v_mid,false)) then
  return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
 v_net:=public.fn_ticket_net_checked(v_tid,b.id);
 select count(*) into v_other from jsonb_each_text(v_st) e where e.value=v_tid and e.key<>v_keys[v_idx];
 if v_net<=v_other then return jsonb_build_object('ok',false,'error_code','REFUND.NO_DEDUCT'); end if;
 v_prev:=coalesce(current_setting('app.tk_operator',true),'');
 perform set_config('app.tk_operator',v_mid,true);
 if v_net>v_other then
  if not public.fn_tk_refund_once(v_tid,b.id,'會員自行取消團體課退 1 堂') then
   perform set_config('app.tk_operator',v_prev,true);
   return jsonb_build_object('ok',false,'error_code','REFUND.BALANCE_FULL'); end if;
  v_refunded:=1; v_outcome:='refunded';
 else v_outcome:='no_deduction'; end if;
 perform set_config('app.tk_operator',v_prev,true);
 select coalesce(jsonb_agg(mid order by ord),'[]'::jsonb) into v_ids
 from unnest(v_mids) with ordinality x(mid,ord) where ord<>v_idx;
 v_att:=public.fn_seat_map_reindex(v_att,v_keys,v_mids,v_idx);
 v_nt:=case when jsonb_typeof(b.seat_notes)='object' then public.fn_seat_map_reindex(b.seat_notes,v_keys,v_mids,v_idx) else b.seat_notes end;
 update bookings set member_ids=v_ids,attendance=v_att,
  seat_tickets=public.fn_seat_map_reindex(v_st,v_keys,v_mids,v_idx),seat_notes=v_nt where id=b.id;
 perform public.desk_alert(v_mid,'self_cancel','　自行取消了團體課',
  to_char(b.date,'MM/DD')||' '||b.start_time||case when v_refunded=1 then '　團體課（已退回 1 堂）' else '　團體課（未發現本名額的實際扣堂，沒有退課）' end);
 return jsonb_build_object('ok',true,'booking_id',b.id,'refund_ticket',v_tid,'refunded',v_refunded,'outcome',v_outcome);
exception
 when lock_not_available or deadlock_detected or serialization_failure then return jsonb_build_object('ok',false,'error_code','REFUND.BUSY');
 when others then
  if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
  raise warning 'fn_member_leave_group error: % %',sqlstate,sqlerrm;
  return jsonb_build_object('ok',false,'error_code','REFUND.INTERNAL_ERROR');
end $function$;
