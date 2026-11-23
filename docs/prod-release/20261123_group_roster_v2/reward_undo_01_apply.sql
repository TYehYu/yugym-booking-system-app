-- ════════════════════════════════════════════════════════════════════════════
-- reward_undo_01_apply.sql — 取消簽到時精確回收贈點（贈點案例）＋防止重新簽到重複發點（草案，未在正式庫執行）
-- 內容（兩件事，單一交易）：
--   ① 新增 RPC fn_undo_checkin(p_booking_id)：取消簽到＋回收「這一堂」發的贈點，全部同一交易。
--        • 只認 member_tickets.source='checkin_grant' AND source_booking_id = 這堂（精確，不做近似比對；已回收的不再算）。
--        • 連帶預約（bookings.ticket_id = 這些贈點券、尚未取消）逐筆分類：
--            未到課＝status 'booked'、checked_in_at 為空、no_show 不是 true  → 取消並退回那 1 點；
--            其他（已簽到／已完成／未到課旗標／教練請假…任何不是單純 booked）→ 視為「已實際到課或已結案」，不自動取消。
--        • 只要有任何一筆不是未到課（含混合狀態）→ 整個動作停止（ok:false, error_code=REWARD_ATTENDED），連取消簽到都不做，列出那幾筆。
--        • 全部都是未到課（或根本沒人用）→ 取消未到課預約、退點、贈點券作廢（status='expired'＋source_type='checkin_revoked'，
--          保留整份帳本；不刪票，因為 ticket_logs 對 member_tickets 是 ON DELETE CASCADE，刪票會連帳本一起消失），
--          來源預約回到 booked／reward_status='pending'／reward_issued=false。
--        • 贈點券「已用數量」與可追蹤的連帶預約對不上（例如手動扣用）→ RAISE，整筆回滾。
--        • 已經不是已簽到狀態 → 冪等回傳 already:true，不做任何事（重送安全）。
--        • 鎖序：來源預約 → 連帶預約（依 id）→ 贈點券（依 id）；與 fn_checkin_booking 搶同一列來源預約的鎖。
--   ② handle_checkin_reward：加一段防護——這堂若已有「沒被回收」的簽到贈點券就不再發（改標為 issued）。
--        （贈點現況：券還在、來源預約被改回 pending，現行函式不查就會再發一張。）
--      做法＝讀現行定義、在固定的一行後面插入一段、釘住前後雜湊；不轉寫整支函式。
-- 套用方式：execute_sql／SQL Editor（不要用 apply_migration）。需使用者明確授權；測試庫先排定獨占。
-- ════════════════════════════════════════════════════════════════════════════
begin;
create temp table codex_release_snapshot on commit drop as select jsonb_build_object(
'bookings',(select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by id),'')) from public.bookings b),
'tickets',(select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.member_tickets t),
'logs',(select md5(coalesce(string_agg(to_jsonb(l)::text,'|' order by id),'')) from public.ticket_logs l),
'employees',(select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by id),'')) from public.employees e),
'auth',(select md5(coalesce(string_agg(to_jsonb(u)::text,'|' order by id),'')) from auth.users u),
'other_functions',(select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward','fn_undo_checkin','fn_group_save_members','fn_group_save_members_v2','fn_gsm_msg')),
'policies',(select md5(coalesce(string_agg(tablename::text||'.'||policyname::text||'.'||cmd::text||coalesce(array_to_string(roles,','),'')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename::text,policyname::text),'')) from pg_policies where schemaname='public' and tablename<>'group_op_log'),
'grants',(select md5(coalesce(string_agg(table_name::text||grantee::text||privilege_type::text,'|' order by table_name::text,grantee::text,privilege_type::text),'')) from information_schema.role_table_grants where table_schema='public' and table_name<>'group_op_log'),
'triggers',(select md5(coalesce(string_agg(tgrelid::regclass::text||tgname::text||pg_get_triggerdef(oid),'|' order by tgrelid::regclass::text,tgname::text),'')) from pg_trigger where not tgisinternal),
'migrations',(select md5(coalesce(string_agg(version||name,'|' order by version),'')) from supabase_migrations.schema_migrations)
) as snapshot;
do $release_dependencies$ begin
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.current_employee_id()') and md5(replace(pg_get_functiondef(oid),E'\r',''))='6a3b99dc85786f39b8c8b6c187131ee4' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:current_employee_id()';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_booking_rev_of(text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='42ab6f3a78b5d3d885b784c1d5818131' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_booking_rev_of(text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_group_save_members(text,integer,text,jsonb,jsonb)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='d53585634cf9e17a618f00fce2229a6a' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_group_save_members(text,integer,text,jsonb,jsonb)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='c4df5267d6f1153d873c37f3955a0a72' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_seat_map_reindex(jsonb,text[],text[],integer)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_ticket_net_checked(text,text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='79438df54850bb57513bd41330682f14' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_ticket_net_checked(text,text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_tk_refund_once(text,text,text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='888b48e7e99e126d2e44af11580409d0' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:fn_tk_refund_once(text,text,text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.fn_tk_shared_has(jsonb,text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='766f04876216f1cdbc7becc3a9f57e49' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:fn_tk_shared_has(jsonb,text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.gen_short_id(text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='2e06e06aacab780935a8376866f8b309' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:gen_short_id(text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.handle_checkin_reward(text)') and md5(replace(pg_get_functiondef(oid),E'\r',''))='791e97ef4386d8d5793056bb265b066c' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'RELEASE.DEP_CHANGED:handle_checkin_reward(text)';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.is_any_staff()') and md5(replace(pg_get_functiondef(oid),E'\r',''))='11ce596c050dfb6ac89b95e77da82596' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:is_any_staff()';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.is_staff_desk()') and md5(replace(pg_get_functiondef(oid),E'\r',''))='46d2a4db99b29dd44bd667e91d32cbe3' and proacl::text is not distinct from NULL) then raise exception 'RELEASE.DEP_CHANGED:is_staff_desk()';end if;
end $release_dependencies$;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ▶ 環境保護＋環境別雜湊釘選：把 7637215626725903220 換成目標庫的 system identifier（不換就不會執行）。
--   正式庫 rlpiomzplckzqnqrvrwc＝7637215626725903220；測試庫 kucvxpjatptfckhlxptj＝7662742571317219726
--   handle_checkin_reward 現行定義（去除 CR 的完整定義 md5）：正式庫 791e97ef4386d8d5793056bb265b066c；測試庫 158961cc5e095465891847e9e7b5405f
do $guard$
declare v_sys text := (pg_control_system()).system_identifier::text; v_md5 text;
begin
  if v_sys is distinct from '7637215626725903220' then
    raise exception 'ENV_GUARD: 目前連到的資料庫(%)不是你指定的目標，已中止', v_sys;
  end if;
  v_md5 := md5(replace(pg_get_functiondef('public.handle_checkin_reward(text)'::regprocedure), E'\r', ''));
  if not ((v_sys = '7637215626725903220' and v_md5 = '791e97ef4386d8d5793056bb265b066c')
       or (v_sys = '7662742571317219726' and v_md5 = '158961cc5e095465891847e9e7b5405f')) then
    raise exception 'PRECHECK: handle_checkin_reward 現行定義與這個環境預期的不同（%）——有人改過，先重新對帳', v_md5;
  end if;
  if to_regprocedure('public.fn_undo_checkin(text)') is not null then raise exception 'PRECHECK: fn_undo_checkin 已存在'; end if;
  if to_regprocedure('public.current_employee_id()') is null or to_regprocedure('public.is_any_staff()') is null then raise exception 'PRECHECK: 缺 current_employee_id()／is_any_staff()'; end if;
  if (select proacl::text from pg_proc where oid='public.handle_checkin_reward(text)'::regprocedure) is distinct from '{postgres=X/postgres,service_role=X/postgres}' then
    raise exception 'PRECHECK: handle_checkin_reward 的 ACL 不是預期（只有 service_role）';
  end if;
  create temp table _ru_pre on commit drop as select
    (select count(*) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward')) other_fn_n,
    (select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward')) other_fn_hash,
    (select md5(coalesce(string_agg(tablename::text||'.'||policyname::text||'.'||cmd::text||coalesce(array_to_string(roles,','),'')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename::text,policyname::text),'')) from pg_policies where schemaname='public') pol,
    (select md5(coalesce(string_agg(table_name::text||grantee::text||privilege_type::text,'|' order by table_name::text,grantee::text,privilege_type::text),'')) from information_schema.role_table_grants where table_schema='public') grants,
    (select md5(coalesce(string_agg(tgrelid::regclass::text||tgname::text||pg_get_triggerdef(oid),'|' order by tgrelid::regclass::text,tgname::text),'')) from pg_trigger where not tgisinternal) trg,
    (select count(*) from supabase_migrations.schema_migrations) migs,
    (select md5(coalesce(string_agg(version||name,'|' order by version),'')) from supabase_migrations.schema_migrations) migs_hash,
    (select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by b.id),'')) from public.bookings b) bk,
    (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id),'')) from public.member_tickets t) tk,
    (select md5(coalesce(string_agg(to_jsonb(l)::text,'|' order by l.id),'')) from public.ticket_logs l) lg;
end
$guard$;

-- ── ① 取消簽到＋精確回收贈點 ──
create or replace function public.fn_undo_checkin(p_booking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emp text; b bookings%rowtype; t member_tickets%rowtype; x bookings%rowtype;
  v_tids text[]; v_att jsonb := '[]'::jsonb; v_cancel text[] := '{}'; v_bid text;
  v_net int; i int; v_cancelled int := 0; v_refunded int := 0; v_revoked int := 0; v_code text;
begin
  perform set_config('lock_timeout', '3000', true);
  if p_booking_id is null or length(btrim(p_booking_id)) = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'BAD_ARGS', 'message', '送出的資料不完整，沒有做任何更動');
  end if;
  select current_employee_id() into v_emp;
  if v_emp is null or not coalesce(is_any_staff(), false) then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF', 'message', '你沒有權限取消簽到，沒有做任何更動');
  end if;

  select * into b from bookings where id = p_booking_id for update;                       -- ① 先鎖來源預約
  if not found then return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING', 'message', '找不到這筆預約，沒有做任何更動'); end if;
  -- 授權範圍：櫃檯／管理員可操作全部；教練只能操作自己的課（主教練或代課教練），與團課名單入口同規則
  if not (coalesce(is_staff_desk(), false) or b.coach_id is not distinct from v_emp or b.substitute_coach_id is not distinct from v_emp) then
    return jsonb_build_object('ok', false, 'error_code', 'FORBIDDEN', 'message', '這不是你的課，沒有權限取消簽到，沒有做任何更動');
  end if;
  if b.status::text <> 'checked_in' then                                                  -- 冪等：已經不是已簽到＝什麼都不做
    return jsonb_build_object('ok', true, 'already', true, 'message', '這筆預約已經不是「已簽到」狀態，沒有做任何更動');
  end if;

  -- ② 這堂發的贈點券：只認 source_booking_id 精確對應；先前已回收的不算
  select array_agg(id order by id) into v_tids from member_tickets
   where source = 'checkin_grant' and source_booking_id = b.id and coalesce(source_type, '') <> 'checkin_revoked';

  -- ③ 連帶預約（依 id 鎖）：未到課才取消；任何一筆不是單純未到課就整個停止
  for x in select * from bookings where ticket_id = any(coalesce(v_tids, '{}'::text[])) and status::text <> 'cancelled' order by id for update
  loop
    if x.status::text = 'booked' and x.checked_in_at is null and coalesce(x.no_show, false) = false then
      v_cancel := v_cancel || x.id;
    else
      v_att := v_att || jsonb_build_array(jsonb_build_object('booking_id', x.id, 'date', x.date, 'time', x.start_time, 'status', x.status::text));
    end if;
  end loop;
  if jsonb_array_length(v_att) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'REWARD_ATTENDED',
      'message', '這堂簽到發放的自主訓練點數，已經有實際到課（或已結案）的預約，不能自動回收，也沒有取消簽到；請櫃檯先手動處理那幾筆再取消簽到',
      'attended', v_att, 'unattended', to_jsonb(v_cancel));
  end if;

  -- ④ 贈點券（依 id 鎖）；未到課預約逐筆取消並退回 1 點
  for t in select * from member_tickets where id = any(coalesce(v_tids, '{}'::text[])) order by id for update
  loop
    for v_bid in select id from bookings where ticket_id = t.id and id = any(v_cancel) order by id
    loop
      select coalesce(-sum(case when action::text in ('deduct','refund') then delta else 0 end), 0)::int into v_net
        from ticket_logs where ticket_id = t.id and booking_id = v_bid;
      for i in 1 .. greatest(v_net, 0) loop
        update member_tickets set sessions_remaining = sessions_remaining + 1 where id = t.id;
        insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
        values (public.gen_short_id('LG-'), t.id, 'refund', 1, v_bid, v_emp, '取消簽到收回贈點：連帶取消未到課的自主訓練，退回 1 點');
        v_refunded := v_refunded + 1;
      end loop;
      update bookings
         set status = 'cancelled', cancelled_at = now(), cancelled_by = v_emp, cancel_reason = '贈點回收',
             note = case when coalesce(btrim(note), '') = '' then '隨 '||b.date||' '||left(b.start_time::text,5)||' 課程取消簽到一併取消（贈點回收）'
                         else note||'｜隨 '||b.date||' '||left(b.start_time::text,5)||' 課程取消簽到一併取消（贈點回收）' end
       where id = v_bid;
      v_cancelled := v_cancelled + 1;
    end loop;
    select * into t from member_tickets where id = t.id;
    if t.sessions_remaining is distinct from t.sessions_total then
      raise exception 'RWD:UNTRACKED_USE:%', t.id;      -- 已用數量與可追蹤的預約對不上（例如手動扣用）→ 整筆回滾
    end if;
    update member_tickets
       set status = 'expired', source_type = 'checkin_revoked',
           note = case when coalesce(btrim(note), '') = '' then b.date||' 取消簽到，贈點回收（作廢保留帳本）' else note||E'\n'||b.date||' 取消簽到，贈點回收（作廢保留帳本）' end
     where id = t.id;
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), t.id, 'adjust', 0, b.id, v_emp, '取消簽到：這堂發放的贈點作廢（原票與帳本保留）');
    v_revoked := v_revoked + 1;
  end loop;

  -- ⑤ 取消簽到本身（旗標一起回到可重新發點的狀態；贈點券已作廢，重新簽到只會再發一次）
  update bookings
     set status = 'booked', checked_in_at = null, reward_status = 'pending', reward_issued = false, reward_issued_at = null, reward_type = null
   where id = b.id;

  return jsonb_build_object('ok', true, 'already', false, 'revoked_tickets', v_revoked, 'cancelled_bookings', v_cancelled, 'refunded_points', v_refunded);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'BUSY', 'message', '系統忙碌，沒有做任何更動，請稍後再按一次');
  when others then
    if sqlerrm like 'RWD:%' then
      v_code := split_part(sqlerrm, ':', 2);
      return jsonb_build_object('ok', false, 'error_code', v_code,
        'message', case v_code when 'UNTRACKED_USE' then '這張贈點券有無法對應到預約的使用紀錄，不能自動回收，沒有做任何更動；請通知管理員' else '回收沒有完成，整筆已回滾' end,
        'ticket_id', split_part(sqlerrm, ':', 3));
    end if;
    return jsonb_build_object('ok', false, 'error_code', 'INTERNAL_ERROR', 'message', '取消簽到沒有完成，整筆已回滾、沒有任何資料被更動，請稍後再試或通知管理員');
end
$function$;
revoke all on function public.fn_undo_checkin(text) from public, anon, service_role;
grant execute on function public.fn_undo_checkin(text) to authenticated;
comment on function public.fn_undo_checkin(text) is 'undo checkin + exact reward revoke by source_booking_id 2026-11-23';

-- ── ② handle_checkin_reward：已有未回收的贈點券就不再發（只插入一段，其餘逐字沿用）──
do $patch$
declare
  v_oid oid := to_regprocedure('public.handle_checkin_reward(text)');
  v_def text; v_new text;
  v_old constant text := E'  if not found or b.reward_status <> ''pending'' then return; end if;\n';
  v_add constant text := E'  /* 2026-11-23 防重複發點：這堂已經有「沒被回收」的簽到贈點券就不再發（取消簽到後旗標回到 pending、券卻還在時，重新簽到不會再發一張） */\n'
    || E'  if exists (select 1 from member_tickets g where g.source = ''checkin_grant'' and g.source_booking_id = b.id and coalesce(g.source_type, '''') <> ''checkin_revoked'') then\n'
    || E'    update bookings set reward_status = ''issued'', reward_issued = true where id = b.id;\n'
    || E'    return;\n'
    || E'  end if;\n';
begin
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then raise exception 'PATCH: 插入點不是剛好一處'; end if;
  v_new := replace(v_def, v_old, v_old || v_add);
  execute v_new;
end
$patch$;

-- ── 補丁後核對（任何一項不符就 RAISE → 整個交易回滾）──
do $post$
declare p _ru_pre%rowtype; v_oid oid := to_regprocedure('public.handle_checkin_reward(text)');
begin
  if position('checkin_revoked' in pg_get_functiondef(v_oid)) = 0 then raise exception 'POST: handle_checkin_reward 沒有防護段'; end if;
  if (select proacl::text from pg_proc where oid=v_oid) is distinct from '{postgres=X/postgres,service_role=X/postgres}' then raise exception 'POST: handle_checkin_reward ACL 變了'; end if;
  if (select proacl::text from pg_proc where oid='public.fn_undo_checkin(text)'::regprocedure) is distinct from '{postgres=X/postgres,authenticated=X/postgres}' then raise exception 'POST: fn_undo_checkin ACL 不是預期'; end if;
  if not (select prosecdef from pg_proc where oid='public.fn_undo_checkin(text)'::regprocedure) then raise exception 'POST: fn_undo_checkin 不是 SECURITY DEFINER'; end if;
  select * into p from _ru_pre;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward','fn_undo_checkin')) <> p.other_fn_n
     or (select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward','fn_undo_checkin')) <> p.other_fn_hash then raise exception 'POST: 其他函式變了'; end if;
  if (select md5(coalesce(string_agg(tablename::text||'.'||policyname::text||'.'||cmd::text||coalesce(array_to_string(roles,','),'')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename::text,policyname::text),'')) from pg_policies where schemaname='public') <> p.pol then raise exception 'POST: policy 變了'; end if;
  if (select md5(coalesce(string_agg(table_name::text||grantee::text||privilege_type::text,'|' order by table_name::text,grantee::text,privilege_type::text),'')) from information_schema.role_table_grants where table_schema='public') <> p.grants then raise exception 'POST: 表權限變了'; end if;
  if (select md5(coalesce(string_agg(tgrelid::regclass::text||tgname::text||pg_get_triggerdef(oid),'|' order by tgrelid::regclass::text,tgname::text),'')) from pg_trigger where not tgisinternal) <> p.trg then raise exception 'POST: 觸發器變了'; end if;
  if (select count(*) from supabase_migrations.schema_migrations) <> p.migs
     or (select md5(coalesce(string_agg(version||name,'|' order by version),'')) from supabase_migrations.schema_migrations) <> p.migs_hash then raise exception 'POST: migration 紀錄變了'; end if;
  if (select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by b.id),'')) from public.bookings b) <> p.bk
     or (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id),'')) from public.member_tickets t) <> p.tk
     or (select md5(coalesce(string_agg(to_jsonb(l)::text,'|' order by l.id),'')) from public.ticket_logs l) <> p.lg then raise exception 'POST: 資料變了'; end if;
end
$post$;

do $release_bodies$ begin
if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='fn_undo_checkin')<>1 or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='fn_undo_checkin' and md5(prosrc)='665bafdb6797b4c6250636e9dbd8891b' and proacl::text='{postgres=X/postgres,authenticated=X/postgres}' and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.BODY_OR_ACL:fn_undo_checkin';end if;
end $release_bodies$;
do $release_handler$ begin if (select md5(replace(pg_get_functiondef(oid),E'\r','')) from pg_proc where oid='public.handle_checkin_reward(text)'::regprocedure)<>'1edb01019dc6b7339ffed4657c44168a' then raise exception 'RELEASE.HANDLER_NOT_EXACT';end if;end $release_handler$;
do $release_unrelated$ begin if (select snapshot from codex_release_snapshot) is distinct from (select jsonb_build_object(
'bookings',(select md5(coalesce(string_agg(to_jsonb(b)::text,'|' order by id),'')) from public.bookings b),
'tickets',(select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),'')) from public.member_tickets t),
'logs',(select md5(coalesce(string_agg(to_jsonb(l)::text,'|' order by id),'')) from public.ticket_logs l),
'employees',(select md5(coalesce(string_agg(to_jsonb(e)::text,'|' order by id),'')) from public.employees e),
'auth',(select md5(coalesce(string_agg(to_jsonb(u)::text,'|' order by id),'')) from auth.users u),
'other_functions',(select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f' and proname not in ('handle_checkin_reward','fn_undo_checkin','fn_group_save_members','fn_group_save_members_v2','fn_gsm_msg')),
'policies',(select md5(coalesce(string_agg(tablename::text||'.'||policyname::text||'.'||cmd::text||coalesce(array_to_string(roles,','),'')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename::text,policyname::text),'')) from pg_policies where schemaname='public' and tablename<>'group_op_log'),
'grants',(select md5(coalesce(string_agg(table_name::text||grantee::text||privilege_type::text,'|' order by table_name::text,grantee::text,privilege_type::text),'')) from information_schema.role_table_grants where table_schema='public' and table_name<>'group_op_log'),
'triggers',(select md5(coalesce(string_agg(tgrelid::regclass::text||tgname::text||pg_get_triggerdef(oid),'|' order by tgrelid::regclass::text,tgname::text),'')) from pg_trigger where not tgisinternal),
'migrations',(select md5(coalesce(string_agg(version||name,'|' order by version),'')) from supabase_migrations.schema_migrations)
) as snapshot) then raise exception 'RELEASE.UNRELATED_OBJECT_OR_DATA_CHANGED';end if;end $release_unrelated$;
notify pgrst, 'reload schema';
commit;
