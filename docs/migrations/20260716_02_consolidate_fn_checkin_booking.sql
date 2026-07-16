-- ============================================================
-- Migration: 收斂 fn_checkin_booking 重複的兩支
-- 產出：2026-07-16（Sprint 3 前置）
-- 狀態：設計稿，尚未於任何環境執行
-- ============================================================
-- 問題（Sprint 1 發現③）：資料庫有兩個 fn_checkin_booking 重載：
--   (a) (p_booking_id text, p_checkin_source text)                    ← 含權限檢查（正確）
--   (b) (p_booking_id text, p_checkin_source text, p_operator text)   ← 無權限檢查（危險）
--   呼叫時若帶第三參數會打到 (b)，跳過權限驗證。
-- 處置：保留含權限檢查的 (a)，移除 (b)。
-- 影響評估：
--   前端目前 0 處呼叫任何 RPC（Sprint 1 確認），故移除 (b) 不影響線上流程。
--   Sprint 3 前端切換簽到時，統一呼叫兩參數版 (a)。
-- 驗證方式（測試環境）：
--   1) select * from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname='fn_checkin_booking';
--      預期只剩一列（兩參數版）。
--   2) 以員工身分 select fn_checkin_booking('<測試booking>','front_desk');
--      預期 ok:true、booking 轉 checked_in；重複呼叫回 already:true（冪等）。
--   3) 以非該會員身分帶 'member_app' 呼叫 → 預期 error_code MEMBER.INVALID。
-- ============================================================

-- 移除無權限檢查的三參數版 (b)
DROP FUNCTION IF EXISTS public.fn_checkin_booking(text, text, text);

-- 保留的兩參數版 (a) 已存在，無需重建；如需確保為最新定義，可 CREATE OR REPLACE 如下：
-- （內容即現行含權限檢查版本，原樣保留）
CREATE OR REPLACE FUNCTION public.fn_checkin_booking(
  p_booking_id text, p_checkin_source text DEFAULT 'front_desk'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  b            bookings%ROWTYPE;
  v_uid        text := auth.uid()::text;   -- 登入者（不信前端傳的 operator）
  v_emp        text;
  v_is_staff   boolean;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); END IF;
  IF b.status = 'cancelled' THEN RETURN jsonb_build_object('ok',false,'error_code','BOOKING.CANCELLED'); END IF;

  -- 冪等：已簽到直接回
  IF b.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already',true,'reward_status',b.reward_status);
  END IF;

  -- 權限：依 checkin_source 驗證登入者身分（不信前端）
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

-- ------------------------------------------------------------
-- ROLLBACK（還原被移除的三參數版 (b)；一般不需要）
-- ------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.fn_checkin_booking(text, text, text) ...
--   （原無權限檢查版本，若確需還原再從 Sprint 1 盤點紀錄取回定義）
