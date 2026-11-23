-- gsm_v2_00_precheck.sql — 套用前核對（唯讀；任何硬性項目不符就 RAISE，不要往下套用）
-- 在「要套用的那個資料庫」執行；先在結果裡確認筆數像是你要的環境（測試庫筆數很小、正式庫很大）。
-- 硬性項目：舊函式定義雜湊＝正式庫 2026-11-23 取得的版本（代表沒有別人改過）、依賴物件存在、v2／操作紀錄表尚未存在、權限。
-- 資訊項目（WARN，只列出不擋）：依賴函式定義雜湊與正式庫是否一致。
-- ▶ 環境保護：把下面的 7637215626725903220 換成「你要動的那個資料庫」的 system identifier，不換就不會執行。
--   取得方式：在目標庫跑  select (pg_control_system()).system_identifier::text;
--   已知：正式庫 rlpiomzplckzqnqrvrwc＝7637215626725903220；測試庫 kucvxpjatptfckhlxptj＝7662742571317219726（2026-11-23 取得）
do $guard$ begin
  if (pg_control_system()).system_identifier::text is distinct from '7637215626725903220' then
    raise exception 'ENV_GUARD: 目前連到的資料庫(%)不是你指定的目標，已中止', (pg_control_system()).system_identifier::text;
  end if;
end $guard$;
do $$
declare
  v_old_md5 constant text := 'd53585634cf9e17a618f00fce2229a6a';   -- 正式庫 fn_group_save_members（去除 \r）
  v_md5 text; v_fn text; v_n int;
  v_dep jsonb := '{"fn_booking_rev_of(text)":"42ab6f3a78b5d3d885b784c1d5818131",
                   "fn_seat_map_reindex(jsonb,text[],text[],integer)":"c4df5267d6f1153d873c37f3955a0a72",
                   "fn_tk_refund_once(text,text,text)":"888b48e7e99e126d2e44af11580409d0",
                   "fn_ticket_net_checked(text,text)":"79438df54850bb57513bd41330682f14",
                   "fn_tk_shared_has(jsonb,text)":"766f04876216f1cdbc7becc3a9f57e49",
                   "current_employee_id()":"6a3b99dc85786f39b8c8b6c187131ee4",
                   "is_staff_desk()":"46d2a4db99b29dd44bd667e91d32cbe3",
                   "gen_short_id(text)":"2e06e06aacab780935a8376866f8b309"}'::jsonb;
begin
  raise notice '環境：employees=% members=% bookings=% server=%', (select count(*) from employees), (select count(*) from members), (select count(*) from bookings), current_setting('server_version');
  if current_setting('server_version_num')::int < 150000 then raise exception 'PRECHECK: PostgreSQL 版本過舊'; end if;
  if not has_schema_privilege(current_user, 'public', 'CREATE') then raise exception 'PRECHECK: 目前角色(%)沒有 public schema 的 CREATE 權限', current_user; end if;

  -- 舊函式
  select md5(replace(pg_get_functiondef('public.fn_group_save_members(text,integer,text,jsonb,jsonb)'::regprocedure), E'\r', '')) into v_md5;
  if v_md5 is distinct from v_old_md5 then raise exception 'PRECHECK: fn_group_save_members 定義與預期不同（%）——有人改過或已套用過，請先重新取得現行定義再決定', v_md5; end if;

  -- 依賴存在（硬性）＋雜湊（資訊）
  for v_fn in select jsonb_object_keys(v_dep) loop
    if to_regprocedure('public.'||v_fn) is null then raise exception 'PRECHECK: 缺少依賴函式 %', v_fn; end if;
    select md5(replace(pg_get_functiondef(to_regprocedure('public.'||v_fn)), E'\r', '')) into v_md5;
    if v_md5 is distinct from (v_dep->>v_fn) then raise warning 'PRECHECK(WARN): 依賴 % 的定義與正式庫 2026-11-23 版本不同（%）', v_fn, v_md5; end if;
  end loop;
  if to_regclass('public.booking_op_rev') is null then raise exception 'PRECHECK: 缺少 booking_op_rev'; end if;
  select count(*) into v_n from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname in ('trg_booking_op_rev','trg_booking_op_rev_insdel');
  if v_n <> 2 then raise exception 'PRECHECK: bookings 上的版本觸發器數量=%（應為 2）', v_n; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='seat_notes') then
    raise exception 'PRECHECK: bookings 缺少 seat_notes 欄位'; end if;
  if (select data_type from information_schema.columns where table_schema='public' and table_name='member_tickets' and column_name='shared_with') <> 'jsonb' then
    raise exception 'PRECHECK: member_tickets.shared_with 不是 jsonb'; end if;

  -- 尚未套用
  if to_regclass('public.group_op_log') is not null then raise exception 'PRECHECK: group_op_log 已存在'; end if;
  if to_regprocedure('public.fn_group_save_members_v2(text,text,text,integer,text,jsonb,jsonb)') is not null then raise exception 'PRECHECK: v2 已存在'; end if;

  -- 權限現況（舊函式只有 authenticated 可執行）
  if not has_function_privilege('authenticated', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'PRECHECK: authenticated 目前不能執行舊函式'; end if;
  if has_function_privilege('anon', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'PRECHECK: anon 竟然能執行舊函式，先查清楚再套用'; end if;

  if has_function_privilege('service_role', 'public.fn_group_save_members(text,integer,text,jsonb,jsonb)', 'execute') then raise exception 'PRECHECK: service_role 目前竟能執行舊函式（預期只有 authenticated），先查清楚'; end if;
  raise notice 'PRECHECK 全部通過';
end $$;
