-- ═══════════════════════════════════════════════════════════════════════
-- 正式庫 7 階段｜benefit_refund 補鎖（正式庫現行版沒有鎖票券列，並行雙退）｜套用（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc）
-- ⚠ 需使用者「逐階段」明確授權後才可執行；前一階段必須已部署且驗證通過；整檔單一交易，任何一項檢查失敗整段回滾。
-- ⚠ 若失敗原因是「套用期間有人正在改票券（雜湊不符）」：整段已回滾、沒有影響，請在低流量時段重跑。
-- 守門：叢集識別 7637215626725903220＋有 change_log／fn_table_sigs；測試庫識別會在守門直接中止。
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
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'benefit_refund') is distinct from 'dbe63afeb1f95715cd8a02f454c06a70:736' then
    raise exception 'BR.ABORT: benefit_refund 不是 2026-11-15 唯讀盤點的版本'; end if;
end
$pre$;

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

do $post$
begin
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'benefit_refund') <> 'e1fb16bb9dff2ee15c6871923ce38a77:831' then raise exception 'BR.POSTCHECK_FAILED: 本體與補鎖版不符'; end if;
  if coalesce((select proacl::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'benefit_refund'), '') <> '{postgres=X/postgres,service_role=X/postgres}' then raise exception 'BR.POSTCHECK_FAILED: ACL 被改變'; end if;
end
$post$;
commit;
