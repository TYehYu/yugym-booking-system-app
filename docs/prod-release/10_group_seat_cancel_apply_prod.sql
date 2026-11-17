-- 階段 10：團課「取消單一名額」原子化（三支新函式：fn_seat_map_reindex／fn_group_seat_rev／fn_cancel_group_seat）。⚠ 只供審查；尚未在正式庫執行，需使用者明確授權。
-- 單一交易：前置核對 → 建立三支函式（用 create function，不用 or replace；同名物件存在就失敗）→ 提交前核對本體指紋、權限、其餘物件不變 → commit。
-- 任何一步失敗＝整個交易回滾，沒有半套。不動任何資料、不動 06／08 物件、不動 seat_notes 欄。順序：先套本檔，再發布新前端（新前端會呼叫這三支函式）。
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if not ((select system_identifier::text from pg_control_system()) = '7637215626725903220') then raise exception 'GS.GUARD: 前置條件不符：叢集識別是正式庫，停止（沒有任何變更）'; end if;
  if not (to_regclass('public.change_log') is not null) then raise exception 'GS.GUARD: 前置條件不符：有 change_log（像正式庫），停止（沒有任何變更）'; end if;
  if not (exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='seat_notes' and udt_name='jsonb')) then raise exception 'GS.GUARD: 前置條件不符：bookings.seat_notes 存在且為 jsonb，停止（沒有任何變更）'; end if;
  if not (to_regprocedure('public.fn_tk_refund_once(text,text,text)') is not null and to_regprocedure('public.fn_refund_ticket(text,text,text)') is not null and to_regprocedure('public.fn_booking_rev_of(text)') is not null and to_regprocedure('public.fn_desk_cancel_booking(text,text)') is not null and to_regclass('public.booking_op_rev') is not null and exists (select 1 from pg_trigger where tgname='trg_booking_op_rev' and not tgisinternal)) then raise exception 'GS.GUARD: 前置條件不符：06／08 物件都在（fn_tk_refund_once、fn_refund_ticket、fn_booking_rev_of、fn_desk_cancel_booking、booking_op_rev、trg_booking_op_rev），停止（沒有任何變更）'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_tk_refund_once(text,text,text)')), '') = 'bba19026075474e59d57365e38361f1e') then raise exception 'GS.GUARD: 前置條件不符：fn_tk_refund_once 是釘住的 06 版本（本體 md5 bba19026075474e59d57365e38361f1e），停止（沒有任何變更）'; end if;
  if not (coalesce((select md5(pg_get_functiondef(to_regprocedure('public.fn_booking_rev_of(text)'))) where to_regprocedure('public.fn_booking_rev_of(text)') is not null), '') = '42ab6f3a78b5d3d885b784c1d5818131') then raise exception 'GS.GUARD: 前置條件不符：public.fn_booking_rev_of(text) 是釘住的版本（定義 md5 42ab6f3a78b5d3d885b784c1d5818131），停止（沒有任何變更）'; end if;
  if not (coalesce((select md5(pg_get_functiondef(to_regprocedure('public.trg_booking_op_rev()'))) where to_regprocedure('public.trg_booking_op_rev()') is not null), '') = '5391036bc33b78f0e45353d3d4c09a9b') then raise exception 'GS.GUARD: 前置條件不符：public.trg_booking_op_rev() 是釘住的版本（定義 md5 5391036bc33b78f0e45353d3d4c09a9b），停止（沒有任何變更）'; end if;
  if not (coalesce((select md5(pg_get_functiondef(to_regprocedure('public.fn_refund_ticket(text,text,text)'))) where to_regprocedure('public.fn_refund_ticket(text,text,text)') is not null), '') = '2140c88ebd655418775fdb0bfe8dfd9b') then raise exception 'GS.GUARD: 前置條件不符：public.fn_refund_ticket(text,text,text) 是釘住的版本（定義 md5 2140c88ebd655418775fdb0bfe8dfd9b），停止（沒有任何變更）'; end if;
  if not (not exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex'))) then raise exception 'GS.GUARD: 前置條件不符：三支新函式名稱都還不存在（不覆蓋任何同名物件，不論參數），停止（沒有任何變更）'; end if;
  create temp table _gs_pre on commit drop as select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_trigger where not tgisinternal) n_trg,
     (select count(*) from pg_tables where schemaname='public') n_tables;
end
$guard$;

-- ═══════════════════════════════════════════════════════════════════════
-- 團課「取消單一名額」原子化：fn_cancel_group_seat（取代前端 doGroupCancelSeat 的三段非原子寫入）
-- ⚠ 準備稿；只在測試庫套用過。正式庫需另行明確授權與階段檔（含指紋核對）。前置：階段 06（fn_tk_refund_once 06 版）與 08（booking_op_rev／fn_booking_rev_of）。
--
-- 為什麼（正式庫 2026-11-16 盤點）：前端 doGroupCancelSeat 先 dbPut 預約（名單、座位票、出席）、再讀票券加 1 整列回寫、再另寫帳、
--   首堂取消時還可能再整列回寫效期——共 3～4 次互不相干的寫入；與同一張票上並行的寫入（會員自助報名、櫃檯扣堂）交錯時會蓋掉對方的餘額，
--   中途失敗也會留下半套（名額已移除、票沒退，或反過來）。這是最常用的團課取消（近 30 天 55 筆退款、32 張票）。
--
-- 單一交易內完成（任何一步失敗整個回滾，沒有半套）：
--   鎖預約 → 驗證（團課、未取消、預約版本、名額存在、未簽到、未請假）→ 決定票券歸屬 → 鎖票券 → 依帳本淨額決定是否退 1 堂 →
--   同時移除該名額並重編「同一會員剩下名額」的 member_ids／seat_tickets／attendance／seat_notes → （舊制票）首堂取消效期重算。
--   鎖定順序＝預約 → 票券，與 fn_desk_deduct_ticket／fn_desk_cancel_booking／fn_refund_ticket／fn_move_booking_ticket 一致。
--
-- 名額識別：p_seat_key＝「名額鍵」（會員第 1 個名額＝會員 id；第 n 個＝id#n；與前端 seatKeys 同規則，依 member_ids 出現順序）。
--   名額鍵會在移除後遞補（A、A#2 移掉 A → 剩下的變成 A），所以重送同一個名額鍵可能指到「另一個名額」——
--   因此必須帶 p_expect_rev（預約版本，fn_group_seat_rev 讀出）：名單任何變動都會讓版本前進（08 的 trg_booking_op_rev），
--   重送、過期畫面、並行的另一個取消／加入，都會得到 REV_MISMATCH 而不是誤取消另一個名額。這也同時讓尚未完成的扣堂登記（fn_desk_op_begin）失效。
--
-- 票券歸屬（不憑會員 id 猜多名額）：
--   ① seat_tickets[名額鍵] 有值 → 就是那張票（正式庫未來 46 堂有名單的團課，名額都有記錄）。
--   ② 沒有記錄（舊資料）→ 只在「這個會員在這堂只有 1 個名額、且只有 1 張票有淨扣課」時採用那張；沒有任何淨扣課 → 視為沒扣過；
--      其餘（多名額或多張票有淨扣課）→ 拒絕 TICKET_UNKNOWN，什麼都不改，交人工處理。
-- 退款判斷（以 (票, 預約) 的帳為準；淨額 net＝deduct(delta≠0)筆數 − refund 筆數）：
--   同一張票在這堂還有 k 個「其他名額」記在 seat_tickets 上 → 只有 net > k 才退（net ≤ k 代表被取消的這個名額沒付到錢，不退；絕不退超過帳本支持的量）。
--   auto：該退 → 呼叫 fn_tk_refund_once（鎖票、上限護欄、used_up→usable、operator＝操作員工）→ outcome＝refunded；
--          不該退且曾扣過 → already_refunded；從未扣過 → no_deduction（寫一筆 adjust 說明帳，名額照移除）。
--          fn_tk_refund_once 回 false（例如餘額已滿）→ outcome＝refund_failed：名額照移除、票不動、留「待校正」稽核帳，畫面要明講。
--   none：人員選擇不退（目前畫面沒有這個選項，保留給日後）→ 該退的情況記 operator_waived 帳、不動餘額。
--   ⚠ 刻意不移植舊前端的後備規則「找不到淨扣課就退該會員最晚到期的團課票」：那會在沒扣過的情況下憑空多一堂。找不到就不退、清楚回報。
-- 其他規則：已簽到的名額、請假的名額（本堂照扣、已發補課券）一律拒絕（SEAT_CHECKED_IN／SEAT_ON_LEAVE），與畫面不顯示取消鈕一致，避免「退款又保留補課券」。
--   教練只能處理自己（主責或代課）的預約；櫃檯層級（is_staff_desk）可處理任何預約。
-- 舊制票（activation_mode 非 checkin）：取消的是起算日那一堂時，效期改依剩下最早的有效堂重算或退回未開通（移植自前端，同交易內完成）；
--   P0-E 的 checkin 票由既有觸發器處理。補課券（source=makeup）效期不變。
-- 授權：只授權 authenticated；函式內再驗證身分。內部輔助函式不開放任何 API 角色。
-- 回復：docs/migrations/20261119_fn_cancel_group_seat_rollback.sql（只 drop 三個函式，不動資料）。
-- ═══════════════════════════════════════════════════════════════════════

-- 內部輔助：移除第 p_idx 個名額後，把「同一會員」剩下名額的鍵往前遞補（與前端 seatReindexAfterRemove／seatTkReindexAfterRemove 同一套）
create function public.fn_seat_map_reindex(p_map jsonb, p_keys text[], p_mids text[], p_idx integer) returns jsonb
language plpgsql immutable set search_path to 'public','pg_temp'
as $$
declare v_mid text := p_mids[p_idx]; v_out jsonb := coalesce(p_map, '{}'::jsonb); v_kept jsonb[] := '{}'; i integer; n integer := 0;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then return p_map; end if;
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    if p_mids[i] = v_mid and i <> p_idx then v_kept := v_kept || (p_map -> p_keys[i]); end if;
  end loop;
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    if p_mids[i] = v_mid then v_out := v_out - p_keys[i]; end if;
  end loop;
  for i in 1 .. coalesce(array_length(v_kept, 1), 0) loop
    if v_kept[i] is not null and v_kept[i] <> 'null'::jsonb then
      v_out := v_out || jsonb_build_object(case when i > 1 then v_mid || '#' || i else v_mid end, v_kept[i]);
    end if;
  end loop;
  return v_out;
end
$$;
revoke all on function public.fn_seat_map_reindex(jsonb, text[], text[], integer) from public, anon, authenticated, service_role;

-- 預約版本（給櫃檯與該堂教練讀；fn_desk_booking_rev 只給櫃檯，教練也能按「取消」所以另設一支）
create function public.fn_group_seat_rev(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare v_emp text; v_desk boolean; b bookings%rowtype;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  v_desk := coalesce(is_staff_desk(), false);
  select * into b from bookings where id = p_booking_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if not v_desk and b.coach_id is distinct from v_emp and b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN'); end if;
  return jsonb_build_object('ok', true, 'rev', public.fn_booking_rev_of(b.id), 'status', b.status::text);
end
$fn$;

create function public.fn_cancel_group_seat(p_booking_id text, p_seat_key text, p_expect_rev text, p_mode text default 'auto')
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $fn$
declare
  v_emp text; v_desk boolean; b bookings%rowtype; t member_tickets%rowtype;
  v_ids jsonb; v_mids text[]; v_keys text[]; v_idx integer; v_mid text; v_nseat integer;
  v_att jsonb; v_st jsonb; v_nt jsonb; v_new_ids jsonb;
  v_tid text; v_cand integer; v_net integer; v_deducts integer; v_other integer;
  v_outcome text; v_refunded integer := 0; v_ok boolean; v_prev text; v_note text;
  v_ds date; v_exp date; v_after integer; v_line text;
begin
  perform set_config('lock_timeout', '3000', true);
  if p_booking_id is null or p_seat_key is null or p_expect_rev is null then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS'); end if;
  if coalesce(p_mode, 'auto') not in ('auto', 'none') then return jsonb_build_object('ok', false, 'error_code', 'BAD_MODE'); end if;
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  v_desk := coalesce(is_staff_desk(), false);

  select * into b from bookings where id = p_booking_id for update;                       -- ① 先鎖預約
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if not v_desk and b.coach_id is distinct from v_emp and b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN'); end if;
  if b.category::text is distinct from '小班肌力' then return jsonb_build_object('ok', false, 'error_code', 'NOT_GROUP'); end if;
  if b.status::text = 'cancelled' then return jsonb_build_object('ok', false, 'error_code', 'BOOKING_CANCELLED'); end if;
  if public.fn_booking_rev_of(b.id) is distinct from p_expect_rev then
    return jsonb_build_object('ok', false, 'error_code', 'REV_MISMATCH'); end if;

  v_ids := case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids else '[]'::jsonb end;
  select array_agg(mid order by ord), array_agg(case when rn > 1 then mid || '#' || rn else mid end order by ord)
    into v_mids, v_keys
    from (select mid, ord, row_number() over (partition by mid order by ord) as rn
            from jsonb_array_elements_text(v_ids) with ordinality as e(mid, ord)) x;
  v_idx := array_position(coalesce(v_keys, '{}'::text[]), p_seat_key);
  if v_idx is null then return jsonb_build_object('ok', false, 'error_code', 'NO_SEAT'); end if;
  v_mid := v_mids[v_idx];
  select count(*) into v_nseat from unnest(v_mids) m where m = v_mid;

  v_att := case when jsonb_typeof(b.attendance) = 'object' then b.attendance else '{}'::jsonb end;
  if v_att ->> p_seat_key = 'checked_in' then return jsonb_build_object('ok', false, 'error_code', 'SEAT_CHECKED_IN'); end if;
  if v_att ->> p_seat_key = 'leave' then return jsonb_build_object('ok', false, 'error_code', 'SEAT_ON_LEAVE'); end if;

  -- ② 票券歸屬：座位票記錄優先；沒有記錄才看帳本，且只在不用猜的時候採用
  v_st := case when jsonb_typeof(b.seat_tickets) = 'object' then b.seat_tickets else null end;
  v_tid := nullif(v_st ->> p_seat_key, '');
  if v_tid is null then
    select count(*), min(x.ticket_id) into v_cand, v_tid
      from (select l.ticket_id from ticket_logs l join member_tickets mt on mt.id = l.ticket_id
             where l.booking_id = p_booking_id and mt.member_id = v_mid
             group by l.ticket_id
            having sum(case when l.action::text = 'deduct' and coalesce(l.delta, 0) <> 0 then 1 when l.action::text = 'refund' then -1 else 0 end) > 0) x;
    if v_cand = 0 then v_tid := null;
    elsif v_cand = 1 and v_nseat = 1 then null;           -- v_tid 已由 min() 取得
    else return jsonb_build_object('ok', false, 'error_code', 'TICKET_UNKNOWN'); end if;
  end if;

  -- ③ 再鎖票券（預約 → 票券），算淨額與「其他名額」
  v_other := 0; v_net := 0; v_deducts := 0;
  if v_tid is not null then
    select * into t from member_tickets where id = v_tid for update;
    if not found then return jsonb_build_object('ok', false, 'error_code', 'TICKET_UNKNOWN'); end if;
    select coalesce(sum(case when action::text = 'deduct' and coalesce(delta, 0) <> 0 then 1 when action::text = 'refund' then -1 else 0 end), 0),
           count(*) filter (where action::text = 'deduct' and coalesce(delta, 0) <> 0)
      into v_net, v_deducts from ticket_logs where ticket_id = v_tid and booking_id = p_booking_id;
    if v_st is not null then
      select count(*) into v_other from jsonb_each_text(v_st) e where e.value = v_tid and e.key <> p_seat_key;
    end if;
  end if;

  -- ④ 退款決定與執行
  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);
  if v_tid is null then
    v_outcome := 'no_deduction';
  elsif v_net > v_other then
    if coalesce(p_mode, 'auto') = 'none' then
      v_outcome := 'operator_waived';
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp, '取消團課名額・扣課不退（人員選擇，票視同已使用）');
    else
      v_note := case when coalesce(t.source, '') = 'makeup' then '團體課取消預約退回（補課券，效期不變）' else '團體課取消預約退回' end;
      v_ok := public.fn_tk_refund_once(v_tid, p_booking_id, v_note);
      if v_ok then v_outcome := 'refunded'; v_refunded := 1;
      else
        v_outcome := 'refund_failed';
        insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
        values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp, '⚠ 取消團課名額・退票失敗（系統未能退回，待校正）');
      end if;
    end if;
  elsif v_deducts > 0 and v_net <= 0 then
    v_outcome := 'already_refunded';
  else
    v_outcome := 'no_deduction';
  end if;
  perform set_config('app.tk_operator', v_prev, true);
  if v_outcome in ('no_deduction', 'already_refunded') and v_tid is not null then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp,
            case when v_outcome = 'already_refunded' then '取消團課名額：這一堂在該票券上已完成退款，未重複退款'
                 else '取消團課名額：這個名額在該票券上沒有淨扣課紀錄，未退課' end);
  end if;

  -- ⑤ 同一交易移除名額並重編（member_ids／seat_tickets／attendance／seat_notes）
  select coalesce(jsonb_agg(m order by o), '[]'::jsonb) into v_new_ids from unnest(v_mids) with ordinality u(m, o) where o <> v_idx;
  v_att := public.fn_seat_map_reindex(v_att, v_keys, v_mids, v_idx);
  v_nt := case when jsonb_typeof(b.seat_notes) = 'object' then public.fn_seat_map_reindex(b.seat_notes, v_keys, v_mids, v_idx) else b.seat_notes end;
  if v_nt is not null and v_nt = '{}'::jsonb then v_nt := null; end if;
  update bookings
     set member_ids = v_new_ids,
         attendance = v_att,
         seat_tickets = case when v_st is not null then public.fn_seat_map_reindex(v_st, v_keys, v_mids, v_idx) else b.seat_tickets end,
         seat_notes = v_nt
   where id = p_booking_id;

  -- ⑥ 舊制票（非 checkin 啟用）：取消的是起算日那一堂 → 效期改依剩下最早的有效堂重算／退回未開通（移植自前端 doGroupCancelSeat）
  if v_refunded = 1 then
    select * into t from member_tickets where id = v_tid;
    if coalesce(t.valid_days, 0) > 0 and t.start_date is not null and coalesce(t.source, '') <> 'makeup'
       and t.activation_mode is distinct from 'checkin' and b.date = t.start_date then
      select min(bk.date) into v_ds from bookings bk
       where bk.status::text <> 'cancelled'
         and bk.id in (select l.booking_id from ticket_logs l where l.ticket_id = v_tid and l.booking_id is not null group by l.booking_id
                        having sum(case when l.action::text = 'deduct' and coalesce(l.delta, 0) <> 0 then 1 when l.action::text = 'refund' then -1 else 0 end) > 0);
      if v_ds is not null and v_ds > t.start_date then
        v_exp := v_ds + (t.valid_days - 1);
        v_line := to_char((now() at time zone 'Asia/Taipei')::date, 'YYYY-MM-DD') || ' 首堂取消，效期改依新首堂 ' || to_char(v_ds, 'YYYY/MM/DD') || ' 起算（→ ' || to_char(v_exp, 'YYYY/MM/DD') || '）';
        update member_tickets set start_date = v_ds, expire_date = v_exp,
               note = case when coalesce(btrim(note), '') <> '' then btrim(note) || E'\n' || v_line else v_line end
         where id = v_tid;
      elsif v_ds is null then
        update member_tickets set activated_at = null, start_date = null, expire_date = null where id = v_tid;
      end if;
    end if;
  end if;

  select sessions_remaining into v_after from member_tickets where id = v_tid;
  return jsonb_build_object('ok', true, 'outcome', v_outcome, 'seat_key', p_seat_key, 'member_id', v_mid, 'ticket_id', v_tid,
                            'refunded', v_refunded, 'seats_left', jsonb_array_length(v_new_ids), 'remaining_after', v_after);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY');
  when others then
    raise warning 'fn_cancel_group_seat internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'INTERNAL_ERROR');
end
$fn$;

revoke all on function public.fn_group_seat_rev(text) from public, anon, authenticated, service_role;
grant execute on function public.fn_group_seat_rev(text) to authenticated;
revoke all on function public.fn_cancel_group_seat(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.fn_cancel_group_seat(text, text, text, text) to authenticated;

do $post$
declare pre record;
begin
  select * into pre from _gs_pre;
  if not ((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) = 3) then raise exception 'GS.POST: 提交前核對不符：三支新函式都已建立（恰 3 支），整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')), '') = '0960ccde99493b7d79dd4d40a0fa45c6') then raise exception 'GS.POST: 提交前核對不符：fn_seat_map_reindex 本體 md5＝0960ccde99493b7d79dd4d40a0fa45c6，整個交易回滾'; end if;
  if not (coalesce((select prosecdef::text = 'false' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')), false)) then raise exception 'GS.POST: 提交前核對不符：fn_seat_map_reindex 的 security definer＝false、search_path 為 public, pg_temp，整個交易回滾'; end if;
  if not (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')), '') = '{postgres=X/postgres}') then raise exception 'GS.POST: 提交前核對不符：fn_seat_map_reindex 權限正好是 {postgres=X/postgres}（anon／service_role／public 都不能執行），整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_group_seat_rev(text)')), '') = '5f33108bc3b98e200eefbc23ad8070c8') then raise exception 'GS.POST: 提交前核對不符：fn_group_seat_rev 本體 md5＝5f33108bc3b98e200eefbc23ad8070c8，整個交易回滾'; end if;
  if not (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_group_seat_rev(text)')), false)) then raise exception 'GS.POST: 提交前核對不符：fn_group_seat_rev 的 security definer＝true、search_path 為 public, pg_temp，整個交易回滾'; end if;
  if not (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_group_seat_rev(text)')), '') = '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'GS.POST: 提交前核對不符：fn_group_seat_rev 權限正好是 {postgres=X/postgres,authenticated=X/postgres}（anon／service_role／public 都不能執行），整個交易回滾'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')), '') = 'c8a70d1d1d2918660543f0e5c69c89f6') then raise exception 'GS.POST: 提交前核對不符：fn_cancel_group_seat 本體 md5＝c8a70d1d1d2918660543f0e5c69c89f6，整個交易回滾'; end if;
  if not (coalesce((select prosecdef::text = 'true' and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')), false)) then raise exception 'GS.POST: 提交前核對不符：fn_cancel_group_seat 的 security definer＝true、search_path 為 public, pg_temp，整個交易回滾'; end if;
  if not (coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')), '') = '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'GS.POST: 提交前核對不符：fn_cancel_group_seat 權限正好是 {postgres=X/postgres,authenticated=X/postgres}（anon／service_role／public 都不能執行），整個交易回滾'; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace) is distinct from pre.n_funcs + 3 then raise exception 'GS.POST: 函式總數不是 原有+3，整個交易回滾'; end if;
  if exists (select 1 from (select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_trigger where not tgisinternal) n_trg,
     (select count(*) from pg_tables where schemaname='public') n_tables) now_ where (now_.n_funcs, now_.funcs_sig, now_.pol, now_.grants, now_.n_trg, now_.n_tables) is distinct from (pre.n_funcs, pre.funcs_sig, pre.pol, pre.grants, pre.n_trg, pre.n_tables)) then
    raise exception 'GS.POST: 其他函式／policies／權限／觸發器／資料表與套用前不同，整個交易回滾'; end if;
end
$post$;

commit;
