begin;
DO $$begin if (select system_identifier::text from pg_control_system()) <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end$$;
create function public.fn_hold_settle_new_ticket(
  p_ticket_id text, p_dry boolean default true, p_anchor_booking_id text default null, p_expect jsonb default null)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_emp text; v_t record; v_today date := public.fn_tk_today();
  v_anc bookings%rowtype; v_has_anc boolean := false;
  v_ids0 text[]; v_ids text[]; v_bind text[] := '{}'; v_hold text[] := '{}'; v_cancel text[] := '{}';
  v_avail int; v_locked int; v_sib int; v_inst boolean; v_i int := 0; v_id text; v_net int; v_n int;
  v_plan jsonb; v_ex_b text[]; v_ex_h text[]; v_ex_c text[]; v_done boolean;
  v_tt_restricted boolean; v_rows jsonb; v_sig text; v_tr member_tickets%rowtype; v_out text[] := '{}'; v_wmin date; v_defer text[] := '{}'; v_over text[] := '{}'; v_map text[] := '{}'; v_others text; o member_tickets%rowtype; bd date; j int; v_o_id text[] := '{}'; v_o_cap int[] := '{}'; v_o_lo date[] := '{}'; v_o_hi date[] := '{}'; v_o_vd int[] := '{}'; v_o_un boolean[] := '{}'; v_o_exp date[] := '{}'; v_o_st date[] := '{}'; v_o_act boolean[] := '{}'; v_o_cur int; v_ok boolean;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_ticket_id is null then return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS'); end if;
  if not coalesce(p_dry, true) and p_expect is null then return jsonb_build_object('ok', false, 'error_code', 'EXPECT_REQUIRED'); end if;
  perform set_config('lock_timeout', '3000', true);

  select id, member_id, ticket_type_id into v_t from member_tickets where id = p_ticket_id;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_TICKET'); end if;
  if v_t.member_id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_MEMBER'); end if;
  perform pg_advisory_xact_lock(hashtext('hset:' || v_t.member_id || ':' || coalesce(v_t.ticket_type_id, '')));

  if p_anchor_booking_id is not null then
    select * into v_anc from bookings where id = p_anchor_booking_id;
    v_has_anc := found;
    if not v_has_anc then return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_FOUND'); end if;
  end if;

  -- 第一輪（未鎖）：找候選 id；然後鎖住這些預約列與票券列，鎖後重算一次（讀已提交的最新狀態）
  for v_n in 1..2 loop
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_ids
      from bookings b, member_tickets mt
     where mt.id = p_ticket_id
       and b.status::text = 'booked' and b.pending_contract is true and b.ticket_id is null and b.contract_id is null
       and b.checked_in_at is null and b.date >= v_today
       and b.ticket_type_id is not distinct from mt.ticket_type_id and mt.ticket_type_id is not null
       and b.category::text <> '小班肌力' and b.sibling_of is null
       and coalesce(jsonb_array_length(case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids end), 0) = 0
       and coalesce(b.note, '') not like '%分期待繳費保留%'
       and ( b.member_id = mt.member_id
             or ( v_has_anc and v_anc.member_id is null and b.member_id is null
                  and (v_anc.trial_name is not null or v_anc.trial_phone is not null)
                  and b.trial_name is not distinct from v_anc.trial_name and b.trial_phone is not distinct from v_anc.trial_phone ) )
       and mt.status::text = 'usable'
       and (mt.expire_date is null or mt.expire_date >= b.date)
       and not (mt.start_date is not null and mt.start_date > b.date and mt.activated_at is null)
       and ( not coalesce((select tt.time_restricted from ticket_types tt where tt.id = mt.ticket_type_id), false)
             or ( extract(isodow from b.date) between 1 and 5
                  and (b.start_time::time + make_interval(mins => coalesce(b.duration, 60))) <= time '18:00'
                  and b.start_time::time + make_interval(mins => coalesce(b.duration, 60)) > b.start_time::time ) );
    if v_n = 1 then
      v_ids0 := v_ids;
      perform 1 from bookings where id = any (v_ids0) order by id for update;
      perform 1 from member_tickets where ticket_type_id is not distinct from v_t.ticket_type_id and (id = p_ticket_id or (status::text = 'usable' and (member_id = v_t.member_id or shared_with is not null))) order by id for update;   -- 本票與同票種的其他可用票券一起鎖（依 id）：自己名下的，加上「別人名下有共享名單的」（先多鎖、不呼叫判定函式；是否真的共享給這位會員由下面判定）
    end if;
  end loop;
  -- 鎖後重找若多出沒鎖到的候選：安全停止，請重新預覽（不處理沒鎖住的預約）
  if exists (select 1 from unnest(v_ids) x where not (x = any (v_ids0))) then
    return jsonb_build_object('ok', false, 'error_code', 'CANDIDATES_CHANGED');
  end if;
  -- 鎖後狀態（票券可能剛被扣／退）
  select id, member_id, ticket_type_id, status, sessions_total, sessions_remaining, unlocked_sessions, installment, payment_status
    into v_t from member_tickets where id = p_ticket_id;
  if v_t.status::text <> 'usable' and coalesce(array_length(v_ids, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'TICKET_NOT_USABLE', 'status', v_t.status::text);
  end if;
  -- 效期窗口（階段 tkwin）：尚未啟用的票，預約日期需落在「最早一堂起 valid_days 天」內，否則轉正會被資料庫擋下。
  --   超出窗口的卡位不轉正、不取消（不動），預覽會標示；不佔用票券堂數。
  select * into v_tr from member_tickets where id = p_ticket_id;
  if coalesce(array_length(v_ids, 1), 0) > 0 and coalesce(v_tr.valid_days, 0) > 0 and public.fn_tk_is_unopened(v_tr) then
    select least(coalesce((select min(h.bdate) from public.fn_tk_holding(p_ticket_id, null) h), date '9999-12-31'),
                 (select min(b.date) from bookings b where b.id = any (v_ids))) into v_wmin;
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_out from bookings b where b.id = any (v_ids) and b.date > v_wmin + (v_tr.valid_days - 1);
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_ids from bookings b where b.id = any (v_ids) and not (b.id = any (v_out));
  end if;
  if coalesce(p_dry, true) and v_has_anc and not (p_anchor_booking_id = any (v_ids)) then   -- 執行階段不查（重送時那筆已轉正），由 p_expect 比對把關
    return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_ELIGIBLE');
  end if;

  v_inst := v_t.installment is not null and jsonb_typeof(to_jsonb(v_t.installment)) = 'object';
  v_avail := case when v_inst
      then greatest(0, least(coalesce(v_t.sessions_remaining, 0),
             coalesce(v_t.unlocked_sessions, coalesce(v_t.sessions_total, 0)) - greatest(0, coalesce(v_t.sessions_total, 0) - coalesce(v_t.sessions_remaining, 0))))
      else greatest(0, coalesce(v_t.sessions_remaining, 0)) end;
  v_locked := case when v_inst then greatest(0, coalesce(v_t.sessions_total, 0) - coalesce(v_t.unlocked_sessions, coalesce(v_t.sessions_total, 0))) else 0 end;
  select count(*) into v_sib from bookings b
   where b.member_id = v_t.member_id and b.ticket_type_id is not distinct from v_t.ticket_type_id and b.status::text = 'booked'
     and b.pending_contract is true and b.ticket_id is null and b.date >= v_today and coalesce(b.note, '') like '%分期待繳費保留%';

  -- 超額卡位逐筆核對「同會員同票種的其他可用票券」能不能承接（rev5）：
  --   每張其他票：狀態可用、已開通可約堂數（扣掉已被本次分配的）、起始日、效期涵蓋上課日、尚未啟用票的有效天數窗口（連既有占用一起算）。
  --   堂數逐筆遞減，同一堂數不會重複分配；由近到遠、每筆交給「最早到期」的合格票。分配不到＝真的超額，取消。
  --   票券資料本身無法判讀（分期票缺已開通堂數）→ 無法確認，整批停止（UNVERIFIABLE_OTHER），不猜、不取消。
  -- 共享名單判讀（rev6）：別人名下、同票種、「可用（usable）」且有 shared_with 的票（已不可用的票本來就不會被拿來承接，名單異常也不影響這次判定，不擋）；名單不是「字串陣列」（或字串化的字串陣列）＝無法確認這位會員能不能用 → 整批停止，不猜、不取消。
  for o in select * from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and t.member_id is distinct from v_t.member_id and t.status::text = 'usable' and t.shared_with is not null order by t.id loop
    begin
      v_ok := case when jsonb_typeof(o.shared_with) = 'null' then true
        when jsonb_typeof(o.shared_with) = 'array' then not exists (select 1 from jsonb_array_elements(o.shared_with) e where jsonb_typeof(e) <> 'string')
        when jsonb_typeof(o.shared_with) = 'string' and (o.shared_with #>> '{}') ~ '^\s*\[' then (jsonb_typeof((o.shared_with #>> '{}')::jsonb) = 'array' and not exists (select 1 from jsonb_array_elements((o.shared_with #>> '{}')::jsonb) e where jsonb_typeof(e) <> 'string'))
        else false end;
    exception when others then v_ok := false;
    end;
    if not coalesce(v_ok, false) then return jsonb_build_object('ok', false, 'error_code', 'UNVERIFIABLE_OTHER', 'ticket_id', o.id, 'reason', 'SHARED_UNREADABLE'); end if;
  end loop;
  for o in select * from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and t.status::text = 'usable' and (t.member_id = v_t.member_id or public.fn_tk_shared_has(to_jsonb(t.shared_with), v_t.member_id)) order by t.expire_date nulls last, t.id loop
    if o.installment is not null and jsonb_typeof(to_jsonb(o.installment)) = 'object' and o.unlocked_sessions is null then
      return jsonb_build_object('ok', false, 'error_code', 'UNVERIFIABLE_OTHER', 'ticket_id', o.id);
    end if;
    v_o_cur := case when o.installment is not null and jsonb_typeof(to_jsonb(o.installment)) = 'object'
        then greatest(0, least(coalesce(o.sessions_remaining, 0), coalesce(o.unlocked_sessions, 0) - greatest(0, coalesce(o.sessions_total, 0) - coalesce(o.sessions_remaining, 0))))
        else greatest(0, coalesce(o.sessions_remaining, 0)) end;
    if v_o_cur > 0 then
      v_o_id := v_o_id || o.id; v_o_cap := v_o_cap || v_o_cur; v_o_exp := v_o_exp || o.expire_date; v_o_st := v_o_st || o.start_date; v_o_act := v_o_act || (o.activated_at is null);
      v_o_un := v_o_un || (coalesce(o.valid_days, 0) > 0 and public.fn_tk_is_unopened(o));
      v_o_vd := v_o_vd || coalesce(o.valid_days, 0);
      select min(h.bdate), max(h.bdate) into v_wmin, bd from public.fn_tk_holding(o.id, null) h;
      v_o_lo := v_o_lo || v_wmin; v_o_hi := v_o_hi || bd;
    end if;
  end loop;
  foreach v_id in array v_ids loop
    v_i := v_i + 1;
    if v_i <= v_avail then v_bind := v_bind || v_id;
    elsif v_locked > 0 and v_sib = 0 and v_i <= v_avail + v_locked then v_hold := v_hold || v_id;
    else v_over := v_over || v_id; end if;
  end loop;
  foreach v_id in array v_over loop
    select b.date into bd from bookings b where b.id = v_id;
    j := 0;
    for v_n in 1..coalesce(array_length(v_o_id, 1), 0) loop
      if v_o_cap[v_n] > 0
         and (v_o_exp[v_n] is null or v_o_exp[v_n] >= bd)
         and not (v_o_st[v_n] is not null and v_o_st[v_n] > bd and v_o_act[v_n])
         and (not v_o_un[v_n] or (greatest(coalesce(v_o_hi[v_n], bd), bd) - least(coalesce(v_o_lo[v_n], bd), bd)) <= v_o_vd[v_n] - 1) then
        j := v_n; exit;
      end if;
    end loop;
    if j > 0 then
      v_o_cap[j] := v_o_cap[j] - 1; v_o_lo[j] := least(coalesce(v_o_lo[j], bd), bd); v_o_hi[j] := greatest(coalesce(v_o_hi[j], bd), bd);
      v_defer := v_defer || v_id; v_map := v_map || (v_id || '>' || v_o_id[j]);
    else v_cancel := v_cancel || v_id; end if;
  end loop;
  select string_agg(concat_ws(',', t.id, t.member_id, t.shared_with::text, t.status::text, t.sessions_total, t.sessions_remaining, t.unlocked_sessions, t.installment::text, t.expire_date, t.start_date, t.activated_at::text, t.valid_days), '|' order by t.id) into v_others
    from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and (t.member_id = v_t.member_id or (t.status::text = 'usable' and public.fn_tk_shared_has(to_jsonb(t.shared_with), v_t.member_id)));

  if coalesce(array_length(v_cancel, 1), 0) > 0 and v_locked > 0 and v_sib > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'INST_AMBIGUOUS', 'locked', v_locked, 'inst_holds', v_sib);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'date', b.date, 'start_time', b.start_time, 'category', b.category::text,
           'kind', case when b.id = any (v_bind) then 'bind' when b.id = any (v_hold) then 'hold' when b.id = any (v_out) then 'skip' when b.id = any (v_defer) then 'defer' else 'cancel' end,
           'to', (select split_part(m, '>', 2) from unnest(v_map) m where split_part(m, '>', 1) = b.id))
           order by b.date, b.start_time, b.id), '[]'::jsonb) into v_rows
    from bookings b where b.id = any (v_ids) or b.id = any (v_out);
  if v_has_anc then select * into v_anc from bookings where id = p_anchor_booking_id; end if;
  v_sig := md5(
      coalesce((select string_agg(b.id || ':' || md5(to_jsonb(b)::text), '|' order by b.date, b.start_time, b.id) from bookings b where b.id = any (v_ids) or b.id = any (v_out)), '')
      || '#' || coalesce((select concat_ws(',', mt.id, mt.member_id, mt.ticket_type_id, mt.status::text, mt.sessions_total, mt.sessions_remaining, mt.unlocked_sessions, mt.installment::text, mt.expire_date, mt.start_date, mt.activated_at::text)
                           from member_tickets mt where mt.id = p_ticket_id), '')
      || '#' || v_avail || ',' || v_locked || ',' || v_sib
      || '#' || array_to_string(v_bind, ',') || '/' || array_to_string(v_hold, ',') || '/' || array_to_string(v_cancel, ',') || '/' || array_to_string(v_out, ',') || '/' || array_to_string(v_defer, ',') || '/' || array_to_string(v_map, ',') || '#' || coalesce(v_others, '')
      || '#' || case when v_has_anc then md5(to_jsonb(v_anc)::text) else '' end);
  v_plan := jsonb_build_object('bind', to_jsonb(v_bind), 'hold', to_jsonb(v_hold), 'cancel', to_jsonb(v_cancel), 'skip', to_jsonb(v_out), 'defer', to_jsonb(v_defer), 'sig', v_sig);

  if coalesce(p_dry, true) then
    return jsonb_build_object('ok', true, 'dry', true, 'plan', v_plan, 'rows', v_rows, 'avail', v_avail, 'locked', v_locked,
                              'inst_holds', v_sib, 'ticket_name', (select plan_name from member_tickets where id = p_ticket_id));
  end if;

  -- 執行：先比對確認畫面的清單
  select coalesce(array_agg(x order by x), '{}') into v_ex_b from jsonb_array_elements_text(coalesce(p_expect->'bind', '[]'::jsonb)) x;
  select coalesce(array_agg(x order by x), '{}') into v_ex_h from jsonb_array_elements_text(coalesce(p_expect->'hold', '[]'::jsonb)) x;
  select coalesce(array_agg(x order by x), '{}') into v_ex_c from jsonb_array_elements_text(coalesce(p_expect->'cancel', '[]'::jsonb)) x;
  if p_expect->>'sig' is null then return jsonb_build_object('ok', false, 'error_code', 'EXPECT_REQUIRED'); end if;
  if p_expect->>'sig' is distinct from v_sig
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_bind) x) is distinct from v_ex_b
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_hold) x) is distinct from v_ex_h
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_cancel) x) is distinct from v_ex_c then
    -- 不一致：若確認的那批已經全部是最終狀態＝重送，回 already；否則 PLAN_CHANGED（不做任何事）
    select (not exists (select 1 from unnest(v_ex_b) i where not exists (select 1 from bookings where id = i and ticket_id = p_ticket_id))
        and not exists (select 1 from unnest(v_ex_h) i where not exists (select 1 from bookings where id = i and status::text = 'booked' and ticket_id is null and coalesce(note, '') like '%分期待繳費保留%'))
        and not exists (select 1 from unnest(v_ex_c) i where not exists (select 1 from bookings where id = i and status::text = 'cancelled' and coalesce(cancel_reason, '') like '新票轉正整理%')))
      and (coalesce(array_length(v_ex_b, 1), 0) + coalesce(array_length(v_ex_h, 1), 0) + coalesce(array_length(v_ex_c, 1), 0)) > 0
      into v_done;
    if v_done then return jsonb_build_object('ok', true, 'already', true, 'plan', v_plan); end if;
    return jsonb_build_object('ok', false, 'error_code', 'PLAN_CHANGED', 'plan', v_plan, 'rows', v_rows);
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', true, 'already', true, 'plan', v_plan); end if;   -- 清單為空且 sig 相符＝沒有東西可做

  -- ① 轉正：逐堂 鎖定已完成，扣 1 堂、寫帳、綁票（任何一步失敗＝整個交易回滾）
  foreach v_id in array v_bind loop
    select coalesce(sum(case when action::text = 'deduct' and coalesce(delta, 0) <> 0 then 1 when action::text = 'refund' then -1 else 0 end), 0)
      into v_net from ticket_logs where ticket_id = p_ticket_id and booking_id = v_id;
    if v_net > 0 then raise exception 'SETTLE.ALREADY_DEDUCTED:%', v_id; end if;
    update member_tickets set sessions_remaining = sessions_remaining - 1 where id = p_ticket_id and sessions_remaining > 0;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.NO_REMAINING:%', v_id; end if;
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-' || replace(gen_random_uuid()::text, '-', ''), p_ticket_id, 'deduct', -1, v_id, v_emp, '預約扣課（新票轉正整理）', now());
    update bookings set member_id = v_t.member_id, ticket_id = p_ticket_id, ticket_type_id = coalesce(v_t.ticket_type_id, ticket_type_id),
           pending_contract = false, trial_name = null, trial_phone = null
     where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.BIND_ROWCOUNT:%', v_id; end if;
  end loop;
  -- ② 合約內尚未繳費開通的分期堂數：留成分期待繳費保留（不扣、不取消）
  foreach v_id in array v_hold loop
    update bookings set member_id = v_t.member_id, trial_name = null, trial_phone = null, note = '分期待繳費保留（收款後自動補扣）'
     where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.HOLD_ROWCOUNT:%', v_id; end if;
  end loop;
  -- ③ 真正超出合約總堂數：取消（保留紀錄，不刪除）
  foreach v_id in array v_cancel loop
    update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = v_emp,
           cancel_reason = '新票轉正整理：超出票券堂數，卡位自動取消',
           note = case when coalesce(note, '') = '' then '超出票券堂數，轉正整理時自動取消' else note || '｜超出票券堂數，轉正整理時自動取消' end
     where id = v_id and status::text = 'booked' and ticket_id is null;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.CANCEL_ROWCOUNT:%', v_id; end if;
  end loop;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
  values ('LG-' || replace(gen_random_uuid()::text, '-', ''), p_ticket_id, 'adjust', 0, null, v_emp,
          '新票轉正整理：轉正 ' || coalesce(array_length(v_bind, 1), 0) || ' 堂、分期保留 ' || coalesce(array_length(v_hold, 1), 0)
          || ' 堂、取消 ' || coalesce(array_length(v_cancel, 1), 0) || ' 堂', now());
  return jsonb_build_object('ok', true, 'bound', to_jsonb(v_bind), 'held', to_jsonb(v_hold), 'cancelled', to_jsonb(v_cancel),
                            'remaining', (select sessions_remaining from member_tickets where id = p_ticket_id));
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY');
  when others then
    -- 本區塊內的所有寫入都已回滾；回傳失敗，前端不得再做任何取消
    return jsonb_build_object('ok', false, 'error_code', 'SETTLE.FAILED', 'detail', sqlerrm);
end
$fn$;
create temp table ch_results(t text,pass boolean,detail jsonb);
create function pg_temp.mkbk(p_id text, p_mem text, p_type text, p_cat text, p_date date, p_time text, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(b) into t from bookings b where b.status::text='booked' limit 1;
  insert into bookings select * from jsonb_populate_record(null::bookings, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_id',null,'ticket_type_id',p_type,'category',p_cat,
    'pending_contract',true,'date',p_date,'start_time',p_time,'status','booked','contract_id',null,'checked_in_at',null,'note',null,'member_ids','[]'::jsonb,'sibling_of',null,
    'trial_name',null,'trial_phone',null,'seat_tickets',null,'attendance',null,'cancelled_at',null,'cancelled_by',null,'cancel_reason',null,'recurring',false,'duration',60,'coach_id',null) || p_x);
end $$;
create function pg_temp.mktk(p_id text, p_mem text, p_type text, p_total int, p_rem int, p_inst jsonb, p_unl int, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(m) into t from member_tickets m limit 1;
  insert into member_tickets select * from jsonb_populate_record(null::member_tickets, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_type_id',p_type,'status','usable',
    'sessions_total',p_total,'sessions_remaining',p_rem,'installment',p_inst,'unlocked_sessions',p_unl,'expire_date',null,'start_date',null,'activated_at',null,'shared_with',null,'payment_status','paid','plan_name','ZZ測試票') || p_x);
end $$;

do $test$
declare adm record; tt record; m text; m2 text; d date:=fn_tk_today(); r jsonb; i int;
begin
 select id,auth_id into adm from employees where role::text='admin' and auth_id is not null limit 1;
 select id,category::text cat into tt from ticket_types where category::text='私人教練' and not coalesce(time_restricted,false) limit 1;
 select id into m from members order by id limit 1;select id into m2 from members where id<>m order by id limit 1;
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claims','{}',true);
 perform pg_temp.mktk('CC-CH-T',m,tt.id,12,12,'{"count":2,"current":1,"paid":[true,false]}'::jsonb,6,jsonb_build_object('valid_days',365));
 insert into contracts(id,member_id,sign_type,ticket_id,sessions,ticket_type_id) values ('CC-CH-C',m,'paper','CC-CH-T',12,tt.id);
 insert into contracts(id,member_id,sign_type,sessions,ticket_type_id) values ('CC-CH-OTHER',m,'paper',12,tt.id);
 for i in 1..14 loop perform pg_temp.mkbk('CC-CH-B'||lpad(i::text,2,'0'),m,tt.id,tt.cat,d+i,'13:00',jsonb_build_object('contract_id','CC-CH-C'));end loop;
 perform pg_temp.mkbk('CC-CH-OTHER-B',m,tt.id,tt.cat,d+20,'13:00',jsonb_build_object('contract_id','CC-CH-OTHER'));
 perform set_config('request.jwt.claims',json_build_object('sub',adm.auth_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',adm.auth_id::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 r:=fn_hold_settle_new_ticket('CC-CH-T',true,'CC-CH-B01');
 insert into ch_results values('old_reproduces_contract_exclusion',r->>'error_code'='ANCHOR_NOT_ELIGIBLE',r);
end $test$;
-- 候選修正，尚未發布。替換既有函式，保留原簽名與權限。
create or replace function public.fn_hold_settle_new_ticket(
  p_ticket_id text, p_dry boolean default true, p_anchor_booking_id text default null, p_expect jsonb default null)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_own_sib int := 0; v_contract_sig text; v_emp text; v_t record; v_today date := public.fn_tk_today();
  v_anc bookings%rowtype; v_has_anc boolean := false;
  v_ids0 text[]; v_ids text[]; v_bind text[] := '{}'; v_hold text[] := '{}'; v_cancel text[] := '{}';
  v_avail int; v_locked int; v_sib int; v_inst boolean; v_i int := 0; v_id text; v_net int; v_n int;
  v_plan jsonb; v_ex_b text[]; v_ex_h text[]; v_ex_c text[]; v_done boolean;
  v_tt_restricted boolean; v_rows jsonb; v_sig text; v_tr member_tickets%rowtype; v_out text[] := '{}'; v_wmin date; v_defer text[] := '{}'; v_over text[] := '{}'; v_map text[] := '{}'; v_others text; o member_tickets%rowtype; bd date; j int; v_o_id text[] := '{}'; v_o_cap int[] := '{}'; v_o_lo date[] := '{}'; v_o_hi date[] := '{}'; v_o_vd int[] := '{}'; v_o_un boolean[] := '{}'; v_o_exp date[] := '{}'; v_o_st date[] := '{}'; v_o_act boolean[] := '{}'; v_o_cur int; v_ok boolean;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF'); end if;
  if not coalesce(is_staff_desk(), false) then return jsonb_build_object('ok', false, 'error_code', 'NOT_DESK'); end if;
  if p_ticket_id is null then return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS'); end if;
  if not coalesce(p_dry, true) and p_expect is null then return jsonb_build_object('ok', false, 'error_code', 'EXPECT_REQUIRED'); end if;
  perform set_config('lock_timeout', '3000', true);

  select id, member_id, ticket_type_id into v_t from member_tickets where id = p_ticket_id;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_TICKET'); end if;
  if v_t.member_id is null then return jsonb_build_object('ok', false, 'error_code', 'NO_MEMBER'); end if;
  perform pg_advisory_xact_lock(hashtext('hset:' || v_t.member_id || ':' || coalesce(v_t.ticket_type_id, '')));

  -- 合約先鎖定，再鎖預約、票券；只允許這份合約實際發出的票承接。
  perform 1 from contracts c where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id order by c.id for update;
  select string_agg(c.id || ':' || md5(to_jsonb(c)::text), '|' order by c.id) into v_contract_sig
    from contracts c where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id;

  if p_anchor_booking_id is not null then
    select * into v_anc from bookings where id = p_anchor_booking_id;
    v_has_anc := found;
    if not v_has_anc then return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_FOUND'); end if;
  end if;

  -- 第一輪（未鎖）：找候選 id；然後鎖住這些預約列與票券列，鎖後重算一次（讀已提交的最新狀態）
  for v_n in 1..2 loop
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_ids
      from bookings b, member_tickets mt
     where mt.id = p_ticket_id
       and b.status::text = 'booked' and b.pending_contract is true and b.ticket_id is null
       and (b.contract_id is null or exists (select 1 from contracts c
         where c.id = b.contract_id and c.ticket_id = mt.id and c.member_id = mt.member_id))
       and b.checked_in_at is null and b.date >= v_today
       and b.ticket_type_id is not distinct from mt.ticket_type_id and mt.ticket_type_id is not null
       and b.category::text <> '小班肌力' and b.sibling_of is null
       and coalesce(jsonb_array_length(case when jsonb_typeof(b.member_ids) = 'array' then b.member_ids end), 0) = 0
       and coalesce(b.note, '') not like '%分期待繳費保留%'
       and ( b.member_id = mt.member_id
             or ( v_has_anc and v_anc.member_id is null and b.member_id is null
                  and (v_anc.trial_name is not null or v_anc.trial_phone is not null)
                  and b.trial_name is not distinct from v_anc.trial_name and b.trial_phone is not distinct from v_anc.trial_phone ) )
       and mt.status::text = 'usable'
       and (mt.expire_date is null or mt.expire_date >= b.date)
       and not (mt.start_date is not null and mt.start_date > b.date and mt.activated_at is null)
       and ( not coalesce((select tt.time_restricted from ticket_types tt where tt.id = mt.ticket_type_id), false)
             or ( extract(isodow from b.date) between 1 and 5
                  and (b.start_time::time + make_interval(mins => coalesce(b.duration, 60))) <= time '18:00'
                  and b.start_time::time + make_interval(mins => coalesce(b.duration, 60)) > b.start_time::time ) );
    if v_n = 1 then
      v_ids0 := v_ids;
      perform 1 from bookings where id = any (v_ids0) order by id for update;
      perform 1 from member_tickets where ticket_type_id is not distinct from v_t.ticket_type_id and (id = p_ticket_id or (status::text = 'usable' and (member_id = v_t.member_id or shared_with is not null))) order by id for update;   -- 本票與同票種的其他可用票券一起鎖（依 id）：自己名下的，加上「別人名下有共享名單的」（先多鎖、不呼叫判定函式；是否真的共享給這位會員由下面判定）
    end if;
  end loop;
  -- 鎖後重找若多出沒鎖到的候選：安全停止，請重新預覽（不處理沒鎖住的預約）
  if exists (select 1 from unnest(v_ids) x where not (x = any (v_ids0))) then
    return jsonb_build_object('ok', false, 'error_code', 'CANDIDATES_CHANGED');
  end if;
  -- 鎖後狀態（票券可能剛被扣／退）
  select id, member_id, ticket_type_id, status, sessions_total, sessions_remaining, unlocked_sessions, installment, payment_status
    into v_t from member_tickets where id = p_ticket_id;
  if v_t.status::text <> 'usable' and coalesce(array_length(v_ids, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'TICKET_NOT_USABLE', 'status', v_t.status::text);
  end if;
  -- 效期窗口（階段 tkwin）：尚未啟用的票，預約日期需落在「最早一堂起 valid_days 天」內，否則轉正會被資料庫擋下。
  --   超出窗口的卡位不轉正、不取消（不動），預覽會標示；不佔用票券堂數。
  select * into v_tr from member_tickets where id = p_ticket_id;
  if coalesce(array_length(v_ids, 1), 0) > 0 and coalesce(v_tr.valid_days, 0) > 0 and public.fn_tk_is_unopened(v_tr) then
    select least(coalesce((select min(h.bdate) from public.fn_tk_holding(p_ticket_id, null) h), date '9999-12-31'),
                 (select min(b.date) from bookings b where b.id = any (v_ids))) into v_wmin;
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_out from bookings b where b.id = any (v_ids) and b.date > v_wmin + (v_tr.valid_days - 1);
    select coalesce(array_agg(b.id order by b.date, b.start_time, b.id), '{}') into v_ids from bookings b where b.id = any (v_ids) and not (b.id = any (v_out));
  end if;
  if coalesce(p_dry, true) and v_has_anc and not (p_anchor_booking_id = any (v_ids)) then   -- 執行階段不查（重送時那筆已轉正），由 p_expect 比對把關
    return jsonb_build_object('ok', false, 'error_code', 'ANCHOR_NOT_ELIGIBLE');
  end if;

  v_inst := v_t.installment is not null and jsonb_typeof(to_jsonb(v_t.installment)) = 'object';
  v_avail := case when v_inst
      then greatest(0, least(coalesce(v_t.sessions_remaining, 0),
             coalesce(v_t.unlocked_sessions, coalesce(v_t.sessions_total, 0)) - greatest(0, coalesce(v_t.sessions_total, 0) - coalesce(v_t.sessions_remaining, 0))))
      else greatest(0, coalesce(v_t.sessions_remaining, 0)) end;
  v_locked := case when v_inst then greatest(0, coalesce(v_t.sessions_total, 0) - coalesce(v_t.unlocked_sessions, coalesce(v_t.sessions_total, 0))) else 0 end;
  select count(*) into v_sib from bookings b
   where b.member_id = v_t.member_id and b.ticket_type_id is not distinct from v_t.ticket_type_id and b.status::text = 'booked'
     and b.pending_contract is true and b.ticket_id is null and b.date >= v_today and coalesce(b.note, '') like '%分期待繳費保留%';

  -- 本合約既有的分期保留已占用未開通額度，不能再次分配。
  select count(*) into v_own_sib from bookings b join contracts c on c.id = b.contract_id
   where c.ticket_id = p_ticket_id and c.member_id = v_t.member_id and b.member_id = v_t.member_id
     and b.ticket_type_id is not distinct from v_t.ticket_type_id and b.status::text = 'booked'
     and b.pending_contract is true and b.ticket_id is null and b.date >= v_today
     and coalesce(b.note, '') like '%分期待繳費保留%';
  if v_own_sib > v_locked then return jsonb_build_object('ok', false, 'error_code', 'INST_AMBIGUOUS'); end if;
  v_locked := greatest(0, v_locked - v_own_sib);
  v_sib := greatest(0, v_sib - v_own_sib);

  -- 超額卡位逐筆核對「同會員同票種的其他可用票券」能不能承接（rev5）：
  --   每張其他票：狀態可用、已開通可約堂數（扣掉已被本次分配的）、起始日、效期涵蓋上課日、尚未啟用票的有效天數窗口（連既有占用一起算）。
  --   堂數逐筆遞減，同一堂數不會重複分配；由近到遠、每筆交給「最早到期」的合格票。分配不到＝真的超額，取消。
  --   票券資料本身無法判讀（分期票缺已開通堂數）→ 無法確認，整批停止（UNVERIFIABLE_OTHER），不猜、不取消。
  -- 共享名單判讀（rev6）：別人名下、同票種、「可用（usable）」且有 shared_with 的票（已不可用的票本來就不會被拿來承接，名單異常也不影響這次判定，不擋）；名單不是「字串陣列」（或字串化的字串陣列）＝無法確認這位會員能不能用 → 整批停止，不猜、不取消。
  for o in select * from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and t.member_id is distinct from v_t.member_id and t.status::text = 'usable' and t.shared_with is not null order by t.id loop
    begin
      v_ok := case when jsonb_typeof(o.shared_with) = 'null' then true
        when jsonb_typeof(o.shared_with) = 'array' then not exists (select 1 from jsonb_array_elements(o.shared_with) e where jsonb_typeof(e) <> 'string')
        when jsonb_typeof(o.shared_with) = 'string' and (o.shared_with #>> '{}') ~ '^\s*\[' then (jsonb_typeof((o.shared_with #>> '{}')::jsonb) = 'array' and not exists (select 1 from jsonb_array_elements((o.shared_with #>> '{}')::jsonb) e where jsonb_typeof(e) <> 'string'))
        else false end;
    exception when others then v_ok := false;
    end;
    if not coalesce(v_ok, false) then return jsonb_build_object('ok', false, 'error_code', 'UNVERIFIABLE_OTHER', 'ticket_id', o.id, 'reason', 'SHARED_UNREADABLE'); end if;
  end loop;
  for o in select * from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and t.status::text = 'usable' and (t.member_id = v_t.member_id or public.fn_tk_shared_has(to_jsonb(t.shared_with), v_t.member_id)) order by t.expire_date nulls last, t.id loop
    if o.installment is not null and jsonb_typeof(to_jsonb(o.installment)) = 'object' and o.unlocked_sessions is null then
      return jsonb_build_object('ok', false, 'error_code', 'UNVERIFIABLE_OTHER', 'ticket_id', o.id);
    end if;
    v_o_cur := case when o.installment is not null and jsonb_typeof(to_jsonb(o.installment)) = 'object'
        then greatest(0, least(coalesce(o.sessions_remaining, 0), coalesce(o.unlocked_sessions, 0) - greatest(0, coalesce(o.sessions_total, 0) - coalesce(o.sessions_remaining, 0))))
        else greatest(0, coalesce(o.sessions_remaining, 0)) end;
    if v_o_cur > 0 then
      v_o_id := v_o_id || o.id; v_o_cap := v_o_cap || v_o_cur; v_o_exp := v_o_exp || o.expire_date; v_o_st := v_o_st || o.start_date; v_o_act := v_o_act || (o.activated_at is null);
      v_o_un := v_o_un || (coalesce(o.valid_days, 0) > 0 and public.fn_tk_is_unopened(o));
      v_o_vd := v_o_vd || coalesce(o.valid_days, 0);
      select min(h.bdate), max(h.bdate) into v_wmin, bd from public.fn_tk_holding(o.id, null) h;
      v_o_lo := v_o_lo || v_wmin; v_o_hi := v_o_hi || bd;
    end if;
  end loop;
  foreach v_id in array v_ids loop
    v_i := v_i + 1;
    if v_i <= v_avail then v_bind := v_bind || v_id;
    elsif v_locked > 0 and v_sib = 0 and v_i <= v_avail + v_locked then v_hold := v_hold || v_id;
    else v_over := v_over || v_id; end if;
  end loop;
  foreach v_id in array v_over loop
    -- 已歸屬本合約的超額卡位直接取消，不延到其他票券或下一份合約。
    if exists (select 1 from bookings b where b.id = v_id and b.contract_id is not null) then
      v_cancel := v_cancel || v_id; continue;
    end if;
    select b.date into bd from bookings b where b.id = v_id;
    j := 0;
    for v_n in 1..coalesce(array_length(v_o_id, 1), 0) loop
      if v_o_cap[v_n] > 0
         and (v_o_exp[v_n] is null or v_o_exp[v_n] >= bd)
         and not (v_o_st[v_n] is not null and v_o_st[v_n] > bd and v_o_act[v_n])
         and (not v_o_un[v_n] or (greatest(coalesce(v_o_hi[v_n], bd), bd) - least(coalesce(v_o_lo[v_n], bd), bd)) <= v_o_vd[v_n] - 1) then
        j := v_n; exit;
      end if;
    end loop;
    if j > 0 then
      v_o_cap[j] := v_o_cap[j] - 1; v_o_lo[j] := least(coalesce(v_o_lo[j], bd), bd); v_o_hi[j] := greatest(coalesce(v_o_hi[j], bd), bd);
      v_defer := v_defer || v_id; v_map := v_map || (v_id || '>' || v_o_id[j]);
    else v_cancel := v_cancel || v_id; end if;
  end loop;
  select string_agg(concat_ws(',', t.id, t.member_id, t.shared_with::text, t.status::text, t.sessions_total, t.sessions_remaining, t.unlocked_sessions, t.installment::text, t.expire_date, t.start_date, t.activated_at::text, t.valid_days), '|' order by t.id) into v_others
    from member_tickets t where t.id <> p_ticket_id and t.ticket_type_id is not distinct from v_t.ticket_type_id and (t.member_id = v_t.member_id or (t.status::text = 'usable' and public.fn_tk_shared_has(to_jsonb(t.shared_with), v_t.member_id)));

  if coalesce(array_length(v_cancel, 1), 0) > 0 and v_locked > 0 and v_sib > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'INST_AMBIGUOUS', 'locked', v_locked, 'inst_holds', v_sib);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'date', b.date, 'start_time', b.start_time, 'category', b.category::text,
           'kind', case when b.id = any (v_bind) then 'bind' when b.id = any (v_hold) then 'hold' when b.id = any (v_out) then 'skip' when b.id = any (v_defer) then 'defer' else 'cancel' end,
           'to', (select split_part(m, '>', 2) from unnest(v_map) m where split_part(m, '>', 1) = b.id))
           order by b.date, b.start_time, b.id), '[]'::jsonb) into v_rows
    from bookings b where b.id = any (v_ids) or b.id = any (v_out);
  if v_has_anc then select * into v_anc from bookings where id = p_anchor_booking_id; end if;
  v_sig := md5(
      coalesce((select string_agg(b.id || ':' || md5(to_jsonb(b)::text), '|' order by b.date, b.start_time, b.id) from bookings b where b.id = any (v_ids) or b.id = any (v_out)), '')
      || '#' || coalesce((select concat_ws(',', mt.id, mt.member_id, mt.ticket_type_id, mt.status::text, mt.sessions_total, mt.sessions_remaining, mt.unlocked_sessions, mt.installment::text, mt.expire_date, mt.start_date, mt.activated_at::text)
                           from member_tickets mt where mt.id = p_ticket_id), '')
      || '#' || v_avail || ',' || v_locked || ',' || v_sib
      || '#' || array_to_string(v_bind, ',') || '/' || array_to_string(v_hold, ',') || '/' || array_to_string(v_cancel, ',') || '/' || array_to_string(v_out, ',') || '/' || array_to_string(v_defer, ',') || '/' || array_to_string(v_map, ',') || '#' || coalesce(v_others, '')
      || '#' || coalesce(v_contract_sig, '') || ':' || v_own_sib
      || '#' || case when v_has_anc then md5(to_jsonb(v_anc)::text) else '' end);
  v_plan := jsonb_build_object('bind', to_jsonb(v_bind), 'hold', to_jsonb(v_hold), 'cancel', to_jsonb(v_cancel), 'skip', to_jsonb(v_out), 'defer', to_jsonb(v_defer), 'sig', v_sig);

  if coalesce(p_dry, true) then
    return jsonb_build_object('ok', true, 'dry', true, 'plan', v_plan, 'rows', v_rows, 'avail', v_avail, 'locked', v_locked,
                              'inst_holds', v_sib, 'ticket_name', (select plan_name from member_tickets where id = p_ticket_id));
  end if;

  -- 執行：先比對確認畫面的清單
  select coalesce(array_agg(x order by x), '{}') into v_ex_b from jsonb_array_elements_text(coalesce(p_expect->'bind', '[]'::jsonb)) x;
  select coalesce(array_agg(x order by x), '{}') into v_ex_h from jsonb_array_elements_text(coalesce(p_expect->'hold', '[]'::jsonb)) x;
  select coalesce(array_agg(x order by x), '{}') into v_ex_c from jsonb_array_elements_text(coalesce(p_expect->'cancel', '[]'::jsonb)) x;
  if p_expect->>'sig' is null then return jsonb_build_object('ok', false, 'error_code', 'EXPECT_REQUIRED'); end if;
  if p_expect->>'sig' is distinct from v_sig
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_bind) x) is distinct from v_ex_b
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_hold) x) is distinct from v_ex_h
     or (select coalesce(array_agg(x order by x), '{}') from unnest(v_cancel) x) is distinct from v_ex_c then
    -- 不一致：若確認的那批已經全部是最終狀態＝重送，回 already；否則 PLAN_CHANGED（不做任何事）
    select (not exists (select 1 from unnest(v_ex_b) i where not exists (select 1 from bookings where id = i and ticket_id = p_ticket_id))
        and not exists (select 1 from unnest(v_ex_h) i where not exists (select 1 from bookings where id = i and status::text = 'booked' and ticket_id is null and coalesce(note, '') like '%分期待繳費保留%'))
        and not exists (select 1 from unnest(v_ex_c) i where not exists (select 1 from bookings where id = i and status::text = 'cancelled' and coalesce(cancel_reason, '') like '新票轉正整理%')))
      and (coalesce(array_length(v_ex_b, 1), 0) + coalesce(array_length(v_ex_h, 1), 0) + coalesce(array_length(v_ex_c, 1), 0)) > 0
      into v_done;
    if v_done then return jsonb_build_object('ok', true, 'already', true, 'plan', v_plan); end if;
    return jsonb_build_object('ok', false, 'error_code', 'PLAN_CHANGED', 'plan', v_plan, 'rows', v_rows);
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then return jsonb_build_object('ok', true, 'already', true, 'plan', v_plan); end if;   -- 清單為空且 sig 相符＝沒有東西可做

  -- ① 轉正：逐堂 鎖定已完成，扣 1 堂、寫帳、綁票（任何一步失敗＝整個交易回滾）
  foreach v_id in array v_bind loop
    select coalesce(sum(case when action::text = 'deduct' and coalesce(delta, 0) <> 0 then 1 when action::text = 'refund' then -1 else 0 end), 0)
      into v_net from ticket_logs where ticket_id = p_ticket_id and booking_id = v_id;
    if v_net > 0 then raise exception 'SETTLE.ALREADY_DEDUCTED:%', v_id; end if;
    update member_tickets set sessions_remaining = sessions_remaining - 1 where id = p_ticket_id and sessions_remaining > 0;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.NO_REMAINING:%', v_id; end if;
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
    values ('LG-' || replace(gen_random_uuid()::text, '-', ''), p_ticket_id, 'deduct', -1, v_id, v_emp, '預約扣課（新票轉正整理）', now());
    update bookings set member_id = v_t.member_id, ticket_id = p_ticket_id, ticket_type_id = coalesce(v_t.ticket_type_id, ticket_type_id),
           pending_contract = false, trial_name = null, trial_phone = null
     where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.BIND_ROWCOUNT:%', v_id; end if;
  end loop;
  -- ② 合約內尚未繳費開通的分期堂數：留成分期待繳費保留（不扣、不取消）
  foreach v_id in array v_hold loop
    update bookings set member_id = v_t.member_id, trial_name = null, trial_phone = null, note = '分期待繳費保留（收款後自動補扣）'
     where id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.HOLD_ROWCOUNT:%', v_id; end if;
  end loop;
  -- ③ 真正超出合約總堂數：取消（保留紀錄，不刪除）
  foreach v_id in array v_cancel loop
    update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = v_emp,
           cancel_reason = '新票轉正整理：超出票券堂數，卡位自動取消',
           note = case when coalesce(note, '') = '' then '超出票券堂數，轉正整理時自動取消' else note || '｜超出票券堂數，轉正整理時自動取消' end
     where id = v_id and status::text = 'booked' and ticket_id is null;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'SETTLE.CANCEL_ROWCOUNT:%', v_id; end if;
  end loop;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
  values ('LG-' || replace(gen_random_uuid()::text, '-', ''), p_ticket_id, 'adjust', 0, null, v_emp,
          '新票轉正整理：轉正 ' || coalesce(array_length(v_bind, 1), 0) || ' 堂、分期保留 ' || coalesce(array_length(v_hold, 1), 0)
          || ' 堂、取消 ' || coalesce(array_length(v_cancel, 1), 0) || ' 堂', now());
  return jsonb_build_object('ok', true, 'bound', to_jsonb(v_bind), 'held', to_jsonb(v_hold), 'cancelled', to_jsonb(v_cancel),
                            'remaining', (select sessions_remaining from member_tickets where id = p_ticket_id));
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY');
  when others then
    -- 本區塊內的所有寫入都已回滾；回傳失敗，前端不得再做任何取消
    return jsonb_build_object('ok', false, 'error_code', 'SETTLE.FAILED', 'detail', sqlerrm);
end
$fn$;
create function pg_temp.ch_fail() returns trigger language plpgsql as $$begin if new.id='CC-CH-T' and current_setting('app.ch_fail',true)='yes' then raise exception 'CH_SIMULATED_DEDUCT_FAILURE';end if;return new;end$$;
create trigger zz_ch_fail before update on member_tickets for each row execute function pg_temp.ch_fail();
do $test$
declare r jsonb; r2 jsonb; p jsonb; i int; h text; h2 text; m text; tt text; adm record;
begin
 select member_id,ticket_type_id into m,tt from member_tickets where id='CC-CH-T';
 r:=fn_hold_settle_new_ticket('CC-CH-T',true,'CC-CH-B01');p:=r->'plan';
 insert into ch_results values('same_contract_6_bind_6_hold_2_cancel',(r->>'ok')::boolean and jsonb_array_length(p->'bind')=6 and jsonb_array_length(p->'hold')=6 and jsonb_array_length(p->'cancel')=2,r);
 insert into ch_results values('preview_does_not_deduct',(select sessions_remaining=12 from member_tickets where id='CC-CH-T') and not exists(select 1 from ticket_logs where ticket_id='CC-CH-T'),null);
 insert into ch_results values('nearest_first',p->'bind'='["CC-CH-B01","CC-CH-B02","CC-CH-B03","CC-CH-B04","CC-CH-B05","CC-CH-B06"]'::jsonb,null);
 r2:=fn_hold_settle_new_ticket('CC-CH-T',true,'CC-CH-OTHER-B');
 insert into ch_results values('other_contract_anchor_rejected',r2->>'error_code'='ANCHOR_NOT_ELIGIBLE',r2);
 update contracts set note='confirm changed' where id='CC-CH-C';
 r2:=fn_hold_settle_new_ticket('CC-CH-T',false,'CC-CH-B01',p);
 insert into ch_results values('contract_changed_stops_whole_plan',r2->>'error_code'='PLAN_CHANGED' and (select sessions_remaining=12 from member_tickets where id='CC-CH-T'),r2);
 r:=fn_hold_settle_new_ticket('CC-CH-T',true,'CC-CH-B01');p:=r->'plan';
 select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h from bookings b where id like 'CC-CH-%';
 perform set_config('app.ch_fail','yes',true);r2:=fn_hold_settle_new_ticket('CC-CH-T',false,'CC-CH-B01',p);perform set_config('app.ch_fail','no',true);
 select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'CC-CH-%';
 insert into ch_results values('deduct_failure_no_cancel_or_binding',r2->>'error_code'='SETTLE.FAILED' and h=h2 and (select sessions_remaining=12 from member_tickets where id='CC-CH-T'),r2);
 r2:=fn_hold_settle_new_ticket('CC-CH-T',false,'CC-CH-B01',p);
 insert into ch_results values('execution_success',(r2->>'ok')::boolean,r2);
 insert into ch_results values('original_ids_times_retained',(select count(*)=14 and bool_and(date=fn_tk_today()+right(id,2)::int and start_time='13:00') from bookings where id ~ '^CC-CH-B[0-9]+$'),null);
 insert into ch_results values('six_net_deductions_only',(select count(*)=6 and sum(delta)=-6 from ticket_logs where ticket_id='CC-CH-T' and action::text='deduct') and (select sessions_remaining=6 from member_tickets where id='CC-CH-T'),null);
 insert into ch_results values('six_locked_holds_retained',(select count(*)=6 from bookings where id ~ '^CC-CH-B[0-9]+$' and status::text='booked' and ticket_id is null and pending_contract and note like '分期待繳費保留%' and contract_id='CC-CH-C'),null);
 insert into ch_results values('excess_cancelled_without_deduction',(select count(*)=2 from bookings where id in ('CC-CH-B13','CC-CH-B14') and status::text='cancelled') and not exists(select 1 from ticket_logs where booking_id in ('CC-CH-B13','CC-CH-B14') and action::text='deduct'),null);
 insert into ch_results values('other_contract_unchanged',(select status::text='booked' and ticket_id is null and pending_contract from bookings where id='CC-CH-OTHER-B'),null);
 r2:=fn_hold_settle_new_ticket('CC-CH-T',false,'CC-CH-B01',p);
 insert into ch_results values('replay_does_not_deduct_twice',r2->>'already'='true' and (select count(*)=6 from ticket_logs where ticket_id='CC-CH-T' and action::text='deduct'),r2);
 -- 已有六堂轉正＋六堂保留，再多一堂；即使有其他票，也不能延續本合約的超額卡位。
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claims','{}',true);
 select ticket_type_id into tt from member_tickets where id='CC-CH-T';
 perform pg_temp.mktk('CC-CH-EXTRA-T',m,tt,10,10,null,null);
 perform pg_temp.mkbk('CC-CH-B15',m,tt,'私人教練',fn_tk_today()+15,'13:00',jsonb_build_object('contract_id','CC-CH-C'));
 select id,auth_id into adm from employees where role::text='admin' and auth_id is not null limit 1;
 perform set_config('request.jwt.claims',json_build_object('sub',adm.auth_id,'role','authenticated')::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 r:=fn_hold_settle_new_ticket('CC-CH-T',true,'CC-CH-B15');
 insert into ch_results values('existing_locked_holds_not_counted_twice',jsonb_array_length(r->'plan'->'hold')=0 and r->'plan'->'cancel'='["CC-CH-B15"]'::jsonb,r);
 insert into ch_results values('excess_contract_hold_not_deferred_to_other_ticket',jsonb_array_length(r->'plan'->'defer')=0,r);
 r2:=fn_hold_settle_new_ticket('CC-CH-T',false,'CC-CH-B15',r->'plan');
 insert into ch_results values('only_extra_cancelled_other_ticket_untouched',(r2->>'ok')::boolean and (select status::text='cancelled' from bookings where id='CC-CH-B15') and (select sessions_remaining=10 from member_tickets where id='CC-CH-EXTRA-T'),r2);
end $test$;
do $finish$ declare r jsonb;begin select jsonb_build_object('passed',count(*) filter(where pass),'failed',count(*) filter(where pass is not true),'results',jsonb_agg(to_jsonb(ch_results))) into r from ch_results;raise exception 'CH_TEST_ROLLBACK:%',r;end $finish$;
