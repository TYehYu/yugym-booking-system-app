-- 2026-08-05 資安掃描修補（Supabase security advisor + RLS 盤點）
-- ⚠ 尚未套用：MCP 通道被權限層擋下，需在 Supabase Dashboard SQL Editor 貼上執行，
--    或由本機 session 放行後重跑。
--
-- ① employees 欄位級守門：非管理員（教練本人、櫃檯）只能改個人資料欄位
--    （name_en/email/birthday/must_setup/LINE 綁定欄位）；
--    role/is_manager/薪資/保險/狀態等敏感欄位僅管理員可動。
--    堵住的洞：employees_update 政策允許「自己那一列」不限欄位 →
--    教練可繞過畫面直接把自己的 role 改成 admin。
--    保留緊急通道：全系統無在職管理員時，本人可升管理員
--    （emergencySelfAdmin 的伺服器端檢查版——原本只有前端檢查）。
-- ② benefit_consume_ticket / desk_alert 收回對外執行權：
--    兩支都是 SECURITY DEFINER 且內部不驗呼叫者；前端從不直接呼叫
--    （只被 fn_create_booking / fn_member_self_* 內部使用，owner=postgres 不受影響）。
--    收掉「知道票券ID+會員ID就能扣課」與匿名灌櫃檯通知的門。
-- ③ fn_biz_hours 釘住 search_path（linter WARN：mutable search_path）。

create or replace function public.fn_employees_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_changed text[];
  v_allowed text[] := array['name_en','email','birthday','must_setup','line_user_id','line_bind_token'];
  v_bad text[];
begin
  -- service_role（Edge Function：LINE 綁定、建帳號）與直連 SQL 不擋
  if coalesce(auth.role(),'') not in ('anon','authenticated') then return new; end if;
  if is_admin() then return new; end if;

  select coalesce(array_agg(n.key),'{}') into v_changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value;

  -- 緊急通道：全系統無在職管理員時，本人可升管理員（連帶允許 status 轉在職）
  if new.role='admin' and old.role is distinct from 'admin'
     and new.auth_id = auth.uid()
     and not exists (select 1 from employees e where e.role='admin' and e.status='active' and e.id<>new.id)
  then
    v_allowed := v_allowed || array['role','status'];
  end if;

  select coalesce(array_agg(k),'{}') into v_bad
  from unnest(v_changed) k where k <> all(v_allowed);
  if array_length(v_bad,1) > 0 then
    raise exception 'EMP.GUARD: 欄位 % 僅管理員可修改', array_to_string(v_bad,', ');
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_guard on public.employees;
create trigger trg_employees_guard before update on public.employees
  for each row execute function public.fn_employees_guard();

revoke execute on function public.benefit_consume_ticket(text,text,integer,text) from public, anon, authenticated;
revoke execute on function public.desk_alert(text,text,text,text) from public, anon, authenticated;

alter function public.fn_biz_hours(date) set search_path = public;
