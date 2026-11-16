-- 最終驗收：測試庫暫時安裝（階段 06＋08＋觀測函式）。只對測試庫 kucvxpjatptfckhlxptj。測完執行 phase_remove_testdb.sql 並比對基準。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
-- ── 階段 06：fn_tk_refund_once（06 版）＋ fn_refund_ticket ──
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

-- ── 階段 06：額度防護觸發器 ──
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

-- ── 階段 08 ──
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


-- ═══ 觀測函式（只供最終驗收；測完由 phase_remove_testdb.sql 移除）═══
-- 只允許本輪建立的測試員工身分（employees.id 以 CC-EMP- 開頭）呼叫；匿名與其他登入者一律拒絕。
-- holder：做完事後在交易內輪詢 pg_stat_activity，直到看到「被自己擋住的等候者」（或逾時）才返回——不用固定等待當證據。
create or replace function public.zz_cc_overlap(p_kind text, p_a text, p_b text, p_c text, p_role text, p_poll_ms int default 8000)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_t0 timestamptz := clock_timestamp(); v_res jsonb; v_t1 timestamptz; v_blocked jsonb := '[]'::jsonb; v_deadline timestamptz;
begin
  if coalesce(public.current_employee_id(), '') not like 'CC-EMP-%' then return jsonb_build_object('error', 'NOT_TEST_IDENTITY'); end if;
  if p_kind = 'deduct' then v_res := public.fn_desk_deduct_ticket(p_a, p_b, 'overlap', null);
  elsif p_kind = 'opdeduct' then v_res := public.fn_desk_deduct_ticket(p_a, p_b, 'overlap', p_c);
  elsif p_kind = 'cancel' then v_res := public.fn_desk_cancel_booking(p_a, coalesce(p_b, 'auto'));
  else return jsonb_build_object('error', 'BAD_KIND'); end if;
  v_t1 := clock_timestamp();
  if p_role = 'holder' then
    v_deadline := clock_timestamp() + (p_poll_ms || ' milliseconds')::interval;
    loop
      select coalesce(jsonb_agg(jsonb_build_object('pid', a.pid, 'wait_event_type', a.wait_event_type, 'blocked_by_me', true)), '[]'::jsonb)
        into v_blocked from pg_stat_activity a
       where a.pid <> pg_backend_pid() and a.wait_event_type = 'Lock' and pg_backend_pid() = any (pg_blocking_pids(a.pid));
      exit when v_blocked <> '[]'::jsonb or clock_timestamp() > v_deadline;
      perform pg_sleep(0.05);
    end loop;
  end if;
  return jsonb_build_object('pid', pg_backend_pid(), 'txid', txid_current(), 'role', p_role, 'start', v_t0, 'locks_acquired_at', v_t1,
                            'end', clock_timestamp(), 'result', v_res, 'blocked_waiters', v_blocked);
end $fn$;
revoke all on function public.zz_cc_overlap(text, text, text, text, text, int) from public, anon;
grant execute on function public.zz_cc_overlap(text, text, text, text, text, int) to authenticated;

notify pgrst, 'reload schema';
