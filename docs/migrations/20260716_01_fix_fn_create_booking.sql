-- ============================================================
-- Migration: 修復 fn_create_booking 的型別錯誤
-- 產出：2026-07-16（Sprint 3 前置）
-- 狀態：設計稿，尚未於任何環境執行
-- ============================================================
-- 問題（Sprint 1 發現①）：
--   原函式內 INSERT ... VALUES (..., p_category::booking_category, ...)
--   但資料庫沒有 booking_category 型別；bookings.category 實際型別是 ticket_category。
--   → 函式一被呼叫就落入 EXCEPTION，回傳 ok:false，無法建立任何預約。
-- 修復：
--   p_category::booking_category  →  p_category::ticket_category
-- 影響評估：
--   此函式目前前端「完全沒有呼叫」（Sprint 1 確認 0 處 sb.rpc），
--   故修復不影響線上任何現行流程；修好後才供 Sprint 3 前端切換使用。
-- 驗證方式（測試環境）：
--   select fn_create_booking('<測試會員>','<教練>','私人教練','coaching_session',
--          current_date+1,'10:00',60,'general','general_area','測試');
--   預期回傳 ok:true，且該會員最早到期的 coaching_session 票 -1 堂、bookings 多一筆、
--   ticket_logs 多一筆 deduct、bookings.ticket_id 有寫入。
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_create_booking(
  p_member_id text, p_coach_id text, p_category text, p_benefit_type text,
  p_date date, p_start_time text, p_duration integer DEFAULT 60,
  p_space_id text DEFAULT 'general'::text, p_resource_id text DEFAULT 'general_area'::text,
  p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_booking text := gen_short_id('BK-');
  v_consume jsonb;
  v_qty int := CASE WHEN p_benefit_type='training_pass' THEN 1 ELSE 1 END; -- 自主扣1點；堂數扣1堂
BEGIN
  -- 1) 場地衝突（先擋，避免扣了票才發現沒場地）
  PERFORM space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, NULL);

  -- 2) 建立 booking（含 benefit_type 快照、space/resource）
  INSERT INTO bookings (id, member_id, coach_id, category, benefit_type,
                        date, start_time, duration, status,
                        space_id, resource_id, reward_status, note, created_at)
  VALUES (v_booking, p_member_id, p_coach_id, p_category::ticket_category, p_benefit_type,  -- ★ 修正：booking_category → ticket_category
          p_date, p_start_time, p_duration, 'booked',
          p_space_id, p_resource_id, 'pending', p_note, now());

  -- 3) 消耗權益（Booking 不知道是票是點，只呼叫 benefit_consume）
  v_consume := benefit_consume(p_member_id, p_benefit_type, v_qty, v_booking);

  -- 4) 記錄扣的是哪張票（供取消返還反查）
  UPDATE bookings SET ticket_id = v_consume->>'benefit_ref' WHERE id = v_booking;

  RETURN jsonb_build_object('ok',true,'booking_id',v_booking,
    'benefit_ref', v_consume->>'benefit_ref',
    'remaining_after', v_consume->'remaining_after');
EXCEPTION WHEN OTHERS THEN
  -- 任一步失敗 → 全 rollback（無半套 booking）
  RETURN jsonb_build_object('ok',false,'error_code',SQLERRM);
END $function$;

-- ------------------------------------------------------------
-- ROLLBACK（若需還原成修復前的壞版本；一般不需要）
-- ------------------------------------------------------------
-- 只要把上面 VALUES 那行的 p_category::ticket_category 改回 p_category::booking_category
-- 重新 CREATE OR REPLACE 即可。實務上「壞版本」無保留價值，回滾僅為完整性紀錄。
