-- 2026-09-11 會員自己改自主訓練的場地／跑步機人數
-- 使用者：「點自主訓練課卡的時候要能夠修改場地 包含跑步機使用的數量」（三選一挑「會員自己在手機改」）
--
-- 會員沒有 bookings 的寫入權（RLS 只給 SELECT），跟 fn_member_self_book／fn_member_self_reschedule 一樣
-- 走 security definer。寫法照那兩支：
--   ・驗本人、自主訓練、還是 booked、還沒開始（同 reschedule）
--   ・同行第 2 台先收掉，再檢查新場地那一台沒被別人佔，然後照人數重開（同 self_book：不扣點、
--     台數不信任前端，自己找還空著的）
--   ・中途被擋（RESOURCE_BUSY）用 raise 丟出去 —— 整個 begin…exception 區塊會一起復原，
--     剛剛收掉的第 2 台也會回來
--   ・場地規則（容量、團課前清場…）跟預約一樣由前端 validateBooking（venue_pref）先驗，
--     這裡只擋「那一台剛好被別人佔」
create or replace function public.fn_member_self_venue(p_booking_id text, p_venue_unit text, p_units integer default 1)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_mid text := current_member_id();
        b bookings%rowtype; v_ns int; v_ne int; v_cap int; v_made int := 1; v_i int; v_unit text; v_old text;
begin
  if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  if nullif(trim(coalesce(p_venue_unit,'')),'') is null then return jsonb_build_object('ok',false,'error_code','VENUE.MISSING'); end if;
  select * into b from bookings where id=p_booking_id for update;
  if not found or b.member_id is distinct from v_mid then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  if b.sibling_of is not null then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_ROOT'); end if;
  if b.category::text <> '自主訓練' or b.status::text <> 'booked' then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_RESCHEDULABLE'); end if;
  if ((b.date || ' ' || b.start_time)::timestamp at time zone 'Asia/Taipei') <= now() then
    return jsonb_build_object('ok',false,'error_code','BOOKING.TOO_LATE');
  end if;
  v_ns := split_part(b.start_time,':',1)::int*60 + split_part(b.start_time,':',2)::int;
  v_ne := v_ns + coalesce(b.duration,60);
  v_old := coalesce(b.venue_unit,'');

  -- 先收掉這一堂原本的同行（第 2 台）：主預約才換得到它原本佔的那一台，人數也重新算
  update bookings set status='cancelled' where sibling_of=b.id and status<>'cancelled';

  if exists (select 1 from bookings x where x.date=b.date and x.status<>'cancelled' and x.venue_unit=p_venue_unit and x.id<>b.id
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ne
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns) then
    raise exception 'BOOKING.RESOURCE_BUSY';   -- 丟出去讓上面收掉的第 2 台一起復原
  end if;
  update bookings set venue_unit=p_venue_unit where id=b.id;

  /* 跑步機第 2 台起：同行使用、不另外扣點。台數不信任前端，這裡自己找還空著的（同 fn_member_self_book）。 */
  if coalesce(p_units,1) > 1 and split_part(p_venue_unit,'_',1) = 'treadmill' then
    select coalesce(capacity,2) into v_cap from venues where id='treadmill';
    v_cap := coalesce(v_cap,2);
    for v_i in 1..v_cap loop
      exit when v_made >= p_units;
      v_unit := 'treadmill_'||v_i;
      if v_unit = p_venue_unit then continue; end if;
      if exists (select 1 from bookings x where x.date=b.date and x.status<>'cancelled' and x.venue_unit=v_unit
          and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ne
          and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns) then
        continue;
      end if;
      insert into bookings (id,member_id,coach_id,ticket_id,ticket_type_id,category,date,start_time,duration,status,recurring,venue_unit,sibling_of,trial_name,created_by,created_at,note)
      values (gen_short_id('BK-'),v_mid,null,null,b.ticket_type_id,'自主訓練'::ticket_category,b.date,b.start_time,coalesce(b.duration,60),'booked',false,v_unit,b.id,
              b.trial_name,v_mid,now(),'同行使用（跑步機）・不另外扣點');
      v_made := v_made + 1;
    end loop;
  end if;

  perform desk_alert(v_mid,'self_move','　自行改了自主訓練的場地',
    to_char(b.date,'MM/DD')||' '||b.start_time||'　'||coalesce(nullif(split_part(v_old,'_',1),''),'—')||' → '||split_part(p_venue_unit,'_',1)
    ||case when v_made>1 then '（跑步機 '||v_made||' 台）' else '' end);
  return jsonb_build_object('ok',true,'booking_id',b.id,'units',v_made);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;

grant execute on function public.fn_member_self_venue(text, text, integer) to authenticated;
