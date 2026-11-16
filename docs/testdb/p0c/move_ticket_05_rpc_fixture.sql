-- ═══════════════════════════════════════════════════════════════════════
-- 真實 RPC 測試的隔離夾具（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj）。需授權才能執行（寫入）。
-- 全部資料 id 以 'MVR-' 開頭、會員姓名以 'MVR測試' 開頭，不使用任何既有會員／員工／票券。
-- 另需把 <RUNID> 換成本次執行的唯一代號（8 碼小寫英數，例如 a3f9k2x7；同一個值也要填進清理檔）——會員姓名會帶它，清理 notifications 時用它精準限定。
-- 執行前把下列四個尖括號佔位換成「Auth Admin API 剛建立的測試帳號 uuid」（見 02 文件）；沒換會因 uuid 轉型失敗而中止（fail-closed）：
--   <UUID_DESK>  <UUID_MGR>  <UUID_COACH>  <UUID_COACH2>  <UUID_MEMBER>
-- 本檔新增的資料（清單；清理檔 06 逐項對應）：
--   ticket_types  : MVR-T-PT, MVR-T-FR, MVR-T-VIP
--   employees     : MVR-E-DESK(front_desk), MVR-E-MGR(coach, is_manager), MVR-E-COACH(coach), MVR-E-COACH2(coach)
--   members       : MVR-M-AUTH（綁 <UUID_MEMBER>，測會員身分）、MVR-M-r01 … MVR-M-r11（每案例一位，無 auth）；姓名皆為 'MVR測試會員-<RUNID>-…'
--   member_tickets: MVR-TK-r01 … r11
--   bookings      : MVR-F-r01…r11（原預約）、MVR-T-r01…r11（新預約）
--   ticket_logs   : 每案例一筆 deduct（id 前綴 MVR-LG-）；RPC 之後會再寫的帳本 id 是 LG-…，但 ticket_id 皆為 MVR-TK-*，由清理檔依 ticket_id／booking_id 清除
--   notifications : 測試期間由取消流程的 desk_alert 產生（recipient 'desk'、title 以 'MVR測試會員-<RUNID>-' 開頭）→ 清理檔以「RUNID＋時間＋recipient 型別＋已人工核對的 id 清單」四重條件精準清除
--   auth.users    : 另由 Auth Admin API 建立／刪除（不在本檔，見 02 文件）
-- ═══════════════════════════════════════════════════════════════════════
begin;
-- ── 庫識別守門（fail-closed）：不是測試庫就中止，不靠註解或表名 ──
-- 依據：2026-11-14 唯讀取得測試庫（kucvxpjatptfckhlxptj，專案名 yugym-sprint3-test）叢集 system_identifier = 7662742571317219726，
--       且測試庫沒有 public.change_log 表與 fn_table_sigs（正式庫有）。任何一項不符、或 pg_control_system() 取不到 → 一律中止。
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫（有 change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;

insert into ticket_types(id, name, category, time_restricted) values
  ('MVR-T-PT','MVR 一般教練課','私人教練',false),
  ('MVR-T-FR','MVR 友善教練課','私人教練',false),
  ('MVR-T-VIP','MVR VIP教練課','私人教練',false);

insert into employees(id, name, role, status, is_manager, auth_id) values
  ('MVR-E-DESK',  'MVR測試櫃檯',  'front_desk', 'active', false, '<UUID_DESK>'::uuid),
  ('MVR-E-MGR',   'MVR測試店長',  'coach',      'active', true,  '<UUID_MGR>'::uuid),
  ('MVR-E-COACH', 'MVR測試教練',  'coach',      'active', false, '<UUID_COACH>'::uuid),
  ('MVR-E-COACH2','MVR測試教練二','coach',      'active', false, '<UUID_COACH2>'::uuid);

insert into members(id, name, auth_id) values ('MVR-M-AUTH', 'MVR測試會員-<RUNID>-AUTH', '<UUID_MEMBER>'::uuid);

do $fx$
declare k text; v_coach text; v_today date := (now() at time zone 'Asia/Taipei')::date; v_end date := public.fn_hold_month_limit_end((now() at time zone 'Asia/Taipei')::date); v_to date; v_from date; v_rem integer;
begin
  foreach k in array array['r01','r02','r03','r04','r05','r06','r07','r08','r09','r10','r11'] loop
    -- r05 為「教練自己的課」、r06 為「別人的課」，其餘無指定教練
    v_coach := case k when 'r05' then 'MVR-E-COACH' when 'r06' then 'MVR-E-COACH2' else null end;
    -- r08（hold 超過可保留日期）：日期設在可保留日之後、且該票剩 0 堂；其餘案例用近期日期
    v_to := case when k = 'r08' then v_end + 19 else v_today + 9 end;
    v_from := case when k = 'r08' then v_end + 20 else v_today + 10 end;
    v_rem := case when k = 'r08' then 0 else 2 end;
    insert into members(id, name) values ('MVR-M-'||k, 'MVR測試會員-<RUNID>-'||k);
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status)
      values ('MVR-TK-'||k, 'MVR-M-'||k, 'MVR-T-PT', 'MVR方案', 4, v_rem, 'usable');
    insert into bookings(id, member_id, coach_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id)
      values ('MVR-F-'||k, 'MVR-M-'||k, v_coach, '私人教練', 'MVR-T-PT', v_from, '11:00', 60, 'booked', false, 'MVR-TK-'||k);
    insert into bookings(id, member_id, coach_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id)
      values ('MVR-T-'||k, 'MVR-M-'||k, v_coach, '私人教練', 'MVR-T-PT', v_to, '10:00', 60, 'booked', true, null);
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values ('MVR-LG-'||k, 'MVR-TK-'||k, 'deduct', -1, 'MVR-F-'||k, 'mvrtest', 'mvr fixture');
  end loop;
end
$fx$;

-- 建立後自我核對：每類資料筆數必須與上方清單一致，否則整個交易回滾
do $chk$
begin
  if (select count(*) from members where id like 'MVR-M-%') <> 12
     or (select count(*) from member_tickets where id like 'MVR-TK-%') <> 11
     or (select count(*) from bookings where id like 'MVR-%') <> 22
     or (select count(*) from employees where id like 'MVR-E-%') <> 4
     or (select count(*) from ticket_types where id like 'MVR-T-%') <> 3
     or (select count(*) from ticket_logs where id like 'MVR-LG-%') <> 11 then
    raise exception 'MVR.FIXTURE_COUNT_MISMATCH';
  end if;
end
$chk$;
commit;
