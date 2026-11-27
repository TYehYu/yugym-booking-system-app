-- 測試庫專用（kucvxpjatptfckhlxptj；內含叢集守門，在別的庫會直接中止）。整支在同一個交易：套用檔（含套用後指紋判定）→ 夾具與 T1~T13、F1~F8、U1~U2、R1~R4、N1~N6 → 回復檔 → T14，
-- 最後以 TEST_OK_ROLLBACK 例外回滾，零留存。看到 'TEST_OK_ROLLBACK: T1 PASS; ... T14 PASS' 即全過；任何 TEST_FAIL／TARGET.GUARD／PRE.*／POST.* 都是失敗。
-- 併發（兩條連線搶最後一次）無法在單一連線測，見 00_HANDOFF 第 4 節 B。
begin;
-- ═══ 抽獎登記／更正原子化：套用（測試庫 kucvxpjatptfckhlxptj）═══
-- 單一交易；任何守門不符就整支中止、零變更。前置狀態必須是「完全沒裝過」（6 支函式與 3 個觸發器都不存在）。
-- 重裝請先執行 03_rollback_TESTDB.sql。內容與 docs/migrations/20261126_fn_lottery_award.sql 相同。
do $pre$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TARGET.GUARD 這支檔案只能在 測試庫 kucvxpjatptfckhlxptj 執行（目前叢集識別不符），已中止，沒有任何變更';
  end if;
  if exists (select 1 from pg_trigger where tgname like 'trg_lottery_gate%' and not tgisinternal) or to_regprocedure('public.fn_lottery_prize(text)') is not null or to_regprocedure('public.fn_lottery_award(text,text,text)') is not null or to_regprocedure('public.fn_lottery_fix(text,text,text)') is not null or to_regprocedure('public.fn_lottery_gate_tk()') is not null or to_regprocedure('public.fn_lottery_gate_log()') is not null or to_regprocedure('public.fn_lottery_gate_pu()') is not null then
    raise exception 'PRE.ALREADY_PRESENT 已有抽獎函式或觸發器，這支只用於全新安裝；請先執行回復檔';
  end if;
  if to_regclass('public.lottery_ops') is not null and (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'lottery_ops')
       is distinct from 'op_id:text,kind:text,member_id:text,purchase_id:text,prize_key:text,result:jsonb,created_by:text,created_at:timestamp with time zone' then
    raise exception 'PRE.EVIDENCE_MISMATCH lottery_ops 已存在但欄位不符，拒絕套用';
  end if;
  if to_regclass('public.purchases') is null or to_regclass('public.member_tickets') is null or to_regclass('public.ticket_logs') is null
     or to_regclass('public.bookings') is null or to_regclass('public.members') is null or to_regclass('public.employees') is null
     or to_regclass('public.ticket_types') is null
     or to_regprocedure('public.current_employee_id()') is null or to_regprocedure('public.is_staff_desk()') is null
     or to_regprocedure('public.current_staff_role()') is null or to_regprocedure('public.gen_short_id(text)') is null then
    raise exception 'PRE.MISSING 缺少必要資料表或輔助函式';
  end if;
end $pre$;


-- ══ 操作紀錄（證據）：防重送的依據。受保護、只增不改不刪，回復檔不會移除它。══
--   舊版把防重送標記放在 purchases.note（可被一般備註修改抹掉）。改記在這張專用表：
--   只有 SECURITY DEFINER 的 fn_lottery_award／fn_lottery_fix 能寫入（authenticated／service_role 都只有 select，沒有 insert／update／delete／truncate），
--   且有「不准 update／delete／truncate」的觸發器（連資料庫管理者的一般 SQL 也擋）。
--   新建資料表依專案規矩：建表 → 開 RLS → GRANT → policy（authenticated 只能讀，且限櫃台層級）。
create table if not exists public.lottery_ops (
  op_id text primary key,
  kind text not null check (kind in ('award','fix')),
  member_id text not null,
  purchase_id text not null,
  prize_key text not null,
  result jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.lottery_ops enable row level security;
revoke all on public.lottery_ops from public, anon, authenticated, service_role;
grant select on public.lottery_ops to authenticated;
grant select on public.lottery_ops to service_role;
drop policy if exists lottery_ops_staff_read on public.lottery_ops;
create policy lottery_ops_staff_read on public.lottery_ops for select to authenticated using (is_staff_desk());
create or replace function public.fn_lottery_ops_guard() returns trigger language plpgsql as $og$
begin
  raise exception 'LOTTERY.OPS_IMMUTABLE 抽獎操作紀錄是證據，不可修改、刪除或清空';
end $og$;
revoke all on function public.fn_lottery_ops_guard() from public, anon, authenticated, service_role;
drop trigger if exists trg_lottery_ops_immutable on public.lottery_ops;
create trigger trg_lottery_ops_immutable before update or delete on public.lottery_ops for each row execute function public.fn_lottery_ops_guard();
drop trigger if exists trg_lottery_ops_notruncate on public.lottery_ops;
create trigger trg_lottery_ops_notruncate before truncate on public.lottery_ops for each statement execute function public.fn_lottery_ops_guard();

-- 獎品表（與前端 LOTTO_PRIZES 同步；label 是寫進 purchases.plan_name 的字，不可改）。純函式，只供下面兩支內部使用。
create function public.fn_lottery_prize(p_key text) returns jsonb
language sql immutable
as $pz$
  select case p_key
    when 'ball'    then jsonb_build_object('label','筋膜球','kind','goods')
    when 'ms300'   then jsonb_build_object('label','運動按摩折抵300','kind','voucher','ttid','tt-discount-ms300','plan','運動按摩折抵券 $300')
    when 'pt300'   then jsonb_build_object('label','教練課折抵300','kind','voucher','ttid','tt-discount-pt300','plan','教練課折抵券 $300')
    when 'ms'      then jsonb_build_object('label','運動按摩','kind','session','cat','運動按摩')
    when 'pt'      then jsonb_build_object('label','教練課','kind','session','cat','私人教練')
    when 'protein' then jsonb_build_object('label','蛋白粉','kind','goods')
    else null end
$pz$;

create function public.fn_lottery_award(p_member_id text, p_prize_key text, p_op_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  v_emp text; v_est text; v_prize jsonb; v_label text; v_kind text; v_ttid text; v_plan text; v_cat text;
  v_earned integer; v_used integer; v_tk text; v_mj jsonb; v_op lottery_ops%rowtype; v_res jsonb;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_ym text := to_char((now() at time zone 'Asia/Taipei')::date, 'YYYY-MM');
begin
  perform set_config('lock_timeout', '3000', true);
  if coalesce(p_member_id,'') = '' or coalesce(p_prize_key,'') = '' or coalesce(p_op_id,'') = '' then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.BAD_ARGS'); end if;
  v_emp := current_employee_id();
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  v_prize := public.fn_lottery_prize(p_prize_key);
  if v_prize is null then return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.BAD_PRIZE'); end if;
  v_label := v_prize->>'label'; v_kind := v_prize->>'kind'; v_ttid := v_prize->>'ttid'; v_plan := v_prize->>'plan'; v_cat := v_prize->>'cat';
  perform 1 from members where id = p_member_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.NO_MEMBER'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lotop:' || p_op_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('lottery:' || p_member_id, 0));
  select status into v_est from employees where id = v_emp;
  if not found or coalesce(v_est,'') in ('inactive','resigned') or not coalesce(is_staff_desk(), false) then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  select to_jsonb(m) into v_mj from members m where m.id = p_member_id;
  if v_mj is null then return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.NO_MEMBER'); end if;
  select * into v_op from lottery_ops where op_id = p_op_id;
  if found then
    if v_op.kind = 'award' and v_op.member_id = p_member_id and v_op.prize_key = p_prize_key then
      return v_op.result || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.OP_CONFLICT');
  end if;
  if exists (select 1 from purchases where id = p_op_id) then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.OP_CONFLICT'); end if;
  if (v_mj->>'tier_manual') = 'vip' or (v_mj->>'level') = 'vip' then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.VIP_EXCLUDED'); end if;
  select coalesce(sum(n / 4), 0)::int into v_earned from (
    select count(*)::int n from bookings
     where member_id = p_member_id and category::text = '私人教練'
       and status::text in ('checked_in','completed')
       and date >= date '2026-07-01' and to_char(date, 'YYYY-MM') <= v_ym
     group by to_char(date, 'YYYY-MM')) m;
  select count(*)::int into v_used from purchases
   where member_id = p_member_id and source = 'lottery'
     and coalesce(to_char(created_at at time zone 'Asia/Taipei', 'YYYY-MM'), '') <= v_ym;
  if v_earned - v_used <= 0 then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.NO_QUOTA', 'earned', v_earned, 'used', v_used); end if;
  if v_kind = 'session' then
    select id into v_ttid from ticket_types
     where category::text = v_cat and name !~ '友善|VIP|限定' and active is not false order by id limit 1;
    if v_ttid is null then
      select id into v_ttid from ticket_types where category::text = v_cat order by id limit 1; end if;
    v_plan := '抽獎－' || v_label || ' 1 堂';
  end if;
  if v_kind <> 'goods' and (v_ttid is null or not exists(select 1 from ticket_types where id = v_ttid)) then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.NO_TICKET_TYPE'); end if;
  perform set_config('app.lottery_rpc', '1', true);
  if v_kind <> 'goods' then
    v_tk := 'TK-' || p_op_id;
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, source, unit_price, amount_paid, purchase_date,
                               start_date, expire_date, sessions_total, sessions_remaining, status, created_at)
    values (v_tk, p_member_id, v_ttid, v_plan, 'lottery', 0, 0, v_today, v_today, null, 1, 1, 'usable', now());
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), v_tk, 'grant', 1, null, v_emp, '現場抽獎－' || v_label);
  end if;
  insert into purchases(id, member_id, plan_name, deal_amount, payment_method, source, operator, note, created_at)
  values (p_op_id, p_member_id, '抽獎：' || v_label, 0, null, 'lottery', v_emp, '現場籤筒抽獎登記', now());
  v_res := jsonb_build_object('ok', true, 'replayed', false, 'purchase_id', p_op_id, 'ticket_id', v_tk, 'earned', v_earned, 'used_after', v_used + 1);
  insert into lottery_ops(op_id, kind, member_id, purchase_id, prize_key, result, created_by)
  values (p_op_id, 'award', p_member_id, p_op_id, p_prize_key, v_res, v_emp);
  perform set_config('app.lottery_rpc', '', true);
  return v_res;
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.BUSY');
end
$fn$;

-- 改抽獎項目（取代前端 _lottoFixDo 的「刪舊票／刪舊帳 → 發新票 → 改登記」多段寫入）。
--   單一交易：核對原登記（存在、source=lottery、屬於該會員）→ 核對原票（只認 id＝'TK-'||登記 id 的精確對應，沒有就拒絕，絕不用時間相近去猜）
--   → 原票必須從沒被用過（餘額＝總堂數、狀態 usable、帳本只有 grant、沒有任何未取消的預約掛著）→ 才刪舊票與帳、發新票（id 固定為 'TK-'||登記 id，下次更正還能精確對應）、改登記並留更正紀錄。
--   任何一步失敗整筆回滾（舊票與帳不會被刪掉）。冪等：op_id 記在受保護的 lottery_ops（只增不改不刪；舊操作重送只回當初結果，不會覆蓋後續更正；同識別不同參數回 OP_CONFLICT）。
--   權限同前端 lottoFixAllow：櫃台層級當天登記可改；管理員任何日期可改。
create function public.fn_lottery_fix(p_purchase_id text, p_prize_key text, p_op_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $fx$
declare
  v_emp text; v_est text; v_ename text; v_prize jsonb; v_oprize jsonb; v_k text;
  v_label text; v_kind text; v_ttid text; v_plan text; v_cat text; v_mid text;
  v_pu purchases%rowtype; v_cur text; v_old member_tickets%rowtype; v_have_old boolean := false;
  v_tk text; v_admin boolean; v_op lottery_ops%rowtype; v_res jsonb;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  perform set_config('lock_timeout', '3000', true);
  if coalesce(p_purchase_id,'') = '' or coalesce(p_prize_key,'') = '' or coalesce(p_op_id,'') = '' then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.BAD_ARGS'); end if;
  v_emp := current_employee_id();
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  v_prize := public.fn_lottery_prize(p_prize_key);
  if v_prize is null then return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.BAD_PRIZE'); end if;
  v_label := v_prize->>'label'; v_kind := v_prize->>'kind'; v_ttid := v_prize->>'ttid'; v_plan := v_prize->>'plan'; v_cat := v_prize->>'cat';
  perform pg_advisory_xact_lock(hashtextextended('lotop:' || p_op_id, 0));
  select * into v_op from lottery_ops where op_id = p_op_id;
  if found then
    v_mid := v_op.member_id;
  else
    select * into v_pu from purchases where id = p_purchase_id;
    if not found or v_pu.source is distinct from 'lottery' or v_pu.member_id is null then
      return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.FIX_NO_PURCHASE'); end if;
    v_mid := v_pu.member_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lottery:' || v_mid, 0));
  select status, name into v_est, v_ename from employees where id = v_emp;
  if not found or coalesce(v_est,'') in ('inactive','resigned') or not coalesce(is_staff_desk(), false) then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  v_admin := coalesce(current_staff_role()::text, '') = 'admin';
  select * into v_op from lottery_ops where op_id = p_op_id;
  if found then
    if v_op.kind = 'fix' and v_op.purchase_id = p_purchase_id and v_op.prize_key = p_prize_key then
      return v_op.result || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.OP_CONFLICT');
  end if;
  select * into v_pu from purchases where id = p_purchase_id for update;
  if not found or v_pu.source is distinct from 'lottery' or v_pu.member_id is distinct from v_mid then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.FIX_NO_PURCHASE'); end if;
  if not v_admin and (v_pu.created_at at time zone 'Asia/Taipei')::date is distinct from v_today then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.FIX_DATE_LOCKED'); end if;
  v_cur := regexp_replace(coalesce(v_pu.plan_name, ''), '^抽獎[：:]', '');
  if v_cur = v_label then
    v_res := jsonb_build_object('ok', true, 'replayed', false, 'no_change', true, 'purchase_id', v_pu.id);
    insert into lottery_ops(op_id, kind, member_id, purchase_id, prize_key, result, created_by)
    values (p_op_id, 'fix', v_pu.member_id, v_pu.id, p_prize_key, v_res, v_emp);
    return v_res;
  end if;
  foreach v_k in array array['ball','ms300','pt300','ms','pt','protein'] loop
    if public.fn_lottery_prize(v_k)->>'label' = v_cur then v_oprize := public.fn_lottery_prize(v_k); end if;
  end loop;
  if v_oprize is null then return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.FIX_UNKNOWN_ORIGINAL'); end if;
  if v_oprize->>'kind' <> 'goods' then
    select * into v_old from member_tickets where id = 'TK-' || v_pu.id for update;
    if not found then return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.FIX_NO_ORIGINAL_TICKET'); end if;
    v_have_old := true;
    if v_old.member_id is distinct from v_pu.member_id or v_old.source is distinct from 'lottery' then
      return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.FIX_NO_ORIGINAL_TICKET'); end if;
    if v_old.status::text <> 'usable' or coalesce(v_old.sessions_remaining, 0) <> coalesce(v_old.sessions_total, 0)
       or exists (select 1 from ticket_logs where ticket_id = v_old.id and action::text <> 'grant')
       or exists (select 1 from bookings where ticket_id = v_old.id and status::text <> 'cancelled') then
      return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.FIX_TICKET_USED'); end if;
  end if;
  if v_kind = 'session' then
    select id into v_ttid from ticket_types
     where category::text = v_cat and name !~ '友善|VIP|限定' and active is not false order by id limit 1;
    if v_ttid is null then
      select id into v_ttid from ticket_types where category::text = v_cat order by id limit 1; end if;
    v_plan := '抽獎－' || v_label || ' 1 堂';
  end if;
  if v_kind <> 'goods' and (v_ttid is null or not exists(select 1 from ticket_types where id = v_ttid)) then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.NO_TICKET_TYPE'); end if;
  perform set_config('app.lottery_rpc', '1', true);
  if v_have_old then
    delete from ticket_logs where ticket_id = v_old.id;
    delete from member_tickets where id = v_old.id;
  end if;
  if v_kind <> 'goods' then
    v_tk := 'TK-' || v_pu.id;
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, source, unit_price, amount_paid, purchase_date,
                               start_date, expire_date, sessions_total, sessions_remaining, status, created_at)
    values (v_tk, v_pu.member_id, v_ttid, v_plan, 'lottery', 0, 0, v_today, v_today, null, 1, 1, 'usable', now());
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), v_tk, 'grant', 1, null, v_emp, '現場抽獎－' || v_label || '（更正自「' || v_cur || '」）');
  end if;
  update purchases set plan_name = '抽獎：' || v_label,
         note = coalesce(note || E'\n', '') || v_today::text || ' 更正抽獎項目：' || v_cur || ' → ' || v_label
                || '（' || coalesce(v_ename, v_emp) || '）'
   where id = v_pu.id;
  v_res := jsonb_build_object('ok', true, 'replayed', false, 'purchase_id', v_pu.id, 'ticket_id', v_tk, 'removed_ticket', case when v_have_old then v_old.id end);
  insert into lottery_ops(op_id, kind, member_id, purchase_id, prize_key, result, created_by)
  values (p_op_id, 'fix', v_pu.member_id, v_pu.id, p_prize_key, v_res, v_emp);
  perform set_config('app.lottery_rpc', '', true);
  return v_res;
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'LOTTERY.BUSY');
end
$fx$;

-- 舊頁面（沒更新、仍走前端直接寫表）的安全阻擋：在「第一個寫入」就拒絕，不會先發票／先刪票後才擋。
--   舊的「登記」流程第一個寫入：票券類＝member_tickets 新增（source='lottery'）；實體贈品＝purchases 新增（source='lottery'）。
--   舊的「改抽獎項目」流程第一個寫入：刪 ticket_logs（抽獎票的帳）→ 刪 member_tickets；刪不掉時會退回「把票改成 refunded」→ 這兩條路也都擋。
--   一律不擋：① 走 fn_lottery_award／fn_lottery_fix（交易內旗標 app.lottery_rpc=1）② 該列 id 已存在的 purchases／member_tickets upsert（但 purchases 的抽獎列若改了獎項 plan_name／歸屬 member_id／來源 source 仍會擋，只有備註等其他欄位可改）。
--   前端不能自行用任何欄位值繞過（不再有 lottery_fix 之類的放行標記）。不動任何表的 GRANT／RLS。
create function public.fn_lottery_gate_tk() returns trigger language plpgsql as $g$
declare v_flag boolean := coalesce(current_setting('app.lottery_rpc', true), '') = '1';
begin
  if v_flag then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.source = 'lottery' and not exists (select 1 from public.member_tickets where id = new.id) then
      raise exception 'LOTTERY.CLIENT_OUTDATED 抽獎登記已升級，請重新整理頁面更新到最新版後再登記（這次沒有發出任何獎品）';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.source = 'lottery' and new.status::text = 'refunded' and old.status::text <> 'refunded' then
      raise exception 'LOTTERY.CLIENT_OUTDATED 抽獎更正已升級，請重新整理頁面更新到最新版後再更正（這次沒有改動任何票券）';
    end if;
    return new;
  else
    if old.source = 'lottery' then
      raise exception 'LOTTERY.CLIENT_OUTDATED 抽獎更正已升級，請重新整理頁面更新到最新版後再更正（這次沒有刪除任何票券）';
    end if;
    return old;
  end if;
end $g$;
create function public.fn_lottery_gate_log() returns trigger language plpgsql as $g$
begin
  if coalesce(current_setting('app.lottery_rpc', true), '') <> '1'
     and exists (select 1 from public.member_tickets where id = old.ticket_id and source = 'lottery') then
    raise exception 'LOTTERY.CLIENT_OUTDATED 抽獎更正已升級，請重新整理頁面更新到最新版後再更正（這次沒有刪除任何帳本）';
  end if;
  return old;
end $g$;
create function public.fn_lottery_gate_pu() returns trigger language plpgsql as $g$
begin
  if coalesce(current_setting('app.lottery_rpc', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.source = 'lottery' and not exists (select 1 from public.purchases where id = new.id) then
      raise exception 'LOTTERY.CLIENT_OUTDATED 抽獎登記已升級，請重新整理頁面更新到最新版後再登記（這次沒有登記任何東西）';
    end if;
  elsif old.source = 'lottery' or new.source = 'lottery' then
    if new.plan_name is distinct from old.plan_name or new.member_id is distinct from old.member_id or new.source is distinct from old.source then
      raise exception 'LOTTERY.CLIENT_OUTDATED 抽獎更正已升級，請重新整理頁面更新到最新版後再更正（這次沒有改動任何登記）';
    end if;
  end if;
  return new;
end $g$;
create trigger trg_lottery_gate_tk before insert or update or delete on public.member_tickets for each row execute function public.fn_lottery_gate_tk();
create trigger trg_lottery_gate_log before delete on public.ticket_logs for each row execute function public.fn_lottery_gate_log();
create trigger trg_lottery_gate_pu before insert or update on public.purchases for each row execute function public.fn_lottery_gate_pu();

revoke all on function public.fn_lottery_prize(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_lottery_award(text, text, text) from public, anon, service_role;
grant execute on function public.fn_lottery_award(text, text, text) to authenticated;
revoke all on function public.fn_lottery_fix(text, text, text) from public, anon, service_role;
grant execute on function public.fn_lottery_fix(text, text, text) to authenticated;
revoke all on function public.fn_lottery_gate_tk() from public, anon, authenticated, service_role;
revoke all on function public.fn_lottery_gate_log() from public, anon, authenticated, service_role;
revoke all on function public.fn_lottery_gate_pu() from public, anon, authenticated, service_role;

do $post$
declare v_src text; v_def boolean; v_cfg text[]; v_acl text; v_bad text := '';
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TARGET.GUARD 這支檔案只能在 測試庫 kucvxpjatptfckhlxptj 執行（目前叢集識別不符），已中止，沒有任何變更';
  end if;
  v_bad := '';
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_ops_guard()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_ops_guard 不存在; ';
  else
    if md5(v_src) <> '480437aadc1516648ab1e92825eb3241' then v_bad := v_bad || 'fn_lottery_ops_guard 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_ops_guard ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_ops_guard 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_prize(text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_prize 不存在; ';
  else
    if md5(v_src) <> '48e06027c5fd333b74e1609f7dbb4bec' then v_bad := v_bad || 'fn_lottery_prize 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_prize ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_prize 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_award(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_award 不存在; ';
  else
    if md5(v_src) <> 'b4a92cafedfafaf0b20f266dd4943d48' then v_bad := v_bad || 'fn_lottery_award 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_award ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_award 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_award search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_fix(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_fix 不存在; ';
  else
    if md5(v_src) <> 'bb9a984c6ec2fad841e9022e31aa1e7e' then v_bad := v_bad || 'fn_lottery_fix 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_fix ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_fix 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_fix search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_tk()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_tk 不存在; ';
  else
    if md5(v_src) <> '1f9014a25d335ed23641f88e846b2406' then v_bad := v_bad || 'fn_lottery_gate_tk 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_tk ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_tk 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_log()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_log 不存在; ';
  else
    if md5(v_src) <> '17bcc2ecde655864a1870fec523feb24' then v_bad := v_bad || 'fn_lottery_gate_log 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_log ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_log 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_pu()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_pu 不存在; ';
  else
    if md5(v_src) <> 'fad961b2da0167c86b71d2adceed4582' then v_bad := v_bad || 'fn_lottery_gate_pu 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_pu ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_pu 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_tk' and not g.tgisinternal and g.tgrelid = 'public.member_tickets'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_tk()') and g.tgtype = 31 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_tk 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_log' and not g.tgisinternal and g.tgrelid = 'public.ticket_logs'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_log()') and g.tgtype = 11 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_log 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_pu' and not g.tgisinternal and g.tgrelid = 'public.purchases'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_pu()') and g.tgtype = 23 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_pu 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_immutable' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 27 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_immutable 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_notruncate' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 34 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_notruncate 不存在或不是預期的定義; '; end if;
  if to_regclass('public.lottery_ops') is null then v_bad := v_bad || 'lottery_ops 表不存在; ';
  else
    if (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'lottery_ops')
       is distinct from 'op_id:text,kind:text,member_id:text,purchase_id:text,prize_key:text,result:jsonb,created_by:text,created_at:timestamp with time zone' then
      v_bad := v_bad || 'lottery_ops 欄位不符; '; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = 'public.lottery_ops'::regclass) then v_bad := v_bad || 'lottery_ops 未開 RLS; '; end if;
    if not has_table_privilege('authenticated', 'public.lottery_ops', 'select') then v_bad := v_bad || 'authenticated 缺 select; '; end if;
    if has_table_privilege('authenticated', 'public.lottery_ops', 'insert,update,delete,truncate') or has_table_privilege('service_role', 'public.lottery_ops', 'insert,update,delete,truncate')
       or has_table_privilege('anon', 'public.lottery_ops', 'select,insert,update,delete,truncate') then v_bad := v_bad || 'lottery_ops 權限過寬（只能 select）; '; end if;
    if (select count(*) from pg_policy where polrelid = 'public.lottery_ops'::regclass) <> 1
       or not exists (select 1 from pg_policy p where p.polrelid = 'public.lottery_ops'::regclass and p.polname = 'lottery_ops_staff_read'
                        and p.polcmd = 'r' and p.polpermissive
                        and p.polroles = array[(select r.oid from pg_roles r where r.rolname = 'authenticated')]::oid[]
                        and pg_get_expr(p.polqual, p.polrelid) = 'is_staff_desk()' and p.polwithcheck is null) then
      v_bad := v_bad || 'lottery_ops policy 不符（需精確：僅 authenticated、僅 SELECT、USING is_staff_desk()、無 WITH CHECK、permissive）; '; end if;
  end if;
  if (select count(*) from pg_trigger g where g.tgname like 'trg_lottery_gate%' and not g.tgisinternal) <> 3 then
    v_bad := v_bad || '出現預期以外的 trg_lottery_gate* 觸發器; '; end if;
  if v_bad <> '' then raise exception 'POST.CHECK 套用後驗證失敗，整筆回滾：%', v_bad; end if;
end $post$;
create function pg_temp.lt_check() returns text language plpgsql as $c$
declare v_src text; v_def boolean; v_cfg text[]; v_acl text; v_bad text := '';
begin
  v_bad := '';
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_ops_guard()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_ops_guard 不存在; ';
  else
    if md5(v_src) <> '480437aadc1516648ab1e92825eb3241' then v_bad := v_bad || 'fn_lottery_ops_guard 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_ops_guard ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_ops_guard 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_prize(text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_prize 不存在; ';
  else
    if md5(v_src) <> '48e06027c5fd333b74e1609f7dbb4bec' then v_bad := v_bad || 'fn_lottery_prize 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_prize ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_prize 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_award(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_award 不存在; ';
  else
    if md5(v_src) <> 'b4a92cafedfafaf0b20f266dd4943d48' then v_bad := v_bad || 'fn_lottery_award 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_award ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_award 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_award search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_fix(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_fix 不存在; ';
  else
    if md5(v_src) <> 'bb9a984c6ec2fad841e9022e31aa1e7e' then v_bad := v_bad || 'fn_lottery_fix 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_fix ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_fix 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_fix search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_tk()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_tk 不存在; ';
  else
    if md5(v_src) <> '1f9014a25d335ed23641f88e846b2406' then v_bad := v_bad || 'fn_lottery_gate_tk 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_tk ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_tk 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_log()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_log 不存在; ';
  else
    if md5(v_src) <> '17bcc2ecde655864a1870fec523feb24' then v_bad := v_bad || 'fn_lottery_gate_log 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_log ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_log 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_pu()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_pu 不存在; ';
  else
    if md5(v_src) <> 'fad961b2da0167c86b71d2adceed4582' then v_bad := v_bad || 'fn_lottery_gate_pu 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_pu ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_pu 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_tk' and not g.tgisinternal and g.tgrelid = 'public.member_tickets'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_tk()') and g.tgtype = 31 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_tk 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_log' and not g.tgisinternal and g.tgrelid = 'public.ticket_logs'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_log()') and g.tgtype = 11 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_log 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_pu' and not g.tgisinternal and g.tgrelid = 'public.purchases'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_pu()') and g.tgtype = 23 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_pu 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_immutable' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 27 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_immutable 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_notruncate' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 34 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_notruncate 不存在或不是預期的定義; '; end if;
  if to_regclass('public.lottery_ops') is null then v_bad := v_bad || 'lottery_ops 表不存在; ';
  else
    if (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'lottery_ops')
       is distinct from 'op_id:text,kind:text,member_id:text,purchase_id:text,prize_key:text,result:jsonb,created_by:text,created_at:timestamp with time zone' then
      v_bad := v_bad || 'lottery_ops 欄位不符; '; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = 'public.lottery_ops'::regclass) then v_bad := v_bad || 'lottery_ops 未開 RLS; '; end if;
    if not has_table_privilege('authenticated', 'public.lottery_ops', 'select') then v_bad := v_bad || 'authenticated 缺 select; '; end if;
    if has_table_privilege('authenticated', 'public.lottery_ops', 'insert,update,delete,truncate') or has_table_privilege('service_role', 'public.lottery_ops', 'insert,update,delete,truncate')
       or has_table_privilege('anon', 'public.lottery_ops', 'select,insert,update,delete,truncate') then v_bad := v_bad || 'lottery_ops 權限過寬（只能 select）; '; end if;
    if (select count(*) from pg_policy where polrelid = 'public.lottery_ops'::regclass) <> 1
       or not exists (select 1 from pg_policy p where p.polrelid = 'public.lottery_ops'::regclass and p.polname = 'lottery_ops_staff_read'
                        and p.polcmd = 'r' and p.polpermissive
                        and p.polroles = array[(select r.oid from pg_roles r where r.rolname = 'authenticated')]::oid[]
                        and pg_get_expr(p.polqual, p.polrelid) = 'is_staff_desk()' and p.polwithcheck is null) then
      v_bad := v_bad || 'lottery_ops policy 不符（需精確：僅 authenticated、僅 SELECT、USING is_staff_desk()、無 WITH CHECK、permissive）; '; end if;
  end if;
  if (select count(*) from pg_trigger g where g.tgname like 'trg_lottery_gate%' and not g.tgisinternal) <> 3 then
    v_bad := v_bad || '出現預期以外的 trg_lottery_gate* 觸發器; '; end if;
  return v_bad;
end $c$;

do $t$
declare
  r jsonb; res text := ''; n int; adm text; m0 date := date_trunc('month',(now() at time zone 'Asia/Taipei')::date)::date;
  caught boolean; src text;
begin
  select auth_id::text into adm from employees where id = 'e_admin';
  if adm is null then raise exception 'TEST_FAIL: 找不到 e_admin 的 auth_id'; end if;
  if exists (select 1 from members where id like 'LT-%') or exists (select 1 from bookings where id like 'LT-%') then
    raise exception 'TEST_FAIL: 夾具 id 已存在（LT-*），中止避免污染'; end if;

  insert into members(id) values ('LT-M1'),('LT-M2'),('LT-M3'),('LT-M4'),('LT-M5'),('LT-M6'),('LT-M7'),('LT-M8'),('LT-M9'),('LT-M10'),('LT-M11'),('LT-M12');
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B1-'||g, 'LT-M1', '私人教練', 'checked_in', date '2026-11-02' + g, '10:00' from generate_series(1,4) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B2-'||g, 'LT-M2', '私人教練', 'checked_in', date '2026-11-02' + g, '11:00' from generate_series(1,3) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B3-'||g, 'LT-M3', '私人教練', 'checked_in', date '2026-06-02' + g, '12:00' from generate_series(1,4) g;
  -- M4：VIP 但有 4 堂；M5：只有「下個月」4 堂；M6：本月 4 堂＋下個月 4 堂；M7：給舊頁面阻擋測試用（本月 4 堂）
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B4-'||g, 'LT-M4', '私人教練', 'checked_in', m0 + g, '13:00' from generate_series(1,4) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B5-'||g, 'LT-M5', '私人教練', 'checked_in', (m0 + interval '1 month')::date + g, '14:00' from generate_series(1,4) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B6a-'||g, 'LT-M6', '私人教練', 'checked_in', m0 + g, '15:00' from generate_series(1,4) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B6b-'||g, 'LT-M6', '私人教練', 'checked_in', (m0 + interval '1 month')::date + g, '15:00' from generate_series(1,4) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B7-'||g, 'LT-M7', '私人教練', 'checked_in', m0 + g, '16:00' from generate_series(1,4) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B8-'||g, 'LT-M8', '私人教練', 'checked_in', m0 + g, '17:00' from generate_series(1,8) g;
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B12-'||g, 'LT-M12', '私人教練', 'checked_in', m0 + g, '18:00' from generate_series(1,4) g;

  perform set_config('request.jwt.claims', '', true);
  r := public.fn_lottery_award('LT-M1','pt','LT-OP0');
  if r->>'error_code' is distinct from 'AUTH.FORBIDDEN' then raise exception 'TEST_FAIL T1 %', r; end if;
  res := res || 'T1 PASS; ';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);

  r := public.fn_lottery_award('LT-M2','pt','LT-OP-M2');
  if r->>'error_code' is distinct from 'LOTTERY.NO_QUOTA' then raise exception 'TEST_FAIL T2 %', r; end if;
  select count(*) into n from purchases where member_id='LT-M2'; if n<>0 then raise exception 'TEST_FAIL T2 purchases %', n; end if;
  res := res || 'T2 PASS; ';

  r := public.fn_lottery_award('LT-M1','pt','LT-OP1');
  if not (r->>'ok')::boolean or (r->>'replayed')::boolean then raise exception 'TEST_FAIL T3 %', r; end if;
  select count(*) into n from member_tickets where member_id='LT-M1' and source='lottery'; if n<>1 then raise exception 'TEST_FAIL T3 tickets %', n; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-OP1' and action::text='grant' and delta=1; if n<>1 then raise exception 'TEST_FAIL T3 logs %', n; end if;
  select count(*) into n from purchases where member_id='LT-M1' and source='lottery'; if n<>1 then raise exception 'TEST_FAIL T3 purchases %', n; end if;
  res := res || 'T3 PASS; ';

  r := public.fn_lottery_award('LT-M1','pt','LT-OP1');
  if not (r->>'ok')::boolean or not (r->>'replayed')::boolean then raise exception 'TEST_FAIL T4 %', r; end if;
  select count(*) into n from member_tickets where member_id='LT-M1' and source='lottery'; if n<>1 then raise exception 'TEST_FAIL T4 tickets %', n; end if;
  res := res || 'T4 PASS; ';

  r := public.fn_lottery_award('LT-M1','pt','LT-OP2');
  if r->>'error_code' is distinct from 'LOTTERY.NO_QUOTA' then raise exception 'TEST_FAIL T5 %', r; end if;
  select count(*) into n from member_tickets where member_id='LT-M1' and source='lottery'; if n<>1 then raise exception 'TEST_FAIL T5 tickets %', n; end if;
  res := res || 'T5 PASS; ';

  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B1b-'||g, 'LT-M1', '私人教練', 'checked_in', date '2026-11-10' + g, '10:00' from generate_series(1,4) g;
  r := public.fn_lottery_award('LT-M1','ball','LT-OP3');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL T6 %', r; end if;
  select count(*) into n from member_tickets where member_id='LT-M1' and source='lottery'; if n<>1 then raise exception 'TEST_FAIL T6 tickets %', n; end if;
  select count(*) into n from purchases where member_id='LT-M1' and source='lottery'; if n<>2 then raise exception 'TEST_FAIL T6 purchases %', n; end if;
  res := res || 'T6 PASS; ';

  r := public.fn_lottery_award('LT-M1','nope','LT-OP5');
  if r->>'error_code' is distinct from 'LOTTERY.BAD_PRIZE' then raise exception 'TEST_FAIL T7a %', r; end if;
  r := public.fn_lottery_award('LT-M3','pt','LT-OP1');
  if r->>'error_code' is distinct from 'LOTTERY.OP_CONFLICT' then raise exception 'TEST_FAIL T7b %', r; end if;
  res := res || 'T7 PASS; ';

  -- T8 寫入中途失敗整筆回滾（purchases 的 INSERT 在發票、寫帳之後才失敗）
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B1c-'||g, 'LT-M1', '私人教練', 'checked_in', date '2026-11-20' + g, '10:00' from generate_series(1,4) g;
  create function pg_temp.lt_boom() returns trigger language plpgsql as $b$ begin raise exception 'LT_BOOM'; end $b$;
  create trigger lt_boom before insert on public.purchases for each row when (new.id = 'LT-OP4') execute function pg_temp.lt_boom();
  caught := false;
  begin
    r := public.fn_lottery_award('LT-M1','pt','LT-OP4');
  exception when others then
    if sqlerrm not like '%LT_BOOM%' then raise; end if;
    caught := true;
  end;
  if not caught then raise exception 'TEST_FAIL T8 沒有拋錯 %', r; end if;
  select count(*) into n from member_tickets where id='TK-LT-OP4'; if n<>0 then raise exception 'TEST_FAIL T8 孤兒票 %', n; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-OP4'; if n<>0 then raise exception 'TEST_FAIL T8 孤兒帳 %', n; end if;
  select count(*) into n from purchases where id='LT-OP4'; if n<>0 then raise exception 'TEST_FAIL T8 登記 %', n; end if;
  select count(*) into n from lottery_ops where op_id='LT-OP4'; if n<>0 then raise exception 'TEST_FAIL T8 操作紀錄 %', n; end if;
  drop trigger lt_boom on public.purchases;
  -- 旗標不得殘留：失敗後直接寫入仍要被擋
  begin insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-X8','LT-M1','x',0,'lottery'); caught := false;
  exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL T8 失敗後旗標殘留'; end if;
  res := res || 'T8 PASS; ';

  r := public.fn_lottery_award('LT-M3','pt','LT-OP6');
  if r->>'error_code' is distinct from 'LOTTERY.NO_QUOTA' then raise exception 'TEST_FAIL T9 %', r; end if;
  res := res || 'T9 PASS; ';

  -- T10 VIP 排除：確認視窗開著時等級由一般改成 VIP → 登記要被擋、零寫入
  r := public.fn_lottery_award('LT-M4','pt','LT-OP-V0');   -- 一般會員先確認有資格（只驗證不消耗：用 goods 以外會發票，這裡改查 NO_VIP 前後）
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL T10 一般會員應可登記 %', r; end if;
  update members set level='vip' where id='LT-M4';
  insert into bookings(id, member_id, category, status, date, start_time)
    select 'LT-B4b-'||g, 'LT-M4', '私人教練', 'checked_in', m0 + 10 + g, '13:00' from generate_series(1,4) g;
  r := public.fn_lottery_award('LT-M4','pt','LT-OP-V1');
  if r->>'error_code' is distinct from 'LOTTERY.VIP_EXCLUDED' then raise exception 'TEST_FAIL T10 VIP %', r; end if;
  select count(*) into n from member_tickets where id='TK-LT-OP-V1'; if n<>0 then raise exception 'TEST_FAIL T10 票 %', n; end if;
  select count(*) into n from purchases where id='LT-OP-V1'; if n<>0 then raise exception 'TEST_FAIL T10 登記 %', n; end if;
  -- 已經登記過的 VIP 重送同 op：仍是冪等回應（VIP 檢查在冪等之後）
  r := public.fn_lottery_award('LT-M4','pt','LT-OP-V0');
  if not (r->>'ok')::boolean or not (r->>'replayed')::boolean then raise exception 'TEST_FAIL T10 重送 %', r; end if;
  res := res || 'T10 PASS; ';

  -- T11 未來月份不算：只有下個月 4 堂 → NO_QUOTA；本月 4＋下月 4 → 只有 1 次資格
  r := public.fn_lottery_award('LT-M5','pt','LT-OP-F1');
  if r->>'error_code' is distinct from 'LOTTERY.NO_QUOTA' or (r->>'earned')::int <> 0 then raise exception 'TEST_FAIL T11a %', r; end if;
  r := public.fn_lottery_award('LT-M6','pt','LT-OP-F2');
  if not (r->>'ok')::boolean or (r->>'earned')::int <> 1 then raise exception 'TEST_FAIL T11b %', r; end if;
  r := public.fn_lottery_award('LT-M6','pt','LT-OP-F3');
  if r->>'error_code' is distinct from 'LOTTERY.NO_QUOTA' then raise exception 'TEST_FAIL T11c %', r; end if;
  res := res || 'T11 PASS; ';

  -- T12 停用員工不得發獎（inactive）
  update employees set status='inactive' where id='e_admin';
  r := public.fn_lottery_award('LT-M7','pt','LT-OP-E1');
  if r->>'error_code' is distinct from 'AUTH.FORBIDDEN' then raise exception 'TEST_FAIL T12a %', r; end if;
  -- （enum staff_status 目前沒有 'resigned' 值；函式端仍一併擋，供日後新增該值時沿用）
  select count(*) into n from member_tickets where member_id='LT-M7'; if n<>0 then raise exception 'TEST_FAIL T12 票 %', n; end if;
  select count(*) into n from purchases where member_id='LT-M7'; if n<>0 then raise exception 'TEST_FAIL T12 登記 %', n; end if;
  update employees set status='active' where id='e_admin';
  res := res || 'T12 PASS; ';

  -- T13 舊頁面阻擋：直接寫表的第一步就被拒，不會留下任何票／帳／登記
  caught := false;
  begin
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, source, unit_price, amount_paid, sessions_total, sessions_remaining, status)
    values ('TK-LT-OLD1','LT-M7','tt_pt','抽獎－教練課 1 堂','lottery',0,0,1,1,'usable');
  exception when others then caught := (sqlerrm like '%LOTTERY.CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL T13a 舊流程發票沒被擋'; end if;
  caught := false;
  begin
    insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-OLD1','LT-M7','抽獎：筋膜球',0,'lottery');
  exception when others then caught := (sqlerrm like '%LOTTERY.CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL T13b 舊流程登記沒被擋'; end if;
  select count(*) into n from member_tickets where id='TK-LT-OLD1'; if n<>0 then raise exception 'TEST_FAIL T13 孤兒票'; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-OLD1'; if n<>0 then raise exception 'TEST_FAIL T13 孤兒帳'; end if;
  -- 其他來源的寫入不受影響
  insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-NORM','LT-M7','一般購買',100,'backoffice');
  insert into member_tickets(id, member_id, ticket_type_id, plan_name, source, sessions_total, sessions_remaining, status)
  values ('TK-LT-NORM','LT-M7','tt_pt','一般票','purchase',1,1,'usable');
  -- 既有登記列的 upsert（改抽獎項目更新登記）不擋
  r := public.fn_lottery_award('LT-M7','ball','LT-OP-G1');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL T13c %', r; end if;
  insert into purchases(id, member_id, plan_name, deal_amount, source, note) values ('LT-OP-G1','LT-M7','抽獎：筋膜球',0,'lottery','備註更新')
    on conflict (id) do update set note = excluded.note;
  select count(*) into n from purchases where id='LT-OP-G1' and plan_name='抽獎：筋膜球' and note='備註更新'; if n<>1 then raise exception 'TEST_FAIL T13d 只改備註的 upsert 應放行'; end if;
  caught := false;
  begin
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, source, source_type, sessions_total, sessions_remaining, status)
    values ('TK-LT-FIX','LT-M7','tt_pt','抽獎－教練課 1 堂','lottery','lottery_fix',1,1,'usable');
  exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL T13f 仍可用 lottery_fix 自行放行'; end if;
  caught := false;
  begin insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-OLD2','LT-M7','x',0,'lottery');
  exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL T13e RPC 後旗標殘留'; end if;
  res := res || 'T13 PASS; ';


  -- ─────────── 以下：改抽獎項目（fn_lottery_fix）與舊頁面更正阻擋 ───────────
  -- F1 先用 RPC 登記一張教練課（M8 有 8 堂＝2 次資格），再改成實體贈品
  r := public.fn_lottery_award('LT-M8','pt','LT-FX1');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL F0 %', r; end if;
  r := public.fn_lottery_fix('LT-FX1','ball','LT-FXO1');
  if not (r->>'ok')::boolean or (r->>'replayed')::boolean then raise exception 'TEST_FAIL F1 %', r; end if;
  select count(*) into n from member_tickets where id='TK-LT-FX1'; if n<>0 then raise exception 'TEST_FAIL F1 舊票還在 %', n; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-FX1'; if n<>0 then raise exception 'TEST_FAIL F1 舊帳還在 %', n; end if;
  select count(*) into n from purchases where id='LT-FX1' and plan_name='抽獎：筋膜球' and note like '%教練課 → 筋膜球%'; if n<>1 then raise exception 'TEST_FAIL F1 登記未更正 %', n; end if;
  select count(*) into n from lottery_ops where op_id='LT-FXO1' and kind='fix' and purchase_id='LT-FX1' and prize_key='ball'; if n<>1 then raise exception 'TEST_FAIL F1 操作紀錄 %', n; end if;
  r := public.fn_lottery_fix('LT-FX1','ball','LT-FXO1');
  if not (r->>'ok')::boolean or not (r->>'replayed')::boolean then raise exception 'TEST_FAIL F1b 重送 %', r; end if;
  select count(*) into n from purchases where member_id='LT-M8' and source='lottery'; if n<>1 then raise exception 'TEST_FAIL F1c 抽獎次數被改動 %', n; end if;
  res := res || 'F1 PASS; ';

  -- F2 贈品改成折抵券：發新票（id 固定為 TK-登記id）＋帳＋更正紀錄
  r := public.fn_lottery_fix('LT-FX1','pt300','LT-FXO2');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL F2 %', r; end if;
  select count(*) into n from member_tickets where id='TK-LT-FX1' and source='lottery' and ticket_type_id='tt-discount-pt300' and sessions_remaining=1; if n<>1 then raise exception 'TEST_FAIL F2 新票 %', n; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-FX1' and action::text='grant' and note like '%更正自%'; if n<>1 then raise exception 'TEST_FAIL F2 新帳 %', n; end if;
  res := res || 'F2 PASS; ';

  -- F3 原票已被用過／預約掛著 → 拒絕、什麼都不動
  update member_tickets set sessions_remaining = 0 where id = 'TK-LT-FX1';
  r := public.fn_lottery_fix('LT-FX1','ball','LT-FXO3');
  if r->>'error_code' is distinct from 'LOTTERY.FIX_TICKET_USED' then raise exception 'TEST_FAIL F3a %', r; end if;
  update member_tickets set sessions_remaining = 1 where id = 'TK-LT-FX1';
  insert into bookings(id, member_id, category, status, date, start_time, ticket_id) values ('LT-BK-FX','LT-M8','私人教練','booked', m0 + 20, '09:00', 'TK-LT-FX1');
  r := public.fn_lottery_fix('LT-FX1','ball','LT-FXO3');
  if r->>'error_code' is distinct from 'LOTTERY.FIX_TICKET_USED' then raise exception 'TEST_FAIL F3b %', r; end if;
  delete from bookings where id='LT-BK-FX';
  select count(*) into n from member_tickets where id='TK-LT-FX1'; if n<>1 then raise exception 'TEST_FAIL F3 票被動到 %', n; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-FX1'; if n<>1 then raise exception 'TEST_FAIL F3 帳被動到 %', n; end if;
  select count(*) into n from purchases where id='LT-FX1' and plan_name='抽獎：教練課折抵300'; if n<>1 then raise exception 'TEST_FAIL F3 登記被動到 %', n; end if;
  res := res || 'F3 PASS; ';

  -- F4 寫入中途失敗整筆回滾：舊票與帳在新票寫入失敗時必須原封不動（不能留下缺票狀態）
  create function pg_temp.lt_boom2() returns trigger language plpgsql as $b$ begin raise exception 'LT_BOOM2'; end $b$;
  create trigger lt_boom2 before insert on public.member_tickets for each row when (new.id = 'TK-LT-FX1') execute function pg_temp.lt_boom2();
  caught := false;
  begin
    r := public.fn_lottery_fix('LT-FX1','ms','LT-FXO4');
  exception when others then
    if sqlerrm not like '%LT_BOOM2%' then raise; end if;
    caught := true;
  end;
  if not caught then raise exception 'TEST_FAIL F4 沒有拋錯 %', r; end if;
  drop trigger lt_boom2 on public.member_tickets;
  select count(*) into n from member_tickets where id='TK-LT-FX1' and ticket_type_id='tt-discount-pt300'; if n<>1 then raise exception 'TEST_FAIL F4 缺票 %', n; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-FX1'; if n<>1 then raise exception 'TEST_FAIL F4 缺帳 %', n; end if;
  select count(*) into n from purchases where id='LT-FX1' and plan_name='抽獎：教練課折抵300' ; if n<>1 then raise exception 'TEST_FAIL F4 登記被動到 %', n; end if;
  select count(*) into n from lottery_ops where op_id='LT-FXO4'; if n<>0 then raise exception 'TEST_FAIL F4 失敗的操作不該留紀錄 %', n; end if;
  res := res || 'F4 PASS; ';

  -- F5 舊資料（票 id 不是 TK-登記id）：5 分鐘內唯一一張才對應；零張或多張一律拒絕
  perform set_config('app.lottery_rpc','1',true);
  insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-LEG1','LT-M9','抽獎：教練課',0,'lottery');
  insert into member_tickets(id, member_id, ticket_type_id, plan_name, source, sessions_total, sessions_remaining, status) values ('TK-OLDRANDOM1','LT-M9','tt_pt','抽獎－教練課 1 堂','lottery',1,1,'usable');
  insert into ticket_logs(id, ticket_id, action, delta, operator, note) values ('LG-LT-1','TK-OLDRANDOM1','grant',1,'e_admin','現場抽獎－教練課');
  insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-P1','LT-M10','抽獎：教練課',0,'lottery');
  insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-P2','LT-M10','抽獎：教練課',0,'lottery');
  insert into member_tickets(id, member_id, ticket_type_id, plan_name, source, sessions_total, sessions_remaining, status) values ('TK-LT-P2','LT-M10','tt_pt','抽獎－教練課 1 堂','lottery',1,1,'usable');
  insert into ticket_logs(id, ticket_id, action, delta, operator, note) values ('LG-LT-2','TK-LT-P2','grant',1,'e_admin','現場抽獎－教練課');
  insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-LEG3','LT-M11','抽獎：教練課',0,'lottery');
  perform set_config('app.lottery_rpc','',true);
  -- F5a 原票缺失（TK-LT-P1 不存在），但附近有同一會員另一筆抽獎票 TK-LT-P2：必須拒絕，另一張票與帳完全不動
  src := (select md5(t::text) from member_tickets t where id='TK-LT-P2') || (select md5(coalesce(string_agg(l::text,'|' order by l.id),'')) from ticket_logs l where ticket_id='TK-LT-P2')
         || (select md5(p::text) from purchases p where id='LT-P1') || (select md5(p::text) from purchases p where id='LT-P2');
  r := public.fn_lottery_fix('LT-P1','ball','LT-FXO5');
  if r->>'error_code' is distinct from 'LOTTERY.FIX_NO_ORIGINAL_TICKET' then raise exception 'TEST_FAIL F5a %', r; end if;
  if src is distinct from ((select md5(t::text) from member_tickets t where id='TK-LT-P2') || (select md5(coalesce(string_agg(l::text,'|' order by l.id),'')) from ticket_logs l where ticket_id='TK-LT-P2')
         || (select md5(p::text) from purchases p where id='LT-P1') || (select md5(p::text) from purchases p where id='LT-P2')) then
    raise exception 'TEST_FAIL F5a 另一張票／帳／登記被動到'; end if;
  select count(*) into n from member_tickets where member_id='LT-M10'; if n<>1 then raise exception 'TEST_FAIL F5a 票數改變 %', n; end if;
  -- F5b 舊資料：只有一張時間相近的票、但 id 不是 TK-登記id → 一樣拒絕（不猜），票與帳不動
  src := (select md5(t::text) from member_tickets t where id='TK-OLDRANDOM1') || (select md5(l::text) from ticket_logs l where id='LG-LT-1');
  r := public.fn_lottery_fix('LT-LEG1','ball','LT-FXO6');
  if r->>'error_code' is distinct from 'LOTTERY.FIX_NO_ORIGINAL_TICKET' then raise exception 'TEST_FAIL F5b %', r; end if;
  if src is distinct from ((select md5(t::text) from member_tickets t where id='TK-OLDRANDOM1') || (select md5(l::text) from ticket_logs l where id='LG-LT-1')) then raise exception 'TEST_FAIL F5b 票／帳被動到'; end if;
  select count(*) into n from purchases where id='LT-LEG1' and plan_name='抽獎：教練課'; if n<>1 then raise exception 'TEST_FAIL F5b 登記被動到'; end if;
  -- F5c 完全沒有票
  r := public.fn_lottery_fix('LT-LEG3','ball','LT-FXO7');
  if r->>'error_code' is distinct from 'LOTTERY.FIX_NO_ORIGINAL_TICKET' then raise exception 'TEST_FAIL F5c %', r; end if;
  -- F5d 原獎項是實體贈品（本來就沒票）仍可更正：用 LT-OP-G1（M7 筋膜球）改成蛋白粉
  r := public.fn_lottery_fix('LT-OP-G1','protein','LT-FXO7');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL F5d %', r; end if;
  select count(*) into n from purchases where id='LT-OP-G1' and plan_name='抽獎：蛋白粉'; if n<>1 then raise exception 'TEST_FAIL F5d 登記'; end if;
  res := res || 'F5 PASS; ';

  -- F6 權限：櫃台層級只能改當天登記，管理員任何日期；員工停用一律拒絕
  update purchases set created_at = now() - interval '3 days' where id='LT-FX1';
  update employees set role='front_desk' where id='e_admin';
  r := public.fn_lottery_fix('LT-FX1','ball','LT-FXO8');
  if r->>'error_code' is distinct from 'LOTTERY.FIX_DATE_LOCKED' then raise exception 'TEST_FAIL F6a %', r; end if;
  update employees set role='admin' where id='e_admin';
  update employees set status='inactive' where id='e_admin';
  r := public.fn_lottery_fix('LT-FX1','ball','LT-FXO8');
  if r->>'error_code' is distinct from 'AUTH.FORBIDDEN' then raise exception 'TEST_FAIL F6b %', r; end if;
  update employees set status='active' where id='e_admin';
  r := public.fn_lottery_fix('LT-FX1','ball','LT-FXO8');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL F6c 管理員改過去的登記應可 %', r; end if;
  res := res || 'F6 PASS; ';

  -- F7 舊頁面的「改抽獎項目」流程：刪帳、刪票、退回作廢三條路都在第一個寫入就被擋，票與帳原封不動
  r := public.fn_lottery_fix('LT-FX1','pt','LT-FXO9');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL F7 準備 %', r; end if;
  caught := false;
  begin delete from ticket_logs where ticket_id='TK-LT-FX1'; exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL F7a 舊流程刪帳沒被擋'; end if;
  caught := false;
  begin delete from member_tickets where id='TK-LT-FX1'; exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL F7b 舊流程刪票沒被擋'; end if;
  caught := false;
  begin update member_tickets set status='refunded', sessions_remaining=0 where id='TK-LT-FX1'; exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL F7c 舊流程作廢沒被擋'; end if;
  select count(*) into n from member_tickets where id='TK-LT-FX1' and status::text='usable' and sessions_remaining=1; if n<>1 then raise exception 'TEST_FAIL F7 票被動到'; end if;
  select count(*) into n from ticket_logs where ticket_id='TK-LT-FX1'; if n<>1 then raise exception 'TEST_FAIL F7 帳被動到'; end if;
  -- 其他來源的票照常可刪（補課券收回等既有流程不受影響）
  delete from member_tickets where id='TK-LT-NORM';
  select count(*) into n from member_tickets where id='TK-LT-NORM'; if n<>0 then raise exception 'TEST_FAIL F7d 一般票刪不掉'; end if;
  res := res || 'F7 PASS; ';

  -- F8 鎖後重讀（單連線只能驗證「讀取位置在鎖之後」；真正排隊期間變更需雙連線，見交接文件 §5 B2）
  -- U1 舊頁面「贈品→贈品」：直接 upsert 既有抽獎登記並改獎項／歸屬／來源 → 擋；只改備註放行；一般購買不受影響
  caught := false;
  begin
    insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-OP-G1','LT-M7','抽獎：筋膜球',0,'lottery')
      on conflict (id) do update set plan_name = excluded.plan_name;
  exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL U1a 舊頁面 upsert 改獎項沒被擋'; end if;
  caught := false;
  begin update purchases set member_id='LT-M8' where id='LT-OP-G1'; exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL U1b 改歸屬沒被擋'; end if;
  caught := false;
  begin update purchases set source='backoffice' where id='LT-OP-G1'; exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL U1c 改來源沒被擋'; end if;
  caught := false;
  begin update purchases set source='lottery' where id='LT-NORM'; exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL U1d 把一般購買改成抽獎來源沒被擋'; end if;
  select count(*) into n from purchases where id='LT-OP-G1' and member_id='LT-M7' and source='lottery' and plan_name='抽獎：蛋白粉'; if n<>1 then raise exception 'TEST_FAIL U1 登記被動到'; end if;
  update purchases set plan_name='一般購買（改名）', deal_amount=200 where id='LT-NORM';
  select count(*) into n from purchases where id='LT-NORM' and plan_name='一般購買（改名）' and deal_amount=200; if n<>1 then raise exception 'TEST_FAIL U1e 一般購買受影響'; end if;
  -- U2 與新版更正交錯：舊頁面嘗試 → 新版更正成功 → 舊頁面再嘗試仍被擋 → 新版再更正；旗標不殘留
  update purchases set note = '舊頁面備註' where id='LT-OP-G1';
  r := public.fn_lottery_fix('LT-OP-G1','ball','LT-FXO10');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL U2a %', r; end if;
  if coalesce(current_setting('app.lottery_rpc', true), '') <> '' then raise exception 'TEST_FAIL U2 旗標殘留'; end if;
  caught := false;
  begin update purchases set plan_name='抽獎：蛋白粉' where id='LT-OP-G1'; exception when others then caught := (sqlerrm like '%CLIENT_OUTDATED%'); end;
  if not caught then raise exception 'TEST_FAIL U2b 新版更正後舊頁面直接改沒被擋'; end if;
  select count(*) into n from purchases where id='LT-OP-G1' and plan_name='抽獎：筋膜球' and note like '%舊頁面備註%'; if n<>1 then raise exception 'TEST_FAIL U2 登記內容不符'; end if;
  select count(*) into n from lottery_ops where op_id='LT-FXO10'; if n<>1 then raise exception 'TEST_FAIL U2 操作紀錄 %', n; end if;
  r := public.fn_lottery_fix('LT-OP-G1','protein','LT-FXO11');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL U2c %', r; end if;
  res := res || 'U1-U2 PASS; ';
  -- R1 重現 GPT 發現的 P1：登記→更正 A（改蛋白粉）→更正 B（改回教練課）→只改備註→重送 A 的操作識別
  r := public.fn_lottery_award('LT-M12','pt','LT-R0');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL R0 %', r; end if;
  r := public.fn_lottery_fix('LT-R0','protein','LT-RA');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL R1a %', r; end if;
  r := public.fn_lottery_fix('LT-R0','pt','LT-RB');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL R1b %', r; end if;
  update purchases set note = '只改備註' where id='LT-R0';
  src := (select md5(t::text) from member_tickets t where id='TK-LT-R0') || (select md5(coalesce(string_agg(l::text,'|' order by l.id),'')) from ticket_logs l where ticket_id='TK-LT-R0') || (select md5(p::text) from purchases p where id='LT-R0');
  r := public.fn_lottery_fix('LT-R0','protein','LT-RA');
  if not (r->>'ok')::boolean or not (r->>'replayed')::boolean then raise exception 'TEST_FAIL R1c 重送 A 應回已處理 %', r; end if;
  if src is distinct from ((select md5(t::text) from member_tickets t where id='TK-LT-R0') || (select md5(coalesce(string_agg(l::text,'|' order by l.id),'')) from ticket_logs l where ticket_id='TK-LT-R0') || (select md5(p::text) from purchases p where id='LT-R0')) then
    raise exception 'TEST_FAIL R1c 舊操作重送覆蓋了後續更正（B 的票或登記被動到）'; end if;
  select count(*) into n from purchases where id='LT-R0' and plan_name='抽獎：教練課'; if n<>1 then raise exception 'TEST_FAIL R1 獎項被改回蛋白粉'; end if;
  select count(*) into n from member_tickets where id='TK-LT-R0' and ticket_type_id='tt_pt'; if n<>1 then raise exception 'TEST_FAIL R1 B 的票被刪'; end if;
  r := public.fn_lottery_fix('LT-R0','pt','LT-RB');
  if not (r->>'ok')::boolean or not (r->>'replayed')::boolean then raise exception 'TEST_FAIL R1d 重送 B %', r; end if;
  -- R2 相同識別搭配不同參數 → 拒絕，且什麼都不動
  r := public.fn_lottery_fix('LT-R0','ms','LT-RA');
  if r->>'error_code' is distinct from 'LOTTERY.OP_CONFLICT' then raise exception 'TEST_FAIL R2a 同識別不同獎項 %', r; end if;
  r := public.fn_lottery_fix('LT-FX1','protein','LT-RA');
  if r->>'error_code' is distinct from 'LOTTERY.OP_CONFLICT' then raise exception 'TEST_FAIL R2b 同識別不同登記 %', r; end if;
  r := public.fn_lottery_award('LT-M12','ball','LT-R0');
  if r->>'error_code' is distinct from 'LOTTERY.OP_CONFLICT' then raise exception 'TEST_FAIL R2c 登記識別換獎項 %', r; end if;
  r := public.fn_lottery_award('LT-M7','pt','LT-R0');
  if r->>'error_code' is distinct from 'LOTTERY.OP_CONFLICT' then raise exception 'TEST_FAIL R2d 登記識別換會員 %', r; end if;
  r := public.fn_lottery_fix('LT-R0','ball','LT-R0');
  if r->>'error_code' is distinct from 'LOTTERY.OP_CONFLICT' then raise exception 'TEST_FAIL R2e 更正拿登記的識別 %', r; end if;
  r := public.fn_lottery_award('LT-M12','pt','LT-RA');
  if r->>'error_code' is distinct from 'LOTTERY.OP_CONFLICT' then raise exception 'TEST_FAIL R2f 登記拿更正的識別 %', r; end if;
  if src is distinct from ((select md5(t::text) from member_tickets t where id='TK-LT-R0') || (select md5(coalesce(string_agg(l::text,'|' order by l.id),'')) from ticket_logs l where ticket_id='TK-LT-R0') || (select md5(p::text) from purchases p where id='LT-R0')) then
    raise exception 'TEST_FAIL R2 衝突的請求動到了資料'; end if;
  -- R3 no_change 的重試語意：第一次「本來就是這一項」也會記下操作；之後即使獎項已變，重送仍回當初結果、不會把獎項改回去
  r := public.fn_lottery_fix('LT-R0','pt','LT-RN');
  if not (r->>'ok')::boolean or not (r->>'no_change')::boolean or (r->>'replayed')::boolean then raise exception 'TEST_FAIL R3a %', r; end if;
  select count(*) into n from lottery_ops where op_id='LT-RN' and kind='fix' and (result->>'no_change')::boolean; if n<>1 then raise exception 'TEST_FAIL R3 no_change 沒有留紀錄'; end if;
  r := public.fn_lottery_fix('LT-R0','protein','LT-RC');
  if not (r->>'ok')::boolean then raise exception 'TEST_FAIL R3b %', r; end if;
  src := (select md5(t::text) from member_tickets t where id='TK-LT-R0') || (select md5(p::text) from purchases p where id='LT-R0');
  r := public.fn_lottery_fix('LT-R0','pt','LT-RN');
  if not (r->>'ok')::boolean or not (r->>'replayed')::boolean or not (r->>'no_change')::boolean then raise exception 'TEST_FAIL R3c %', r; end if;
  select count(*) into n from purchases where id='LT-R0' and plan_name='抽獎：蛋白粉'; if n<>1 then raise exception 'TEST_FAIL R3 重送 no_change 把獎項改回去了'; end if;
  if src is distinct from ((select md5(t::text) from member_tickets t where id='TK-LT-R0') || (select md5(p::text) from purchases p where id='LT-R0')) then raise exception 'TEST_FAIL R3 重送動到資料'; end if;
  -- R4 證據保護：update／delete／truncate 都被擋；authenticated 不能直接寫；備註被改也不影響紀錄
  caught := false;
  begin update lottery_ops set result = '{}'::jsonb where op_id='LT-RA'; exception when others then caught := (sqlerrm like '%OPS_IMMUTABLE%'); end;
  if not caught then raise exception 'TEST_FAIL R4a update 沒被擋'; end if;
  caught := false;
  begin delete from lottery_ops where op_id='LT-RA'; exception when others then caught := (sqlerrm like '%OPS_IMMUTABLE%'); end;
  if not caught then raise exception 'TEST_FAIL R4b delete 沒被擋'; end if;
  caught := false;
  begin truncate table lottery_ops; exception when others then caught := (sqlerrm like '%OPS_IMMUTABLE%'); end;
  if not caught then raise exception 'TEST_FAIL R4c truncate 沒被擋'; end if;
  set local role authenticated;
  caught := false;
  begin insert into lottery_ops(op_id,kind,member_id,purchase_id,prize_key,result) values ('LT-FORGE','fix','LT-M12','LT-R0','pt','{"ok":true}'::jsonb); exception when insufficient_privilege then caught := true; end;
  if not caught then reset role; raise exception 'TEST_FAIL R4d authenticated 竟然能偽造操作紀錄'; end if;
  caught := false;
  begin update lottery_ops set result='{}'::jsonb; exception when insufficient_privilege then caught := true; end;
  if not caught then reset role; raise exception 'TEST_FAIL R4e authenticated 能改操作紀錄'; end if;
  caught := false;
  begin delete from lottery_ops; exception when insufficient_privilege then caught := true; end;
  if not caught then reset role; raise exception 'TEST_FAIL R4f authenticated 能刪操作紀錄'; end if;
  select count(*) into n from lottery_ops; if n < 5 then reset role; raise exception 'TEST_FAIL R4g 櫃台層級應能讀 %', n; end if;
  reset role;
  select count(*) into n from lottery_ops where op_id='LT-FORGE'; if n<>0 then raise exception 'TEST_FAIL R4 偽造的紀錄存在'; end if;
  res := res || 'R1-R4 PASS; ';
  -- N 負向：精確核對。把 policy／search_path／policy 角色放寬或換掉，完整核對（與回復檔前置核對同一份檢查本文）必須偵測到，且不移除任何物件；還原後必須回到全綠
  if pg_temp.lt_check() <> '' then raise exception 'TEST_FAIL N0 還原前基準就不乾淨 %', pg_temp.lt_check(); end if;
  alter policy lottery_ops_staff_read on public.lottery_ops using (true);
  if pg_temp.lt_check() = '' then raise exception 'TEST_FAIL N1 USING 改成 true 沒被偵測'; end if;
  alter policy lottery_ops_staff_read on public.lottery_ops using (is_staff_desk());
  alter policy lottery_ops_staff_read on public.lottery_ops to public;
  if pg_temp.lt_check() = '' then raise exception 'TEST_FAIL N2 policy 角色改成 public 沒被偵測'; end if;
  alter policy lottery_ops_staff_read on public.lottery_ops to authenticated;
  alter function public.fn_lottery_award(text,text,text) set search_path to public, pg_temp, auth;
  if pg_temp.lt_check() = '' then raise exception 'TEST_FAIL N3 search_path 加 auth 沒被偵測'; end if;
  alter function public.fn_lottery_award(text,text,text) set search_path to public, pg_temp;
  alter function public.fn_lottery_fix(text,text,text) set search_path to pg_temp, public;
  if pg_temp.lt_check() = '' then raise exception 'TEST_FAIL N4 search_path 順序不同沒被偵測'; end if;
  alter function public.fn_lottery_fix(text,text,text) set search_path to public, pg_temp;
  alter policy lottery_ops_staff_read on public.lottery_ops to authenticated, anon;
  if pg_temp.lt_check() = '' then raise exception 'TEST_FAIL N5 policy 多一個角色沒被偵測'; end if;
  alter policy lottery_ops_staff_read on public.lottery_ops to authenticated;
  if pg_temp.lt_check() <> '' then raise exception 'TEST_FAIL N6 還原後核對應全綠 %', pg_temp.lt_check(); end if;
  select count(*) into n from pg_proc where proname like 'fn_lottery%'; if n<>7 then raise exception 'TEST_FAIL N 函式數量 %', n; end if;
  select count(*) into n from pg_trigger where tgname like 'trg_lottery%' and not tgisinternal; if n<>5 then raise exception 'TEST_FAIL N 觸發器數量 %', n; end if;
  res := res || 'N1-N6 PASS; ';
  select prosrc into src from pg_proc where oid='public.fn_lottery_award(text,text,text)'::regprocedure;
  if not (position('''lotop:''' in src) > 0 and position('''lottery:''' in src) > position('''lotop:''' in src)
          and position('select status into v_est' in src) > position('''lottery:''' in src)
          and position('to_jsonb(m) into v_mj' in src) > position('''lottery:''' in src)
          and position('is_staff_desk()' in src) > position('''lottery:''' in src)
          and position('from lottery_ops where op_id' in src) > position('''lottery:''' in src)) then
    raise exception 'TEST_FAIL F8a 登記函式讀員工／VIP／操作紀錄在鎖之前'; end if;
  select prosrc into src from pg_proc where oid='public.fn_lottery_fix(text,text,text)'::regprocedure;
  if not (position('''lotop:''' in src) > 0 and position('''lottery:''' in src) > position('''lotop:''' in src)
          and position('select status, name into v_est' in src) > position('''lottery:''' in src)
          and position('from lottery_ops where op_id' in substr(src, position('''lottery:''' in src))) > 0
          and position('for update;' in src) > position('''lottery:''' in src)) then
    raise exception 'TEST_FAIL F8b 更正函式讀員工／操作紀錄／登記在鎖之前'; end if;
  res := res || 'F8 PASS(順序); ';

  res := res || 'T14 見回復段; ';
  perform set_config('app.t_res', res, true);
end
$t$;

-- ═══ 抽獎登記／更正原子化：回復（測試庫 kucvxpjatptfckhlxptj）═══
-- 單一交易。**先逐一核對 6 支函式與 3 個觸發器**都是我們這一版（本體指紋、ACL、觸發器指向的函式／表／事件／啟用狀態），
-- 任何一項缺少、不符、或多出同名前綴的觸發器，整支中止、什麼都不刪（避免刪到別的版本或別人的物件）。
-- 不改任何資料、資料表、欄位、政策、GRANT。回復後舊版前端照舊可用（新版前端的抽獎登記／更正需一併退回前端）。
do $pre$
declare v_src text; v_def boolean; v_cfg text[]; v_acl text; v_bad text := '';
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TARGET.GUARD 這支檔案只能在 測試庫 kucvxpjatptfckhlxptj 執行（目前叢集識別不符），已中止，沒有任何變更';
  end if;
  v_bad := '';
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_ops_guard()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_ops_guard 不存在; ';
  else
    if md5(v_src) <> '480437aadc1516648ab1e92825eb3241' then v_bad := v_bad || 'fn_lottery_ops_guard 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_ops_guard ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_ops_guard 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_prize(text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_prize 不存在; ';
  else
    if md5(v_src) <> '48e06027c5fd333b74e1609f7dbb4bec' then v_bad := v_bad || 'fn_lottery_prize 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_prize ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_prize 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_award(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_award 不存在; ';
  else
    if md5(v_src) <> 'b4a92cafedfafaf0b20f266dd4943d48' then v_bad := v_bad || 'fn_lottery_award 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_award ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_award 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_award search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_fix(text,text,text)');
  if v_src is null then v_bad := v_bad || 'fn_lottery_fix 不存在; ';
  else
    if md5(v_src) <> 'bb9a984c6ec2fad841e9022e31aa1e7e' then v_bad := v_bad || 'fn_lottery_fix 本體指紋不符; '; end if;
    if v_acl is null or v_acl !~ 'authenticated=X' or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_fix ACL 不符; '; end if;
    if not v_def then v_bad := v_bad || 'fn_lottery_fix 不是 SECURITY DEFINER; '; end if;
    if v_cfg is distinct from array['search_path=public, pg_temp']::text[] then v_bad := v_bad || 'fn_lottery_fix search_path 不符（需精確等於 public, pg_temp）; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_tk()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_tk 不存在; ';
  else
    if md5(v_src) <> '1f9014a25d335ed23641f88e846b2406' then v_bad := v_bad || 'fn_lottery_gate_tk 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_tk ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_tk 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_log()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_log 不存在; ';
  else
    if md5(v_src) <> '17bcc2ecde655864a1870fec523feb24' then v_bad := v_bad || 'fn_lottery_gate_log 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_log ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_log 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_gate_pu()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_gate_pu 不存在; ';
  else
    if md5(v_src) <> 'fad961b2da0167c86b71d2adceed4582' then v_bad := v_bad || 'fn_lottery_gate_pu 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_gate_pu ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_gate_pu 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_tk' and not g.tgisinternal and g.tgrelid = 'public.member_tickets'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_tk()') and g.tgtype = 31 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_tk 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_log' and not g.tgisinternal and g.tgrelid = 'public.ticket_logs'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_log()') and g.tgtype = 11 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_log 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_gate_pu' and not g.tgisinternal and g.tgrelid = 'public.purchases'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_gate_pu()') and g.tgtype = 23 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_gate_pu 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_immutable' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 27 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_immutable 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_notruncate' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 34 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_notruncate 不存在或不是預期的定義; '; end if;
  if to_regclass('public.lottery_ops') is null then v_bad := v_bad || 'lottery_ops 表不存在; ';
  else
    if (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'lottery_ops')
       is distinct from 'op_id:text,kind:text,member_id:text,purchase_id:text,prize_key:text,result:jsonb,created_by:text,created_at:timestamp with time zone' then
      v_bad := v_bad || 'lottery_ops 欄位不符; '; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = 'public.lottery_ops'::regclass) then v_bad := v_bad || 'lottery_ops 未開 RLS; '; end if;
    if not has_table_privilege('authenticated', 'public.lottery_ops', 'select') then v_bad := v_bad || 'authenticated 缺 select; '; end if;
    if has_table_privilege('authenticated', 'public.lottery_ops', 'insert,update,delete,truncate') or has_table_privilege('service_role', 'public.lottery_ops', 'insert,update,delete,truncate')
       or has_table_privilege('anon', 'public.lottery_ops', 'select,insert,update,delete,truncate') then v_bad := v_bad || 'lottery_ops 權限過寬（只能 select）; '; end if;
    if (select count(*) from pg_policy where polrelid = 'public.lottery_ops'::regclass) <> 1
       or not exists (select 1 from pg_policy p where p.polrelid = 'public.lottery_ops'::regclass and p.polname = 'lottery_ops_staff_read'
                        and p.polcmd = 'r' and p.polpermissive
                        and p.polroles = array[(select r.oid from pg_roles r where r.rolname = 'authenticated')]::oid[]
                        and pg_get_expr(p.polqual, p.polrelid) = 'is_staff_desk()' and p.polwithcheck is null) then
      v_bad := v_bad || 'lottery_ops policy 不符（需精確：僅 authenticated、僅 SELECT、USING is_staff_desk()、無 WITH CHECK、permissive）; '; end if;
  end if;
  if (select count(*) from pg_trigger g where g.tgname like 'trg_lottery_gate%' and not g.tgisinternal) <> 3 then
    v_bad := v_bad || '出現預期以外的 trg_lottery_gate* 觸發器; '; end if;
  if v_bad <> '' then raise exception 'ROLLBACK.UNEXPECTED_VERSION 不是預期的這一版或不完整，拒絕移除（沒有任何變更）：%', v_bad; end if;
end $pre$;
drop trigger if exists trg_lottery_gate_tk on public.member_tickets;
drop trigger if exists trg_lottery_gate_log on public.ticket_logs;
drop trigger if exists trg_lottery_gate_pu on public.purchases;
drop function if exists public.fn_lottery_gate_pu();
drop function if exists public.fn_lottery_gate_log();
drop function if exists public.fn_lottery_gate_tk();
drop function if exists public.fn_lottery_fix(text,text,text);
drop function if exists public.fn_lottery_award(text,text,text);
drop function if exists public.fn_lottery_prize(text);
do $post$
declare v_src text; v_def boolean; v_cfg text[]; v_acl text; v_bad text := '';
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TARGET.GUARD 這支檔案只能在 測試庫 kucvxpjatptfckhlxptj 執行（目前叢集識別不符），已中止，沒有任何變更';
  end if;
  if exists (select 1 from pg_trigger where tgname like 'trg_lottery_gate%' and not tgisinternal) or to_regprocedure('public.fn_lottery_prize(text)') is not null or to_regprocedure('public.fn_lottery_award(text,text,text)') is not null or to_regprocedure('public.fn_lottery_fix(text,text,text)') is not null or to_regprocedure('public.fn_lottery_gate_tk()') is not null or to_regprocedure('public.fn_lottery_gate_log()') is not null or to_regprocedure('public.fn_lottery_gate_pu()') is not null then
    raise exception 'POST.CHECK 回復後仍有殘留，整筆回滾';
  end if;
  v_bad := '';
  select p.prosrc, p.prosecdef, p.proconfig, p.proacl::text into v_src, v_def, v_cfg, v_acl from pg_proc p where p.oid = to_regprocedure('public.fn_lottery_ops_guard()');
  if v_src is null then v_bad := v_bad || 'fn_lottery_ops_guard 不存在; ';
  else
    if md5(v_src) <> '480437aadc1516648ab1e92825eb3241' then v_bad := v_bad || 'fn_lottery_ops_guard 本體指紋不符; '; end if;
    if v_acl is null or v_acl ~ '(^|[{,])=X' or v_acl ~ 'anon=' or v_acl ~ 'authenticated=' or v_acl ~ 'service_role=' then v_bad := v_bad || 'fn_lottery_ops_guard ACL 不符; '; end if;
    if v_def or v_cfg is not null then v_bad := v_bad || 'fn_lottery_ops_guard 不該是 SECURITY DEFINER 或帶 SET 設定; '; end if;
  end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_immutable' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 27 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_immutable 不存在或不是預期的定義; '; end if;
  if not exists (select 1 from pg_trigger g where g.tgname = 'trg_lottery_ops_notruncate' and not g.tgisinternal and g.tgrelid = 'public.lottery_ops'::regclass
                  and g.tgfoid = to_regprocedure('public.fn_lottery_ops_guard()') and g.tgtype = 34 and g.tgenabled = 'O') then
    v_bad := v_bad || 'trg_lottery_ops_notruncate 不存在或不是預期的定義; '; end if;
  if to_regclass('public.lottery_ops') is null then v_bad := v_bad || 'lottery_ops 表不存在; ';
  else
    if (select string_agg(column_name || ':' || data_type, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'lottery_ops')
       is distinct from 'op_id:text,kind:text,member_id:text,purchase_id:text,prize_key:text,result:jsonb,created_by:text,created_at:timestamp with time zone' then
      v_bad := v_bad || 'lottery_ops 欄位不符; '; end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = 'public.lottery_ops'::regclass) then v_bad := v_bad || 'lottery_ops 未開 RLS; '; end if;
    if not has_table_privilege('authenticated', 'public.lottery_ops', 'select') then v_bad := v_bad || 'authenticated 缺 select; '; end if;
    if has_table_privilege('authenticated', 'public.lottery_ops', 'insert,update,delete,truncate') or has_table_privilege('service_role', 'public.lottery_ops', 'insert,update,delete,truncate')
       or has_table_privilege('anon', 'public.lottery_ops', 'select,insert,update,delete,truncate') then v_bad := v_bad || 'lottery_ops 權限過寬（只能 select）; '; end if;
    if (select count(*) from pg_policy where polrelid = 'public.lottery_ops'::regclass) <> 1
       or not exists (select 1 from pg_policy p where p.polrelid = 'public.lottery_ops'::regclass and p.polname = 'lottery_ops_staff_read'
                        and p.polcmd = 'r' and p.polpermissive
                        and p.polroles = array[(select r.oid from pg_roles r where r.rolname = 'authenticated')]::oid[]
                        and pg_get_expr(p.polqual, p.polrelid) = 'is_staff_desk()' and p.polwithcheck is null) then
      v_bad := v_bad || 'lottery_ops policy 不符（需精確：僅 authenticated、僅 SELECT、USING is_staff_desk()、無 WITH CHECK、permissive）; '; end if;
  end if;
  if v_bad <> '' then raise exception 'POST.CHECK 回復不得動到操作證據，整筆回滾：%', v_bad; end if;
end $post$;

do $t2$
declare res text := current_setting('app.t_res', true); n int; caught boolean;
begin
  if to_regprocedure('public.fn_lottery_award(text,text,text)') is not null or to_regprocedure('public.fn_lottery_fix(text,text,text)') is not null
     or to_regprocedure('public.fn_lottery_prize(text)') is not null or exists (select 1 from pg_trigger where tgname like 'trg_lottery_gate%') then
    raise exception 'TEST_FAIL T14 回復後仍有殘留'; end if;
  -- 回復後舊寫法恢復：舊的刪票／作廢也可做（證明沒有永久改變表的行為）
  if to_regclass('public.lottery_ops') is null or to_regprocedure('public.fn_lottery_ops_guard()') is null
     or (select count(*) from pg_trigger where tgname like 'trg_lottery_ops%') <> 2 then
    raise exception 'TEST_FAIL T14 回復把操作證據的表／保護移除了'; end if;
  select count(*) into n from lottery_ops where op_id like 'LT-R%'; if n < 5 then raise exception 'TEST_FAIL T14 回復後操作紀錄不見 %', n; end if;
  caught := false;
  begin delete from lottery_ops where op_id='LT-RA'; exception when others then caught := (sqlerrm like '%OPS_IMMUTABLE%'); end;
  if not caught then raise exception 'TEST_FAIL T14 回復後證據可被刪'; end if;
  delete from ticket_logs where ticket_id='TK-LT-FX1';
  delete from member_tickets where id='TK-LT-FX1';
  -- 回復後舊流程直接寫入恢復可用（證明沒有永久改變表的寫入行為）
  insert into purchases(id, member_id, plan_name, deal_amount, source) values ('LT-POSTRB','LT-M7','x',0,'lottery');
  raise exception 'TEST_OK_ROLLBACK: % T14 PASS', res;
end
$t2$;
rollback;
