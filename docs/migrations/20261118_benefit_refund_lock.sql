-- ═══════════════════════════════════════════════════════════════════════
-- benefit_refund 補鎖（最小修正）——fn_cancel_booking 取消時呼叫它退課（備註「取消返還原票」，11 月以來 78 筆）
-- ⚠ 準備稿，尚未在任何資料庫執行。測試庫套用前需使用者授權；正式庫需另行明確授權。
-- 問題：正式庫現行版「先 select 算淨額、再 update 餘額」，**沒有鎖票券列**。兩個並行呼叫（例如同一預約被雙擊取消、
--   或取消與其他寫入交錯）都會看到 net > 0，各退一次 → 雙退。
-- 修正：只加一行，在算淨額之前先鎖票券列（for update），讓「檢查＋更新」在鎖內完成；其餘邏輯逐字不變。
-- 基準：正式庫 2026-11-15 唯讀取得的 benefit_refund（指紋 md5:長度 見下方 precondition），ACL postgres＋service_role 不變。
-- 回復：還原成原版（見 docs/testdb/p0e/p0e_12_quota_refund_rollback.sql 內的原文）。
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.benefit_refund(p_benefit_ref text, p_qty integer, p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_net integer;
begin
  if p_benefit_ref is null then return jsonb_build_object('ok',true); end if;

  perform 1 from member_tickets where id = p_benefit_ref for update;      -- 補鎖：先鎖票券列，再算淨額＋更新

  select coalesce(sum(case when action='deduct' then 1 when action='refund' then -1 else 0 end),0)
    into v_net
  from ticket_logs
  where ticket_id = p_benefit_ref and booking_id = p_booking_id;

  if v_net <= 0 then
    return jsonb_build_object('ok',true,'skipped','no_deduct');
  end if;

  update member_tickets set sessions_remaining = sessions_remaining + p_qty
   where id = p_benefit_ref;
  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), p_benefit_ref, 'refund', p_qty, p_booking_id, 'system', '取消返還原票');
  return jsonb_build_object('ok',true);
end
$function$;
