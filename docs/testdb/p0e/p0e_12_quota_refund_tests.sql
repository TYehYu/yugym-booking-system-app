-- ═══════════════════════════════════════════════════════════════════════
-- 分期額度共用防護＋原子退票 SQL 測試（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj；需先套用 p0e_12_apply_quota_refund_testdb.sql）
-- 單一 DO，結尾必定 raise exception → 全部回滾；結果在錯誤訊息 QR_TESTS_RESULT: 之後。以 request.jwt.claims 借用測試庫現有員工身分（不建帳號）。
-- 案例類型標籤（ChatGPT 驗收請依此解讀，不要把模擬當成端到端 PASS）：
--   [觸發器・直接 UPDATE]      只驗證 trg_tk_quota_guard 本身（任何入口最後都會執行的那種 UPDATE）
--   [入口 …（測試庫版）]       真的呼叫入口函式，但測試庫的版本與正式庫不同（指紋不同），不代表正式庫入口
--   [模擬：同一句 UPDATE …]    用入口函式裡的那一句 UPDATE 模擬，不是呼叫入口；不得當成入口 PASS
--   [RPC fn_refund_ticket …]   新函式（需先套用 p0e_12），真實入口
--   [操作人員作用域（GUC）]    R16–R21：驗證 app.tk_operator 的交易區域作用域與還原（R21＝三種起始狀態×四條路徑）
--   [身分模擬 claims]          用 request.jwt.claims 模擬登入，不是真實 HTTP／登入
--   SKIP                       未驗證（併發、正式庫版入口的端到端）
-- 誠實標註（見 SKIP 項）：
--   ・併發（兩條連線同時）單一交易內無法驗證 → docs/testdb/concurrency/run_concurrency.sh（尚未執行）
--   ・測試庫的 fn_member_join_group／fn_member_self_book／fn_group_save_members 與正式庫版本不同（指紋不同），端到端呼叫它們得先把正式庫版本同步進測試庫；
--     這裡改用「它們最後都會執行的同一句 UPDATE member_tickets」模擬——觸發器與入口無關，模擬等價於任何入口。
-- ═══════════════════════════════════════════════════════════════════════
do $qr$
declare
  v_res jsonb; v_uid_desk uuid; v_uid_coach uuid; v_coach_id text; v_other_coach text; v_desk_id text; v_msg text; v_n integer;
  v_uid_admin uuid; v_admin_id text;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫，停止執行';
  end if;
  if to_regprocedure('public.fn_refund_ticket(text,text,text)') is null or not exists (select 1 from pg_trigger where tgname = 'trg_tk_quota_guard') then
    raise exception 'QR.PRECONDITION: 尚未套用 p0e_12_apply_quota_refund_testdb.sql';
  end if;

  create temp table qr_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.q_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as
    $f$ insert into qr_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 200)) $f$;
  create function pg_temp.q_skip(p_name text, p_why text) returns void language sql as
    $f$ insert into qr_res(name, ok, detail) values ('SKIP ' || p_name, null, p_why) $f$;
  create function pg_temp.q_summary() returns text language sql as $f$
    select jsonb_build_object('pass', count(*) filter (where ok is true), 'fail', count(*) filter (where ok is false), 'skip', count(*) filter (where ok is null), 'total', count(*),
             'items', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'r', case when ok is null then 'SKIP' else 'FAIL' end, 'name', left(name, 90), 'detail', detail) order by (ok is null), n) from qr_res where ok is not true), '[]'::jsonb))::text
      from qr_res $f$;
  create function pg_temp.q_claims(p_uid uuid) returns void language sql as
    $f$ select set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true) $f$;
  create function pg_temp.q_tk(p_id text, p_total integer, p_rem integer, p_unlocked integer default null) returns void language plpgsql as $f$
  begin
    insert into members(id, name) values ('QR-M-' || p_id, 'QR測試會員') on conflict (id) do nothing;
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status, unlocked_sessions)
    values (p_id, 'QR-M-' || p_id, 'QR-T-PT', 'QR方案', p_total, p_rem, (case when p_rem > 0 then 'usable' else 'used_up' end)::ticket_status, p_unlocked);
  end $f$;
  create function pg_temp.q_bk(p_id text, p_tk text, p_off integer default 3, p_coach text default null) returns void language sql as $f$
    insert into bookings(id, member_id, coach_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance)
    values (p_id, 'QR-M-' || p_tk, p_coach, '私人教練', 'QR-T-PT', (now() at time zone 'Asia/Taipei')::date + p_off, '10:00', 60, 'booked', false, p_tk, '[]'::jsonb, '{}'::jsonb) $f$;
  create function pg_temp.q_led(p_tk text, p_bk text, p_action text, p_delta integer, p_note text default 'qr fixture') returns void language sql as $f$
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values ('QR-LG-' || md5(random()::text || clock_timestamp()::text), p_tk, p_action::ticket_log_action, p_delta, p_bk, 'qrtest', p_note) $f$;
  create function pg_temp.q_rem(p_tk text) returns integer language sql as $f$ select sessions_remaining from member_tickets where id = p_tk $f$;
  create function pg_temp.q_nled(p_tk text, p_bk text, p_action text) returns integer language sql as
    $f$ select count(*)::int from ticket_logs where ticket_id = p_tk and booking_id = p_bk and action::text = p_action $f$;

  insert into ticket_types(id, name, category) values ('QR-T-PT', 'QR 教練課', '私人教練');
  select auth_id, id into v_uid_desk, v_desk_id from employees where role::text = 'front_desk' and status::text = 'active' and auth_id is not null limit 1;
  select auth_id, id into v_uid_coach, v_coach_id from employees where role::text = 'coach' and status::text = 'active' and auth_id is not null limit 1;
  select id into v_other_coach from employees where role::text = 'coach' and id is distinct from v_coach_id limit 1;
  if v_uid_desk is null or v_uid_coach is null then raise exception 'QR.PRECONDITION: 測試庫缺少有登入的櫃檯／教練員工'; end if;
  select auth_id, id into v_uid_admin, v_admin_id from employees where role::text = 'admin' and status::text = 'active' and auth_id is not null limit 1;
  perform pg_temp.q_claims(v_uid_desk);

  -- ═══ 分期額度（共 12 堂、已開通 8 堂）═══
  perform pg_temp.q_tk('QT-A', 12, 5, 8);                                  -- 已用 7
  perform pg_temp.q_bk('QB-A1', 'QT-A'); perform pg_temp.q_bk('QB-A2', 'QT-A');
  v_res := public.fn_deduct_ticket('QT-A', 'QB-A1', 'qr 第8堂');
  perform pg_temp.q_rec('Q1 [入口 fn_deduct_ticket（測試庫版）＋觸發器] 開通 8／共 12：第 8 堂成功（使用量 7→8）', (v_res->>'ok') = 'true' and pg_temp.q_rem('QT-A') = 4, v_res::text);
  begin
    v_res := public.fn_deduct_ticket('QT-A', 'QB-A2', 'qr 第9堂');
    perform pg_temp.q_rec('Q2 [入口 fn_deduct_ticket（測試庫版）＋觸發器] 第 9 堂被拒絕（櫃檯代預約的扣課入口 fn_deduct_ticket）', false, '沒有拋錯：' || v_res::text);
  exception when others then
    v_msg := sqlerrm;
    perform pg_temp.q_rec('Q2 [入口 fn_deduct_ticket（測試庫版）＋觸發器] 第 9 堂被拒絕（櫃檯代預約的扣課入口 fn_deduct_ticket）', v_msg = 'TICKET.INSTALLMENT_LOCKED', v_msg);
  end;
  perform pg_temp.q_rec('Q2 [入口 fn_deduct_ticket（測試庫版）＋觸發器] 被拒後：餘額、帳本全部維持原狀（整筆回滾）', pg_temp.q_rem('QT-A') = 4 and pg_temp.q_nled('QT-A', 'QB-A2', 'deduct') = 0, '');
  begin
    update member_tickets set sessions_remaining = 3 where id = 'QT-A';       -- 前端整列 dbPut 的絕對值寫法
    perform pg_temp.q_rec('Q3 [觸發器・直接 UPDATE] 前端直接寫餘額（絕對值）超過額度也被拒', false, '沒有拋錯');
  exception when others then
    perform pg_temp.q_rec('Q3 [觸發器・直接 UPDATE] 前端直接寫餘額（絕對值）超過額度也被拒', sqlerrm = 'TICKET.INSTALLMENT_LOCKED', sqlerrm);
  end;
  begin
    update member_tickets set sessions_remaining = sessions_remaining - 1,
           status = case when sessions_remaining - 1 <= 0 then 'used_up' else status end where id = 'QT-A';   -- fn_member_join_group／fn_group_save_members 的扣餘額寫法
    perform pg_temp.q_rec('Q4 [模擬：同一句 UPDATE，非端到端，不得當成入口 PASS] 會員自行報名／團課報名／團課名單新增的扣餘額寫法（模擬）不能繞過', false, '沒有拋錯');
  exception when others then
    perform pg_temp.q_rec('Q4 [模擬：同一句 UPDATE，非端到端，不得當成入口 PASS] 會員自行報名／團課報名／團課名單新增的扣餘額寫法（模擬）不能繞過', sqlerrm = 'TICKET.INSTALLMENT_LOCKED', sqlerrm);
  end;
  if to_regprocedure('public.benefit_consume_ticket(text,text,integer,text)') is null then
    perform pg_temp.q_skip('Q5 benefit_consume_ticket 不能繞過', '測試庫沒有與正式庫相同簽名的 benefit_consume_ticket(text,text,integer,text)');
  else
    begin
      perform public.benefit_consume_ticket('QT-A', 'QR-M-QT-A', 1, 'QB-A2');
      perform pg_temp.q_rec('Q5 [入口 benefit_consume_ticket（測試庫版，自帶分期檢查）] benefit_consume_ticket 不能繞過', pg_temp.q_rem('QT-A') = 4, '沒有拋錯，但餘額應維持 4：' || pg_temp.q_rem('QT-A'));
    exception when others then
      perform pg_temp.q_rec('Q5 [入口 benefit_consume_ticket（測試庫版，自帶分期檢查）] benefit_consume_ticket 不能繞過', pg_temp.q_rem('QT-A') = 4 and sqlerrm !~* 'does not exist', sqlerrm);
    end;
  end if;
  -- 調課：只搬 ticket_id 與成對帳本，不更新 member_tickets → 使用量不變、不被誤擋
  begin
    update bookings set ticket_id = 'QT-A' where id = 'QB-A1';
    perform pg_temp.q_led('QT-A', 'QB-A1', 'adjust', 0, '調課痕跡 fixture');
    perform pg_temp.q_rec('Q6 [非扣餘額寫入：觸發器未被觸碰，非端到端] 調課型寫入（只動預約與帳本、不改餘額）在額度上限時不被誤擋，使用量不變', pg_temp.q_rem('QT-A') = 4, '');
  exception when others then perform pg_temp.q_rec('Q6 [非扣餘額寫入：觸發器未被觸碰，非端到端] 調課型寫入在額度上限時不被誤擋', false, sqlerrm); end;
  update member_tickets set unlocked_sessions = 12 where id = 'QT-A';        -- 分期付款開通下一期
  v_res := public.fn_deduct_ticket('QT-A', 'QB-A2', 'qr 開通後第9堂');
  perform pg_temp.q_rec('Q7 [入口 fn_deduct_ticket（測試庫版）＋觸發器] 分期付款開通下一期後：額度增加，第 9 堂成功', (v_res->>'ok') = 'true' and pg_temp.q_rem('QT-A') = 3, v_res::text);
  -- 取消退課後額度恢復
  perform pg_temp.q_tk('QT-B', 12, 4, 8);                                   -- 已用 8＝額度上限
  perform pg_temp.q_bk('QB-B1', 'QT-B'); perform pg_temp.q_led('QT-B', 'QB-B1', 'deduct', -1);
  perform pg_temp.q_bk('QB-B2', 'QT-B');
  begin
    perform public.fn_deduct_ticket('QT-B', 'QB-B2', 'qr');
    perform pg_temp.q_rec('Q8 [入口 fn_deduct_ticket＋fn_refund_ticket（新函式）＋觸發器] 上限時再扣被拒', false, '沒有拋錯');
  exception when others then perform pg_temp.q_rec('Q8 [入口 fn_deduct_ticket＋fn_refund_ticket（新函式）＋觸發器] 上限時再扣被拒', sqlerrm = 'TICKET.INSTALLMENT_LOCKED', sqlerrm); end;
  v_res := public.fn_refund_ticket('QT-B', 'QB-B1');
  v_res := public.fn_deduct_ticket('QT-B', 'QB-B2', 'qr 退課後重新預約');
  perform pg_temp.q_rec('Q8 [入口 fn_deduct_ticket＋fn_refund_ticket（新函式）＋觸發器] 取消退課後額度恢復：重新預約成功（使用量回到 8）', (v_res->>'ok') = 'true' and pg_temp.q_rem('QT-B') = 4, v_res::text);
  perform pg_temp.q_rec('Q8 [入口 fn_deduct_ticket＋fn_refund_ticket（新函式）＋觸發器] 退款不改已開通額度（unlocked_sessions 仍為 8）', (select unlocked_sessions = 8 from member_tickets where id = 'QT-B'), '');
  -- 不適用的票、歷史超額票
  perform pg_temp.q_tk('QT-C', 4, 1, null); perform pg_temp.q_bk('QB-C1', 'QT-C');
  v_res := public.fn_deduct_ticket('QT-C', 'QB-C1', 'qr');
  perform pg_temp.q_rec('Q9 [入口 fn_deduct_ticket；觸發器不適用] 非分期票（unlocked 為空）不受影響', (v_res->>'ok') = 'true' and pg_temp.q_rem('QT-C') = 0, v_res::text);
  perform pg_temp.q_tk('QT-D', 12, 2, 8);                                   -- 歷史超額：使用量 10 > 8
  update member_tickets set sessions_remaining = 3 where id = 'QT-D';
  perform pg_temp.q_rec('Q10 [觸發器・直接 UPDATE] 歷史超額票：退款／校正回調（使用量下降）放行', pg_temp.q_rem('QT-D') = 3, '');
  begin
    update member_tickets set sessions_remaining = 2 where id = 'QT-D';
    perform pg_temp.q_rec('Q10 [觸發器・直接 UPDATE] 歷史超額票：再增加使用量仍被拒', false, '沒有拋錯');
  exception when others then perform pg_temp.q_rec('Q10 [觸發器・直接 UPDATE] 歷史超額票：再增加使用量仍被拒', sqlerrm = 'TICKET.INSTALLMENT_LOCKED', sqlerrm); end;
  perform pg_temp.q_skip('Q11 同時操作不會超扣（真正兩條連線）', '單一交易內無法驗證；見 docs/testdb/concurrency/run_concurrency.sh（尚未執行）');
  perform pg_temp.q_skip('Q12 端到端呼叫正式庫版本的 fn_member_join_group／fn_member_self_book／fn_group_save_members', '測試庫版本與正式庫不同（指紋不同）；需先把正式庫版本同步進測試庫（需授權）。Q4 以同一句 UPDATE 模擬');

  -- ═══ 原子退票 ═══
  perform pg_temp.q_tk('QT-R', 6, 3, null);
  perform pg_temp.q_bk('QB-R1', 'QT-R'); perform pg_temp.q_led('QT-R', 'QB-R1', 'deduct', -1);
  v_res := public.fn_refund_ticket('QT-R', 'QB-R1');
  perform pg_temp.q_rec('R1 [RPC fn_refund_ticket（新函式，真實入口）] 正常取消退款：退 1 堂、餘額 +1、帳本 1 筆 refund', (v_res->>'refunded') = 'true' and pg_temp.q_rem('QT-R') = 4 and pg_temp.q_nled('QT-R', 'QB-R1', 'refund') = 1, v_res::text);
  perform pg_temp.q_rec('R1 [RPC fn_refund_ticket（新函式，真實入口）] 帳本 operator＝實際操作的員工（不是 system）', (select operator = v_desk_id from ticket_logs where ticket_id = 'QT-R' and booking_id = 'QB-R1' and action::text = 'refund'), v_desk_id);
  v_res := public.fn_refund_ticket('QT-R', 'QB-R1');
  perform pg_temp.q_rec('R2 [RPC fn_refund_ticket（新函式，真實入口）] 重複取消：不再退款（ALREADY_REFUNDED）、餘額與帳本不變', (v_res->>'ok') = 'true' and (v_res->>'refunded') = 'false' and v_res->>'reason' = 'ALREADY_REFUNDED'
    and pg_temp.q_rem('QT-R') = 4 and pg_temp.q_nled('QT-R', 'QB-R1', 'refund') = 1, v_res::text);
  perform pg_temp.q_bk('QB-R2', 'QT-R'); perform pg_temp.q_led('QT-R', 'QB-R2', 'deduct', -1); perform pg_temp.q_led('QT-R', 'QB-R2', 'refund', 1);
  v_res := public.fn_refund_ticket('QT-R', 'QB-R2');
  perform pg_temp.q_rec('R3 [RPC fn_refund_ticket（新函式，真實入口）] 既有已退款紀錄不會再次退款', (v_res->>'refunded') = 'false' and pg_temp.q_nled('QT-R', 'QB-R2', 'refund') = 1 and pg_temp.q_rem('QT-R') = 4, v_res::text);
  perform pg_temp.q_bk('QB-R3', 'QT-R');
  v_res := public.fn_refund_ticket('QT-R', 'QB-R3');
  perform pg_temp.q_rec('R4 [RPC fn_refund_ticket（新函式，真實入口）] 無扣課紀錄：拒絕自動退款（REFUND.NO_DEDUCT）、餘額不變', v_res->>'error_code' = 'REFUND.NO_DEDUCT' and pg_temp.q_rem('QT-R') = 4, v_res::text);
  perform pg_temp.q_bk('QB-R4', 'QT-R'); perform pg_temp.q_led('QT-R', 'QB-R4', 'adjust', 0);
  v_res := public.fn_refund_ticket('QT-R', 'QB-R4');
  perform pg_temp.q_rec('R5 [RPC fn_refund_ticket（新函式，真實入口）] 只有調整紀錄：拒絕（REFUND.ONLY_ADJUST）', v_res->>'error_code' = 'REFUND.ONLY_ADJUST' and pg_temp.q_rem('QT-R') = 4, v_res::text);
  perform pg_temp.q_bk('QB-R5', 'QT-R'); perform pg_temp.q_led('QT-R', 'QB-R5', 'refund', 1);
  v_res := public.fn_refund_ticket('QT-R', 'QB-R5');
  perform pg_temp.q_rec('R6 [RPC fn_refund_ticket（新函式，真實入口）] 只有退款紀錄：拒絕（REFUND.ONLY_REFUND）', v_res->>'error_code' = 'REFUND.ONLY_REFUND' and pg_temp.q_rem('QT-R') = 4, v_res::text);
  perform pg_temp.q_bk('QB-R6', 'QT-R'); perform pg_temp.q_led('QT-R', 'QB-R6', 'deduct', -1); perform pg_temp.q_led('QT-R', 'QB-R6', 'refund', 1); perform pg_temp.q_led('QT-R', 'QB-R6', 'refund', 1);
  v_res := public.fn_refund_ticket('QT-R', 'QB-R6');
  perform pg_temp.q_rec('R7 [RPC fn_refund_ticket（新函式，真實入口）] 超額退款（退比扣多）：拒絕（REFUND.OVER_REFUNDED）', v_res->>'error_code' = 'REFUND.OVER_REFUNDED' and pg_temp.q_rem('QT-R') = 4, v_res::text);
  perform pg_temp.q_bk('QB-R7', 'QT-R');
  v_res := public.fn_deduct_ticket('QT-R', 'QB-R7', 'qr 取消後立即重新預約');
  perform pg_temp.q_rec('R8 [RPC＋入口 fn_deduct_ticket（測試庫版）] 取消退款後立即重新預約：扣課成功、餘額與帳本一致', (v_res->>'ok') = 'true' and pg_temp.q_rem('QT-R') = 3 and pg_temp.q_nled('QT-R', 'QB-R7', 'deduct') = 1, v_res::text);
  -- 失敗回滾：退款帳寫入失敗 → 餘額、帳本都不留
  perform pg_temp.q_tk('QT-F', 6, 3, null); perform pg_temp.q_bk('QB-F1', 'QT-F'); perform pg_temp.q_led('QT-F', 'QB-F1', 'deduct', -1);
  create function pg_temp.q_boom() returns trigger language plpgsql as $f$ begin raise exception 'boom_qr_refund'; end $f$;
  create trigger q_boom_trg before insert on ticket_logs for each row when (new.action::text = 'refund' and new.booking_id = 'QB-F1') execute function pg_temp.q_boom();
  v_res := public.fn_refund_ticket('QT-F', 'QB-F1');
  drop trigger q_boom_trg on ticket_logs;
  perform pg_temp.q_rec('R9 [RPC fn_refund_ticket（新函式）＋故障注入] 退款失敗：回 REFUND.INTERNAL_ERROR，餘額不變、沒有 refund 帳（整筆回滾）', v_res->>'error_code' = 'REFUND.INTERNAL_ERROR' and pg_temp.q_rem('QT-F') = 3 and pg_temp.q_nled('QT-F', 'QB-F1', 'refund') = 0, v_res::text);
  perform pg_temp.q_tk('QT-G', 4, 4, null); perform pg_temp.q_bk('QB-G1', 'QT-G'); perform pg_temp.q_led('QT-G', 'QB-G1', 'deduct', -1);
  v_res := public.fn_refund_ticket('QT-G', 'QB-G1');
  perform pg_temp.q_rec('R10 [RPC fn_refund_ticket（新函式，真實入口）] 餘額已等於總堂數：拒絕（REFUND.BALANCE_FULL）、不產生 refund 帳、餘額不變', v_res->>'error_code' = 'REFUND.BALANCE_FULL' and pg_temp.q_rem('QT-G') = 4 and pg_temp.q_nled('QT-G', 'QB-G1', 'refund') = 0, v_res::text);
  perform pg_temp.q_tk('QT-H', 6, 2, null); perform pg_temp.q_bk('QB-H1', 'QT-H'); perform pg_temp.q_led('QT-H', 'QB-H1', 'deduct', -1); perform pg_temp.q_led('QT-H', 'QB-H1', 'deduct', -1);
  perform public.fn_refund_ticket('QT-H', 'QB-H1'); perform public.fn_refund_ticket('QT-H', 'QB-H1'); v_res := public.fn_refund_ticket('QT-H', 'QB-H1');
  perform pg_temp.q_rec('R11 [RPC fn_refund_ticket（新函式，真實入口）] 同一預約淨扣 2（多名額）：逐次各退 1，第三次不再退', pg_temp.q_rem('QT-H') = 4 and (v_res->>'refunded') = 'false', v_res::text);
  -- 授權
  perform pg_temp.q_tk('QT-P', 6, 3, null); perform pg_temp.q_bk('QB-P1', 'QT-P', 3, v_other_coach); perform pg_temp.q_led('QT-P', 'QB-P1', 'deduct', -1);
  perform pg_temp.q_claims(null);
  v_res := public.fn_refund_ticket('QT-P', 'QB-P1');
  perform pg_temp.q_rec('R12 [RPC＋身分模擬 claims，非真實 HTTP] 未登入：AUTH.FORBIDDEN、不動', v_res->>'error_code' = 'AUTH.FORBIDDEN' and pg_temp.q_rem('QT-P') = 3, v_res::text);
  perform pg_temp.q_claims(v_uid_coach);
  v_res := public.fn_refund_ticket('QT-P', 'QB-P1');
  perform pg_temp.q_rec('R12 [RPC＋身分模擬 claims，非真實 HTTP] 非該堂教練：REFUND.FORBIDDEN、不動', v_res->>'error_code' = 'REFUND.FORBIDDEN' and pg_temp.q_rem('QT-P') = 3, v_res::text);
  update bookings set coach_id = v_coach_id where id = 'QB-P1';
  v_res := public.fn_refund_ticket('QT-P', 'QB-P1');
  perform pg_temp.q_rec('R12 [RPC＋身分模擬 claims，非真實 HTTP] 該堂主責教練：可以退', (v_res->>'refunded') = 'true' and pg_temp.q_rem('QT-P') = 4, v_res::text);
  perform pg_temp.q_claims(null);
  perform pg_temp.q_rec('R13 [目錄／權限查詢] fn_refund_ticket：authenticated 可執行、anon／service_role 不可；內部函式不對任何 API 角色開放',
    has_function_privilege('authenticated', to_regprocedure('public.fn_refund_ticket(text,text,text)'), 'EXECUTE')
    and not has_function_privilege('anon', to_regprocedure('public.fn_refund_ticket(text,text,text)'), 'EXECUTE')
    and not has_function_privilege('service_role', to_regprocedure('public.fn_refund_ticket(text,text,text)'), 'EXECUTE')
    and not has_function_privilege('authenticated', to_regprocedure('public.fn_tk_refund_once(text,text,text)'), 'EXECUTE')
    and not has_function_privilege('authenticated', to_regprocedure('public.trg_tk_quota_guard()'), 'EXECUTE'), '');
  -- ═══ 操作人員（app.tk_operator）的作用域：交易區域、只在核心呼叫期間有效、呼叫後還原成呼叫前的值 ═══
  if v_uid_admin is null or v_admin_id is null then
    perform pg_temp.q_skip('R16–R20 操作人員作用域', '測試庫沒有有登入的管理員帳號（需要第二位櫃檯層級身分）');
  else
    perform pg_temp.q_tk('QT-O', 8, 3, null);   -- 起始 3＋5 次退款＝8（剛好滿，最後一次退款前餘額仍 < 總堂數）
    perform pg_temp.q_bk('QB-O1', 'QT-O'); perform pg_temp.q_led('QT-O', 'QB-O1', 'deduct', -1);
    perform pg_temp.q_bk('QB-O2', 'QT-O'); perform pg_temp.q_led('QT-O', 'QB-O2', 'deduct', -1);
    perform pg_temp.q_bk('QB-O3', 'QT-O'); perform pg_temp.q_led('QT-O', 'QB-O3', 'deduct', -1);
    perform pg_temp.q_bk('QB-O4', 'QT-O'); perform pg_temp.q_led('QT-O', 'QB-O4', 'deduct', -1);
    perform pg_temp.q_bk('QB-O5', 'QT-O'); perform pg_temp.q_led('QT-O', 'QB-O5', 'deduct', -1);
    -- R16 同一交易內連續呼叫、不同操作人員：各自記各自的 id
    perform pg_temp.q_claims(v_uid_desk);  v_res := public.fn_refund_ticket('QT-O', 'QB-O1');
    perform pg_temp.q_claims(v_uid_admin); v_res := public.fn_refund_ticket('QT-O', 'QB-O2');
    perform pg_temp.q_rec('R16 [RPC＋操作人員作用域（GUC）] 同一交易連續呼叫、不同操作人員：帳本 operator 各是各自的員工 id，沒有沿用前一位',
      (select operator = v_desk_id from ticket_logs where ticket_id = 'QT-O' and booking_id = 'QB-O1' and action::text = 'refund')
      and (select operator = v_admin_id from ticket_logs where ticket_id = 'QT-O' and booking_id = 'QB-O2' and action::text = 'refund')
      and v_desk_id is distinct from v_admin_id, v_desk_id || ' / ' || v_admin_id);
    -- R17 兩次呼叫之後設定已清空；之後走內部核心（例如 P0-E 超期自動取消）寫的是 system，不是上一位員工
    perform pg_temp.q_rec('R17 [RPC＋操作人員作用域（GUC）] 呼叫結束後 app.tk_operator 嚴格等於空字串（本交易稍早已被 fn_refund_ticket 設過；不是 NULL，也不是員工 id）', current_setting('app.tk_operator', true) = '', coalesce(current_setting('app.tk_operator', true), '<NULL>'));
    perform pg_temp.q_claims(null);
    perform public.fn_tk_refund_once('QT-O', 'QB-O3', 'qr 內部核心直接呼叫');
    perform pg_temp.q_rec('R17 [核心直接呼叫] 緊接在員工呼叫之後，內部核心寫的 operator 仍是 system（沒有沿用上一位員工）',
      (select operator = 'system' from ticket_logs where ticket_id = 'QT-O' and booking_id = 'QB-O3' and action::text = 'refund'), '');
    -- R18 異常被攔下後再次呼叫：設定回復到進入前的值；下一位操作人員記自己，不是失敗那一次的人
    create function pg_temp.q_boom3() returns trigger language plpgsql as $f$ begin raise exception 'boom_qr_operator'; end $f$;
    create trigger q_boom3_trg before insert on ticket_logs for each row when (new.action::text = 'refund' and new.booking_id = 'QB-O4') execute function pg_temp.q_boom3();
    perform pg_temp.q_claims(v_uid_desk); v_res := public.fn_refund_ticket('QT-O', 'QB-O4');
    perform pg_temp.q_rec('R18 [RPC＋故障注入＋操作人員作用域] 寫帳失敗被函式攔下：回 INTERNAL_ERROR，且 app.tk_operator 回到進入前的值（嚴格＝空字串）',
      v_res->>'error_code' = 'REFUND.INTERNAL_ERROR' and current_setting('app.tk_operator', true) = '', v_res::text || ' / ' || coalesce(current_setting('app.tk_operator', true), '<NULL>'));
    drop trigger q_boom3_trg on ticket_logs;
    perform pg_temp.q_claims(v_uid_admin); v_res := public.fn_refund_ticket('QT-O', 'QB-O4');
    perform pg_temp.q_rec('R18 [RPC＋操作人員作用域] 失敗之後換另一位員工再呼叫：成功，operator＝這位員工，不是剛才失敗那位',
      (v_res->>'refunded') = 'true' and (select operator = v_admin_id from ticket_logs where ticket_id = 'QT-O' and booking_id = 'QB-O4' and action::text = 'refund'), v_res::text);
    -- R19 外層已設定過值：呼叫期間用呼叫者、結束後還原成外層的值（不是清成空字串）
    perform set_config('app.tk_operator', 'OUTER', true);
    perform pg_temp.q_claims(v_uid_desk); v_res := public.fn_refund_ticket('QT-O', 'QB-O5');
    perform pg_temp.q_rec('R19 [RPC＋操作人員作用域] 外層已設 app.tk_operator=OUTER：本次帳本 operator＝呼叫的員工（不是 OUTER），呼叫結束後還原成 OUTER',
      (select operator = v_desk_id from ticket_logs where ticket_id = 'QT-O' and booking_id = 'QB-O5' and action::text = 'refund') and current_setting('app.tk_operator', true) = 'OUTER',
      coalesce(current_setting('app.tk_operator', true), 'null'));
    -- R20 拒絕／冪等路徑也還原（BALANCE_FULL 走到核心、ALREADY_REFUNDED 在設定之前就返回）
    perform pg_temp.q_tk('QT-OF', 4, 4, null); perform pg_temp.q_bk('QB-OF1', 'QT-OF'); perform pg_temp.q_led('QT-OF', 'QB-OF1', 'deduct', -1);
    perform set_config('app.tk_operator', 'OUTER2', true);
    v_res := public.fn_refund_ticket('QT-OF', 'QB-OF1');
    perform pg_temp.q_rec('R20 [RPC＋操作人員作用域] 餘額已滿（BALANCE_FULL）的拒絕路徑：外層值 OUTER2 仍被還原', v_res->>'error_code' = 'REFUND.BALANCE_FULL' and current_setting('app.tk_operator', true) = 'OUTER2', coalesce(current_setting('app.tk_operator', true), 'null'));
    v_res := public.fn_refund_ticket('QT-O', 'QB-O1');
    perform pg_temp.q_rec('R20 [RPC＋操作人員作用域] 已完全退款（ALREADY_REFUNDED）的冪等路徑：外層值 OUTER2 不被動到', (v_res->>'refunded') = 'false' and current_setting('app.tk_operator', true) = 'OUTER2', coalesce(current_setting('app.tk_operator', true), 'null'));
    perform set_config('app.tk_operator', '', true); perform pg_temp.q_claims(null);
  end if;
  -- R21 的情境 helper：同一組四條路徑（正常退款／餘額已滿拒絕／已退款冪等／寫帳失敗例外），在指定的起始狀態（空字串或 OUTER）下各跑一次，
  --   每條路徑都用**原始值**驗證「呼叫結束後 app.tk_operator 與呼叫前完全相同」（is not distinct from；不用 coalesce 合併 NULL 與空字串）。
  create function pg_temp.q_scn(p_tag text, p_label text, p_set boolean, p_start text, p_uid uuid, p_emp text) returns void language plpgsql as $f$
  declare v_tk text := 'QT-S' || p_tag; v_tkf text := 'QT-SF' || p_tag; v_res jsonb; v_before text; v_after text; v_b1 text := 'QB-S' || p_tag || '1'; v_b3 text := 'QB-S' || p_tag || '3'; v_b4 text := 'QB-S' || p_tag || '4';
  begin
    perform pg_temp.q_tk(v_tk, 6, 3, null); perform pg_temp.q_bk(v_b1, v_tk); perform pg_temp.q_led(v_tk, v_b1, 'deduct', -1);
    perform pg_temp.q_bk(v_b3, v_tk); perform pg_temp.q_led(v_tk, v_b3, 'deduct', -1);
    perform pg_temp.q_tk(v_tkf, 4, 4, null); perform pg_temp.q_bk(v_b4, v_tkf); perform pg_temp.q_led(v_tkf, v_b4, 'deduct', -1);
    perform pg_temp.q_claims(p_uid);
    -- 路徑 1：正常退款
    if p_set then perform set_config('app.tk_operator', p_start, true); end if;
    v_before := current_setting('app.tk_operator', true);
    v_res := public.fn_refund_ticket(v_tk, v_b1); v_after := current_setting('app.tk_operator', true);
    perform pg_temp.q_rec('R21 [RPC＋操作人員作用域（GUC）] ' || p_label || ' ‧正常退款：帳本 operator＝呼叫者，結束後設定還原為起始值', (v_res->>'refunded') = 'true'
      and (select operator = p_emp from ticket_logs where ticket_id = v_tk and booking_id = v_b1 and action::text = 'refund') and v_after is not distinct from v_before, coalesce(v_before, '<NULL>') || ' → ' || coalesce(v_after, '<NULL>'));
    -- 路徑 2：冪等（已完全退款）——在設定之前就返回，起始值不能被動到
    if p_set then perform set_config('app.tk_operator', p_start, true); end if;
    v_before := current_setting('app.tk_operator', true);
    v_res := public.fn_refund_ticket(v_tk, v_b1); v_after := current_setting('app.tk_operator', true);
    perform pg_temp.q_rec('R21 [RPC＋操作人員作用域（GUC）] ' || p_label || ' ‧已退款冪等（ALREADY_REFUNDED）：起始值不被動到', (v_res->>'refunded') = 'false' and v_after is not distinct from v_before, coalesce(v_before, '<NULL>') || ' → ' || coalesce(v_after, '<NULL>'));
    -- 路徑 3：拒絕（餘額已滿；有走到核心，所以是「設定後還原」的路徑）
    if p_set then perform set_config('app.tk_operator', p_start, true); end if;
    v_before := current_setting('app.tk_operator', true);
    v_res := public.fn_refund_ticket(v_tkf, v_b4); v_after := current_setting('app.tk_operator', true);
    perform pg_temp.q_rec('R21 [RPC＋操作人員作用域（GUC）] ' || p_label || ' ‧餘額已滿拒絕（BALANCE_FULL）：結束後設定還原為起始值', v_res->>'error_code' = 'REFUND.BALANCE_FULL' and v_after is not distinct from v_before, coalesce(v_before, '<NULL>') || ' → ' || coalesce(v_after, '<NULL>'));
    -- 路徑 4：例外（寫帳失敗，被函式本體的 EXCEPTION 子交易攔下）
    execute format('create or replace function pg_temp.q_boom_s() returns trigger language plpgsql as $b$ begin raise exception ''boom_qr_scn''; end $b$');
    execute format('create trigger q_boom_s_%s before insert on ticket_logs for each row when (new.action::text = ''refund'' and new.booking_id = %L) execute function pg_temp.q_boom_s()', p_tag, v_b3);
    if p_set then perform set_config('app.tk_operator', p_start, true); end if;
    v_before := current_setting('app.tk_operator', true);
    v_res := public.fn_refund_ticket(v_tk, v_b3); v_after := current_setting('app.tk_operator', true);
    execute format('drop trigger q_boom_s_%s on ticket_logs', p_tag);
    perform pg_temp.q_rec('R21 [RPC＋故障注入＋操作人員作用域] ' || p_label || ' ‧寫帳失敗被攔下（INTERNAL_ERROR）：設定回到進入前的值，且沒有留下 refund 帳', v_res->>'error_code' = 'REFUND.INTERNAL_ERROR' and v_after is not distinct from v_before
      and not exists (select 1 from ticket_logs where ticket_id = v_tk and booking_id = v_b3 and action::text = 'refund'), coalesce(v_before, '<NULL>') || ' → ' || coalesce(v_after, '<NULL>'));
  end $f$;
  perform pg_temp.q_claims(null);
  -- 起始狀態：空字串、OUTER（兩者都是本案例自己明確設定的）。**「真正未設定」不在這份測試裡驗證**——前面的案例已經設定過 app.tk_operator，
  --   不能再宣稱起始為未設定；請見四個獨立檔 p0e_12_operator_unset_A／B／C／D（每個都要全新連線，且先確認 current_setting(…, true) IS NULL）。
  perform pg_temp.q_scn('E', '起始＝空字串', true, '', v_uid_desk, v_desk_id);
  perform pg_temp.q_scn('O', '起始＝OUTER', true, 'OUTER', v_uid_desk, v_desk_id);
  perform set_config('app.tk_operator', '', true); perform pg_temp.q_claims(null);
  perform pg_temp.q_skip('R14 退款與其他扣課同時發生（真正兩條連線）', '單一交易內無法驗證；見 docs/testdb/concurrency/run_concurrency.sh（尚未執行）');
  perform pg_temp.q_skip('R15 不退堂取消', '櫃檯選「扣課不退」時前端不會呼叫 fn_refund_ticket，規則在前端；由 tests/refundatomictest.js 靜態驗證');

  raise exception 'QR_TESTS_RESULT: %', pg_temp.q_summary();
end
$qr$;
