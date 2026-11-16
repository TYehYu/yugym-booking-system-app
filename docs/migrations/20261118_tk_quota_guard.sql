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
