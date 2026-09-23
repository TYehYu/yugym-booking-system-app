-- ══ 影子卡不可以被單獨搬走：資料庫那一道（2026-09-23）══════════════════════
-- 使用者 0923 回報：「幫我查一下他怎麼可以在沒有票券的情況下又約了跑步機」
--
-- 影子卡＝一堂佔兩台跑步機的第 2 台：sibling_of 指回主預約、ticket_id 是 null、
-- **不扣點**，但 member_id 是同一個人 → 這支函式原本所有本人檢查都會過。
-- 它被單獨搬走就跟主預約脫鉤，變成「不扣點、卻佔著那個時段、畫面上還有姓名」的幽靈。
--
-- 前端四個入口已經擋住（bkMoveBlockReason ＋ bkMoveSiblings，v260923.1028），
-- 這一支是**唯一能從會員手機直接改預約的路**，補上同一條規則就完全封死。
--
-- 兩件事一起做：
--   ① 影子卡本身不准改（回 BOOKING.IS_SIBLING）
--   ② 主卡改成功時，把還活著的第 2 台一起搬過去；新時段那一台被佔走就取消
--      —— 與前端 bkMoveSiblings 同一套行為，兩邊要講同一句話
--
-- ⚠ 順手修掉兩個「自己擋自己」：原本的重複／場地檢查沒有排除自己那一組的第 2 台，
--   主卡帶著第 2 台搬到新時段時，第 2 台會被當成別人的預約而擋下來。
create or replace function public.fn_member_self_reschedule(
  p_booking_id text, p_date date, p_start_time text, p_venue_unit text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_mid text := current_member_id();
        b bookings%rowtype; v_tk member_tickets%rowtype; v_ns int; v_old text; v_bh int[];
        s bookings%rowtype; v_busy boolean;
begin
  if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select * into b from bookings where id=p_booking_id for update;
  if not found or b.member_id is distinct from v_mid then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;

  -- ① 影子卡不准單獨搬（見檔頭說明）
  if b.sibling_of is not null then
    return jsonb_build_object('ok',false,'error_code','BOOKING.IS_SIBLING');
  end if;

  if b.category::text <> '自主訓練' or b.status::text <> 'booked' then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_RESCHEDULABLE'); end if;
  if ((b.date || ' ' || b.start_time)::timestamp at time zone 'Asia/Taipei') <= now() then
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

  v_bh := fn_biz_hours(p_date);
  if v_ns < v_bh[1] or v_ns + coalesce(b.duration,60) > v_bh[2] then
    return jsonb_build_object('ok',false,'error_code','BOOKING.CLOSED_HOURS');
  end if;

  -- 同時段重複：只擋「非自主訓練」的重疊；搬的那筆是家庭成員在用（trial_name 有值）
  -- 時放行（2026-08-03，與 fn_member_self_book 同一條規則）
  if nullif(trim(coalesce(b.trial_name,'')),'') is null
     and exists (select 1 from bookings x where x.member_id=v_mid and x.date=p_date and x.status<>'cancelled' and x.id<>b.id
      and x.sibling_of is null                              -- 自己那組的第 2 台不算「重複」
      and x.category::text <> '自主訓練'
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ns+coalesce(b.duration,60)
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.DUP');
  end if;
  if p_venue_unit is not null and exists (select 1 from bookings x where x.date=p_date and x.status<>'cancelled' and x.venue_unit=p_venue_unit and x.id<>b.id
      and x.sibling_of is distinct from b.id                -- 同上：自己那組的不算
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ns+coalesce(b.duration,60)
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.RESOURCE_BUSY');
  end if;
  v_old := to_char(b.date,'MM/DD')||' '||b.start_time;
  update bookings set date=p_date, start_time=p_start_time, venue_unit=coalesce(p_venue_unit,venue_unit) where id=b.id;

  -- ② 還活著的第 2 台跟著搬；新時段那一台被別人佔走就取消（不要留在舊時段變幽靈）
  for s in select * from bookings where sibling_of=b.id and status::text<>'cancelled' for update loop
    select exists (select 1 from bookings x
             where x.date=p_date and x.status<>'cancelled' and x.venue_unit=s.venue_unit
               and x.id<>s.id and x.id<>b.id and coalesce(x.sibling_of,'') <> b.id
               and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ns+coalesce(s.duration,60)
               and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns)
      into v_busy;
    if v_busy then
      update bookings set status='cancelled',
             note=coalesce(note,'')||'｜改期時新時段已被約走，同行第 2 台取消'
       where id=s.id;
    else
      update bookings set date=p_date, start_time=p_start_time where id=s.id;
    end if;
  end loop;

  perform desk_alert(v_mid,'self_move','　自行改了自主訓練的時間',
    v_old||'　→　'||to_char(p_date,'MM/DD')||' '||p_start_time);
  return jsonb_build_object('ok',true,'booking_id',b.id);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;
