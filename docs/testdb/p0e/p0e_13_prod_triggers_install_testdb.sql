-- ═══════════════════════════════════════════════════════════════════════
-- 把「正式庫專有」的 3 個 bookings 觸發器裝進測試庫，用來做相容性測試（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj；需使用者授權）
-- 來源：2026-11-15 對正式庫 rlpiomzplckzqnqrvrwc 唯讀 pg_get_functiondef／pg_get_triggerdef 的輸出（轉錄成本檔）。
--   ⚠ 「本檔函式本體＝正式庫現行本體」**尚未驗證**：本機沒有可信的正式庫完整定義指紋可比對；長度與當時的唯讀紀錄一致，但長度不能證明內容相同；
--   本機歷史 migration 20260822_group_class_desk_only.sql 的 fn_bookings_group_guard 與本檔相比，可執行程式碼一致、僅差三行註解。
-- 測試庫現況（唯讀確認；ChatGPT 也已獨立確認）：已有 trg_bookings_contract_hold_guard、trg_bookings_hold_month_guard；
--   缺 bookings_cancelled_by、bookings_touch、trg_bookings_group_guard 三個觸發器、對應的三支函式，且 bookings 沒有 updated_at 欄位。
-- 影響範圍：bookings 新增可為空的 updated_at 欄位（若不存在）＋3 個函式＋3 個觸發器；不改任何既有資料列；不安裝 trg_change_log
--   （測試庫靠「沒有 change_log」被識別為測試庫，守門不能破壞）。
-- 覆蓋與重複執行保護（本輪補強）：
--   ・前置檢查 **三個觸發器、三支函式、本檔的標記** 都不存在，任何一項已存在就中止（不重複安裝、不覆蓋）。
--   ・函式一律用 CREATE FUNCTION（不是 CREATE OR REPLACE）——即使前置檢查被繞過，同名函式存在時也會直接失敗，不會悄悄覆蓋。
--   ・本檔建立的每個物件（函式、觸發器、欄位）都加上標記註解 'P0E13-installed-for-compat-test'；回復檔只刪帶這個標記的物件。
--   ・整檔單一交易：任何一步失敗全部回滾，不會留下半套。
-- 回復：p0e_13_prod_triggers_rollback_testdb.sql。
-- ═══════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫（有 change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;
do $pre$
begin
  if exists (select 1 from pg_trigger where not tgisinternal and tgrelid = 'public.bookings'::regclass and tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard')) then
    raise exception 'P0E13.ABORT: 測試庫已有其中的觸發器，不重複安裝'; end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('trg_bookings_cancelled_by','trg_bookings_touch','fn_bookings_group_guard')) then
    raise exception 'P0E13.ABORT: 測試庫已有同名函式（trg_bookings_cancelled_by／trg_bookings_touch／fn_bookings_group_guard），不覆蓋'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') = 'P0E13-installed-for-compat-test')
     or exists (select 1 from pg_trigger t where not t.tgisinternal and obj_description(t.oid, 'pg_trigger') = 'P0E13-installed-for-compat-test') then
    raise exception 'P0E13.ABORT: 已有帶 P0E13 標記的物件（可能是上次安裝沒回復），請先用回復檔'; end if;
  if to_regprocedure('public.current_employee_id()') is null or to_regprocedure('public.current_member_id()') is null
     or to_regprocedure('public.is_staff_desk()') is null or to_regprocedure('public.current_staff_role()') is null then
    raise exception 'P0E13.ABORT: 缺少依賴函式'; end if;
end
$pre$;

do $col$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at') then
    alter table public.bookings add column updated_at timestamptz;
    comment on column public.bookings.updated_at is 'P0E13-added-for-compat-test';
  else
    raise notice 'bookings.updated_at 原本就存在（不是本次新增，回復不會刪它）';
  end if;
end
$col$;

CREATE FUNCTION public.trg_bookings_cancelled_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'cancelled' and new.cancelled_by is null then
    new.cancelled_by := coalesce(old.cancelled_by, current_employee_id(), current_member_id());
  end if;
  return new;
end
$function$;

CREATE FUNCTION public.trg_bookings_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.date       is distinct from old.date
  or new.start_time is distinct from old.start_time
  or new.duration   is distinct from old.duration then
    new.updated_at := now();
  end if;
  return new;
end $function$;

CREATE FUNCTION public.fn_bookings_group_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cat text;
begin
  -- service_role / 後端排程一律放行（同 fn_members_guard 的第一道）
  if coalesce(auth.role(),'') not in ('anon','authenticated') then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  -- 櫃檯以上（含店長、管理員）不受限
  if coalesce(is_staff_desk(), false) then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  v_cat := case when TG_OP='DELETE' then old.category::text else new.category::text end;
  -- 教練（非店長）不能「建立」或「刪除」團體課；更新不擋 —— 教練請假要改自己的團課
  if v_cat = '小班肌力' and current_staff_role() is not null then
    raise exception 'BK.GUARD: 團體課的建立與刪除只有櫃檯以上可以做（教練請改用「教練請假」）';
  end if;
  return case when TG_OP='DELETE' then old else new end;
end $function$;

CREATE TRIGGER bookings_cancelled_by BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_bookings_cancelled_by();
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION trg_bookings_touch();
CREATE TRIGGER trg_bookings_group_guard BEFORE INSERT OR DELETE ON public.bookings FOR EACH ROW EXECUTE FUNCTION fn_bookings_group_guard();

-- 標記本檔建立的物件（回復檔只刪帶標記的）
COMMENT ON FUNCTION public.trg_bookings_cancelled_by() IS 'P0E13-installed-for-compat-test';
COMMENT ON FUNCTION public.trg_bookings_touch() IS 'P0E13-installed-for-compat-test';
COMMENT ON FUNCTION public.fn_bookings_group_guard() IS 'P0E13-installed-for-compat-test';
COMMENT ON TRIGGER bookings_cancelled_by ON public.bookings IS 'P0E13-installed-for-compat-test';
COMMENT ON TRIGGER bookings_touch ON public.bookings IS 'P0E13-installed-for-compat-test';
COMMENT ON TRIGGER trg_bookings_group_guard ON public.bookings IS 'P0E13-installed-for-compat-test';

do $post$
begin
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and tgrelid = 'public.bookings'::regclass
        and tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard')) <> 3 then
    raise exception 'P0E13.POSTCHECK_FAILED: 三個觸發器沒有全部啟用'; end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') = 'P0E13-installed-for-compat-test') <> 3
     or (select count(*) from pg_trigger t where not t.tgisinternal and obj_description(t.oid, 'pg_trigger') = 'P0E13-installed-for-compat-test') <> 3 then
    raise exception 'P0E13.POSTCHECK_FAILED: 標記不是 3 個函式＋3 個觸發器'; end if;
end
$post$;
commit;
