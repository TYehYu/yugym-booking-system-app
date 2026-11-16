-- 階段 11：續約銜接卡位 v2（月份守門加一段、三個新觸發器、四支新函式）。⚠ 只供審查；尚未在正式庫執行，需使用者明確授權。
-- 單一交易：前置核對（環境、既有物件釘住版本、依賴函式、名稱未被占用）→ 套用 → 提交前核對（本體指紋、權限、觸發器、其餘物件不變）→ commit；任何一步失敗＝整個交易回滾。
-- 不動任何資料；新函式用 create function（不用 or replace）；唯一用 or replace 的是 fn_hold_month_guard，且只在它「正好是釘住的原版」時才會被覆蓋。
-- 順序：先套本檔（資料庫），再發布前端；前端發布後預設保留資料庫新函式（見回復檔說明）。
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if not ((select system_identifier::text from pg_control_system()) = '7637215626725903220') then raise exception 'RN.GUARD: 前置條件不符：叢集識別是本環境（正式庫），停止（沒有任何變更）'; end if;
  if not (to_regclass('public.change_log') is not null) then raise exception 'RN.GUARD: 前置條件不符：像正式庫（有 change_log），停止（沒有任何變更）'; end if;
  if not (exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='contract_id') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='pending_contract' and data_type='boolean') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='contracts' and column_name='sessions') and exists (select 1 from information_schema.columns where table_schema='public' and table_name='ticket_grant_requests' and column_name='payload' and udt_name='jsonb')) then raise exception 'RN.GUARD: 前置條件不符：欄位存在且型別正確（bookings.contract_id／pending_contract、contracts.sessions、ticket_grant_requests.payload jsonb），停止（沒有任何變更）'; end if;
  if not (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_tk_today'), '') = '0e56a027d482cff48c58b18f66adde21') then raise exception 'RN.GUARD: 前置條件不符：fn_tk_today 是釘住的版本（定義 md5 0e56a027d482cff48c58b18f66adde21），停止（沒有任何變更）'; end if;
  if not (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_hold_month_limit_end'), '') = '25e24e629d5d1ad0a865393cafbd621c') then raise exception 'RN.GUARD: 前置條件不符：fn_hold_month_limit_end 是釘住的版本（定義 md5 25e24e629d5d1ad0a865393cafbd621c），停止（沒有任何變更）'; end if;
  if not (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_contract_hold_check'), '') = 'abfd7b86e0c97d39dbf979c9432909ed') then raise exception 'RN.GUARD: 前置條件不符：fn_contract_hold_check 是釘住的版本（定義 md5 abfd7b86e0c97d39dbf979c9432909ed），停止（沒有任何變更）'; end if;
  if not (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_contract_hold_guard'), '') = '83e8d478609db46b91311ad8d148c230') then raise exception 'RN.GUARD: 前置條件不符：fn_contract_hold_guard 是釘住的版本（定義 md5 83e8d478609db46b91311ad8d148c230），停止（沒有任何變更）'; end if;
  if not (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_tk_shared_has'), '') = '766f04876216f1cdbc7becc3a9f57e49') then raise exception 'RN.GUARD: 前置條件不符：fn_tk_shared_has 是釘住的版本（定義 md5 766f04876216f1cdbc7becc3a9f57e49），停止（沒有任何變更）'; end if;
  if not (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='is_staff_desk'), '') = '46d2a4db99b29dd44bd667e91d32cbe3') then raise exception 'RN.GUARD: 前置條件不符：is_staff_desk 是釘住的版本（定義 md5 46d2a4db99b29dd44bd667e91d32cbe3），停止（沒有任何變更）'; end if;
  if not (coalesce((select string_agg(md5(pg_get_functiondef(p.oid)), ',') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='fn_hold_month_guard'), '') = '20399e1ec62751e958ae8c2a1d00064f') then raise exception 'RN.GUARD: 前置條件不符：fn_hold_month_guard 是釘住的版本（定義 md5 20399e1ec62751e958ae8c2a1d00064f）＝套用前的原版，才可被覆蓋，停止（沒有任何變更）'; end if;
  if not (coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_hold_month_guard' and not t.tgisinternal), '') = 'bd919dd7342e1a26f1b870538b93de4f') then raise exception 'RN.GUARD: 前置條件不符：觸發器 trg_bookings_hold_month_guard 是釘住的版本（定義 md5 bd919dd7342e1a26f1b870538b93de4f），停止（沒有任何變更）'; end if;
  if not (coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_contract_hold_guard' and not t.tgisinternal), '') = '82c324805c4aaefc70a4795a35be1c69') then raise exception 'RN.GUARD: 前置條件不符：觸發器 trg_bookings_contract_hold_guard 是釘住的版本（定義 md5 82c324805c4aaefc70a4795a35be1c69），停止（沒有任何變更）'; end if;
  if not (exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='current_employee_id') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_tgr_cancel_cascade') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_contract_cancel_holds') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_contracts_delete_cascade') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_tk_holding') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='gen_short_id')) then raise exception 'RN.GUARD: 前置條件不符：依賴函式都存在（current_employee_id、fn_tgr_cancel_cascade、fn_contract_cancel_holds、fn_contracts_delete_cascade、fn_tk_holding、gen_short_id），停止（沒有任何變更）'; end if;
  if not (not exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','zz_rn_adopt'))) then raise exception 'RN.GUARD: 前置條件不符：四支新函式名稱都還不存在（不覆蓋任何同名物件，不論參數）；測試專用 zz_rn_adopt 也不存在，停止（沒有任何變更）'; end if;
  if not (not exists (select 1 from pg_trigger where not tgisinternal and tgname in ('trg_bookings_hold_state_guard','trg_contract_window_ins','trg_contract_window_upd'))) then raise exception 'RN.GUARD: 前置條件不符：三個新觸發器名稱都還不存在，停止（沒有任何變更）'; end if;
  create temp table _rn_pre on commit drop as select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_trigger where not tgisinternal) n_trg,
     (select count(*) from pg_tables where schemaname='public') n_tables,
     (select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')) guard_acl;
end
$guard$;

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

do $post$
declare pre record;
begin
  select * into pre from _rn_pre;
  if not ((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds')) = 4) then raise exception 'RN.POST: 提交前核對不符：四支新函式恰好各一支，整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), '') = '22edb0f9a4893e9d891a420ba4588440') then raise exception 'RN.POST: 提交前核對不符：fn_hold_state_guard 本體 md5＝22edb0f9a4893e9d891a420ba4588440，整個交易回滾'; end if;
  if not (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), false)) then raise exception 'RN.POST: 提交前核對不符：fn_hold_state_guard 的 security definer＝true、search_path 為 public, pg_temp，整個交易回滾'; end if;
  if not (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), '') = '{postgres=X/postgres}') then raise exception 'RN.POST: 提交前核對不符：fn_hold_state_guard 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行），整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), '') = 'f6dbf9948aa381932b0f8d7fa605dfbe') then raise exception 'RN.POST: 提交前核對不符：fn_contract_window_check 本體 md5＝f6dbf9948aa381932b0f8d7fa605dfbe，整個交易回滾'; end if;
  if not (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), false)) then raise exception 'RN.POST: 提交前核對不符：fn_contract_window_check 的 security definer＝true、search_path 為 public, pg_temp，整個交易回滾'; end if;
  if not (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), '') = '{postgres=X/postgres}') then raise exception 'RN.POST: 提交前核對不符：fn_contract_window_check 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行），整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), '') = 'd3c291fa4a1d308a9edaee54a5924f7c') then raise exception 'RN.POST: 提交前核對不符：trg_contract_window_booking 本體 md5＝d3c291fa4a1d308a9edaee54a5924f7c，整個交易回滾'; end if;
  if not (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), false)) then raise exception 'RN.POST: 提交前核對不符：trg_contract_window_booking 的 security definer＝true、search_path 為 public, pg_temp，整個交易回滾'; end if;
  if not (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), '') = '{postgres=X/postgres}') then raise exception 'RN.POST: 提交前核對不符：trg_contract_window_booking 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行），整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), '') = '05c51530e595cf296f9b8da951f66093') then raise exception 'RN.POST: 提交前核對不符：fn_contract_adopt_holds 本體 md5＝05c51530e595cf296f9b8da951f66093，整個交易回滾'; end if;
  if not (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), false)) then raise exception 'RN.POST: 提交前核對不符：fn_contract_adopt_holds 的 security definer＝true、search_path 為 public, pg_temp，整個交易回滾'; end if;
  if not (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), '') = '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'RN.POST: 提交前核對不符：fn_contract_adopt_holds 權限正好是 {postgres=X/postgres,authenticated=X/postgres}（anon／service_role／public 都不能執行），整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')), '') = 'e7152b65fbb7d6c5d494cc938757caeb') then raise exception 'RN.POST: 提交前核對不符：fn_hold_month_guard 本體 md5＝e7152b65fbb7d6c5d494cc938757caeb（新版），整個交易回滾'; end if;
  if not (coalesce((select prosecdef and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')), false)) then raise exception 'RN.POST: 提交前核對不符：fn_hold_month_guard 的 security definer／search_path 不變，整個交易回滾'; end if;
  if not (exists (select 1 from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_hold_state_guard' and not t.tgisinternal and t.tgenabled='O' and pg_get_triggerdef(t.oid) like '%BEFORE INSERT OR UPDATE OF status, ticket_id, date ON public.bookings%' and pg_get_triggerdef(t.oid) like '%fn_hold_state_guard()%')) then raise exception 'RN.POST: 提交前核對不符：觸發器 trg_bookings_hold_state_guard 存在於 bookings、已啟用、定義含 BEFORE INSERT OR UPDATE OF status, ticket_id, date ON public.bookings／fn_hold_state_guard()，整個交易回滾'; end if;
  if not (exists (select 1 from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_contract_window_ins' and not t.tgisinternal and t.tgenabled='O' and pg_get_triggerdef(t.oid) like '%AFTER INSERT ON public.bookings%' and pg_get_triggerdef(t.oid) like '%trg_contract_window_booking()%')) then raise exception 'RN.POST: 提交前核對不符：觸發器 trg_contract_window_ins 存在於 bookings、已啟用、定義含 AFTER INSERT ON public.bookings／trg_contract_window_booking()，整個交易回滾'; end if;
  if not (exists (select 1 from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_contract_window_upd' and not t.tgisinternal and t.tgenabled='O' and pg_get_triggerdef(t.oid) like '%AFTER UPDATE ON public.bookings%' and pg_get_triggerdef(t.oid) like '%trg_contract_window_booking()%')) then raise exception 'RN.POST: 提交前核對不符：觸發器 trg_contract_window_upd 存在於 bookings、已啟用、定義含 AFTER UPDATE ON public.bookings／trg_contract_window_booking()，整個交易回滾'; end if;
  if not (coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_hold_month_guard' and not t.tgisinternal), '') = 'bd919dd7342e1a26f1b870538b93de4f' and coalesce((select md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgrelid='public.bookings'::regclass and t.tgname='trg_bookings_contract_hold_guard' and not t.tgisinternal), '') = '82c324805c4aaefc70a4795a35be1c69') then raise exception 'RN.POST: 提交前核對不符：既有的兩個卡位觸發器沒被動到（指紋仍是釘住的版本），整個交易回滾'; end if;
  if (select count(*) from pg_trigger where not tgisinternal) is distinct from pre.n_trg + 3 then raise exception 'RN.POST: 觸發器總數不是 原有+3，整個交易回滾'; end if;
  if (select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')) is distinct from pre.guard_acl then raise exception 'RN.POST: fn_hold_month_guard 權限與套用前不同，整個交易回滾'; end if;
  if exists (select 1 from (select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_tables where schemaname='public') n_tables) now_ where (now_.n_funcs, now_.funcs_sig, now_.pol, now_.grants, now_.n_tables) is distinct from (pre.n_funcs, pre.funcs_sig, pre.pol, pre.grants, pre.n_tables)) then
    raise exception 'RN.POST: 其他函式（本體＋權限）／policies／table grants／資料表與套用前不同，整個交易回滾'; end if;
end
$post$;

commit;
