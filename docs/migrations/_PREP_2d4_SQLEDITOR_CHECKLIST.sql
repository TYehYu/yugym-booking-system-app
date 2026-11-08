/* ══ 2d-4 SQL Editor 部署配套檢查清單（2026-11-10準備，尚未執行）══════════
   搭配 _PREP_2d4_SQLEDITOR_READY.sql（實際要貼上執行的內容）使用。
   本檔案只放「部署前」「部署後」「回滾」三組各自獨立的唯讀/回滾SQL，
   每組分開單獨執行，不要跟READY檔案的CREATE/REVOKE/GRANT混在一起貼。
   ══════════════════════════════════════════════════════════════════════ */

-- ════════ Ⓐ 部署前（在貼READY檔案內容之前，先各自單獨執行這兩條）════════

select current_user, session_user;
-- 預期：postgres/postgres（先前MCP連線一直是這個角色；SQL Editor若不同，
--   不影響最終權限結果，因為READY檔案本身已有REVOKE/GRANT防線，但仍建議
--   先看一眼、留紀錄）。

select count(*) from pg_proc where proname='fn_group_save_members';
-- 預期：0。如果不是0，立即停止，不要執行READY檔案內容（可能代表有人已經
--   手動部署過，或存在未預期的同名物件，需要先查清楚再決定下一步）。


-- ════════ Ⓑ 貼上並執行 _PREP_2d4_SQLEDITOR_READY.sql 全文 ════════
-- （這一步在SQL Editor的同一個查詢分頁、單次執行，不要分段貼）


-- ════════ Ⓒ 部署後（執行完READY檔案後，立即執行這一條）════════

select jsonb_build_object(
  'fn_args', (select pg_get_function_identity_arguments(oid) from pg_proc where proname='fn_group_save_members'),
  'security_definer', (select prosecdef from pg_proc where proname='fn_group_save_members'),
  'search_path_setting', (select proconfig from pg_proc where proname='fn_group_save_members'),
  'has_bookings_lock', (select pg_get_functiondef(oid) ilike '%from bookings where id = p_booking_id for update%' from pg_proc where proname='fn_group_save_members'),
  'has_member_tickets_lock', (select pg_get_functiondef(oid) ilike '%for update;%' from pg_proc where proname='fn_group_save_members'),
  'has_vleave_fix', (select pg_get_functiondef(oid) ilike '%jsonb_array_elements_text(v_member_ids) m(mid)%' from pg_proc where proname='fn_group_save_members'),
  'auth_exec', (select has_function_privilege('authenticated', oid, 'EXECUTE') from pg_proc where proname='fn_group_save_members'),
  'anon_exec_should_be_false', (select has_function_privilege('anon', oid, 'EXECUTE') from pg_proc where proname='fn_group_save_members'),
  'svc_exec_should_be_false', (select has_function_privilege('service_role', oid, 'EXECUTE') from pg_proc where proname='fn_group_save_members')
) as post_deploy_check;
-- 預期：5參數、security_definer=true、search_path_setting含'search_path=public, pg_temp'、
--   三個lock/fix欄位皆true、auth_exec=true、其餘兩個=false。
--   任一項不符 → 立即停止，不得繼續（不得自行部署2b/2c/前端，不得commit/push）。


-- ════════ Ⓓ 失敗停止與回滾條件 ════════

/* 停止條件（任一成立就停）：
   1. Ⓐ的既有函式數量不是0。
   2. 執行READY檔案時SQL Editor回報任何錯誤（COMMIT不會發生，Postgres
      對單次送出的多敘述視為同一交易，錯誤會讓整個區塊自動回滾，不需要
      手動補救，但要先用Ⓒb確認fn_group_save_members確實還是0筆、
      list_migrations確實沒有新紀錄，才能排除「其實已經部分成功」的疑慮）。
   3. Ⓒ部署後驗證任一項不符預期。
   4. 執行結果不明（例如Dashboard顯示逾時、轉圈圈、或網路中斷）——
      比照先前MCP逾時事件的處理方式：不自動重試，先執行Ⓒ的驗證SQL
      確認正式庫實際狀態，再決定下一步。

   回滾方式（僅在Ⓒ驗證判定「已確實成功但需要撤回」時才使用，需另外
   取得明確授權才能執行，本檔案只記錄程序）：
     select pg_get_function_identity_arguments(oid) from pg_proc
       where proname='fn_group_save_members';  -- 先確認恰好1列5參數
     DROP FUNCTION public.fn_group_save_members(text, integer, text, jsonb, jsonb);
   前提：前端`_saveGroupMembers`尚未接線（部署當下即為事實），資料庫層
   無其他物件依賴（先前已查`pg_depend`確認無依賴）——符合這兩個前提時
   DROP即為完整回滾，不需要額外清理資料。
*/
