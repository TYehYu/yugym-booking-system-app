-- ═══════════════════════════════════════════════════════════════════════
-- 正式庫 1/4 階段｜P0-C 調課原子化 RPC｜回復（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc）
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
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') is distinct from '411549f649f4858215e6e03429bb7ce7:13276' then
    raise exception 'P0C.ROLLBACK_ABORT: 目前不是 P0-C 原版（TKWIN 修補還在？請先回復第 3 階段）'; end if;
end
$pre$;
revoke execute on function public.fn_move_booking_ticket(text, text, text) from authenticated;
drop function if exists public.fn_move_booking_ticket(text, text, text);
do $post$ begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') then raise exception 'P0C.ROLLBACK_POSTCHECK_FAILED: 仍有殘留'; end if;
end $post$;
commit;
-- ⚠ 已用本函式完成的調課沒有自動反向（餘額不變、帳本成對）；需要時走個案審查。前端須先退回舊版（舊版仍走直寫）。
