-- 20260716_04_rpc_authz_hardening.sql
-- 目的：收斂 SECURITY DEFINER RPC 的執行權限與身分檢查（Sprint 3 上線後補強）
--
-- 【背景】
-- Sprint 3 的預約/取消/簽到改走資料庫 RPC。這些函式與其呼叫的內部函式皆為
-- SECURITY DEFINER —— 以函式擁有者的權限執行，設計上就會繞過 RLS。
--
-- 兩個問題：
-- 1. EXECUTE 權限沿用 PostgreSQL 預設值（授予 PUBLIC）。Supabase 的 anon 與
--    authenticated 都是 PUBLIC 成員，等於未登入者也能呼叫。
-- 2. 函式內部未一致檢查呼叫者身分：fn_checkin_booking 有做，fn_create_booking
--    與 fn_cancel_booking 沒有。
--
-- Sprint 2 的 RLS 只約束「直接讀寫資料表」，不影響 SECURITY DEFINER 函式，
-- 因此這是一條獨立於 RLS 之外、未受保護的路徑。
--
-- 【修法】
-- 1. 內部函式收回外部 EXECUTE：benefit_consume / benefit_refund /
--    handle_checkin_reward / space_check / rls_auto_enable。
--    這些前端未曾呼叫（index.html 僅呼叫三支 fn_*），RLS 政策亦未引用；
--    由 fn_* 內部呼叫時以擁有者身分執行，不受此限制影響。
-- 2. fn_create_booking / fn_cancel_booking 補上身分檢查，比照 fn_checkin_booking
--    既有寫法：員工（is_any_staff）不限；會員僅限本人；未登入一律拒絕。
-- 3. 三支前端 RPC 收回 anon，僅 authenticated 可呼叫。
--
-- 【不動的部分】
-- is_admin / is_staff_desk / current_employee_id / current_member_id / is_coach /
-- can_coach_see_member / is_any_staff 共 7 支被 RLS 政策引用（is_admin 與
-- is_staff_desk 各被 13 條政策使用）。政策以呼叫者身分求值，收回這些函式的
-- EXECUTE 會導致全站讀取失敗，故保留。
--
-- 【驗證】
-- 測試庫：未登入呼叫上述函式全數回 42501；員工建立→簽到→取消流程正常，
-- 票券扣退正確；會員對他人資料的操作回 AUTH.FORBIDDEN。
-- 正式庫：套用後確認未登入呼叫全擋、RLS 輔助函式未受影響、授權矩陣符合預期。
-- 正式庫 ticket_logs 查核：全數為正常人員操作，無異常紀錄。
--
-- 【日後新增 SECURITY DEFINER 函式的檢查清單】
-- - 明確 REVOKE EXECUTE FROM PUBLIC, anon（勿依賴預設值）
-- - 僅 GRANT 給實際需要的角色
-- - 函式內以 is_any_staff() / current_member_id() 等檢查呼叫者身分
-- - RLS 綠燈不代表此路徑安全，兩者需分別驗證
--
-- 【回退】
-- 將本檔 create or replace 的兩支函式改回舊版（移除身分檢查區塊），並執行
-- grant execute on function <sig> to public; 即可回到原狀。

begin;

-- ── 1. 內部函式收回外部執行權 ───────────────────────────────────────────────
revoke execute on function public.benefit_consume(p_member_id text, p_benefit_type text, p_qty integer, p_booking_id text) from public, anon, authenticated;
revoke execute on function public.benefit_refund(p_benefit_ref text, p_qty integer, p_booking_id text) from public, anon, authenticated;
revoke execute on function public.handle_checkin_reward(p_booking_id text) from public, anon, authenticated;
revoke execute on function public.space_check(p_space_id text, p_resource_id text, p_date date, p_start text, p_duration integer, p_coach_id text, p_exclude_booking text) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ── 2. fn_cancel_booking：補身分檢查 ────────────────────────────────────────
-- 員工可取消任何預約；會員僅能取消自己的；未登入一律拒絕。
create or replace function public.fn_cancel_booking(p_booking_id text, p_reason text default null::text)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE b bookings%ROWTYPE; v_hours_before numeric; v_should_refund boolean; v_start_ts timestamptz;
BEGIN
  SELECT * INTO b FROM bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); END IF;

  -- 身分檢查（新增）：非員工者，僅能取消自己的預約
  IF NOT is_any_staff() THEN
    IF current_member_id() IS NULL OR current_member_id() <> b.member_id THEN
      RETURN jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    END IF;
  END IF;

  IF b.status='cancelled' THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  v_start_ts := (b.date || ' ' || b.start_time)::timestamptz;
  v_hours_before := EXTRACT(EPOCH FROM (v_start_ts - now()))/3600;
  IF v_hours_before >= 24 THEN v_should_refund := true; ELSE v_should_refund := false; END IF;
  IF v_should_refund AND b.ticket_id IS NOT NULL THEN PERFORM benefit_refund(b.ticket_id, 1, b.id); END IF;
  UPDATE bookings SET status='cancelled', cancelled_at=now(), reward_status = CASE WHEN reward_status='issued' THEN 'revoked' ELSE reward_status END,
    makeup_status = CASE WHEN NOT v_should_refund AND b.benefit_type IN ('coaching_session','friendly_session') THEN 'eligible_pending' ELSE 'not_requested' END
  WHERE id=b.id;
  RETURN jsonb_build_object('ok',true,'booking_id',b.id,'cancellation_result', CASE WHEN v_should_refund THEN 'refunded' ELSE 'forfeited' END,
    'refunded_ticket', CASE WHEN v_should_refund THEN b.ticket_id ELSE NULL END,
    'makeup', CASE WHEN NOT v_should_refund AND b.benefit_type IN ('coaching_session','friendly_session') THEN 'eligible_pending' ELSE 'not_requested' END);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error_code',SQLERRM);
END $function$;

-- ── 3. fn_create_booking：補身分檢查 ────────────────────────────────────────
-- 員工可為任何會員建立；會員僅能為自己建立；未登入一律拒絕。
create or replace function public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer default 60, p_space_id text default 'general'::text, p_resource_id text default 'general_area'::text, p_note text default null::text)
returns jsonb
language plpgsql
security definer
as $function$
DECLARE v_booking text := gen_short_id('BK-'); v_consume jsonb; v_qty int := CASE WHEN p_benefit_type='training_pass' THEN 1 ELSE 1 END;
BEGIN
  -- 身分檢查（新增）：非員工者，僅能為自己建立預約
  IF NOT is_any_staff() THEN
    IF current_member_id() IS NULL OR current_member_id() <> p_member_id THEN
      RETURN jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    END IF;
  END IF;

  PERFORM space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, NULL);
  INSERT INTO bookings (id, member_id, coach_id, category, benefit_type, date, start_time, duration, status, space_id, resource_id, reward_status, note, created_at)
  VALUES (v_booking, p_member_id, p_coach_id, p_category::ticket_category, p_benefit_type, p_date, p_start_time, p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, now());
  v_consume := benefit_consume(p_member_id, p_benefit_type, v_qty, v_booking);
  UPDATE bookings SET ticket_id = v_consume->>'benefit_ref' WHERE id = v_booking;
  RETURN jsonb_build_object('ok',true,'booking_id',v_booking,'benefit_ref', v_consume->>'benefit_ref','remaining_after', v_consume->'remaining_after');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error_code',SQLERRM);
END $function$;

-- ── 4. 三支前端 RPC：收回 anon，僅 authenticated 可呼叫 ─────────────────────
revoke execute on function public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer, p_space_id text, p_resource_id text, p_note text) from public, anon;
revoke execute on function public.fn_cancel_booking(p_booking_id text, p_reason text) from public, anon;
revoke execute on function public.fn_checkin_booking(p_booking_id text, p_checkin_source text) from public, anon;

grant execute on function public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer, p_space_id text, p_resource_id text, p_note text) to authenticated;
grant execute on function public.fn_cancel_booking(p_booking_id text, p_reason text) to authenticated;
grant execute on function public.fn_checkin_booking(p_booking_id text, p_checkin_source text) to authenticated;

commit;
