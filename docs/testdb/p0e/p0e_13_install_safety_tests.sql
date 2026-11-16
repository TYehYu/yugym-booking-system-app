-- ═══════════════════════════════════════════════════════════════════════
-- p0e_13 安裝／回復的「不覆蓋、不誤刪、驗證不通過就整筆中止」安全性測試（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj）
-- 做法：從 p0e_13 安裝檔的「前置檢查」DO 區塊與回復檔的「回復」DO 區塊，以及安裝檔建立函式／觸發器／標記的語句，
--   **逐字**（由腳本機械抽取，不是手抄；各只內嵌一份，建成交易內的暫時函式 pg_temp.s_pre／s_rb 供各案例呼叫）內嵌在下面這個**必定 raise exception 回滾**的單一 DO 裡執行；所有假物件都建在這個交易內，隨回滾消失。
-- ⚠ 注意：這份測試會在「交易內」執行 CREATE／DROP FUNCTION、CREATE／DROP TRIGGER／VIEW／INDEX（bookings）與 ALTER TABLE bookings ADD／DROP COLUMN，
--   全部會回滾；屬於可回滾的 DDL。若你的授權不含「可回滾 DDL 測試」，請先向使用者確認再執行。
-- 前置：p0e_13 **尚未安裝**（三個函式、三個觸發器、updated_at 都不存在；否則中止並提示先回復）。結果在 P0E13_SAFETY_RESULT: 之後。
-- 案例：S1–S8 沿用（S5 的夾具改成安裝檔的逐字版本——因為回復現在會核對函式指紋，標記對但內容是假的函式本來就該被拒絕，那是 S10 的案例）；
--   S9–S12 為本輪新增：指紋常數核對、標記對但內容被改→拒絕、其他觸發器使用函式→拒絕、updated_at 有相依物件→拒絕、回復失敗整筆不動。
-- ═══════════════════════════════════════════════════════════════════════
do $s$
declare v_ok boolean; v_msg text; v_mark constant text := 'P0E13-installed-for-compat-test';
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: 看起來像正式庫'; end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('trg_bookings_cancelled_by','trg_bookings_touch','fn_bookings_group_guard'))
     or exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard'))
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at') then
    raise exception 'S.PRECONDITION: p0e_13 已安裝或有同名物件，請先用回復檔還原後再測';
  end if;
  create temp table s_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.s_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as $f$ insert into s_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 250)) $f$;
  create function pg_temp.s_summary() returns text language sql as $f$
    select jsonb_build_object('pass', count(*) filter (where ok is true), 'fail', count(*) filter (where ok is false), 'total', count(*),
      'items', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'name', left(name, 110), 'detail', detail) order by n) from s_res where ok is not true), '[]'::jsonb))::text from s_res $f$;

  -- 前置檢查與回復的 DO 區塊本體（逐字抽自安裝檔／回復檔，只內嵌這一份）；各案例用 perform 呼叫它們，語意與直接執行那兩個 DO 相同
  create function pg_temp.s_pre() returns void language plpgsql as $pref$
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
$pref$;
  create function pg_temp.s_rb() returns void language plpgsql as $rbf$
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
$rbf$;

  -- S1 乾淨狀態：前置檢查通過（不拋錯）
  begin
    perform pg_temp.s_pre();
    perform pg_temp.s_rec('S1 乾淨狀態下安裝前置檢查通過', true);
  exception when others then perform pg_temp.s_rec('S1 乾淨狀態下安裝前置檢查通過', false, sqlerrm); end;

  -- S2 同名函式已存在 → 前置檢查中止，且不覆蓋（假函式本體不變）
  create function public.trg_bookings_touch() returns trigger language plpgsql as $f$ begin return new; end $f$;
  begin
    perform pg_temp.s_pre();
    perform pg_temp.s_rec('S2 同名函式已存在：安裝前置檢查中止', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S2 同名函式已存在：安裝前置檢查中止', sqlerrm like 'P0E13.ABORT: 測試庫已有同名函式%', sqlerrm); end;
  perform pg_temp.s_rec('S2 假函式沒有被改動（仍是我們建的那版）', (select prosrc like '%return new;%' and obj_description(p.oid, 'pg_proc') is null from pg_proc p where p.oid = 'public.trg_bookings_touch()'::regprocedure), '');
  -- S2b 即使前置檢查被繞過，CREATE FUNCTION 遇到同名函式也會直接失敗（不是悄悄覆蓋）
  begin
    execute 'CREATE FUNCTION public.trg_bookings_touch() RETURNS trigger LANGUAGE plpgsql AS $q$ begin return old; end $q$';
    perform pg_temp.s_rec('S2b 繞過前置檢查時 CREATE FUNCTION 同名函式會失敗（不覆蓋）', false, '沒有拋錯');
  exception when duplicate_function then perform pg_temp.s_rec('S2b 繞過前置檢查時 CREATE FUNCTION 同名函式會失敗（不覆蓋）', true);
            when others then perform pg_temp.s_rec('S2b 繞過前置檢查時 CREATE FUNCTION 同名函式會失敗（不覆蓋）', false, sqlerrm); end;
  perform pg_temp.s_rec('S2b 假函式本體仍沒變（沒有被覆蓋成 return old）', (select prosrc like '%return new;%' from pg_proc p where p.oid = 'public.trg_bookings_touch()'::regprocedure), '');

  -- S3 同名觸發器已存在（沒標記）→ 前置檢查中止
  create trigger bookings_touch before update on public.bookings for each row execute function public.trg_bookings_touch();
  begin
    perform pg_temp.s_pre();
    perform pg_temp.s_rec('S3 同名觸發器已存在：安裝前置檢查中止', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S3 同名觸發器已存在：安裝前置檢查中止', sqlerrm like 'P0E13.ABORT: 測試庫已有其中的觸發器%', sqlerrm); end;

  -- S4 回復只刪帶標記的：沒標記的同名觸發器與函式一律不動
  perform pg_temp.s_rb();
  perform pg_temp.s_rec('S4 回復不刪「沒標記」的同名觸發器', exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'bookings_touch'), '');
  perform pg_temp.s_rec('S4 回復不刪「沒標記」的同名函式', to_regprocedure('public.trg_bookings_touch()') is not null, '');
  drop trigger bookings_touch on public.bookings; drop function public.trg_bookings_touch();

  -- S5 標記＋指紋都正確（夾具＝安裝檔的逐字語句）→ 允許正常回復（觸發器先、函式後）
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
  perform pg_temp.s_rb();
  perform pg_temp.s_rec('S5 標記與指紋都正確：回復刪除三個觸發器與三支函式', not exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard'))
    and not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('trg_bookings_cancelled_by','trg_bookings_touch','fn_bookings_group_guard')), '');

  -- S6 重複執行回復（已經沒有帶標記的物件）：什麼都不做、不報錯
  begin
    perform pg_temp.s_rb();
    perform pg_temp.s_rec('S6 重複執行回復（沒有標記物件）不報錯', true);
  exception when others then perform pg_temp.s_rec('S6 重複執行回復（沒有標記物件）不報錯', false, sqlerrm); end;

  -- S7 欄位：沒標記的 updated_at（原本就存在）不刪；有標記且沒有相依物件才刪
  alter table public.bookings add column updated_at timestamptz;
  perform pg_temp.s_rb();
  perform pg_temp.s_rec('S7a 回復不刪「沒標記」的 updated_at 欄位（原本就存在的）', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at'), '');
  comment on column public.bookings.updated_at is 'P0E13-added-for-compat-test';
  perform pg_temp.s_rb();
  perform pg_temp.s_rec('S7b 回復刪除「帶標記、無相依物件」的 updated_at 欄位', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at'), '');

  -- S8 殘留標記：任何帶標記的物件存在，安裝前置檢查都要中止（避免上次安裝沒回復就再裝）
  create function public.zz_p0e13_marker_probe() returns int language sql as $f$ select 1 $f$;
  comment on function public.zz_p0e13_marker_probe() is 'P0E13-installed-for-compat-test';
  begin
    perform pg_temp.s_pre();
    perform pg_temp.s_rec('S8 有帶標記的殘留物件：安裝前置檢查中止', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S8 有帶標記的殘留物件：安裝前置檢查中止', sqlerrm like 'P0E13.ABORT: 已有帶 P0E13 標記的物件%', sqlerrm); end;
  drop function public.zz_p0e13_marker_probe();

  -- ═══ 以下為本輪新增：回復的「驗證不通過就中止」 ═══
  -- S9 指紋常數核對：安裝檔的逐字語句建出來的三支函式，其 md5:長度必須等於回復檔裡寫死的常數
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
  perform pg_temp.s_rec('S9 安裝版函式的指紋＝回復檔常數（三支都核對；常數寫錯就會在 S5／這裡失敗）',
    (select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = 'public.trg_bookings_cancelled_by()'::regprocedure) = '34114a89141ed95a1b52b4040f8d4a32:195'
    and (select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = 'public.trg_bookings_touch()'::regprocedure) = '1d640eec40b6ac2d14c4d91e074fcf77:217'
    and (select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = 'public.fn_bookings_group_guard()'::regprocedure) = 'a9504d5db91635717ae3f7714e5d90db:685', '');
  drop trigger if exists bookings_cancelled_by on public.bookings; drop trigger if exists bookings_touch on public.bookings; drop trigger if exists trg_bookings_group_guard on public.bookings;
  drop function if exists public.trg_bookings_cancelled_by(); drop function if exists public.trg_bookings_touch(); drop function if exists public.fn_bookings_group_guard();

  -- S10 標記正確但函式內容已被修改 → 回復必須拒絕，且一個物件都不刪（含沒被改的其他函式與全部觸發器）
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
  create or replace function public.trg_bookings_touch() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $f$ begin return new; end $f$;
    begin
    perform pg_temp.s_rb();
    perform pg_temp.s_rec('S10 標記正確但 trg_bookings_touch 內容被改：回復拒絕（ROLLBACK_ABORT）', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S10 標記正確但 trg_bookings_touch 內容被改：回復拒絕（ROLLBACK_ABORT）', sqlerrm like 'P0E13.ROLLBACK_ABORT:%內容與安裝版本不符%', sqlerrm); end;
  perform pg_temp.s_rec('S10 拒絕之後三支函式與三個觸發器全部還在、被改的函式仍是被改的版本（沒有被刪、也沒有被還原）', (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('trg_bookings_cancelled_by','trg_bookings_touch','fn_bookings_group_guard')) = 3 and (select count(*) from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard')) = 3
    and (select prosrc not like '%old.%' and length(prosrc) < 100 from pg_proc where oid = 'public.trg_bookings_touch()'::regprocedure), '');
  drop trigger if exists bookings_cancelled_by on public.bookings; drop trigger if exists bookings_touch on public.bookings; drop trigger if exists trg_bookings_group_guard on public.bookings;
  drop function if exists public.trg_bookings_cancelled_by(); drop function if exists public.trg_bookings_touch(); drop function if exists public.fn_bookings_group_guard();
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
  create or replace function public.fn_bookings_group_guard() returns trigger language plpgsql set search_path to 'public' as $f$ begin return new; end $f$;
    begin
    perform pg_temp.s_rb();
    perform pg_temp.s_rec('S10b 標記正確但 fn_bookings_group_guard 內容被改：回復同樣拒絕（三支函式都有核對）', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S10b 標記正確但 fn_bookings_group_guard 內容被改：回復同樣拒絕（三支函式都有核對）', sqlerrm like 'P0E13.ROLLBACK_ABORT:%內容與安裝版本不符%', sqlerrm); end;
  perform pg_temp.s_rec('S10b 拒絕之後所有物件仍在', (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('trg_bookings_cancelled_by','trg_bookings_touch','fn_bookings_group_guard')) = 3 and (select count(*) from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard')) = 3, '');
  drop trigger if exists bookings_cancelled_by on public.bookings; drop trigger if exists bookings_touch on public.bookings; drop trigger if exists trg_bookings_group_guard on public.bookings;
  drop function if exists public.trg_bookings_cancelled_by(); drop function if exists public.trg_bookings_touch(); drop function if exists public.fn_bookings_group_guard();
  -- S10c 函式仍被「其他（沒有標記的）觸發器」使用 → 拒絕（否則 drop 會出事）
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
  create trigger zz_other_touch before update on public.bookings for each row execute function public.trg_bookings_touch();
    begin
    perform pg_temp.s_rb();
    perform pg_temp.s_rec('S10c 函式仍被其他沒標記的觸發器使用：回復拒絕', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S10c 函式仍被其他沒標記的觸發器使用：回復拒絕', sqlerrm like 'P0E13.ROLLBACK_ABORT:%仍被其他%', sqlerrm); end;
  perform pg_temp.s_rec('S10c 拒絕之後所有物件與那個其他觸發器都還在', (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('trg_bookings_cancelled_by','trg_bookings_touch','fn_bookings_group_guard')) = 3 and (select count(*) from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard')) = 3 and exists (select 1 from pg_trigger where tgname = 'zz_other_touch'), '');
  drop trigger zz_other_touch on public.bookings;
  drop trigger if exists bookings_cancelled_by on public.bookings; drop trigger if exists bookings_touch on public.bookings; drop trigger if exists trg_bookings_group_guard on public.bookings;
  drop function if exists public.trg_bookings_cancelled_by(); drop function if exists public.trg_bookings_touch(); drop function if exists public.fn_bookings_group_guard();

  -- S11 updated_at 有其他物件相依 → 不得誤刪、也不得 CASCADE
  alter table public.bookings add column updated_at timestamptz;
  comment on column public.bookings.updated_at is 'P0E13-added-for-compat-test';
  create view public.zz_p0e13_dep_view as select id, updated_at from public.bookings;
    begin
    perform pg_temp.s_rb();
    perform pg_temp.s_rec('S11a updated_at 被檢視相依：回復拒絕（ROLLBACK_ABORT）', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S11a updated_at 被檢視相依：回復拒絕（ROLLBACK_ABORT）', sqlerrm like 'P0E13.ROLLBACK_ABORT:%updated_at 有其他物件相依%', sqlerrm); end;
  perform pg_temp.s_rec('S11a 拒絕之後欄位與檢視都還在（沒有 CASCADE 誤刪）', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at') and to_regclass('public.zz_p0e13_dep_view') is not null, '');
  drop view public.zz_p0e13_dep_view;
  create index zz_p0e13_dep_idx on public.bookings (updated_at);
    begin
    perform pg_temp.s_rb();
    perform pg_temp.s_rec('S11b updated_at 被索引相依：回復拒絕（ROLLBACK_ABORT）', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S11b updated_at 被索引相依：回復拒絕（ROLLBACK_ABORT）', sqlerrm like 'P0E13.ROLLBACK_ABORT:%updated_at 有其他物件相依%', sqlerrm); end;
  perform pg_temp.s_rec('S11b 拒絕之後欄位與索引都還在', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at') and to_regclass('public.zz_p0e13_dep_idx') is not null, '');
  drop index public.zz_p0e13_dep_idx;
  alter table public.bookings drop column updated_at;

  -- S12 回復失敗時整筆不動：函式與觸發器都合格、但 updated_at 有相依 → 驗證階段就中止，合格的函式與觸發器也一個都沒被刪；既有（沒標記的）物件不受影響
  create function public.zz_other_fn() returns int language sql as $f$ select 1 $f$;
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
  alter table public.bookings add column updated_at timestamptz;
  comment on column public.bookings.updated_at is 'P0E13-added-for-compat-test';
  create view public.zz_p0e13_dep_view as select id, updated_at from public.bookings;
    begin
    perform pg_temp.s_rb();
    perform pg_temp.s_rec('S12 回復在驗證階段失敗（updated_at 有相依）：整筆中止', false, '沒有拋錯');
  exception when others then perform pg_temp.s_rec('S12 回復在驗證階段失敗（updated_at 有相依）：整筆中止', sqlerrm like 'P0E13.ROLLBACK_ABORT:%updated_at 有其他物件相依%', sqlerrm); end;
  perform pg_temp.s_rec('S12 失敗後：三個觸發器、三支函式（本來合格可刪）、欄位、檢視、以及無關的既有函式 zz_other_fn 全部原封不動', (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('trg_bookings_cancelled_by','trg_bookings_touch','fn_bookings_group_guard')) = 3 and (select count(*) from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname in ('bookings_cancelled_by','bookings_touch','trg_bookings_group_guard')) = 3
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'updated_at')
    and to_regclass('public.zz_p0e13_dep_view') is not null and to_regprocedure('public.zz_other_fn()') is not null, '');

  raise exception 'P0E13_SAFETY_RESULT: %', pg_temp.s_summary();
end
$s$;
