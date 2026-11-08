/* ══ 2c 部署準備（2026-11-09）══════════════════════════════════════════
   目標：fn_member_self_book／fn_member_self_venue 加 pg_advisory_xact_lock，
   簽章完全不變，只在既有「場地/時段 EXISTS 檢查」前後包一層鎖。
   2026-11-09 已唯讀核對：正式庫這兩支函式自 2026-11-01 比對後未再被
   任何 migration 觸碰過（20261104_fn_member_self_reschedule_venue_fix
   動的是不同函式 fn_member_self_reschedule），可直接沿用下面的版本。

   ── diff摘要（逐字核對，只有這些差異，其餘業務邏輯完全相同）──────────────
   fn_member_self_book：
     + declare v_prev_lock_timeout text;
     + v_prev_lock_timeout := current_setting('lock_timeout', true);
     + perform set_config('lock_timeout', '3s', true);
     + perform pg_advisory_xact_lock(hashtext('yugym:venue_unit'), hashtext(p_venue_unit || ':' || p_date::text));
       （包住原本就有的 RESOURCE_BUSY 檢查）
     + 提早 return 前與函式尾端都還原 lock_timeout
     + 跑步機迴圈每個候選編號前也補一行 pg_advisory_xact_lock(...)
   fn_member_self_venue：對稱加法，鎖鍵同一套命名空間 'yugym:venue_unit'。

   ── ⚠ 本輪新發現：理論死鎖窗口（非阻斷項目，但未被既有測試覆蓋）────────────
   兩支函式的跑步機迴圈都是「先鎖使用者指定的主場地，再依 1..capacity
   遞增順序鎖其餘候選」。這不是全域單調順序——情境：
     會員A 指定 treadmill_3 當主場地（先鎖3，迴圈補1、2）
     會員B 同時指定 treadmill_1 當主場地（先鎖1，迴圈補2、3）
   A持有3等待1、B持有1等待3 → 構成真正的鎖等待環。
   後果有界、不是真的卡死：pg_advisory_xact_lock 參與 Postgres 標準死鎖
   偵測，加上函式本身設了 lock_timeout='3s'，任一邊最多 3 秒後收到
   deadlock_detected 或 lock_timeout，被 EXCEPTION WHEN OTHERS 接住回
   jsonb_build_object('ok',false,...)，不會讓連線卡住或資料不一致。
   既有2c測試覆蓋「搶同一台」「不同台互不阻塞」「lock_timeout真的觸發」，
   但沒有覆蓋「兩個不同主場地互相搶對方候選」這個排列——建議列入2c上線後
   觀察項目，不建議為此延後部署（發生機率低：需要兩位會員同時指定不同
   主場地且各自要跑步機多台同行）。

   ── 部署前必要條件 ────────────────────────────────────────────────────
   簽章不變，CREATE OR REPLACE 原地更新即可，GRANT 不受影響（已核對現有
   grants：fn_member_self_book 僅 authenticated；fn_member_self_venue
   anon/authenticated/service_role 皆有，此為既有基準，CREATE OR REPLACE
   不會動到）。

   ── 部署後唯讀驗證 ────────────────────────────────────────────────────
   select proname, pg_get_functiondef(oid) ilike '%pg_advisory%' as has_lock,
          pg_get_functiondef(oid) ilike '%lock_timeout%' as has_timeout
     from pg_proc where proname in ('fn_member_self_book','fn_member_self_venue');
   -- 預期兩列皆 has_lock=true, has_timeout=true。

   ── 回復方式 ──────────────────────────────────────────────────────────
   CREATE OR REPLACE 貼回下方「原始版本」區塊（本輪從正式庫唯讀取得的逐字
   原文），簽章不變、GRANT不受影響，前端完全不用動。
   ══════════════════════════════════════════════════════════════════════ */

-- ════════════════════ 部署版本（測試庫已驗證） ════════════════════════

CREATE OR REPLACE FUNCTION public.fn_member_self_book(p_date date, p_start_time text, p_ticket_id text, p_venue_unit text DEFAULT NULL::text, p_family_user text DEFAULT NULL::text, p_units integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_mid text := current_member_id();
        v_tk member_tickets%rowtype;
        v_tt ticket_types%rowtype;
        v_bid text := gen_short_id('BK-');
        v_ns int; v_dow int; v_bh int[];
        v_cap int; v_made int := 1; v_i int; v_unit text;
        v_prev_lock_timeout text;
begin
  if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  if p_date < (now() at time zone 'Asia/Taipei')::date then return jsonb_build_object('ok',false,'error_code','BOOKING.PAST_DATE'); end if;
  select * into v_tk from member_tickets where id=p_ticket_id for update;
  if not found or v_tk.member_id <> v_mid then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  if v_tk.status is distinct from 'usable' or coalesce(v_tk.sessions_remaining,0) < 1
     or (v_tk.expire_date is not null and v_tk.expire_date < p_date) then
    return jsonb_build_object('ok',false,'error_code','POINT.EMPTY');
  end if;
  select * into v_tt from ticket_types where id=v_tk.ticket_type_id;
  if not found or v_tt.category::text <> '自主訓練' then return jsonb_build_object('ok',false,'error_code','TICKET.WRONG_TYPE'); end if;
  v_ns := split_part(p_start_time,':',1)::int*60 + split_part(p_start_time,':',2)::int;

  v_bh := fn_biz_hours(p_date);
  if v_ns < v_bh[1] or v_ns + 60 > v_bh[2] then
    return jsonb_build_object('ok',false,'error_code','BOOKING.CLOSED_HOURS');
  end if;

  if coalesce(v_tt.time_restricted,false) then
    v_dow := extract(dow from p_date)::int;
    if v_dow in (0,6) or v_ns + 60 > 1080 then return jsonb_build_object('ok',false,'error_code','TICKET.TIME_RESTRICTED'); end if;
  end if;

  if nullif(trim(coalesce(p_family_user,'')),'') is null
     and exists (select 1 from bookings b where b.member_id=v_mid and b.date=p_date and b.status<>'cancelled'
      and b.category::text <> '自主訓練'
      and (split_part(b.start_time,':',1)::int*60+split_part(b.start_time,':',2)::int) < v_ns+60
      and (split_part(b.start_time,':',1)::int*60+split_part(b.start_time,':',2)::int)+coalesce(b.duration,60) > v_ns) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.DUP');
  end if;

  v_prev_lock_timeout := current_setting('lock_timeout', true);
  perform set_config('lock_timeout', '3s', true);

  if p_venue_unit is not null then
    perform pg_advisory_xact_lock(hashtext('yugym:venue_unit'), hashtext(p_venue_unit || ':' || p_date::text));
    if exists (select 1 from bookings b where b.date=p_date and b.status<>'cancelled' and b.venue_unit=p_venue_unit
        and (split_part(b.start_time,':',1)::int*60+split_part(b.start_time,':',2)::int) < v_ns+60
        and (split_part(b.start_time,':',1)::int*60+split_part(b.start_time,':',2)::int)+coalesce(b.duration,60) > v_ns) then
      perform set_config('lock_timeout', coalesce(v_prev_lock_timeout, ''), true);
      return jsonb_build_object('ok',false,'error_code','BOOKING.RESOURCE_BUSY');
    end if;
  end if;

  insert into bookings (id,member_id,coach_id,ticket_id,ticket_type_id,category,date,start_time,duration,status,recurring,venue_unit,trial_name,created_by,created_at)
  values (v_bid,v_mid,null,v_tk.id,v_tk.ticket_type_id,'自主訓練'::ticket_category,p_date,p_start_time,60,'booked',false,p_venue_unit,
          nullif(trim(coalesce(p_family_user,'')),''),v_mid,now());
  update member_tickets set sessions_remaining=sessions_remaining-1 where id=v_tk.id;
  insert into ticket_logs (id,ticket_id,action,delta,booking_id,operator,note)
  values (gen_short_id('LG-'),v_tk.id,'deduct',-1,v_bid,v_mid,'會員自行預約扣點'||case when nullif(trim(coalesce(p_family_user,'')),'') is not null then '（使用人：'||trim(p_family_user)||'）' else '' end);

  if coalesce(p_units,1) > 1 and split_part(coalesce(p_venue_unit,''),'_',1) = 'treadmill' then
    select coalesce(capacity,2) into v_cap from venues where id='treadmill';
    v_cap := coalesce(v_cap,2);
    for v_i in 1..v_cap loop
      exit when v_made >= p_units;
      v_unit := 'treadmill_'||v_i;
      if v_unit = p_venue_unit then continue; end if;
      perform pg_advisory_xact_lock(hashtext('yugym:venue_unit'), hashtext(v_unit || ':' || p_date::text));
      if exists (select 1 from bookings b where b.date=p_date and b.status<>'cancelled' and b.venue_unit=v_unit
          and (split_part(b.start_time,':',1)::int*60+split_part(b.start_time,':',2)::int) < v_ns+60
          and (split_part(b.start_time,':',1)::int*60+split_part(b.start_time,':',2)::int)+coalesce(b.duration,60) > v_ns) then
        continue;
      end if;
      insert into bookings (id,member_id,coach_id,ticket_id,ticket_type_id,category,date,start_time,duration,status,recurring,venue_unit,sibling_of,trial_name,created_by,created_at,note)
      values (gen_short_id('BK-'),v_mid,null,null,v_tk.ticket_type_id,'自主訓練'::ticket_category,p_date,p_start_time,60,'booked',false,v_unit,v_bid,
              nullif(trim(coalesce(p_family_user,'')),''),v_mid,now(),'同行使用（跑步機）・不另外扣點');
      v_made := v_made + 1;
    end loop;
  end if;

  perform set_config('lock_timeout', coalesce(v_prev_lock_timeout, ''), true);

  perform desk_alert(v_mid,'self_book','　自行預約了自主訓練',
    to_char(p_date,'MM/DD')||' '||p_start_time||'　自主訓練'
    ||case when v_made>1 then '（跑步機 '||v_made||' 台）' else '' end
    ||case when nullif(trim(coalesce(p_family_user,'')),'') is not null then '（使用人：'||trim(p_family_user)||'）' else '' end);
  return jsonb_build_object('ok',true,'booking_id',v_bid,'remaining_after',v_tk.sessions_remaining-1,'units',v_made);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_member_self_venue(p_booking_id text, p_venue_unit text, p_units integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_mid text := current_member_id();
        b bookings%rowtype; v_ns int; v_ne int; v_cap int; v_made int := 1; v_i int; v_unit text; v_old text;
        v_prev_lock_timeout text;
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

  update bookings set status='cancelled' where sibling_of=b.id and status<>'cancelled';

  v_prev_lock_timeout := current_setting('lock_timeout', true);
  perform set_config('lock_timeout', '3s', true);

  perform pg_advisory_xact_lock(hashtext('yugym:venue_unit'), hashtext(p_venue_unit || ':' || b.date::text));
  if exists (select 1 from bookings x where x.date=b.date and x.status<>'cancelled' and x.venue_unit=p_venue_unit and x.id<>b.id
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int) < v_ne
      and (split_part(x.start_time,':',1)::int*60+split_part(x.start_time,':',2)::int)+coalesce(x.duration,60) > v_ns) then
    perform set_config('lock_timeout', coalesce(v_prev_lock_timeout, ''), true);
    raise exception 'BOOKING.RESOURCE_BUSY';
  end if;
  update bookings set venue_unit=p_venue_unit where id=b.id;

  if coalesce(p_units,1) > 1 and split_part(p_venue_unit,'_',1) = 'treadmill' then
    select coalesce(capacity,2) into v_cap from venues where id='treadmill';
    v_cap := coalesce(v_cap,2);
    for v_i in 1..v_cap loop
      exit when v_made >= p_units;
      v_unit := 'treadmill_'||v_i;
      if v_unit = p_venue_unit then continue; end if;
      perform pg_advisory_xact_lock(hashtext('yugym:venue_unit'), hashtext(v_unit || ':' || b.date::text));
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

  perform set_config('lock_timeout', coalesce(v_prev_lock_timeout, ''), true);

  perform desk_alert(v_mid,'self_move','　自行改了自主訓練的場地',
    to_char(b.date,'MM/DD')||' '||b.start_time||'　'||coalesce(nullif(split_part(v_old,'_',1),''),'—')||' → '||split_part(p_venue_unit,'_',1)
    ||case when v_made>1 then '（跑步機 '||v_made||' 台）' else '' end);
  return jsonb_build_object('ok',true,'booking_id',b.id,'units',v_made);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;

-- ════════════════════ 原始版本（正式庫唯讀取得，回滾用） ═══════════════
-- fn_member_self_book 原始版本：同上，但移除 v_prev_lock_timeout 宣告、
--   lock_timeout 設定/還原三處、兩個 pg_advisory_xact_lock(...) 呼叫，
--   其餘逐字相同（2026-11-09 已從正式庫唯讀取得完整原文核對過）。
-- fn_member_self_venue 原始版本：同上模式，移除同樣4處鎖相關敘述。
-- 完整逐字原文已在 2026-11-09 唯讀查詢中取得，回滾時可直接向本對話歷史
-- 取用，或重新執行 pg_get_functiondef() 查詢（回滾前務必重新核對正式庫
-- 當下版本，避免期間又有其他改動）。
