-- ═══════════════════════════════════════════════════════════════════════
-- 回復 p0e_13 安裝（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj；含 DROP，需授權）
-- 只移除「本次安裝確實新增、且內容沒有被改過」的物件，並且**先全部驗證、再動手**（任何一項驗證失敗就整筆中止，一個都不刪）：
--   ・函式：必須帶標記 'P0E13-installed-for-compat-test' **且**函式本體指紋（md5:長度）等於安裝版本；標記對但指紋不符＝已被修改，中止、不刪。
--   ・函式不得仍被其他（沒有標記的）觸發器使用，否則中止。
--   ・bookings.updated_at：必須帶標記 'P0E13-added-for-compat-test' **且沒有任何其他物件相依**（檢視、索引、約束、預設值、含欄位清單的觸發器、
--     政策、統計…，查 pg_depend），否則中止；絕不使用 CASCADE（drop 本身遇到相依也會失敗並整筆回滾）。
--   ・沒有標記的物件（測試庫原本就有的同名物件、原本就存在的 updated_at）一律不動，只發 NOTICE。
-- 指紋常數由安裝檔的函式本體機械計算（本機測試會重算比對，不一致就失敗）。
-- 來源證據的限制：本機安裝檔函式本體與本檔指紋常數一致；長度（195／217／685）與 2026-11-15 的唯讀歷史紀錄一致，但**不能單憑長度證明正式庫內容相同**；
--   本機歷史 migration 20260822_group_class_desk_only.sql 的 fn_bookings_group_guard 與安裝檔相比，可執行程式碼一致、僅差三行註解；
--   另兩支沒有本機歷史定義；沒有可信的正式庫完整定義指紋 → 安裝檔＝正式庫現行本體「未驗證」。
--   trg_bookings_cancelled_by 34114a89141ed95a1b52b4040f8d4a32:195／trg_bookings_touch 1d640eec40b6ac2d14c4d91e074fcf77:217／fn_bookings_group_guard a9504d5db91635717ae3f7714e5d90db:685
-- 可重複執行：沒有任何帶標記的物件時什麼都不做（不報錯）。整檔單一交易；任何一步失敗全部回滾。
-- ═══════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫，停止執行';
  end if;
end
$guard$;
do $rb$
declare
  v_mark constant text := 'P0E13-installed-for-compat-test';
  v_col_mark constant text := 'P0E13-added-for-compat-test';
  v_fns text[] := array['public.trg_bookings_cancelled_by()','public.trg_bookings_touch()','public.fn_bookings_group_guard()'];
  v_fps text[] := array['34114a89141ed95a1b52b4040f8d4a32:195','1d640eec40b6ac2d14c4d91e074fcf77:217','a9504d5db91635717ae3f7714e5d90db:685'];
  v_trgs text[] := array['bookings_cancelled_by','bookings_touch','trg_bookings_group_guard'];
  v_i integer; v_oid oid; v_fp text; v_attnum smallint; v_deps text; v_removed integer := 0; v_skipped integer := 0;
begin
  -- 0) 先驗證（任何一項不通過就 raise exception，整筆中止，還沒刪任何東西）
  for v_i in 1..array_length(v_fns, 1) loop
    v_oid := to_regprocedure(v_fns[v_i]);
    if v_oid is null then continue; end if;
    if obj_description(v_oid, 'pg_proc') is distinct from v_mark then continue; end if;      -- 沒標記：不是本次安裝的，後面也不會動它
    select md5(prosrc) || ':' || length(prosrc) into v_fp from pg_proc where oid = v_oid;
    if v_fp is distinct from v_fps[v_i] then
      raise exception 'P0E13.ROLLBACK_ABORT: 函式 % 帶有標記，但內容與安裝版本不符（指紋 % ≠ %），可能已被修改，不刪除', v_fns[v_i], v_fp, v_fps[v_i];
    end if;
    if exists (select 1 from pg_trigger t where t.tgfoid = v_oid and not t.tgisinternal and obj_description(t.oid, 'pg_trigger') is distinct from v_mark) then
      raise exception 'P0E13.ROLLBACK_ABORT: 函式 % 仍被其他（沒有標記的）觸發器使用，不刪除', v_fns[v_i];
    end if;
  end loop;
  select a.attnum into v_attnum from pg_attribute a
   where a.attrelid = 'public.bookings'::regclass and a.attname = 'updated_at' and not a.attisdropped
     and col_description('public.bookings'::regclass, a.attnum) = v_col_mark;
  if v_attnum is not null then
    select string_agg(distinct pg_describe_object(d.classid, d.objid, d.objsubid), '；') into v_deps
      from pg_depend d where d.refclassid = 'pg_class'::regclass and d.refobjid = 'public.bookings'::regclass and d.refobjsubid = v_attnum;
    if v_deps is not null then
      raise exception 'P0E13.ROLLBACK_ABORT: bookings.updated_at 有其他物件相依（%），不刪除', v_deps;
    end if;
  end if;
  -- 1) 驗證都過了才動手：先刪帶標記的觸發器
  foreach v_oid in array array(select t.oid from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal and t.tgname = any(v_trgs) order by t.tgname) loop
    if obj_description(v_oid, 'pg_trigger') = v_mark then
      execute format('drop trigger %I on public.bookings', (select tgname from pg_trigger where oid = v_oid)); v_removed := v_removed + 1;
    else
      raise notice '略過觸發器 %：沒有 P0E13 標記（不是本次安裝的），不動', (select tgname from pg_trigger where oid = v_oid); v_skipped := v_skipped + 1;
    end if;
  end loop;
  -- 2) 再刪函式（標記＋指紋都已驗證；不使用 CASCADE）
  for v_i in 1..array_length(v_fns, 1) loop
    v_oid := to_regprocedure(v_fns[v_i]);
    if v_oid is null then continue; end if;
    if obj_description(v_oid, 'pg_proc') = v_mark then
      execute format('drop function %s', v_fns[v_i]); v_removed := v_removed + 1;
    else
      raise notice '略過函式 %：沒有 P0E13 標記（不是本次安裝的），不動', v_fns[v_i]; v_skipped := v_skipped + 1;
    end if;
  end loop;
  -- 3) 最後刪帶標記、且已確認沒有相依物件的 updated_at（不使用 CASCADE）
  if v_attnum is not null then
    alter table public.bookings drop column updated_at; v_removed := v_removed + 1;
  end if;
  raise notice 'P0E13 回復：移除 % 個、略過 % 個（略過＝沒有標記，不是本次安裝的）', v_removed, v_skipped;
end
$rb$;
do $chk$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and obj_description(p.oid, 'pg_proc') = 'P0E13-installed-for-compat-test')
     or exists (select 1 from pg_trigger t where not t.tgisinternal and obj_description(t.oid, 'pg_trigger') = 'P0E13-installed-for-compat-test')
     or exists (select 1 from pg_attribute a where a.attrelid = 'public.bookings'::regclass and a.attname = 'updated_at' and not a.attisdropped
                and col_description('public.bookings'::regclass, a.attnum) = 'P0E13-added-for-compat-test') then
    raise exception 'P0E13.ROLLBACK_INCOMPLETE: 仍有帶標記的物件殘留'; end if;
end
$chk$;
commit;
