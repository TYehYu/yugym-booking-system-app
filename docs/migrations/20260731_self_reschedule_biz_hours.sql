/* 會員自助「改期」也要擋營業時間外（2026-07-31 使用者提問時發現的缺口）

   fn_member_self_book 從 0729 起就用 fn_biz_hours 擋掉營業時間外的預約，
   但 fn_member_self_reschedule 漏了 —— 前端的時段清單雖然只列營業時間內，
   那只是 UI 限制，改期的 RPC 本身沒有把關。兩支要同一條規則。
   時長取原預約的 duration（自主訓練固定 60 分）。

   ⚠ 只補了營業時間那一段，其餘邏輯與 20260730_reschedule_self_dup_rule 完全相同。 */
create or replace function public.fn_member_self_reschedule(
  p_booking_id text, p_date date, p_start_time text, p_venue_unit text default null::text
) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_mid text := current_member_id();
        b bookings%rowtype; v_tk member_tickets%rowtype; v_ns int; v_old text; v_bh int[];
begin
  if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select * into b from bookings where id=p_booking_id for update;
  if not found or b.member_id is distinct from v_mid then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  if b.category::text <> '自主訓練' or b.status::text <> 'booked' then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_RESCHEDULABLE'); end if;
  if ((b.date || ' ' || b.start_time)::timestamp at time zone 'Asia/Taipei') - now() < interval '24 hours' then
    return jsonb_build_object('ok',false,'error_code','BOOKING.TOO_LATE');
  end if;
  if p_date < (now() at time zone 'Asia/Taipei')::date then return jsonb_build_object('ok',false,'error_code','BOOKING.PAST_DATE'); end if;
  if b.ticket_id is not null then
    select * into v_tk from member_tickets where id=b.ticket_id;
    if found and v_tk.expire_date is not null and v_tk.expire_date < p_date then
      return jsonb_build_object('ok',false,'error_code','TICKET.EXPIRED_FOR_DATE');
    end if;
  end if;
  v_ns := split_part(p_start_time,':',1)::int*60 + split_part(p_start_time,':',2)::int;

  -- 營業時間（2026-07-31 補上，與 fn_member_self_book 同一條規則）
  v_bh := fn_biz_hours(p_date);
  if v_ns < v_bh[1] or v_ns + coalesce(b.duration,60) > v_bh[2] then
    return jsonb_build_object('ok',false,'error_code','BOOKING.CLOSED_HOURS');
  end if;

  -- 同時段重複：只擋「非自主訓練」的重疊（與 fn_member_self_book 同一條規則）
  if exists (select 1 from bookings x where x.member_id=v_mid and x.date=p_date and x.status<>'cancelled' and x.id<>b.id
      and x.category::text <> '自主訓練'
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ns+coalesce(b.duration,60)
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.DUP');
  end if;
  if p_venue_unit is not null and exists (select 1 from bookings x where x.date=p_date and x.status<>'cancelled' and x.venue_unit=p_venue_unit and x.id<>b.id
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ns+coalesce(b.duration,60)
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.RESOURCE_BUSY');
  end if;
  v_old := to_char(b.date,'MM/DD')||' '||b.start_time;
  update bookings set date=p_date, start_time=p_start_time, venue_unit=coalesce(p_venue_unit,venue_unit) where id=b.id;
  perform desk_alert(v_mid,'self_move','　自行改了自主訓練的時間',
    v_old||'　→　'||to_char(p_date,'MM/DD')||' '||p_start_time);
  return jsonb_build_object('ok',true,'booking_id',b.id);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;
