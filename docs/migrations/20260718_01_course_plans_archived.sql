-- 20260718_01_course_plans_archived.sql
-- 票券系統 V4 · 落差 2：方案「封存」三態（上架 / 停用 / 封存）
--
-- 背景：course_plans 原本只有 active 布林（上架/下架）。規格 V4 §5、§6 要求三態，
--       其中「封存」＝永久退役、從管理清單隱藏但保留歷史（有歷史資料的方案只能停用或封存，不可硬刪）。
-- 模型：封存 = active=false + archived=true。
--       所有售票/發放/會員申請路徑皆已依 active 過濾，故封存方案自動排除，無需改動那些路徑。
--       前端管理清單預設隱藏 archived，提供「顯示已封存」切換與「還原」。
--
-- 影響：純加欄位（additive），預設 false，不改任何既有資料、不影響會員已購票券（快照）。
-- 安全：NOT NULL DEFAULT false，既有列自動補 false。

alter table public.course_plans
  add column if not exists archived boolean not null default false;

-- 回退：
--   alter table public.course_plans drop column if exists archived;
