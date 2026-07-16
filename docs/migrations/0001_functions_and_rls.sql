-- ============================================================
-- YUGYM baseline（0001）— functions + event trigger + RLS + policies
-- 由正式資料庫 rlpiomzplckzqnqrvrwc 於 2026-07-16 萃取重建（1:1 對齊，含未修正的 fn_create_booking）
-- 依賴 0000_baseline_schema.sql（表需先存在）
-- ============================================================
set check_function_bodies = off;

-- ========== 輔助函式 ==========
create or replace function public.gen_short_id(p_prefix text)
 returns text language sql as $function$
  SELECT p_prefix || lower(to_hex((extract(epoch from clock_timestamp())*1000)::bigint))
    || substr(md5(random()::text),1,4);
$function$;

create or replace function public.current_staff_role() returns text
 language sql stable security definer as $function$
  select role::text from employees where auth_id = auth.uid() limit 1;
$function$;

create or replace function public.current_employee_id() returns text
 language sql stable security definer as $function$
  select id from employees where auth_id = auth.uid() limit 1;
$function$;

create or replace function public.current_member_id() returns text
 language sql stable security definer as $function$
  select id from members where auth_id = auth.uid() limit 1;
$function$;

create or replace function public.is_admin() returns boolean
 language sql stable security definer as $function$ select current_staff_role() = 'admin'; $function$;

create or replace function public.is_staff_desk() returns boolean
 language sql stable security definer as $function$ select current_staff_role() in ('admin','front_desk'); $function$;

create or replace function public.is_any_staff() returns boolean
 language sql stable security definer as $function$ select current_staff_role() is not null; $function$;

create or replace function public.is_coach() returns boolean
 language sql stable security definer as $function$
  select exists(select 1 from employees where auth_id = auth.uid() and role = 'coach');
$function$;

create or replace function public.can_coach_see_member(m_id text) returns boolean
 language sql stable security definer as $function$
  select
    exists(
      select 1 from members mm
      join employees e on e.id = mm.default_coach_id
      where mm.id = m_id and e.auth_id = auth.uid()
    )
    or exists(
      select 1 from bookings b
      join employees e on (e.id = b.coach_id or e.id = b.substitute_coach_id)
      where e.auth_id = auth.uid()
        and (b.member_id = m_id or b.member_ids ? m_id)
    );
$function$;

-- ========== Booking Engine helper / handler ==========
create or replace function public.space_check(p_space_id text, p_resource_id text, p_date date, p_start text, p_duration integer, p_coach_id text, p_exclude_booking text default null::text)
 returns jsonb language plpgsql security definer as $function$
DECLARE
  v_start int := split_part(p_start,':',1)::int*60 + split_part(p_start,':',2)::int;
  v_end   int := v_start + p_duration;
  v_cnt   int;
  v_status text;
  overlap_cond text := format(
    $q$ date=%L AND status NOT IN ('cancelled','no_show')
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int) < %s
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int + coalesce(duration,60)) > %s
        AND (%L IS NULL OR id <> %L) $q$,
    p_date, v_end, v_start, p_exclude_booking, p_exclude_booking);
BEGIN
  IF p_coach_id IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE coach_id=%L AND %s', p_coach_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.TIME_CONFLICT'; END IF;
  END IF;

  IF p_space_id = 'general' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''general'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt >= 3 THEN RAISE EXCEPTION 'BOOKING.SPACE_FULL'; END IF;
  ELSIF p_space_id = 'group_room' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''group_room'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  ELSIF p_space_id = 'treadmill' THEN
    SELECT status INTO v_status FROM space_resources WHERE id = p_resource_id;
    IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'BOOKING.RESOURCE_MAINTENANCE'; END IF;
    EXECUTE format('SELECT count(*) FROM bookings WHERE resource_id=%L AND %s', p_resource_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  END IF;

  RETURN jsonb_build_object('ok',true);
END $function$;

create or replace function public.benefit_consume(p_member_id text, p_benefit_type text, p_qty integer, p_booking_id text)
 returns jsonb language plpgsql security definer as $function$
DECLARE v_ticket member_tickets%ROWTYPE;
BEGIN
  IF p_benefit_type = 'none' THEN
    RETURN jsonb_build_object('ok',true,'benefit_ref',NULL,'remaining_after',NULL);
  END IF;

  SELECT mt.* INTO v_ticket
    FROM member_tickets mt
    JOIN ticket_types tt ON tt.id = mt.ticket_type_id
   WHERE mt.member_id = p_member_id
     AND tt.benefit_type = p_benefit_type
     AND mt.sessions_remaining >= p_qty
     AND mt.status = 'usable'
     AND (mt.expire_date IS NULL OR mt.expire_date >= CURRENT_DATE)
   ORDER BY mt.expire_date ASC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM member_tickets mt JOIN ticket_types tt ON tt.id=mt.ticket_type_id
                WHERE mt.member_id=p_member_id AND tt.benefit_type=p_benefit_type) THEN
      RAISE EXCEPTION '%', CASE WHEN p_benefit_type='training_pass' THEN 'POINT.EMPTY' ELSE 'TICKET.EXPIRED' END;
    ELSE
      RAISE EXCEPTION '%', CASE WHEN p_benefit_type='training_pass' THEN 'POINT.EMPTY' ELSE 'TICKET.EMPTY' END;
    END IF;
  END IF;

  UPDATE member_tickets SET sessions_remaining = sessions_remaining - p_qty
   WHERE id = v_ticket.id;

  INSERT INTO ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  VALUES (gen_short_id('LG-'), v_ticket.id, 'deduct', -p_qty, p_booking_id, 'system', '預約扣除');

  RETURN jsonb_build_object('ok',true,'benefit_ref',v_ticket.id,
                            'remaining_after', v_ticket.sessions_remaining - p_qty);
END $function$;

create or replace function public.benefit_refund(p_benefit_ref text, p_qty integer, p_booking_id text)
 returns jsonb language plpgsql security definer as $function$
BEGIN
  IF p_benefit_ref IS NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  UPDATE member_tickets SET sessions_remaining = sessions_remaining + p_qty
   WHERE id = p_benefit_ref;
  INSERT INTO ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  VALUES (gen_short_id('LG-'), p_benefit_ref, 'refund', p_qty, p_booking_id, 'system', '取消返還原票');
  RETURN jsonb_build_object('ok',true);
END $function$;

create or replace function public.handle_checkin_reward(p_booking_id text)
 returns void language plpgsql security definer as $function$
DECLARE
  b        bookings%ROWTYPE;
  rule     reward_rules%ROWTYPE;
  v_ticket text;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF b.reward_status <> 'pending' THEN RETURN; END IF;

  SELECT * INTO rule FROM reward_rules
   WHERE event_type='booking_checkin'
     AND source_benefit_type = b.benefit_type
     AND active = true
   LIMIT 1;

  IF NOT FOUND THEN
    UPDATE bookings SET reward_status='skipped' WHERE id = b.id;
    RETURN;
  END IF;

  IF b.member_id IS NULL THEN
    UPDATE bookings SET reward_status='skipped' WHERE id = b.id;
    RETURN;
  END IF;

  IF b.checked_in_at::date <> b.date THEN
    UPDATE bookings SET reward_status='skipped' WHERE id = b.id;
    RETURN;
  END IF;

  v_ticket := gen_short_id('TK-');
  INSERT INTO member_tickets
    (id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining,
     start_date, expire_date, status, source, source_type, source_ref, source_booking_id)
  VALUES
    (v_ticket, b.member_id, rule.reward_ticket_type_id, '自主訓練點數',
     rule.reward_amount, rule.reward_amount,
     b.date, b.date + rule.valid_days, 'usable',
     'checkin_grant', 'checkin', b.id, b.id);

  INSERT INTO ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  VALUES (gen_short_id('LG-'), v_ticket, 'grant', rule.reward_amount, b.id, 'system',
          '教練課簽到發放自主訓練點數');

  UPDATE bookings SET reward_status='issued', reward_issued_at=now(),
                      reward_type=rule.reward_ticket_type_id, reward_issued=true
  WHERE id = b.id;
END $function$;

-- ========== 核心 RPC（原樣，含未修正的 fn_create_booking：p_category::booking_category）==========
-- 注意：此為正式庫「修正前」版本，故意保留以達成 1:1 對齊；
--       0000/0001 套用後，再套 20260716_01_fix_fn_create_booking.sql 修正。
create or replace function public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer default 60, p_space_id text default 'general'::text, p_resource_id text default 'general_area'::text, p_note text default null::text)
 returns jsonb language plpgsql security definer as $function$
DECLARE
  v_booking text := gen_short_id('BK-');
  v_consume jsonb;
  v_qty int := CASE WHEN p_benefit_type='training_pass' THEN 1 ELSE 1 END;
BEGIN
  PERFORM space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, NULL);

  INSERT INTO bookings (id, member_id, coach_id, category, benefit_type,
                        date, start_time, duration, status,
                        space_id, resource_id, reward_status, note, created_at)
  VALUES (v_booking, p_member_id, p_coach_id, p_category::booking_category, p_benefit_type,
          p_date, p_start_time, p_duration, 'booked',
          p_space_id, p_resource_id, 'pending', p_note, now());

  v_consume := benefit_consume(p_member_id, p_benefit_type, v_qty, v_booking);

  UPDATE bookings SET ticket_id = v_consume->>'benefit_ref' WHERE id = v_booking;

  RETURN jsonb_build_object('ok',true,'booking_id',v_booking,
    'benefit_ref', v_consume->>'benefit_ref',
    'remaining_after', v_consume->'remaining_after');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error_code',SQLERRM);
END $function$;

create or replace function public.fn_cancel_booking(p_booking_id text, p_reason text default null::text)
 returns jsonb language plpgsql security definer as $function$
DECLARE
  b            bookings%ROWTYPE;
  v_hours_before numeric;
  v_should_refund boolean;
  v_start_ts   timestamptz;
BEGIN
  SELECT * INTO b FROM bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); END IF;
  IF b.status='cancelled' THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;

  v_start_ts := (b.date || ' ' || b.start_time)::timestamptz;
  v_hours_before := EXTRACT(EPOCH FROM (v_start_ts - now()))/3600;

  IF v_hours_before >= 24 THEN
    v_should_refund := true;
  ELSE
    v_should_refund := false;
  END IF;

  IF v_should_refund AND b.ticket_id IS NOT NULL THEN
    PERFORM benefit_refund(b.ticket_id, 1, b.id);
  END IF;

  UPDATE bookings SET status='cancelled', cancelled_at=now(),
                      reward_status = CASE WHEN reward_status='issued' THEN 'revoked' ELSE reward_status END,
                      makeup_status = CASE
                        WHEN NOT v_should_refund AND b.benefit_type IN ('coaching_session','friendly_session')
                          THEN 'eligible_pending'
                        ELSE 'not_requested' END
  WHERE id=b.id;

  RETURN jsonb_build_object('ok',true,'booking_id',b.id,
    'cancellation_result', CASE WHEN v_should_refund THEN 'refunded' ELSE 'forfeited' END,
    'refunded_ticket', CASE WHEN v_should_refund THEN b.ticket_id ELSE NULL END,
    'makeup', CASE WHEN NOT v_should_refund AND b.benefit_type IN ('coaching_session','friendly_session')
                   THEN 'eligible_pending' ELSE 'not_requested' END);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error_code',SQLERRM);
END $function$;

-- fn_checkin_booking：兩參數版（含權限檢查）
create or replace function public.fn_checkin_booking(p_booking_id text, p_checkin_source text default 'front_desk'::text)
 returns jsonb language plpgsql security definer as $function$
DECLARE
  b            bookings%ROWTYPE;
  v_uid        text := auth.uid()::text;
  v_emp        text;
  v_is_staff   boolean;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); END IF;
  IF b.status = 'cancelled' THEN RETURN jsonb_build_object('ok',false,'error_code','BOOKING.CANCELLED'); END IF;

  IF b.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already',true,'reward_status',b.reward_status);
  END IF;

  v_is_staff := is_any_staff();
  IF p_checkin_source = 'member_app' THEN
    IF current_member_id() IS NULL OR current_member_id() <> b.member_id THEN
      RETURN jsonb_build_object('ok',false,'error_code','MEMBER.INVALID');
    END IF;
  ELSE
    IF NOT v_is_staff THEN
      RETURN jsonb_build_object('ok',false,'error_code','MEMBER.INVALID');
    END IF;
    v_emp := current_employee_id();
  END IF;

  UPDATE bookings
     SET status='checked_in', checked_in_at=now(),
         checkin_source=p_checkin_source,
         actor_user_id=v_uid, operator_employee_id=v_emp
   WHERE id = b.id;

  PERFORM handle_checkin_reward(b.id);

  SELECT * INTO b FROM bookings WHERE id=b.id;
  RETURN jsonb_build_object('ok',true,'booking_id',b.id,'status',b.status,
    'checkin_source',b.checkin_source,'reward_status',b.reward_status,
    'reward_issued_at',b.reward_issued_at);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error_code','BOOKING.CHECKIN_FAILED','message',SQLERRM);
END $function$;

-- fn_checkin_booking：三參數版（無權限檢查；正式庫既有，Sprint 3 將移除）
create or replace function public.fn_checkin_booking(p_booking_id text, p_checkin_source text default 'front_desk'::text, p_operator text default null::text)
 returns jsonb language plpgsql security definer as $function$
DECLARE b bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error_code', 'BOOKING.NOT_FOUND'); END IF;
  IF b.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'error_code', 'BOOKING.CANCELLED'); END IF;
  IF b.status = 'checked_in' OR b.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'reward_status', b.reward_status);
  END IF;
  UPDATE bookings SET status='checked_in', checked_in_at = now(), checkin_source = p_checkin_source WHERE id = b.id;
  PERFORM handle_checkin_reward(b.id);
  SELECT * INTO b FROM bookings WHERE id = b.id;
  RETURN jsonb_build_object('ok', true, 'booking_id', b.id, 'status', b.status,
    'checkin_source', b.checkin_source, 'reward_status', b.reward_status, 'reward_issued_at', b.reward_issued_at);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error_code', 'BOOKING.CHECKIN_FAILED', 'message', SQLERRM);
END $function$;

-- ========== event trigger：新表自動開 RLS（正式庫既有）==========
create or replace function public.rls_auto_enable()
 returns event_trigger language plpgsql security definer set search_path to 'pg_catalog' as $function$
DECLARE cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
  execute function public.rls_auto_enable();

-- ========== 開啟 RLS（全 25 表）==========
alter table public.app_state enable row level security;
alter table public.attendance enable row level security;
alter table public.bookings enable row level security;
alter table public.category enable row level security;
alter table public.course_plans enable row level security;
alter table public.employees enable row level security;
alter table public.exercises enable row level security;
alter table public.leave_settlements enable row level security;
alter table public.member_level enable row level security;
alter table public.member_tickets enable row level security;
alter table public.members enable row level security;
alter table public.notifications enable row level security;
alter table public.punch_requests enable row level security;
alter table public.purchase_applications enable row level security;
alter table public.purchases enable row level security;
alter table public.reward_rules enable row level security;
alter table public.salary_templates enable row level security;
alter table public.shifts enable row level security;
alter table public.space_resources enable row level security;
alter table public.spaces enable row level security;
alter table public.ticket_logs enable row level security;
alter table public.ticket_type_member_levels enable row level security;
alter table public.ticket_types enable row level security;
alter table public.training_logs enable row level security;
alter table public.venues enable row level security;

-- ========== RLS 政策（正式庫現況，含 USING(true) 全開；Sprint 2 才收斂）==========
create policy "Allow public insert app state" on public.app_state as permissive for insert to anon with check ((id = 'yugym-booking-system-v1'::text));
create policy "Allow public read app state" on public.app_state as permissive for select to anon using ((id = 'yugym-booking-system-v1'::text));
create policy "Allow public update app state" on public.app_state as permissive for update to anon using ((id = 'yugym-booking-system-v1'::text)) with check ((id = 'yugym-booking-system-v1'::text));
create policy "app_state_all" on public.app_state as permissive for all to public using (true) with check (true);
create policy "attendance_all" on public.attendance as permissive for all to public using (true) with check (true);
create policy "bookings_all" on public.bookings as permissive for all to public using (true) with check (true);
create policy "bookings_all_staff" on public.bookings as permissive for all to public using (is_staff_desk()) with check (is_staff_desk());
create policy "bookings_select_all_coach" on public.bookings as permissive for select to public using ((exists ( select 1 from employees e where ((e.auth_id = auth.uid()) and (e.role = 'coach'::staff_role)))));
create policy "bookings_select_coach" on public.bookings as permissive for select to public using ((coach_id = current_employee_id()));
create policy "bookings_select_member" on public.bookings as permissive for select to public using ((member_id = current_member_id()));
create policy "course_plans_all" on public.course_plans as permissive for all to public using (true) with check (true);
create policy "cp_select_all" on public.course_plans as permissive for select to public using ((auth.uid() is not null));
create policy "cp_write_admin" on public.course_plans as permissive for all to public using (is_admin()) with check (is_admin());
create policy "employees_all" on public.employees as permissive for all to public using (true) with check (true);
create policy "employees_delete" on public.employees as permissive for delete to public using (is_admin());
create policy "employees_insert" on public.employees as permissive for insert to anon, authenticated with check (true);
create policy "employees_invite_select" on public.employees as permissive for select to anon, authenticated using ((invite_status = 'pending'::text));
create policy "employees_invite_update" on public.employees as permissive for update to anon, authenticated using ((invite_status = 'pending'::text)) with check ((invite_status = 'completed'::text));
create policy "employees_select" on public.employees as permissive for select to public using ((is_staff_desk() or (auth_id = auth.uid())));
create policy "employees_select_all_coach" on public.employees as permissive for select to public using (is_coach());
create policy "employees_update" on public.employees as permissive for update to authenticated using (((is_staff_desk() or (auth_id = auth.uid())) and (invite_status is distinct from 'pending'::text))) with check (((is_staff_desk() or (auth_id = auth.uid())) and (invite_status is distinct from 'pending'::text)));
create policy "exercises_all" on public.exercises as permissive for all to public using (true) with check (true);
create policy "leave_settlements_all" on public.leave_settlements as permissive for all to public using (true) with check (true);
create policy "leave_settlements_all_authenticated" on public.leave_settlements as permissive for all to authenticated using (true) with check (true);
create policy "member_tickets_all" on public.member_tickets as permissive for all to public using (true) with check (true);
create policy "mt_all_staff" on public.member_tickets as permissive for all to public using (is_staff_desk()) with check (is_staff_desk());
create policy "mt_select_member" on public.member_tickets as permissive for select to public using ((member_id = current_member_id()));
create policy "members_all" on public.members as permissive for all to public using (true) with check (true);
create policy "members_delete" on public.members as permissive for delete to public using (is_admin());
create policy "members_select" on public.members as permissive for select to public using ((is_staff_desk() or (auth_id = auth.uid()) or can_coach_see_member(id)));
create policy "members_update" on public.members as permissive for update to public using ((is_staff_desk() or (auth_id = auth.uid())));
create policy "public_self_signup_members" on public.members as permissive for insert to anon, authenticated with check (true);
create policy "notif_all_staff" on public.notifications as permissive for all to public using (is_staff_desk()) with check (is_staff_desk());
create policy "notifications_all" on public.notifications as permissive for all to public using (true) with check (true);
create policy "punch_requests_all" on public.punch_requests as permissive for all to public using (true) with check (true);
create policy "pa_insert" on public.purchase_applications as permissive for insert to anon, authenticated with check (true);
create policy "pa_select" on public.purchase_applications as permissive for select to anon, authenticated using (true);
create policy "pa_update" on public.purchase_applications as permissive for update to anon, authenticated using (true) with check (true);
create policy "purchase_applications_all" on public.purchase_applications as permissive for all to public using (true) with check (true);
create policy "purchases_all" on public.purchases as permissive for all to public using (true) with check (true);
create policy "salary_templates_all" on public.salary_templates as permissive for all to public using (true) with check (true);
create policy "shifts_all" on public.shifts as permissive for all to public using (true) with check (true);
create policy "space_resources_all" on public.space_resources as permissive for all to public using (true) with check (true);
create policy "spaces_all" on public.spaces as permissive for all to public using (true) with check (true);
create policy "ticket_logs_all" on public.ticket_logs as permissive for all to public using (true) with check (true);
create policy "tl_all_staff" on public.ticket_logs as permissive for all to public using (is_staff_desk()) with check (is_staff_desk());
create policy "ticket_types_all" on public.ticket_types as permissive for all to public using (true) with check (true);
create policy "tt_select_all" on public.ticket_types as permissive for select to public using ((auth.uid() is not null));
create policy "tt_write_admin" on public.ticket_types as permissive for all to public using (is_admin()) with check (is_admin());
create policy "tlog_delete_auth" on public.training_logs as permissive for delete to authenticated using (true);
create policy "tlog_insert_auth" on public.training_logs as permissive for insert to authenticated with check (true);
create policy "tlog_select_auth" on public.training_logs as permissive for select to authenticated using (true);
create policy "tlog_update_auth" on public.training_logs as permissive for update to authenticated using (true) with check (true);
create policy "training_logs_all" on public.training_logs as permissive for all to public using (true) with check (true);
create policy "venues_all" on public.venues as permissive for all to public using (true) with check (true);
