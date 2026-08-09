-- 2026-08-09 安全檢查（Supabase database advisor：function_search_path_mutable）
--
-- fn_line_uid_fix(text) 是 SECURITY DEFINER，卻沒有固定 search_path。
-- SECURITY DEFINER 函式以「定義者」的權限執行；search_path 可變時，
-- 呼叫端有機會把它導向自己控制的 schema 裡的同名物件，等於借用了較高的權限。
-- 專案裡其他 security definer 函式（fn_table_sigs、fn_coach_directory、
-- fn_admin_delete_member…）都已經固定，補上這一支。
alter function public.fn_line_uid_fix(text) set search_path = public, pg_temp;
