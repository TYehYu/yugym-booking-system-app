-- 階段 08（櫃檯扣堂＋取消原子化，rev6）行為測試｜測試庫 kucvxpjatptfckhlxptj｜單一交易、結尾 raise exception 回滾
-- 同一交易內先裝「實際部署會用的 06 版本」（fn_tk_refund_once 06 版＋trg_tk_quota_guard，原文取自 docs/migrations/20261118_*.sql），再裝 08。
-- ⚠ 只有循序測試：沒有真並行連線。「撤除／取消與登記／扣堂交錯」以兩種先後順序各做一次，證明鎖後的最終狀態一致，不是並行實測。
do $t$
declare
  v_mid text; v_uid uuid; v_uid2 uuid; out jsonb := '{}'::jsonb; r jsonb; k text; rv text; rv0 text;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: prod?'; end if;
  select auth_id into v_uid from employees where id='e_fd'; select auth_id into v_uid2 from employees where id='e_coach';
  execute $s06$create or replace function public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text) returns boolean
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_net integer; v_op text := coalesce(nullif(current_setting('app.tk_operator', true), ''), 'system');
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)
    into v_net from ticket_logs where ticket_id = p_ticket and booking_id = p_booking;
  if v_net <= 0 then return false; end if;
  if coalesce(t.sessions_total, 0) > 0 and coalesce(t.sessions_remaining, 0) >= t.sessions_total then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, v_op, '⚠ 已阻擋：餘額已滿，未再退課（效期屆滿自動取消）');
    return false;
  end if;
  update member_tickets
     set sessions_remaining = coalesce(sessions_remaining, 0) + 1,
         status = case when status::text = 'used_up' then 'usable' else status end
   where id = p_ticket;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'refund', 1, p_booking, v_op, coalesce(p_note, '取消返還原票'));
  return true;
end
$$;
create or replace function public.trg_tk_quota_guard() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_used_new integer; v_used_old integer;
begin
  if new.unlocked_sessions is null or coalesce(new.sessions_total, 0) <= 0 then return new; end if;
  if new.unlocked_sessions >= new.sessions_total then return new; end if;          -- 完整開通：沒有額度概念
  v_used_new := new.sessions_total - coalesce(new.sessions_remaining, 0);
  v_used_old := coalesce(old.sessions_total, new.sessions_total) - coalesce(old.sessions_remaining, 0);
  if v_used_new > v_used_old and v_used_new > new.unlocked_sessions then
    raise exception 'TICKET.INSTALLMENT_LOCKED'
      using errcode = 'P0001',
            detail = format('used=%s unlocked=%s', v_used_new, new.unlocked_sessions),
            hint = '分期票只能使用已開通的堂數；請先完成下一期付款開通，再預約或扣課';
  end if;
  return new;
end
$$;

drop trigger if exists trg_tk_quota_guard on public.member_tickets;
create trigger trg_tk_quota_guard
  before update of sessions_remaining, sessions_total, unlocked_sessions on public.member_tickets
  for each row execute function public.trg_tk_quota_guard();$s06$;
  execute $mig$-- 櫃檯扣堂＋取消原子化（P0E 階段 08；2026-11-18，rev6）
-- 本階段新增：① 表 ticket_deduct_ops（操作登記，持久化「真正的使用者操作」）② fn_desk_booking_rev ③ fn_desk_op_begin ④ fn_desk_deduct_ticket ⑤ fn_desk_cancel_booking。不動任何既有函式（fn_deduct_ticket、fn_cancel_booking、fn_refund_ticket 都不變）。
--
-- 【扣堂 fn_desk_deduct_ticket】同一交易：鎖預約→驗未取消→鎖票券→驗狀態→冪等→驗餘額→扣 1 堂→寫帳；任一步失敗整個回滾。鎖定順序＝預約→票券，與 fn_refund_ticket／fn_cancel_booking／fn_move_booking_ticket 一致。
--   p_op_key 空＝「這一堂在這張票只扣一次」；p_op_key 有值＝合法多堂（團課一人多名額、自主訓練多點），見下。
-- 【操作生命週期（rev6）】多堂操作先 fn_desk_op_begin(slot, 票, 預約, 預期預約版本)：
--   ・「預約版本」＝表 booking_op_rev 的**單調遞增計數**，由 bookings 上的觸發器 trg_booking_op_rev 在「狀態／名單 member_ids／座位票 seat_tickets／時長／日期／開始時間／綁定票」
--     任一欄位被寫入而改變時**由資料庫自己加 1**（任何寫入路徑——前端 dbPut、RPC、後台——都會觸發，不靠前端自願呼叫）。
--     ⚠ 不用內容指紋：內容改回原樣（時長 120→60→120、名額移除再加入）指紋會回到原值，舊操作就復活；計數只增不減，不會倒退。
--     （正式庫的 bookings.updated_at 只在日期／時間／時長變動時才動，也不能當版本。）呼叫端先讀版本、再帶著它登記；伺服器在鎖住預約後比對，不符＝REV_MISMATCH，不登記。
--     所以「舊的登記請求在名額移除之後才到達」不能替已移除的名額重新登記有效操作。
--   ・登記時記下當下的預約版本與這張票在這一堂的退款筆數。扣課時（同樣鎖住預約後）預約版本或退款筆數與登記時不同＝STALE_OP，
--     **不需要有任何退款帳**：名額登記後尚未扣成功就被移除、時長縮短後尚未扣成功的額外點數，都因預約版本改變而作廢。
--   ・已套用過的重送（帳本有 ｜op:識別）回 already；沒登記過的識別 UNKNOWN_OP；取消後 BOOKING_CANCELLED。
--   ・撤除與失效的一致性：移除名額／縮短時長／取消都要更新預約列（取得預約列鎖）；登記與扣課也先鎖預約列，所以兩者互相序列化——
--     撤除先提交，後到的登記／扣課看到新版本而被拒；登記／扣課先提交，撤除之後再來的請求被拒。
--   ・唯一性：表主鍵＝(booking_id, ticket_id, slot, epoch)；操作識別字串 slot:e世代 只是回傳給呼叫端的憑證，扣課時以（預約, 票, 從識別解析出的 slot／epoch）查表，
--     不同預約或不同票使用相同 slot 不會互相衝突，也不依賴呼叫端把範圍拼進 slot。
--   ・重試／重新整理：預約版本與退款筆數都沒變 → 登記回傳同一把識別（沿用）。
-- 【取消 fn_desk_cancel_booking(預約, 模式)】櫃檯專用，同一交易統一處理「退票＋取消狀態＋refund_waived＋稽核帳」：鎖預約→逐票（依票 id 排序）以 fn_tk_refund_once 退淨扣課→寫狀態。
--   模式沿用既有政策：auto／force／plain＝有淨扣課就退（plain 沒扣過就只取消）；none＝人員選擇扣課不退（有淨扣課才記 operator_waived 帳）。
--   結果 outcome：refunded／no_deduction／operator_waived／refund_failed（全部退不掉，例如餘額已滿）／refund_partial（部分票退成功、部分退不掉：成功的保留、失敗的票留「取消・部分退款」稽核帳，refund_waived＝true，回傳失敗票清單，**不算全部成功**）。
--   取消後再來的扣堂一律被擋（BOOKING_CANCELLED）；取消與扣堂同時發生時，後到者等待預約鎖：取消先→扣堂被拒；扣堂先→取消會連這一堂一起退。已取消再呼叫＝冪等（回 already）。
-- 回滾：docs/migrations/20261117_fn_desk_deduct_ticket_rollback.sql。

create table if not exists public.ticket_deduct_ops (
  booking_id text not null,
  ticket_id text not null,
  slot text not null,
  epoch integer not null,
  booking_rev text not null,
  refunds_at_begin integer not null,
  created_at timestamptz not null default now(),
  primary key (booking_id, ticket_id, slot, epoch)
);
alter table public.ticket_deduct_ops enable row level security;
grant select, insert, update, delete on public.ticket_deduct_ops to authenticated;
grant select, insert, update, delete on public.ticket_deduct_ops to service_role;
revoke all on public.ticket_deduct_ops from anon;   -- 預設權限可能把新表給 anon（測試庫實測：匿名讀到 HTTP 200＋空陣列，靠 RLS 擋）；明確收回，最小權限
-- 只由 SECURITY DEFINER 函式讀寫；不建任何 policy ＝ 一般登入者（authenticated）直接讀寫一律被 RLS 擋下。

-- 預約版本（單調遞增計數；只由觸發器寫入）
create table if not exists public.booking_op_rev (
  booking_id text primary key,
  rev bigint not null default 0
);
alter table public.booking_op_rev enable row level security;
grant select, insert, update, delete on public.booking_op_rev to authenticated;
grant select, insert, update, delete on public.booking_op_rev to service_role;
revoke all on public.booking_op_rev from anon;
-- 同 ticket_deduct_ops：只由 SECURITY DEFINER 函式／觸發器讀寫，不建 policy ＝ API 角色直接讀寫一律被 RLS 擋下。

create or replace function public.trg_booking_op_rev() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_id text := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  insert into public.booking_op_rev(booking_id, rev) values (v_id, 1)
  on conflict (booking_id) do update set rev = public.booking_op_rev.rev + 1;
  return null;
end $$;
revoke all on function public.trg_booking_op_rev() from public, anon, authenticated, service_role;

drop trigger if exists trg_booking_op_rev on public.bookings;
create trigger trg_booking_op_rev
  after update on public.bookings
  for each row
  when (old.status is distinct from new.status or old.member_ids is distinct from new.member_ids or old.seat_tickets is distinct from new.seat_tickets
        or old.duration is distinct from new.duration or old.date is distinct from new.date or old.start_time is distinct from new.start_time
        or old.ticket_id is distinct from new.ticket_id)
  execute function public.trg_booking_op_rev();

-- 刪除預約、以相同 id 重建：刪除與新增也各讓版本前進一次，重建的預約不會承接舊操作（已實測重現過：沒有這兩個觸發器時，舊操作在重建後復活）。
drop trigger if exists trg_booking_op_rev_insdel on public.bookings;
create trigger trg_booking_op_rev_insdel
  after insert or delete on public.bookings
  for each row execute function public.trg_booking_op_rev();

-- 重裝（回復後再次安裝）：回復期間觸發器不在，預約可能已被改過而計數沒動；重裝時讓所有既有版本前進一次，
-- 使「回復前登記、尚未完成」的操作與「回復前就已在路上的登記請求」一律作廢（沒有計數列的預約，隱含版本 0，也會被建立成 1）。第一次安裝時等於替每筆既有預約建立初始計數 1（一次性、單一語句）。
insert into public.booking_op_rev(booking_id, rev) select id, 1 from public.bookings
  on conflict (booking_id) do update set rev = public.booking_op_rev.rev + 1;

create or replace function public.fn_booking_rev_of(p_booking_id text) returns text
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select coalesce((select rev from public.booking_op_rev where booking_id = p_booking_id), 0)::text $$;

create or replace function public.fn_desk_booking_rev(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_emp text; b bookings%rowtype;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  select * into b from bookings where id = p_booking_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  return jsonb_build_object('ok', true, 'rev', public.fn_booking_rev_of(b.id), 'status', b.status::text);
end
$fn$;

create or replace function public.fn_desk_op_begin(p_slot text, p_ticket_id text, p_booking_id text, p_expect_rev text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_emp text; b bookings%rowtype; v_rev text; v_ref int; v_op record; v_epoch int;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_slot is null or p_ticket_id is null or p_booking_id is null or p_expect_rev is null then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS'); end if;
  select * into b from bookings where id = p_booking_id for update;                    -- 先鎖預約（與移除名額／縮短時長／取消／退款同序）
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if b.status::text = 'cancelled' then return jsonb_build_object('ok', false, 'error_code', 'BOOKING_CANCELLED'); end if;
  v_rev := public.fn_booking_rev_of(b.id);
  if v_rev is distinct from p_expect_rev then return jsonb_build_object('ok', false, 'error_code', 'REV_MISMATCH'); end if;
  select count(*) into v_ref from ticket_logs where ticket_id = p_ticket_id and booking_id = p_booking_id and action::text = 'refund';
  select * into v_op from ticket_deduct_ops where booking_id = p_booking_id and ticket_id = p_ticket_id and slot = p_slot order by epoch desc limit 1;
  if found and v_op.booking_rev = v_rev and v_op.refunds_at_begin = v_ref then
    return jsonb_build_object('ok', true, 'op_key', p_slot || ':e' || v_op.epoch, 'epoch', v_op.epoch, 'reused', true);
  end if;
  v_epoch := coalesce(v_op.epoch, 0) + 1;
  insert into ticket_deduct_ops(booking_id, ticket_id, slot, epoch, booking_rev, refunds_at_begin)
  values (p_booking_id, p_ticket_id, p_slot, v_epoch, v_rev, v_ref);
  return jsonb_build_object('ok', true, 'op_key', p_slot || ':e' || v_epoch, 'epoch', v_epoch, 'reused', false);
end
$fn$;

create or replace function public.fn_desk_deduct_ticket(
  p_ticket_id text, p_booking_id text, p_note text default null, p_op_key text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_emp text; v_bk bookings%rowtype; v_tk record; v_net int; v_id text; v_rem int; v_marker text; v_op record; v_ref int; v_m text[]; v_rev text;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_booking_id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;

  -- ① 先鎖預約（與取消／退票／調課同序），並確認沒被取消
  select * into v_bk from bookings where id = p_booking_id for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if v_bk.status::text = 'cancelled' then return jsonb_build_object('ok', false, 'error_code', 'BOOKING_CANCELLED'); end if;

  -- ② 再鎖票券
  select id, status, sessions_remaining into v_tk from member_tickets where id = p_ticket_id for update;
  if v_tk.id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_TICKET'); end if;

  if v_tk.status::text is distinct from 'usable' then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-',''), p_ticket_id, 'adjust', 0, p_booking_id, v_emp,
            '⚠ 已阻擋：票券狀態為 '||v_tk.status::text||'，未再扣課', now());
    return jsonb_build_object('ok', false, 'error_code', 'TICKET_NOT_USABLE', 'status', v_tk.status::text);
  end if;

  if p_op_key is null then
    select coalesce(sum(case when action = 'deduct' and coalesce(delta,0) <> 0 then 1
                             when action = 'refund' then -1 else 0 end), 0)
      into v_net from ticket_logs where ticket_id = p_ticket_id and booking_id = p_booking_id;
    if v_net > 0 then
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), p_ticket_id, 'adjust', 0, p_booking_id, v_emp,
              '⚠ 已阻擋：這一堂在這張票上已經扣過 '||v_net||' 堂，不重複扣', now());
      return jsonb_build_object('ok', true, 'already', true, 'remaining', v_tk.sessions_remaining);
    end if;
  else
    -- 多堂：必須是 fn_desk_op_begin 登記過、屬於這張票這一堂的操作（以 預約＋票＋slot＋epoch 查表，不信識別字串本身的範圍）
    v_m := regexp_match(p_op_key, '^(.*):e([0-9]+)$');
    if v_m is null then return jsonb_build_object('ok', false, 'error_code', 'UNKNOWN_OP'); end if;
    select * into v_op from ticket_deduct_ops where booking_id = p_booking_id and ticket_id = p_ticket_id and slot = v_m[1] and epoch = v_m[2]::int;
    if not found then return jsonb_build_object('ok', false, 'error_code', 'UNKNOWN_OP'); end if;
    v_marker := '｜op:' || p_op_key;
    if exists (select 1 from ticket_logs
                where ticket_id = p_ticket_id and booking_id = p_booking_id and action = 'deduct' and delta = -1
                  and right(coalesce(note,''), length(v_marker)) = v_marker) then
      return jsonb_build_object('ok', true, 'already', true, 'remaining', v_tk.sessions_remaining);   -- 已套用過的重送
    end if;
    -- 預約版本（名單／座位票／時長…）或退款筆數與登記時不同，這個操作即作廢：不需要有退款帳，即使從未成功寫過扣課帳，延遲到達也不能扣
    v_rev := public.fn_booking_rev_of(v_bk.id);
    select count(*) into v_ref from ticket_logs where ticket_id = p_ticket_id and booking_id = p_booking_id and action::text = 'refund';
    if v_rev is distinct from v_op.booking_rev or v_ref > v_op.refunds_at_begin then return jsonb_build_object('ok', false, 'error_code', 'STALE_OP'); end if;
  end if;

  if coalesce(v_tk.sessions_remaining, 0) <= 0 then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-',''), p_ticket_id, 'adjust', 0, p_booking_id, v_emp,
            '⚠ 已阻擋：餘額為 '||coalesce(v_tk.sessions_remaining,0)||'，未再扣課', now());
    return jsonb_build_object('ok', false, 'error_code', 'NO_REMAINING');
  end if;

  update member_tickets set sessions_remaining = sessions_remaining - 1
   where id = p_ticket_id returning sessions_remaining into v_rem;
  v_id := 'LG-'||replace(gen_random_uuid()::text,'-','');
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
  values (v_id, p_ticket_id, 'deduct', -1, p_booking_id, v_emp,
          coalesce(nullif(p_note,''), '預約扣課') || coalesce(v_marker, ''), now());
  return jsonb_build_object('ok', true, 'log_id', v_id, 'remaining', v_rem);
end
$fn$;

create or replace function public.fn_desk_cancel_booking(p_booking_id text, p_mode text default 'auto')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_emp text; b bookings%rowtype; r record; v_prev text; v_i int; v_ok boolean;
  v_ref int := 0; v_fail int := 0; v_tot int := 0; v_failed text[] := '{}'; v_tid text;
  v_outcome text; v_has_refund int;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_booking_id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if coalesce(p_mode, 'auto') not in ('auto', 'force', 'none', 'plain') then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_MODE'); end if;

  select * into b from bookings where id = p_booking_id for update;                    -- 先鎖預約
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if b.status::text = 'cancelled' then return jsonb_build_object('ok', true, 'already', true); end if;

  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);                                   -- 帳本 operator＝實際操作的員工（交易區域）
  for r in
    select l.ticket_id, sum(case when l.action::text = 'deduct' then 1 when l.action::text = 'refund' then -1 else 0 end)::int as net
      from ticket_logs l where l.booking_id = p_booking_id and l.ticket_id is not null
     group by l.ticket_id
    having sum(case when l.action::text = 'deduct' then 1 when l.action::text = 'refund' then -1 else 0 end) > 0
     order by l.ticket_id                                                                -- 固定順序，避免多筆取消互相等待
  loop
    v_tot := v_tot + r.net;
    if p_mode = 'none' then
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values (public.gen_short_id('LG-'), r.ticket_id, 'adjust', 0, p_booking_id, v_emp, '取消・扣課不退（櫃檯選擇，票視同已使用）');
    else
      for v_i in 1..r.net loop
        v_ok := public.fn_tk_refund_once(r.ticket_id, p_booking_id, '取消退課');
        if v_ok then v_ref := v_ref + 1;
        else v_fail := v_fail + 1; v_failed := v_failed || r.ticket_id; exit;            -- 這張票退不掉（例如餘額已滿）：記下，繼續處理其他票
        end if;
      end loop;
    end if;
  end loop;
  perform set_config('app.tk_operator', v_prev, true);

  if p_mode = 'none' then v_outcome := case when v_tot > 0 then 'operator_waived' else 'no_deduction' end;
  elsif v_fail > 0 then v_outcome := case when v_ref > 0 then 'refund_partial' else 'refund_failed' end;
  elsif v_ref > 0 then v_outcome := 'refunded';
  else v_outcome := 'no_deduction';
  end if;

  -- 退不掉的票留稽核標記（畫面用它分辨「系統沒退成」與「人員選擇不退」；與前端 BK_REFUND_*_NOTE 同字）
  foreach v_tid in array v_failed loop
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp,
            case when v_outcome = 'refund_partial' then '⚠ 取消・部分退款（這張票的退票失敗，待校正）' else '⚠ 取消・退票失敗（系統未能退回，待校正）' end);
  end loop;

  -- 沒有淨扣課可退、且綁了票（單人課）：與舊前端同樣留一筆說明帳
  if v_tot = 0 and p_mode <> 'plain' and b.ticket_id is not null then
    select count(*) into v_has_refund from ticket_logs where booking_id = p_booking_id and ticket_id = b.ticket_id and action::text = 'refund';
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), b.ticket_id, 'adjust', 0, p_booking_id, v_emp,
            case when v_has_refund > 0 then '系統偵測：這堂課先前已完成退款但預約狀態未同步，本次僅補上取消狀態，未重複退款'
                 else '取消未退課：這一堂在該票券上沒有淨扣課紀錄' end);
  end if;

  update bookings
     set status = 'cancelled', cancelled_at = now(),
         refund_waived = (v_outcome in ('operator_waived', 'refund_failed', 'refund_partial'))
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'outcome', v_outcome, 'refunded', v_ref, 'failed', v_fail,
                            'failed_tickets', to_jsonb(v_failed), 'net_total', v_tot);
end
$fn$;

revoke all on function public.fn_booking_rev_of(text) from public, anon, authenticated;
revoke all on function public.fn_desk_booking_rev(text) from public, anon;
grant execute on function public.fn_desk_booking_rev(text) to authenticated, service_role;
revoke all on function public.fn_desk_op_begin(text, text, text, text) from public, anon;
grant execute on function public.fn_desk_op_begin(text, text, text, text) to authenticated, service_role;
revoke all on function public.fn_desk_deduct_ticket(text, text, text, text) from public, anon;
grant execute on function public.fn_desk_deduct_ticket(text, text, text, text) to authenticated, service_role;
revoke all on function public.fn_desk_cancel_booking(text, text) from public, anon;
grant execute on function public.fn_desk_cancel_booking(text, text) to authenticated, service_role;
$mig$;
  select id into v_mid from members order by id limit 1;
  alter table public.ticket_logs disable trigger trg_tk_window_ledger;
  insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions) values
    ('PB-A',v_mid,'tt_group','A',8,5,'usable',8),('PB-B',v_mid,'tt_group','B',8,5,'usable',8),('PB-F',v_mid,'tt_group','F',8,8,'usable',8),
    ('PB-S',v_mid,'tt_group','S',8,4,'usable',8),('PB-T1',v_mid,'tt_group','T1',8,1,'usable',8),('PB-RF',v_mid,'tt_group','RF',8,3,'refunded',8),
    ('PB-M',v_mid,'tt_group','M',8,6,'usable',8),('PB-M2',v_mid,'tt_group','M2',8,6,'usable',8),('PB-X',v_mid,'tt_group','X',8,6,'usable',8),('PB-Y',v_mid,'tt_group','Y',8,6,'usable',8),
    ('PB-Z',v_mid,'tt_group','Z',8,6,'usable',8),('PB-Q',v_mid,'tt_group','Q',12,4,'usable',8),
    ('PB-AZ',v_mid,'tt_group','AZ',8,6,'usable',8),('PB-AX',v_mid,'tt_group','AX',8,6,'usable',8),('PB-AW',v_mid,'tt_group','AW',8,6,'usable',8);
  insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,max_heads,ticket_id) values
    ('PB-G1','小班肌力','2026-11-30','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-G2','小班肌力','2026-12-01','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-G3','小班肌力','2026-12-02','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-G4','小班肌力','2026-12-03','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-G5','小班肌力','2026-12-04','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-S1','私人教練','2026-12-05','10:00',60,'booked','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,1,'PB-S'),
    ('PB-S2','私人教練','2026-12-06','10:00',60,'booked','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,1,'PB-S'),
    ('PB-S3','私人教練','2026-12-07','10:00',60,'booked','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,1,null),
    ('PB-BX','小班肌力','2026-12-08','19:00',60,'cancelled',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-B1','小班肌力','2026-12-09','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-B2','小班肌力','2026-12-10','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-I1','小班肌力','2026-12-11','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-I2','小班肌力','2026-12-12','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-I3','小班肌力','2026-12-13','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-R1','小班肌力','2026-12-15','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-R2','小班肌力','2026-12-16','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-R3','自主訓練','2026-12-17','19:00',120,'booked','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,1,'PB-Z'),
    ('PB-R4','小班肌力','2026-12-18','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-AD1','自主訓練','2026-12-19','19:00',120,'booked','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,1,'PB-AZ'),
    ('PB-AS1','小班肌力','2026-12-20','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-AS2','小班肌力','2026-12-21','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-AS3','小班肌力','2026-12-22','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null);
  update member_tickets set sessions_remaining=2 where id='PB-A'; update member_tickets set sessions_remaining=4 where id='PB-B';
  insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values
    ('PB-L1','PB-A','deduct',-1,'PB-G1','x','夾具'),('PB-L2','PB-A','deduct',-1,'PB-G1','x','夾具'),('PB-L3','PB-B','deduct',-1,'PB-G1','x','夾具'),
    ('PB-L4','PB-A','deduct',-1,'PB-G2','x','夾具'),('PB-L5','PB-F','deduct',-1,'PB-G2','x','夾具'),('PB-L6','PB-F','deduct',-1,'PB-G3','x','夾具'),
    ('PB-L7','PB-A','deduct',-1,'PB-G4','x','夾具'),('PB-L8','PB-S','deduct',-1,'PB-S1','x','夾具');
  update member_tickets set sessions_remaining=3 where id='PB-S';
  create function pg_temp.q(p text) returns bigint language plpgsql as $f$ declare x bigint; begin execute p into x; return x; end $f$;
  create function pg_temp.as_user(u text) returns void language sql as $f$ select set_config('request.jwt.claim.sub', u, true), set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true) $f$;
  create function pg_temp.ded(p_t text, p_b text, p_note text default null, p_key text default null) returns jsonb language plpgsql as $f$ begin return public.fn_desk_deduct_ticket(p_t, p_b, p_note, p_key); exception when others then return jsonb_build_object('exception', sqlerrm); end $f$;
  create function pg_temp.rev(p_b text) returns text language plpgsql as $f$ begin return (public.fn_desk_booking_rev(p_b))->>'rev'; end $f$;
  create function pg_temp.begin_rev(p_slot text, p_t text, p_b text, p_rev text) returns jsonb language plpgsql as $f$ begin return public.fn_desk_op_begin(p_slot, p_t, p_b, p_rev); exception when others then return jsonb_build_object('exception', sqlerrm); end $f$;
  create function pg_temp.begin_op(p_slot text, p_t text, p_b text) returns text language plpgsql as $f$ declare x jsonb; begin x := public.fn_desk_op_begin(p_slot, p_t, p_b, (public.fn_desk_booking_rev(p_b))->>'rev'); return coalesce(x->>'op_key', x->>'error_code'); end $f$;
  create function pg_temp.cancel(p_b text, p_mode text default 'auto') returns jsonb language plpgsql as $f$ begin return public.fn_desk_cancel_booking(p_b, p_mode); exception when others then return jsonb_build_object('exception', sqlerrm); end $f$;
  create function pg_temp.rem(t text) returns bigint language sql as $f$ select sessions_remaining::bigint from member_tickets where id=t $f$;
  create function pg_temp.net(t text, b text) returns bigint language sql as $f$ select coalesce(sum(case when action::text='deduct' and delta<>0 then 1 when action::text='refund' then -1 else 0 end),0)::bigint from ticket_logs where ticket_id=t and booking_id=b $f$;

  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','',true);
  out := out || jsonb_build_object('S1_未登入', pg_temp.ded('PB-M','PB-B1'), 'S1b_未登入取消', pg_temp.cancel('PB-G5'), 'S1c_未登入取版本', public.fn_desk_booking_rev('PB-B1'));
  perform pg_temp.as_user(v_uid2::text);
  out := out || jsonb_build_object('S2_教練不可扣', pg_temp.ded('PB-M','PB-B1'), 'S2b_教練不可取消', jsonb_build_object('回傳', pg_temp.cancel('PB-G5'), '預約仍booked', pg_temp.q($$select count(*) from bookings where id='PB-G5' and status::text='booked'$$)=1), 'S2c_教練不可登記', pg_temp.begin_op('s','PB-M','PB-B1'), 'S2d_教練不可取版本', public.fn_desk_booking_rev('PB-B1'));
  perform pg_temp.as_user(v_uid::text);

  -- D 扣堂（一般）
  out := out || jsonb_build_object('D1_正常扣', jsonb_build_object('回傳', pg_temp.ded('PB-M','PB-B1','扣'), '餘額5', pg_temp.rem('PB-M')=5, '扣課帳', pg_temp.net('PB-M','PB-B1')));
  out := out || jsonb_build_object('D2_同預約重送只扣一次', jsonb_build_object('回傳', pg_temp.ded('PB-M','PB-B1'), '餘額仍5', pg_temp.rem('PB-M')=5, '淨1', pg_temp.net('PB-M','PB-B1')=1));
  out := out || jsonb_build_object('D3_最後一堂', jsonb_build_object('第一筆', pg_temp.ded('PB-T1','PB-B1'), '第二筆(循序)', pg_temp.ded('PB-T1','PB-B2'), '餘額0', pg_temp.rem('PB-T1')=0));
  out := out || jsonb_build_object('D5_已退款票不扣', jsonb_build_object('回傳', pg_temp.ded('PB-RF','PB-B1'), '餘額仍3', pg_temp.rem('PB-RF')=3));
  out := out || jsonb_build_object('D6_票／預約不存在或空', jsonb_build_object('票', pg_temp.ded('PB-NOPE','PB-B1'), '預約', pg_temp.ded('PB-M','PB-NOPE'), '空', pg_temp.ded('PB-M',null)));
  out := out || jsonb_build_object('D7_實際06額度觸發器擋下(分期用滿)_整體回滾', jsonb_build_object('回傳', pg_temp.ded('PB-Q','PB-B1','扣'), '餘額仍4', pg_temp.rem('PB-Q')=4, '無帳', pg_temp.q($$select count(*) from ticket_logs where ticket_id='PB-Q'$$)=0));
  create function public.zz_pb_fault() returns trigger language plpgsql as $f$ begin if new.note like 'FAULT%' then raise exception 'PB.INJECTED_LEDGER_FAILURE'; end if; return new; end $f$;
  create trigger zz_pb_fault before insert on public.ticket_logs for each row execute function public.zz_pb_fault();
  out := out || jsonb_build_object('D4_帳本寫入失敗_堂數一併回復', jsonb_build_object('回傳', pg_temp.ded('PB-M2','PB-B1','FAULT'), '餘額仍6', pg_temp.rem('PB-M2')=6, '無帳', pg_temp.q($$select count(*) from ticket_logs where ticket_id='PB-M2'$$)=0));

  -- O 操作登記與生命週期（真實流程：先取預約版本 → begin → 帶 op_key 扣課）
  k := pg_temp.begin_op('gcr:PB-B1:M:1','PB-X','PB-B1');
  out := out || jsonb_build_object('O1a_登記操作(e1)', k, 'O1b_重試沿用同一把', pg_temp.begin_op('gcr:PB-B1:M:1','PB-X','PB-B1')=k);
  out := out || jsonb_build_object('O2a_沒登記過的識別被拒', pg_temp.ded('PB-X','PB-B1',null,'gcr:PB-B1:M:9:e1'), 'O2b_識別屬於別張票被拒', pg_temp.ded('PB-Y','PB-B1',null,k), 'O2c_格式不對被拒', pg_temp.ded('PB-X','PB-B1',null,'garbage'));
  out := out || jsonb_build_object('O3a_第1堂', pg_temp.ded('PB-X','PB-B1','團課',k));
  out := out || jsonb_build_object('O4a_第2堂故障', pg_temp.ded('PB-X','PB-B1','FAULT',pg_temp.begin_op('gcr:PB-B1:M:2','PB-X','PB-B1')));
  drop trigger zz_pb_fault on public.ticket_logs; drop function public.zz_pb_fault();
  r := pg_temp.ded('PB-X','PB-B1','團課',pg_temp.begin_op('gcr:PB-B1:M:2','PB-X','PB-B1'));
  r := pg_temp.ded('PB-X','PB-B1','團課',pg_temp.begin_op('gcr:PB-B1:M:3','PB-X','PB-B1'));
  out := out || jsonb_build_object('O4b_重試後恰好三堂', jsonb_build_object('淨3', pg_temp.net('PB-X','PB-B1')=3, '餘額3', pg_temp.rem('PB-X')=3));
  r := pg_temp.ded('PB-X','PB-B1','團課',pg_temp.begin_op('gcr:PB-B1:M:1','PB-X','PB-B1')); r := pg_temp.ded('PB-X','PB-B1','團課',pg_temp.begin_op('gcr:PB-B1:M:2','PB-X','PB-B1')); r := pg_temp.ded('PB-X','PB-B1','團課',pg_temp.begin_op('gcr:PB-B1:M:3','PB-X','PB-B1'));
  out := out || jsonb_build_object('O3b_整組重送仍三堂', jsonb_build_object('淨3', pg_temp.net('PB-X','PB-B1')=3, '餘額3', pg_temp.rem('PB-X')=3));
  perform public.fn_tk_refund_once('PB-X','PB-B1','移除名額');
  k := pg_temp.begin_op('gcr:PB-B1:M:2','PB-X','PB-B1');
  out := out || jsonb_build_object('O5_退款後同名額begin→新世代e2並重新扣', jsonb_build_object('key', k, '回傳', pg_temp.ded('PB-X','PB-B1','團課',k), '淨3', pg_temp.net('PB-X','PB-B1')=3));
  out := out || jsonb_build_object('O7_舊世代(e1)已套用的重送_不重扣', jsonb_build_object('回傳', pg_temp.ded('PB-X','PB-B1','團課','gcr:PB-B1:M:2:e1'), '淨仍3', pg_temp.net('PB-X','PB-B1')=3));

  -- U 唯一性範圍：相同 slot、不同票／不同預約互不影響
  out := out || jsonb_build_object('U1_相同slot_不同票/不同預約各自e1', jsonb_build_object('X,B2', pg_temp.begin_op('same','PB-X','PB-B2'), 'Y,B2', pg_temp.begin_op('same','PB-Y','PB-B2'), 'Y,R1', pg_temp.begin_op('same','PB-Y','PB-R1'), '表內三列', pg_temp.q($$select count(*) from ticket_deduct_ops where slot='same'$$)=3));
  out := out || jsonb_build_object('U2_用別張票的登記去扣被拒', pg_temp.ded('PB-Z','PB-B2',null,'same:e1'), 'U2b_用別預約的登記去扣被拒', pg_temp.ded('PB-Y','PB-B1',null,'same:e1'));
  out := out || jsonb_build_object('U3_正確範圍可扣', jsonb_build_object('Y,B2', pg_temp.ded('PB-Y','PB-B2','x','same:e1'), 'Y,R1', pg_temp.ded('PB-Y','PB-R1','x','same:e1'), 'Y餘額4', pg_temp.rem('PB-Y')=4));

  -- R 撤除與失效（不需要有退款帳）
  -- R1 名額登記後尚未扣成功就被移除（只改名單，沒有退款）→ 舊操作作廢
  rv0 := pg_temp.rev('PB-R2'); k := (public.fn_desk_op_begin('gcr:PB-R2:M:1','PB-X','PB-R2',rv0))->>'op_key';
  update bookings set member_ids='[]'::jsonb where id='PB-R2';
  out := out || jsonb_build_object('R1a_移除名額後(無退款帳)舊操作被拒', jsonb_build_object('回傳', pg_temp.ded('PB-X','PB-R2','團課',k), '淨0', pg_temp.net('PB-X','PB-R2')=0, '無退款帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-R2' and action::text='refund'$$)=0));
  out := out || jsonb_build_object('R2_舊的begin請求(帶移除前版本)在移除後才到達_不得登記', pg_temp.begin_rev('gcr:PB-R2:M:1','PB-X','PB-R2',rv0), 'R2b_沒有新增登記', pg_temp.q($$select count(*) from ticket_deduct_ops where booking_id='PB-R2'$$)=1);
  out := out || jsonb_build_object('R2c_新的合法操作(重新讀版本)可登記並扣', jsonb_build_object('回傳', pg_temp.ded('PB-X','PB-R2','團課',pg_temp.begin_op('gcr:PB-R2:M:1','PB-X','PB-R2')), '淨1', pg_temp.net('PB-X','PB-R2')=1));
  -- R3 自主訓練時長 120→60：尚未扣成功的額外點數作廢（沒有退款帳）；舊 begin 遲到也不能登記
  rv0 := pg_temp.rev('PB-R3'); k := (public.fn_desk_op_begin('st:PB-R3:120:1','PB-Z','PB-R3',rv0))->>'op_key';
  update bookings set duration=60 where id='PB-R3';
  out := out || jsonb_build_object('R3a_時長縮短後舊的額外點數被拒', jsonb_build_object('回傳', pg_temp.ded('PB-Z','PB-R3','自主訓練',k), '淨0', pg_temp.net('PB-Z','PB-R3')=0, '餘額仍6', pg_temp.rem('PB-Z')=6));
  out := out || jsonb_build_object('R3b_舊begin遲到被拒', pg_temp.begin_rev('st:PB-R3:120:2','PB-Z','PB-R3',rv0));
  -- R4 已套用的操作，之後預約被更新（例如名單寫入）：重送仍 already（不因版本改變而重扣）；從未套用的舊請求被拒
  rv0 := pg_temp.rev('PB-R4'); k := (public.fn_desk_op_begin('gcr:PB-R4:M:1','PB-Y','PB-R4',rv0))->>'op_key';
  r := pg_temp.ded('PB-Y','PB-R4','團課',k);
  rv := (public.fn_desk_op_begin('gcr:PB-R4:M:2','PB-Y','PB-R4',rv0))->>'op_key';
  update bookings set seat_tickets=jsonb_build_object(v_mid,'PB-Y') where id='PB-R4';
  out := out || jsonb_build_object('R4a_已套用的重送(預約其後被更新)仍already不重扣', jsonb_build_object('回傳', pg_temp.ded('PB-Y','PB-R4','團課',k), '淨1', pg_temp.net('PB-Y','PB-R4')=1));
  out := out || jsonb_build_object('R4b_登記了但從未扣的第2個名額在預約更新後延遲到達被拒', jsonb_build_object('回傳', pg_temp.ded('PB-Y','PB-R4','團課',rv), '淨仍1', pg_temp.net('PB-Y','PB-R4')=1));

  -- C 取消
  r := pg_temp.cancel('PB-G1');
  out := out || jsonb_build_object('C1_團課兩張票全退', jsonb_build_object('回傳', r, 'A餘額4', pg_temp.rem('PB-A')=4, 'B餘額5', pg_temp.rem('PB-B')=5, '狀態', (select status::text||'/'||coalesce(refund_waived::text,'null') from bookings where id='PB-G1'), '退款帳3', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-G1' and action::text='refund'$$), '實際06版：帳本operator=操作員id', (select string_agg(distinct operator,',') from ticket_logs where booking_id='PB-G1' and action::text='refund')));
  r := pg_temp.cancel('PB-G2');
  out := out || jsonb_build_object('C2_部分退款', jsonb_build_object('回傳', r, 'A退回', pg_temp.net('PB-A','PB-G2')=0, 'F沒退', pg_temp.net('PB-F','PB-G2')=1, '預約', (select status::text||'/waived='||coalesce(refund_waived::text,'null') from bookings where id='PB-G2'), 'F有部分退款標記', pg_temp.q($$select count(*) from ticket_logs where ticket_id='PB-F' and booking_id='PB-G2' and note like '%取消・部分退款%'$$)=1, 'A沒有標記', pg_temp.q($$select count(*) from ticket_logs where ticket_id='PB-A' and booking_id='PB-G2' and action::text='adjust'$$)=0));
  r := pg_temp.cancel('PB-G3');
  out := out || jsonb_build_object('C3_全部退不掉', jsonb_build_object('回傳', r, '預約', (select status::text||'/waived='||coalesce(refund_waived::text,'null') from bookings where id='PB-G3'), '失敗標記', pg_temp.q($$select count(*) from ticket_logs where ticket_id='PB-F' and booking_id='PB-G3' and note like '%取消・退票失敗%'$$)=1));
  r := pg_temp.cancel('PB-G4','none');
  out := out || jsonb_build_object('C4a_人員選擇不退', jsonb_build_object('回傳', r, '沒退款', pg_temp.net('PB-A','PB-G4')=1, '預約', (select status::text||'/waived='||coalesce(refund_waived::text,'null') from bookings where id='PB-G4'), '有選擇帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-G4' and note like '取消・扣課不退%'$$)=1));
  r := pg_temp.cancel('PB-G5','none');
  out := out || jsonb_build_object('C4b_none但沒扣過_取消後實際狀態不標waived', jsonb_build_object('回傳', r, '取消後預約', (select status::text||'/waived='||coalesce(refund_waived::text,'null') from bookings where id='PB-G5')));
  r := pg_temp.cancel('PB-S1');
  out := out || jsonb_build_object('C5a_單人課auto退票', jsonb_build_object('回傳', r, 'S餘額4', pg_temp.rem('PB-S')=4));
  r := pg_temp.cancel('PB-S2');
  out := out || jsonb_build_object('C5b_單人課沒扣過auto_留說明帳', jsonb_build_object('回傳', r, '說明帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-S2' and note like '取消未退課%'$$)=1));
  r := pg_temp.cancel('PB-S3','plain');
  out := out || jsonb_build_object('C5c_plain沒扣過只取消', jsonb_build_object('回傳', r, '無帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-S3'$$)=0, '取消後預約', (select status::text from bookings where id='PB-S3')));
  out := out || jsonb_build_object('C6_已取消再取消=冪等', pg_temp.cancel('PB-G1'), 'C6b_壞模式', pg_temp.cancel('PB-I1','weird'));

  -- I 取消與扣堂／登記交錯（兩種先後；循序證據）
  r := pg_temp.ded('PB-X','PB-I1','團課',pg_temp.begin_op('i:1','PB-X','PB-I1'));
  r := pg_temp.cancel('PB-I1');
  out := out || jsonb_build_object('I1_扣堂先、取消後_取消連這一堂一起退', jsonb_build_object('取消回傳', r->>'outcome', '淨0', pg_temp.net('PB-X','PB-I1')=0));
  out := out || jsonb_build_object('I1b_之後再扣(舊key)被拒', jsonb_build_object('回傳', pg_temp.ded('PB-X','PB-I1','團課','i:1:e1'), '淨仍0', pg_temp.net('PB-X','PB-I1')=0));
  r := pg_temp.cancel('PB-I2');
  out := out || jsonb_build_object('I2_取消先、扣堂與登記後被拒', jsonb_build_object('扣堂', pg_temp.ded('PB-X','PB-I2'), '登記', pg_temp.begin_op('i:2','PB-X','PB-I2'), '淨0', pg_temp.net('PB-X','PB-I2')=0));
  k := pg_temp.begin_op('i:3','PB-X','PB-I3');
  r := pg_temp.cancel('PB-I3');
  out := out || jsonb_build_object('I3_已登記未扣、取消後延遲到達被拒', jsonb_build_object('回傳', pg_temp.ded('PB-X','PB-I3',null,k), '淨0', pg_temp.net('PB-X','PB-I3')=0));

  -- F 取消途中故障：整個回滾
  insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,max_heads) values ('PB-GF','小班肌力','2026-12-14','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5);
  update member_tickets set sessions_remaining=sessions_remaining-1 where id in ('PB-M','PB-M2');
  insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('PB-LF1','PB-M','deduct',-1,'PB-GF','x','夾具'),('PB-LF2','PB-M2','deduct',-1,'PB-GF','x','夾具');
  create function public.zz_pb_fault2() returns trigger language plpgsql as $f$ begin if new.action::text='refund' and new.ticket_id='PB-M2' then raise exception 'PB.INJECTED_REFUND_FAILURE'; end if; return new; end $f$;
  create trigger zz_pb_fault2 before insert on public.ticket_logs for each row execute function public.zz_pb_fault2();
  r := pg_temp.cancel('PB-GF');
  out := out || jsonb_build_object('F1_取消途中故障_整體回滾', jsonb_build_object('回傳', r, '預約仍booked', pg_temp.q($$select count(*) from bookings where id='PB-GF' and status::text='booked'$$)=1, '第一張票也沒退', pg_temp.net('PB-M','PB-GF')=1, '無退款帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-GF' and action::text='refund'$$)=0));
  drop trigger zz_pb_fault2 on public.ticket_logs; drop function public.zz_pb_fault2();


  -- A 內容改回原樣（A→B→A）：版本是單調計數（由 bookings 觸發器加一），不會倒退
  -- A1 時長 120→60→120，期間沒有退款帳；第一個 120 時登記的舊請求此時才到達
  rv0 := pg_temp.rev('PB-AD1');
  k := (public.fn_desk_op_begin('st:PB-AD1:120:1','PB-AZ','PB-AD1',rv0))->>'op_key';
  update bookings set duration=60 where id='PB-AD1';
  update bookings set duration=120 where id='PB-AD1';
  out := out || jsonb_build_object('ABA1_內容已改回原樣但版本不同', jsonb_build_object('duration', (select duration from bookings where id='PB-AD1'), '無退款帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-AD1' and action::text='refund'$$)=0, '版本已前進(單調)', pg_temp.rev('PB-AD1')::bigint > rv0::bigint, '版本值=', pg_temp.rev('PB-AD1')));
  out := out || jsonb_build_object('ABA2_舊扣課請求遲到被拒', jsonb_build_object('回傳', pg_temp.ded('PB-AZ','PB-AD1','自主訓練',k), '淨0', pg_temp.net('PB-AZ','PB-AD1')=0));
  out := out || jsonb_build_object('ABA3_舊登記請求(帶第一個120版本)遲到被拒', pg_temp.begin_rev('st:PB-AD1:120:2','PB-AZ','PB-AD1',rv0), 'ABA3b_沒有新增登記', pg_temp.q($$select count(*) from ticket_deduct_ops where booking_id='PB-AD1'$$)=1);
  out := out || jsonb_build_object('ABA4_新的合法操作(重新讀版本)可登記並扣', jsonb_build_object('回傳', pg_temp.ded('PB-AZ','PB-AD1','自主訓練',pg_temp.begin_op('st:PB-AD1:120:1','PB-AZ','PB-AD1')), '淨1', pg_temp.net('PB-AZ','PB-AD1')=1));
  -- A2 名額移除後再加入，名單恢復原樣
  rv0 := pg_temp.rev('PB-AS1');
  k := (public.fn_desk_op_begin('gcr:PB-AS1:M:1','PB-AX','PB-AS1',rv0))->>'op_key';
  update bookings set member_ids='[]'::jsonb where id='PB-AS1';
  update bookings set member_ids=jsonb_build_array(v_mid) where id='PB-AS1';
  out := out || jsonb_build_object('ABA5_名額移除再加入_舊扣課遲到被拒', jsonb_build_object('回傳', pg_temp.ded('PB-AX','PB-AS1','團課',k), '淨0', pg_temp.net('PB-AX','PB-AS1')=0, '無退款帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-AS1' and action::text='refund'$$)=0));
  out := out || jsonb_build_object('ABA6_舊登記請求遲到被拒', pg_temp.begin_rev('gcr:PB-AS1:M:2','PB-AX','PB-AS1',rv0));
  -- A3 座位票改了又改回
  rv0 := pg_temp.rev('PB-AS3');
  k := (public.fn_desk_op_begin('gcr:PB-AS3:M:1','PB-AW','PB-AS3',rv0))->>'op_key';
  update bookings set seat_tickets=jsonb_build_object(v_mid,'PB-AW') where id='PB-AS3';
  update bookings set seat_tickets='{}'::jsonb where id='PB-AS3';
  out := out || jsonb_build_object('ABA7_座位票改了又改回_舊扣課遲到被拒', jsonb_build_object('回傳', pg_temp.ded('PB-AW','PB-AS3','團課',k), '淨0', pg_temp.net('PB-AW','PB-AS3')=0));
  -- 保留的性質
  rv0 := pg_temp.rev('PB-AS2');
  k := (public.fn_desk_op_begin('gcr:PB-AS2:M:1','PB-AX','PB-AS2',rv0))->>'op_key';
  r := pg_temp.ded('PB-AX','PB-AS2','團課',k);
  update bookings set duration=90 where id='PB-AS2'; update bookings set duration=60 where id='PB-AS2';
  out := out || jsonb_build_object('ABA8_已套用重送(之後內容改又改回)仍already不重扣', jsonb_build_object('回傳', pg_temp.ded('PB-AX','PB-AS2','團課',k), '淨1', pg_temp.net('PB-AX','PB-AS2')=1));
  r := pg_temp.ded('PB-AX','PB-AS2','團課',pg_temp.begin_op('gcr:PB-AS2:M:2','PB-AX','PB-AS2'));
  r := pg_temp.ded('PB-AX','PB-AS2','團課',pg_temp.begin_op('gcr:PB-AS2:M:3','PB-AX','PB-AS2'));
  out := out || jsonb_build_object('ABA9_正常連續多堂(期間預約未變)不被誤擋', pg_temp.net('PB-AX','PB-AS2')=3);
  rv0 := pg_temp.rev('PB-AS2'); update bookings set note='備註變更' where id='PB-AS2';
  out := out || jsonb_build_object('ABA10_改備註(無關欄位)版本不變', pg_temp.rev('PB-AS2')=rv0);
  rv0 := pg_temp.rev('PB-AS2'); update bookings set status='cancelled' where id='PB-AS2';
  out := out || jsonb_build_object('ABA11_取消(狀態)版本前進', pg_temp.rev('PB-AS2')::bigint > rv0::bigint);
  out := out || jsonb_build_object('ABA12_版本只由觸發器寫入_API角色不可直接讀寫', jsonb_build_object('RLS', (select relrowsecurity from pg_class where oid='public.booking_op_rev'::regclass), 'policy數', (select count(*) from pg_policies where tablename='booking_op_rev'), '內部函式不授權給authenticated', has_function_privilege('authenticated','public.fn_booking_rev_of(text)','execute'), '觸發器存在', (select count(*) from pg_trigger where tgname='trg_booking_op_rev' and not tgisinternal)));

  out := out || jsonb_build_object('權限', jsonb_build_object('anon取消', has_function_privilege('anon','public.fn_desk_cancel_booking(text,text)','execute'), 'anon版本', has_function_privilege('anon','public.fn_desk_booking_rev(text)','execute'), 'authenticated取消', has_function_privilege('authenticated','public.fn_desk_cancel_booking(text,text)','execute'), 'ops表RLS', (select relrowsecurity from pg_class where oid='public.ticket_deduct_ops'::regclass), 'ops表policy數', (select count(*) from pg_policies where tablename='ticket_deduct_ops'), '主鍵', (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.ticket_deduct_ops'::regclass and contype='p')));
  raise exception 'DESK_RESULT: %', out::text;
end $t$;
