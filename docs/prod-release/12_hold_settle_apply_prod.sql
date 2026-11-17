-- 階段 12：新票轉正整理（新增一支函式 fn_hold_settle_new_ticket）。⚠ 只供審查；尚未在正式庫執行，需使用者明確授權。
-- 單一交易：前置核對（環境＝正式庫、依賴物件與釘住指紋、名稱未被占用）→ 套用 → 提交前核對（security definer、固定 search_path、權限正好 postgres＋authenticated、本體指紋、其餘函式／觸發器／policy／grant／資料表指紋不變）→ commit。任何一步失敗＝整個交易回滾。
-- 不動任何資料；用 create function（不用 or replace）。順序：先套本檔（資料庫），再發布前端。
-- 回復：預設只退前端（git revert）、保留這支函式；**前端已發布後不能僅因退版就刪函式**（仍開著新頁面的人會呼叫它）。完整移除要另行取得使用者明確授權，見 12_hold_settle_rollback_prod.sql。
-- 測試環境：本檔的函式本體在測試庫以「暫裝階段 06／08／11 實際版本」的組合驗證過（見 docs/testdb/hold-settle/README.md），測後已移除並核對基準。
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if not ((select system_identifier::text from pg_control_system()) = '7637215626725903220') then raise exception 'HS.GUARD: 叢集識別不是正式庫，停止（沒有任何變更）'; end if;
  if not (exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='current_employee_id') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='is_staff_desk') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_tk_today') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_tk_is_unopened') and exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_tk_holding') and coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_tk_shared_has(jsonb,text)')), '') = '0d0d61af566726ed67f884d3f733856f') then raise exception 'HS.GUARD: 依賴函式不齊或 fn_tk_shared_has 不是已核對的版本（current_employee_id／is_staff_desk／fn_tk_today／fn_tk_is_unopened／fn_tk_holding／fn_tk_shared_has md5 0d0d61af566726ed67f884d3f733856f），停止'; end if;
  -- 階段 06／08／11 必須已在（本函式與它們的守門觸發器一起運作；這是測過的組合）
  if not (exists (select 1 from pg_trigger where tgname='trg_tk_quota_guard' and not tgisinternal) and to_regprocedure('public.fn_desk_deduct_ticket(text,text,text,text)') is not null and to_regprocedure('public.fn_hold_state_guard()') is not null) then raise exception 'HS.GUARD: 階段 06／08／11 的物件不齊，停止（本函式是在它們都存在的環境測的）'; end if;
  if not (coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), '') = '05c51530e595cf296f9b8da951f66093' and coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), '') = '22edb0f9a4893e9d891a420ba4588440' and coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')), '') = 'e7152b65fbb7d6c5d494cc938757caeb') then raise exception 'HS.GUARD: 階段 11 的函式指紋不是測過的版本，停止'; end if;
  if not (to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)') is null) then raise exception 'HS.GUARD: fn_hold_settle_new_ticket 已存在，停止（不覆蓋）'; end if;
  create temp table _hs_pre on commit drop as select
    (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace) funcs,
    (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
    (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
    (select md5(string_agg(tgname,'|' order by tgname)) from pg_trigger where not tgisinternal) trg,
    (select md5(string_agg(tablename,'|' order by tablename)) from pg_tables where schemaname='public') tbl;
end
$guard$;

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
revoke all on function public.fn_hold_settle_new_ticket(text, boolean, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.fn_hold_settle_new_ticket(text, boolean, text, jsonb) to authenticated;

do $post$
declare v_pre record;
begin
  select * into v_pre from _hs_pre;
  if not (select prosecdef and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' from pg_proc where oid = to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)')) then raise exception 'HS.POST: security definer／search_path 不對，回滾'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)')), '') <> '550c28a816b6e46f636287d7fa33405a' then raise exception 'HS.POST: 本體指紋不是審查版，回滾'; end if;
  if not ((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)')) = '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'HS.POST: 權限不是 postgres＋authenticated，回滾'; end if;
  if (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname <> 'fn_hold_settle_new_ticket') is distinct from v_pre.funcs then raise exception 'HS.POST: 其餘函式指紋變了，回滾'; end if;
  if (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') is distinct from v_pre.pol then raise exception 'HS.POST: policies 變了，回滾'; end if;
  if (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') is distinct from v_pre.grants then raise exception 'HS.POST: 表權限變了，回滾'; end if;
  if (select md5(string_agg(tgname,'|' order by tgname)) from pg_trigger where not tgisinternal) is distinct from v_pre.trg then raise exception 'HS.POST: 觸發器變了，回滾'; end if;
  if (select md5(string_agg(tablename,'|' order by tablename)) from pg_tables where schemaname='public') is distinct from v_pre.tbl then raise exception 'HS.POST: 資料表變了，回滾'; end if;
end
$post$;
commit;
