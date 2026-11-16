-- ═══════════════════════════════════════════════════════════════════════
-- P0E-12 回復（分期額度防護＋原子退票）（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc；需使用者逐階段明確授權（含 DROP），且正式庫套用本階段之後才有東西可回復）
-- 保護原則（本輪補強）：**在還原或刪除任何物件之前，先完整核對四個物件都是預期的安裝版本**，不符、缺失或狀態不明一律在變更前中止，不覆蓋、不刪除：
--   ・fn_tk_refund_once(text,text,text)、fn_refund_ticket(text,text,text)、trg_tk_quota_guard()：依精確簽名取得，核對本體指紋（md5:長度）。
--   ・member_tickets 上的觸發器 trg_tk_quota_guard：核對所屬資料表、呼叫的函式 oid、事件（BEFORE UPDATE、逐列、非 INSERT／DELETE／TRUNCATE）、
--     未停用（tgenabled='O'）、沒有 WHEN 條件、沒有參數、UPDATE OF 欄位清單恰為 sessions_remaining／sessions_total／unlocked_sessions，且定義（正規化後）與預期相同；
--     全庫同名觸發器必須剛好一個（不能掛在別的表）。
--   ・指紋與預期觸發器定義都由對應安裝檔（P0-E migration、20261118_fn_refund_ticket.sql、20261118_tk_quota_guard.sql）機械產生，本機測試會重算比對，不是手抄。
--   ・「完整已回復」狀態若要支援重跑，必須明確驗證（核心是原版、其餘物件都不存在、沒有同名觸發器），才視為無需動作；任何半套或混合狀態一律中止。
-- 保留：環境識別守門、單一交易、不使用 CASCADE（drop 在有相依物件時本身也會失敗並整筆回滾）。
-- 待實測的不確定處：pg_get_triggerdef 的輸出格式（我只做了小寫、移除 public.、壓縮空白的正規化）；若實際格式不同會造成「誤中止」（安全方向），需依實測調整預期字串。
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
do $rb$
declare
  v_orig_fp constant text := 'cc6de55f10efb79d804296a7bc387a26:1156';   -- fn_tk_refund_once 原版（P0-E migration 本體）
  v_new_fp  constant text := 'bba19026075474e59d57365e38361f1e:1235';    -- fn_tk_refund_once 新版（20261118_fn_refund_ticket.sql 本體）
  v_rf_fp   constant text := '7fd3d3333181643bc30b52ac091e2e0a:3218';    -- fn_refund_ticket（同上檔）
  v_qg_fp   constant text := '999c8ef061cf126c068f9ecd4405590d:753';    -- trg_tk_quota_guard()（20261118_tk_quota_guard.sql 本體）
  v_exp_def constant text := 'create trigger trg_tk_quota_guard before update of sessions_remaining, sessions_total, unlocked_sessions on member_tickets for each row execute function trg_tk_quota_guard()';
  v_once oid := to_regprocedure('public.fn_tk_refund_once(text,text,text)');
  v_rf   oid := to_regprocedure('public.fn_refund_ticket(text,text,text)');
  v_qg   oid := to_regprocedure('public.trg_tk_quota_guard()');
  v_once_fp text; v_rf_fp2 text; v_qg_fp2 text; v_trg pg_trigger%rowtype; v_ntrg integer; v_def text; v_installed boolean := false; v_reverted boolean;
begin
  -- 0) 先完整核對（精確簽名＋指紋；觸發器核對所屬資料表、呼叫函式、事件、停用狀態、WHEN 條件、欄位清單與定義）。任何不符一律在變更前中止。
  if v_once is not null then select md5(prosrc) || ':' || length(prosrc) into v_once_fp from pg_proc where oid = v_once; end if;
  if v_rf   is not null then select md5(prosrc) || ':' || length(prosrc) into v_rf_fp2 from pg_proc where oid = v_rf; end if;
  if v_qg   is not null then select md5(prosrc) || ':' || length(prosrc) into v_qg_fp2 from pg_proc where oid = v_qg; end if;
  select count(*) into v_ntrg from pg_trigger where tgname = 'trg_tk_quota_guard' and not tgisinternal;
  select * into v_trg from pg_trigger where tgname = 'trg_tk_quota_guard' and tgrelid = 'public.member_tickets'::regclass and not tgisinternal;
  -- 狀態 A：完整已回復（要支援重跑，必須明確驗證：核心是原版、其餘三個物件都不存在、任何資料表上都沒有同名觸發器）
  v_reverted := v_once is not null and v_once_fp = v_orig_fp and v_rf is null and v_qg is null and v_ntrg = 0;
  -- 狀態 B：完整且與安裝版本一致
  if v_once is not null and v_once_fp = v_new_fp and v_rf is not null and v_rf_fp2 = v_rf_fp and v_qg is not null and v_qg_fp2 = v_qg_fp and v_ntrg = 1 and v_trg.oid is not null then
    v_def := lower(regexp_replace(replace(pg_get_triggerdef(v_trg.oid, false), 'public.', ''), '\s+', ' ', 'g'));
    v_installed := v_trg.tgfoid = v_qg and v_trg.tgenabled = 'O' and v_trg.tgqual is null and v_trg.tgnargs = 0
      and (v_trg.tgtype & 1) = 1 and (v_trg.tgtype & 2) = 2 and (v_trg.tgtype & 16) = 16 and (v_trg.tgtype & (4 | 8 | 32 | 64)) = 0
      and (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid = v_trg.tgrelid and a.attnum = any (v_trg.tgattr::int2[])) = array['sessions_remaining','sessions_total','unlocked_sessions']
      and v_def = v_exp_def;
  end if;
  if v_reverted then
    raise notice 'P0E12 回復：已是完整回復狀態（核心為原版、其餘物件皆不存在），無需動作';
    return;
  end if;
  if not v_installed then
    raise exception 'P0E12.ROLLBACK_ABORT: 四個物件不是「完整且與安裝版本一致」的狀態，也不是「完整已回復」，狀態不明或已被修改，不做任何變更（fn_tk_refund_once=% fn_refund_ticket=% trg_tk_quota_guard()=% 觸發器=%／同名觸發器共 % 個）',
      coalesce(v_once_fp, '缺'), coalesce(v_rf_fp2, '缺'), coalesce(v_qg_fp2, '缺'),
      case when v_trg.oid is null then '缺（或不在 member_tickets）' else 'tgenabled=' || v_trg.tgenabled::text || ' def=' || coalesce(v_def, '?') end, v_ntrg;
  end if;
  -- 1) 驗證全過才動手：先觸發器、再兩個新函式（不使用 CASCADE），最後把核心還原成原版
  execute 'drop trigger trg_tk_quota_guard on public.member_tickets';
  execute 'drop function public.trg_tk_quota_guard()';
  execute 'drop function public.fn_refund_ticket(text, text, text)';
  execute $restore$
create or replace function public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text) returns boolean
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_net integer;
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)
    into v_net from ticket_logs where ticket_id = p_ticket and booking_id = p_booking;
  if v_net <= 0 then return false; end if;
  if coalesce(t.sessions_total, 0) > 0 and coalesce(t.sessions_remaining, 0) >= t.sessions_total then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system', '⚠ 已阻擋：餘額已滿，未再退課（效期屆滿自動取消）');
    return false;
  end if;
  update member_tickets
     set sessions_remaining = coalesce(sessions_remaining, 0) + 1,
         status = case when status::text = 'used_up' then 'usable' else status end
   where id = p_ticket;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'refund', 1, p_booking, 'system', coalesce(p_note, '取消返還原票'));
  return true;
end
$$;
  $restore$;
  -- 2) 事後核對
  select md5(prosrc) || ':' || length(prosrc) into v_once_fp from pg_proc where oid = to_regprocedure('public.fn_tk_refund_once(text,text,text)');
  if v_once_fp is distinct from v_orig_fp then raise exception 'P0E12.ROLLBACK_POSTCHECK_FAILED: fn_tk_refund_once 未還原成原版'; end if;
  if to_regprocedure('public.fn_refund_ticket(text,text,text)') is not null or to_regprocedure('public.trg_tk_quota_guard()') is not null
     or exists (select 1 from pg_trigger where tgname = 'trg_tk_quota_guard') then
    raise exception 'P0E12.ROLLBACK_POSTCHECK_FAILED: 新物件仍有殘留';
  end if;
end
$rb$;
commit;
