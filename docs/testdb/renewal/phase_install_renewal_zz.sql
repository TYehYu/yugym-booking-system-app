-- 續約承接並行驗證用的「測試專用」觀測函式（只裝測試庫 kucvxpjatptfckhlxptj；測完用 phase_remove_renewal_zz.sql 移除）。
-- 為什麼需要它：HTTP 的 PostgREST 請求各自是一個交易，但「持鎖者」要能在交易內一邊持有鎖、一邊看到對手被自己擋住，才算真並行證據
-- （與團課取消的 zz_cc_overlap 同一個做法：每圈 pg_stat_clear_snapshot()，用 pid＋阻擋關係判斷，不看 query 文字，並回報被擋者等的 transactionid（判定要求它等於持鎖者的 txid）；交易內標記 application_name 識別本輪案例）。
-- 它只是「呼叫真正的 fn_contract_adopt_holds」再多做觀測；承接本身的行為完全是正式函式的。
-- 安全：只允許測試身分（員工 id 以 CC-EMP- 開頭）、只允許 CC-RN- 開頭的合約；不放寬任何正式函式的逾時或保護。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;

create or replace function public.zz_rn_adopt(p_role text, p_contract text, p_ids text[], p_expect_waiters int default 1, p_poll_ms int default 2000)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_t0 timestamptz := clock_timestamp(); v_t1 timestamptz; v_res jsonb; v_blocked jsonb := '[]'::jsonb;
  v_deadline timestamptz; v_xid text; v_iter int := 0; v_first timestamptz; v_cnt int := 0;
begin
  if coalesce(public.current_employee_id(), '') not like 'CC-EMP-%' or p_contract not like 'CC-RN-%' then
    return jsonb_build_object('error', 'NOT_TEST_IDENTITY'); end if;
  perform set_config('application_name', left('cc:renewadopt:' || p_role || ':' || p_contract, 63), true);   -- 本輪案例識別（交易內有效）
  v_res := public.fn_contract_adopt_holds(p_contract, p_ids, false);
  v_t1 := clock_timestamp(); v_xid := txid_current()::text;
  if p_role = 'holder' then
    v_deadline := clock_timestamp() + (p_poll_ms || ' milliseconds')::interval;
    loop
      v_iter := v_iter + 1;
      perform pg_stat_clear_snapshot();     -- pg_stat_activity 在同一交易內只拍一次快照；不清就永遠看不到後來才被擋住的對手
      select coalesce(jsonb_agg(jsonb_build_object('pid', a.pid, 'application_name', a.application_name, 'wait_event', a.wait_event,
               'waits_on_my_txid', exists (select 1 from pg_locks l where l.pid = a.pid and not l.granted and l.locktype = 'transactionid' and l.transactionid::text = v_xid),
               'waits_on', (select coalesce(jsonb_agg(jsonb_build_object('locktype', l.locktype, 'mode', l.mode, 'relation', l.relation::regclass::text, 'transactionid', l.transactionid::text)), '[]'::jsonb) from pg_locks l where l.pid = a.pid and not l.granted))), '[]'::jsonb),
             count(*)::int
        into v_blocked, v_cnt
        from pg_stat_activity a
       where a.pid <> pg_backend_pid() and a.wait_event_type = 'Lock' and pg_backend_pid() = any (pg_blocking_pids(a.pid));
      if v_cnt >= p_expect_waiters and v_first is null then v_first := clock_timestamp(); end if;
      exit when v_cnt >= p_expect_waiters or clock_timestamp() > v_deadline;
      perform pg_sleep(0.02);
    end loop;
  end if;
  return jsonb_build_object('role', p_role, 'contract', p_contract, 'result', v_res, 'pid', pg_backend_pid(), 'txid', txid_current(),
                            'start', v_t0, 'adopt_done', v_t1, 'end', clock_timestamp(), 'poll_iterations', v_iter, 'first_blocked_seen_at', v_first,
                            'blocked_waiters', v_blocked, 'blocked_count', v_cnt);
end $fn$;
revoke all on function public.zz_rn_adopt(text, text, text[], int, int) from public, anon;
grant execute on function public.zz_rn_adopt(text, text, text[], int, int) to authenticated;
notify pgrst, 'reload schema';
