-- ═══════════════════════════════════════════════════════════════════════
-- 抽獎登記／更正原子化 RPC + 舊頁面阻擋（2026-11-26／27）。參考副本——**請勿直接執行**，
-- 請用 docs/handoff/lottery-award/01_apply_TESTDB.sql（含目標叢集守門、前置檢查、套用後逐項指紋判定）。
-- 本體指紋 md5(prosrc)：fn_lottery_ops_guard=480437aadc1516648ab1e92825eb3241 fn_lottery_prize=48e06027c5fd333b74e1609f7dbb4bec fn_lottery_award=b4a92cafedfafaf0b20f266dd4943d48 fn_lottery_fix=bb9a984c6ec2fad841e9022e31aa1e7e fn_lottery_gate_tk=1f9014a25d335ed23641f88e846b2406 fn_lottery_gate_log=17bcc2ecde655864a1870fec523feb24 fn_lottery_gate_pu=fad961b2da0167c86b71d2adceed4582
-- 設計說明見 docs/handoff/lottery-award/00_HANDOFF_交由GPT獨立驗收.md。
-- ═══════════════════════════════════════════════════════════════════════


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
