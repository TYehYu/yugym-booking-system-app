-- ═══════════════════════════════════════════════════════════════════════
-- 正式庫專有預約觸發器 × P0-E／補償／退票／額度 相容性測試（尚未執行；⚠ 只能對測試庫；需先裝 p0e_13_prod_triggers_install_testdb.sql 與 p0e_12 套用檔）
-- 單一 DO，結尾必定回滾。**以 request.jwt.claims 把角色設成 authenticated**——正式庫的 hold／group 守門在 auth.role() 不是 authenticated／anon 時直接放行，
--   之前在測試庫（擁有者連線、沒有 JWT）跑過的測試等於全都繞過了這些守門，這份才是真正經過它們。
-- ═══════════════════════════════════════════════════════════════════════
do $pc$
declare v_uid_desk uuid; v_uid_coach uuid; v_desk_id text; v_coach_id text; v_res jsonb; v_d date := (now() at time zone 'Asia/Taipei')::date; v_msg text;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: 看起來像正式庫'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgrelid = 'public.bookings'::regclass and tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard','trg_bookings_contract_hold_guard','trg_bookings_hold_month_guard')) <> 5 then
    raise exception 'P0E13.PRECONDITION: 五個正式庫預約觸發器沒有全部在（先裝 p0e_13）'; end if;
  if to_regprocedure('public.fn_refund_ticket(text,text,text)') is null or to_regprocedure('public.fn_coach_leave_comp(text,text[])') is null then raise exception 'P0E13.PRECONDITION: 缺 p0e_12／補償'; end if;

  create temp table pc_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.c_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as $f$ insert into pc_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 200)) $f$;
  create function pg_temp.c_skip(p_name text, p_why text) returns void language sql as $f$ insert into pc_res(name, ok, detail) values ('SKIP ' || p_name, null, p_why) $f$;
  create function pg_temp.c_summary() returns text language sql as $f$
    select jsonb_build_object('pass', count(*) filter (where ok is true), 'fail', count(*) filter (where ok is false), 'skip', count(*) filter (where ok is null), 'total', count(*),
      'items', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'r', case when ok is null then 'SKIP' else 'FAIL' end, 'name', left(name, 90), 'detail', detail) order by (ok is null), n) from pc_res where ok is not true), '[]'::jsonb))::text from pc_res $f$;
  create function pg_temp.c_claims(p_uid uuid) returns void language sql as
    $f$ select set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true) $f$;
  create temp table pc_alerts(n serial primary key, typ text) on commit drop;
  create or replace function public.desk_alert(p_member_id text, p_type text, p_title text, p_body text) returns void language sql as $f$ insert into pc_alerts(typ) values (p_type) $f$;
  create function pg_temp.c_tk(p_id text, p_vd integer default null) returns void language plpgsql as $f$
  begin
    insert into members(id, name) values ('PC-M-' || p_id, 'PC測試會員') on conflict (id) do nothing;
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status, valid_days) values (p_id, 'PC-M-' || p_id, 'PC-T', 'PC方案', 8, 6, 'usable', p_vd);
  end $f$;
  create function pg_temp.c_bk(p_id text, p_tk text, p_off integer, p_cat text default '私人教練', p_coach text default null) returns void language sql as $f$
    insert into bookings(id, member_id, coach_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance)
    values (p_id, 'PC-M-' || p_tk, p_coach, p_cat::ticket_category, 'PC-T', (now() at time zone 'Asia/Taipei')::date + p_off, '10:00', 60, 'booked', false, p_tk, '[]'::jsonb, '{}'::jsonb) $f$;
  create function pg_temp.c_led(p_tk text, p_bk text, p_a text, p_d integer) returns void language sql as $f$
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values ('PC-LG-' || md5(random()::text || clock_timestamp()::text), p_tk, p_a::ticket_log_action, p_d, p_bk, 'pctest', 'pc fixture') $f$;
  insert into ticket_types(id, name, category) values ('PC-T', 'PC 教練課', '私人教練');
  select auth_id, id into v_uid_desk, v_desk_id from employees where role::text = 'front_desk' and status::text = 'active' and auth_id is not null limit 1;
  select auth_id, id into v_uid_coach, v_coach_id from employees where role::text = 'coach' and status::text = 'active' and auth_id is not null limit 1;
  if v_uid_desk is null or v_uid_coach is null then raise exception 'P0E13.PRECONDITION: 缺少有登入的櫃檯／教練員工'; end if;
  perform pg_temp.c_claims(v_uid_desk);
  perform pg_temp.c_rec('C0 現在的身分是 authenticated（守門會真的生效，不是繞過）', auth.role() = 'authenticated' and coalesce(is_staff_desk(), false), coalesce(auth.role(), 'null'));

  -- C1 櫃檯取消：bookings_cancelled_by 補上員工 id；與原子退票並存
  perform pg_temp.c_tk('PC-A'); perform pg_temp.c_bk('PC-A1', 'PC-A', 3); perform pg_temp.c_led('PC-A', 'PC-A1', 'deduct', -1);
  update bookings set status = 'cancelled' where id = 'PC-A1';
  v_res := public.fn_refund_ticket('PC-A', 'PC-A1');
  perform pg_temp.c_rec('C1 櫃檯取消：cancelled_by 由觸發器補成員工 id；原子退票同交易照常退 1 堂', (select cancelled_by = v_desk_id from bookings where id = 'PC-A1') and (v_res->>'refunded') = 'true', v_res::text);
  -- C2 bookings_touch：改期更新 updated_at
  perform pg_temp.c_bk('PC-A2', 'PC-A', 5); update bookings set date = v_d + 6 where id = 'PC-A2';
  perform pg_temp.c_rec('C2 改期：bookings_touch 更新 updated_at（欄位與觸發器一起存在）', (select updated_at is not null from bookings where id = 'PC-A2'), '');
  -- C3 P0-E：簽到啟用／撤銷（經過 hold 守門）
  perform pg_temp.c_tk('PC-B', 28); perform pg_temp.c_bk('PC-B1', 'PC-B', 4); perform pg_temp.c_led('PC-B', 'PC-B1', 'deduct', -1);
  update bookings set status = 'checked_in', checked_in_at = now() where id = 'PC-B1';
  perform pg_temp.c_rec('C3 P0-E 簽到啟用在正式庫守門之下照常（起算＝上課日、模式 checkin）', (select start_date = v_d + 4 and activation_mode = 'checkin' from member_tickets where id = 'PC-B'), '');
  update bookings set status = 'booked', checked_in_at = null where id = 'PC-B1';
  perform pg_temp.c_rec('C3 撤銷簽到 → 恢復未啟用', (select activated_at is null and activation_mode is null from member_tickets where id = 'PC-B'), '');
  -- C4 P0-E 超期自動取消：cancelled_by 明確寫 system，觸發器不得蓋掉
  alter table public.ticket_logs disable trigger trg_tk_window_ledger; alter table public.bookings disable trigger trg_tk_window_booking_ins; alter table public.bookings disable trigger trg_tk_window_booking_upd;
  perform pg_temp.c_tk('PC-C', 7); perform pg_temp.c_bk('PC-C0', 'PC-C', 2); perform pg_temp.c_bk('PC-C1', 'PC-C', 15);
  perform pg_temp.c_led('PC-C', 'PC-C0', 'deduct', -1); perform pg_temp.c_led('PC-C', 'PC-C1', 'deduct', -1);
  alter table public.ticket_logs enable trigger trg_tk_window_ledger; alter table public.bookings enable trigger trg_tk_window_booking_ins; alter table public.bookings enable trigger trg_tk_window_booking_upd;
  update bookings set status = 'checked_in', checked_in_at = now() where id = 'PC-C0';
  perform pg_temp.c_rec('C4 P0-E 超期自動取消：預約被取消、cancelled_by 仍是 system（bookings_cancelled_by 不蓋掉）、退堂 1 次',
    (select status::text = 'cancelled' and cancelled_by = 'system' from bookings where id = 'PC-C1')
    and (select count(*) from ticket_logs where ticket_id = 'PC-C' and booking_id = 'PC-C1' and action::text = 'refund') = 1, (select coalesce(cancelled_by, 'null') from bookings where id = 'PC-C1'));
  -- C5 hold 月份守門（P0-C「原課改為待簽約」寫成的形狀）：遠期被擋、近期放行
  perform pg_temp.c_tk('PC-D'); perform pg_temp.c_bk('PC-D1', 'PC-D', 90); perform pg_temp.c_bk('PC-D2', 'PC-D', 1);
  -- fixture：fn_hold_month_guard 只有在「該會員有一張實際能用在這堂課的票（usable、剩餘>0、效期涵蓋、同票種）」時才放行遠期卡位。
  --   為了驗證「沒有合格票券 → 被擋」，這位會員的唯一一張票必須不合格（用完）。這只改測試資料，不改任何業務規則。
  update member_tickets set sessions_remaining = 0, status = 'used_up' where id = 'PC-D';
  begin
    update bookings set pending_contract = true, ticket_id = null where id = 'PC-D1';
    perform pg_temp.c_rec('C5 遠期卡位（無合格票券）被 HOLD.MONTH_LIMIT 擋下', false, '沒有拋錯');
  exception when others then perform pg_temp.c_rec('C5 遠期卡位（該會員沒有合格票券）被 HOLD.MONTH_LIMIT 擋下（P0-C 的 RPC 會原樣回傳這個代碼）', sqlerrm like 'HOLD.MONTH_LIMIT:%', sqlerrm); end;
  update bookings set pending_contract = true, ticket_id = null where id = 'PC-D2';
  perform pg_temp.c_rec('C5 近期卡位放行', (select pending_contract and ticket_id is null from bookings where id = 'PC-D2'), '');
  -- C6 group_guard：櫃檯可建團課；教練不能建立／刪除團課，但可更新（簽到、請假）
  begin perform pg_temp.c_bk('PC-G1', 'PC-A', 8, '小班肌力'); perform pg_temp.c_rec('C6 櫃檯建立團課放行', true); exception when others then perform pg_temp.c_rec('C6 櫃檯建立團課放行', false, sqlerrm); end;
  perform pg_temp.c_claims(v_uid_coach);
  begin perform pg_temp.c_bk('PC-G2', 'PC-A', 9, '小班肌力'); perform pg_temp.c_rec('C6 教練建立團課被擋（既有規則不變）', false, '沒有拋錯');
  exception when others then perform pg_temp.c_rec('C6 教練建立團課被擋（既有規則不變）', sqlerrm like 'BK.GUARD:%', sqlerrm); end;
  begin update bookings set attendance = '{"PC-M-PC-A":"checked_in"}'::jsonb where id = 'PC-G1'; perform pg_temp.c_rec('C6 教練更新團課名單／簽到不被擋（P0-E 座位簽到觸發器只 UPDATE）', true);
  exception when others then perform pg_temp.c_rec('C6 教練更新團課名單／簽到不被擋', false, sqlerrm); end;
  perform pg_temp.c_claims(v_uid_desk);
  -- C7 補償 RPC 在守門之下：請假狀態寫入 → 展延
  perform pg_temp.c_tk('PC-E', 28); update member_tickets set start_date = v_d, expire_date = v_d + 27, activated_at = now(), activation_mode = 'checkin' where id = 'PC-E';
  perform pg_temp.c_bk('PC-E1', 'PC-E', 8); perform pg_temp.c_led('PC-E', 'PC-E1', 'deduct', -1);
  update bookings set status = 'coach_leave', coach_leave = true where id = 'PC-E1';
  v_res := public.fn_coach_leave_comp('PC-E1');
  perform pg_temp.c_rec('C7 教練請假補償 RPC 在正式庫守門之下照常（展延 7 天）', v_res->'results'->0->>'action' = 'grant' and (select expire_date = v_d + 34 from member_tickets where id = 'PC-E'), v_res::text);
  -- C8 額度防護與 hold／cancelled_by 並存：取消（退款）後額度恢復
  perform pg_temp.c_tk('PC-F'); update member_tickets set unlocked_sessions = 3, sessions_remaining = 5 where id = 'PC-F';   -- 已用 3＝額度上限
  begin update member_tickets set sessions_remaining = 4 where id = 'PC-F'; perform pg_temp.c_rec('C8 額度防護：分期票使用量超過開通額度被擋', false, '沒有拋錯');
  exception when others then perform pg_temp.c_rec('C8 額度防護：分期票使用量超過開通額度被擋', sqlerrm = 'TICKET.INSTALLMENT_LOCKED', sqlerrm); end;
  perform pg_temp.c_skip('C9 真正呼叫 fn_move_booking_ticket（hold／cancel 兩種模式）在這五個守門下', '請對既有 move_ticket_01／p0e_08 加上 authenticated 身分變體重跑（見 make_compat_variants.sh）；需要時再授權');
  raise exception 'P0E13_COMPAT_RESULT: %', pg_temp.c_summary();
end
$pc$;
