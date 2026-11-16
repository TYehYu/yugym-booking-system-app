-- ═══════════════════════════════════════════════════════════════════════
-- 正式庫 2/4 階段｜P0-E 簽到才啟用｜套用（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc）
-- ⚠ 需使用者「逐階段」明確授權後才可執行；前一階段必須已部署且驗證通過；整檔單一交易，任何一項檢查失敗整段回滾。
-- ⚠ 若失敗原因是「套用期間有人正在改票券（雜湊不符）」：整段已回滾、沒有影響，請在低流量時段重跑。
-- 守門：叢集識別 7637215626725903220＋有 change_log／fn_table_sigs；測試庫識別會在守門直接中止。
-- ═══════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
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
do $pre02$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and ((proname like 'fn_tk_%' and proname <> 'fn_tk_shared_has') or proname like 'trg_tk_%' or proname = 'fn_bk_attended')) then
    raise exception 'P0E.ABORT: 正式庫已有 fn_tk_／trg_tk_ 物件，不重複建立'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'member_tickets' and column_name = 'activation_mode') then
    raise exception 'P0E.ABORT: activation_mode 欄位已存在'; end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_tk_window_ledger','trg_tk_window_booking_ins','trg_tk_window_booking_upd','trg_tk_checkin_activate')) then
    raise exception 'P0E.ABORT: P0-E 觸發器已存在'; end if;
  if to_regprocedure('public.desk_alert(text,text,text,text)') is null or to_regprocedure('public.gen_short_id(text)') is null
     or to_regprocedure('public.fn_tk_shared_has(jsonb,text)') is null or to_regprocedure('public.is_staff_desk()') is null then
    raise exception 'P0E.ABORT: 缺少依賴函式（desk_alert／gen_short_id／fn_tk_shared_has／is_staff_desk）'; end if;
  if not exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname = 'notify_recipient' and e.enumlabel = 'desk') then
    raise exception 'P0E.ABORT: notify_recipient 沒有 desk（desk_alert 會寫不進通知）'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'bookings'
        and column_name in ('cancelled_by','cancel_reason','checked_in_at','partner_id','coach_leave','sibling_of','attendance','member_ids','pending_contract','ticket_id')) <> 10 then
    raise exception 'P0E.ABORT: bookings 缺欄位'; end if;
end
$pre02$;

create temp table pe_pre on commit drop as
select count(*) as n,
       md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) as h
  from member_tickets;

-- ═══════════════════════════════════════════════════════════════════════
-- P0-E：票券效期「首次實際簽到才啟用」（2026-11-16 準備，尚未執行）
--
-- 規則（業務已確認）：
--   1 首次實際簽到才啟用票券；2 起算日＝實際上課日；3 預約扣堂不啟用效期；
--   4 未啟用票券：有效預約日期的跨度不得超過 valid_days 天（預約窗口，資料庫端驗證）；
--   5 首次簽到後，超過新到期日的預約自動取消並退堂（安全網：正常情況下窗口已擋住，主要處理歷史／競態殘留）；
--   6 撤銷最後一筆有效簽到 → 恢復未啟用；7 仍有其他簽到 → 依最早簽到課程日重算；8 歷史資料不批次修改。
--
-- 只套用於「新制未開通票」：valid_days > 0 且 activated_at／start_date／expire_date 三者皆空。
--   → 舊制已開通票（activation_mode 為空）、固定日期票（有日期但無 activated_at）、無 valid_days 的票，一律不受影響。
--
-- 本檔不修改任何既有資料列（沒有 UPDATE／DELETE 既有票券或預約）；只新增：
--   1 欄位 member_tickets.activation_mode（可為空、無預設值）
--   2 函式 fn_tk_*、trg_tk_*（全部 SECURITY DEFINER，不授權給 anon／authenticated／service_role）
--   3 觸發器 4 個：trg_tk_window_ledger（ticket_logs）、trg_tk_window_booking_ins／_upd、trg_tk_checkin_activate（bookings）
--
-- 設計重點：
--   • 單一寫入點：效期欄位只在 bookings 的 AFTER UPDATE 觸發器（簽到／撤銷）內被寫入，涵蓋 RPC 簽到、前端備援、名冊切換、補簽、舊分頁。
--   • 鎖定順序：預約列（呼叫端已鎖）→ 票券列；與 fn_cancel_booking／fn_move_booking_ticket 一致。
--   • 超期取消：逐筆在子交易（BEGIN…EXCEPTION）內「鎖預約 NOWAIT → 退堂 → 取消 → 影子卡」一起成功或一起回滾；
--     鎖不到／失敗只寫櫃檯警示，不讓簽到失敗；可重跑（冪等）。
--   • 絕不自動取消：團課、1V2（有 partner_id）、有影子卡關係、已簽到、非 booked 狀態的預約 → 只寫櫃檯警示，由人工處理。
--   • 痕跡帳一律 adjust／delta 0，並帶 booking_id（與 P0-C fn_move_booking_ticket 的帳本驗證相容：delta≠0 的 adjust 才視為異常）。
--   • coach_leave（教練請假補償簽到）不算實際上課，不啟用。
--
-- 已知假設（需於測試庫驗證）：團課座位 key 為 '會員id' 或 '會員id#序號'（前端 seatNo 的格式）。
-- 與 P0-C 的銜接（P0-C 檔案另行修改，本檔不碰）：fn_move_booking_ticket ① 例外放行清單加入 'TKWIN.%'；
--   ② 在第一個 UPDATE 之前 perform set_config('app.tkwin_skip_booking','on',true)；③ 確認 refund 帳在 deduct 帳之前寫入（目前已是）。
-- 回復：見 docs/testdb/p0e/p0e_03_rollback.sql（drop 需授權）。
-- ═══════════════════════════════════════════════════════════════════════

-- 1) 欄位（只新增、可為空、不回填；舊資料保持 null）
alter table public.member_tickets add column if not exists activation_mode text;
comment on column public.member_tickets.activation_mode is 'P0E-20261116: checkin＝由首次簽到啟用；null＝舊制（預約時啟用）、固定日期或未啟用';

-- 2) 小工具
create or replace function public.fn_tk_today() returns date
language sql stable set search_path to 'public','pg_temp'
as $$ select (now() at time zone 'Asia/Taipei')::date $$;

create or replace function public.fn_tk_is_unopened(t public.member_tickets) returns boolean
language sql immutable set search_path to 'public','pg_temp'
as $$ select coalesce(t.valid_days, 0) > 0 and t.activated_at is null and t.start_date is null and t.expire_date is null $$;

create or replace function public.fn_tk_seat_member(p_key text) returns text
language sql immutable set search_path to 'public','pg_temp'
as $$ select split_part(coalesce(p_key, ''), '#', 1) $$;

-- 「實際上課」：已簽到／已完成、有簽到時間、且不是教練請假補償堂（coach_leave 欄位以 jsonb 取值，欄位不存在也不報錯）
create or replace function public.fn_bk_attended(b public.bookings) returns boolean
language sql immutable set search_path to 'public','pg_temp'
as $$ select b.status::text in ('checked_in','completed') and b.checked_in_at is not null
              and coalesce(to_jsonb(b)->>'coach_leave', 'false') <> 'true' $$;

-- 3) 有效預約：未取消，且（bookings.ticket_id 指到這張票，或帳本對這筆預約的淨扣課 > 0）
create or replace function public.fn_tk_holding(p_ticket text, p_exclude text default null)
returns table(booking_id text, bdate date, bstatus text)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select b.id, b.date, b.status::text
    from bookings b
   where b.status::text is distinct from 'cancelled'
     and b.id is distinct from p_exclude
     and ( b.ticket_id = p_ticket
           or b.id in ( select l.booking_id from ticket_logs l
                         where l.ticket_id = p_ticket and l.booking_id is not null
                         group by l.booking_id
                        having coalesce(sum(case when l.action::text = 'deduct' then 1
                                                 when l.action::text = 'refund' then -1 else 0 end), 0) > 0 ) )
$$;

-- 4) 預約窗口（僅新制未開通票）：有效預約日期的跨度 ≤ valid_days - 1；先鎖票列序列化併發預約
create or replace function public.fn_tk_window_check(p_ticket text) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_min date; v_max date;
begin
  if p_ticket is null then return; end if;
  select * into t from member_tickets where id = p_ticket;
  if not found or not public.fn_tk_is_unopened(t) then return; end if;
  select * into t from member_tickets where id = p_ticket for update;      -- 之後的查詢是新快照，看得到對方已提交的預約
  if not found or not public.fn_tk_is_unopened(t) then return; end if;
  select min(h.bdate), max(h.bdate) into v_min, v_max from public.fn_tk_holding(p_ticket, null) h;
  if v_min is null then return; end if;
  if (v_max - v_min) > (t.valid_days - 1) then
    raise exception 'TKWIN.OUT_OF_WINDOW:%:%', to_char(v_min, 'YYYY-MM-DD'), to_char(v_min + (t.valid_days - 1), 'YYYY-MM-DD')
      using errcode = 'P0001',
            hint = '尚未啟用的票券，預約日期需落在最早一堂起 ' || t.valid_days || ' 天內（至 ' || to_char(v_min + (t.valid_days - 1), 'YYYY/MM/DD') || '）；首次簽到後才正式起算效期';
  end if;
end
$$;

-- 5) 退堂（單筆預約只退一次；規則同正式庫 benefit_refund：淨額 ≤ 0 不退，另加「不超過總堂數」護欄）
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

-- 6) 超期取消（可重跑）：逐筆子交易；只取消「單人、單一會員、綁這張票、booked」的預約，其餘只警示
create or replace function public.fn_tk_cancel_overdue(p_ticket text, p_expire date, p_except text default null) returns integer
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare h record; b bookings%rowtype; v_n integer := 0; v_why text;
begin
  for h in select * from public.fn_tk_holding(p_ticket, p_except) order by bdate, booking_id loop
    continue when h.bdate <= p_expire;
    begin
      select * into b from bookings where id = h.booking_id for update nowait;
      if not found or b.status::text is distinct from 'booked' or b.date <= p_expire then continue; end if;
      if b.ticket_id is distinct from p_ticket
         or b.category::text = '小班肌力'
         or coalesce(jsonb_array_length(case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids else '[]'::jsonb end), 0) > 0
         or coalesce(to_jsonb(b)->>'partner_id', '') <> ''
         or b.sibling_of is not null then
        perform public.desk_alert(b.member_id, 'tk_expiry_manual', '　有預約超出票券效期，需人工處理',
          to_char(b.date, 'MM/DD') || ' ' || coalesce(b.start_time, '') || '　票券效期至 ' || to_char(p_expire, 'YYYY/MM/DD') || '（團課／1V2／影子卡不自動取消）');
        continue;
      end if;
      v_why := '效期屆滿自動取消（首次簽到後票券效期至 ' || to_char(p_expire, 'YYYY-MM-DD') || '）';
      perform public.fn_tk_refund_once(p_ticket, b.id, '取消退課：' || v_why);
      update bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', cancel_reason = v_why, refund_waived = false
       where id = b.id and status::text = 'booked';
      update bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', cancel_reason = v_why
       where sibling_of = b.id and status::text is distinct from 'cancelled';
      perform public.desk_alert(b.member_id, 'tk_expiry_cancel', '　預約因票券效期屆滿被自動取消，已退回 1 堂',
        to_char(b.date, 'MM/DD') || ' ' || coalesce(b.start_time, '') || '　票券效期至 ' || to_char(p_expire, 'YYYY/MM/DD'));
      v_n := v_n + 1;
    exception
      when lock_not_available then
        perform public.desk_alert(b.member_id, 'tk_expiry_manual', '　有預約超出票券效期，暫時鎖定未能自動取消',
          to_char(h.bdate, 'MM/DD') || '　稍後會再處理，或請人工取消');
      when others then
        perform public.desk_alert(b.member_id, 'tk_expiry_manual', '　有預約超出票券效期，自動取消失敗，請人工處理',
          to_char(h.bdate, 'MM/DD') || '　' || left(sqlerrm, 80));
    end;
  end loop;
  return v_n;
end
$$;

-- 7) 啟用（條件式更新，只會成功一次；痕跡帳 delta 0）
create or replace function public.fn_tk_activate(p_ticket text, p_date date, p_booking text) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_exp date; v_n integer;
begin
  if p_ticket is null or p_date is null then return; end if;
  select * into t from member_tickets where id = p_ticket for update;
  if not found or not public.fn_tk_is_unopened(t) then return; end if;
  v_exp := p_date + (t.valid_days - 1);                                  -- 含起算當天（同前端 termExpire）
  update member_tickets
     set start_date = p_date, expire_date = v_exp, activated_at = now(), activation_mode = 'checkin'
   where id = p_ticket and activated_at is null and start_date is null and expire_date is null and coalesce(valid_days, 0) > 0;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system',
          '首次簽到開通：起算 ' || to_char(p_date, 'YYYY-MM-DD') || '，效期至 ' || to_char(v_exp, 'YYYY-MM-DD'));
  if v_exp < public.fn_tk_today() then
    -- 補簽很久以前的課：到期日已過，不自動取消任何預約，交給櫃檯判斷
    perform public.desk_alert(t.member_id, 'tk_expiry_manual', '　票券因補簽過去的課而開通，效期已屆滿',
      '起算 ' || to_char(p_date, 'YYYY/MM/DD') || '，效期至 ' || to_char(v_exp, 'YYYY/MM/DD') || '；未自動取消任何預約，請人工確認');
  else
    perform public.fn_tk_cancel_overdue(p_ticket, v_exp, p_booking);
  end if;
end
$$;

-- 8) 這張票目前有哪些「實際上課」的日期（單人：bookings.ticket_id；團課：帳本持有且座位已簽到、座位會員是票主或共享者）
create or replace function public.fn_tk_attended_dates(p_ticket text) returns setof date
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select b.date from bookings b where b.ticket_id = p_ticket and public.fn_bk_attended(b)
  union all
  select b.date
    from bookings b join member_tickets mt on mt.id = p_ticket
   where b.category::text = '小班肌力' and b.status::text is distinct from 'cancelled'
     and b.id in ( select l.booking_id from ticket_logs l
                    where l.ticket_id = p_ticket and l.booking_id is not null
                    group by l.booking_id
                   having coalesce(sum(case when l.action::text = 'deduct' then 1 when l.action::text = 'refund' then -1 else 0 end), 0) > 0 )
     and ( exists ( select 1 from jsonb_each_text(case when jsonb_typeof(b.attendance) = 'object' then b.attendance else '{}'::jsonb end) a(k, v)
                     where a.v = 'checked_in'
                       and ( public.fn_tk_seat_member(a.k) = mt.member_id
                             or public.fn_tk_shared_has(to_jsonb(mt.shared_with), public.fn_tk_seat_member(a.k)) ) )
           or ( coalesce(jsonb_array_length(case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids else '[]'::jsonb end), 0) = 0
                and public.fn_bk_attended(b)
                and ( b.member_id = mt.member_id or public.fn_tk_shared_has(to_jsonb(mt.shared_with), b.member_id) ) ) )
$$;

-- 9) 撤銷簽到後重算（只處理 activation_mode='checkin' 的票；舊制票完全不動）
create or replace function public.fn_tk_recalc(p_ticket text, p_booking text) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_first date; v_exp date;
begin
  if p_ticket is null then return; end if;
  select * into t from member_tickets where id = p_ticket for update;
  if not found or t.activation_mode is distinct from 'checkin' then return; end if;
  select min(d) into v_first from public.fn_tk_attended_dates(p_ticket) d;
  if v_first is null then
    update member_tickets set start_date = null, expire_date = null, activated_at = null, activation_mode = null
     where id = p_ticket and activation_mode = 'checkin';
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system', '撤銷簽到：已無有效簽到，效期恢復未啟用');
  else
    v_exp := v_first + (t.valid_days - 1);
    if t.start_date is distinct from v_first or t.expire_date is distinct from v_exp then
      update member_tickets set start_date = v_first, expire_date = v_exp
       where id = p_ticket and activation_mode = 'checkin';
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system',
              '撤銷簽到：效期依最早簽到課程日重算，起算 ' || to_char(v_first, 'YYYY-MM-DD') || '，效期至 ' || to_char(v_exp, 'YYYY-MM-DD'));
    end if;
  end if;
end
$$;

-- 10) 團課座位簽到／撤銷：只在「這堂的帳本上，該會員（或共享者）剛好只有一張持有中的票」時才處理；0 張或多張一律不猜
create or replace function public.fn_tk_group_seat(p_booking text, p_date date, p_member text, p_in boolean) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_tks text[]; v_tk text;
begin
  select array_agg(x.ticket_id) into v_tks
    from ( select l.ticket_id
             from ticket_logs l join member_tickets mt on mt.id = l.ticket_id
            where l.booking_id = p_booking
              and ( mt.member_id = p_member or public.fn_tk_shared_has(to_jsonb(mt.shared_with), p_member) )
            group by l.ticket_id
           having coalesce(sum(case when l.action::text = 'deduct' then 1 when l.action::text = 'refund' then -1 else 0 end), 0) > 0 ) x;
  if v_tks is null or array_length(v_tks, 1) is null then return; end if;
  if array_length(v_tks, 1) > 1 then
    perform public.desk_alert(p_member, 'tk_expiry_manual', '　團課簽到對應到多張票，未自動處理效期',
      to_char(p_date, 'MM/DD') || '　請人工確認票券效期');
    return;
  end if;
  v_tk := v_tks[1];
  if p_in then perform public.fn_tk_activate(v_tk, p_date, p_booking);
  else perform public.fn_tk_recalc(v_tk, p_booking);
  end if;
end
$$;

-- 11) 觸發器函式
create or replace function public.trg_tk_window_ledger() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp'
as $$ begin perform public.fn_tk_window_check(new.ticket_id); return null; end $$;

-- 例外：P0-C 調課 RPC 會在同一交易內先改兩筆預約的 ticket_id、再寫帳；中間狀態會暫時同時算到新舊兩筆。
--   RPC 先 set_config('app.tkwin_skip_booking','on',true) 跳過這個預約端檢查，最後由 ticket_logs 的 deduct 觸發器
--   （此時 refund 已先寫、帳與預約都是最終狀態）做唯一一次檢查。只有資料庫內部函式能設這個值（API 角色不能執行任意 SQL）。
create or replace function public.trg_tk_window_booking() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  if coalesce(current_setting('app.tkwin_skip_booking', true), '') = 'on' then return null; end if;
  perform public.fn_tk_window_check(new.ticket_id);
  return null;
end $$;

create or replace function public.trg_tk_checkin_activate() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_old boolean; v_new boolean; r record; v_mem text;
begin
  if coalesce(new.category::text, '') <> '小班肌力' then
    v_old := public.fn_bk_attended(old);
    v_new := public.fn_bk_attended(new);
    if new.ticket_id is not null then
      if v_new and not v_old then perform public.fn_tk_activate(new.ticket_id, new.date, new.id);
      elsif v_old and not v_new then perform public.fn_tk_recalc(new.ticket_id, new.id);
      end if;
    end if;
    return null;
  end if;
  -- 團課：attendance 逐座位（key＝會員id 或 會員id#序號）
  for r in
    select k.key as seat_key,
           (coalesce(case when jsonb_typeof(new.attendance) = 'object' then new.attendance->>k.key end, '') = 'checked_in') as now_in,
           (coalesce(case when jsonb_typeof(old.attendance) = 'object' then old.attendance->>k.key end, '') = 'checked_in') as was_in
      from ( select jsonb_object_keys(coalesce(case when jsonb_typeof(new.attendance) = 'object' then new.attendance end, '{}'::jsonb)
                                      || coalesce(case when jsonb_typeof(old.attendance) = 'object' then old.attendance end, '{}'::jsonb)) as key ) k
  loop
    continue when r.now_in = r.was_in;
    perform public.fn_tk_group_seat(new.id, new.date, public.fn_tk_seat_member(r.seat_key), r.now_in);
  end loop;
  -- 舊結構團課（member_ids 為空、逐筆單人、用 status 簽到）
  if coalesce(jsonb_array_length(case when jsonb_typeof(new.member_ids) = 'array' then new.member_ids else '[]'::jsonb end), 0) = 0
     and new.member_id is not null then
    v_old := public.fn_bk_attended(old);
    v_new := public.fn_bk_attended(new);
    if v_new is distinct from v_old then
      perform public.fn_tk_group_seat(new.id, new.date, new.member_id, v_new);
    end if;
  end if;
  return null;
end
$$;

-- 12) 權限：這些函式只給觸發器與資料庫內部使用，不開放任何 API 角色
revoke all on function public.fn_tk_today() from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_is_unopened(public.member_tickets) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_seat_member(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_bk_attended(public.bookings) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_holding(text, text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_window_check(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_refund_once(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_cancel_overdue(text, date, text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_activate(text, date, text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_attended_dates(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_recalc(text, text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_group_seat(text, date, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.trg_tk_window_ledger() from public, anon, authenticated, service_role;
revoke all on function public.trg_tk_window_booking() from public, anon, authenticated, service_role;
revoke all on function public.trg_tk_checkin_activate() from public, anon, authenticated, service_role;

-- 13) 觸發器（AFTER、逐列；WHEN 條件讓大多數寫入不進函式）
create or replace trigger trg_tk_window_ledger
  after insert on public.ticket_logs
  for each row when (new.action::text = 'deduct')
  execute function public.trg_tk_window_ledger();

create or replace trigger trg_tk_window_booking_ins
  after insert on public.bookings
  for each row when (new.ticket_id is not null and new.status::text is distinct from 'cancelled')
  execute function public.trg_tk_window_booking();

create or replace trigger trg_tk_window_booking_upd
  after update on public.bookings
  for each row when (new.ticket_id is not null and new.status::text is distinct from 'cancelled'
                     and (new.date is distinct from old.date or new.ticket_id is distinct from old.ticket_id
                          or old.status::text is not distinct from 'cancelled'))
  execute function public.trg_tk_window_booking();

create or replace trigger trg_tk_checkin_activate
  after update on public.bookings
  for each row when (old.checked_in_at is distinct from new.checked_in_at
                     or old.status is distinct from new.status
                     or old.attendance is distinct from new.attendance)
  execute function public.trg_tk_checkin_activate();


do $post$
declare v_fn integer; v_trg integer; v_n bigint; v_h text;
begin
  select count(*) into v_fn from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_tk_today','fn_tk_is_unopened','fn_tk_seat_member','fn_bk_attended','fn_tk_holding','fn_tk_window_check','fn_tk_refund_once',
                       'fn_tk_cancel_overdue','fn_tk_activate','fn_tk_attended_dates','fn_tk_recalc','fn_tk_group_seat','trg_tk_window_ledger','trg_tk_window_booking','trg_tk_checkin_activate');
  select count(*) into v_trg from pg_trigger where not tgisinternal and tgenabled = 'O'
     and tgname in ('trg_tk_window_ledger','trg_tk_window_booking_ins','trg_tk_window_booking_upd','trg_tk_checkin_activate');
  if v_fn <> 15 then raise exception 'P0E.POSTCHECK_FAILED: 函式數量 % ≠ 15', v_fn; end if;
  if v_trg <> 4 then raise exception 'P0E.POSTCHECK_FAILED: 觸發器數量 % ≠ 4', v_trg; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='member_tickets' and column_name='activation_mode') then
    raise exception 'P0E.POSTCHECK_FAILED: 缺 activation_mode'; end if;
  if exists (select 1 from member_tickets where activation_mode is not null) then
    raise exception 'P0E.POSTCHECK_FAILED: 套用當下不應有任何票券帶 activation_mode（不得回填）'; end if;
  select count(*), md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_n, v_h from member_tickets;
  if v_n <> (select n from pe_pre) or v_h <> (select h from pe_pre) then
    raise exception 'P0E.POSTCHECK_FAILED: 套用過程中既有票券資料被改動'; end if;
end
$post$;

commit;
