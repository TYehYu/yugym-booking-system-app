create or replace function public.fn_member_group_cancel_preview(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare mid text:=public.current_member_id(); b bookings%rowtype; ks jsonb;
begin
 if mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 -- Lock and read the revision in the same transaction, not from two unrelated frontend reads.
 select * into b from public.bookings where id=p_booking_id for share;
 if not found or b.category::text<>'小班肌力' or b.status::text<>'booked' then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
 if not(coalesce(b.member_ids,'[]'::jsonb) @> to_jsonb(mid)) then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select jsonb_agg(case when rn>1 then m||'#'||rn else m end order by ord) into ks
 from(select m,ord,row_number() over(partition by m order by ord) rn from jsonb_array_elements_text(b.member_ids) with ordinality e(m,ord)) x where m=mid;
 if ks is null or jsonb_array_length(ks)=0 then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 return jsonb_build_object('ok',true,'booking_id',b.id,'date',b.date,'start_time',b.start_time,'rev',public.fn_booking_rev_of(b.id),'seat_keys',ks);
end $function$;
