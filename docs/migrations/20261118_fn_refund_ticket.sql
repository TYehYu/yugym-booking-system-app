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
