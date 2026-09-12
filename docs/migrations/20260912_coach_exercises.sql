-- 2026-09-12 課表的「常用動作」：每位教練自己一份
-- 使用者：「我想要教練可以自己設計預設動作 在上課的時後可以快速取用
--           然後再同一個客人取用相同動作的時候 要套用這個客人之前的紀錄」
-- 三選一挑「另做一份課表專用的常用清單」—— 所以不是塞進 exercises（那是訓練方案的動作庫）。
--
-- ⚠ RLS 照 workout_plans 那一套：自己的＋管理員看全部（管理員本來就在維護動作相關的設定）。
-- ⚠ 新表一定要 trg_change_log ＋列進 fn_table_sigs，否則 dbGetAll 只會走整表重抓（正確但較慢）。
create table if not exists public.coach_exercises(
  id text primary key,
  coach_id text not null,
  name text not null,
  tool text,
  posture text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.coach_exercises enable row level security;
drop policy if exists cxe_select on public.coach_exercises;
drop policy if exists cxe_write on public.coach_exercises;
create policy cxe_select on public.coach_exercises for select
  using ((select is_admin()) or coach_id=(select current_employee_id()));
create policy cxe_write on public.coach_exercises for all
  using ((select is_admin()) or coach_id=(select current_employee_id()))
  with check ((select is_admin()) or coach_id=(select current_employee_id()));
grant select, insert, update, delete on public.coach_exercises to authenticated, anon, service_role;
drop trigger if exists trg_change_log on public.coach_exercises;
create trigger trg_change_log after insert or delete or update on public.coach_exercises
  for each row execute function fn_log_change();

-- fn_table_sigs 尾巴加 'coach_exercises'（其餘原封不動）

-- ── 同日第二批（使用者：「把目前訓練方案移除 統一改由訓練動作去設計
--    例如打開新方案 動作可以套用教練自己預設動作跟順序」）──
-- 三選一：方案留著但動作改從常用動作挑、現有 4 份方案清掉、動作資料庫停用。
-- ① 順序由教練自己排（上下移動）→ 不再用「我最常用」自動排
alter table public.coach_exercises add column if not exists sort_order integer;

-- ② 舊動作庫的 43 個動作匯進當時唯一在用的那位教練的常用清單（依部位、名稱排序）
insert into public.coach_exercises (id, coach_id, name, tool, posture, active, sort_order, created_at)
select 'CXE-IMP-'||x.id, 'c-mqjjpdszw1ze', x.name, x.default_tool, x.default_posture, true,
       row_number() over (order by coalesce(x.body_part,'zz'), x.name)::int, now()
from exercises x
where x.active is not false
  and not exists (select 1 from coach_exercises c where c.coach_id='c-mqjjpdszw1ze' and c.name=x.name);

-- ③ 現有 4 份方案清掉（使用者指示；都是同一位教練的，沒有分享出去）
-- delete from workout_plans;   ← 已執行（WP-mttvln4utfur 水平日／WP-mttw3bv8aogd 一週一練／
--                                  WP-mttvusfpvmqz 垂直日／WP-mttyiiryhsrc 銀髮族）
-- ⚠ exercises 表保留不刪：訓練紀錄存的是動作名稱字串，不引用它。
