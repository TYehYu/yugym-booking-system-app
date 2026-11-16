-- ═══════════════════════════════════════════════════════════════════════
-- 套用：分期額度共用防護＋原子退票（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc；需使用者明確授權後才可執行；正式庫須另行取得寫入授權，並在 P0-E 部署驗證通過之後）
-- 單一交易：庫識別守門 → 前置條件（原版指紋、新物件不存在）→ 記錄票券雜湊 → 內嵌 migration（與 docs/migrations/20261118_*.sql 逐字相同）
--   → 後置檢查（新版指紋、觸發器啟用、ACL、票券資料未被改動）。任何一項失敗整段回滾。
-- ⚠ 票券雜湊檢查若因為「套用期間有人正在改票券」而失敗：整段已回滾，沒有任何影響，請在低流量時重跑。
-- ═══════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then
    raise exception 'PROD.GUARD: 叢集識別與正式庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is null or not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'PROD.GUARD: 缺少正式庫標記（change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;
do $pre$
begin
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_tk_refund_once') is distinct from 'cc6de55f10efb79d804296a7bc387a26:1156' then
    raise exception 'QUOTAREFUND.ABORT: fn_tk_refund_once 不是 P0-E 原版（P0-E 尚未部署或已被改動）'; end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_refund_ticket','trg_tk_quota_guard')) then
    raise exception 'QUOTAREFUND.ABORT: 新物件已存在，不重複建立'; end if;
  if to_regprocedure('public.current_employee_id()') is null or to_regprocedure('public.is_staff_desk()') is null or to_regprocedure('public.gen_short_id(text)') is null then
    raise exception 'QUOTAREFUND.ABORT: 缺少依賴函式（current_employee_id／is_staff_desk／gen_short_id）'; end if;
end
$pre$;
create temp table qr_pre on commit drop as select count(*) as n, md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(unlocked_sessions::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) as h from member_tickets;

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

do $post$
declare v_n bigint; v_h text;
begin
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgname = 'trg_tk_quota_guard' and tgrelid = 'public.member_tickets'::regclass) <> 1 then
    raise exception 'QUOTAREFUND.POSTCHECK_FAILED: 額度觸發器不存在或未啟用'; end if;
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_tk_refund_once') <> 'bba19026075474e59d57365e38361f1e:1235' then
    raise exception 'QUOTAREFUND.POSTCHECK_FAILED: fn_tk_refund_once 與新版不符'; end if;
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_refund_ticket') <> '7fd3d3333181643bc30b52ac091e2e0a:3218' then
    raise exception 'QUOTAREFUND.POSTCHECK_FAILED: fn_refund_ticket 與預期不符'; end if;
  if coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_refund_ticket(text,text,text)')), '') <> '{postgres=X/postgres,authenticated=X/postgres}' then
    raise exception 'QUOTAREFUND.POSTCHECK_FAILED: fn_refund_ticket 的 ACL 不是「擁有者＋authenticated」'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('trg_tk_quota_guard','fn_tk_refund_once')
              and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE'))) then
    raise exception 'QUOTAREFUND.POSTCHECK_FAILED: 內部函式對 API 角色開放'; end if;
  select count(*), md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(unlocked_sessions::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_n, v_h from member_tickets;
  if v_n <> (select n from qr_pre) or v_h <> (select h from qr_pre) then
    raise exception 'QUOTAREFUND.POSTCHECK_FAILED: 套用過程中既有票券資料被改動'; end if;
end
$post$;
commit;
