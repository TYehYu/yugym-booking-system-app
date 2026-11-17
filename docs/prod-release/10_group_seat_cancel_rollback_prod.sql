-- 階段 10 回復：移除三支新函式（不用 CASCADE；不動任何資料、不動 06／08、不動 seat_notes）。
-- ⚠ 先確認前端已退回（舊前端的取消名額走原本的非原子路徑，不呼叫這三支函式；新前端若還在線上，取消名額會失敗）。
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then raise exception 'GS.RB: 叢集識別不是正式庫，停止'; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) <> 3 then raise exception 'GS.RB: 三支函式不是恰好都在（缺少或有同名多載），停止，請人工檢查'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')), '') is distinct from '0960ccde99493b7d79dd4d40a0fa45c6' then raise exception 'GS.RB: fn_seat_map_reindex 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_group_seat_rev(text)')), '') is distinct from '5f33108bc3b98e200eefbc23ad8070c8' then raise exception 'GS.RB: fn_group_seat_rev 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')), '') is distinct from 'c8a70d1d1d2918660543f0e5c69c89f6' then raise exception 'GS.RB: fn_cancel_group_seat 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex') and p.prosrc ~ '(fn_cancel_group_seat|fn_group_seat_rev|fn_seat_map_reindex)') then raise exception 'GS.RB: 還有其他函式的本體引用這三支函式，停止（不用 CASCADE）'; end if;
  if exists (select 1 from pg_depend d where d.refclassid = 'pg_proc'::regclass and d.refobjid in (to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)'),to_regprocedure('public.fn_group_seat_rev(text)'),to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')) and d.deptype in ('n','a') and d.objid not in (to_regprocedure('public.fn_seat_map_reindex(jsonb,text[],text[],integer)')::oid,to_regprocedure('public.fn_group_seat_rev(text)')::oid,to_regprocedure('public.fn_cancel_group_seat(text,text,text,text)')::oid)) then raise exception 'GS.RB: 有資料庫物件（觸發器／policy／預設值／索引等）相依這三支函式，停止（不用 CASCADE）'; end if;
  create temp table _gs_pre on commit drop as select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_trigger where not tgisinternal) n_trg,
     (select count(*) from pg_tables where schemaname='public') n_tables;
end
$guard$;

drop function public.fn_cancel_group_seat(text, text, text, text);
drop function public.fn_group_seat_rev(text);
drop function public.fn_seat_map_reindex(jsonb, text[], text[], integer);

do $post$
declare pre record;
begin
  select * into pre from _gs_pre;
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) then raise exception 'GS.RB.POST: 三支函式沒有全部移除，整個交易回滾'; end if;
  if exists (select 1 from (select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_cancel_group_seat','fn_group_seat_rev','fn_seat_map_reindex')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_trigger where not tgisinternal) n_trg,
     (select count(*) from pg_tables where schemaname='public') n_tables) now_ where (now_.n_funcs, now_.funcs_sig, now_.pol, now_.grants, now_.n_trg, now_.n_tables) is distinct from (pre.n_funcs, pre.funcs_sig, pre.pol, pre.grants, pre.n_trg, pre.n_tables)) then raise exception 'GS.RB.POST: 其他物件與回復前不同，整個交易回滾'; end if;
end
$post$;

commit;
