-- 新票轉正整理並行驗證用的「測試專用」觀測函式（只裝測試庫 kucvxpjatptfckhlxptj；測完用 phase_remove_hs_zz.sql 移除）。
-- 做法沿用 docs/testdb/renewal/phase_install_renewal_zz.sql：持鎖者在交易內一邊持有鎖、一邊用 pg_blocking_pids 看到對手被自己擋住。
-- 它只是「呼叫真正的 fn_hold_settle_new_ticket／fn_desk_deduct_ticket／fn_desk_cancel_booking」再多做觀測或持鎖；業務行為完全是正式函式的。
-- 本批的對手有兩種等待：等 advisory 鎖（同會員同票種的整理互相排隊；回報持鎖者持有的 advisory 鎖與對手等的 classid/objid）、等預約列鎖（transactionid）。
-- 安全：只允許測試身分（員工 id 以 CC-EMP- 開頭）、只允許 CC-HS- 開頭的票券／預約；不放寬任何正式函式的逾時或保護。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;

create or replace function public.zz_hs_call(p_role text, p_kind text, p_args jsonb, p_expect_waiters int default 1, p_poll_ms int default 2500, p_extra_hold_ms int default 0)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_t0 timestamptz := clock_timestamp(); v_res jsonb; v_xid text; v_blocked jsonb := '[]'::jsonb; v_cnt int := 0; v_first timestamptz;
  v_iter int := 0; v_deadline timestamptz; v_adv jsonb := '[]'::jsonb; v_bk text := p_args->>'booking'; v_tk text := p_args->>'ticket';
begin
  if coalesce(public.current_employee_id(), '') not like 'CC-EMP-%' then return jsonb_build_object('error', 'NOT_TEST_IDENTITY'); end if;
  -- 所有帶進來的物件參數（票券、預約、錨點預約、鎖列、改時間的預約）都必須是本輪測試物件；空值放行（沒帶）
  if coalesce(v_tk, 'CC-HS-') not like 'CC-HS-%' or coalesce(v_bk, 'CC-HS-') not like 'CC-HS-%' or coalesce(p_args->>'anchor', 'CC-HS-') not like 'CC-HS-%' then return jsonb_build_object('error', 'NOT_TEST_OBJECT'); end if;
  perform set_config('application_name', left('cc:hs:' || p_role || ':' || p_kind || ':' || coalesce(v_tk, v_bk, ''), 63), true);   -- 本輪案例識別（交易內有效）
  if p_kind = 'settle' then
    v_res := public.fn_hold_settle_new_ticket(v_tk, coalesce((p_args->>'dry')::boolean, true), nullif(p_args->>'anchor', ''), p_args->'expect');
  elsif p_kind = 'lockrow' then
    perform 1 from bookings where id = v_bk for update;
    if p_args ? 'set_start_time' then execute format('update bookings set start_time = %L where id = %L', p_args->>'set_start_time', v_bk); end if;
    v_res := jsonb_build_object('locked', v_bk);
  elsif p_kind = 'lockticket' then   -- 另一個交易正在使用同一張（共享）票：鎖住票券列，並可把剩餘堂數改成 set_remaining（交易提交前整理端看不到）
    perform 1 from member_tickets where id = v_tk for update;
    if p_args ? 'set_remaining' then execute format('update member_tickets set sessions_remaining = %s where id = %L', (p_args->>'set_remaining')::int, v_tk); end if;
    v_res := jsonb_build_object('locked_ticket', v_tk);
  elsif p_kind = 'desk_deduct' then
    v_res := public.fn_desk_deduct_ticket(v_tk, v_bk, 'cc並行');
  elsif p_kind = 'desk_deduct_bind' then   -- 完整的櫃檯流程：扣堂＋綁票（同一交易，最終狀態一致）
    v_res := public.fn_desk_deduct_ticket(v_tk, v_bk, 'cc並行');
    update bookings set ticket_id = v_tk, pending_contract = false where id = v_bk and ticket_id is null;
  elsif p_kind = 'desk_bind' then   -- 補完「只扣堂、尚未綁票」的中間狀態（只綁票，不扣堂）
    update bookings set ticket_id = v_tk, pending_contract = false where id = v_bk and ticket_id is null;
    v_res := jsonb_build_object('bound', v_bk);
  elsif p_kind = 'desk_cancel' then
    v_res := public.fn_desk_cancel_booking(v_bk);
  else
    return jsonb_build_object('error', 'BAD_KIND');
  end if;
  v_xid := txid_current()::text;
  if p_role = 'holder' then
    v_deadline := clock_timestamp() + (p_poll_ms || ' milliseconds')::interval;
    loop
      v_iter := v_iter + 1;
      perform pg_stat_clear_snapshot();
      select coalesce(jsonb_agg(jsonb_build_object('pid', a.pid, 'application_name', a.application_name, 'wait_event', a.wait_event,
               'waits_on_my_txid', exists (select 1 from pg_locks l where l.pid = a.pid and not l.granted and l.locktype = 'transactionid' and l.transactionid::text = v_xid),
               'waits_on', (select coalesce(jsonb_agg(jsonb_build_object('locktype', l.locktype, 'mode', l.mode, 'relation', l.relation::regclass::text, 'transactionid', l.transactionid::text,
                                                                         'classid', l.classid::text, 'objid', l.objid::text, 'objsubid', l.objsubid::text)), '[]'::jsonb) from pg_locks l where l.pid = a.pid and not l.granted))), '[]'::jsonb),
             count(*)::int
        into v_blocked, v_cnt
        from pg_stat_activity a
       where a.pid <> pg_backend_pid() and a.wait_event_type = 'Lock' and pg_backend_pid() = any (pg_blocking_pids(a.pid));
      if v_cnt >= p_expect_waiters and v_first is null then v_first := clock_timestamp(); end if;
      exit when v_cnt >= p_expect_waiters or clock_timestamp() > v_deadline;
      perform pg_sleep(0.02);
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('classid', l.classid::text, 'objid', l.objid::text, 'objsubid', l.objsubid::text)), '[]'::jsonb) into v_adv
      from pg_locks l where l.pid = pg_backend_pid() and l.locktype = 'advisory' and l.granted;
    if p_extra_hold_ms > 0 then perform pg_sleep(p_extra_hold_ms / 1000.0); end if;   -- 看到對手被擋之後再多握一會兒，讓第三個請求（新增候選）在鎖等待期間送進來
  end if;
  return jsonb_build_object('role', p_role, 'kind', p_kind, 'result', v_res, 'pid', pg_backend_pid(), 'txid', txid_current(), 'start', v_t0, 'end', clock_timestamp(),
                            'poll_iterations', v_iter, 'first_blocked_seen_at', v_first, 'blocked_waiters', v_blocked, 'blocked_count', v_cnt, 'advisory_held', v_adv);
end $fn$;
revoke all on function public.zz_hs_call(text, text, jsonb, int, int, int) from public, anon;
grant execute on function public.zz_hs_call(text, text, jsonb, int, int, int) to authenticated;
notify pgrst, 'reload schema';

-- 指紋核對（唯讀；測試庫專用，執行器在建立任何東西之前先呼叫）：06／08／11 與本函式是否齊備、是不是審查過的版本
create or replace function public.zz_hs_fingerprint() returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $fn$
  select jsonb_build_object(
    'settle_md5', (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)')),
    'adopt_md5',  (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')),
    'state_md5',  (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')),
    'month_md5',  (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')),
    'quota_trigger', exists (select 1 from pg_trigger where tgname = 'trg_tk_quota_guard' and not tgisinternal),
    'desk_deduct', to_regprocedure('public.fn_desk_deduct_ticket(text,text,text,text)') is not null,
    'desk_cancel', to_regprocedure('public.fn_desk_cancel_booking(text,text)') is not null,
    'refund_fn', to_regprocedure('public.fn_refund_ticket(text,text,text)') is not null,
    'settle_acl', (select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)')))
$fn$;
revoke all on function public.zz_hs_fingerprint() from public;
grant execute on function public.zz_hs_fingerprint() to anon, authenticated;
notify pgrst, 'reload schema';
