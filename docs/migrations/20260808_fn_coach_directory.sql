-- 2026-08-08 使用者指示：「會員端看團體課，要看得到是哪個教練上課跟上課人數，
-- 但是不能看上課會員名單」。
--
-- 會員讀不到 employees（RLS：employees_select 只給櫃檯／本人，employees_select_all_coach 只給教練），
-- 所以前端 dbGetAll('coaches') 對會員一律是空陣列，每一堂課的教練都顯示成「教練」。
--
-- 不放寬 employees 的 RLS —— 那是整列開放，薪資、電話、身分證字號都會跟著過去。
-- 改成一支只回「id + 名字」的 security definer 函式。
--
-- can_teach 講的是「還能不能被排課」，不是「名字能不能顯示」：
-- 關掉開課的教練帶過的舊課，會員回頭看仍要看得到是誰上的 → 不加這個條件。
create or replace function public.fn_coach_directory()
returns table(id text, name text, name_en text)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.name, e.name_en
  from public.employees e
  where (e.role = 'coach'::staff_role or e.role = 'admin'::staff_role)
    and (current_member_id() is not null or is_any_staff());
$$;

revoke all on function public.fn_coach_directory() from public;
grant execute on function public.fn_coach_directory() to authenticated;

comment on function public.fn_coach_directory() is
  '教練對外名冊（id／本名／教練名）：會員端顯示「哪位教練上課」用。只回名字，不含任何個資或薪資欄位（2026-08-08）';
