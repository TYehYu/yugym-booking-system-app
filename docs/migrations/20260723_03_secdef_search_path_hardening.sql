-- SECURITY DEFINER 函式 search_path 加固
-- 2026-07-23。承 20260716_04（RPC 授權加固）之後的同類衛生／防提權措施。
--
-- 背景：
--   14 支既有 SECURITY DEFINER 函式未固定 search_path（Supabase linter
--   lint 0011 function_search_path_mutable）。單看以為只是警告，但本專案
--   anon／authenticated 具備 TEMP 權限（可建 pg_temp 物件），而 public schema
--   雖已鎖住建物件，temp schema 沒有。未固定 search_path 時，pg_temp 隱式排在
--   搜尋路徑最前——呼叫者可在 pg_temp 建一張同名假表（如 members／employees）
--   遮蔽真表，使 is_admin() 之類函式解析到假資料 → 提權。這與 20260716 的
--   「RLS 綠燈 ≠ 系統安全」同源：SECURITY DEFINER 是另一條獨立路徑。
--
-- 作法：
--   對每支函式 ALTER ... SET search_path = public, pg_temp。pg_temp 明確排在
--   最後，表解析一律先命中 public，堵住遮蔽攻擊。**只加設定、不改函式體、不動
--   權限**，零邏輯變更、可重複執行。與專案新函式現行慣例（public, pg_temp）一致。
--
-- 不動的三支：
--   handle_checkin_reward（已設 public, pg_temp）、fn_complete_member_registration
--   與 fn_review_member_link_request（已設）、rls_auto_enable（設 pg_catalog，
--   event trigger 專用，維持現狀）。
--
-- 回退：ALTER FUNCTION <sig> RESET search_path;（各支比照，即回未設定狀態）。

begin;

-- ── RLS 輔助函式（被眾多政策引用，遮蔽風險最高，優先加固）──
alter function public.is_admin()                              set search_path = public, pg_temp;
alter function public.is_any_staff()                          set search_path = public, pg_temp;
alter function public.is_coach()                              set search_path = public, pg_temp;
alter function public.is_staff_desk()                         set search_path = public, pg_temp;
alter function public.current_staff_role()                    set search_path = public, pg_temp;
alter function public.current_employee_id()                   set search_path = public, pg_temp;
alter function public.current_member_id()                     set search_path = public, pg_temp;
alter function public.can_coach_see_member(m_id text)         set search_path = public, pg_temp;

-- ── 前端 RPC（authenticated 可呼叫，已有身分檢查；補 search_path 收尾）──
alter function public.fn_create_booking(
  p_member_id text, p_coach_id text, p_category text, p_benefit_type text,
  p_date date, p_start_time text, p_duration integer,
  p_space_id text, p_resource_id text, p_note text
)                                                             set search_path = public, pg_temp;
alter function public.fn_cancel_booking(p_booking_id text, p_reason text)
                                                              set search_path = public, pg_temp;
alter function public.fn_checkin_booking(p_booking_id text, p_checkin_source text)
                                                              set search_path = public, pg_temp;

-- ── 內部函式（20260716_04 已收回外部 EXECUTE，僅由 fn_* 內部呼叫）──
alter function public.benefit_consume(
  p_member_id text, p_benefit_type text, p_qty integer, p_booking_id text
)                                                             set search_path = public, pg_temp;
alter function public.benefit_refund(p_benefit_ref text, p_qty integer, p_booking_id text)
                                                              set search_path = public, pg_temp;
alter function public.space_check(
  p_space_id text, p_resource_id text, p_date date, p_start text,
  p_duration integer, p_coach_id text, p_exclude_booking text
)                                                             set search_path = public, pg_temp;

commit;
