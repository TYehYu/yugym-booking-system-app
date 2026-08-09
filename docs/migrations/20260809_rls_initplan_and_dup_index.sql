-- 2026-08-09 Supabase 效能檢查（advisor）後的兩項調整
-- 觸發點：使用者升級 Pro 後問「你看你那邊能做什麼嗎」→ 順手跑了 performance advisor。

-- ══ ① auth_rls_initplan（17 條）══════════════════════════════════════════
-- RLS 條件裡直接寫 auth.uid() 時，Postgres 會「每一列」重算一次。
-- bookings 有 6,254 筆、教練每次開行事曆都整表讀 —— 等於同一個判斷跑六千多次。
-- 包成 (select auth.uid()) 之後會被當成 InitPlan：整個查詢只算一次。
--
-- ⚠ 只包 auth.uid()，不動任何其他東西：
--   ・is_staff_desk() 這類與「哪一列」無關的函式，包了也有效，但不在這次範圍
--   ・can_coach_see_member(id) 這種**吃當列欄位**的絕對不能包（包了語意就錯了）
-- 做法是把現有條件字串原樣取出、只做這一個字串替換再寫回去，
-- 不手寫任何一條新條件 —— 這樣不可能改錯語意。
do $do$
declare
  r record;
  q text;
  w text;
  n int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
       and coalesce(qual,'') not like '%( SELECT auth.uid()%'
  loop
    q := replace(coalesce(r.qual,''),      'auth.uid()', '( SELECT auth.uid() )');
    w := replace(coalesce(r.with_check,''),'auth.uid()', '( SELECT auth.uid() )');
    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
                     r.policyname, r.schemaname, r.tablename, q, w);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
                     r.policyname, r.schemaname, r.tablename, q);
    elsif r.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s)',
                     r.policyname, r.schemaname, r.tablename, w);
    end if;
    n := n + 1;
  end loop;
  raise notice '已調整 % 條 policy', n;
end $do$;

-- ══ ② duplicate_index（3 組）════════════════════════════════════════════
-- 三組完全相同的索引，各留一個就好 —— 重複的索引不會讓查詢變快，
-- 但每一次寫入都要多維護一份，也多佔一份空間。
-- 前兩組留「有 constraint 撐著的那一個」（唯一性約束靠它），刪掉手動多建的那一份；
-- member_tickets 那組兩個都是純索引，留命名一致的 ix_ 版本。
drop index if exists public.leave_settlements_emp_year_idx;   -- 與 leave_settlements_emp_id_year_key（unique constraint）相同
drop index if exists public.members_phone_unique;             -- 與 members_phone_key（unique constraint）相同
drop index if exists public.idx_tickets_member;               -- 與 ix_member_tickets_member 相同
