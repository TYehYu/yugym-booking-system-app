-- 階段 08：櫃檯扣堂＋取消原子化（兩張表＋bookings 上兩個觸發器＋函式，不動任何既有資料與函式）。⚠ 只供審查；尚未在正式庫執行。
-- 注意：會在 bookings 新增兩個觸發器（更新時只在 狀態／名單／座位票／時長／日期／開始時間／綁定票 改變才進函式；新增與刪除一律進函式），並替每筆既有預約建立版本計數。
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then raise exception 'PROD.GUARD: 叢集識別不是正式庫，停止'; end if;
  if to_regclass('public.change_log') is null then raise exception 'PROD.GUARD: 沒有 change_log，不像正式庫，停止'; end if;
  if to_regprocedure('public.fn_tk_refund_once(text,text,text)') is null or to_regprocedure('public.fn_refund_ticket(text,text,text)') is null then raise exception '08.GUARD: 06 階段（原子退票）尚未安裝，停止'; end if;
  -- 只在「函式或觸發器已存在」時停止（避免覆蓋）。兩張表（ticket_deduct_ops、booking_op_rev）存在不阻擋：那是上次回復保留下來的，重裝會沿用並讓所有版本前進。
  if to_regprocedure('public.fn_desk_deduct_ticket(text,text,text,text)') is not null or to_regprocedure('public.fn_desk_cancel_booking(text,text)') is not null
     or to_regprocedure('public.fn_desk_op_begin(text,text,text,text)') is not null or to_regprocedure('public.fn_desk_booking_rev(text)') is not null
     or to_regprocedure('public.fn_booking_rev_of(text)') is not null
     or exists (select 1 from pg_trigger where tgname in ('trg_booking_op_rev','trg_booking_op_rev_insdel') and not tgisinternal) then
    raise exception '08.GUARD: 08 的函式或觸發器已存在，停止（避免覆蓋）'; end if;
end
$guard$;
-- 櫃檯扣堂＋取消原子化（P0E 階段 08；2026-11-18，rev6）
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

commit;
