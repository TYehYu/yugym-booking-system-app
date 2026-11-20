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
$function$
;
CREATE OR REPLACE FUNCTION public.fn_desk_deduct_ticket(p_ticket_id text, p_booking_id text, p_note text DEFAULT NULL::text, p_op_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp text; v_bk bookings%rowtype; v_tk record; v_net int; v_id text; v_rem int; v_marker text; v_op record; v_ref int; v_m text[]; v_rev text;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_booking_id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;

  -- ① 先鎖預約（與取消／退票／調課同序），並確認沒被取消
  select * into v_bk from bookings where id = p_booking_id for update;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING'); end if;
  if v_bk.status::text = 'cancelled' then return jsonb_build_object('ok', false, 'error_code', 'BOOKING_CANCELLED'); end if;

  -- ② 再鎖票券
  select id, status, sessions_remaining into v_tk from member_tickets where id = p_ticket_id for update;
  if v_tk.id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_TICKET'); end if;

  if v_tk.status::text is distinct from 'usable' then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-',''), p_ticket_id, 'adjust', 0, p_booking_id, v_emp,
            '⚠ 已阻擋：票券狀態為 '||v_tk.status::text||'，未再扣課', now());
    return jsonb_build_object('ok', false, 'error_code', 'TICKET_NOT_USABLE', 'status', v_tk.status::text);
  end if;

  if p_op_key is null then
    v_net := public.fn_ticket_net_checked(p_ticket_id,p_booking_id);
    if v_net > 0 then
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), p_ticket_id, 'adjust', 0, p_booking_id, v_emp,
              '⚠ 已阻擋：這一堂在這張票上已經扣過 '||v_net||' 堂，不重複扣', now());
      return jsonb_build_object('ok', true, 'already', true, 'remaining', v_tk.sessions_remaining);
    end if;
  else
    -- 多堂：必須是 fn_desk_op_begin 登記過、屬於這張票這一堂的操作（以 預約＋票＋slot＋epoch 查表，不信識別字串本身的範圍）
    v_m := regexp_match(p_op_key, '^(.*):e([0-9]+)$');
    if v_m is null then return jsonb_build_object('ok', false, 'error_code', 'UNKNOWN_OP'); end if;
    select * into v_op from ticket_deduct_ops where booking_id = p_booking_id and ticket_id = p_ticket_id and slot = v_m[1] and epoch = v_m[2]::int;
    if not found then return jsonb_build_object('ok', false, 'error_code', 'UNKNOWN_OP'); end if;
    v_marker := '｜op:' || p_op_key;
    if exists (select 1 from ticket_logs
                where ticket_id = p_ticket_id and booking_id = p_booking_id and action = 'deduct' and delta = -1
                  and right(coalesce(note,''), length(v_marker)) = v_marker) then
      return jsonb_build_object('ok', true, 'already', true, 'remaining', v_tk.sessions_remaining);   -- 已套用過的重送
    end if;
    -- 預約版本（名單／座位票／時長…）或退款筆數與登記時不同，這個操作即作廢：不需要有退款帳，即使從未成功寫過扣課帳，延遲到達也不能扣
    v_rev := public.fn_booking_rev_of(v_bk.id);
    select count(*) into v_ref from ticket_logs where ticket_id = p_ticket_id and booking_id = p_booking_id and action::text = 'refund';
    if v_rev is distinct from v_op.booking_rev or v_ref > v_op.refunds_at_begin then return jsonb_build_object('ok', false, 'error_code', 'STALE_OP'); end if;
  end if;

  if coalesce(v_tk.sessions_remaining, 0) <= 0 then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-',''), p_ticket_id, 'adjust', 0, p_booking_id, v_emp,
            '⚠ 已阻擋：餘額為 '||coalesce(v_tk.sessions_remaining,0)||'，未再扣課', now());
    return jsonb_build_object('ok', false, 'error_code', 'NO_REMAINING');
  end if;

  update member_tickets set sessions_remaining = sessions_remaining - 1
   where id = p_ticket_id returning sessions_remaining into v_rem;
  v_id := 'LG-'||replace(gen_random_uuid()::text,'-','');
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
  values (v_id, p_ticket_id, 'deduct', -1, p_booking_id, v_emp,
          coalesce(nullif(p_note,''), '預約扣課') || coalesce(v_marker, ''), now());
  return jsonb_build_object('ok', true, 'log_id', v_id, 'remaining', v_rem);
end
$function$
;
CREATE OR REPLACE FUNCTION public.trg_booking_op_rev()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id text := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  insert into public.booking_op_rev(booking_id, rev) values (v_id, 1)
  on conflict (booking_id) do update set rev = public.booking_op_rev.rev + 1;
  return null;
end $function$
;
CREATE OR REPLACE FUNCTION public.trg_tk_quota_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_used_new integer; v_used_old integer;
begin
  if new.unlocked_sessions is null or coalesce(new.sessions_total, 0) <= 0 then return new; end if;
  if new.unlocked_sessions >= new.sessions_total then return new; end if;          -- 完整開通：沒有額度概念
  v_used_new := new.sessions_total - coalesce(new.sessions_remaining, 0);
  v_used_old := coalesce(old.sessions_total, new.sessions_total) - coalesce(old.sessions_remaining, 0);
  if v_used_new > v_used_old and v_used_new > new.unlocked_sessions then
    raise exception 'TICKET.INSTALLMENT_LOCKED'
      using errcode = 'P0001',
            detail = format('used=%s unlocked=%s', v_used_new, new.unlocked_sessions),
            hint = '分期票只能使用已開通的堂數；請先完成下一期付款開通，再預約或扣課';
  end if;
  return new;
end
$function$
;
