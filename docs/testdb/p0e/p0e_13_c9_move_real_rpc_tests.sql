-- ═══════════════════════════════════════════════════════════════════════
-- C9：真實呼叫 fn_move_booking_ticket × 正式庫五個預約觸發器（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj）
-- 前置：P0-C＋TKWIN 修補已部署（測試庫現況）；**已套用 p0e_13_prod_triggers_install_testdb.sql**（bookings_cancelled_by／bookings_touch／group_guard；
--   contract／hold-month 兩個守門測試庫本來就有）。單一 DO，結尾必定回滾；結果在 P0E13_C9_RESULT: 之後。
-- 類型：真實入口（fn_move_booking_ticket 測試庫部署版，指紋 1f78f026…:13628，與正式庫將部署的版本相同）＋身分模擬 claims（非真實 HTTP）。
-- 這支 RPC 對 bookings 只有 UPDATE（ticket_id／ticket_type_id／pending_contract／partner_id／status／cancelled_at），沒有 INSERT／DELETE，
--   所以 trg_bookings_group_guard（只管 INSERT／DELETE）理論上不會被觸發；date／start_time／duration 不變，所以 bookings_touch 不會寫 updated_at。
--   會真正交會的是：cancel 模式的 status→cancelled（bookings_cancelled_by 補 cancelled_by）、hold 模式的 pending_contract=true／ticket_id=null
--   （contract／hold-month 兩個守門）、以及 P0-E 的預約窗口觸發器。
-- ═══════════════════════════════════════════════════════════════════════
do $c9$
declare v_uid uuid; v_desk_id text; v_r jsonb; v_d date := (now() at time zone 'Asia/Taipei')::date;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: 看起來像正式庫'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgrelid = 'public.bookings'::regclass
        and tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard','trg_bookings_contract_hold_guard','trg_bookings_hold_month_guard')) <> 5 then
    raise exception 'C9.PRECONDITION: 五個正式庫預約觸發器沒有全部在（先套用 p0e_13 安裝檔）'; end if;
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') <> '1f78f02623ce16484004b3cf4aec9934:13628' then
    raise exception 'C9.PRECONDITION: fn_move_booking_ticket 不是預期的部署版本'; end if;

  create temp table c9_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.c9_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as $f$ insert into c9_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 250)) $f$;
  create function pg_temp.c9_skip(p_name text, p_why text) returns void language sql as $f$ insert into c9_res(name, ok, detail) values ('SKIP ' || p_name, null, p_why) $f$;
  create function pg_temp.c9_summary() returns text language sql as $f$
    select jsonb_build_object('pass', count(*) filter (where ok is true), 'fail', count(*) filter (where ok is false), 'skip', count(*) filter (where ok is null), 'total', count(*),
      'items', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'r', case when ok is null then 'SKIP' else 'FAIL' end, 'name', left(name, 100), 'detail', detail) order by (ok is null), n) from c9_res where ok is not true), '[]'::jsonb))::text from c9_res $f$;
  create function pg_temp.c9_call(p_uid uuid, p_from text, p_to text, p_mode text) returns jsonb language plpgsql as $f$
  declare r jsonb;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    r := public.fn_move_booking_ticket(p_from, p_to, p_mode);
    perform set_config('request.jwt.claims', '', true);
    return r;
  end $f$;
  create function pg_temp.c9_net(p_tk text, p_bk text) returns integer language sql as
    $f$ select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)::int from ticket_logs where ticket_id = p_tk and booking_id = p_bk $f$;

  select auth_id, id into v_uid, v_desk_id from employees where role::text = 'front_desk' and auth_id is not null and status::text is distinct from 'inactive' order by id limit 1;
  if v_uid is null then raise exception 'C9.PRECONDITION: 測試庫沒有可用的櫃檯帳號'; end if;
  insert into ticket_types(id, name, category) values ('C9-T-PT', 'C9 教練課', '私人教練');
  insert into members(id, name) values ('C9-M', 'C9測試會員');
  -- 夾具（同 p0e_08 的 T19）：未啟用票 vd=7；F 綁票 d+5；X 綁票 d+8；G 待簽約 d+3（較早）；調課後最早日 d+3，跨度 5 ≤ 6
  create function pg_temp.c9_fx(p_k text) returns void language plpgsql as $f$
  begin
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status, valid_days)
      values ('C9-TK-' || p_k, 'C9-M', 'C9-T-PT', 'C9方案', 8, 5, 'usable', 7);
    insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance) values
      ('C9-F-' || p_k, 'C9-M', '私人教練', 'C9-T-PT', (now() at time zone 'Asia/Taipei')::date + 5, '11:00', 60, 'booked', false, 'C9-TK-' || p_k, '[]'::jsonb, '{}'::jsonb),
      ('C9-X-' || p_k, 'C9-M', '私人教練', 'C9-T-PT', (now() at time zone 'Asia/Taipei')::date + 8, '12:00', 60, 'booked', false, 'C9-TK-' || p_k, '[]'::jsonb, '{}'::jsonb),
      ('C9-G-' || p_k, 'C9-M', '私人教練', 'C9-T-PT', (now() at time zone 'Asia/Taipei')::date + 3, '10:00', 60, 'booked', true, null, '[]'::jsonb, '{}'::jsonb);
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values
      ('C9-LG-F-' || p_k, 'C9-TK-' || p_k, 'deduct', -1, 'C9-F-' || p_k, 'c9', 'x'), ('C9-LG-X-' || p_k, 'C9-TK-' || p_k, 'deduct', -1, 'C9-X-' || p_k, 'c9', 'x');
  end $f$;

  -- C9a cancel 模式：原預約取消（bookings_cancelled_by 應補上操作員工）、新預約拿到票、帳本成對、餘額不變
  perform pg_temp.c9_fx('a');
  v_r := pg_temp.c9_call(v_uid, 'C9-F-a', 'C9-G-a', 'cancel');
  perform pg_temp.c9_rec('C9a cancel 模式在五個守門＋P0-E 窗口之下成功', v_r->>'ok' = 'true', v_r::text);
  perform pg_temp.c9_rec('C9a 原預約已取消、cancelled_by 由 bookings_cancelled_by 補成操作員工（RPC 自己不寫 cancelled_by）',
    (select status::text = 'cancelled' and cancelled_by = v_desk_id and ticket_id is null from bookings where id = 'C9-F-a'), (select coalesce(cancelled_by, 'null') from bookings where id = 'C9-F-a'));
  perform pg_temp.c9_rec('C9a 新預約綁票、不再是待簽約；帳本成對（原 0、新 1）；餘額不變 5',
    (select ticket_id = 'C9-TK-a' and not pending_contract from bookings where id = 'C9-G-a') and pg_temp.c9_net('C9-TK-a', 'C9-F-a') = 0 and pg_temp.c9_net('C9-TK-a', 'C9-G-a') = 1
    and (select sessions_remaining = 5 from member_tickets where id = 'C9-TK-a'), '');
  perform pg_temp.c9_rec('C9a 日期／時間沒變 → bookings_touch 不寫 updated_at', (select updated_at is null from bookings where id in ('C9-F-a') ) and (select updated_at is null from bookings where id = 'C9-G-a'), '');
  perform pg_temp.c9_rec('C9a 未啟用票仍未啟用（調課不啟用效期）', (select start_date is null and expire_date is null and activated_at is null from member_tickets where id = 'C9-TK-a'), '');
  -- C9b hold 模式：原預約改成待簽約卡位（contract／hold-month 守門會看這個寫法）
  perform pg_temp.c9_fx('b');
  v_r := pg_temp.c9_call(v_uid, 'C9-F-b', 'C9-G-b', 'hold');
  perform pg_temp.c9_rec('C9b hold 模式（近期）在 contract／hold-month 守門之下成功', v_r->>'ok' = 'true', v_r::text);
  perform pg_temp.c9_rec('C9b 原預約變成待簽約卡位（ticket_id 空、pending_contract 真）、沒有被取消；cancelled_by 仍空',
    (select pending_contract and ticket_id is null and status::text = 'booked' and cancelled_by is null from bookings where id = 'C9-F-b'), '');
  perform pg_temp.c9_rec('C9b 帳本成對、餘額不變', pg_temp.c9_net('C9-TK-b', 'C9-F-b') = 0 and pg_temp.c9_net('C9-TK-b', 'C9-G-b') = 1 and (select sessions_remaining = 5 from member_tickets where id = 'C9-TK-b'), '');
  -- C9c 帳本之外的不變量：RPC 本體對 bookings 沒有 INSERT／DELETE（所以 group_guard 不會被觸發）
  perform pg_temp.c9_rec('C9c RPC 本體沒有對 bookings 的 INSERT／DELETE（group_guard 只管這兩種）',
    pg_get_functiondef('public.fn_move_booking_ticket(text,text,text)'::regprocedure) !~* '(insert\s+into\s+bookings|delete\s+from\s+bookings)', '');
  perform pg_temp.c9_skip('C9d 遠期卡位撞 HOLD.MONTH_LIMIT 並由 RPC 原樣透傳', '調課後票券仍是可用票，hold-month 守門會因「會員有合格票券」而放行；要觸發需要一個沒有任何合格票券的會員，無法在不違反 RPC 的票券狀態檢查下建立。此透傳路徑由既有 move_ticket_01 套件涵蓋');
  raise exception 'P0E13_C9_RESULT: %', pg_temp.c9_summary();
end
$c9$;
