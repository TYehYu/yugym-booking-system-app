-- 2026-08-05 使用者指示：會員端可自己更新 性別/生日/緊急聯絡人/載具（已套用）
-- ① members 加發票載具欄位 invoice_carrier（手機條碼，之後開立電子發票帶入）
-- ② members 欄位級守門（與 employees 的 fn_employees_guard 同款）：
--    會員本人只能改個人資料欄位；等級/主教練/狀態/標籤/稽核欄位僅櫃檯以上。
--    白名單涵蓋既有會員自寫流程：首次設定（name/phone/email/birthday/must_setup）、
--    體驗簽約回寫（name/birthday/email/emergency_*）、家庭成員（family_members）、LINE 通知。
--    實測：會員改 gender/birthday/emergency_name/invoice_carrier ✓；改 tier 被擋 ✓。

alter table public.members add column if not exists invoice_carrier text;

create or replace function public.fn_members_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_changed text[];
  v_allowed text[] := array['name','phone','email','gender','birthday','birth_date',
    'height','weight','emergency_name','emergency_phone','emergency_relation',
    'line_id','line_notify','family_members','must_setup','invoice_carrier'];
  v_bad text[];
begin
  if coalesce(auth.role(),'') not in ('anon','authenticated') then return new; end if;
  if is_staff_desk() then return new; end if;   -- 櫃檯以上不受限（is_admin 含在內）

  select coalesce(array_agg(n.key),'{}') into v_changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value;

  select coalesce(array_agg(k),'{}') into v_bad
  from unnest(v_changed) k where k <> all(v_allowed);
  if array_length(v_bad,1) > 0 then
    raise exception 'MEM.GUARD: 欄位 % 僅櫃檯以上可修改', array_to_string(v_bad,', ');
  end if;
  return new;
end $$;

drop trigger if exists trg_members_guard on public.members;
create trigger trg_members_guard before update on public.members
  for each row execute function public.fn_members_guard();
