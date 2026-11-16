-- ═══════════════════════════════════════════════════════════════════════
-- 團課票券「已簽到卻未開通」回歸測試（對應 2026-11-15 陳玟勳「團課 4 週優惠」案例；不針對單一會員）
-- ⚠ 只能對測試庫 kucvxpjatptfckhlxptj；需先套用 P0-E（p0e_02）。單一 DO，結尾必定 raise exception → 全部回滾。
-- 用正式庫實際的帳本形狀重現各條預約路徑，驗證「簽到才啟用」由資料庫觸發器負責、與預約從哪條路來無關：
--   ・會員自行報名（fn_member_join_group：operator＝會員 id、備註「會員自行報名團體課扣 1 堂（會員指定此票券）」，不寫任何效期欄位）
--   ・櫃檯代預約（operator＝員工 id、備註「預約扣課」）
--   ・團課座位簽到（attendance 逐座位）／撤銷簽到
-- 根因（正式庫）：效期啟用原本寫在前端（activateTicketIfNeeded）與前端算好再傳入 RPC 的 p_start_date／p_expire_date／p_activated_at；
--   fn_member_join_group 沒有任何寫效期的程式碼，member_tickets 又只有櫃檯以上有寫入權（mt_all_staff），會員端也補不了。
-- ═══════════════════════════════════════════════════════════════════════
do $pe$
declare v_d date := (now() at time zone 'Asia/Taipei')::date;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫，停止執行';
  end if;
  if to_regprocedure('public.fn_tk_activate(text,date,text)') is null then raise exception 'P0E.PRECONDITION: 尚未套用 P0-E migration'; end if;

  create temp table pe_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.pe_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as
    $f$ insert into pe_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 200)) $f$;
  create function pg_temp.pe_summary() returns text language sql as $f$
    select jsonb_build_object('pass', count(*) filter (where ok is true), 'fail', count(*) filter (where ok is false), 'total', count(*),
             'fails', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'name', left(name, 90), 'detail', detail) order by n) from pe_res where ok is not true), '[]'::jsonb))::text
      from pe_res $f$;
  create temp table pe_alerts(n serial primary key, member text, typ text, title text, body text) on commit drop;
  create or replace function public.desk_alert(p_member_id text, p_type text, p_title text, p_body text) returns void language sql as
    $f$ insert into pe_alerts(member, typ, title, body) values (p_member_id, p_type, p_title, p_body) $f$;
  create function pg_temp.pe_today() returns date language sql as $f$ select (now() at time zone 'Asia/Taipei')::date $f$;

  insert into ticket_types(id, name, category) values ('PE-T-GRP', 'PE 團課', '小班肌力');
  -- 「團課 4 週優惠」：4 堂、效期 28 天、尚未啟用
  create function pg_temp.pe_tk(p_id text, p_member text) returns void language plpgsql as $f$
  begin
    insert into members(id, name) values (p_member, 'PE測試會員') on conflict (id) do nothing;
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status, valid_days, unlocked_sessions)
    values (p_id, p_member, 'PE-T-GRP', '團課 4週優惠', 4, 4, 'usable', 28, 4);
  end $f$;
  create function pg_temp.pe_grp(p_id text, p_off integer, p_mems jsonb, p_seat jsonb) returns void language sql as $f$
    insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, member_ids, attendance, seat_tickets)
    values (p_id, null, '小班肌力', 'PE-T-GRP', pg_temp.pe_today() + p_off, '19:00', 60, 'booked', false, p_mems, '{}'::jsonb, p_seat) $f$;
  create function pg_temp.pe_dd(p_tk text, p_bk text, p_op text, p_note text) returns void language sql as $f$
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values ('PE-LG-' || md5(random()::text || clock_timestamp()::text), p_tk, 'deduct', -1, p_bk, p_op, p_note) $f$;
  create function pg_temp.pe_att(p_bk text, p_att jsonb) returns void language sql as
    $f$ update bookings set attendance = p_att where id = p_bk $f$;
  create function pg_temp.pe_open(p_tk text) returns boolean language sql as
    $f$ select activated_at is not null or start_date is not null or expire_date is not null from member_tickets where id = p_tk $f$;

  -- ═══ 會員自行報名（正式庫案例的形狀：同一張票三堂、operator＝會員）═══
  perform pg_temp.pe_tk('PE-J-A', 'PE-M-JA');
  perform pg_temp.pe_grp('PE-G1', 2,  '["PE-M-JA"]'::jsonb, '{"PE-M-JA":"PE-J-A"}'::jsonb);
  perform pg_temp.pe_grp('PE-G2', 9,  '["PE-M-JA"]'::jsonb, '{"PE-M-JA":"PE-J-A"}'::jsonb);
  perform pg_temp.pe_grp('PE-G3', 16, '["PE-M-JA"]'::jsonb, '{"PE-M-JA":"PE-J-A"}'::jsonb);
  perform pg_temp.pe_dd('PE-J-A', 'PE-G1', 'PE-M-JA', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  perform pg_temp.pe_dd('PE-J-A', 'PE-G2', 'PE-M-JA', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  perform pg_temp.pe_dd('PE-J-A', 'PE-G3', 'PE-M-JA', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  perform pg_temp.pe_rec('J1 會員自行報名三堂後：票券仍未啟用、堂數不變（預約不啟用）',
    not pg_temp.pe_open('PE-J-A') and (select sessions_remaining = 4 from member_tickets where id = 'PE-J-A'), '');
  perform pg_temp.pe_att('PE-G1', '{"PE-M-JA":"checked_in"}');
  perform pg_temp.pe_rec('J2 團課座位簽到（會員自行報名的票）→ 啟用：起算＝上課日、到期＝+27、模式 checkin',
    (select start_date = v_d + 2 and expire_date = v_d + 2 + 27 and activated_at is not null and activation_mode = 'checkin' from member_tickets where id = 'PE-J-A'),
    (select coalesce(start_date::text, 'null') || '/' || coalesce(expire_date::text, 'null') from member_tickets where id = 'PE-J-A'));
  perform pg_temp.pe_rec('J2 痕跡帳 1 筆（adjust／delta 0／帶預約 id）、堂數不變',
    (select count(*) from ticket_logs where ticket_id = 'PE-J-A' and action::text = 'adjust' and delta = 0 and booking_id = 'PE-G1' and note like '首次簽到開通%') = 1
    and (select sessions_remaining = 4 from member_tickets where id = 'PE-J-A'), '');
  perform pg_temp.pe_att('PE-G2', '{"PE-M-JA":"checked_in"}');
  perform pg_temp.pe_rec('J3 第二堂簽到：日期不變、不重複寫開通痕跡',
    (select start_date = v_d + 2 from member_tickets where id = 'PE-J-A')
    and (select count(*) from ticket_logs where ticket_id = 'PE-J-A' and note like '首次簽到開通%') = 1, '');
  perform pg_temp.pe_att('PE-G1', '{"PE-M-JA":"booked"}');
  perform pg_temp.pe_rec('J4 撤銷第一堂簽到：依剩餘最早簽到重算（第二堂 d+9）',
    (select start_date = v_d + 9 and expire_date = v_d + 9 + 27 and activation_mode = 'checkin' from member_tickets where id = 'PE-J-A'),
    (select coalesce(start_date::text, 'null') from member_tickets where id = 'PE-J-A'));
  perform pg_temp.pe_att('PE-G2', '{"PE-M-JA":"booked"}');
  perform pg_temp.pe_rec('J5 撤銷最後一筆簽到：恢復未啟用（三欄與模式皆空）、堂數不變',
    not pg_temp.pe_open('PE-J-A') and (select activation_mode is null and sessions_remaining = 4 from member_tickets where id = 'PE-J-A'), '');
  perform pg_temp.pe_att('PE-G1', '{"PE-M-JA":"checked_in"}');
  perform pg_temp.pe_rec('J6 撤銷後再簽到：可再次啟用', (select start_date = v_d + 2 and activation_mode = 'checkin' from member_tickets where id = 'PE-J-A'), '');

  -- ═══ 櫃檯代預約（operator＝員工）＋同堂別人簽到不影響我 ═══
  perform pg_temp.pe_tk('PE-J-B', 'PE-M-JB'); perform pg_temp.pe_tk('PE-J-C', 'PE-M-JC');
  perform pg_temp.pe_grp('PE-G4', 3, '["PE-M-JB","PE-M-JC"]'::jsonb, '{"PE-M-JB":"PE-J-B","PE-M-JC":"PE-J-C"}'::jsonb);
  perform pg_temp.pe_dd('PE-J-B', 'PE-G4', 'c-mqelf4lbrndf', '預約扣課');
  perform pg_temp.pe_dd('PE-J-C', 'PE-G4', 'PE-M-JC', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  perform pg_temp.pe_att('PE-G4', '{"PE-M-JB":"checked_in","PE-M-JC":"booked"}');
  perform pg_temp.pe_rec('J7 櫃檯代預約的票：簽到啟用', (select start_date = v_d + 3 and activation_mode = 'checkin' from member_tickets where id = 'PE-J-B'), '');
  perform pg_temp.pe_rec('J7 同一堂另一位未簽到的會員：票券不被啟用', not pg_temp.pe_open('PE-J-C'), '');
  update bookings set status = 'checked_in', checked_in_at = now() where id = 'PE-G4';
  perform pg_temp.pe_rec('J8 整堂狀態被改成 checked_in、但該會員名額沒點到：票券不被啟用', not pg_temp.pe_open('PE-J-C'), '');

  -- ═══ 同會員同堂兩個名額各用一張票：不猜，只警示 ═══
  perform pg_temp.pe_tk('PE-J-D1', 'PE-M-JD'); perform pg_temp.pe_tk('PE-J-D2', 'PE-M-JD');
  perform pg_temp.pe_grp('PE-G5', 4, '["PE-M-JD","PE-M-JD"]'::jsonb, '{"PE-M-JD":"PE-J-D1","PE-M-JD#2":"PE-J-D2"}'::jsonb);
  perform pg_temp.pe_dd('PE-J-D1', 'PE-G5', 'PE-M-JD', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  perform pg_temp.pe_dd('PE-J-D2', 'PE-G5', 'PE-M-JD', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  perform pg_temp.pe_att('PE-G5', '{"PE-M-JD":"checked_in","PE-M-JD#2":"checked_in"}');
  perform pg_temp.pe_rec('J9 同會員同堂兩張票：不猜、兩張都不啟用，並發出櫃檯警示（待人工確認）',
    not pg_temp.pe_open('PE-J-D1') and not pg_temp.pe_open('PE-J-D2') and (select count(*) from pe_alerts where typ = 'tk_expiry_manual') >= 1,
    (select count(*)::text from pe_alerts));

  -- ═══ 已知限制：歷史上「已簽到但未開通」的票（P0-E 套用前產生）不會自動回溯 ═══
  perform pg_temp.pe_tk('PE-J-E', 'PE-M-JE');
  perform pg_temp.pe_grp('PE-G6', -9, '["PE-M-JE"]'::jsonb, '{"PE-M-JE":"PE-J-E"}'::jsonb);
  perform pg_temp.pe_grp('PE-G7', 5,  '["PE-M-JE"]'::jsonb, '{"PE-M-JE":"PE-J-E"}'::jsonb);
  perform pg_temp.pe_dd('PE-J-E', 'PE-G6', 'PE-M-JE', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  perform pg_temp.pe_dd('PE-J-E', 'PE-G7', 'PE-M-JE', '會員自行報名團體課扣 1 堂（會員指定此票券）');
  alter table public.bookings disable trigger trg_tk_checkin_activate;          -- 模擬 P0-E 之前的歷史：簽到過、票沒開
  perform pg_temp.pe_att('PE-G6', '{"PE-M-JE":"checked_in"}');
  alter table public.bookings enable trigger trg_tk_checkin_activate;
  perform pg_temp.pe_rec('J10 歷史形狀成立：已簽到一堂、票券仍未啟用', not pg_temp.pe_open('PE-J-E'), '');
  perform pg_temp.pe_att('PE-G7', '{"PE-M-JE":"checked_in"}');
  perform pg_temp.pe_rec('J10 【已知限制】下一次簽到才啟用，且以該次上課日起算（d+5），不會回溯到最早一堂（d-9）——需一次性補正，見待查紀錄',
    (select start_date = v_d + 5 and activation_mode = 'checkin' from member_tickets where id = 'PE-J-E'),
    (select coalesce(start_date::text, 'null') from member_tickets where id = 'PE-J-E'));

  raise exception 'P0E_JOIN_RESULT: %', pg_temp.pe_summary();
end
$pe$;
