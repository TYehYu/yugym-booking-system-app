-- Ticket accounting safety; DDL only, no historical balance rewrite.
begin;
set local lock_timeout='5s';
do $release$ begin
if (select system_identifier::text from pg_control_system())<>'7637215626725903220' then raise exception 'PRODUCTION_ONLY'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.benefit_refund(text,integer,text)')) is distinct from 'e1fb16bb9dff2ee15c6871923ce38a77' then raise exception 'VERSION_MISMATCH: benefit_refund(text,integer,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_booking_rev_of(text)')) is distinct from '8b511dc9c42f866c7d8c7d259d023051' then raise exception 'VERSION_MISMATCH: fn_booking_rev_of(text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_cancel_booking(text,text,boolean)')) is distinct from '14ab0a2a440c1337c46ec3333ca8f228' then raise exception 'VERSION_MISMATCH: fn_cancel_booking(text,text,boolean)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')) is distinct from 'c8a70d1d1d2918660543f0e5c69c89f6' then raise exception 'VERSION_MISMATCH: fn_cancel_group_seat(text,text,text,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)')) is distinct from '0232ac7d7abc63f24b17c3c7abb2309a' then raise exception 'VERSION_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_desk_cancel_booking(text,text)')) is distinct from 'c55bd387196a19d122a1246904315027' then raise exception 'VERSION_MISMATCH: fn_desk_cancel_booking(text,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_desk_deduct_ticket(text,text,text,text)')) is distinct from '1fa7b9ac753150c4a9e0c0ada78d40af' then raise exception 'VERSION_MISMATCH: fn_desk_deduct_ticket(text,text,text,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_member_join_group(text,text)')) is distinct from '704dbc7b132587b563fa969102ddf348' then raise exception 'VERSION_MISMATCH: fn_member_join_group(text,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_member_leave_group(text)')) is distinct from '2e52aae476bcc04787f01a6e291ec305' then raise exception 'VERSION_MISMATCH: fn_member_leave_group(text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_refund_ticket(text,text,text)')) is distinct from '7fd3d3333181643bc30b52ac091e2e0a' then raise exception 'VERSION_MISMATCH: fn_refund_ticket(text,text,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_tk_cancel_overdue(text,date,text)')) is distinct from '7eeda19dd808da813b39bb69f155ff68' then raise exception 'VERSION_MISMATCH: fn_tk_cancel_overdue(text,date,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_tk_refund_once(text,text,text)')) is distinct from 'bba19026075474e59d57365e38361f1e' then raise exception 'VERSION_MISMATCH: fn_tk_refund_once(text,text,text)'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.trg_booking_op_rev()')) is distinct from '5667f663260f21417d7f2f45d984288f' then raise exception 'VERSION_MISMATCH: trg_booking_op_rev()'; end if;
if to_regprocedure('public.fn_ticket_net_checked(text,text)') is not null then raise exception 'NAME_OCCUPIED: fn_ticket_net_checked'; end if;
if to_regprocedure('public.fn_member_leave_group_v2(text,text,text)') is not null then raise exception 'NAME_OCCUPIED: fn_member_leave_group_v2'; end if;
if to_regprocedure('public.fn_member_group_cancel_preview(text)') is not null then raise exception 'NAME_OCCUPIED: fn_member_group_cancel_preview'; end if;
if has_function_privilege('anon','public.benefit_refund(text,integer,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: benefit_refund(text,integer,text) anon'; end if;
if has_function_privilege('authenticated','public.benefit_refund(text,integer,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: benefit_refund(text,integer,text) authenticated'; end if;
if has_function_privilege('service_role','public.benefit_refund(text,integer,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: benefit_refund(text,integer,text) service_role'; end if;
if has_function_privilege('anon','public.fn_booking_rev_of(text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_booking_rev_of(text) anon'; end if;
if has_function_privilege('authenticated','public.fn_booking_rev_of(text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_booking_rev_of(text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_booking_rev_of(text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_booking_rev_of(text) service_role'; end if;
if has_function_privilege('anon','public.fn_cancel_booking(text,text,boolean)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_booking(text,text,boolean) anon'; end if;
if has_function_privilege('authenticated','public.fn_cancel_booking(text,text,boolean)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_booking(text,text,boolean) authenticated'; end if;
if has_function_privilege('service_role','public.fn_cancel_booking(text,text,boolean)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_booking(text,text,boolean) service_role'; end if;
if has_function_privilege('anon','public.fn_cancel_group_seat(text,text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_cancel_group_seat(text,text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_cancel_group_seat(text,text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_group_seat(text,text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_cancel_group_seat(text,text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_cancel_group_seat(text,text,text,text) service_role'; end if;
if has_function_privilege('anon','public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) anon'; end if;
if has_function_privilege('authenticated','public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) authenticated'; end if;
if has_function_privilege('service_role','public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) service_role'; end if;
if has_function_privilege('anon','public.fn_desk_cancel_booking(text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_desk_cancel_booking(text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_desk_cancel_booking(text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_cancel_booking(text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_desk_cancel_booking(text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_cancel_booking(text,text) service_role'; end if;
if has_function_privilege('anon','public.fn_desk_deduct_ticket(text,text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_desk_deduct_ticket(text,text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_desk_deduct_ticket(text,text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_deduct_ticket(text,text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_desk_deduct_ticket(text,text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_deduct_ticket(text,text,text,text) service_role'; end if;
if has_function_privilege('anon','public.fn_member_join_group(text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_member_join_group(text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_member_join_group(text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_join_group(text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_member_join_group(text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_member_join_group(text,text) service_role'; end if;
if has_function_privilege('anon','public.fn_member_leave_group(text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_leave_group(text) anon'; end if;
if has_function_privilege('authenticated','public.fn_member_leave_group(text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_leave_group(text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_member_leave_group(text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_leave_group(text) service_role'; end if;
if has_function_privilege('anon','public.fn_refund_ticket(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_refund_ticket(text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_refund_ticket(text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_refund_ticket(text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_refund_ticket(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_refund_ticket(text,text,text) service_role'; end if;
if has_function_privilege('anon','public.fn_tk_cancel_overdue(text,date,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_cancel_overdue(text,date,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_tk_cancel_overdue(text,date,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_cancel_overdue(text,date,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_tk_cancel_overdue(text,date,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_cancel_overdue(text,date,text) service_role'; end if;
if has_function_privilege('anon','public.fn_tk_refund_once(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_refund_once(text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_tk_refund_once(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_refund_once(text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_tk_refund_once(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_refund_once(text,text,text) service_role'; end if;
if has_function_privilege('anon','public.trg_booking_op_rev()','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: trg_booking_op_rev() anon'; end if;
if has_function_privilege('authenticated','public.trg_booking_op_rev()','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: trg_booking_op_rev() authenticated'; end if;
if has_function_privilege('service_role','public.trg_booking_op_rev()','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: trg_booking_op_rev() service_role'; end if;
execute $ddl$-- Internal helper: zero-value links are not charges; nonstandard legacy deltas need review.
create or replace function public.fn_ticket_net_checked(p_ticket text,p_booking text) returns integer
language plpgsql volatile security definer set search_path to 'public','pg_temp'
as $fn$
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
end $fn$;
revoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_deduct_ticket(p_ticket_id text, p_booking_id text, p_note text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_expire_date date DEFAULT NULL::date, p_activated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp  text;
  v_desk boolean;
  v_bk   record;
  v_tk   record;
  v_net  int;
  v_id   text;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF');
  end if;
  select is_staff_desk() into v_desk;

  select id, coach_id, substitute_coach_id, status into v_bk from bookings where id = p_booking_id for update;
  if v_bk.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING');
  end if;

  -- 教練（非店長）只能扣自己那一堂；代課教練也算自己的課
  if not coalesce(v_desk,false)
     and v_bk.coach_id is distinct from v_emp
     and v_bk.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_YOUR_BOOKING');
  end if;

  if v_bk.status::text='cancelled' then return jsonb_build_object('ok',false,'error_code','BOOKING_CANCELLED'); end if;

  select id, status, sessions_remaining into v_tk from member_tickets where id = p_ticket_id for update;
  if v_tk.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'NO_TICKET');
  end if;

  -- 冪等：這一堂在這張票上已經有淨扣課就不再扣（與前端 tkNetDeductOn 同口徑）
  v_net := public.fn_ticket_net_checked(p_ticket_id,p_booking_id);
  if v_tk.status::text not in ('usable','used_up') or v_tk.status is null then
    return jsonb_build_object('ok',false,'error_code','TICKET_NOT_USABLE');
  end if;
  if v_net > 0 then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-','')::text, p_ticket_id, 'adjust', 0,
            p_booking_id, v_emp,
            '⚠ 已阻擋：這一堂在這張票上已經扣過 '||v_net||' 堂，不重複扣', now());
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if v_tk.status::text<>'usable' then return jsonb_build_object('ok',false,'error_code','TICKET_NOT_USABLE'); end if;
  if coalesce(v_tk.sessions_remaining, 0) <= 0 then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-'||replace(gen_random_uuid()::text,'-','')::text, p_ticket_id, 'adjust', 0,
            p_booking_id, v_emp,
            '⚠ 已阻擋：餘額為 '||coalesce(v_tk.sessions_remaining,0)||'，未再扣課', now());
    return jsonb_build_object('ok', false, 'error_code', 'NO_REMAINING');
  end if;

  -- 效期開通的日期由前端算（activateTicketIfNeeded／termExpire 的規則在那裡），
  -- 這裡只負責「有帶才寫」，不覆蓋既有值成 null。
  update member_tickets
     set sessions_remaining = sessions_remaining - 1,
         start_date   = coalesce(p_start_date,   start_date),
         expire_date  = coalesce(p_expire_date,  expire_date),
         activated_at = coalesce(p_activated_at, activated_at)
   where id = p_ticket_id;

  v_id := 'LG-'||replace(gen_random_uuid()::text,'-','');
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
  values (v_id, p_ticket_id, 'deduct', -1, p_booking_id, v_emp,
          coalesce(nullif(p_note,''), '預約扣課'), now());

  return jsonb_build_object('ok', true, 'log_id', v_id);
end $function$;
CREATE OR REPLACE FUNCTION public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t member_tickets%rowtype; v_net integer; v_op text := coalesce(nullif(current_setting('app.tk_operator', true), ''), 'system');
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  v_net := public.fn_ticket_net_checked(p_ticket,p_booking);
  if v_net <= 0 then return false; end if;
  if coalesce(t.sessions_total, 0) > 0 and coalesce(t.sessions_remaining, 0) >= t.sessions_total then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, v_op, '⚠ 已阻擋：餘額已滿，未再退課（效期屆滿自動取消）');
    return false;
  end if;
  update member_tickets
     set sessions_remaining = coalesce(sessions_remaining, 0) + 1,
         status = case when status::text = 'used_up' then 'usable' else status end
   where id = p_ticket;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'refund', 1, p_booking, v_op, coalesce(p_note, '取消返還原票'));
  return true;
end
$function$;
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
CREATE OR REPLACE FUNCTION public.fn_tk_cancel_overdue(p_ticket text, p_expire date, p_except text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare h record; b bookings%rowtype; v_n integer := 0; v_why text; v_refunded boolean;
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
      v_refunded := public.fn_tk_refund_once(p_ticket, b.id, '取消退課：' || v_why);
      if not v_refunded then
        perform public.desk_alert(b.member_id,'tk_expiry_manual','　有預約超出票券效期，退款未完成，需人工核對',to_char(b.date,'MM/DD') || ' ' || coalesce(b.start_time,''));
        continue;
      end if;
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
$function$;
CREATE OR REPLACE FUNCTION public.fn_cancel_group_seat(p_booking_id text, p_seat_key text, p_expect_rev text, p_mode text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    perform public.fn_ticket_net_checked(v_tid,p_booking_id);
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
    if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
    raise warning 'fn_cancel_group_seat internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'INTERNAL_ERROR');
end
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.fn_cancel_booking(p_booking_id text, p_reason text DEFAULT NULL::text, p_refund boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  b bookings%rowtype;
  v_hours_before numeric;
  v_should_refund boolean;
  v_start_ts timestamptz;
  v_actor text;                 -- 'desk' | 'coach' | 'member'
  v_emp text;
  v_grace boolean;
  v_self_training boolean;
  v_legacy_group boolean;
  v_why text; v_ret jsonb;
begin
  select * into b from bookings where id=p_booking_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;

  -- ── 判定身分 ──
  -- is_staff_desk() 對非員工回的是 NULL 不是 false，一律用 coalesce 收斂。
  if coalesce(is_staff_desk(), false) then
    v_actor := 'desk';
  elsif current_staff_role() is not null then
    v_actor := 'coach';
    v_emp := current_employee_id();
    if v_emp is null or b.coach_id is distinct from v_emp then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
    if b.category::text = '小班肌力' then
      return jsonb_build_object('ok',false,'error_code','GROUP.DESK_ONLY','actor','coach');
    end if;
  else
    v_actor := 'member';
    if current_member_id() is null or b.member_id is null or current_member_id() is distinct from b.member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  if b.status='cancelled' then return jsonb_build_object('ok',true,'already',true); end if;

  v_start_ts := ((b.date || ' ' || b.start_time)::timestamp at time zone 'Asia/Taipei');
  v_hours_before := extract(epoch from (v_start_ts - now()))/3600;
  v_grace := coalesce(b.created_at is not null and now() - b.created_at <= interval '10 minutes', false);
  -- ⚠ benefit_type 可能是 NULL，一定要 coalesce（0821 修過一次：NULL 會讓整條規則失效）
  v_self_training := coalesce(b.benefit_type = 'training_pass', false)
                     or coalesce(b.category::text = '自主訓練', false);
  v_legacy_group := coalesce(b.category::text = '小班肌力', false)
                    and coalesce(jsonb_array_length(coalesce(b.member_ids,'[]'::jsonb)), 0) = 0;

  -- ── 會員自助只限團課與自主訓練（2026-08-21）──
  if v_actor = 'member' and not v_self_training and not v_legacy_group then
    return jsonb_build_object('ok',false,'error_code','CANCEL.DESK_ONLY',
      'category', b.category::text, 'actor', v_actor);
  end if;

  -- ── 24 小時內不能自行取消：2026-08-21 起**只擋會員**（原本連教練一起擋）──
  -- 教練改時間本來就不受限，擋取消只是讓他多繞一步；櫃檯與管理員一向不受限。
  if v_actor = 'member' and v_hours_before < 24 and not v_grace and not v_self_training then
    return jsonb_build_object('ok',false,'error_code','CANCEL.TOO_LATE',
      'hours_before', round(v_hours_before,2), 'actor', v_actor);
  end if;

  if v_actor='desk' then
    v_should_refund := coalesce(p_refund, true);
    v_why := null;
  else
    v_should_refund := true;
    v_why := case
      when v_self_training then '（自主訓練，已退回 1 點）'
      when v_grace then '（預約後 10 分鐘內取消，已退回 1 堂）'
      else '（已退回 1 堂）' end;
  end if;

  if v_should_refund and b.ticket_id is not null then
    v_ret:=public.benefit_refund(b.ticket_id,1,b.id);
    if not coalesce((v_ret->>'refunded')::boolean,false) then raise exception 'REFUND.NO_DEDUCT'; end if;
  end if;

  update bookings set status='cancelled', cancelled_at=now(), refund_waived=(not v_should_refund),
    reward_status = case when reward_status='issued' then 'revoked' else reward_status end,
    makeup_status = case when not v_should_refund and b.benefit_type in ('coaching_session','friendly_session')
                         then 'eligible_pending' else 'not_requested' end
  where id=b.id;

  if v_actor='member' then
    perform desk_alert(b.member_id,'self_cancel','　自行取消了'||b.category::text,
      to_char(b.date,'MM/DD')||' '||b.start_time||'　'||b.category::text||coalesce(v_why,''));
  end if;

  return jsonb_build_object('ok',true,'booking_id',b.id,
    'cancellation_result', case when v_should_refund then 'refunded' else 'forfeited' end,
    'hours_before', round(v_hours_before,2),
    'refunded_ticket', case when v_should_refund then b.ticket_id else null end,
    'makeup','not_requested');
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm);
end
$function$;
create or replace function public.benefit_refund(p_benefit_ref text,p_qty integer,p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare n int; did_refund boolean;
begin
 if p_benefit_ref is null then return jsonb_build_object('ok',true,'refunded',false,'skipped','no_ticket'); end if;
 -- Existing caller fn_cancel_booking refunds one unit. Never trust an arbitrary amount.
 if p_qty is distinct from 1 or p_booking_id is null then raise exception 'REFUND.BAD_ARGS'; end if;
 perform 1 from bookings where id=p_booking_id for update;
 if not found then raise exception 'REFUND.NO_BOOKING'; end if;
 perform 1 from member_tickets where id=p_benefit_ref for update;
 if not found then raise exception 'REFUND.NO_TICKET'; end if;
 n:=public.fn_ticket_net_checked(p_benefit_ref,p_booking_id);
 if n=0 then return jsonb_build_object('ok',true,'refunded',false,'skipped','no_deduct'); end if;
 did_refund:=public.fn_tk_refund_once(p_benefit_ref,p_booking_id,'取消返還原票');
 if not did_refund then raise exception 'REFUND.BALANCE_FULL'; end if;
 return jsonb_build_object('ok',true,'refunded',true);
end $function$;
-- Old clients cannot prove which revision their request belongs to; never guess a current revision.
create or replace function public.fn_member_leave_group(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$ begin
 if public.current_member_id() is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 return jsonb_build_object('ok',false,'error_code','CLIENT.UPDATE_REQUIRED');
end $function$;
create or replace function public.fn_member_leave_group_v2(p_booking_id text,p_seat_key text,p_expect_rev text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
 v_mid text:=current_member_id(); b bookings%rowtype; t member_tickets%rowtype;
 v_mids text[]; v_keys text[]; v_idx int; v_nseat int; v_tid text; v_cand int;
 v_ids jsonb; v_st jsonb; v_att jsonb; v_nt jsonb; v_net int; v_other int; v_refunded int:=0;
 v_outcome text; v_prev text; v_hours numeric;
begin
 perform set_config('lock_timeout','3000',true);
 if p_booking_id is null or p_seat_key is null or p_expect_rev is null then return jsonb_build_object('ok',false,'error_code','BAD_ARGS'); end if;
 if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select * into b from bookings where id=p_booking_id for update;
 if not found or b.status::text<>'booked' or b.category::text<>'小班肌力' then
  return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
 if not (coalesce(b.member_ids,'[]'::jsonb) @> to_jsonb(v_mid)) then
  return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 if public.fn_booking_rev_of(b.id) is distinct from p_expect_rev then return jsonb_build_object('ok',false,'error_code','REV_MISMATCH'); end if;
 v_hours:=extract(epoch from (((b.date||' '||b.start_time)::timestamp at time zone 'Asia/Taipei')-now()))/3600;
 if v_hours<24 then return jsonb_build_object('ok',false,'error_code','CANCEL.TOO_LATE','hours_before',round(v_hours,2),'actor','member'); end if;
 select array_agg(mid order by ord),array_agg(case when rn>1 then mid||'#'||rn else mid end order by ord)
 into v_mids,v_keys from(select mid,ord,row_number() over(partition by mid order by ord) rn
 from jsonb_array_elements_text(b.member_ids) with ordinality e(mid,ord)) x;
 v_idx:=array_position(v_keys,p_seat_key);
 if v_idx is null or v_mids[v_idx] is distinct from v_mid then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select count(*) into v_nseat from unnest(v_mids) m where m=v_mid;
 v_att:=case when jsonb_typeof(b.attendance)='object' then b.attendance else '{}'::jsonb end;
 if v_att->>v_keys[v_idx] in ('checked_in','leave') then return jsonb_build_object('ok',false,'error_code','SEAT_NOT_CANCELLABLE'); end if;
 v_st:=case when jsonb_typeof(b.seat_tickets)='object' then b.seat_tickets else '{}'::jsonb end;
 v_tid:=nullif(v_st->>v_keys[v_idx],'');
 if v_tid is null then
  -- Only a unique actual deduction on an unambiguous seat may be used as a legacy fallback.
  select count(*),min(x.id) into v_cand,v_tid from(
   select mt.id from member_tickets mt where
    (mt.member_id=v_mid or (mt.shared_with ? v_mid))
    and exists(select 1 from ticket_logs l where l.ticket_id=mt.id and l.booking_id=b.id)
    and public.fn_ticket_net_checked(mt.id,b.id)>0
  ) x;
  if v_cand<>1 or v_nseat<>1 then return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
  -- A different unmapped participant might be using this shared ticket. Do not guess their allocation.
  if exists(select 1 from unnest(v_mids,v_keys) x(mid,sk) join member_tickets mt on mt.id=v_tid
    where x.mid<>v_mid and not(v_st ? x.sk) and (mt.member_id=x.mid or mt.shared_with ? x.mid)) then
   return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
 end if;
 select * into t from member_tickets where id=v_tid for update;
 if not found or not(t.member_id=v_mid or coalesce(t.shared_with ? v_mid,false)) then
  return jsonb_build_object('ok',false,'error_code','TICKET.UNKNOWN'); end if;
 v_net:=public.fn_ticket_net_checked(v_tid,b.id);
 select count(*) into v_other from jsonb_each_text(v_st) e where e.value=v_tid and e.key<>v_keys[v_idx];
 if v_net<=v_other then return jsonb_build_object('ok',false,'error_code','REFUND.NO_DEDUCT'); end if;
 v_prev:=coalesce(current_setting('app.tk_operator',true),'');
 perform set_config('app.tk_operator',v_mid,true);
 if v_net>v_other then
  if not public.fn_tk_refund_once(v_tid,b.id,'會員自行取消團體課退 1 堂') then
   perform set_config('app.tk_operator',v_prev,true);
   return jsonb_build_object('ok',false,'error_code','REFUND.BALANCE_FULL'); end if;
  v_refunded:=1; v_outcome:='refunded';
 else v_outcome:='no_deduction'; end if;
 perform set_config('app.tk_operator',v_prev,true);
 select coalesce(jsonb_agg(mid order by ord),'[]'::jsonb) into v_ids
 from unnest(v_mids) with ordinality x(mid,ord) where ord<>v_idx;
 v_att:=public.fn_seat_map_reindex(v_att,v_keys,v_mids,v_idx);
 v_nt:=case when jsonb_typeof(b.seat_notes)='object' then public.fn_seat_map_reindex(b.seat_notes,v_keys,v_mids,v_idx) else b.seat_notes end;
 update bookings set member_ids=v_ids,attendance=v_att,
  seat_tickets=public.fn_seat_map_reindex(v_st,v_keys,v_mids,v_idx),seat_notes=v_nt where id=b.id;
 perform public.desk_alert(v_mid,'self_cancel','　自行取消了團體課',
  to_char(b.date,'MM/DD')||' '||b.start_time||case when v_refunded=1 then '　團體課（已退回 1 堂）' else '　團體課（未發現本名額的實際扣堂，沒有退課）' end);
 return jsonb_build_object('ok',true,'booking_id',b.id,'refund_ticket',v_tid,'refunded',v_refunded,'outcome',v_outcome);
exception
 when lock_not_available or deadlock_detected or serialization_failure then return jsonb_build_object('ok',false,'error_code','REFUND.BUSY');
 when others then
  if sqlerrm in ('TICKET.LEDGER_AMBIGUOUS','TICKET.LEDGER_NEGATIVE') then return jsonb_build_object('ok',false,'error_code',sqlerrm); end if;
  raise warning 'fn_member_leave_group error: % %',sqlstate,sqlerrm;
  return jsonb_build_object('ok',false,'error_code','REFUND.INTERNAL_ERROR');
end $function$;
create or replace function public.fn_member_group_cancel_preview(p_booking_id text) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare mid text:=public.current_member_id(); b bookings%rowtype; ks jsonb;
begin
 if mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 -- Lock and read the revision in the same transaction, not from two unrelated frontend reads.
 select * into b from public.bookings where id=p_booking_id for share;
 if not found or b.category::text<>'小班肌力' or b.status::text<>'booked' then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
 if not(coalesce(b.member_ids,'[]'::jsonb) @> to_jsonb(mid)) then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 select jsonb_agg(case when rn>1 then m||'#'||rn else m end order by ord) into ks
 from(select m,ord,row_number() over(partition by m order by ord) rn from jsonb_array_elements_text(b.member_ids) with ordinality e(m,ord)) x where m=mid;
 if ks is null or jsonb_array_length(ks)=0 then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
 return jsonb_build_object('ok',true,'booking_id',b.id,'date',b.date,'start_time',b.start_time,'rev',public.fn_booking_rev_of(b.id),'seat_keys',ks);
end $function$;
revoke all on function public.benefit_refund(text,integer,text) from public,anon,authenticated,service_role;

revoke all on function public.fn_cancel_booking(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.fn_cancel_booking(text,text,boolean) to public;

revoke all on function public.fn_cancel_group_seat(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_cancel_group_seat(text,text,text,text) to authenticated;

revoke all on function public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) from public,anon,authenticated,service_role;
grant execute on function public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) to authenticated;

revoke all on function public.fn_desk_cancel_booking(text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_desk_cancel_booking(text,text) to authenticated;
grant execute on function public.fn_desk_cancel_booking(text,text) to service_role;

revoke all on function public.fn_desk_deduct_ticket(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_desk_deduct_ticket(text,text,text,text) to authenticated;
grant execute on function public.fn_desk_deduct_ticket(text,text,text,text) to service_role;

revoke all on function public.fn_member_group_cancel_preview(text) from public,anon,authenticated,service_role;
grant execute on function public.fn_member_group_cancel_preview(text) to authenticated;

revoke all on function public.fn_member_leave_group(text) from public,anon,authenticated,service_role;
grant execute on function public.fn_member_leave_group(text) to public;

revoke all on function public.fn_member_leave_group_v2(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_member_leave_group_v2(text,text,text) to authenticated;

revoke all on function public.fn_refund_ticket(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_refund_ticket(text,text,text) to authenticated;

revoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;

revoke all on function public.fn_tk_cancel_overdue(text,date,text) from public,anon,authenticated,service_role;

revoke all on function public.fn_tk_refund_once(text,text,text) from public,anon,authenticated,service_role;
$ddl$;

if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.benefit_refund(text,integer,text)')) is distinct from '5844c849b2d3ad56b5c0027236c0a3a9' then raise exception 'VERSION_MISMATCH: benefit_refund(text,integer,text)'; end if;
if has_function_privilege('anon','public.benefit_refund(text,integer,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: benefit_refund(text,integer,text) anon'; end if;
if has_function_privilege('authenticated','public.benefit_refund(text,integer,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: benefit_refund(text,integer,text) authenticated'; end if;
if has_function_privilege('service_role','public.benefit_refund(text,integer,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: benefit_refund(text,integer,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.benefit_refund(text,integer,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: benefit_refund'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_cancel_booking(text,text,boolean)')) is distinct from 'f57f64a33082355d881b0d345bf6edd7' then raise exception 'VERSION_MISMATCH: fn_cancel_booking(text,text,boolean)'; end if;
if has_function_privilege('anon','public.fn_cancel_booking(text,text,boolean)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_booking(text,text,boolean) anon'; end if;
if has_function_privilege('authenticated','public.fn_cancel_booking(text,text,boolean)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_booking(text,text,boolean) authenticated'; end if;
if has_function_privilege('service_role','public.fn_cancel_booking(text,text,boolean)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_booking(text,text,boolean) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_cancel_booking(text,text,boolean)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_cancel_booking'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')) is distinct from '4962910b1d9d35a99b124a87f39c876d' then raise exception 'VERSION_MISMATCH: fn_cancel_group_seat(text,text,text,text)'; end if;
if has_function_privilege('anon','public.fn_cancel_group_seat(text,text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_cancel_group_seat(text,text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_cancel_group_seat(text,text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_cancel_group_seat(text,text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_cancel_group_seat(text,text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_cancel_group_seat(text,text,text,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_cancel_group_seat'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)')) is distinct from 'b62d0e852f3ecae9a40f95ee263bba5b' then raise exception 'VERSION_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)'; end if;
if has_function_privilege('anon','public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) anon'; end if;
if has_function_privilege('authenticated','public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) authenticated'; end if;
if has_function_privilege('service_role','public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_deduct_ticket(text,text,text,date,date,timestamp with time zone) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_deduct_ticket(text,text,text,date,date,timestamp with time zone)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_deduct_ticket'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_desk_cancel_booking(text,text)')) is distinct from '474c1c7d93a26dd6b927cb2223c13d89' then raise exception 'VERSION_MISMATCH: fn_desk_cancel_booking(text,text)'; end if;
if has_function_privilege('anon','public.fn_desk_cancel_booking(text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_desk_cancel_booking(text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_desk_cancel_booking(text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_cancel_booking(text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_desk_cancel_booking(text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_cancel_booking(text,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_desk_cancel_booking(text,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_desk_cancel_booking'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_desk_deduct_ticket(text,text,text,text)')) is distinct from 'e676c18a537fde1f34ba826e8e33f998' then raise exception 'VERSION_MISMATCH: fn_desk_deduct_ticket(text,text,text,text)'; end if;
if has_function_privilege('anon','public.fn_desk_deduct_ticket(text,text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_desk_deduct_ticket(text,text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_desk_deduct_ticket(text,text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_deduct_ticket(text,text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_desk_deduct_ticket(text,text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_desk_deduct_ticket(text,text,text,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_desk_deduct_ticket(text,text,text,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_desk_deduct_ticket'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_member_group_cancel_preview(text)')) is distinct from '388dc315d584fd7c5e4af2da4f86692b' then raise exception 'VERSION_MISMATCH: fn_member_group_cancel_preview(text)'; end if;
if has_function_privilege('anon','public.fn_member_group_cancel_preview(text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_member_group_cancel_preview(text) anon'; end if;
if has_function_privilege('authenticated','public.fn_member_group_cancel_preview(text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_group_cancel_preview(text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_member_group_cancel_preview(text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_member_group_cancel_preview(text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_member_group_cancel_preview(text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_member_group_cancel_preview'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_member_leave_group(text)')) is distinct from 'b8be9b11ee8a90b38c3861db6f349805' then raise exception 'VERSION_MISMATCH: fn_member_leave_group(text)'; end if;
if has_function_privilege('anon','public.fn_member_leave_group(text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_leave_group(text) anon'; end if;
if has_function_privilege('authenticated','public.fn_member_leave_group(text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_leave_group(text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_member_leave_group(text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_leave_group(text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_member_leave_group(text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_member_leave_group'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_member_leave_group_v2(text,text,text)')) is distinct from '62b320d6cf81dbff9c3d3e37d16e89f9' then raise exception 'VERSION_MISMATCH: fn_member_leave_group_v2(text,text,text)'; end if;
if has_function_privilege('anon','public.fn_member_leave_group_v2(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_member_leave_group_v2(text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_member_leave_group_v2(text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_member_leave_group_v2(text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_member_leave_group_v2(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_member_leave_group_v2(text,text,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_member_leave_group_v2(text,text,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_member_leave_group_v2'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_refund_ticket(text,text,text)')) is distinct from '4a5558484ad5d5ce601c17e1a8f14445' then raise exception 'VERSION_MISMATCH: fn_refund_ticket(text,text,text)'; end if;
if has_function_privilege('anon','public.fn_refund_ticket(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_refund_ticket(text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_refund_ticket(text,text,text)','EXECUTE') is distinct from true then raise exception 'ACL_MISMATCH: fn_refund_ticket(text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_refund_ticket(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_refund_ticket(text,text,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_refund_ticket(text,text,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_refund_ticket'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_ticket_net_checked(text,text)')) is distinct from '7298a6877046eb1eecb1c04aa56bee66' then raise exception 'VERSION_MISMATCH: fn_ticket_net_checked(text,text)'; end if;
if has_function_privilege('anon','public.fn_ticket_net_checked(text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_ticket_net_checked(text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_ticket_net_checked(text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_ticket_net_checked(text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_ticket_net_checked(text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_ticket_net_checked(text,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_ticket_net_checked(text,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_ticket_net_checked'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_tk_cancel_overdue(text,date,text)')) is distinct from '67c15fcaf41d0ff4ef411bc914655649' then raise exception 'VERSION_MISMATCH: fn_tk_cancel_overdue(text,date,text)'; end if;
if has_function_privilege('anon','public.fn_tk_cancel_overdue(text,date,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_cancel_overdue(text,date,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_tk_cancel_overdue(text,date,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_cancel_overdue(text,date,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_tk_cancel_overdue(text,date,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_cancel_overdue(text,date,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_tk_cancel_overdue(text,date,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_tk_cancel_overdue'; end if;
if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_tk_refund_once(text,text,text)')) is distinct from 'adc6582b60d36117ca2e57bbcc2e0953' then raise exception 'VERSION_MISMATCH: fn_tk_refund_once(text,text,text)'; end if;
if has_function_privilege('anon','public.fn_tk_refund_once(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_refund_once(text,text,text) anon'; end if;
if has_function_privilege('authenticated','public.fn_tk_refund_once(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_refund_once(text,text,text) authenticated'; end if;
if has_function_privilege('service_role','public.fn_tk_refund_once(text,text,text)','EXECUTE') is distinct from false then raise exception 'ACL_MISMATCH: fn_tk_refund_once(text,text,text) service_role'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_tk_refund_once(text,text,text)') and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'FUNCTION_CONFIG: fn_tk_refund_once'; end if;
end $release$;
notify pgrst,'reload schema';
commit;
