-- ═════════════════════════════════════════════════════════════════
-- 續約銜接卡位 v2（2026-11-16 使用者最新定案；先前「本期下一週、最多兩堂」的規則作廢）
-- ⚠ 準備稿；只在測試庫套用與驗證。正式庫需另行明確授權與階段檔（含指紋核對）。不新增任何排程。
--
-- 【一、沒有合約的卡位】
--   ① 任意未來日期都可以卡位（不受原本「當月／每月最後一個星期一開放下個月」限制）。
--   ② 「每次操作只能排七天」是**一次操作**的規則：以這次最早一堂的上課日 D 為第一天，可排 D～D+6（共七個日曆日，含頭尾；不是從操作當天起算、
--      不看日曆週或月份，可跨月跨年）。資料庫只看到一筆一筆的寫入、看不出哪幾筆屬於同一次操作，所以這條由前端的建立流程負責
--      （超出 D+6 的整批在送出前拒絕並列出日期）；資料庫不設「總共幾堂」的上限，也不限制不同七天範圍的卡位同時存在。
--   ③ 卡位仍是待簽約：沒綁票（不扣舊票）、不扣堂、不能直接簽到（見 fn_hold_state_guard）。
--   ④ 每筆最多保留到「該堂課當天」：隔日起不再視為有效卡位、也不能由一般流程轉正或改期救活（fn_hold_state_guard 的 HOLD.EXPIRED）。
--      歷史資料保留（不改、不刪、不取消）。
--   ⑤ 到期處理不需要排程：用「日期 < 今天（台北）」現算（惰性），資料庫守門與前端畫面用同一個判斷。
-- 【二、承接既有卡位】fn_contract_adopt_holds（員工專用 RPC，單一交易、全有或全無）
--   沿用原預約列（只把 contract_id 寫上去：編號、日期、時間、教練、場地都不動、不刪除重建）；承接的卡位占用合約堂數；
--   檢查會員、票種、狀態、到期、是否已屬其他合約、堂數、暫定使用期間；任何一筆不符就整批不動並逐筆列出原因；
--   重送只回 already、不重複占額；並行以「合約列→申請列→預約列」鎖序＋既有的額度守衛序列化。付款後綁新票扣堂走既有轉正，本檔不改。
-- 【三、未簽到前的使用期限】
--   票券：既有 P0-E「預約窗口」(fn_tk_window_check) 與「首次簽到才起算」(fn_tk_activate) 沿用，不改。
--   合約（票還沒發）：新增 fn_contract_window_check＋觸發器——以合約下最早一堂有效預約起算「暫定使用期間」（方案 valid_days 天），
--   新增、改期、取消最早一堂、換合約時重新檢查；超出就整筆拒絕（CONTRACT.OUT_OF_WINDOW），不靜默留下超出期間的課。
--   預約或付款本身不算正式啟用；首次實際簽到才起算（既有機制）。
--   合約取消／刪除的連動取消（巢狀觸發）不檢查（pg_trigger_depth()>1），避免連動取消被自己擋住。
--   有效天數缺漏／格式不正確／0：不得靜默當成「不限期」——占用動作拒絕（CONTRACT.VALID_DAYS_INVALID）、承接列為問題；取消不擋。
-- 【簽到保護含 INSERT／upsert】fn_hold_state_guard 同時掛在 BEFORE INSERT：前端 dbPut 是 upsert，既有列先走 INSERT 觸發，只擋 UPDATE 會被繞過。
-- 回復：20261120_renewal_hold_slots_rollback.sql。
-- ═════════════════════════════════════════════════════════════════

-- ① 月份守門：只加一段（沒有合約的卡位：有會員就放行，任意未來日期）；其餘逐字同正式庫現行本體
create or replace function public.fn_hold_month_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old   record;
  v_end   date;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_has   boolean := false;
  v_changed boolean := true;
  v_have  boolean := false;
begin
  -- 維運／Edge Function／直連不受限（見檔頭 ④）
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status::text = 'cancelled' or new.date is null then return new; end if;
  if not coalesce(new.pending_contract, false) or new.ticket_id is not null then return new; end if;
  if new.category::text = '自主訓練' then return new; end if;

  -- 這次寫入有沒有「改到卡位的身分或日期」：沒有就是一般編輯，放行（不追溯舊資料）。
  -- 比對項目含 status（把已取消的卡位復活）、category／ticket_type_id／member_id（換標籤、換會員來取得豁免）。
  if tg_op = 'UPDATE' then
    v_old := old; v_have := true;
  else
    select b.* into v_old from bookings b where b.id = new.id;     -- dbPut 的 upsert：既有列先走 INSERT 觸發
    v_have := found;
  end if;
  if v_have then
    v_changed := not (
          v_old.date is not distinct from new.date
      and coalesce(v_old.pending_contract, false) = coalesce(new.pending_contract, false)
      and v_old.ticket_id is not distinct from new.ticket_id
      and v_old.status is not distinct from new.status
      and v_old.category is not distinct from new.category
      and v_old.ticket_type_id is not distinct from new.ticket_type_id
      and v_old.member_id is not distinct from new.member_id
      and v_old.contract_id is not distinct from new.contract_id );
  end if;
  if not v_changed then return new; end if;

  v_end := public.fn_hold_month_limit_end(v_today);
  if new.date <= v_end then return new; end if;     -- 過去／當月／已開放的下個月：放行

  -- B 模式：帶 contract_id 且通過合約檢查（pending、未發票、會員與票種相符、額度足夠）→ 不受月份限制。
  -- 沒通過 → 往下走 C 判斷；絕不因為「有 contract_id」或「沒有 contract_id」就直接當成豁免或 C。
  if new.contract_id is not null then
    if public.fn_contract_hold_check(new.contract_id, new.member_id, new.ticket_type_id, new.id) is null then
      return new;
    end if;
  end if;

  /* 超出範圍：只有「確認這位會員有一張實際能用在這堂課的票」才放行；任何一項無法確認 → 不放行。
     「能用在這堂課」＝同一票種（ticket_type_id 相同），或這堂是團課（小班肌力）且票也是團課類別
     （前端團課票本來就整個類別共用）。教練課相容舊票、友善票等其他對應 **不** 在這裡放行（寧可擋、不要漏）。
     並要求：持有或共享、status='usable'、剩餘 > 0、效期涵蓋預約日、已到起始日（已開通者不看）、
     限時段票（time_restricted）遇到假日或 18:00 後下課一律不放行。
     任何一步出錯（欄位型別轉換失敗等）→ 當作不符合，不放行。 */
  if new.member_id is not null then
    begin
      select exists (
        select 1
          from member_tickets mt
          join ticket_types ttt on ttt.id = mt.ticket_type_id
         where ( mt.member_id = new.member_id or public.fn_tk_shared_has(to_jsonb(mt.shared_with), new.member_id) )
           and mt.status::text = 'usable'
           and coalesce(mt.sessions_remaining, 0) > 0
           and (mt.expire_date is null or mt.expire_date >= new.date)
           and not (mt.start_date is not null and mt.start_date > new.date and mt.activated_at is null)
           and ( mt.ticket_type_id = new.ticket_type_id
                 or ( new.category::text = '小班肌力' and ttt.category::text = '小班肌力' ) )
           and ( not coalesce(ttt.time_restricted, false)
                 or ( extract(isodow from new.date) between 1 and 5
                      and (new.start_time::time + make_interval(mins => coalesce(new.duration, 60))) <= time '18:00'
                      and new.start_time::time + make_interval(mins => coalesce(new.duration, 60)) > new.start_time::time ) )
      ) into v_has;
    exception when others then
      v_has := false;
    end;
    if v_has then return new; end if;
  end if;

  -- 2026-11-16 沒有合約的卡位（D 模式）：綁了會員的待簽約卡位可以排在任意未來日期，不受月份限制。
  -- 「每次操作只能排七天（最早一堂 D 起，D～D+6）」由前端建立流程負責；到期、簽到、轉正的限制見 fn_hold_state_guard。沒有會員的空堂仍受原月份限制。
  if new.member_id is not null then return new; end if;

  raise exception 'HOLD.MONTH_LIMIT:%', to_char(v_end, 'YYYY-MM-DD')
    using errcode = 'P0001',
          hint = '沒有符合資格票券的卡位只能預約到 ' || to_char(v_end, 'YYYY/MM/DD') || '；每月最後一個星期一起開放下個月';
end
$function$;

-- ② 卡位狀態守門：沒綁票的待簽約卡位不能簽到；沒有合約的卡位只保留到該堂課當天（已到期不能轉正、不能改期救活）
--    INSERT 也要擋（2026-11-16 補）：前端 dbPut 是 upsert，PostgREST 對「既有列」先走 INSERT 觸發——只擋 UPDATE 會被 upsert 繞過。
--    INSERT 時以既有列當「舊值」（有就比對，沒有＝全新的列，直接檢查）。
create function public.fn_hold_state_guard()
returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_today date := public.fn_tk_today(); o record; v_have boolean := false;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;     -- 維運例外（同月份守門）
  if tg_op = 'UPDATE' then
    o := old; v_have := true;
  else
    select b.* into o from bookings b where b.id = new.id; v_have := found;
  end if;
  if new.status::text in ('checked_in', 'completed') and (not v_have or o.status::text is distinct from new.status::text)
     and coalesce(new.pending_contract, false) and new.ticket_id is null and new.member_id is not null then
    raise exception 'HOLD.UNPAID_CHECKIN' using errcode = 'P0001',
          hint = '待簽約卡位尚未收款綁票，不能簽到；請先轉正（綁票扣堂）再簽到';
  end if;
  if v_have and coalesce(o.pending_contract, false) and o.ticket_id is null and o.contract_id is null and o.member_id is not null
     and o.status::text <> 'cancelled' and o.date < v_today then
    if new.ticket_id is not null
       or ( new.date is distinct from o.date and new.date >= v_today and new.status::text <> 'cancelled' ) then
      raise exception 'HOLD.EXPIRED:%', to_char(o.date, 'YYYY-MM-DD') using errcode = 'P0001',
            hint = '沒有合約的卡位只保留到該堂課當天；已到期，不能轉正或改期救活（歷史資料保留）';
    end if;
  end if;
  return new;
end
$fn$;
revoke all on function public.fn_hold_state_guard() from public, anon, authenticated, service_role;
create trigger trg_bookings_hold_state_guard before insert or update of status, ticket_id, date on public.bookings
  for each row execute function fn_hold_state_guard();

-- ③ 合約暫定使用期間（票還沒發之前）：以合約下最早一堂有效預約起算 valid_days 天
create function public.fn_contract_window_check(p_contract text, p_active boolean default true)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_raw text; v_valid int; v_min date; v_max date;
begin
  if p_contract is null then return; end if;
  select r.payload->'plan'->>'valid_days' into v_raw
    from ticket_grant_requests r where r.contract_id = p_contract and r.status = 'pending';   -- 已發票／已取消的合約不在這裡管（票券有自己的預約窗口）
  if not found then return; end if;
  /* 有效天數缺漏、不是正整數、或 0 → 不能算暫定期間。絕不能靜默當成「不限期」放行：
     新增／改期等「占用」動作直接拒絕並說明原因；取消（p_active=false）不擋，免得連取消都卡住。 */
  if v_raw is null or v_raw !~ '^[0-9]+$' or v_raw::int <= 0 then
    if p_active then
      raise exception 'CONTRACT.VALID_DAYS_INVALID:%', coalesce(v_raw, '') using errcode = 'P0001',
            hint = '這份合約的方案沒有設定有效天數（或格式不正確），無法計算暫定使用期間；請先修正方案的有效天數';
    end if;
    return;
  end if;
  v_valid := v_raw::int;
  perform pg_advisory_xact_lock(hashtext('cwin:' || p_contract));                           -- 同一合約的並行改動排隊（不碰申請列鎖，避免與取消連動互鎖）
  select min(b.date), max(b.date) into v_min, v_max
    from bookings b where b.contract_id = p_contract and b.status::text <> 'cancelled';
  if v_min is null then return; end if;
  if (v_max - v_min) > (v_valid - 1) then
    raise exception 'CONTRACT.OUT_OF_WINDOW:%:%', to_char(v_min, 'YYYY-MM-DD'), to_char(v_min + (v_valid - 1), 'YYYY-MM-DD')
      using errcode = 'P0001',
            hint = '合約尚未發放票券：暫定使用期間自最早一堂起 ' || v_valid || ' 天（至 ' || to_char(v_min + (v_valid - 1), 'YYYY/MM/DD') || '）；首次簽到後才正式起算效期';
  end if;
end
$fn$;
revoke all on function public.fn_contract_window_check(text, boolean) from public, anon, authenticated, service_role;

create function public.trg_contract_window_booking()
returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  if pg_trigger_depth() > 1 then return null; end if;                                        -- 合約取消／刪除的連動取消（巢狀）不檢查
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return null; end if;    -- 維運例外
  if tg_op = 'UPDATE' and old.contract_id is not null and old.contract_id is distinct from new.contract_id then
    perform public.fn_contract_window_check(old.contract_id, false);                          -- 搬出去的那份合約：只重算區間，不因它的設定異常而擋
  end if;
  if new.contract_id is not null then perform public.fn_contract_window_check(new.contract_id, new.status::text <> 'cancelled'); end if;
  return null;
end
$fn$;
revoke all on function public.trg_contract_window_booking() from public, anon, authenticated, service_role;
create trigger trg_contract_window_ins after insert on public.bookings
  for each row when (new.contract_id is not null and new.status::text <> 'cancelled')
  execute function trg_contract_window_booking();
create trigger trg_contract_window_upd after update on public.bookings
  for each row when (new.contract_id is not null
                     and (new.date is distinct from old.date or new.status is distinct from old.status or new.contract_id is distinct from old.contract_id))
  execute function trg_contract_window_booking();

-- ④ 承接既有卡位（員工專用 RPC；單一交易、全有或全無；p_dry=true 只檢查不寫入）
create function public.fn_contract_adopt_holds(p_contract_id text, p_booking_ids text[], p_dry boolean default false)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_c contracts%rowtype; v_r ticket_grant_requests%rowtype; v_type text; v_valid int; v_today date := public.fn_tk_today();
  v_ids text[]; b record; v_probs jsonb := '[]'::jsonb; v_new text[] := '{}'; v_already text[] := '{}'; v_found text[] := '{}';
  v_exist int; v_cap int; v_min date; v_max date; v_lim date; v_n int; v_off jsonb;
  v_why text; v_raw text;
begin
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_contract_id is null or p_booking_ids is null or coalesce(array_length(p_booking_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS'); end if;
  perform set_config('lock_timeout', '3000', true);
  -- 鎖序：合約列 → 申請列 → 預約列（依 id 排序）；與取消連動同一個方向
  select * into v_c from contracts where id = p_contract_id for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'CONTRACT.NOT_FOUND'); end if;
  select * into v_r from ticket_grant_requests where contract_id = p_contract_id for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'CONTRACT.NO_REQUEST'); end if;
  if v_r.status <> 'pending' then return jsonb_build_object('ok', false, 'error_code', 'CONTRACT.NOT_PENDING'); end if;
  if v_c.ticket_id is not null then return jsonb_build_object('ok', false, 'error_code', 'CONTRACT.ALREADY_ISSUED'); end if;
  v_type := coalesce(v_c.ticket_type_id, v_r.payload->'plan'->>'ticket_type_id');
  v_raw := v_r.payload->'plan'->>'valid_days';
  v_valid := case when v_raw ~ '^[0-9]+$' then v_raw::int end;
  v_cap := coalesce(v_c.sessions, 0);
  select coalesce(array_agg(distinct x order by x), '{}') into v_ids from unnest(p_booking_ids) x where x is not null;
  perform 1 from bookings where id = any (v_ids) order by id for update;
  perform pg_advisory_xact_lock(hashtext('cwin:' || p_contract_id));

  for b in select * from bookings where id = any (v_ids) order by date, start_time, id loop
    v_found := v_found || b.id; v_why := null;
    if b.member_id is distinct from v_c.member_id then v_why := 'MEMBER_MISMATCH';
    elsif b.status::text = 'cancelled' then v_why := 'CANCELLED';
    elsif b.contract_id is not distinct from p_contract_id then v_already := v_already || b.id;            -- 已經在這份合約（重送）：不算問題、不重複占額
    elsif b.contract_id is not null then v_why := 'OWNED_BY_OTHER';
    elsif b.status::text <> 'booked' then v_why := 'NOT_BOOKED';
    elsif not coalesce(b.pending_contract, false) or b.ticket_id is not null then v_why := 'NOT_A_HOLD';
    elsif b.ticket_type_id is distinct from v_type then v_why := 'TYPE_MISMATCH';
    elsif b.date < v_today then v_why := 'EXPIRED';
    else v_new := v_new || b.id; end if;
    if v_why is not null then
      v_probs := v_probs || jsonb_build_object('booking_id', b.id, 'date', b.date, 'start_time', b.start_time, 'reason', v_why);
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('booking_id', x, 'reason', 'NOT_FOUND')), '[]'::jsonb) into v_off
    from unnest(v_ids) x where not (x = any (v_found));
  v_probs := v_probs || v_off;

  -- 堂數：合約目前已占的（未取消）＋這次新承接的，不能超過合約堂數（承接的卡位占用合約堂數，不是額外再給）
  select count(*) into v_exist from bookings where contract_id = p_contract_id and status::text <> 'cancelled';
  if v_exist + coalesce(array_length(v_new, 1), 0) > v_cap then
    v_probs := v_probs || jsonb_build_object('reason', 'QUOTA_EXCEEDED', 'sessions', v_cap, 'already_used', v_exist,
                 'adopting', coalesce(array_length(v_new, 1), 0), 'left', greatest(v_cap - v_exist, 0));
  end if;
  -- 有效天數缺漏或異常：不能算暫定期間，**不靜默當成不限期**——明確列為問題、整批不承接
  if v_valid is null or v_valid <= 0 then
    v_probs := v_probs || jsonb_build_object('reason', 'VALID_DAYS_INVALID', 'raw', v_raw);
  end if;
  -- 暫定使用期間：合約下所有未取消預約（含這次要承接的）最晚一堂與最早一堂不得相差超過 valid_days-1 天
  if v_valid is not null and v_valid > 0 then
    select min(d), max(d) into v_min, v_max from (
      select b2.date d from bookings b2 where b2.contract_id = p_contract_id and b2.status::text <> 'cancelled'
      union all select b3.date from bookings b3 where b3.id = any (v_new)) u;
    if v_min is not null and (v_max - v_min) > (v_valid - 1) then
      v_lim := v_min + (v_valid - 1);
      select coalesce(jsonb_agg(jsonb_build_object('booking_id', id, 'date', date) order by date), '[]'::jsonb) into v_off
        from bookings where (contract_id = p_contract_id and status::text <> 'cancelled' or id = any (v_new)) and date > v_lim;
      v_probs := v_probs || jsonb_build_object('reason', 'OUT_OF_WINDOW', 'window_start', v_min, 'window_end', v_lim, 'valid_days', v_valid, 'offending', v_off);
    end if;
  end if;

  if jsonb_array_length(v_probs) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'ADOPT.PROBLEMS', 'problems', v_probs,
                              'sessions', v_cap, 'already_used', v_exist, 'selected_new', coalesce(array_length(v_new, 1), 0));
  end if;
  if p_dry then
    return jsonb_build_object('ok', true, 'dry', true, 'would_adopt', to_jsonb(v_new), 'already', to_jsonb(v_already),
                              'sessions', v_cap, 'already_used', v_exist, 'left_after', v_cap - v_exist - coalesce(array_length(v_new, 1), 0),
                              'window_start', v_min, 'valid_days', v_valid);
  end if;
  update bookings set contract_id = p_contract_id where id = any (v_new);                  -- 只寫 contract_id：編號、日期、時間、教練、場地都不動
  get diagnostics v_n = row_count;
  if v_n <> coalesce(array_length(v_new, 1), 0) then raise exception 'ADOPT.ROWCOUNT:%:%', v_n, coalesce(array_length(v_new, 1), 0); end if;
  return jsonb_build_object('ok', true, 'adopted', to_jsonb(v_new), 'already', to_jsonb(v_already),
                            'sessions', v_cap, 'used_after', v_exist + v_n, 'left_after', v_cap - v_exist - v_n);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY');
end
$fn$;
revoke all on function public.fn_contract_adopt_holds(text, text[], boolean) from public, anon, authenticated, service_role;
grant execute on function public.fn_contract_adopt_holds(text, text[], boolean) to authenticated;
