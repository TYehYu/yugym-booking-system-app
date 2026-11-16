-- ═══════════════════════════════════════════════════════════════════════
-- 回復 B（完整回復：已建立 P0-C RPC 之後）。尚未執行；⚠ 只能用在測試庫；DROP 與 drop column 需明確授權。
-- 順序（單一交易，任何一步失敗全部回滾）：
--   B0  移除 fn_move_booking_ticket(text,text,text)（先於一切——它引用 partner_id／coach_leave 等欄位與守門函式），並確認沒有其他同名重載殘留（有就中止）
--   B1  之後與「回復 A」完全相同：R3 刪 zz 複本 → R2 五支函式依完整簽章還原並核對 → R1 條件式刪三欄
-- 相依物件不會阻擋回復：
--   • RPC 與 zz 複本都是 plpgsql，不被其他資料庫物件依賴；函式內對欄位的引用不是資料庫相依（所以必須先移除 RPC，否則 RPC 會變成執行期錯誤）。
--   • 五支函式只被 2 個觸發器與 29 條 RLS 政策引用，create or replace 保留 OID，不受影響。
--   • 三個欄位：R1 會先檢查有無檢視／政策／索引／約束依賴與非空資料；有就中止並說明，不 CASCADE。
--     真實 RPC 測試的夾具資料（MVR- 前綴）請先用 move_ticket_06_rpc_cleanup.sql 清除，否則欄位可能含非空資料而中止。
-- 若只想移除 RPC、保留同步結果：只執行本檔 B0 那一行即可（另行授權）。
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

-- B0：移除預期的 RPC，之後確認沒有任何其他同名重載殘留（有就中止並列出簽章，不自動 DROP 未知重載）
drop function if exists public.fn_move_booking_ticket(text, text, text);
do $b0check$
declare v_left text;
begin
  select string_agg(p.oid::regprocedure::text, '、') into v_left
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_move_booking_ticket';
  if v_left is not null then
    raise exception 'ROLLBACK.ABORT: 移除預期 RPC 後仍有同名重載殘留：%（請先審查再另行授權移除）', v_left;
  end if;
end
$b0check$;

-- R3
drop function if exists public.zz_prod_fn_cancel_booking(text, text, boolean);
drop function if exists public.zz_prod_benefit_refund(text, integer, text);

-- R2
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

do $r2check$
declare r record; v_oid oid;
begin
  for r in select * from (values
    ('is_staff_desk()','bb43212eea2a8b0f0cd4d8bdebd71884',226,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_limit_end(date)','a532478157a385c984e5f874ff71676d',565,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_check(text,text,text,text)','5b20a677bc7f1e9c0b89cb517717b25c',1411,'{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_guard()','7fda39ead32176116ee06a1a54136ee1',1413,'{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_guard()','66dc9a52f65414f3a8dc2106cac5f424',3169,'{postgres=X/postgres,service_role=X/postgres}')
  ) as t(sig, md5, len, acl) loop
    v_oid := to_regprocedure('public.' || r.sig);
    if v_oid is null then raise exception 'ROLLBACK.POSTCHECK_FAILED: 找不到 %', r.sig; end if;
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = split_part(r.sig, '(', 1)) <> 1 then
      raise exception 'ROLLBACK.POSTCHECK_FAILED: % 出現多個重載', split_part(r.sig, '(', 1);
    end if;
    if md5(pg_get_functiondef(v_oid)) <> r.md5 or length(pg_get_functiondef(v_oid)) <> r.len then
      raise exception 'ROLLBACK.POSTCHECK_FAILED: % 還原後 md5／長度與同步前不符', r.sig;
    end if;
    if coalesce((select proacl::text from pg_proc where oid = v_oid), '') <> r.acl then
      raise exception 'ROLLBACK.POSTCHECK_FAILED: % ACL 與同步前不符', r.sig;
    end if;
  end loop;
end
$r2check$;

-- R1：只刪除同步腳本新增並加了標記註解的欄位；有任何相依物件或非空資料就中止（不 CASCADE、不靜默丟索引或資料）
do $r1$
declare c text; v_attnum smallint; v_n bigint;
begin
  foreach c in array array['partner_id','no_show','coach_leave'] loop
    select a.attnum into v_attnum from pg_attribute a
     where a.attrelid = 'public.bookings'::regclass and a.attname = c and not a.attisdropped
       and col_description('public.bookings'::regclass, a.attnum) = 'P0C-SYNC-20261115 added-by-01_sync';
    if v_attnum is null then
      raise notice 'R1: % 沒有同步標記（原本就存在，或本次未新增），不動', c;
      continue;
    end if;
    if exists (select 1 from pg_depend d where d.refclassid = 'pg_class'::regclass and d.refobjid = 'public.bookings'::regclass
                  and d.refobjsubid = v_attnum and d.deptype in ('n', 'a')) then
      raise exception 'ROLLBACK.ABORT: 欄位 % 有其他物件依賴（檢視／政策／索引／約束），請先處理，本腳本不使用 CASCADE', c;
    end if;
    execute format('select count(*) from public.bookings where %I is not null', c) into v_n;
    if v_n > 0 then
      raise exception 'ROLLBACK.ABORT: 欄位 % 已有 % 筆非空資料，刪欄位會丟資料；請先確認（測試夾具需先用清理檔清掉）', c, v_n;
    end if;
    execute format('alter table public.bookings drop column %I', c);
    raise notice 'R1: dropped %', c;
  end loop;
end
$r1$;

commit;
