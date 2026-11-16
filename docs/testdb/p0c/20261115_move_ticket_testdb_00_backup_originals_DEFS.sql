-- ═══════════════════════════════════════════════════════════════════════
-- 測試庫 kucvxpjatptfckhlxptj 同步前原始函式定義備份（完整、可執行）
-- 來源：2026-11-14 以 pg_get_functiondef 唯讀取得；每支都已用 md5＋長度與下表核對（腳本產生，未經人工轉貼）。
-- 用途：本檔就是備份；回復檔 ..._01_sync_ROLLBACK.sql 的 R2 與本檔的定義文字逐字相同（由同一份來源產生）。
-- 本檔「不要在同步前執行」——它只是存檔。執行它＝把五支函式還原成同步前的版本（寫入，需授權）。
-- 清單（同步前的測試庫現況）：
--   is_staff_desk            md5=bb43212eea2a8b0f0cd4d8bdebd71884  len=226  acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   fn_hold_month_limit_end  md5=a532478157a385c984e5f874ff71676d  len=565  acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   fn_contract_hold_check   md5=5b20a677bc7f1e9c0b89cb517717b25c  len=1411  acl={postgres=X/postgres,service_role=X/postgres}
--   fn_contract_hold_guard   md5=7fda39ead32176116ee06a1a54136ee1  len=1413  acl={postgres=X/postgres,service_role=X/postgres}
--   fn_hold_month_guard      md5=66dc9a52f65414f3a8dc2106cac5f424  len=3169  acl={postgres=X/postgres,service_role=X/postgres}
-- 注意：create or replace 不會改動 ACL；上列 acl 僅供核對。
-- ═══════════════════════════════════════════════════════════════════════
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

-- ▼ is_staff_desk
CREATE OR REPLACE FUNCTION public.is_staff_desk()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select current_staff_role() in ('admin','front_desk'); $function$
;

-- ▼ fn_hold_month_limit_end
CREATE OR REPLACE FUNCTION public.fn_hold_month_limit_end(p_today date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with m as (
    select ((date_trunc('month', p_today) + interval '1 month')::date - 1) as last_day
  ), lm as (
    select last_day, last_day - ((extract(isodow from last_day)::int + 6) % 7) as last_monday from m
  )
  select case when p_today >= last_monday
              then ((date_trunc('month', p_today) + interval '2 month')::date - 1)
              else last_day end
    from lm;
$function$
;

-- ▼ fn_contract_hold_check
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
  select r.* into v_r from ticket_grant_requests r where r.contract_id = p_contract_id for update;
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

-- ▼ fn_contract_hold_guard
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
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;
  if new.contract_id is null then return new; end if;
  if new.status::text = 'cancelled' then return new; end if;

  if tg_op = 'UPDATE' then
    v_old := old; v_have := true;
  else
    select b.* into v_old from bookings b where b.id = new.id;
    v_have := found;
  end if;

  if v_have and v_old.contract_id is not distinct from new.contract_id and v_old.status::text <> 'cancelled' then
    if coalesce(new.pending_contract, false) and new.ticket_id is null
       and (v_old.member_id is distinct from new.member_id or v_old.ticket_type_id is distinct from new.ticket_type_id) then
      raise exception 'CONTRACT.IDENTITY_LOCKED' using errcode = 'P0001';
    end if;
    return new;
  end if;

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

-- ▼ fn_hold_month_guard
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
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status::text = 'cancelled' or new.date is null then return new; end if;
  if not coalesce(new.pending_contract, false) or new.ticket_id is not null then return new; end if;
  if new.category::text = '自主訓練' then return new; end if;

  if tg_op = 'UPDATE' then
    v_old := old; v_have := true;
  else
    select b.* into v_old from bookings b where b.id = new.id;
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
  if new.date <= v_end then return new; end if;

  if new.contract_id is not null then
    if public.fn_contract_hold_check(new.contract_id, new.member_id, new.ticket_type_id, new.id) is null then
      return new;
    end if;
  end if;

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
