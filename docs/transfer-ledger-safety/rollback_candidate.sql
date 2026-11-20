-- Review only; wrap in guarded transaction. Does not reverse completed moves.
drop trigger if exists trg_booking_transfer_ledger_guard on public.bookings;
drop function if exists public.fn_booking_transfer_ledger_guard();
CREATE OR REPLACE FUNCTION public.fn_refund_ticket(p_ticket_id text, p_booking_id text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp text; v_desk boolean; b bookings%rowtype; t member_tickets%rowtype;
  v_d integer; v_r integer; v_a integer; v_ok boolean; v_after integer;
  v_prev text;
begin
  perform set_config('lock_timeout', '3000', true);
  if p_ticket_id is null or p_booking_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.BAD_ARGS'); end if;
  v_emp := current_employee_id();
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  v_desk := coalesce(is_staff_desk(), false);

  select * into b from bookings where id = p_booking_id for update;                       -- 先鎖預約
  if not found then return jsonb_build_object('ok', false, 'error_code', 'REFUND.NO_BOOKING'); end if;
  if not v_desk and b.coach_id is distinct from v_emp and b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.FORBIDDEN'); end if;

  select * into t from member_tickets where id = p_ticket_id for update;                  -- 再鎖票券（並行呼叫在這裡排隊）
  if not found then return jsonb_build_object('ok', false, 'error_code', 'REFUND.NO_TICKET'); end if;

  perform public.fn_ticket_net_checked(p_ticket_id,p_booking_id);
  select count(*) filter (where action::text = 'deduct' and delta=-1), count(*) filter (where action::text = 'refund' and delta=1),
         count(*) filter (where action::text = 'adjust')
    into v_d, v_r, v_a from ticket_logs where ticket_id = p_ticket_id and booking_id = p_booking_id;

  if v_d = 0 and v_r = 0 and v_a = 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.NO_DEDUCT'); end if;
  if v_d = 0 and v_r = 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.ONLY_ADJUST'); end if;
  if v_d = 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.ONLY_REFUND'); end if;
  if v_d - v_r < 0 then return jsonb_build_object('ok', false, 'error_code', 'REFUND.OVER_REFUNDED'); end if;
  if v_d - v_r = 0 then
    return jsonb_build_object('ok', true, 'refunded', false, 'reason', 'ALREADY_REFUNDED', 'ticket_id', p_ticket_id);
  end if;

  -- 操作人員（app.tk_operator）的作用域：交易區域（is_local=true）、只在核心呼叫的這一小段有效。
  --   記下「呼叫前」的值，核心呼叫後**還原成呼叫前的值**（不是寫死空字串）：同一交易內連續呼叫、或外層已設定過時，都不會被清掉或沿用上一位。
  --   例外路徑：本函式的 EXCEPTION 區塊是子交易，被攔下的例外會連同這裡的設定一起回復到進入前的值。
  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);                                      -- 帳本 operator＝實際操作的員工
  v_ok := public.fn_tk_refund_once(p_ticket_id, p_booking_id, coalesce(nullif(p_note, ''), '取消退課'));
  perform set_config('app.tk_operator', v_prev, true);
  if not v_ok then return jsonb_build_object('ok', false, 'error_code', 'REFUND.BALANCE_FULL'); end if;

  select sessions_remaining into v_after from member_tickets where id = p_ticket_id;
  return jsonb_build_object('ok', true, 'refunded', true, 'ticket_id', p_ticket_id, 'remaining_after', v_after);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.BUSY');
  when others then
    if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
    raise warning 'fn_refund_ticket internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'REFUND.INTERNAL_ERROR');
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_ticket_net_checked(p_ticket text, p_booking text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d int; r int; bad int;
begin
 select count(*) filter(where action::text='deduct' and delta=-1),
        count(*) filter(where action::text='refund' and delta=1),
        count(*) filter(where (action::text='deduct' and (delta is null or delta not in (-1,0)))
                          or (action::text='refund' and (delta is null or delta<>1)))
 into d,r,bad from public.ticket_logs where ticket_id=p_ticket and booking_id=p_booking;
 if bad>0 then raise exception 'TICKET.LEDGER_AMBIGUOUS'; end if;
 if r>d then raise exception 'TICKET.LEDGER_NEGATIVE'; end if;
 return d-r;
end $function$;
CREATE OR REPLACE FUNCTION public.fn_move_booking_ticket(p_from_booking text, p_to_booking text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- P0-E 銜接：本函式在同一交易內先改兩筆預約的 ticket_id、再成對寫帳，中間狀態會暫時同時算到新舊兩筆；
  --   先開「跳過預約端窗口檢查」旗標（只對本交易有效、只影響 trg_tk_window_booking），
  --   最後由 ticket_logs 的 deduct 觸發器（refund 已先寫、帳與預約皆為最終狀態）做唯一一次檢查。成功回傳前會還原；失敗隨回滾自動還原。
  perform set_config('app.tkwin_skip_booking', 'on', true);
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

  perform set_config('app.tkwin_skip_booking', '', true);
  return jsonb_build_object('ok', true, 'mode', p_mode, 'ticket_id', v_tk.id,
                            'from_id', p_from_booking, 'to_id', p_to_booking);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'MOVE.BUSY');
  when others then
    -- 已知的業務錯誤（本函式自己的代碼、月份上限、合約檢查）原樣回傳；其餘一律不外洩內部訊息
    if sqlerrm like 'MOVE.%' or sqlerrm like 'HOLD.MONTH_LIMIT:%' or sqlerrm like 'CONTRACT.%' or sqlerrm like 'TKWIN.%' then
      return jsonb_build_object('ok', false, 'error_code', sqlerrm);
    end if;
    raise warning 'fn_move_booking_ticket internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'MOVE.INTERNAL_ERROR');
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_desk_cancel_booking(p_booking_id text, p_mode text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp text; b bookings%rowtype; r record; v_prev text; v_i int; v_ok boolean;
  v_ref int := 0; v_fail int := 0; v_tot int := 0; v_failed text[] := '{}'; v_tid text;
  v_outcome text; v_has_refund int;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_booking_id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if coalesce(p_mode, 'auto') not in ('auto', 'force', 'none', 'plain') then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_MODE'); end if;

  select * into b from bookings where id = p_booking_id for update;                    -- 先鎖預約
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if b.status::text = 'cancelled' then return jsonb_build_object('ok', true, 'already', true); end if;

  -- Validate every ticket before any refund. An ambiguous ledger aborts this whole call.
  perform public.fn_ticket_net_checked(x.ticket_id,p_booking_id)
    from (select distinct ticket_id from ticket_logs where booking_id=p_booking_id and ticket_id is not null) x;
  v_prev := coalesce(current_setting('app.tk_operator', true), '');
  perform set_config('app.tk_operator', v_emp, true);                                   -- 帳本 operator＝實際操作的員工（交易區域）
  for r in
    select l.ticket_id, sum(case when l.action::text = 'deduct' and l.delta=-1 then 1 when l.action::text = 'refund' and l.delta=1 then -1 else 0 end)::int as net
      from ticket_logs l where l.booking_id = p_booking_id and l.ticket_id is not null
     group by l.ticket_id
    having sum(case when l.action::text = 'deduct' and l.delta=-1 then 1 when l.action::text = 'refund' and l.delta=1 then -1 else 0 end) > 0
     order by l.ticket_id                                                                -- 固定順序，避免多筆取消互相等待
  loop
    v_tot := v_tot + r.net;
    if p_mode = 'none' then
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values (public.gen_short_id('LG-'), r.ticket_id, 'adjust', 0, p_booking_id, v_emp, '取消・扣課不退（櫃檯選擇，票視同已使用）');
    else
      for v_i in 1..r.net loop
        v_ok := public.fn_tk_refund_once(r.ticket_id, p_booking_id, '取消退課');
        if v_ok then v_ref := v_ref + 1;
        else v_fail := v_fail + 1; v_failed := v_failed || r.ticket_id; exit;            -- 這張票退不掉（例如餘額已滿）：記下，繼續處理其他票
        end if;
      end loop;
    end if;
  end loop;
  perform set_config('app.tk_operator', v_prev, true);

  if p_mode = 'none' then v_outcome := case when v_tot > 0 then 'operator_waived' else 'no_deduction' end;
  elsif v_fail > 0 then v_outcome := case when v_ref > 0 then 'refund_partial' else 'refund_failed' end;
  elsif v_ref > 0 then v_outcome := 'refunded';
  else v_outcome := 'no_deduction';
  end if;

  -- 退不掉的票留稽核標記（畫面用它分辨「系統沒退成」與「人員選擇不退」；與前端 BK_REFUND_*_NOTE 同字）
  foreach v_tid in array v_failed loop
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), v_tid, 'adjust', 0, p_booking_id, v_emp,
            case when v_outcome = 'refund_partial' then '⚠ 取消・部分退款（這張票的退票失敗，待校正）' else '⚠ 取消・退票失敗（系統未能退回，待校正）' end);
  end loop;

  -- 沒有淨扣課可退、且綁了票（單人課）：與舊前端同樣留一筆說明帳
  if v_tot = 0 and p_mode <> 'plain' and b.ticket_id is not null then
    select count(*) into v_has_refund from ticket_logs where booking_id = p_booking_id and ticket_id = b.ticket_id and action::text = 'refund';
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), b.ticket_id, 'adjust', 0, p_booking_id, v_emp,
            case when v_has_refund > 0 then '系統偵測：這堂課先前已完成退款但預約狀態未同步，本次僅補上取消狀態，未重複退款'
                 else '取消未退課：這一堂在該票券上沒有淨扣課紀錄' end);
  end if;

  update bookings
     set status = 'cancelled', cancelled_at = now(),
         refund_waived = (v_outcome in ('operator_waived', 'refund_failed', 'refund_partial'))
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'outcome', v_outcome, 'refunded', v_ref, 'failed', v_fail,
                            'failed_tickets', to_jsonb(v_failed), 'net_total', v_tot);
exception when others then
  if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
  raise;
end
$function$;
revoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;
revoke all on function public.fn_refund_ticket(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_refund_ticket(text,text,text) to authenticated;
revoke all on function public.fn_move_booking_ticket(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_move_booking_ticket(text,text,text) to authenticated;
revoke all on function public.fn_desk_cancel_booking(text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_desk_cancel_booking(text,text) to authenticated;
grant execute on function public.fn_desk_cancel_booking(text,text) to service_role;
