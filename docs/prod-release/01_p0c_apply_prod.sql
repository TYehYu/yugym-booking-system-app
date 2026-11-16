-- ═══════════════════════════════════════════════════════════════════════
-- 正式庫 1/4 階段｜P0-C 調課原子化 RPC fn_move_booking_ticket｜套用（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc）
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
do $pre01$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') then
    raise exception 'P0C.ABORT: fn_move_booking_ticket 已存在，不重複建立'; end if;
  if to_regprocedure('public.gen_short_id(text)') is null or to_regprocedure('public.is_staff_desk()') is null or to_regprocedure('public.fn_tk_shared_has(jsonb,text)') is null then
    raise exception 'P0C.ABORT: 缺少依賴函式'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'bookings'
        and column_name in ('partner_id','no_show','coach_leave','sibling_of','pending_contract','ticket_id','contract_id','coach_id','substitute_coach_id')) <> 9 then
    raise exception 'P0C.ABORT: bookings 缺欄位'; end if;
end
$pre01$;
create temp table p0c_pre on commit drop as select count(*) as n, md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) as h from member_tickets;

-- ═══════════════════════════════════════════════════════════════════════
-- 2026-11-15　調課原子化 RPC：fn_move_booking_ticket（P0-C）
-- ⚠ 準備稿，尚未在任何資料庫執行。測試庫要先套 docs/testdb/20261115_move_ticket_testdb_01_sync.sql。
-- ⚠ 正式庫套用需要使用者另外明確授權。
--
-- 起因（正式庫實例：鄭超元 2026-11-14）：待簽約卡的「調課」（前端 _doBkMoveTicket）只搬 bookings.ticket_id，
--   原本的扣課帳仍掛在舊預約上。之後取消新預約時，benefit_refund／前端都以「這一筆預約在這張票上的
--   扣退淨額」判斷有沒有扣過，新預約淨額是 0 → 判定沒扣過 → 不退堂。轉正舊預約時又因為舊預約淨額 > 0，
--   deductTicket 的冪等防線回 true、不扣堂 → 綁票成功卻沒扣堂。
--
-- 這支函式在同一個交易內完成：驗證 → 搬 ticket_id／partner_id → 改原預約 → 成對搬扣退堂帳本。
--   ・不更新 member_tickets（餘額、狀態都不動）；帳本合計不變。
--   ・原預約 refund +1、新預約 deduct −1、另寫一筆 adjust 0 調課痕跡（備註格式與舊流程相同，
--     先前的掃描 SQL 仍可解析：「調課：YYYY-MM-DD HH:MM → YYYY-MM-DD HH:MM（原課改為待簽約／原課取消）」）。
--   ・RPC 故障時前端停止調課，不退回舊的寫入流程。
--
-- 業務規則（2026-11-14 使用者確認）：
--   1 教練只能調整自己的課（主責或代課）；櫃檯、管理員、啟用中的店長依管理權限（is_staff_desk()）。
--   2 保留 hold／cancel 兩種模式。
--   3 1V2：partner_id 搬到新預約、原預約清空；新預約已有不同 partner_id 時拒絕。
--   4 sibling_of 影子卡禁止調課（含「有未取消的子卡指向它」）。
--   5 HOLD.MONTH_LIMIT（bookings 守門觸發器）時整段回滾並原樣回傳，前端提示可改選「原課取消」，不自動切換。
--   6 保留現行相容票種規則（逐條等價於前端 tkOkForSlot／tkTypeOkFor／bkTicketTypeOk，見 4b）。
--   7 目標時段不得早於台北現在時間。
--   8 不改 member_tickets 餘額。
--
-- 帳本驗證（對齊正式庫 benefit_refund 以 action 算淨額的語意，另外檢查 delta 與異常紀錄）：
--   原預約：必須有紀錄；(deduct 筆數 − refund 筆數) = 1；deduct／refund 的 delta 加總 = −1；
--           沒有異常紀錄（deduct 的 delta 不是 −1、refund 的 delta 不是 +1、adjust 的 delta 不為 0、grant、expire）。
--   新預約：淨額 0、delta 加總 0、沒有異常紀錄（先前扣後退的歷史允許）。
--
-- 鎖定順序：兩筆預約依 id 排序 for update → 票券 for update（與 fn_cancel_booking／fn_member_join_group／
--   fn_create_booking 一致的「預約 → 票券」）；lock_timeout 3 秒，逾時回 MOVE.BUSY。
--
-- 錯誤碼：MOVE.BAD_MODE／BAD_ARGS／BAD_TIME／NOT_FOUND／FORBIDDEN／NOT_SAME_MEMBER／GROUP_UNSUPPORTED／
--   SHADOW_CARD／CONTRACT_HOLD／FROM_STATE／TO_STATE／TARGET_PAST／ORDER／PARTNER_CONFLICT／TICKET_STATE／
--   TICKET_EXPIRED／TICKET_NOT_STARTED／TIME_RESTRICTED／TYPE_UNKNOWN／TYPE_MISMATCH／LEDGER_MISSING／
--   LEDGER_UNSUPPORTED／TO_LEDGER_DIRTY／WRITE_CONFLICT／BUSY／INTERNAL_ERROR；AUTH.FORBIDDEN；
--   以及觸發器原樣透傳的 HOLD.MONTH_LIMIT:YYYY-MM-DD、CONTRACT.*。
--   未知的 SQL 錯誤一律回 MOVE.INTERNAL_ERROR，內部訊息只寫進資料庫日誌（raise warning），不回給前端。
--
-- 授權：只授權 authenticated（函式內再驗證是啟用中的員工）；anon、service_role、public 一律不授權。
--
-- 前端規則複本的「防漂移」記錄（tests 會比對前端這些函式本體的 md5；任何一支改動都必須回頭核對本檔 4a／4b）：
--   bkTicketTypeOk    75a7e48d18102ab23f57d684320267de
--   bkIsMergedPT      c167c837459874da9b475131300ff4e2
--   bkIsPtVoucherType 161f024686df8ec4e4bf7728f81d2b4c
--   tkTypeOkFor       584b64262be78a3f95fdbc6eddaecab0
--   ticketCategoryOf  bb5df5ad62fe43c5f2887eb9735e171f
--   categoryOfTypeId  cd6b840a05facf1120163d0012c4a651
--   tkTimeOk          08024b300057fda7be05eb967e002435
--   tkOkForSlot       033b04473647686554618c6ec1a8224d
--   bkTypeIdOf        e4ac63231970bb28856de15b7942b716
--   TK_TIME_END_MIN   1080（18:00）
--   （以上雜湊取自 master bd9a714 的 index.html）
--
-- 回復（需明確授權的 DROP）：
--   revoke execute on function public.fn_move_booking_ticket(text, text, text) from authenticated;
--   drop function if exists public.fn_move_booking_ticket(text, text, text);
--   已經用本函式完成的調課沒有自動反向（餘額不變、帳本成對），需要時走個案審查。
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_move_booking_ticket(
  p_from_booking text, p_to_booking text, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_emp       employees%rowtype;
  v_desk      boolean;
  v_f         bookings%rowtype;
  v_t         bookings%rowtype;
  v_tk        member_tickets%rowtype;
  v_now       timestamp := (now() at time zone 'Asia/Taipei');
  v_type      text;
  v_want_cat  text;
  v_tk_cat    text;
  v_nm        text;
  v_sel       ticket_types%rowtype;
  v_tty       ticket_types%rowtype;
  v_sel_ok    boolean := false;
  v_tty_ok    boolean := false;
  v_type_ok   boolean := false;
  v_start_min integer;
  v_d integer; v_r integer; v_dsum integer; v_bad integer; v_rows integer;
  v_n integer;
  v_op text;
begin
  perform set_config('lock_timeout', '3000', true);

  if p_mode is null or p_mode not in ('hold','cancel') then
    return jsonb_build_object('ok',false,'error_code','MOVE.BAD_MODE'); end if;
  if p_from_booking is null or p_to_booking is null or p_from_booking = p_to_booking then
    return jsonb_build_object('ok',false,'error_code','MOVE.BAD_ARGS'); end if;

  -- 0) 身分（取鎖之前）：只有啟用中的員工
  if v_uid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select * into v_emp from employees where auth_id = v_uid limit 1;
  if not found or coalesce(v_emp.status::text, '') = 'inactive' then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  v_desk := coalesce(is_staff_desk(), false);        -- 正式庫版本含啟用中的店長教練
  v_op := coalesce(v_emp.id, 'system');

  -- 1) 鎖：兩筆預約依 id 排序，再鎖票券
  perform 1 from bookings where id in (p_from_booking, p_to_booking) order by id for update;
  select * into v_f from bookings where id = p_from_booking;
  if not found then return jsonb_build_object('ok',false,'error_code','MOVE.NOT_FOUND'); end if;
  select * into v_t from bookings where id = p_to_booking;
  if not found then return jsonb_build_object('ok',false,'error_code','MOVE.NOT_FOUND'); end if;

  -- 2) 非櫃檯層級：只能調自己的課（主責或代課）；所有布林判斷一律用 is not true，避免 NULL 放行
  if not v_desk then
    if (coalesce(v_emp.role::text, '') = 'coach'
        and (v_f.coach_id = v_emp.id or v_f.substitute_coach_id = v_emp.id)
        and (v_t.coach_id = v_emp.id or v_t.substitute_coach_id = v_emp.id)) is not true then
      return jsonb_build_object('ok',false,'error_code','MOVE.FORBIDDEN'); end if;
  end if;

  -- 3) 預約前置條件
  if v_f.member_id is null or v_f.member_id is distinct from v_t.member_id then
    return jsonb_build_object('ok',false,'error_code','MOVE.NOT_SAME_MEMBER'); end if;
  if v_f.date is null or v_f.start_time is null or v_t.date is null or v_t.start_time is null then
    return jsonb_build_object('ok',false,'error_code','MOVE.BAD_TIME'); end if;
  if coalesce(v_f.category::text, '') = '小班肌力' or coalesce(v_t.category::text, '') = '小班肌力' then
    return jsonb_build_object('ok',false,'error_code','MOVE.GROUP_UNSUPPORTED'); end if;
  if v_f.sibling_of is not null or v_t.sibling_of is not null
     or exists (select 1 from bookings x where x.sibling_of in (p_from_booking, p_to_booking)
                  and x.status::text is distinct from 'cancelled') then
    return jsonb_build_object('ok',false,'error_code','MOVE.SHADOW_CARD'); end if;
  if v_f.contract_id is not null or v_t.contract_id is not null then
    return jsonb_build_object('ok',false,'error_code','MOVE.CONTRACT_HOLD'); end if;
  if v_f.status::text is distinct from 'booked' or coalesce(v_f.pending_contract,false) or v_f.ticket_id is null
     or v_f.checked_in_at is not null or coalesce(v_f.no_show,false) or coalesce(v_f.coach_leave,false) then
    return jsonb_build_object('ok',false,'error_code','MOVE.FROM_STATE'); end if;
  if v_t.status::text is distinct from 'booked' or not coalesce(v_t.pending_contract,false) or v_t.ticket_id is not null
     or v_t.checked_in_at is not null or coalesce(v_t.no_show,false) or coalesce(v_t.coach_leave,false) then
    return jsonb_build_object('ok',false,'error_code','MOVE.TO_STATE'); end if;
  if ((v_t.date::text || ' ' || v_t.start_time)::timestamp) < v_now then
    return jsonb_build_object('ok',false,'error_code','MOVE.TARGET_PAST'); end if;
  if ((v_f.date::text || ' ' || v_f.start_time)::timestamp) <= ((v_t.date::text || ' ' || v_t.start_time)::timestamp) then
    return jsonb_build_object('ok',false,'error_code','MOVE.ORDER'); end if;
  if v_t.partner_id is not null and v_t.partner_id is distinct from v_f.partner_id then
    return jsonb_build_object('ok',false,'error_code','MOVE.PARTNER_CONFLICT'); end if;

  -- 4) 鎖票券並驗證（等價於前端 tkOkForSlot）
  select * into v_tk from member_tickets where id = v_f.ticket_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_STATE'); end if;
  if v_tk.status::text is distinct from 'usable'
     or (v_tk.member_id = v_f.member_id
         or coalesce(public.fn_tk_shared_has(to_jsonb(v_tk.shared_with), v_f.member_id), false)) is not true then
    return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_STATE'); end if;
  if v_tk.expire_date is not null and v_tk.expire_date < v_t.date then
    return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_EXPIRED'); end if;
  if v_tk.start_date is not null and v_tk.start_date > v_t.date and v_tk.activated_at is null then
    return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_NOT_STARTED'); end if;

  -- 4a) 限時段票（tkTimeOk）：週末不可；下課超過 18:00（TK_TIME_END_MIN=1080）不可
  if exists (select 1 from ticket_types tt where tt.id = v_tk.ticket_type_id and coalesce(tt.time_restricted,false)) then
    v_start_min := split_part(v_t.start_time,':',1)::int * 60 + split_part(v_t.start_time,':',2)::int;
    if extract(isodow from v_t.date) in (6,7)
       or v_start_min + coalesce(nullif(v_t.duration,0),60) > 1080 then
      return jsonb_build_object('ok',false,'error_code','MOVE.TIME_RESTRICTED'); end if;
  end if;

  -- 4b) 票種相容（逐條對應 bkTypeIdOf／categoryOfTypeId／ticketCategoryOf／tkTypeOkFor／bkTicketTypeOk）
  --     新預約維持自己的 ticket_type_id；票券維持自己的票種（相容票種時兩者本來就可以不同）。
  v_type := coalesce(v_t.ticket_type_id, case when v_t.category::text = '場租' then 'tt-venue-rental' end);
  if v_type is null then return jsonb_build_object('ok',false,'error_code','MOVE.TYPE_UNKNOWN'); end if;

  select category::text into v_want_cat from ticket_types where id = v_type;
  if v_want_cat is null then
    v_want_cat := case v_type when 'pt' then '私人教練' when 'pt_friendly' then '私人教練'
                  when 'group' then '小班肌力' when 'self_training' then '自主訓練'
                  when 'self_friendly' then '自主訓練' when 'trial' then '體驗' else null end;
  end if;

  select category::text into v_tk_cat from ticket_types where id = v_tk.ticket_type_id;
  if v_tk_cat is null then
    v_tk_cat := case v_tk.ticket_type_id when 'pt' then '私人教練' when 'pt_friendly' then '私人教練'
                when 'group' then '小班肌力' when 'self_training' then '自主訓練'
                when 'self_friendly' then '自主訓練' when 'trial' then '體驗' else null end;
    if v_tk_cat is null then
      v_nm := coalesce(v_tk.plan_name,'') || coalesce((select name from ticket_types where id = v_tk.ticket_type_id),'');
      v_tk_cat := case when v_nm like '%團體%' or v_nm like '%小班%' or v_nm like '%團課%' then '小班肌力'
                       when v_nm like '%自主%' then '自主訓練'
                       when v_nm like '%體驗%' then '體驗'
                       when v_nm like '%教練%' then '私人教練' else null end;
    end if;
  end if;

  -- ⚠ 以下每一個賦值都用 coalesce(...,false)：比對對象為 NULL 時結果是 NULL，
  --   而 `if not NULL` 不會進入拒絕分支 —— 最後一律用 `v_type_ok is not true` 才放行。
  if v_want_cat = '小班肌力' then
    v_type_ok := coalesce(v_tk_cat = '小班肌力', false);
  elsif v_want_cat = '自主訓練' then
    v_type_ok := coalesce(v_tk_cat = '自主訓練', false);
  elsif v_tk.ticket_type_id is not distinct from v_type then
    v_type_ok := true;
  else
    select * into v_sel from ticket_types where id = v_type;              v_sel_ok := found;
    select * into v_tty from ticket_types where id = v_tk.ticket_type_id; v_tty_ok := found;
    -- 規則 2：一般教練課（私人教練、名稱不含「友善」、非 VIP／限定）可接受 VIP／限定票
    if v_sel_ok and v_tty_ok
       and coalesce(v_sel.category::text, '') = '私人教練'
       and coalesce(v_sel.name,'') !~ '友善' and coalesce(v_sel.name,'') !~ 'VIP|限定'
       and coalesce(v_tty.category::text, '') = '私人教練' and coalesce(v_tty.name,'') ~ 'VIP|限定' then
      v_type_ok := true;
    end if;
    -- 規則 3：友善教練課可用一般教練課票（非折抵券；單向）
    if v_type_ok is not true and v_sel_ok and v_tty_ok
       and coalesce(v_sel.category::text, '') = '私人教練' and coalesce(v_sel.name,'') ~ '友善'
       and coalesce(v_tty.category::text, '') = '私人教練' and coalesce(v_tty.name,'') !~ '友善'
       and not (v_tty.id like 'tt-discount-%' or coalesce(v_tty.name,'') ~ '折抵') then
      v_type_ok := true;
    end if;
  end if;
  if v_type_ok is not true then return jsonb_build_object('ok',false,'error_code','MOVE.TYPE_MISMATCH'); end if;

  -- 5) 帳本驗證（對齊 benefit_refund：以 action 算淨額；另外要求 delta 淨額一致、沒有異常紀錄）
  select count(*) filter (where action = 'deduct'),
         count(*) filter (where action = 'refund'),
         coalesce(sum(delta) filter (where action in ('deduct','refund')), 0),
         count(*) filter (where (action = 'deduct' and delta is distinct from -1)
                             or (action = 'refund' and delta is distinct from 1)
                             or (action = 'adjust' and coalesce(delta,0) <> 0)
                             or action::text in ('grant','expire')),
         count(*)
    into v_d, v_r, v_dsum, v_bad, v_rows
    from ticket_logs where ticket_id = v_tk.id and booking_id = p_from_booking;
  if v_rows = 0 then return jsonb_build_object('ok',false,'error_code','MOVE.LEDGER_MISSING'); end if;
  if (v_d - v_r) <> 1 or v_dsum <> -1 or v_bad > 0 then
    return jsonb_build_object('ok',false,'error_code','MOVE.LEDGER_UNSUPPORTED'); end if;

  select count(*) filter (where action = 'deduct'),
         count(*) filter (where action = 'refund'),
         coalesce(sum(delta) filter (where action in ('deduct','refund')), 0),
         count(*) filter (where (action = 'deduct' and delta is distinct from -1)
                             or (action = 'refund' and delta is distinct from 1)
                             or (action = 'adjust' and coalesce(delta,0) <> 0)
                             or action::text in ('grant','expire'))
    into v_d, v_r, v_dsum, v_bad
    from ticket_logs where ticket_id = v_tk.id and booking_id = p_to_booking;
  if (v_d - v_r) <> 0 or v_dsum <> 0 or v_bad > 0 then
    return jsonb_build_object('ok',false,'error_code','MOVE.TO_LEDGER_DIRTY'); end if;

  -- 6) 寫入（不更新 member_tickets）
  update bookings
     set ticket_id = v_tk.id,
         ticket_type_id = coalesce(ticket_type_id, v_f.ticket_type_id, v_tk.ticket_type_id),
         pending_contract = false,
         partner_id = v_f.partner_id
   where id = p_to_booking;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'MOVE.WRITE_CONFLICT' using errcode = 'P0001'; end if;

  if p_mode = 'hold' then
    update bookings set ticket_id = null, pending_contract = true, partner_id = null where id = p_from_booking;
  else
    update bookings set ticket_id = null, status = 'cancelled', cancelled_at = now(), partner_id = null
     where id = p_from_booking;
  end if;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'MOVE.WRITE_CONFLICT' using errcode = 'P0001'; end if;

  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-') || 'a', v_tk.id, 'refund', 1, p_from_booking, v_op,
          '調課帳本搬移：票券移至 ' || p_to_booking);
  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-') || 'b', v_tk.id, 'deduct', -1, p_to_booking, v_op,
          '調課帳本搬移：票券自 ' || p_from_booking || ' 移入');
  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-') || 'c', v_tk.id, 'adjust', 0, p_to_booking, v_op,
          '調課：' || v_f.date::text || ' ' || left(v_f.start_time,5) || ' → ' || v_t.date::text || ' ' || left(v_t.start_time,5)
          || case when p_mode = 'cancel' then '（原課取消）' else '（原課改為待簽約）' end);

  -- 7) 影子卡競態的最後防線（不是完整防護：bookings 沒有 sibling_of 外鍵，另一個連線仍可能在這一行之後、
  --    本交易提交之前插入同行卡；那種情況只會留下一張顯示用的孤兒卡，不影響票券、帳本與預約綁定，
  --    由 docs/testdb/move_ticket_shadow_orphan_scan.sql 偵測）
  if exists (select 1 from bookings x where x.sibling_of in (p_from_booking, p_to_booking)
               and x.status::text is distinct from 'cancelled') then
    raise exception 'MOVE.SHADOW_CARD' using errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true, 'mode', p_mode, 'ticket_id', v_tk.id,
                            'from_id', p_from_booking, 'to_id', p_to_booking);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'MOVE.BUSY');
  when others then
    -- 已知的業務錯誤（本函式自己的代碼、月份上限、合約檢查）原樣回傳；其餘一律不外洩內部訊息
    if sqlerrm like 'MOVE.%' or sqlerrm like 'HOLD.MONTH_LIMIT:%' or sqlerrm like 'CONTRACT.%' then
      return jsonb_build_object('ok', false, 'error_code', sqlerrm);
    end if;
    raise warning 'fn_move_booking_ticket internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'MOVE.INTERNAL_ERROR');
end
$fn$;

comment on function public.fn_move_booking_ticket(text, text, text) is
  '調課原子化（P0-C）：同交易搬 ticket_id／partner_id 並成對搬扣退堂帳本；不改 member_tickets。規則複本的防漂移雜湊見 migration 檔頭。';

revoke all on function public.fn_move_booking_ticket(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.fn_move_booking_ticket(text, text, text) to authenticated;

do $post01$
declare v_n bigint; v_h text;
begin
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') <> 1 then raise exception 'P0C.POSTCHECK_FAILED: 函式數量不是 1'; end if;
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') <> '411549f649f4858215e6e03429bb7ce7:13276' then
    raise exception 'P0C.POSTCHECK_FAILED: 本體與審查過的版本不符'; end if;
  if coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_move_booking_ticket(text,text,text)')), '') <> '{postgres=X/postgres,authenticated=X/postgres}' then
    raise exception 'P0C.POSTCHECK_FAILED: ACL 不是「擁有者＋authenticated」'; end if;
  select count(*), md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) into v_n, v_h from member_tickets;
  if v_n <> (select n from p0c_pre) or v_h <> (select h from p0c_pre) then raise exception 'P0C.POSTCHECK_FAILED: 套用過程中既有票券資料被改動'; end if;
end
$post01$;
commit;
