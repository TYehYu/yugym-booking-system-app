-- TEST DATABASE ONLY. Atomic install, no fixture rows. Snapshot first.
do $health$
declare out jsonb:='[]'; r jsonb; before_n int; after_n int; i int; u uuid;
begin
 if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY'; end if;
execute $fixed$drop function if exists public.fn_cancel_booking(text,text);
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

CREATE OR REPLACE FUNCTION public.fn_log_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.change_log(tbl,row_id,op)
  values (tg_table_name,
          coalesce((case when tg_op='DELETE' then old.id else new.id end), '')::text,
          left(tg_op,1));
  return null;   -- AFTER trigger，回傳值不影響原本的寫入
end $function$;
CREATE OR REPLACE FUNCTION public.fn_bookings_group_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cat text;
begin
  -- service_role / 後端排程一律放行（同 fn_members_guard 的第一道）
  if coalesce(auth.role(),'') not in ('anon','authenticated') then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  -- 櫃檯以上（含店長、管理員）不受限
  if coalesce(is_staff_desk(), false) then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  v_cat := case when TG_OP='DELETE' then old.category::text else new.category::text end;
  -- 教練（非店長）不能「建立」或「刪除」團體課；更新不擋 —— 教練請假要改自己的團課
  if v_cat = '小班肌力' and current_staff_role() is not null then
    raise exception 'BK.GUARD: 團體課的建立與刪除只有櫃檯以上可以做（教練請改用「教練請假」）';
  end if;
  return case when TG_OP='DELETE' then old else new end;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_bookings_cancelled_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'cancelled' and new.cancelled_by is null then
    new.cancelled_by := coalesce(old.cancelled_by, current_employee_id(), current_member_id());
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.trg_bookings_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.date       is distinct from old.date
  or new.start_time is distinct from old.start_time
  or new.duration   is distinct from old.duration then
    new.updated_at := now();
  end if;
  return new;
end $function$;
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
$function$;
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

  -- 2026-11-16 沒有合約的卡位（D 模式）：綁了會員的待簽約卡位可以排在任意未來日期，不受月份限制。
  -- 「每次操作只能排七天（最早一堂 D 起，D～D+6）」由前端建立流程負責；到期、簽到、轉正的限制見 fn_hold_state_guard。沒有會員的空堂仍受原月份限制。
  if new.member_id is not null then return new; end if;

  raise exception 'HOLD.MONTH_LIMIT:%', to_char(v_end, 'YYYY-MM-DD')
    using errcode = 'P0001',
          hint = '沒有符合資格票券的卡位只能預約到 ' || to_char(v_end, 'YYYY/MM/DD') || '；每月最後一個星期一起開放下個月';
end
$function$;
CREATE OR REPLACE FUNCTION public.trg_tk_window_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin perform public.fn_tk_window_check(new.ticket_id); return null; end $function$;
CREATE OR REPLACE FUNCTION public.trg_tk_window_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(current_setting('app.tkwin_skip_booking', true), '') = 'on' then return null; end if;
  perform public.fn_tk_window_check(new.ticket_id);
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_tk_checkin_activate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_old boolean; v_new boolean; r record; v_mem text;
begin
  if coalesce(new.category::text, '') <> '小班肌力' then
    v_old := public.fn_bk_attended(old);
    v_new := public.fn_bk_attended(new);
    if new.ticket_id is not null then
      if v_new and not v_old then perform public.fn_tk_activate(new.ticket_id, new.date, new.id);
      elsif v_old and not v_new then perform public.fn_tk_recalc(new.ticket_id, new.id);
      end if;
    end if;
    return null;
  end if;
  -- 團課：attendance 逐座位（key＝會員id 或 會員id#序號）
  for r in
    select k.key as seat_key,
           (coalesce(case when jsonb_typeof(new.attendance) = 'object' then new.attendance->>k.key end, '') = 'checked_in') as now_in,
           (coalesce(case when jsonb_typeof(old.attendance) = 'object' then old.attendance->>k.key end, '') = 'checked_in') as was_in
      from ( select jsonb_object_keys(coalesce(case when jsonb_typeof(new.attendance) = 'object' then new.attendance end, '{}'::jsonb)
                                      || coalesce(case when jsonb_typeof(old.attendance) = 'object' then old.attendance end, '{}'::jsonb)) as key ) k
  loop
    continue when r.now_in = r.was_in;
    perform public.fn_tk_group_seat(new.id, new.date, public.fn_tk_seat_member(r.seat_key), r.now_in);
  end loop;
  -- 舊結構團課（member_ids 為空、逐筆單人、用 status 簽到）
  if coalesce(jsonb_array_length(case when jsonb_typeof(new.member_ids) = 'array' then new.member_ids else '[]'::jsonb end), 0) = 0
     and new.member_id is not null then
    v_old := public.fn_bk_attended(old);
    v_new := public.fn_bk_attended(new);
    if v_new is distinct from v_old then
      perform public.fn_tk_group_seat(new.id, new.date, new.member_id, v_new);
    end if;
  end if;
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.trg_tk_quota_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.trg_booking_op_rev()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id text := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  insert into public.booking_op_rev(booking_id, rev) values (v_id, 1)
  on conflict (booking_id) do update set rev = public.booking_op_rev.rev + 1;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_hold_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.trg_contract_window_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if pg_trigger_depth() > 1 then return null; end if;                                        -- 合約取消／刪除的連動取消（巢狀）不檢查
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return null; end if;    -- 維運例外
  if tg_op = 'UPDATE' and old.contract_id is not null and old.contract_id is distinct from new.contract_id then
    perform public.fn_contract_window_check(old.contract_id, false);                          -- 搬出去的那份合約：只重算區間，不因它的設定異常而擋
  end if;
  if new.contract_id is not null then perform public.fn_contract_window_check(new.contract_id, new.status::text <> 'cancelled'); end if;
  return null;
end
$function$;
drop trigger if exists bookings_cancelled_by on public.bookings;
CREATE TRIGGER bookings_cancelled_by BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_bookings_cancelled_by();
drop trigger if exists bookings_touch on public.bookings;
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_bookings_touch();
drop trigger if exists trg_booking_op_rev on public.bookings;
CREATE TRIGGER trg_booking_op_rev AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.member_ids IS DISTINCT FROM new.member_ids) OR (old.seat_tickets IS DISTINCT FROM new.seat_tickets) OR (old.duration IS DISTINCT FROM new.duration) OR (old.date IS DISTINCT FROM new.date) OR (old.start_time IS DISTINCT FROM new.start_time) OR (old.ticket_id IS DISTINCT FROM new.ticket_id))) EXECUTE FUNCTION trg_booking_op_rev();
drop trigger if exists trg_booking_op_rev_insdel on public.bookings;
CREATE TRIGGER trg_booking_op_rev_insdel AFTER INSERT OR DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_booking_op_rev();
drop trigger if exists trg_bookings_contract_hold_guard on public.bookings;
CREATE TRIGGER trg_bookings_contract_hold_guard BEFORE INSERT OR UPDATE OF contract_id, status, member_id, ticket_type_id, pending_contract, ticket_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_contract_hold_guard();
drop trigger if exists trg_bookings_group_guard on public.bookings;
CREATE TRIGGER trg_bookings_group_guard BEFORE INSERT OR DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_bookings_group_guard();
drop trigger if exists trg_bookings_hold_month_guard on public.bookings;
CREATE TRIGGER trg_bookings_hold_month_guard BEFORE INSERT OR UPDATE OF date, pending_contract, ticket_id, status, category, ticket_type_id, member_id, contract_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_hold_month_guard();
drop trigger if exists trg_bookings_hold_state_guard on public.bookings;
CREATE TRIGGER trg_bookings_hold_state_guard BEFORE INSERT OR UPDATE OF status, ticket_id, date ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_hold_state_guard();
drop trigger if exists trg_change_log on public.bookings;
CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_log_change();
drop trigger if exists trg_contract_window_ins on public.bookings;
CREATE TRIGGER trg_contract_window_ins AFTER INSERT ON public.bookings FOR EACH ROW WHEN (((new.contract_id IS NOT NULL) AND ((new.status)::text <> 'cancelled'::text))) EXECUTE FUNCTION trg_contract_window_booking();
drop trigger if exists trg_contract_window_upd on public.bookings;
CREATE TRIGGER trg_contract_window_upd AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((new.contract_id IS NOT NULL) AND ((new.date IS DISTINCT FROM old.date) OR (new.status IS DISTINCT FROM old.status) OR (new.contract_id IS DISTINCT FROM old.contract_id)))) EXECUTE FUNCTION trg_contract_window_booking();
drop trigger if exists trg_tk_checkin_activate on public.bookings;
CREATE TRIGGER trg_tk_checkin_activate AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((old.checked_in_at IS DISTINCT FROM new.checked_in_at) OR (old.status IS DISTINCT FROM new.status) OR (old.attendance IS DISTINCT FROM new.attendance))) EXECUTE FUNCTION trg_tk_checkin_activate();
drop trigger if exists trg_tk_window_booking_ins on public.bookings;
CREATE TRIGGER trg_tk_window_booking_ins AFTER INSERT ON public.bookings FOR EACH ROW WHEN (((new.ticket_id IS NOT NULL) AND ((new.status)::text IS DISTINCT FROM 'cancelled'::text))) EXECUTE FUNCTION trg_tk_window_booking();
drop trigger if exists trg_tk_window_booking_upd on public.bookings;
CREATE TRIGGER trg_tk_window_booking_upd AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((new.ticket_id IS NOT NULL) AND ((new.status)::text IS DISTINCT FROM 'cancelled'::text) AND ((new.date IS DISTINCT FROM old.date) OR (new.ticket_id IS DISTINCT FROM old.ticket_id) OR (NOT ((old.status)::text IS DISTINCT FROM 'cancelled'::text))))) EXECUTE FUNCTION trg_tk_window_booking();
drop trigger if exists trg_change_log on public.member_tickets;
CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.member_tickets FOR EACH ROW EXECUTE FUNCTION fn_log_change();
drop trigger if exists trg_tk_quota_guard on public.member_tickets;
CREATE TRIGGER trg_tk_quota_guard BEFORE UPDATE OF sessions_remaining, sessions_total, unlocked_sessions ON public.member_tickets FOR EACH ROW EXECUTE FUNCTION trg_tk_quota_guard();
drop trigger if exists trg_change_log on public.ticket_logs;
CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.ticket_logs FOR EACH ROW EXECUTE FUNCTION fn_log_change();
drop trigger if exists trg_tk_window_ledger on public.ticket_logs;
CREATE TRIGGER trg_tk_window_ledger AFTER INSERT ON public.ticket_logs FOR EACH ROW WHEN (((new.action)::text = 'deduct'::text)) EXECUTE FUNCTION trg_tk_window_ledger();

alter table public.bookings add column if not exists seat_notes jsonb;
CREATE OR REPLACE FUNCTION public.fn_seat_map_reindex(p_map jsonb, p_keys text[], p_mids text[], p_idx integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_mid text := p_mids[p_idx]; v_out jsonb := coalesce(p_map, '{}'::jsonb); v_kept jsonb[] := '{}'; i integer; n integer := 0;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then return p_map; end if;
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    if p_mids[i] = v_mid and i <> p_idx then v_kept := v_kept || (p_map -> p_keys[i]); end if;
  end loop;
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    if p_mids[i] = v_mid then v_out := v_out - p_keys[i]; end if;
  end loop;
  for i in 1 .. coalesce(array_length(v_kept, 1), 0) loop
    if v_kept[i] is not null and v_kept[i] <> 'null'::jsonb then
      v_out := v_out || jsonb_build_object(case when i > 1 then v_mid || '#' || i else v_mid end, v_kept[i]);
    end if;
  end loop;
  return v_out;
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_desk_deduct_ticket(p_ticket_id text, p_booking_id text, p_note text DEFAULT NULL::text, p_op_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.fn_member_join_group(p_booking_id text, p_ticket_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_mid text := current_member_id();
        v_b bookings%rowtype; v_tk member_tickets%rowtype; v_cnt int; v_max int;
        v_seats int; v_key text;
begin
  if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select * into v_b from bookings where id=p_booking_id for update;
  if not found or v_b.status <> 'booked' or v_b.category::text <> '小班肌力' then
    return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
  if (v_b.date::text||' '||v_b.start_time)::timestamp <= (now() at time zone 'Asia/Taipei') then
    return jsonb_build_object('ok',false,'error_code','BOOKING.PAST_DATE'); end if;
  -- 會員端團課只開放「一週內」報名（2026-09-08 使用者指示）：今天算第 1 天，往後含今天共 7 天。
  -- 前端三道（預約表單來源、首頁課卡圓鈕、報名前攔截）已經擋住，這裡是最後一道 --
  -- 前端是畫面，不是防線。⚠ 只擋會員自己報名這條路；櫃檯與教練排課不經過這支。
  if v_b.date > (((now() at time zone 'Asia/Taipei')::date) + 6) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.TOO_FAR'); end if;
  if coalesce(v_b.member_ids,'[]'::jsonb) @> to_jsonb(v_mid) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.DUP'); end if;
  -- 有效名額＝名單數 − 請假數（2026-08-12 請假釋出名額）
  v_cnt := jsonb_array_length(coalesce(v_b.member_ids,'[]'::jsonb))
         - (select count(*)::int from jsonb_each_text(coalesce(v_b.attendance,'{}'::jsonb)) t where t.value='leave');
  -- 2026-10-09 使用者指示：「完全沒有人報名的要阻擋」「因為教練可能會有其他安排
  -- 不能臨時安插上課」，同日再收斂：「這一句只限當天的課程　如果會員要加隔天沒人
  -- 報名的課程是可以的」。
  --   → **只有今天**的團課、而且一個人都還沒有時，會員不能自己報進去。
  --     隔天以後的空堂照樣開放（教練還有時間安排）。
  -- ⚠ 用有效名額判斷：名單上只剩請假的人，等於沒有人。
  -- ⚠ 只擋會員自己報名這條路 —— 櫃檯／教練改名單走的是 bookings 的直接寫入，
  --   不經過這支，所以「跟教練溝通過後臨時加開」的權限完全沒有被動到。
  if v_cnt <= 0 and v_b.date = ((now() at time zone 'Asia/Taipei')::date) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.NO_SEED'); end if;
  v_max := coalesce(v_b.max_heads,5);
  if v_cnt >= v_max then return jsonb_build_object('ok',false,'error_code','BOOKING.FULL'); end if;

  if p_ticket_id is not null then
    select mt.* into v_tk from member_tickets mt
      join ticket_types tt on tt.id=mt.ticket_type_id
     where mt.id=p_ticket_id and mt.member_id=v_mid and mt.status='usable'
       and coalesce(mt.sessions_remaining,0)>0 and tt.category::text='小班肌力'
       and (mt.expire_date is null or mt.expire_date >= v_b.date)
     limit 1 for update;
    if not found then return jsonb_build_object('ok',false,'error_code','TICKET.INVALID_PICK'); end if;
  else
    select mt.* into v_tk from member_tickets mt
      join ticket_types tt on tt.id=mt.ticket_type_id
     where mt.member_id=v_mid and mt.status='usable' and coalesce(mt.sessions_remaining,0)>0
       and tt.category::text='小班肌力'
       and (mt.expire_date is null or mt.expire_date >= v_b.date)
     order by mt.expire_date asc nulls last, mt.purchase_date asc nulls last, mt.created_at asc
     limit 1 for update;
    if not found then return jsonb_build_object('ok',false,'error_code','TICKET.NONE'); end if;
  end if;

  -- ── 2026-10-20 新增：逐名額記下用了哪張票 ─────────────────────────
  -- 原本不寫 seat_tickets，櫃檯之後要替同一人加第 2 個名額時，_used 看不到這張票、
  -- 沒帶 multi，就撞上「這一堂在這張票上已經扣過 1 堂」的護欄 → 名額加了、堂數沒扣
  -- （柯麗貞 10/20 就是這樣）。名額鍵照前端 seatKeys()：第 1 格＝mid、第 2 格起＝mid#n。
  -- ⚠ 上面的 BOOKING.DUP 讓同一位會員不能從會員端報第二格，所以 v_seats 目前恆為 0；
  --   照規則算是為了日後放寬時不會寫錯鍵 —— 寫錯鍵＝圓形卡認錯格（0829 踩過）。
  select count(*)::int into v_seats
    from jsonb_array_elements_text(coalesce(v_b.member_ids,'[]'::jsonb)) x where x = v_mid;
  v_key := case when v_seats > 0 then v_mid||'#'||(v_seats+1) else v_mid end;

  update bookings
     set member_ids   = coalesce(member_ids,'[]'::jsonb) || to_jsonb(v_mid),
         seat_tickets = coalesce(seat_tickets,'{}'::jsonb) || jsonb_build_object(v_key, v_tk.id)
   where id=v_b.id;
  -- ──────────────────────────────────────────────────────────────────
  update member_tickets set sessions_remaining = sessions_remaining-1,
         status = case when sessions_remaining-1<=0 then 'used_up' else status end
   where id=v_tk.id;
  insert into ticket_logs (id,ticket_id,action,delta,booking_id,operator,note)
  values (gen_short_id('LG-'),v_tk.id,'deduct',-1,v_b.id,v_mid,
          case when p_ticket_id is null then '會員自行報名團體課扣 1 堂'
               else '會員自行報名團體課扣 1 堂（會員指定此票券）' end);
  perform desk_alert(v_mid,'self_book','　自行報名了團體課',
    to_char(v_b.date,'MM/DD')||' '||v_b.start_time||'　團體課（名單 '||(v_cnt+1)||'/'||v_max||'）');
  return jsonb_build_object('ok',true,'booking_id',v_b.id,'ticket_id',v_tk.id,'remaining_after',v_tk.sessions_remaining-1);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;
CREATE OR REPLACE FUNCTION public.trg_tk_quota_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
-- TEST ONLY; atomic statement; no production authorization.
do $install$ begin
 if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY'; end if;
 execute $candidate$-- Internal helper: zero-value links are not charges; nonstandard legacy deltas need review.
create or replace function public.fn_ticket_net_checked(p_ticket text,p_booking text) returns integer
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $fn$
declare d int; r int; bad int;
begin
 select count(*) filter(where action::text='deduct' and delta=-1),
        count(*) filter(where action::text='refund' and delta=1),
        count(*) filter(where (action::text='deduct' and (delta is null or delta not in (-1,0)))
                          or (action::text='refund' and (delta is null or delta<>1)))
 into d,r,bad from public.ticket_logs where ticket_id=p_ticket and booking_id=p_booking;
 if bad>0 then raise exception 'TICKET.LEDGER_AMBIGUOUS'; end if;
 if r>d then raise exception 'TICKET.LEDGER_NEGATIVE'; end if;
 return d-r;
end $fn$;
revoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_deduct_ticket(p_ticket_id text, p_booking_id text, p_note text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_expire_date date DEFAULT NULL::date, p_activated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp  text;
  v_desk boolean;
  v_bk   record;
  v_tk   record;
  v_net  int;
  v_id   text;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF');
  end if;
  select is_staff_desk() into v_desk;

  select id, coach_id, substitute_coach_id, status into v_bk from bookings where id = p_booking_id for update;
  if v_bk.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING');
  end if;

  -- 教練（非店長）只能扣自己那一堂；代課教練也算自己的課
  if not coalesce(v_desk,false)
     and v_bk.coach_id is distinct from v_emp
     and v_bk.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_YOUR_BOOKING');
  end if;

  if v_bk.status::text='cancelled' then return jsonb_build_object('ok',false,'error_code','BOOKING_CANCELLED'); end if;

  select id, status, sessions_remaining into v_tk from member_tickets where id = p_ticket_id for update;
  if v_tk.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NO_TICKET');
  end if;

  -- 冪等：這一堂在這張票上已經有淨扣課就不再扣（與前端 tkNetDeductOn 同口徑）
  v_net := public.fn_ticket_net_checked(p_ticket_id,p_booking_id);
  if v_tk.status::text not in ('usable','used_up') or v_tk.status is null then
    return jsonb_build_object('ok',false,'error_code','TICKET_NOT_USABLE');
  end if;
  if v_net > 0 then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-','')::text, p_ticket_id, 'adjust', 0,
            p_booking_id, v_emp,
            '⚠ 已阻擋：這一堂在這張票上已經扣過 '||v_net||' 堂，不重複扣', now());
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if v_tk.status::text<>'usable' then return jsonb_build_object('ok',false,'error_code','TICKET_NOT_USABLE'); end if;
  if coalesce(v_tk.sessions_remaining, 0) <= 0 then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-','')::text, p_ticket_id, 'adjust', 0,
            p_booking_id, v_emp,
            '⚠ 已阻擋：餘額為 '||coalesce(v_tk.sessions_remaining,0)||'，未再扣課', now());
    return jsonb_build_object('ok', false, 'error_code', 'NO_REMAINING');
  end if;

  -- 效期開通的日期由前端算（activateTicketIfNeeded／termExpire 的規則在那裡），
  -- 這裡只負責「有帶才寫」，不覆蓋既有值成 null。
  update member_tickets
     set sessions_remaining = sessions_remaining - 1,
         start_date   = coalesce(p_start_date,   start_date),
         expire_date  = coalesce(p_expire_date,  expire_date),
         activated_at = coalesce(p_activated_at, activated_at)
   where id = p_ticket_id;

  v_id := 'LG-'||replace(gen_random_uuid()::text,'-','');
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
  values (v_id, p_ticket_id, 'deduct', -1, p_booking_id, v_emp,
          coalesce(nullif(p_note,''), '預約扣課'), now());

  return jsonb_build_object('ok', true, 'log_id', v_id);
end $function$;
CREATE OR REPLACE FUNCTION public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t member_tickets%rowtype; v_net integer; v_op text := coalesce(nullif(current_setting('app.tk_operator', true), ''), 'system');
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  v_net := public.fn_ticket_net_checked(p_ticket,p_booking);
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
$function$;
CREATE OR REPLACE FUNCTION public.fn_refund_ticket(p_ticket_id text, p_booking_id text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp text; v_desk boolean; b bookings%rowtype; t member_tickets%rowtype;
  v_d integer; v_r integer; v_a integer; v_ok boolean; v_after integer;
  v_prev text;
begin
  perform set_config('lock_timeout', '3000', true);
  if p_ticket_id is null or p_booking_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.BAD_ARGS'); end if;
  v_emp := current_employee_id();
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  v_desk := coalesce(is_staff_desk(), false);

  select * into b from bookings where id = p_booking_id for update;                       -- 先鎖預約
  if not found then return jsonb_build_object('ok', false, 'error_code', 'REFUND.NO_BOOKING'); end if;
  if not v_desk and b.coach_id is distinct from v_emp and b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.FORBIDDEN'); end if;

  select * into t from member_tickets where id = p_ticket_id for update;                  -- 再鎖票券（並行呼叫在這裡排隊）
  if not found then return jsonb_build_object('ok', false, 'error_code', 'REFUND.NO_TICKET'); end if;

  perform public.fn_ticket_net_checked(p_ticket_id,p_booking_id);
  select count(*) filter (where action::text = 'deduct' and delta=-1), count(*) filter (where action::text = 'refund' and delta=1),
         count(*) filter (where action::text = 'adjust')
    into v_d, v_r, v_a from ticket_logs where ticket_id = p_ticket_id and booking_id = p_booking_id;

  if v_d = 0 and v_r = 0 and v_a = 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.NO_DEDUCT'); end if;
  if v_d = 0 and v_r = 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.ONLY_ADJUST'); end if;
  if v_d = 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.ONLY_REFUND'); end if;
  if v_d - v_r < 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.OVER_REFUNDED'); end if;
  if v_d - v_r = 0 then
    return jsonb_build_object('ok', true, 'refunded', false, 'reason', 'ALREADY_REFUNDED', 'ticket_id', p_ticket_id);
  end if;

  -- 操作人員（app.tk_operator）的作用域：交易區域（is_local=true）、只在核心呼叫的這一小段有效。
  --   記下「呼叫前」的值，核心呼叫後**還原成呼叫前的值**（不是寫死空字串）：同一交易內連續呼叫、或外層已設定過時，都不會被清掉或沿用上一位。
  --   例外路徑：本函式的 EXCEPTION 區塊是子交易，被攔下的例外會連同這裡的設定一起回復到進入前的值。
  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);                                      -- 帳本 operator＝實際操作的員工
  v_ok := public.fn_tk_refund_once(p_ticket_id, p_booking_id, coalesce(nullif(p_note, ''), '取消退課'));
  perform set_config('app.tk_operator', v_prev, true);
  if not v_ok then return jsonb_build_object('ok', false, 'error_code', 'REFUND.BALANCE_FULL'); end if;

  select sessions_remaining into v_after from member_tickets where id = p_ticket_id;
  return jsonb_build_object('ok', true, 'refunded', true, 'ticket_id', p_ticket_id, 'remaining_after', v_after);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.BUSY');
  when others then
    if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
    raise warning 'fn_refund_ticket internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.INTERNAL_ERROR');
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_desk_cancel_booking(p_booking_id text, p_mode text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Validate every ticket before any refund. An ambiguous ledger aborts this whole call.
  perform public.fn_ticket_net_checked(x.ticket_id,p_booking_id)
    from (select distinct ticket_id from ticket_logs where booking_id=p_booking_id and ticket_id is not null) x;
  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);                                   -- 帳本 operator＝實際操作的員工（交易區域）
  for r in
    select l.ticket_id, sum(case when l.action::text = 'deduct' and l.delta=-1 then 1 when l.action::text = 'refund' and l.delta=1 then -1 else 0 end)::int as net
      from ticket_logs l where l.booking_id = p_booking_id and l.ticket_id is not null
     group by l.ticket_id
    having sum(case when l.action::text = 'deduct' and l.delta=-1 then 1 when l.action::text = 'refund' and l.delta=1 then -1 else 0 end) > 0
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
exception when others then
  if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
  raise;
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_tk_cancel_overdue(p_ticket text, p_expire date, p_except text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare h record; b bookings%rowtype; v_n integer := 0; v_why text; v_refunded boolean;
begin
  for h in select * from public.fn_tk_holding(p_ticket, p_except) order by bdate, booking_id loop
    continue when h.bdate <= p_expire;
    begin
      select * into b from bookings where id = h.booking_id for update nowait;
      if not found or b.status::text is distinct from 'booked' or b.date <= p_expire then continue; end if;
      if b.ticket_id is distinct from p_ticket
         or b.category::text = '小班肌力'
         or coalesce(jsonb_array_length(case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids else '[]'::jsonb end), 0) > 0
         or coalesce(to_jsonb(b)->>'partner_id', '') <> ''
         or b.sibling_of is not null then
        perform public.desk_alert(b.member_id, 'tk_expiry_manual', '　有預約超出票券效期，需人工處理',
          to_char(b.date, 'MM/DD') || ' ' || coalesce(b.start_time, '') || '　票券效期至 ' || to_char(p_expire, 'YYYY/MM/DD') || '（團課／1V2／影子卡不自動取消）');
        continue;
      end if;
      v_why := '效期屆滿自動取消（首次簽到後票券效期至 ' || to_char(p_expire, 'YYYY-MM-DD') || '）';
      v_refunded := public.fn_tk_refund_once(p_ticket, b.id, '取消退課：' || v_why);
      if not v_refunded then
        perform public.desk_alert(b.member_id,'tk_expiry_manual','　有預約超出票券效期，退款未完成，需人工核對',to_char(b.date,'MM/DD') || ' ' || coalesce(b.start_time,''));
        continue;
      end if;
      update bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', cancel_reason = v_why, refund_waived = false
       where id = b.id and status::text = 'booked';
      update bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', cancel_reason = v_why
       where sibling_of = b.id and status::text is distinct from 'cancelled';
      perform public.desk_alert(b.member_id, 'tk_expiry_cancel', '　預約因票券效期屆滿被自動取消，已退回 1 堂',
        to_char(b.date, 'MM/DD') || ' ' || coalesce(b.start_time, '') || '　票券效期至 ' || to_char(p_expire, 'YYYY/MM/DD'));
      v_n := v_n + 1;
    exception
      when lock_not_available then
        perform public.desk_alert(b.member_id, 'tk_expiry_manual', '　有預約超出票券效期，暫時鎖定未能自動取消',
          to_char(h.bdate, 'MM/DD') || '　稍後會再處理，或請人工取消');
      when others then
        perform public.desk_alert(b.member_id, 'tk_expiry_manual', '　有預約超出票券效期，自動取消失敗，請人工處理',
          to_char(h.bdate, 'MM/DD') || '　' || left(sqlerrm, 80));
    end;
  end loop;
  return v_n;
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_cancel_group_seat(p_booking_id text, p_seat_key text, p_expect_rev text, p_mode text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp text; v_desk boolean; b bookings%rowtype; t member_tickets%rowtype;
  v_ids jsonb; v_mids text[]; v_keys text[]; v_idx integer; v_mid text; v_nseat integer;
  v_att jsonb; v_st jsonb; v_nt jsonb; v_new_ids jsonb;
  v_tid text; v_cand integer; v_net integer; v_deducts integer; v_other integer;
  v_outcome text; v_refunded integer := 0; v_ok boolean; v_prev text; v_note text;
  v_ds date; v_exp date; v_after integer; v_line text;
begin
  perform set_config('lock_timeout', '3000', true);
  if p_booking_id is null or p_seat_key is null or p_expect_rev is null then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS'); end if;
  if coalesce(p_mode, 'auto') not in ('auto', 'none') then return jsonb_build_object('ok', false, 'error_code', 'BAD_MODE'); end if;
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  v_desk := coalesce(is_staff_desk(), false);

  select * into b from bookings where id = p_booking_id for update;                       -- ① 先鎖預約
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if not v_desk and b.coach_id is distinct from v_emp and b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN'); end if;
  if b.category::text is distinct from '小班肌力' then return jsonb_build_object('ok', false, 'error_code', 'NOT_GROUP'); end if;
  if b.status::text = 'cancelled' then return jsonb_build_object('ok', false, 'error_code', 'BOOKING_CANCELLED'); end if;
  if public.fn_booking_rev_of(b.id) is distinct from p_expect_rev then
    return jsonb_build_object('ok', false, 'error_code', 'REV_MISMATCH'); end if;

  v_ids := case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids else '[]'::jsonb end;
  select array_agg(mid order by ord), array_agg(case when rn > 1 then mid || '#' || rn else mid end order by ord)
    into v_mids, v_keys
    from (select mid, ord, row_number() over (partition by mid order by ord) as rn
            from jsonb_array_elements_text(v_ids) with ordinality as e(mid, ord)) x;
  v_idx := array_position(coalesce(v_keys, '{}'::text[]), p_seat_key);
  if v_idx is null then return jsonb_build_object('ok', false, 'error_code', 'NO_SEAT'); end if;
  v_mid := v_mids[v_idx];
  select count(*) into v_nseat from unnest(v_mids) m where m = v_mid;

  v_att := case when jsonb_typeof(b.attendance) = 'object' then b.attendance else '{}'::jsonb end;
  if v_att ->> p_seat_key = 'checked_in' then return jsonb_build_object('ok', false, 'error_code', 'SEAT_CHECKED_IN'); end if;
  if v_att ->> p_seat_key = 'leave' then return jsonb_build_object('ok', false, 'error_code', 'SEAT_ON_LEAVE'); end if;

  -- ② 票券歸屬：座位票記錄優先；沒有記錄才看帳本，且只在不用猜的時候採用
  v_st := case when jsonb_typeof(b.seat_tickets) = 'object' then b.seat_tickets else null end;
  v_tid := nullif(v_st ->> p_seat_key, '');
  if v_tid is null then
    select count(*), min(x.ticket_id) into v_cand, v_tid
      from (select l.ticket_id from ticket_logs l join member_tickets mt on mt.id = l.ticket_id
             where l.booking_id = p_booking_id and mt.member_id = v_mid
             group by l.ticket_id
            having sum(case when l.action::text = 'deduct' and coalesce(l.delta, 0) <> 0 then 1 when l.action::text = 'refund' then -1 else 0 end) > 0) x;
    if v_cand = 0 then v_tid := null;
    elsif v_cand = 1 and v_nseat = 1 then null;           -- v_tid 已由 min() 取得
    else return jsonb_build_object('ok', false, 'error_code', 'TICKET_UNKNOWN'); end if;
  end if;

  -- ③ 再鎖票券（預約 → 票券），算淨額與「其他名額」
  v_other := 0; v_net := 0; v_deducts := 0;
  if v_tid is not null then
    select * into t from member_tickets where id = v_tid for update;
    if not found then return jsonb_build_object('ok', false, 'error_code', 'TICKET_UNKNOWN'); end if;
    perform public.fn_ticket_net_checked(v_tid,p_booking_id);
    select coalesce(sum(case when action::text = 'deduct' and coalesce(delta, 0) <> 0 then 1 when action::text = 'refund' then -1 else 0 end), 0),
           count(*) filter (where action::text = 'deduct' and coalesce(delta, 0) <> 0)
      into v_net, v_deducts from ticket_logs where ticket_id = v_tid and booking_id = p_booking_id;
    if v_st is not null then
      select count(*) into v_other from jsonb_each_text(v_st) e where e.value = v_tid and e.key <> p_seat_key;
    end if;
  end if;

  -- ④ 退款決定與執行
  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);
  if v_tid is null then
    v_outcome := 'no_deduction';
  elsif v_net > v_other then
    if coalesce(p_mode, 'auto') = 'none' then
      v_outcome := 'operator_waived';
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp, '取消團課名額・扣課不退（人員選擇，票視同已使用）');
    else
      v_note := case when coalesce(t.source, '') = 'makeup' then '團體課取消預約退回（補課券，效期不變）' else '團體課取消預約退回' end;
      v_ok := public.fn_tk_refund_once(v_tid, p_booking_id, v_note);
      if v_ok then v_outcome := 'refunded'; v_refunded := 1;
      else
        v_outcome := 'refund_failed';
        insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
        values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp, '⚠ 取消團課名額・退票失敗（系統未能退回，待校正）');
      end if;
    end if;
  elsif v_deducts > 0 and v_net <= 0 then
    v_outcome := 'already_refunded';
  else
    v_outcome := 'no_deduction';
  end if;
  perform set_config('app.tk_operator', v_prev, true);
  if v_outcome in ('no_deduction', 'already_refunded') and v_tid is not null then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp,
            case when v_outcome = 'already_refunded' then '取消團課名額：這一堂在該票券上已完成退款，未重複退款'
                 else '取消團課名額：這個名額在該票券上沒有淨扣課紀錄，未退課' end);
  end if;

  -- ⑤ 同一交易移除名額並重編（member_ids／seat_tickets／attendance／seat_notes）
  select coalesce(jsonb_agg(m order by o), '[]'::jsonb) into v_new_ids from unnest(v_mids) with ordinality u(m, o) where o <> v_idx;
  v_att := public.fn_seat_map_reindex(v_att, v_keys, v_mids, v_idx);
  v_nt := case when jsonb_typeof(b.seat_notes) = 'object' then public.fn_seat_map_reindex(b.seat_notes, v_keys, v_mids, v_idx) else b.seat_notes end;
  if v_nt is not null and v_nt = '{}'::jsonb then v_nt := null; end if;
  update bookings
     set member_ids = v_new_ids,
         attendance = v_att,
         seat_tickets = case when v_st is not null then public.fn_seat_map_reindex(v_st, v_keys, v_mids, v_idx) else b.seat_tickets end,
         seat_notes = v_nt
   where id = p_booking_id;

  -- ⑥ 舊制票（非 checkin 啟用）：取消的是起算日那一堂 → 效期改依剩下最早的有效堂重算／退回未開通（移植自前端 doGroupCancelSeat）
  if v_refunded = 1 then
    select * into t from member_tickets where id = v_tid;
    if coalesce(t.valid_days, 0) > 0 and t.start_date is not null and coalesce(t.source, '') <> 'makeup'
       and t.activation_mode is distinct from 'checkin' and b.date = t.start_date then
      select min(bk.date) into v_ds from bookings bk
       where bk.status::text <> 'cancelled'
         and bk.id in (select l.booking_id from ticket_logs l where l.ticket_id = v_tid and l.booking_id is not null group by l.booking_id
                        having sum(case when l.action::text = 'deduct' and coalesce(l.delta, 0) <> 0 then 1 when l.action::text = 'refund' then -1 else 0 end) > 0);
      if v_ds is not null and v_ds > t.start_date then
        v_exp := v_ds + (t.valid_days - 1);
        v_line := to_char((now() at time zone 'Asia/Taipei')::date, 'YYYY-MM-DD') || ' 首堂取消，效期改依新首堂 ' || to_char(v_ds, 'YYYY/MM/DD') || ' 起算（→ ' || to_char(v_exp, 'YYYY/MM/DD') || '）';
        update member_tickets set start_date = v_ds, expire_date = v_exp,
               note = case when coalesce(btrim(note), '') <> '' then btrim(note) || E'\n' || v_line else v_line end
         where id = v_tid;
      elsif v_ds is null then
        update member_tickets set activated_at = null, start_date = null, expire_date = null where id = v_tid;
      end if;
    end if;
  end if;

  select sessions_remaining into v_after from member_tickets where id = v_tid;
  return jsonb_build_object('ok', true, 'outcome', v_outcome, 'seat_key', p_seat_key, 'member_id', v_mid, 'ticket_id', v_tid,
                            'refunded', v_refunded, 'seats_left', jsonb_array_length(v_new_ids), 'remaining_after', v_after);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY');
  when others then
    if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
    raise warning 'fn_cancel_group_seat internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'INTERNAL_ERROR');
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_desk_deduct_ticket(p_ticket_id text, p_booking_id text, p_note text DEFAULT NULL::text, p_op_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    v_net := public.fn_ticket_net_checked(p_ticket_id,p_booking_id);
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
$function$;
CREATE OR REPLACE FUNCTION public.fn_cancel_booking(p_booking_id text, p_reason text DEFAULT NULL::text, p_refund boolean DEFAULT NULL::boolean)
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
  v_why text; v_ret jsonb;
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

  if v_should_refund and b.ticket_id is not null then
    v_ret:=public.benefit_refund(b.ticket_id,1,b.id);
    if not coalesce((v_ret->>'refunded')::boolean,false) then raise exception 'REFUND.NO_DEDUCT'; end if;
  end if;

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
    'cancellation_result', case when v_should_refund then 'refunded' else 'forfeited' end,
    'hours_before', round(v_hours_before,2),
    'refunded_ticket', case when v_should_refund then b.ticket_id else null end,
    'makeup','not_requested');
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm);
end
$function$;
create or replace function public.benefit_refund(p_benefit_ref text,p_qty integer,p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare n int; did_refund boolean;
begin
 if p_benefit_ref is null then return jsonb_build_object('ok',true,'refunded',false,'skipped','no_ticket'); end if;
 -- Existing caller fn_cancel_booking refunds one unit. Never trust an arbitrary amount.
 if p_qty is distinct from 1 or p_booking_id is null then raise exception 'REFUND.BAD_ARGS'; end if;
 perform 1 from bookings where id=p_booking_id for update;
 if not found then raise exception 'REFUND.NO_BOOKING'; end if;
 perform 1 from member_tickets where id=p_benefit_ref for update;
 if not found then raise exception 'REFUND.NO_TICKET'; end if;
 n:=public.fn_ticket_net_checked(p_benefit_ref,p_booking_id);
 if n=0 then return jsonb_build_object('ok',true,'refunded',false,'skipped','no_deduct'); end if;
 did_refund:=public.fn_tk_refund_once(p_benefit_ref,p_booking_id,'取消返還原票');
 if not did_refund then raise exception 'REFUND.BALANCE_FULL'; end if;
 return jsonb_build_object('ok',true,'refunded',true);
end $function$;
-- Old clients cannot prove which revision their request belongs to; never guess a current revision.
create or replace function public.fn_member_leave_group(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$ begin
 if public.current_member_id() is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 return jsonb_build_object('ok',false,'error_code','CLIENT.UPDATE_REQUIRED');
end $function$;
create or replace function public.fn_member_leave_group_v2(p_booking_id text,p_seat_key text,p_expect_rev text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
 v_mid text:=current_member_id(); b bookings%rowtype; t member_tickets%rowtype;
 v_mids text[]; v_keys text[]; v_idx int; v_nseat int; v_tid text; v_cand int;
 v_ids jsonb; v_st jsonb; v_att jsonb; v_nt jsonb; v_net int; v_other int; v_refunded int:=0;
 v_outcome text; v_prev text; v_hours numeric;
begin
 perform set_config('lock_timeout','3000',true);
 if p_booking_id is null or p_seat_key is null or p_expect_rev is null then return jsonb_build_object('ok',false,'error_code','BAD_ARGS'); end if;
 if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select * into b from bookings where id=p_booking_id for update;
 if not found or b.status::text<>'booked' or b.category::text<>'小班肌力' then
  return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
 if not (coalesce(b.member_ids,'[]'::jsonb) @> to_jsonb(v_mid)) then
  return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 if public.fn_booking_rev_of(b.id) is distinct from p_expect_rev then return jsonb_build_object('ok',false,'error_code','REV_MISMATCH'); end if;
 v_hours:=extract(epoch from (((b.date||' '||b.start_time)::timestamp at time zone 'Asia/Taipei')-now()))/3600;
 if v_hours<24 then return jsonb_build_object('ok',false,'error_code','CANCEL.TOO_LATE','hours_before',round(v_hours,2),'actor','member'); end if;
 select array_agg(mid order by ord),array_agg(case when rn>1 then mid||'#'||rn else mid end order by ord)
 into v_mids,v_keys from(select mid,ord,row_number() over(partition by mid order by ord) rn
 from jsonb_array_elements_text(b.member_ids) with ordinality e(mid,ord)) x;
 v_idx:=array_position(v_keys,p_seat_key);
 if v_idx is null or v_mids[v_idx] is distinct from v_mid then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select count(*) into v_nseat from unnest(v_mids) m where m=v_mid;
 v_att:=case when jsonb_typeof(b.attendance)='object' then b.attendance else '{}'::jsonb end;
 if v_att->>v_keys[v_idx] in ('checked_in','leave') then return jsonb_build_object('ok',false,'error_code','SEAT_NOT_CANCELLABLE'); end if;
 v_st:=case when jsonb_typeof(b.seat_tickets)='object' then b.seat_tickets else '{}'::jsonb end;
 v_tid:=nullif(v_st->>v_keys[v_idx],'');
 if v_tid is null then
  -- Only a unique actual deduction on an unambiguous seat may be used as a legacy fallback.
  select count(*),min(x.id) into v_cand,v_tid from(
   select mt.id from member_tickets mt where
    (mt.member_id=v_mid or (mt.shared_with ? v_mid))
    and exists(select 1 from ticket_logs l where l.ticket_id=mt.id and l.booking_id=b.id)
    and public.fn_ticket_net_checked(mt.id,b.id)>0
  ) x;
  if v_cand<>1 or v_nseat<>1 then return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
  -- A different unmapped participant might be using this shared ticket. Do not guess their allocation.
  if exists(select 1 from unnest(v_mids,v_keys) x(mid,sk) join member_tickets mt on mt.id=v_tid
    where x.mid<>v_mid and not(v_st ? x.sk) and (mt.member_id=x.mid or mt.shared_with ? x.mid)) then
   return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
 end if;
 select * into t from member_tickets where id=v_tid for update;
 if not found or not(t.member_id=v_mid or coalesce(t.shared_with ? v_mid,false)) then
  return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
 v_net:=public.fn_ticket_net_checked(v_tid,b.id);
 select count(*) into v_other from jsonb_each_text(v_st) e where e.value=v_tid and e.key<>v_keys[v_idx];
 if v_net<=v_other then return jsonb_build_object('ok',false,'error_code','REFUND.NO_DEDUCT'); end if;
 v_prev:=coalesce(current_setting('app.tk_operator',true),'');
 perform set_config('app.tk_operator',v_mid,true);
 if v_net>v_other then
  if not public.fn_tk_refund_once(v_tid,b.id,'會員自行取消團體課退 1 堂') then
   perform set_config('app.tk_operator',v_prev,true);
   return jsonb_build_object('ok',false,'error_code','REFUND.BALANCE_FULL'); end if;
  v_refunded:=1; v_outcome:='refunded';
 else v_outcome:='no_deduction'; end if;
 perform set_config('app.tk_operator',v_prev,true);
 select coalesce(jsonb_agg(mid order by ord),'[]'::jsonb) into v_ids
 from unnest(v_mids) with ordinality x(mid,ord) where ord<>v_idx;
 v_att:=public.fn_seat_map_reindex(v_att,v_keys,v_mids,v_idx);
 v_nt:=case when jsonb_typeof(b.seat_notes)='object' then public.fn_seat_map_reindex(b.seat_notes,v_keys,v_mids,v_idx) else b.seat_notes end;
 update bookings set member_ids=v_ids,attendance=v_att,
  seat_tickets=public.fn_seat_map_reindex(v_st,v_keys,v_mids,v_idx),seat_notes=v_nt where id=b.id;
 perform public.desk_alert(v_mid,'self_cancel','　自行取消了團體課',
  to_char(b.date,'MM/DD')||' '||b.start_time||case when v_refunded=1 then '　團體課（已退回 1 堂）' else '　團體課（未發現本名額的實際扣堂，沒有退課）' end);
 return jsonb_build_object('ok',true,'booking_id',b.id,'refund_ticket',v_tid,'refunded',v_refunded,'outcome',v_outcome);
exception
 when lock_not_available or deadlock_detected or serialization_failure then return jsonb_build_object('ok',false,'error_code','REFUND.BUSY');
 when others then
  if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
  raise warning 'fn_member_leave_group error: % %',sqlstate,sqlerrm;
  return jsonb_build_object('ok',false,'error_code','REFUND.INTERNAL_ERROR');
end $function$;
create or replace function public.fn_member_group_cancel_preview(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare mid text:=public.current_member_id(); b bookings%rowtype; ks jsonb;
begin
 if mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 -- Lock and read the revision in the same transaction, not from two unrelated frontend reads.
 select * into b from public.bookings where id=p_booking_id for share;
 if not found or b.category::text<>'小班肌力' or b.status::text<>'booked' then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
 if not(coalesce(b.member_ids,'[]'::jsonb) @> to_jsonb(mid)) then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select jsonb_agg(case when rn>1 then m||'#'||rn else m end order by ord) into ks
 from(select m,ord,row_number() over(partition by m order by ord) rn from jsonb_array_elements_text(b.member_ids) with ordinality e(m,ord)) x where m=mid;
 if ks is null or jsonb_array_length(ks)=0 then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 return jsonb_build_object('ok',true,'booking_id',b.id,'date',b.date,'start_time',b.start_time,'rev',public.fn_booking_rev_of(b.id),'seat_keys',ks);
end $function$;
revoke all on function public.benefit_refund(text,integer,text) from public,anon,authenticated,service_role;

revoke all on function public.fn_member_leave_group_v2(text,text,text),public.fn_member_group_cancel_preview(text) from public,anon,authenticated,service_role;
grant execute on function public.fn_member_leave_group_v2(text,text,text),public.fn_member_group_cancel_preview(text) to authenticated;
$candidate$;
end $install$;
$fixed$;
execute $actual$CREATE OR REPLACE FUNCTION public.fn_log_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.change_log(tbl,row_id,op)
  values (tg_table_name,
          coalesce((case when tg_op='DELETE' then old.id else new.id end), '')::text,
          left(tg_op,1));
  return null;   -- AFTER trigger，回傳值不影響原本的寫入
end $function$;
CREATE OR REPLACE FUNCTION public.fn_bookings_group_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cat text;
begin
  -- service_role / 後端排程一律放行（同 fn_members_guard 的第一道）
  if coalesce(auth.role(),'') not in ('anon','authenticated') then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  -- 櫃檯以上（含店長、管理員）不受限
  if coalesce(is_staff_desk(), false) then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  v_cat := case when TG_OP='DELETE' then old.category::text else new.category::text end;
  -- 教練（非店長）不能「建立」或「刪除」團體課；更新不擋 —— 教練請假要改自己的團課
  if v_cat = '小班肌力' and current_staff_role() is not null then
    raise exception 'BK.GUARD: 團體課的建立與刪除只有櫃檯以上可以做（教練請改用「教練請假」）';
  end if;
  return case when TG_OP='DELETE' then old else new end;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_bookings_cancelled_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'cancelled' and new.cancelled_by is null then
    new.cancelled_by := coalesce(old.cancelled_by, current_employee_id(), current_member_id());
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.trg_bookings_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.date       is distinct from old.date
  or new.start_time is distinct from old.start_time
  or new.duration   is distinct from old.duration then
    new.updated_at := now();
  end if;
  return new;
end $function$;
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
$function$;
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

  -- 2026-11-16 沒有合約的卡位（D 模式）：綁了會員的待簽約卡位可以排在任意未來日期，不受月份限制。
  -- 「每次操作只能排七天（最早一堂 D 起，D～D+6）」由前端建立流程負責；到期、簽到、轉正的限制見 fn_hold_state_guard。沒有會員的空堂仍受原月份限制。
  if new.member_id is not null then return new; end if;

  raise exception 'HOLD.MONTH_LIMIT:%', to_char(v_end, 'YYYY-MM-DD')
    using errcode = 'P0001',
          hint = '沒有符合資格票券的卡位只能預約到 ' || to_char(v_end, 'YYYY/MM/DD') || '；每月最後一個星期一起開放下個月';
end
$function$;
CREATE OR REPLACE FUNCTION public.trg_tk_window_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin perform public.fn_tk_window_check(new.ticket_id); return null; end $function$;
CREATE OR REPLACE FUNCTION public.trg_tk_window_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if coalesce(current_setting('app.tkwin_skip_booking', true), '') = 'on' then return null; end if;
  perform public.fn_tk_window_check(new.ticket_id);
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_tk_checkin_activate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_old boolean; v_new boolean; r record; v_mem text;
begin
  if coalesce(new.category::text, '') <> '小班肌力' then
    v_old := public.fn_bk_attended(old);
    v_new := public.fn_bk_attended(new);
    if new.ticket_id is not null then
      if v_new and not v_old then perform public.fn_tk_activate(new.ticket_id, new.date, new.id);
      elsif v_old and not v_new then perform public.fn_tk_recalc(new.ticket_id, new.id);
      end if;
    end if;
    return null;
  end if;
  -- 團課：attendance 逐座位（key＝會員id 或 會員id#序號）
  for r in
    select k.key as seat_key,
           (coalesce(case when jsonb_typeof(new.attendance) = 'object' then new.attendance->>k.key end, '') = 'checked_in') as now_in,
           (coalesce(case when jsonb_typeof(old.attendance) = 'object' then old.attendance->>k.key end, '') = 'checked_in') as was_in
      from ( select jsonb_object_keys(coalesce(case when jsonb_typeof(new.attendance) = 'object' then new.attendance end, '{}'::jsonb)
                                      || coalesce(case when jsonb_typeof(old.attendance) = 'object' then old.attendance end, '{}'::jsonb)) as key ) k
  loop
    continue when r.now_in = r.was_in;
    perform public.fn_tk_group_seat(new.id, new.date, public.fn_tk_seat_member(r.seat_key), r.now_in);
  end loop;
  -- 舊結構團課（member_ids 為空、逐筆單人、用 status 簽到）
  if coalesce(jsonb_array_length(case when jsonb_typeof(new.member_ids) = 'array' then new.member_ids else '[]'::jsonb end), 0) = 0
     and new.member_id is not null then
    v_old := public.fn_bk_attended(old);
    v_new := public.fn_bk_attended(new);
    if v_new is distinct from v_old then
      perform public.fn_tk_group_seat(new.id, new.date, new.member_id, v_new);
    end if;
  end if;
  return null;
end
$function$;
CREATE OR REPLACE FUNCTION public.trg_tk_quota_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.trg_booking_op_rev()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id text := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  insert into public.booking_op_rev(booking_id, rev) values (v_id, 1)
  on conflict (booking_id) do update set rev = public.booking_op_rev.rev + 1;
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_hold_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.trg_contract_window_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if pg_trigger_depth() > 1 then return null; end if;                                        -- 合約取消／刪除的連動取消（巢狀）不檢查
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return null; end if;    -- 維運例外
  if tg_op = 'UPDATE' and old.contract_id is not null and old.contract_id is distinct from new.contract_id then
    perform public.fn_contract_window_check(old.contract_id, false);                          -- 搬出去的那份合約：只重算區間，不因它的設定異常而擋
  end if;
  if new.contract_id is not null then perform public.fn_contract_window_check(new.contract_id, new.status::text <> 'cancelled'); end if;
  return null;
end
$function$;
drop trigger if exists bookings_cancelled_by on public.bookings;
CREATE TRIGGER bookings_cancelled_by BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_bookings_cancelled_by();
drop trigger if exists bookings_touch on public.bookings;
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_bookings_touch();
drop trigger if exists trg_booking_op_rev on public.bookings;
CREATE TRIGGER trg_booking_op_rev AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.member_ids IS DISTINCT FROM new.member_ids) OR (old.seat_tickets IS DISTINCT FROM new.seat_tickets) OR (old.duration IS DISTINCT FROM new.duration) OR (old.date IS DISTINCT FROM new.date) OR (old.start_time IS DISTINCT FROM new.start_time) OR (old.ticket_id IS DISTINCT FROM new.ticket_id))) EXECUTE FUNCTION trg_booking_op_rev();
drop trigger if exists trg_booking_op_rev_insdel on public.bookings;
CREATE TRIGGER trg_booking_op_rev_insdel AFTER INSERT OR DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_booking_op_rev();
drop trigger if exists trg_bookings_contract_hold_guard on public.bookings;
CREATE TRIGGER trg_bookings_contract_hold_guard BEFORE INSERT OR UPDATE OF contract_id, status, member_id, ticket_type_id, pending_contract, ticket_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_contract_hold_guard();
drop trigger if exists trg_bookings_group_guard on public.bookings;
CREATE TRIGGER trg_bookings_group_guard BEFORE INSERT OR DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_bookings_group_guard();
drop trigger if exists trg_bookings_hold_month_guard on public.bookings;
CREATE TRIGGER trg_bookings_hold_month_guard BEFORE INSERT OR UPDATE OF date, pending_contract, ticket_id, status, category, ticket_type_id, member_id, contract_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_hold_month_guard();
drop trigger if exists trg_bookings_hold_state_guard on public.bookings;
CREATE TRIGGER trg_bookings_hold_state_guard BEFORE INSERT OR UPDATE OF status, ticket_id, date ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_hold_state_guard();
drop trigger if exists trg_change_log on public.bookings;
CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_log_change();
drop trigger if exists trg_contract_window_ins on public.bookings;
CREATE TRIGGER trg_contract_window_ins AFTER INSERT ON public.bookings FOR EACH ROW WHEN (((new.contract_id IS NOT NULL) AND ((new.status)::text <> 'cancelled'::text))) EXECUTE FUNCTION trg_contract_window_booking();
drop trigger if exists trg_contract_window_upd on public.bookings;
CREATE TRIGGER trg_contract_window_upd AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((new.contract_id IS NOT NULL) AND ((new.date IS DISTINCT FROM old.date) OR (new.status IS DISTINCT FROM old.status) OR (new.contract_id IS DISTINCT FROM old.contract_id)))) EXECUTE FUNCTION trg_contract_window_booking();
drop trigger if exists trg_tk_checkin_activate on public.bookings;
CREATE TRIGGER trg_tk_checkin_activate AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((old.checked_in_at IS DISTINCT FROM new.checked_in_at) OR (old.status IS DISTINCT FROM new.status) OR (old.attendance IS DISTINCT FROM new.attendance))) EXECUTE FUNCTION trg_tk_checkin_activate();
drop trigger if exists trg_tk_window_booking_ins on public.bookings;
CREATE TRIGGER trg_tk_window_booking_ins AFTER INSERT ON public.bookings FOR EACH ROW WHEN (((new.ticket_id IS NOT NULL) AND ((new.status)::text IS DISTINCT FROM 'cancelled'::text))) EXECUTE FUNCTION trg_tk_window_booking();
drop trigger if exists trg_tk_window_booking_upd on public.bookings;
CREATE TRIGGER trg_tk_window_booking_upd AFTER UPDATE ON public.bookings FOR EACH ROW WHEN (((new.ticket_id IS NOT NULL) AND ((new.status)::text IS DISTINCT FROM 'cancelled'::text) AND ((new.date IS DISTINCT FROM old.date) OR (new.ticket_id IS DISTINCT FROM old.ticket_id) OR (NOT ((old.status)::text IS DISTINCT FROM 'cancelled'::text))))) EXECUTE FUNCTION trg_tk_window_booking();
drop trigger if exists trg_change_log on public.member_tickets;
CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.member_tickets FOR EACH ROW EXECUTE FUNCTION fn_log_change();
drop trigger if exists trg_tk_quota_guard on public.member_tickets;
CREATE TRIGGER trg_tk_quota_guard BEFORE UPDATE OF sessions_remaining, sessions_total, unlocked_sessions ON public.member_tickets FOR EACH ROW EXECUTE FUNCTION trg_tk_quota_guard();
drop trigger if exists trg_change_log on public.ticket_logs;
CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.ticket_logs FOR EACH ROW EXECUTE FUNCTION fn_log_change();
drop trigger if exists trg_tk_window_ledger on public.ticket_logs;
CREATE TRIGGER trg_tk_window_ledger AFTER INSERT ON public.ticket_logs FOR EACH ROW WHEN (((new.action)::text = 'deduct'::text)) EXECUTE FUNCTION trg_tk_window_ledger();
$actual$;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_log_change') is distinct from 'bb62d34e3fbf5fcc9305d0421ff3ede8' then raise exception 'TRIGGER_PARITY:fn_log_change'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_bookings_group_guard') is distinct from 'a9504d5db91635717ae3f7714e5d90db' then raise exception 'TRIGGER_PARITY:fn_bookings_group_guard'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_bookings_cancelled_by') is distinct from '34114a89141ed95a1b52b4040f8d4a32' then raise exception 'TRIGGER_PARITY:trg_bookings_cancelled_by'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_bookings_touch') is distinct from '1d640eec40b6ac2d14c4d91e074fcf77' then raise exception 'TRIGGER_PARITY:trg_bookings_touch'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_contract_hold_guard') is distinct from '278873cf7f5b46faabbd456cdfb911b9' then raise exception 'TRIGGER_PARITY:fn_contract_hold_guard'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_hold_month_guard') is distinct from 'e7152b65fbb7d6c5d494cc938757caeb' then raise exception 'TRIGGER_PARITY:fn_hold_month_guard'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_tk_window_ledger') is distinct from '62fd4c6165e953750341283644f7fbf5' then raise exception 'TRIGGER_PARITY:trg_tk_window_ledger'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_tk_window_booking') is distinct from 'e65ddc778d1fbec8100fee2f9aeb68a0' then raise exception 'TRIGGER_PARITY:trg_tk_window_booking'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_tk_checkin_activate') is distinct from 'df9d1207e04c1062a91c2985b9de1930' then raise exception 'TRIGGER_PARITY:trg_tk_checkin_activate'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_tk_quota_guard') is distinct from '999c8ef061cf126c068f9ecd4405590d' then raise exception 'TRIGGER_PARITY:trg_tk_quota_guard'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_booking_op_rev') is distinct from '5667f663260f21417d7f2f45d984288f' then raise exception 'TRIGGER_PARITY:trg_booking_op_rev'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_hold_state_guard') is distinct from '22edb0f9a4893e9d891a420ba4588440' then raise exception 'TRIGGER_PARITY:fn_hold_state_guard'; end if;
if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_contract_window_booking') is distinct from 'd3c291fa4a1d308a9edaee54a5924f7c' then raise exception 'TRIGGER_PARITY:trg_contract_window_booking'; end if;



end $health$;
notify pgrst,'reload schema';

-- Test-only HTTP concurrency observer. Install only after candidate functions/dependencies.
-- It executes the real functions and proves waiting on the exact holder transaction.
do $install$ begin
 if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_ONLY'; end if;
 execute $ddl$
create or replace function public.zz_pf_call(p_role text,p_kind text,p_case text,p_args jsonb,p_poll_ms integer default 2500)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare emp text:=public.current_employee_id(); run text; b text:=p_args->>'booking'; t text:=p_args->>'ticket';
 r jsonb; xid text; started timestamptz:=clock_timestamp(); deadline timestamptz; blocked jsonb:='[]'; n int:=0;
begin
 if coalesce(emp,'') !~ '^CC-EMP-PF-[DC]-[0-9a-f]{6}$' then return jsonb_build_object('error','NOT_TEST_IDENTITY'); end if;
 run:=right(emp,6);
 if p_role not in ('holder','waiter','plain') or p_kind not in ('coach_deduct_bind','desk_deduct_bind','desk_cancel','refund') then return jsonb_build_object('error','BAD_KIND'); end if;
 if coalesce(p_case,'') !~ '^CC-PF-[A-Za-z0-9-]+$' or right(p_case,7)<>'-'||run or length(p_case)>40
 or coalesce(b,'') !~ '^CC-PF-[A-Za-z0-9-]+$' or right(b,7)<>'-'||run
 or (t is not null and (t !~ '^CC-PF-[A-Za-z0-9-]+$' or right(t,7)<>'-'||run)) then return jsonb_build_object('error','NOT_TEST_OBJECT'); end if;
 if p_poll_ms<0 or p_poll_ms>2500 then return jsonb_build_object('error','BAD_POLL'); end if;
 perform set_config('application_name','pf:'||p_case||':'||p_role,true);
 if p_kind='coach_deduct_bind' then
  r:=public.fn_deduct_ticket(t,b,'CC performance concurrency');
  if r->>'ok'='true' then update public.bookings set ticket_id=t,pending_contract=false where id=b and ticket_id is null and category::text<>'小班肌力'; end if;
 elsif p_kind='desk_deduct_bind' then
  r:=public.fn_desk_deduct_ticket(t,b,'CC performance concurrency');
  if r->>'ok'='true' then update public.bookings set ticket_id=t,pending_contract=false where id=b and ticket_id is null and category::text<>'小班肌力'; end if;
 elsif p_kind='desk_cancel' then r:=public.fn_desk_cancel_booking(b,'auto');
 elsif p_kind='refund' then r:=public.fn_refund_ticket(t,b,'CC performance refund retry');
 end if;
 xid:=txid_current()::text;
 if p_role='holder' then
  deadline:=clock_timestamp()+make_interval(secs=>p_poll_ms/1000.0);
  loop
   perform pg_stat_clear_snapshot();
   select coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'application_name',a.application_name,
    'waits_on_my_txid',exists(select 1 from pg_locks l where l.pid=a.pid and not l.granted and l.locktype='transactionid' and l.transactionid::text=xid),
    'waits_on',(select coalesce(jsonb_agg(jsonb_build_object('locktype',l.locktype,'transactionid',l.transactionid::text,'mode',l.mode)),'[]') from pg_locks l where l.pid=a.pid and not l.granted))),'[]'),count(*)::int
   into blocked,n from pg_stat_activity a where a.application_name='pf:'||p_case||':waiter'
    and a.pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(a.pid))
    and exists(select 1 from pg_locks l where l.pid=a.pid and not l.granted and l.locktype='transactionid' and l.transactionid::text=xid);
   exit when n>0 or clock_timestamp()>=deadline;
   perform pg_sleep(0.02);
  end loop;
 end if;
 return jsonb_build_object('pid',pg_backend_pid(),'txid',xid,'start',started,'end',clock_timestamp(),'result',r,'blocked_waiters',blocked);
end $fn$;
revoke all on function public.zz_pf_call(text,text,text,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.zz_pf_call(text,text,text,jsonb,integer) to authenticated;
create or replace function public.zz_pf_fingerprint() returns jsonb language sql security definer set search_path to 'public','pg_temp'
as $fp$
 select jsonb_build_object('functions',(select jsonb_object_agg(p.proname,md5(p.prosrc)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('fn_ticket_net_checked','fn_deduct_ticket','fn_tk_refund_once','fn_refund_ticket','fn_desk_cancel_booking','fn_tk_cancel_overdue','fn_cancel_group_seat','fn_member_leave_group','fn_desk_deduct_ticket','fn_cancel_booking','benefit_refund','fn_member_group_cancel_preview','fn_member_leave_group_v2','zz_pf_call') and (p.proname<>'fn_cancel_booking' or p.pronargs=3)),
 'quota_trigger',exists(select 1 from pg_trigger where tgname='trg_tk_quota_guard' and not tgisinternal),
 'rev_trigger',exists(select 1 from pg_trigger where tgname='trg_booking_op_rev' and not tgisinternal),
 'change_log_columns',(select jsonb_agg(column_name order by column_name) from information_schema.columns where table_schema='public' and table_name='change_log'))
$fp$;
revoke all on function public.zz_pf_fingerprint() from public,anon,authenticated,service_role;
grant execute on function public.zz_pf_fingerprint() to anon,authenticated;
$ddl$;
end $install$;
notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.benefit_consume(p_member_id text, p_benefit_type text, p_qty integer, p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ticket member_tickets%ROWTYPE;
BEGIN
  IF p_benefit_type = 'none' THEN
    RETURN jsonb_build_object('ok',true,'benefit_ref',NULL,'remaining_after',NULL); -- 體驗不扣
  END IF;

  -- FIFO：最早到期、可用、未過期、benefit_type 相符的票（透過 ticket_types join）
  SELECT mt.* INTO v_ticket
    FROM member_tickets mt
    JOIN ticket_types tt ON tt.id = mt.ticket_type_id
   WHERE mt.member_id = p_member_id
     AND tt.benefit_type = p_benefit_type
     AND mt.sessions_remaining >= p_qty
     AND mt.status = 'usable'
     AND (mt.expire_date IS NULL OR mt.expire_date >= CURRENT_DATE)
     -- 分期：只能扣「已開通」的堂數；非分期票不受影響
     AND (
       mt.installment IS NULL
       OR LEAST(
            mt.sessions_remaining,
            COALESCE(mt.unlocked_sessions, mt.sessions_total)
              - (mt.sessions_total - mt.sessions_remaining)
          ) >= p_qty
     )
   ORDER BY mt.expire_date ASC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    -- 分期票還有堂數、但那些堂數尚未繳費 → 給專屬錯誤碼，前端才講得清楚
    IF EXISTS (
      SELECT 1 FROM member_tickets mt JOIN ticket_types tt ON tt.id=mt.ticket_type_id
       WHERE mt.member_id=p_member_id AND tt.benefit_type=p_benefit_type
         AND mt.status='usable' AND mt.installment IS NOT NULL
         AND mt.sessions_remaining >= p_qty
         AND (mt.expire_date IS NULL OR mt.expire_date >= CURRENT_DATE)
    ) THEN
      RAISE EXCEPTION 'TICKET.INSTALLMENT_LOCKED';
    END IF;
    IF EXISTS (SELECT 1 FROM member_tickets mt JOIN ticket_types tt ON tt.id=mt.ticket_type_id
                WHERE mt.member_id=p_member_id AND tt.benefit_type=p_benefit_type) THEN
      RAISE EXCEPTION '%', CASE WHEN p_benefit_type='training_pass' THEN 'POINT.EMPTY' ELSE 'TICKET.EXPIRED' END;
    ELSE
      RAISE EXCEPTION '%', CASE WHEN p_benefit_type='training_pass' THEN 'POINT.EMPTY' ELSE 'TICKET.EMPTY' END;
    END IF;
  END IF;

  UPDATE member_tickets SET sessions_remaining = sessions_remaining - p_qty
   WHERE id = v_ticket.id;

  INSERT INTO ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  VALUES (gen_short_id('LG-'), v_ticket.id, 'deduct', -p_qty, p_booking_id, 'system', '預約扣除');

  RETURN jsonb_build_object('ok',true,'benefit_ref',v_ticket.id,
                            'remaining_after', v_ticket.sessions_remaining - p_qty);
END $function$;
CREATE OR REPLACE FUNCTION public.benefit_consume_ticket(p_ticket_id text, p_member_id text, p_qty integer, p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v member_tickets%rowtype;
begin
  select * into v from member_tickets where id = p_ticket_id for update;
  if not found then raise exception 'TICKET.NOT_FOUND'; end if;

  -- 持有人或共享者都可以用 —— 共享票的持有人不是預約的那位會員（限定教練課 1V2 幾乎都是共享票）
  if not (v.member_id = p_member_id
          or (v.shared_with is not null and v.shared_with ? p_member_id)) then
    raise exception 'TICKET.NOT_YOURS';
  end if;

  if v.status <> 'usable' then raise exception 'TICKET.EXPIRED'; end if;
  if v.expire_date is not null and v.expire_date < current_date then raise exception 'TICKET.EXPIRED'; end if;
  if coalesce(v.sessions_remaining,0) < p_qty then raise exception 'TICKET.EMPTY'; end if;
  -- 分期票：只能扣已開通（已繳費）的堂數
  if v.installment is not null
     and least(v.sessions_remaining,
               coalesce(v.unlocked_sessions, v.sessions_total) - (v.sessions_total - v.sessions_remaining)) < p_qty
  then raise exception 'TICKET.INSTALLMENT_LOCKED'; end if;

  update member_tickets set sessions_remaining = sessions_remaining - p_qty where id = v.id;

  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), v.id, 'deduct', -p_qty, p_booking_id, 'system', '預約扣除（櫃檯指定票券）');

  return jsonb_build_object('ok',true,'benefit_ref',v.id,
                            'remaining_after', v.sessions_remaining - p_qty);
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer DEFAULT 60, p_space_id text DEFAULT 'general'::text, p_resource_id text DEFAULT 'general_area'::text, p_note text DEFAULT NULL::text, p_ticket_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_booking text := gen_short_id('BK-');
  v_consume jsonb;
  v_qty int := 1;
  v_ref text;
  v_actor text;
  v_existing bookings%rowtype;
begin
  if not is_any_staff() then
    if current_member_id() is null or current_member_id() <> p_member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  -- 操作者（2026-08-04）：員工記員工 id、會員記會員 id，事後才追得到是誰建的
  v_actor := coalesce(current_employee_id(), current_member_id());

  if p_idempotency_key is not null then
    if length(btrim(p_idempotency_key))=0 or length(p_idempotency_key)>200 then
      return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.BAD_KEY');
    end if;
    -- Serialise only the same operation, before checking its receipt or consuming tickets.
    perform pg_advisory_xact_lock(hashtextextended('booking-create:'||p_idempotency_key,0));
    select * into v_existing from bookings where idempotency_key=p_idempotency_key;
    if found then
      if jsonb_build_array(v_existing.member_id,v_existing.coach_id,v_existing.category::text,
           v_existing.benefit_type,v_existing.date,v_existing.start_time,v_existing.duration,
           v_existing.space_id,v_existing.resource_id,v_existing.note,v_existing.requested_ticket_id,v_existing.created_by)
         is distinct from jsonb_build_array(p_member_id,p_coach_id,p_category,p_benefit_type,
           p_date,p_start_time,p_duration,p_space_id,p_resource_id,p_note,p_ticket_id,v_actor) then
        return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
      end if;
      if v_existing.status::text='cancelled' then
        return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CANCELLED');
      end if;
      return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,
        'already',true,'remaining_after',(select sessions_remaining from member_tickets where id=v_existing.ticket_id));
    end if;
  end if;

  perform space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, null);

  insert into bookings (id, member_id, coach_id, category, benefit_type, date, start_time, duration,
                        status, space_id, resource_id, reward_status, note, created_by, created_at, idempotency_key, requested_ticket_id)
  values (v_booking, p_member_id, p_coach_id, p_category::ticket_category, p_benefit_type, p_date,
          p_start_time, p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, v_actor, now(), p_idempotency_key, p_ticket_id);

  if p_ticket_id is not null and p_benefit_type <> 'none' then
    v_consume := benefit_consume_ticket(p_ticket_id, p_member_id, v_qty, v_booking);
  else
    v_consume := benefit_consume(p_member_id, p_benefit_type, v_qty, v_booking);
  end if;

  v_ref := v_consume->>'benefit_ref';
  update bookings b set ticket_id = v_ref,
         ticket_type_id = (select mt.ticket_type_id from member_tickets mt where mt.id = v_ref)
   where b.id = v_booking;

  return jsonb_build_object('ok',true,'booking_id',v_booking,'benefit_ref',v_ref,
                            'remaining_after', v_consume->'remaining_after');
exception when others then
  return jsonb_build_object('ok',false,'error_code',sqlerrm);
end
$function$
;