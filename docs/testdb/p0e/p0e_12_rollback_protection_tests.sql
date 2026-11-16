-- ═══════════════════════════════════════════════════════════════════════
-- P0E-12 回復保護測試（待執行；僅建檔，本輪**沒有執行**；⚠ 只能對測試庫 kucvxpjatptfckhlxptj）
-- 前置：p0e_12 已套用（四個物件都在且是安裝版本）。單一 DO、結尾必定 raise exception 回滾；結果在 P0E12_ROLLBACK_PROTECTION_RESULT: 之後。
-- 做法：把 p0e_12_quota_refund_rollback.sql 的「回復」DO 區塊**逐字（機械抽出）**建成交易內暫時函式 pg_temp.r_rb()；每個案例都放在會回滾的子交易裡
--   （修改物件→呼叫 r_rb→記錄結果→故意 raise exception 讓這個案例的所有修改回滾），所以案例之間互不污染。
-- ⚠ 這份測試會在「交易內」做 CREATE OR REPLACE／DROP FUNCTION、CREATE／DROP／ALTER TRIGGER，全部回滾；屬於可回滾 DDL，需你的授權涵蓋。
-- 案例與預期：P1 正常回復成功（核心還原成原版、新物件消失）、P1b 再跑一次＝完整已回復狀態，不報錯且狀態不變；
--   P2–P8：任何物件被修改、缺失或狀態不明時，回復以 P0E12.ROLLBACK_ABORT 拒絕，且拒絕後四個物件的指紋／觸發器狀態與拒絕前**完全相同**（r_snap 快照比對）。
-- 這是 SQL 層驗證，pg_get_triggerdef 的實際輸出格式尚未實測（見回復檔註解）；若 P1 因格式不符而被誤中止，會看到 ROLLBACK_ABORT，請依實測調整預期字串。
-- ═══════════════════════════════════════════════════════════════════════
do $p$
declare v_a text; v_s1 text; v_s2 text; v_msg text; v_ok boolean;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: 看起來像正式庫'; end if;
  if to_regprocedure('public.fn_refund_ticket(text,text,text)') is null or not exists (select 1 from pg_trigger where tgname = 'trg_tk_quota_guard' and not tgisinternal) then
    raise exception 'P.PRECONDITION: 尚未套用 p0e_12（缺 fn_refund_ticket 或 trg_tk_quota_guard），本測試要求完整安裝狀態'; end if;
  create temp table p_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.p_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as $f$ insert into p_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 250)) $f$;
  create function pg_temp.p_summary() returns text language sql as $f$
    select jsonb_build_object('pass', count(*) filter (where ok is true), 'fail', count(*) filter (where ok is false), 'total', count(*),
      'items', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'name', left(name, 110), 'detail', detail) order by n) from p_res where ok is not true), '[]'::jsonb))::text from p_res $f$;
  -- 四個物件的快照（指紋＋觸發器狀態）；拒絕前後必須相同
  create function pg_temp.r_snap() returns text language sql as $f$
    select concat_ws('|',
      coalesce((select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = to_regprocedure('public.fn_tk_refund_once(text,text,text)')), 'absent'),
      coalesce((select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = to_regprocedure('public.fn_refund_ticket(text,text,text)')), 'absent'),
      coalesce((select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = to_regprocedure('public.trg_tk_quota_guard()')), 'absent'),
      coalesce((select string_agg(t.tgrelid::regclass::text || ':' || t.tgenabled::text || ':' || pg_get_triggerdef(t.oid), ';' order by t.oid) from pg_trigger t where t.tgname = 'trg_tk_quota_guard' and not t.tgisinternal), 'absent')) $f$;
  -- 回復區塊本體（逐字抽自 p0e_12_quota_refund_rollback.sql 的「回復」DO 區塊）
  create function pg_temp.r_rb() returns void language plpgsql as $rbf$
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
$rbf$;

  -- 前置：現況必須是「完整且與安裝版本一致」——用回復區塊自己的核對來判斷（成功後立刻回滾）
  begin
    perform pg_temp.r_rb(); raise exception 'PRE_OK';
  exception when others then
    if sqlerrm <> 'PRE_OK' then raise exception 'P.PRECONDITION: 現況不是完整的 p0e_12 安裝版本（回復區塊核對失敗）：%', left(sqlerrm, 300); end if;
  end;

  -- P1／P1b 正常回復，再跑一次（完整已回復）
  begin
    perform pg_temp.r_rb();
    v_ok := (select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = to_regprocedure('public.fn_tk_refund_once(text,text,text)')) = 'cc6de55f10efb79d804296a7bc387a26:1156'
      and to_regprocedure('public.fn_refund_ticket(text,text,text)') is null and to_regprocedure('public.trg_tk_quota_guard()') is null
      and not exists (select 1 from pg_trigger where tgname = 'trg_tk_quota_guard');
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%¦¦%', v_ok::text, v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P1 完整且與安裝版本一致：正常回復（核心還原成原版指紋、fn_refund_ticket／trg_tk_quota_guard() 函式／觸發器全部移除）', split_part(v_msg, '¦¦', 2) = 'true', left(v_msg, 230));
  perform pg_temp.p_rec('P1b 回復後再跑一次（完整已回復，明確驗證）：不報錯、狀態不變', split_part(v_msg, '¦¦', 3) = 'NO_ERROR' and split_part(v_msg, '¦¦', 4) = 'true', left(v_msg, 230));

  -- P2
  begin
    create or replace function public.fn_refund_ticket(p_ticket_id text, p_booking_id text, p_note text default null) returns jsonb language sql as $q$ select '{}'::jsonb $q$;
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P2 fn_refund_ticket 內容被改（簽名相同）：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P3
  begin
    create or replace function public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text) returns boolean language sql as $q$ select false $q$;
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P3 fn_tk_refund_once 內容被改：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P4
  begin
    create or replace function public.trg_tk_quota_guard() returns trigger language plpgsql as $q$ begin return new; end $q$;
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P4 trg_tk_quota_guard() 函式內容被改：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P5a
  begin
    drop trigger trg_tk_quota_guard on public.member_tickets; create trigger trg_tk_quota_guard before update of sessions_remaining on public.member_tickets for each row execute function public.trg_tk_quota_guard();
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P5a 觸發器 UPDATE OF 欄位清單被改：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P5b
  begin
    alter table public.member_tickets disable trigger trg_tk_quota_guard;
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P5b 觸發器被停用（狀態不明）：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P5c
  begin
    drop trigger trg_tk_quota_guard on public.member_tickets; create trigger trg_tk_quota_guard before update of sessions_remaining, sessions_total, unlocked_sessions on public.member_tickets for each row when (old.sessions_remaining is distinct from new.sessions_remaining) execute function public.trg_tk_quota_guard();
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P5c 觸發器多了 WHEN 條件：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P5d
  begin
    drop trigger trg_tk_quota_guard on public.member_tickets; create trigger trg_tk_quota_guard before update on public.ticket_logs for each row execute function public.trg_tk_quota_guard();
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P5d 同名觸發器掛在別的資料表（ticket_logs）而不是 member_tickets：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P5e
  begin
    drop trigger trg_tk_quota_guard on public.member_tickets; create trigger trg_tk_quota_guard after update of sessions_remaining, sessions_total, unlocked_sessions on public.member_tickets for each row execute function public.trg_tk_quota_guard();
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P5e 觸發器被改成 AFTER：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P6
  begin
    drop function public.fn_refund_ticket(text, text, text);
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P6 缺少 fn_refund_ticket（半套）：回復拒絕、其餘物件原樣、不補不刪', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P7
  begin
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
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P7 混合狀態（核心已是原版，但觸發器與其他函式還在）：回復拒絕、原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  -- P8
  begin
    drop trigger trg_tk_quota_guard on public.member_tickets;
    v_s1 := pg_temp.r_snap();
    begin perform pg_temp.r_rb(); v_a := 'NO_ERROR'; exception when others then v_a := sqlerrm; end;
    v_s2 := pg_temp.r_snap();
    raise exception 'CASE¦¦%¦¦%', v_a, (v_s1 = v_s2)::text;
  exception when others then v_msg := sqlerrm; end;
  perform pg_temp.p_rec('P8 缺少觸發器（函式都在）：回復拒絕、四個物件原樣', split_part(v_msg, '¦¦', 2) like 'P0E12.ROLLBACK_ABORT:%' and split_part(v_msg, '¦¦', 3) = 'true', left(v_msg, 230));

  raise exception 'P0E12_ROLLBACK_PROTECTION_RESULT: %', pg_temp.p_summary();
end
$p$;
