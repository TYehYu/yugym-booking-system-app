-- ═══════════════════════════════════════════════════════════════════════
-- 測試庫（kucvxpjatptfckhlxptj）最小同步：讓 fn_move_booking_ticket 能在「正式庫等價」的環境下測試
-- 2026-11-15 準備（尚未執行）。⚠ 只能用在測試庫，絕對不是正式庫 migration。
--
-- 範圍（只做這四件事，其餘一律不同步）：
--   S1  bookings 補三欄：partner_id、no_show、coach_leave（型別、可為空、無預設值，與正式庫一致）
--   S2  五支函式改成正式庫版本（相同簽章、create or replace）：
--       is_staff_desk（含啟用中店長）、fn_hold_month_limit_end、fn_contract_hold_check、
--       fn_contract_hold_guard、fn_hold_month_guard
--   S3  兩支「測試專用複本」（新名稱，不覆蓋、不 DROP 任何既有函式）：
--       zz_prod_fn_cancel_booking（正式庫版本，改名稱與其呼叫的複本名，另加「退款結果一致性」修正：需退款而被異常跳過 → 整筆回滾回 REFUND.FAILED、
--         只有「沒綁票」或「已有扣課且已退回、淨額剛好 0」才回 no_refund_needed；綁票卻完全沒有扣課紀錄（或退多於扣）視為帳務異常，整筆回滾、拒絕取消（REFUND.FAILED:ledger_anomaly）；
--         不退款取消規則不變；差異見函式內註解）；
--       zz_prod_benefit_refund（正式庫版本加上 4 項防護：鎖票、qty 必須為 1、不得超過總堂數、找不到票就跳過；差異見 S3 註解）
--   不同步：bookings 上的 bookings_cancelled_by／bookings_touch／trg_bookings_group_guard／trg_change_log、
--       member_tickets 多出來的欄位、employees 薪資欄位、團課流程、測試庫獨有的 idempotency 欄位與函式。
--   不動：測試庫現有的 2 參數 fn_cancel_booking、benefit_refund（含任何其他未完成的功能）。
--
-- 執行順序：先跑 00_backup_verify_readonly.sql 確認 5 支皆 match（備份已存在 00_backup_originals_DEFS.sql）→ 再跑本檔（整檔在一個交易內）。
-- 安全閥：開頭會比對五支函式的 md5，只要有一支不是 2026-11-14 審查時的版本就整個中止，
--         避免蓋掉別人在測試庫做到一半的修改。
-- ═══════════════════════════════════════════════════════════════════════
begin;

-- ── 庫識別守門（fail-closed）：不是測試庫就中止，不靠註解或表名 ──
-- 依據：2026-11-14 唯讀取得測試庫（kucvxpjatptfckhlxptj，專案名 yugym-sprint3-test）叢集 system_identifier = 7662742571317219726，
--       且測試庫沒有 public.change_log 表與 fn_table_sigs（正式庫有）。任何一項不符、或 pg_control_system() 取不到 → 一律中止。
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫（有 change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;

-- 0) 預檢（任何一項失敗就 raise exception → 整個交易回滾）
do $pre$
declare r record; v_oid oid;
begin
  -- 依「完整函式簽章」核對（不只看函式名）：存在、沒有多餘重載、md5、長度、ACL 都必須與審查時完全相同
  for r in select * from (values
    ('is_staff_desk()','bb43212eea2a8b0f0cd4d8bdebd71884',226,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_limit_end(date)','a532478157a385c984e5f874ff71676d',565,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_check(text,text,text,text)','5b20a677bc7f1e9c0b89cb517717b25c',1411,'{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_guard()','7fda39ead32176116ee06a1a54136ee1',1413,'{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_guard()','66dc9a52f65414f3a8dc2106cac5f424',3169,'{postgres=X/postgres,service_role=X/postgres}')
  ) as t(sig, expected_md5, expected_len, expected_acl) loop
    v_oid := to_regprocedure('public.' || r.sig);
    if v_oid is null then
      raise exception 'SYNC.ABORT: 測試庫找不到 public.%（完整簽章）', r.sig;
    end if;
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = split_part(r.sig, '(', 1)) <> 1 then
      raise exception 'SYNC.ABORT: % 在測試庫有多個重載，請先重新審查', split_part(r.sig, '(', 1);
    end if;
    if md5(pg_get_functiondef(v_oid)) <> r.expected_md5 or length(pg_get_functiondef(v_oid)) <> r.expected_len then
      raise exception 'SYNC.ABORT: 測試庫的 % 與審查時的版本不同（md5／長度），請先重新審查', r.sig;
    end if;
    if coalesce((select proacl::text from pg_proc where oid = v_oid), '') <> r.expected_acl then
      raise exception 'SYNC.ABORT: 測試庫的 % ACL 與審查時不同', r.sig;
    end if;
  end loop;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='fn_tk_shared_has') then
    raise exception 'SYNC.ABORT: 缺 fn_tk_shared_has'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='desk_alert') then
    raise exception 'SYNC.ABORT: 缺 desk_alert'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='gen_short_id') then
    raise exception 'SYNC.ABORT: 缺 gen_short_id'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname='public' and p.proname in ('zz_prod_benefit_refund','zz_prod_fn_cancel_booking')) then
    raise exception 'SYNC.ABORT: zz_prod_* 複本已存在（本檔不重複建立）'; end if;
end
$pre$;

-- S1) 欄位
-- 只在欄位原本不存在時新增，並加上標記註解；回復腳本只刪帶標記的欄位（2026-11-14 唯讀確認三欄原本都不存在）
do $s1$
declare c record;
begin
  for c in select * from (values ('partner_id','text'),('no_show','boolean'),('coach_leave','boolean')) as t(col, typ) loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name=c.col) then
      execute format('alter table public.bookings add column %I %s', c.col, c.typ);
      execute format('comment on column public.bookings.%I is %L', c.col, 'P0C-SYNC-20261115 added-by-01_sync');
    end if;
  end loop;
end
$s1$;

-- S2) 五支函式（以下文字與正式庫 2026-11-14 的 pg_get_functiondef 逐字相同，已用 md5 驗證）
CREATE OR REPLACE FUNCTION public.is_staff_desk()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select current_staff_role() in ('admin','front_desk')
   or exists(select 1 from employees e where e.auth_id=auth.uid()
       and e.role='coach' and coalesce(e.is_manager,false) and e.status is distinct from 'inactive'); $function$
;

CREATE OR REPLACE FUNCTION public.fn_hold_month_limit_end(p_today date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with m as (
    select ((date_trunc('month', p_today) + interval '1 month')::date - 1) as last_day
  ), lm as (
    -- 當月最後一個星期一：月底往回推到星期一（isodow：週一=1…週日=7）
    select last_day, last_day - ((extract(isodow from last_day)::int + 6) % 7) as last_monday from m
  )
  select case when p_today >= last_monday
              then ((date_trunc('month', p_today) + interval '2 month')::date - 1)   -- 含當天起開放下個月
              else last_day end
    from lm;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contract_hold_check(p_contract_id text, p_member_id text, p_type_id text, p_booking_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_r record;
  v_c record;
  v_type text;
  v_used int;
begin
  select r.* into v_r from ticket_grant_requests r where r.contract_id = p_contract_id for update;   -- 先鎖申請列
  if not found then return 'CONTRACT.NO_REQUEST'; end if;
  if v_r.status <> 'pending' then return 'CONTRACT.NOT_PENDING'; end if;
  select c.* into v_c from contracts c where c.id = p_contract_id;
  if not found then return 'CONTRACT.NOT_FOUND'; end if;
  if v_c.ticket_id is not null then return 'CONTRACT.ALREADY_ISSUED'; end if;
  if v_c.member_id is distinct from p_member_id or v_r.member_id is distinct from p_member_id then return 'CONTRACT.MEMBER_MISMATCH'; end if;
  v_type := coalesce(v_c.ticket_type_id, v_r.payload->'plan'->>'ticket_type_id');
  if v_type is null or v_type is distinct from p_type_id then return 'CONTRACT.TYPE_MISMATCH'; end if;
  if coalesce(v_c.sessions, 0) <= 0 then return 'CONTRACT.NO_SESSIONS'; end if;
  select count(*) into v_used from bookings b
   where b.contract_id = p_contract_id and b.status::text <> 'cancelled' and b.id is distinct from p_booking_id;
  if v_used + 1 > v_c.sessions then return 'CONTRACT.QUOTA_EXCEEDED'; end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_contract_hold_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old  record;
  v_have boolean := false;
  v_err  text;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;     -- 維運例外
  if new.contract_id is null then return new; end if;                                         -- 舊卡位與一般預約：完全不碰
  if new.status::text = 'cancelled' then return new; end if;                                  -- 取消不占額（也不取任何鎖）

  -- 是不是「已經占著額度的同一列」：UPDATE 看 old（含 ON CONFLICT 的 DO UPDATE 路徑，OLD＝既有列）；
  -- BEFORE INSERT 階段（可能是 upsert 的提議列）要查既有列
  if tg_op = 'UPDATE' then
    v_old := old; v_have := true;
  else
    select b.* into v_old from bookings b where b.id = new.id;
    v_have := found;
  end if;

  if v_have and v_old.contract_id is not distinct from new.contract_id and v_old.status::text <> 'cancelled' then
    -- 已占額的同一列：不重新占額、**不取申請列鎖**（避免「預約列→申請列」對取消連動「申請列→預約列」的死結）
    if coalesce(new.pending_contract, false) and new.ticket_id is null
       and (v_old.member_id is distinct from new.member_id or v_old.ticket_type_id is distinct from new.ticket_type_id) then
      raise exception 'CONTRACT.IDENTITY_LOCKED' using errcode = 'P0001';   -- 仍是卡位就不能改會員／票種（本來就一定 MISMATCH）
    end if;
    return new;      -- 改期／轉正（補 ticket_id、收掉 pending_contract，含已轉正後的改動）／改備註／upsert 重寫／重試
  end if;

  -- 新占額：新增、新綁或改綁 contract_id、或把已取消的復活。必須是「卡位」。
  if not coalesce(new.pending_contract, false) or new.ticket_id is not null then
    raise exception 'CONTRACT.NOT_A_HOLD' using errcode = 'P0001';
  end if;
  v_err := public.fn_contract_hold_check(new.contract_id, new.member_id, new.ticket_type_id, new.id);
  if v_err is not null then
    raise exception '%', v_err using errcode = 'P0001';
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_hold_month_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  raise exception 'HOLD.MONTH_LIMIT:%', to_char(v_end, 'YYYY-MM-DD')
    using errcode = 'P0001',
          hint = '沒有符合資格票券的卡位只能預約到 ' || to_char(v_end, 'YYYY/MM/DD') || '；每月最後一個星期一起開放下個月';
end
$function$
;

-- S3) 測試專用複本（不授權給任何角色；測試以資料庫擁有者執行）
-- ⚠ 與正式庫 benefit_refund 的差異（只會更嚴格；正式庫版本本身有這些缺口，另行回報、不在這裡修）：
--   ① 先鎖票券列（for update）——正式庫版本沒鎖，兩個並行呼叫可能都讀到淨額 1 而各退一次
--   ② p_qty 必須恰為 1（正式庫所有呼叫端都傳 1；null／0／負數／多於 1 會讓餘額變 null 或退超過扣的）
--   ③ 退完不得超過 sessions_total（正式庫版本沒有上限，帳不一致時餘額會大於總堂數）
--   ④ 找不到票券時回 skipped，不寫帳
-- 其餘邏輯（淨額＝扣課筆數－退課筆數、淨額 ≤ 0 不退、寫一筆 refund）與正式庫相同。
CREATE OR REPLACE FUNCTION public.zz_prod_benefit_refund(p_benefit_ref text, p_qty integer, p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_net integer; t member_tickets%rowtype;
begin
  if p_benefit_ref is null then return jsonb_build_object('ok',true); end if;
  if p_qty is null or p_qty <> 1 then return jsonb_build_object('ok',true,'skipped','bad_qty'); end if;

  select * into t from member_tickets where id = p_benefit_ref for update;
  if not found then return jsonb_build_object('ok',true,'skipped','no_ticket'); end if;

  select coalesce(sum(case when action='deduct' then 1 when action='refund' then -1 else 0 end),0)
    into v_net
  from ticket_logs
  where ticket_id = p_benefit_ref and booking_id = p_booking_id;

  if v_net < p_qty then
    return jsonb_build_object('ok',true,'skipped','no_deduct');
  end if;

  if coalesce(t.sessions_total,0) > 0 and coalesce(t.sessions_remaining,0) + p_qty > t.sessions_total then
    insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
    values (gen_short_id('LG-'), p_benefit_ref, 'adjust', 0, p_booking_id, 'system', '⚠ 已阻擋：退課會超過總堂數');
    return jsonb_build_object('ok',true,'skipped','over_total');
  end if;

  update member_tickets set sessions_remaining = coalesce(sessions_remaining,0) + p_qty
   where id = p_benefit_ref;
  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), p_benefit_ref, 'refund', p_qty, p_booking_id, 'system', '取消返還原票');
  return jsonb_build_object('ok',true);
end
$function$
;

CREATE OR REPLACE FUNCTION public.zz_prod_fn_cancel_booking(p_booking_id text, p_reason text DEFAULT NULL::text, p_refund boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  b bookings%rowtype;
  v_hours_before numeric;
  v_should_refund boolean;
  v_start_ts timestamptz;
  v_actor text;                 -- 'desk' | 'coach' | 'member'
  v_emp text;
  v_grace boolean;
  v_self_training boolean;
  v_legacy_group boolean;
  v_why text;
  v_ref jsonb;                  -- 測試專用修正：退款結果
  v_refund_done boolean := false;
  v_refund_skip text;
  v_dd integer;                 -- 這張票在這筆預約上的 deduct／refund 筆數（區分 no_deduct 的兩種情況）
  v_rf integer;
begin
  select * into b from bookings where id=p_booking_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;

  -- ── 判定身分 ──
  -- is_staff_desk() 對非員工回的是 NULL 不是 false，一律用 coalesce 收斂。
  if coalesce(is_staff_desk(), false) then
    v_actor := 'desk';
  elsif current_staff_role() is not null then
    v_actor := 'coach';
    v_emp := current_employee_id();
    if v_emp is null or b.coach_id is distinct from v_emp then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
    if b.category::text = '小班肌力' then
      return jsonb_build_object('ok',false,'error_code','GROUP.DESK_ONLY','actor','coach');
    end if;
  else
    v_actor := 'member';
    if current_member_id() is null or b.member_id is null or current_member_id() is distinct from b.member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  if b.status='cancelled' then return jsonb_build_object('ok',true,'already',true); end if;

  v_start_ts := ((b.date || ' ' || b.start_time)::timestamp at time zone 'Asia/Taipei');
  v_hours_before := extract(epoch from (v_start_ts - now()))/3600;
  v_grace := coalesce(b.created_at is not null and now() - b.created_at <= interval '10 minutes', false);
  -- ⚠ benefit_type 可能是 NULL，一定要 coalesce（0821 修過一次：NULL 會讓整條規則失效）
  v_self_training := coalesce(b.benefit_type = 'training_pass', false)
                     or coalesce(b.category::text = '自主訓練', false);
  v_legacy_group := coalesce(b.category::text = '小班肌力', false)
                    and coalesce(jsonb_array_length(coalesce(b.member_ids,'[]'::jsonb)), 0) = 0;

  -- ── 會員自助只限團課與自主訓練（2026-08-21）──
  if v_actor = 'member' and not v_self_training and not v_legacy_group then
    return jsonb_build_object('ok',false,'error_code','CANCEL.DESK_ONLY',
      'category', b.category::text, 'actor', v_actor);
  end if;

  -- ── 24 小時內不能自行取消：2026-08-21 起**只擋會員**（原本連教練一起擋）──
  -- 教練改時間本來就不受限，擋取消只是讓他多繞一步；櫃檯與管理員一向不受限。
  if v_actor = 'member' and v_hours_before < 24 and not v_grace and not v_self_training then
    return jsonb_build_object('ok',false,'error_code','CANCEL.TOO_LATE',
      'hours_before', round(v_hours_before,2), 'actor', v_actor);
  end if;

  if v_actor='desk' then
    v_should_refund := coalesce(p_refund, true);
    v_why := null;
  else
    v_should_refund := true;
    v_why := case
      when v_self_training then '（自主訓練，已退回 1 點）'
      when v_grace then '（預約後 10 分鐘內取消，已退回 1 堂）'
      else '（已退回 1 堂）' end;
  end if;

  /* 測試專用修正（與正式庫的差異）：正式庫忽略退款結果，退款被跳過仍會取消並回報 refunded。
     這裡改為：需要退款（desk 預設、或自助規則允許）而退款被「異常跳過」→ 整筆回滾（預約、票券、帳本都不變）並回
     REFUND.FAILED:<原因>，不會取消、不會回報 refunded；
     只有「沒綁票」或「已有扣課且已退回、淨額剛好 0」才照常取消並如實回報 no_refund_needed（綁票卻完全沒有扣課紀錄＝異常，見下方 no_deduct 分流）；
     原本允許的「不退款取消」（p_refund=false／會員 24 小時內不退等）完全不變，仍回 forfeited。 */
  if v_should_refund and b.ticket_id is not null then
    v_ref := zz_prod_benefit_refund(b.ticket_id, 1, b.id);
    v_refund_skip := v_ref->>'skipped';
    if v_ref is null or coalesce((v_ref->>'ok')::boolean, false) is not true then
      raise exception 'REFUND.FAILED:%', coalesce(v_refund_skip, 'unknown');
    elsif v_refund_skip is null then
      v_refund_done := true;
    elsif v_refund_skip = 'no_deduct' then
      /* no_deduct 有兩種完全不同的情況，必須分開：
         ① 已有扣課紀錄且已退回（deduct 至少 1 筆、淨額剛好 0）＝確實沒有需要退的 → 照常取消，回 no_refund_needed。
         ② 其餘（完全沒有扣課紀錄卻仍綁票、只有退課沒有扣課、退多於扣）＝帳不一致的異常 → 視為異常，整筆回滾、拒絕取消。
         ②不是「沒有需要退」：這張票可能其實從來沒扣過、或帳被改過，取消並放行會讓預約、票券、帳本三者對不起來。
         是否存在合法的歷史例外（例如匯入前的舊預約）由業務另行決定，這裡不自行開例外。 */
      select count(*) filter (where action::text = 'deduct'), count(*) filter (where action::text = 'refund')
        into v_dd, v_rf from ticket_logs where ticket_id = b.ticket_id and booking_id = b.id;
      if v_dd >= 1 and v_dd - v_rf = 0 then
        v_refund_done := false;
      else
        raise exception 'REFUND.FAILED:ledger_anomaly:deduct=%,refund=%', v_dd, v_rf;
      end if;
    else
      raise exception 'REFUND.FAILED:%', v_refund_skip;
    end if;
  end if;
  if v_should_refund and not v_refund_done then v_why := '（沒有需要退回的堂數）'; end if;

  update bookings set status='cancelled', cancelled_at=now(), refund_waived=(not v_should_refund),
    reward_status = case when reward_status='issued' then 'revoked' else reward_status end,
    makeup_status = case when not v_should_refund and b.benefit_type in ('coaching_session','friendly_session')
                         then 'eligible_pending' else 'not_requested' end
  where id=b.id;

  if v_actor='member' then
    perform desk_alert(b.member_id,'self_cancel','　自行取消了'||b.category::text,
      to_char(b.date,'MM/DD')||' '||b.start_time||'　'||b.category::text||coalesce(v_why,''));
  end if;

  return jsonb_build_object('ok',true,'booking_id',b.id,
    'cancellation_result', case when v_refund_done then 'refunded' when v_should_refund then 'no_refund_needed' else 'forfeited' end,
    'hours_before', round(v_hours_before,2),
    'refunded_ticket', case when v_refund_done then b.ticket_id else null end,
    'makeup','not_requested');
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm);
end
$function$
;

revoke all on function public.zz_prod_benefit_refund(text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.zz_prod_fn_cancel_booking(text, text, boolean) from public, anon, authenticated, service_role;

-- 事後自檢：五支函式的 md5 必須等於正式庫版本
do $post$
declare r record; v_oid oid;
begin
  -- 五支函式：依完整簽章核對 md5 等於正式庫版本、ACL 與同步前相同（create or replace 不得改變 ACL）、沒有多餘重載
  for r in select * from (values
    ('is_staff_desk()','46d2a4db99b29dd44bd667e91d32cbe3','{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_limit_end(date)','25e24e629d5d1ad0a865393cafbd621c','{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_check(text,text,text,text)','abfd7b86e0c97d39dbf979c9432909ed','{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_guard()','83e8d478609db46b91311ad8d148c230','{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_guard()','20399e1ec62751e958ae8c2a1d00064f','{postgres=X/postgres,service_role=X/postgres}')
  ) as t(sig, prod_md5, expected_acl) loop
    v_oid := to_regprocedure('public.' || r.sig);
    if v_oid is null then raise exception 'SYNC.POSTCHECK_FAILED: 找不到 %', r.sig; end if;
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = split_part(r.sig, '(', 1)) <> 1 then
      raise exception 'SYNC.POSTCHECK_FAILED: % 出現多個重載', split_part(r.sig, '(', 1);
    end if;
    if md5(pg_get_functiondef(v_oid)) <> r.prod_md5 then
      raise exception 'SYNC.POSTCHECK_FAILED: % 與正式庫版本不一致', r.sig;
    end if;
    if coalesce((select proacl::text from pg_proc where oid = v_oid), '') <> r.expected_acl then
      raise exception 'SYNC.POSTCHECK_FAILED: % 的 ACL 被改變', r.sig;
    end if;
  end loop;
  -- 兩支 zz 複本：存在、各只有一個、ACL 除擁有者外沒有任何人（沒有意外擴大）
  for r in select * from (values ('zz_prod_benefit_refund(text,integer,text)'), ('zz_prod_fn_cancel_booking(text,text,boolean)')) as t(sig) loop
    v_oid := to_regprocedure('public.' || r.sig);
    if v_oid is null then raise exception 'SYNC.POSTCHECK_FAILED: 找不到 %', r.sig; end if;
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = split_part(r.sig, '(', 1)) <> 1 then
      raise exception 'SYNC.POSTCHECK_FAILED: % 出現多個重載', split_part(r.sig, '(', 1);
    end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_oid and a.grantee <> p.proowner) then
      raise exception 'SYNC.POSTCHECK_FAILED: % 的 ACL 對擁有者以外的角色開放', r.sig;
    end if;
  end loop;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='bookings'
        and column_name in ('partner_id','no_show','coach_leave')) <> 3 then
    raise exception 'SYNC.POSTCHECK_FAILED: bookings 三個欄位沒有補齊'; end if;
end
$post$;

commit;
