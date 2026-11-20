begin;
DO $$begin if (select system_identifier::text from pg_control_system()) <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
-- ═══════════════════════════════════════════════════════════════════════
-- 分期「已開通額度」共用防護（決策 A，2026-11-15 使用者確認：所有扣課入口一律遵守，不得因入口不同而繞過）
-- ⚠ 準備稿，尚未在任何資料庫執行。測試庫套用前需使用者授權；正式庫需另行明確授權。
--
-- 規則：分期票（0 < unlocked_sessions < sessions_total）的「使用量」＝ sessions_total − sessions_remaining
--       （已簽到＋已預約扣課都算）不得超過 unlocked_sessions。額度不足 → 該筆寫入整個失敗、所在交易整筆回滾
--       （預約、餘額、帳本都不會留下半套）。
--
-- 為什麼放在 member_tickets 的 BEFORE UPDATE 觸發器：
--   ・所有扣課入口最後都要 UPDATE member_tickets.sessions_remaining（fn_deduct_ticket、fn_group_save_members、
--     fn_member_join_group、fn_member_self_book、benefit_consume、benefit_consume_ticket、前端直接 dbPut…），
--     單一把關點，日後新增的入口自動被涵蓋，不必每支函式各寫一份判斷。
--   ・UPDATE 取得票券列鎖之後才觸發；並行時第二筆等鎖，拿到鎖後以「最新列」重算 NEW（READ COMMITTED 的重新評估），
--     所以「剩 1 個額度、兩個人同時扣」只會有一個成功。
--   ・P0-C fn_move_booking_ticket 不更新 member_tickets（只成對搬扣退堂帳本），使用量不變，不受影響、也不會被誤擋。
--
-- 只攔「使用量增加且超過已開通額度」：
--   ・退款、取消、校正回調、分期付款開通下一期（unlocked_sessions 增加）一律放行——
--     既有超額的歷史資料仍可被修回來，額度恢復時也能立刻再預約。
--   ・unlocked_sessions 為空、或 ≥ 總堂數（完整開通）→ 不適用。
--
-- 錯誤：raise exception 'TICKET.INSTALLMENT_LOCKED'（SQLSTATE P0001）——**沿用正式庫 benefit_consume／benefit_consume_ticket 既有的代碼**，
--   同一條規則只有一個代碼；使用量與額度放在 DETAIL（'used=9 unlocked=8'）。前端已有此代碼的訊息對照。
--   會 catch 並改寫錯誤的 RPC（例如 fn_move_booking_ticket 的 MOVE.INTERNAL_ERROR）若會改到餘額，需放行 'TICKET.%'；
--   P0-C 不改餘額，不會觸發。前端對照訊息見 index.html 的 tkQuotaMsg。
--
-- 影響範圍：member_tickets 的 UPDATE（只在三個欄位變動時才觸發）；不改任何既有資料列；不新增欄位。
-- 回復：drop trigger trg_tk_quota_guard on public.member_tickets; drop function public.trg_tk_quota_guard();
-- ═══════════════════════════════════════════════════════════════════════

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
  for each row execute function public.trg_tk_quota_guard();

revoke all on function public.trg_tk_quota_guard() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 原子退票 RPC：fn_refund_ticket（取代前端 refundTicket 的「讀 → 加 1 → 整列回寫 → 另寫帳」）
-- ⚠ 準備稿，尚未在任何資料庫執行。測試庫套用前需使用者授權；正式庫需另行明確授權。
-- 前置：P0-E 已部署（本檔重用 public.fn_tk_refund_once：鎖票券列、算淨額、有上限保護、更新餘額與狀態、寫退款帳）。
--
-- 為什麼要換：前端 refundTicket 讀到的餘額可能已過期，整列 dbPut 會把資料庫 RPC（扣課都是原子的）剛做的扣減蓋掉（lost update）；
--   11 月以來備註「取消退課」（員工）走這條路 71 筆。benefit_refund 另外有「先算淨額再更新、沒鎖票券列」的雙退風險（見
--   20261118_benefit_refund_lock.sql）。
--
-- 單一交易內完成：鎖預約 → 鎖票券 → 依帳本判斷 → 退 1 堂（餘額＋帳）。順序「預約 → 票券」與 fn_cancel_booking／fn_deduct_ticket／
--   fn_move_booking_ticket 一致。lock_timeout 3 秒，逾時回 REFUND.BUSY（沒有任何寫入）。
--
-- 判斷（使用者 2026-11-15 確認；以 (ticket, booking) 的帳為準）：
--   淨扣課 net = deduct 筆數 − refund 筆數
--   net ≥ 1                      → 退 1 堂（重複呼叫第二次 net 已為 0，不會重複退）
--   deduct ≥ 1 且 net = 0        → 已完全退款：不再退款，回 ok=true／refunded=false／reason=ALREADY_REFUNDED（冪等）
--   完全沒有帳                   → 拒絕 REFUND.NO_DEDUCT         （保留人工查核）
--   只有 adjust                  → 拒絕 REFUND.ONLY_ADJUST
--   只有 refund                  → 拒絕 REFUND.ONLY_REFUND
--   net < 0（超額退款）          → 拒絕 REFUND.OVER_REFUNDED
--   餘額已等於總堂數             → 拒絕 REFUND.BALANCE_FULL（核心函式會留一筆 delta 0 的警示帳）
--   拒絕時不寫任何會改餘額的資料；呼叫端應提示櫃檯人工處理。
-- 分期：退款只增加 sessions_remaining，不動 unlocked_sessions（已開通額度不會因退款而增加；使用量下降，額度自然「恢復」）。
-- 不退堂的取消（櫃檯明確選「扣課不退」）：呼叫端根本不會呼叫本函式，行為不變。
--
-- 授權：與 fn_deduct_ticket 相同——啟用中的員工；櫃檯層級可處理任何預約，教練只能處理自己（主責或代課）的預約。
--   只授權 authenticated；anon、service_role、public 一律不授權。
--
-- operator：fn_tk_refund_once 原本固定寫 'system'；為了讓帳本看得出是誰退的，這裡把它改成「向下相容的超集」——
--   讀 app.tk_operator（交易區域設定、僅資料庫函式能設），沒設定（或空字串）時行為與原版完全相同（'system'）。
--   fn_refund_ticket 在呼叫核心前設成呼叫者、呼叫後**還原成呼叫前的值**（見函式內註解與 p0e_12 測試 R16–R20）。
--
-- 回復：drop function public.fn_refund_ticket(text,text,text);
--       並用 docs/testdb/p0e/p0e_12_quota_refund_rollback.sql 還原 fn_tk_refund_once 原版。
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text) returns boolean
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

create or replace function public.fn_refund_ticket(p_ticket_id text, p_booking_id text, p_note text default null) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
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

  select count(*) filter (where action::text = 'deduct'), count(*) filter (where action::text = 'refund'),
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
    raise warning 'fn_refund_ticket internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.INTERNAL_ERROR');
end
$fn$;

revoke all on function public.fn_refund_ticket(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.fn_refund_ticket(text, text, text) to authenticated;

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

-- 候選修正，尚未發布。替換既有函式，保留原簽名與權限。
create or replace function public.fn_hold_settle_new_ticket(
  p_ticket_id text, p_dry boolean default true, p_anchor_booking_id text default null, p_expect jsonb default null)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_own_sib int := 0; v_contract_sig text; v_emp text; v_t record; v_today date := public.fn_tk_today();
  v_anc bookings%rowtype; v_has_anc boolean := false;
  v_ids0 text[]; v_ids text[]; v_bind text[] := '{}'; v_hold text[] := '{}'; v_cancel text[] := '{}';
  v_avail int; v_locked int; v_sib int; v_inst boolean; v_i int := 0; v_id text; v_net int; v_n int;
  v_plan jsonb; v_ex_b text[]; v_ex_h text[]; v_ex_c text[]; v_done boolean;
  v_tt_restricted boolean; v_rows jsonb; v_sig text; v_tr member_tickets%rowtype; v_out text[] := '{}'; v_wmin date; v_defer text[] := '{}'; v_over text[] := '{}'; v_map text[] := '{}'; v_others text; o member_tickets%rowtype; bd date; j int; v_o_id text[] := '{}'; v_o_cap int[] := '{}'; v_o_lo date[] := '{}'; v_o_hi date[] := '{}'; v_o_vd int[] := '{}'; v_o_un boolean[] := '{}'; v_o_exp date[] := '{}'; v_o_st date[] := '{}'; v_o_act boolean[] := '{}'; v_o_cur int; v_ok boolean;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_ticket_id is null then return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS'); end if;
  if not coalesce(p_dry, true) and p_expect is null then return jsonb_build_object('ok', false, 'error_code', 'EXPECT_REQUIRED'); end if;
  perform set_config('lock_timeout', '3000', true);

  select id, member_id, ticket_type_id into v_t from member_tickets where id = p_ticket_id;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_TICKET'); end if;
  if v_t.member_id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_MEMBER'); end if;
  perform pg_advisory_xact_lock(hashtext('hset:' || v_t.member_id || ':' || coalesce(v_t.ticket_type_id, '')));

  -- 合約先鎖定，再鎖預約、票券；只允許這份合約實際發出的票承接。
  perform 1 from contracts c where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id order by c.id for update;
  select string_agg(c.id || ':' || md5(to_jsonb(c)::text), '|' order by c.id) into v_contract_sig
    from contracts c where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id;

  if p_anchor_booking_id is not null then
    select * into v_anc from bookings where id = p_anchor_booking_id;
    v_has_anc := found;
    if not v_has_anc then return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_FOUND'); end if;
  end if;

  -- 第一輪（未鎖）：找候選 id；然後鎖住這些預約列與票券列，鎖後重算一次（讀已提交的最新狀態）
  for v_n in 1..2 loop
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_ids
      from bookings b, member_tickets mt
     where mt.id = p_ticket_id
       and b.status::text = 'booked' and b.pending_contract is true and b.ticket_id is null
       and (b.contract_id is null or exists (select 1 from contracts c
         where c.id = b.contract_id and c.ticket_id = mt.id and c.member_id = mt.member_id))
       and b.checked_in_at is null and b.date >= v_today
       and b.ticket_type_id is not distinct from mt.ticket_type_id and mt.ticket_type_id is not null
       and b.category::text <> '小班肌力' and b.sibling_of is null
       and coalesce(jsonb_array_length(case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids end), 0) = 0
       and coalesce(b.note, '') not like '%分期待繳費保留%'
       and ( b.member_id = mt.member_id
             or ( v_has_anc and v_anc.member_id is null and b.member_id is null
                  and (v_anc.trial_name is not null or v_anc.trial_phone is not null)
                  and b.trial_name is not distinct from v_anc.trial_name and b.trial_phone is not distinct from v_anc.trial_phone ) )
       and mt.status::text = 'usable'
       and (mt.expire_date is null or mt.expire_date >= b.date)
       and not (mt.start_date is not null and mt.start_date > b.date and mt.activated_at is null)
       and ( not coalesce((select tt.time_restricted from ticket_types tt where tt.id = mt.ticket_type_id), false)
             or ( extract(isodow from b.date) between 1 and 5
                  and (b.start_time::time + make_interval(mins => coalesce(b.duration, 60))) <= time '18:00'
                  and b.start_time::time + make_interval(mins => coalesce(b.duration, 60)) > b.start_time::time ) );
    if v_n = 1 then
      v_ids0 := v_ids;
      perform 1 from bookings where id = any (v_ids0) order by id for update;
      perform 1 from member_tickets where ticket_type_id is not distinct from v_t.ticket_type_id and (id = p_ticket_id or (status::text = 'usable' and (member_id = v_t.member_id or shared_with is not null))) order by id for update;   -- 本票與同票種的其他可用票券一起鎖（依 id）：自己名下的，加上「別人名下有共享名單的」（先多鎖、不呼叫判定函式；是否真的共享給這位會員由下面判定）
    end if;
  end loop;
  -- 鎖後重找若多出沒鎖到的候選：安全停止，請重新預覽（不處理沒鎖住的預約）
  if exists (select 1 from unnest(v_ids) x where not (x = any (v_ids0))) then
    return jsonb_build_object('ok', false, 'error_code', 'CANDIDATES_CHANGED');
  end if;
  -- 鎖後狀態（票券可能剛被扣／退）
  select id, member_id, ticket_type_id, status, sessions_total, sessions_remaining, unlocked_sessions, installment, payment_status
    into v_t from member_tickets where id = p_ticket_id;
  if v_t.status::text <> 'usable' and coalesce(array_length(v_ids, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'TICKET_NOT_USABLE', 'status', v_t.status::text);
  end if;
  -- 效期窗口（階段 tkwin）：尚未啟用的票，預約日期需落在「最早一堂起 valid_days 天」內，否則轉正會被資料庫擋下。
  --   超出窗口的卡位不轉正、不取消（不動），預覽會標示；不佔用票券堂數。
  select * into v_tr from member_tickets where id = p_ticket_id;
  if coalesce(array_length(v_ids, 1), 0) > 0 and coalesce(v_tr.valid_days, 0) > 0 and public.fn_tk_is_unopened(v_tr) then
    select least(coalesce((select min(h.bdate) from public.fn_tk_holding(p_ticket_id, null) h), date '9999-12-31'),
                 (select min(b.date) from bookings b where b.id = any (v_ids))) into v_wmin;
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_out from bookings b where b.id = any (v_ids) and b.date > v_wmin + (v_tr.valid_days - 1);
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_ids from bookings b where b.id = any (v_ids) and not (b.id = any (v_out));
  end if;
  if coalesce(p_dry, true) and v_has_anc and not (p_anchor_booking_id = any (v_ids)) then   -- 執行階段不查（重送時那筆已轉正），由 p_expect 比對把關
    return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_ELIGIBLE');
  end if;

  v_inst := v_t.installment is not null and jsonb_typeof(to_jsonb(v_t.installment)) = 'object';
  v_avail := case when v_inst
      then greatest(0, least(coalesce(v_t.sessions_remaining, 0),
             coalesce(v_t.unlocked_sessions, coalesce(v_t.sessions_total, 0)) - greatest(0, coalesce(v_t.sessions_total, 0) - coalesce(v_t.sessions_remaining, 0))))
      else greatest(0, coalesce(v_t.sessions_remaining, 0)) end;
  v_locked := case when v_inst then greatest(0, coalesce(v_t.sessions_total, 0) - coalesce(v_t.unlocked_sessions, coalesce(v_t.sessions_total, 0))) else 0 end;
  select count(*) into v_sib from bookings b
   where b.member_id = v_t.member_id and b.ticket_type_id is not distinct from v_t.ticket_type_id and b.status::text = 'booked'
     and b.pending_contract is true and b.ticket_id is null and b.date >= v_today and coalesce(b.note, '') like '%分期待繳費保留%';

  -- 本合約既有的分期保留已占用未開通額度，不能再次分配。
  select count(*) into v_own_sib from bookings b join contracts c on c.id = b.contract_id
   where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id and b.member_id = v_t.member_id
     and b.ticket_type_id is not distinct from v_t.ticket_type_id and b.status::text = 'booked'
     and b.pending_contract is true and b.ticket_id is null and b.date >= v_today
     and coalesce(b.note, '') like '%分期待繳費保留%';
  if v_own_sib > v_locked then return jsonb_build_object('ok', false, 'error_code', 'INST_AMBIGUOUS'); end if;
  v_locked := greatest(0, v_locked - v_own_sib);
  v_sib := greatest(0, v_sib - v_own_sib);

  -- 超額卡位逐筆核對「同會員同票種的其他可用票券」能不能承接（rev5）：
  --   每張其他票：狀態可用、已開通可約堂數（扣掉已被本次分配的）、起始日、效期涵蓋上課日、尚未啟用票的有效天數窗口（連既有占用一起算）。
  --   堂數逐筆遞減，同一堂數不會重複分配；由近到遠、每筆交給「最早到期」的合格票。分配不到＝真的超額，取消。
  --   票券資料本身無法判讀（分期票缺已開通堂數）→ 無法確認，整批停止（UNVERIFIABLE_OTHER），不猜、不取消。
  -- 共享名單判讀（rev6）：別人名下、同票種、「可用（usable）」且有 shared_with 的票（已不可用的票本來就不會被拿來承接，名單異常也不影響這次判定，不擋）；名單不是「字串陣列」（或字串化的字串陣列）＝無法確認這位會員能不能用 → 整批停止，不猜、不取消。
  for o in select * from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and t.member_id is distinct from v_t.member_id and t.status::text = 'usable' and t.shared_with is not null order by t.id loop
    begin
      v_ok := case when jsonb_typeof(o.shared_with) = 'null' then true
        when jsonb_typeof(o.shared_with) = 'array' then not exists (select 1 from jsonb_array_elements(o.shared_with) e where jsonb_typeof(e) <> 'string')
        when jsonb_typeof(o.shared_with) = 'string' and (o.shared_with #>> '{}') ~ '^\s*\[' then (jsonb_typeof((o.shared_with #>> '{}')::jsonb) = 'array' and not exists (select 1 from jsonb_array_elements((o.shared_with #>> '{}')::jsonb) e where jsonb_typeof(e) <> 'string'))
        else false end;
    exception when others then v_ok := false;
    end;
    if not coalesce(v_ok, false) then return jsonb_build_object('ok', false, 'error_code', 'UNVERIFIABLE_OTHER', 'ticket_id', o.id, 'reason', 'SHARED_UNREADABLE'); end if;
  end loop;
  for o in select * from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and t.status::text = 'usable' and (t.member_id = v_t.member_id or public.fn_tk_shared_has(to_jsonb(t.shared_with), v_t.member_id)) order by t.expire_date nulls last, t.id loop
    if o.installment is not null and jsonb_typeof(to_jsonb(o.installment)) = 'object' and o.unlocked_sessions is null then
      return jsonb_build_object('ok', false, 'error_code', 'UNVERIFIABLE_OTHER', 'ticket_id', o.id);
    end if;
    v_o_cur := case when o.installment is not null and jsonb_typeof(to_jsonb(o.installment)) = 'object'
        then greatest(0, least(coalesce(o.sessions_remaining, 0), coalesce(o.unlocked_sessions, 0) - greatest(0, coalesce(o.sessions_total, 0) - coalesce(o.sessions_remaining, 0))))
        else greatest(0, coalesce(o.sessions_remaining, 0)) end;
    if v_o_cur > 0 then
      v_o_id := v_o_id || o.id; v_o_cap := v_o_cap || v_o_cur; v_o_exp := v_o_exp || o.expire_date; v_o_st := v_o_st || o.start_date; v_o_act := v_o_act || (o.activated_at is null);
      v_o_un := v_o_un || (coalesce(o.valid_days, 0) > 0 and public.fn_tk_is_unopened(o));
      v_o_vd := v_o_vd || coalesce(o.valid_days, 0);
      select min(h.bdate), max(h.bdate) into v_wmin, bd from public.fn_tk_holding(o.id, null) h;
      v_o_lo := v_o_lo || v_wmin; v_o_hi := v_o_hi || bd;
    end if;
  end loop;
  foreach v_id in array v_ids loop
    v_i := v_i + 1;
    if v_i <= v_avail then v_bind := v_bind || v_id;
    elsif v_locked > 0 and v_sib = 0 and v_i <= v_avail + v_locked then v_hold := v_hold || v_id;
    else v_over := v_over || v_id; end if;
  end loop;
  foreach v_id in array v_over loop
    -- 已歸屬本合約的超額卡位直接取消，不延到其他票券或下一份合約。
    if exists (select 1 from bookings b where b.id = v_id and b.contract_id is not null) then
      v_cancel := v_cancel || v_id; continue;
    end if;
    select b.date into bd from bookings b where b.id = v_id;
    j := 0;
    for v_n in 1..coalesce(array_length(v_o_id, 1), 0) loop
      if v_o_cap[v_n] > 0
         and (v_o_exp[v_n] is null or v_o_exp[v_n] >= bd)
         and not (v_o_st[v_n] is not null and v_o_st[v_n] > bd and v_o_act[v_n])
         and (not v_o_un[v_n] or (greatest(coalesce(v_o_hi[v_n], bd), bd) - least(coalesce(v_o_lo[v_n], bd), bd)) <= v_o_vd[v_n] - 1) then
        j := v_n; exit;
      end if;
    end loop;
    if j > 0 then
      v_o_cap[j] := v_o_cap[j] - 1; v_o_lo[j] := least(coalesce(v_o_lo[j], bd), bd); v_o_hi[j] := greatest(coalesce(v_o_hi[j], bd), bd);
      v_defer := v_defer || v_id; v_map := v_map || (v_id || '>' || v_o_id[j]);
    else v_cancel := v_cancel || v_id; end if;
  end loop;
  select string_agg(concat_ws(',', t.id, t.member_id, t.shared_with::text, t.status::text, t.sessions_total, t.sessions_remaining, t.unlocked_sessions, t.installment::text, t.expire_date, t.start_date, t.activated_at::text, t.valid_days), '|' order by t.id) into v_others
    from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and (t.member_id = v_t.member_id or (t.status::text = 'usable' and public.fn_tk_shared_has(to_jsonb(t.shared_with), v_t.member_id)));

  if coalesce(array_length(v_cancel, 1), 0) > 0 and v_locked > 0 and v_sib > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'INST_AMBIGUOUS', 'locked', v_locked, 'inst_holds', v_sib);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'date', b.date, 'start_time', b.start_time, 'category', b.category::text,
           'kind', case when b.id = any (v_bind) then 'bind' when b.id = any (v_hold) then 'hold' when b.id = any (v_out) then 'skip' when b.id = any (v_defer) then 'defer' else 'cancel' end,
           'to', (select split_part(m, '>', 2) from unnest(v_map) m where split_part(m, '>', 1) = b.id))
           order by b.date, b.start_time, b.id), '[]'::jsonb) into v_rows
    from bookings b where b.id = any (v_ids) or b.id = any (v_out);
  if v_has_anc then select * into v_anc from bookings where id = p_anchor_booking_id; end if;
  v_sig := md5(
      coalesce((select string_agg(b.id || ':' || md5(to_jsonb(b)::text), '|' order by b.date, b.start_time, b.id) from bookings b where b.id = any (v_ids) or b.id = any (v_out)), '')
      || '#' || coalesce((select concat_ws(',', mt.id, mt.member_id, mt.ticket_type_id, mt.status::text, mt.sessions_total, mt.sessions_remaining, mt.unlocked_sessions, mt.installment::text, mt.expire_date, mt.start_date, mt.activated_at::text)
                           from member_tickets mt where mt.id = p_ticket_id), '')
      || '#' || v_avail || ',' || v_locked || ',' || v_sib
      || '#' || array_to_string(v_bind, ',') || '/' || array_to_string(v_hold, ',') || '/' || array_to_string(v_cancel, ',') || '/' || array_to_string(v_out, ',') || '/' || array_to_string(v_defer, ',') || '/' || array_to_string(v_map, ',') || '#' || coalesce(v_others, '')
      || '#' || coalesce(v_contract_sig, '') || ':' || v_own_sib
      || '#' || case when v_has_anc then md5(to_jsonb(v_anc)::text) else '' end);
  v_plan := jsonb_build_object('bind', to_jsonb(v_bind), 'hold', to_jsonb(v_hold), 'cancel', to_jsonb(v_cancel), 'skip', to_jsonb(v_out), 'defer', to_jsonb(v_defer), 'sig', v_sig);

  if coalesce(p_dry, true) then
    return jsonb_build_object('ok', true, 'dry', true, 'plan', v_plan, 'rows', v_rows, 'avail', v_avail, 'locked', v_locked,
                              'inst_holds', v_sib, 'ticket_name', (select plan_name from member_tickets where id = p_ticket_id));
  end if;

  -- 執行：先比對確認畫面的清單
  select coalesce(array_agg(x order by x), '{}') into v_ex_b from jsonb_array_elements_text(coalesce(p_expect->'bind', '[]'::jsonb)) x;
  select coalesce(array_agg(x order by x), '{}') into v_ex_h from jsonb_array_elements_text(coalesce(p_expect->'hold', '[]'::jsonb)) x;
  select coalesce(array_agg(x order by x), '{}') into v_ex_c from jsonb_array_elements_text(coalesce(p_expect->'cancel', '[]'::jsonb)) x;
  if p_expect->>'sig' is null then return jsonb_build_object('ok', false, 'error_code', 'EXPECT_REQUIRED'); end if;
  if p_expect->>'sig' is distinct from v_sig
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_bind) x) is distinct from v_ex_b
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_hold) x) is distinct from v_ex_h
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_cancel) x) is distinct from v_ex_c then
    -- 不一致：若確認的那批已經全部是最終狀態＝重送，回 already；否則 PLAN_CHANGED（不做任何事）
    select (not exists (select 1 from unnest(v_ex_b) i where not exists (select 1 from bookings where id = i and ticket_id = p_ticket_id))
        and not exists (select 1 from unnest(v_ex_h) i where not exists (select 1 from bookings where id = i and status::text = 'booked' and ticket_id is null and coalesce(note, '') like '%分期待繳費保留%'))
        and not exists (select 1 from unnest(v_ex_c) i where not exists (select 1 from bookings where id = i and status::text = 'cancelled' and coalesce(cancel_reason, '') like '新票轉正整理%')))
      and (coalesce(array_length(v_ex_b, 1), 0) + coalesce(array_length(v_ex_h, 1), 0) + coalesce(array_length(v_ex_c, 1), 0)) > 0
      into v_done;
    if v_done then return jsonb_build_object('ok', true, 'already', true, 'plan', v_plan); end if;
    return jsonb_build_object('ok', false, 'error_code', 'PLAN_CHANGED', 'plan', v_plan, 'rows', v_rows);
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', true, 'already', true, 'plan', v_plan); end if;   -- 清單為空且 sig 相符＝沒有東西可做

  -- ① 轉正：逐堂 鎖定已完成，扣 1 堂、寫帳、綁票（任何一步失敗＝整個交易回滾）
  foreach v_id in array v_bind loop
    select coalesce(sum(case when action::text = 'deduct' and coalesce(delta, 0) <> 0 then 1 when action::text = 'refund' then -1 else 0 end), 0)
      into v_net from ticket_logs where ticket_id = p_ticket_id and booking_id = v_id;
    if v_net > 0 then raise exception 'SETTLE.ALREADY_DEDUCTED:%', v_id; end if;
    update member_tickets set sessions_remaining = sessions_remaining - 1 where id = p_ticket_id and sessions_remaining > 0;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.NO_REMAINING:%', v_id; end if;
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-' || replace(gen_random_uuid()::text, '-', ''), p_ticket_id, 'deduct', -1, v_id, v_emp, '預約扣課（新票轉正整理）', now());
    update bookings set member_id = v_t.member_id, ticket_id = p_ticket_id, ticket_type_id = coalesce(v_t.ticket_type_id, ticket_type_id),
           pending_contract = false, trial_name = null, trial_phone = null
     where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.BIND_ROWCOUNT:%', v_id; end if;
  end loop;
  -- ② 合約內尚未繳費開通的分期堂數：留成分期待繳費保留（不扣、不取消）
  foreach v_id in array v_hold loop
    update bookings set member_id = v_t.member_id, trial_name = null, trial_phone = null, note = '分期待繳費保留（收款後自動補扣）'
     where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.HOLD_ROWCOUNT:%', v_id; end if;
  end loop;
  -- ③ 真正超出合約總堂數：取消（保留紀錄，不刪除）
  foreach v_id in array v_cancel loop
    update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = v_emp,
           cancel_reason = '新票轉正整理：超出票券堂數，卡位自動取消',
           note = case when coalesce(note, '') = '' then '超出票券堂數，轉正整理時自動取消' else note || '｜超出票券堂數，轉正整理時自動取消' end
     where id = v_id and status::text = 'booked' and ticket_id is null;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.CANCEL_ROWCOUNT:%', v_id; end if;
  end loop;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
  values ('LG-' || replace(gen_random_uuid()::text, '-', ''), p_ticket_id, 'adjust', 0, null, v_emp,
          '新票轉正整理：轉正 ' || coalesce(array_length(v_bind, 1), 0) || ' 堂、分期保留 ' || coalesce(array_length(v_hold, 1), 0)
          || ' 堂、取消 ' || coalesce(array_length(v_cancel, 1), 0) || ' 堂', now());
  return jsonb_build_object('ok', true, 'bound', to_jsonb(v_bind), 'held', to_jsonb(v_hold), 'cancelled', to_jsonb(v_cancel),
                            'remaining', (select sessions_remaining from member_tickets where id = p_ticket_id));
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY');
  when others then
    -- 本區塊內的所有寫入都已回滾；回傳失敗，前端不得再做任何取消
    return jsonb_build_object('ok', false, 'error_code', 'SETTLE.FAILED', 'detail', sqlerrm);
end
$fn$;
-- 回滾式測試（rev6 共享票）：只需暫裝本函式（測試庫 baseline＋tkwin 已有其他依賴）；整段在同一交易，最後故意拋 RESULT 讓全部回滾，不留資料。
-- 情境：預約會員 A 有新票（只能承接最近 1 堂）；別人名下（O）有同票種票並把 shared_with 共享給 A。一般預約本來就允許 A 用這張票。
-- SH1 共享票有效：第一堂轉正、其餘標 defer（先不動：不扣共享票、不取消卡位）；SH2 過期／SH3 額度 0／SH4 沒共享給 A／SH10 不同票種／SH11 已用完／SH12 起始日未到 → 不能算可用，照舊取消；
-- SH5 共享票只剩 1 堂 → 只承接 1 堂，其餘取消（不重複分配）；SH6 名單格式讀不懂／SH7 共享分期票缺已開通堂數 → UNVERIFIABLE_OTHER 整批停止、一筆都不動；
-- SH13 已不可用的票名單異常→不擋；SH14 可用的票名單異常→擋；SH8 預覽後共享票被用掉 → PLAN_CHANGED；SH9 名單是字串化的陣列 → 一樣能辨識。
create function pg_temp.mkbk(p_id text, p_mem text, p_type text, p_cat text, p_date date, p_time text, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(b) into t from bookings b where b.status::text='booked' limit 1;
  insert into bookings select * from jsonb_populate_record(null::bookings, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_id',null,'ticket_type_id',p_type,'category',p_cat,
    'pending_contract',true,'date',p_date,'start_time',p_time,'status','booked','contract_id',null,'checked_in_at',null,'note',null,'member_ids','[]'::jsonb,'sibling_of',null,
    'trial_name',null,'trial_phone',null,'seat_tickets',null,'attendance',null,'cancelled_at',null,'cancelled_by',null,'cancel_reason',null,'recurring',false,'duration',60,'coach_id',null) || p_x);
end $$;
create function pg_temp.mktk(p_id text, p_mem text, p_type text, p_total int, p_rem int, p_inst jsonb, p_unl int, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(m) into t from member_tickets m limit 1;
  insert into member_tickets select * from jsonb_populate_record(null::member_tickets, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_type_id',p_type,'status','usable',
    'sessions_total',p_total,'sessions_remaining',p_rem,'installment',p_inst,'unlocked_sessions',p_unl,'expire_date',null,'start_date',null,'activated_at',null,'shared_with',null,'payment_status','paid','plan_name','ZZ測試票') || p_x);
end $$;
create function pg_temp.mkcase(p_n text, p_new_total int, p_holds int, p_shared jsonb) returns void language plpgsql as $$
declare i int; v_a text; v_o text; tt record; d0 date := public.fn_tk_today();
begin
  select a, o into v_a, v_o from (select (array_agg(id order by id))[10] a, (array_agg(id order by id))[9] o from members) q;
  select id, category::text cat into tt from ticket_types where category::text <> '小班肌力' and coalesce(time_restricted,false)=false limit 1;
  perform pg_temp.mktk('ZZSH'||p_n||'n', v_a, tt.id, p_new_total, p_new_total, null, null);
  for i in 1..p_holds loop perform pg_temp.mkbk('ZZSH'||p_n||'u'||i, v_a, tt.id, tt.cat, d0+i, '19:00'); end loop;
end $$;
do $do$
declare R jsonb := '[]'::jsonb; adm record; tt record; tt2 text; mem text[]; d0 date := public.fn_tk_today(); r1 jsonb; r2 jsonb; h1 text; h2 text; va text; vo text; vb text; v1 int; v2 int; v3 int;
begin
  select id, auth_id into adm from employees where role::text in ('admin','front_desk') and auth_id is not null limit 1;
  select id, category::text cat into tt from ticket_types where category::text <> '小班肌力' and coalesce(time_restricted,false)=false limit 1;
  select id into tt2 from ticket_types where id <> tt.id limit 1;
  select array_agg(id order by id) into mem from members;
  va := mem[10]; vo := mem[9]; vb := mem[8];
  perform set_config('request.jwt.claims', json_build_object('sub',adm.auth_id,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm.auth_id::text, true);
  perform set_config('request.jwt.claim.role','authenticated', true);
  -- SH1 共享票有效（5 堂）：1 轉正、2 defer、0 取消；執行後不扣共享票、不取消卡位
  perform pg_temp.mkcase('1', 1, 3, null);
  perform pg_temp.mktk('ZZSH1s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH1n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH1.dry_defer_shared','pass', (r1->'plan'->'bind') = '["ZZSH1u1"]'::jsonb and (r1->'plan'->'defer') = '["ZZSH1u2","ZZSH1u3"]'::jsonb and (r1->'plan'->'cancel') = '[]'::jsonb
     and (select count(*) from jsonb_array_elements(r1->'rows') x where x->>'kind'='defer' and x->>'to'='ZZSH1s')=2));
  r2 := public.fn_hold_settle_new_ticket('ZZSH1n', false, null, r1->'plan');
  select sessions_remaining into v1 from member_tickets where id='ZZSH1n'; select sessions_remaining into v2 from member_tickets where id='ZZSH1s'; select count(*) into v3 from ticket_logs where ticket_id='ZZSH1s';
  R := R || jsonb_build_array(jsonb_build_object('t','SH1.exec_no_touch_shared','pass', (r2->>'ok')='true' and v1=0 and v2=5 and v3=0
     and (select count(*) from bookings where id='ZZSH1u1' and ticket_id='ZZSH1n' and pending_contract=false)=1
     and (select count(*) from bookings where id in ('ZZSH1u2','ZZSH1u3') and status::text='booked' and ticket_id is null and pending_contract is true)=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH2 共享票過期（效期在預約日之前）→ 不能承接，取消
  perform pg_temp.mkcase('2', 1, 3, null);
  perform pg_temp.mktk('ZZSH2s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va), 'expire_date', d0));
  r1 := public.fn_hold_settle_new_ticket('ZZSH2n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH2.expired_shared_not_usable','pass', (r1->'plan'->'defer') = '[]'::jsonb and (r1->'plan'->'cancel') = '["ZZSH2u2","ZZSH2u3"]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH3 共享票額度 0 → 取消
  perform pg_temp.mkcase('3', 1, 3, null);
  perform pg_temp.mktk('ZZSH3s', vo, tt.id, 5, 0, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH3n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH3.zero_quota_shared_not_usable','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH4 共享名單裡沒有 A（共享給別人）→ 取消
  perform pg_temp.mkcase('4', 1, 3, null);
  perform pg_temp.mktk('ZZSH4s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(vb)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH4n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH4.shared_to_someone_else','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH5 共享票只剩 1 堂：4 個卡位 → 1 轉正、1 defer、2 取消（不重複分配）
  perform pg_temp.mkcase('5', 1, 4, null);
  perform pg_temp.mktk('ZZSH5s', vo, tt.id, 5, 1, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH5n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH5.partial_quota_no_double','pass', (r1->'plan'->'defer') = '["ZZSH5u2"]'::jsonb and (r1->'plan'->'cancel') = '["ZZSH5u3","ZZSH5u4"]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH6 別人名下的共享名單格式讀不懂 → UNVERIFIABLE_OTHER（預覽與執行都停），一筆都不動
  perform pg_temp.mkcase('6', 1, 3, null);
  perform pg_temp.mktk('ZZSH6s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('abc'::text)));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH6u%';
  r1 := public.fn_hold_settle_new_ticket('ZZSH6n', true); r2 := public.fn_hold_settle_new_ticket('ZZSH6n', false, null, '{"bind":[],"hold":[],"cancel":[],"sig":"x"}'::jsonb);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH6u%'; select sessions_remaining into v1 from member_tickets where id='ZZSH6n';
  R := R || jsonb_build_array(jsonb_build_object('t','SH6.unreadable_shared_list_stops','pass', r1->>'error_code'='UNVERIFIABLE_OTHER' and r1->>'reason'='SHARED_UNREADABLE' and r2->>'error_code'='UNVERIFIABLE_OTHER' and h1=h2 and v1=1));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH7 共享給 A 的分期票缺已開通堂數（無法確認額度）→ UNVERIFIABLE_OTHER
  perform pg_temp.mkcase('7', 1, 3, null);
  perform pg_temp.mktk('ZZSH7s', vo, tt.id, 6, 6, '{"count":3,"current":1}'::jsonb, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH7u%';
  r1 := public.fn_hold_settle_new_ticket('ZZSH7n', true); r2 := public.fn_hold_settle_new_ticket('ZZSH7n', false, null, '{"bind":[],"hold":[],"cancel":[],"sig":"x"}'::jsonb);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH7u%';
  R := R || jsonb_build_array(jsonb_build_object('t','SH7.shared_installment_unverifiable_stops','pass', r1->>'error_code'='UNVERIFIABLE_OTHER' and r2->>'error_code'='UNVERIFIABLE_OTHER' and h1=h2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH8 預覽後共享票被用掉 → 確認指紋變 → PLAN_CHANGED、不做任何事
  perform pg_temp.mkcase('8', 1, 3, null);
  perform pg_temp.mktk('ZZSH8s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH8n', true);
  update member_tickets set sessions_remaining = 0 where id = 'ZZSH8s';
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH8u%';
  r2 := public.fn_hold_settle_new_ticket('ZZSH8n', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH8u%'; select sessions_remaining into v1 from member_tickets where id='ZZSH8n';
  R := R || jsonb_build_array(jsonb_build_object('t','SH8.shared_consumed_plan_changed','pass', r2->>'error_code'='PLAN_CHANGED' and h1=h2 and v1=1));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH9 名單是「字串化的陣列」（舊資料常見）→ 一樣辨識
  perform pg_temp.mkcase('9', 1, 3, null);
  perform pg_temp.mktk('ZZSH9s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb(('["' || va || '"]')::text)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH9n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH9.stringified_list','pass', (r1->'plan'->'defer') = '["ZZSH9u2","ZZSH9u3"]'::jsonb and (r1->'plan'->'cancel') = '[]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH10 不同票種的共享票 → 不算，取消（票種比對仍是完全相同）
  perform pg_temp.mkcase('10', 1, 3, null);
  perform pg_temp.mktk('ZZSH10s', vo, tt2, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH10n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH10.other_type_shared_not_counted','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH11 共享票已用完（status=used_up）→ 取消
  perform pg_temp.mkcase('11', 1, 3, null);
  perform pg_temp.mktk('ZZSH11s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va), 'status', 'used_up'));
  r1 := public.fn_hold_settle_new_ticket('ZZSH11n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH11.used_up_shared_not_usable','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH12 共享票尚未啟用且起始日在這些預約之後 → 不能承接，取消
  perform pg_temp.mkcase('12', 1, 3, null);
  perform pg_temp.mktk('ZZSH12s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va), 'start_date', d0 + 10));
  r1 := public.fn_hold_settle_new_ticket('ZZSH12n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH12.shared_not_started','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH13 同票種但「已不可用」（used_up）的別人名下的票，共享名單格式異常（'abc'、'[bad'）→ 不影響這次判定、不擋整批：照常 1 轉正、2 取消
  perform pg_temp.mkcase('13', 1, 3, null);
  perform pg_temp.mktk('ZZSH13a', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('abc'::text), 'status', 'used_up'));
  perform pg_temp.mktk('ZZSH13b', vb, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('[bad'::text), 'status', 'used_up'));
  r1 := public.fn_hold_settle_new_ticket('ZZSH13n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH13.unusable_ticket_bad_list_does_not_block','pass', (r1->>'ok')='true' and (r1->'plan'->'bind') = '["ZZSH13u1"]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2 and (r1->'plan'->'defer') = '[]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH14 可用（usable）的別人名下的票，名單是壞掉的字串化陣列 '[bad'（轉型會丟錯）→ 仍要擋整批（UNVERIFIABLE_OTHER，不是 SETTLE.FAILED），一筆不動
  perform pg_temp.mkcase('14', 1, 3, null);
  perform pg_temp.mktk('ZZSH14s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('[bad'::text)));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH14u%';
  r1 := public.fn_hold_settle_new_ticket('ZZSH14n', true);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH14u%';
  R := R || jsonb_build_array(jsonb_build_object('t','SH14.usable_ticket_bad_list_blocks','pass', r1->>'error_code'='UNVERIFIABLE_OTHER' and r1->>'reason'='SHARED_UNREADABLE' and h1=h2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  raise exception 'RESULT total=% failed=%', jsonb_array_length(R), coalesce((select jsonb_agg(x->>'t') from jsonb_array_elements(R) x where (x->>'pass') is distinct from 'true'), '[]'::jsonb);
end $do$;
