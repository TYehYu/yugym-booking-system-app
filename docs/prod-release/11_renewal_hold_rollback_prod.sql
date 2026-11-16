-- 階段 11 回復：移除四支新函式與三個觸發器，並把 fn_hold_month_guard 還原成套用前的原版。不用 CASCADE；不動任何資料。
-- ═══ 事故回復規則（定案）═══
-- 【前端尚未發布】可直接執行本檔（已在測試庫完整演練：套用→驗證→回復→基準核對）。
-- 【前端已發布】預設只退前端（git revert），**保留資料庫物件**；不得僅因前端退版就執行本檔。舊前端不會呼叫新函式，留著無害；
--   而且仍開啟的新版頁面會呼叫 fn_contract_adopt_holds，刪掉會讓承接直接失敗。
-- 【資料庫規則本身出問題】先依事故原因提出局部停用／修復方案（例如只停用 trg_contract_window_ins／upd，或修復單一函式），
--   **完整移除（本檔）須另行取得使用者授權**，並先處理仍開啟的新版頁面（通知重新整理／確認沒有人正在承接）。
-- ⚠ 還原守門函式後：既有資料不會被回頭改動（守門只在寫入時觸發）；已經建立的「超出原月份限制」的卡位仍保留，只是之後不能再新增／改期到那些日期。
-- 單一交易：核對（五支函式的本體都是本次安裝版本、沒有其他函式引用、沒有測試專用 zz_rn_adopt）→ 刪除 → 還原 → 核對還原後指紋＝原版且其餘物件不變；任何一步不符整個回滾。
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then raise exception 'RN.RB: 叢集識別不是本環境，停止'; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds')) <> 4 then raise exception 'RN.RB: 四支新函式不是恰好都在（缺少或有同名多載），停止，請人工檢查'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_bookings_hold_state_guard','trg_contract_window_ins','trg_contract_window_upd')) <> 3 then raise exception 'RN.RB: 三個新觸發器不是恰好都在，停止'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), '') is distinct from '22edb0f9a4893e9d891a420ba4588440' then raise exception 'RN.RB: fn_hold_state_guard 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), '') is distinct from 'f6dbf9948aa381932b0f8d7fa605dfbe' then raise exception 'RN.RB: fn_contract_window_check 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), '') is distinct from 'd3c291fa4a1d308a9edaee54a5924f7c' then raise exception 'RN.RB: trg_contract_window_booking 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), '') is distinct from '05c51530e595cf296f9b8da951f66093' then raise exception 'RN.RB: fn_contract_adopt_holds 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')), '') is distinct from 'e7152b65fbb7d6c5d494cc938757caeb' then raise exception 'RN.RB: fn_hold_month_guard 的本體不是本次安裝的版本（可能被改過或是未知同名物件），停止，不刪除'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')
               and p.prosrc ~ '(fn_hold_state_guard|fn_contract_window_check|trg_contract_window_booking|fn_contract_adopt_holds)') then
    raise exception 'RN.RB: 還有其他函式引用新函式（例如測試專用的 zz_rn_adopt），停止（不用 CASCADE）'; end if;
  create temp table _rn_pre on commit drop as select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_trigger where not tgisinternal) n_trg,
     (select count(*) from pg_tables where schemaname='public') n_tables,
     (select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')) guard_acl;
end
$guard$;

drop trigger trg_contract_window_ins on public.bookings;
drop trigger trg_contract_window_upd on public.bookings;
drop trigger trg_bookings_hold_state_guard on public.bookings;
drop function public.fn_contract_adopt_holds(text, text[], boolean);
drop function public.trg_contract_window_booking();
drop function public.fn_contract_window_check(text, boolean);
drop function public.fn_hold_state_guard();
-- 還原原本的月份守門函式（逐字同正式庫 2026-11-16 的現行本體）
create or replace function public.fn_hold_month_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old   record;
  v_end   date;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_has   boolean := false;
  v_changed boolean := true;
  v_have  boolean := false;
begin
  -- 維運／Edge Function／直連不受限（見檔頭 ④）
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status::text = 'cancelled' or new.date is null then return new; end if;
  if not coalesce(new.pending_contract, false) or new.ticket_id is not null then return new; end if;
  if new.category::text = '自主訓練' then return new; end if;

  -- 這次寫入有沒有「改到卡位的身分或日期」：沒有就是一般編輯，放行（不追溯舊資料）。
  -- 比對項目含 status（把已取消的卡位復活）、category／ticket_type_id／member_id（換標籤、換會員來取得豁免）。
  if tg_op = 'UPDATE' then
    v_old := old; v_have := true;
  else
    select b.* into v_old from bookings b where b.id = new.id;     -- dbPut 的 upsert：既有列先走 INSERT 觸發
    v_have := found;
  end if;
  if v_have then
    v_changed := not (
          v_old.date is not distinct from new.date
      and coalesce(v_old.pending_contract, false) = coalesce(new.pending_contract, false)
      and v_old.ticket_id is not distinct from new.ticket_id
      and v_old.status is not distinct from new.status
      and v_old.category is not distinct from new.category
      and v_old.ticket_type_id is not distinct from new.ticket_type_id
      and v_old.member_id is not distinct from new.member_id
      and v_old.contract_id is not distinct from new.contract_id );
  end if;
  if not v_changed then return new; end if;

  v_end := public.fn_hold_month_limit_end(v_today);
  if new.date <= v_end then return new; end if;     -- 過去／當月／已開放的下個月：放行

  -- B 模式：帶 contract_id 且通過合約檢查（pending、未發票、會員與票種相符、額度足夠）→ 不受月份限制。
  -- 沒通過 → 往下走 C 判斷；絕不因為「有 contract_id」或「沒有 contract_id」就直接當成豁免或 C。
  if new.contract_id is not null then
    if public.fn_contract_hold_check(new.contract_id, new.member_id, new.ticket_type_id, new.id) is null then
      return new;
    end if;
  end if;

  /* 超出範圍：只有「確認這位會員有一張實際能用在這堂課的票」才放行；任何一項無法確認 → 不放行。
     「能用在這堂課」＝同一票種（ticket_type_id 相同），或這堂是團課（小班肌力）且票也是團課類別
     （前端團課票本來就整個類別共用）。教練課相容舊票、友善票等其他對應 **不** 在這裡放行（寧可擋、不要漏）。
     並要求：持有或共享、status='usable'、剩餘 > 0、效期涵蓋預約日、已到起始日（已開通者不看）、
     限時段票（time_restricted）遇到假日或 18:00 後下課一律不放行。
     任何一步出錯（欄位型別轉換失敗等）→ 當作不符合，不放行。 */
  if new.member_id is not null then
    begin
      select exists (
        select 1
          from member_tickets mt
          join ticket_types ttt on ttt.id = mt.ticket_type_id
         where ( mt.member_id = new.member_id or public.fn_tk_shared_has(to_jsonb(mt.shared_with), new.member_id) )
           and mt.status::text = 'usable'
           and coalesce(mt.sessions_remaining, 0) > 0
           and (mt.expire_date is null or mt.expire_date >= new.date)
           and not (mt.start_date is not null and mt.start_date > new.date and mt.activated_at is null)
           and ( mt.ticket_type_id = new.ticket_type_id
                 or ( new.category::text = '小班肌力' and ttt.category::text = '小班肌力' ) )
           and ( not coalesce(ttt.time_restricted, false)
                 or ( extract(isodow from new.date) between 1 and 5
                      and (new.start_time::time + make_interval(mins => coalesce(new.duration, 60))) <= time '18:00'
                      and new.start_time::time + make_interval(mins => coalesce(new.duration, 60)) > new.start_time::time ) )
      ) into v_has;
    exception when others then
      v_has := false;
    end;
    if v_has then return new; end if;
  end if;

  raise exception 'HOLD.MONTH_LIMIT:%', to_char(v_end, 'YYYY-MM-DD')
    using errcode = 'P0001',
          hint = '沒有符合資格票券的卡位只能預約到 ' || to_char(v_end, 'YYYY/MM/DD') || '；每月最後一個星期一起開放下個月';
end
$function$;

do $post$
declare pre record;
begin
  select * into pre from _rn_pre;
  if (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname='fn_hold_month_guard' and p.pronamespace='public'::regnamespace) is distinct from '20399e1ec62751e958ae8c2a1d00064f' then raise exception 'RN.RB.POST: 還原後的 fn_hold_month_guard 與原版不同，整個交易回滾'; end if;
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds')) or exists (select 1 from pg_trigger where not tgisinternal and tgname in ('trg_bookings_hold_state_guard','trg_contract_window_ins','trg_contract_window_upd')) then raise exception 'RN.RB.POST: 新物件沒有全部移除，整個交易回滾'; end if;
  if (select count(*) from pg_trigger where not tgisinternal) is distinct from pre.n_trg - 3 then raise exception 'RN.RB.POST: 觸發器總數不是 原有-3，整個交易回滾'; end if;
  if (select proacl::text from pg_proc where oid = to_regprocedure('public.fn_hold_month_guard()')) is distinct from pre.guard_acl then raise exception 'RN.RB.POST: fn_hold_month_guard 權限與回復前不同，整個交易回滾'; end if;
  if exists (select 1 from (select
     (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) n_funcs,
     (select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''),'|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')) funcs_sig,
     (select md5(string_agg(tablename||coalesce(array_to_string(roles,','),'')||policyname,'|' order by tablename,policyname)) from pg_policies where schemaname='public') pol,
     (select md5(string_agg(table_name||grantee||privilege_type,'|' order by table_name,grantee,privilege_type)) from information_schema.role_table_grants where table_schema='public') grants,
     (select count(*) from pg_tables where schemaname='public') n_tables) now_ where (now_.n_funcs, now_.funcs_sig, now_.pol, now_.grants, now_.n_tables) is distinct from (pre.n_funcs, pre.funcs_sig, pre.pol, pre.grants, pre.n_tables)) then
    raise exception 'RN.RB.POST: 其他函式／policies／table grants／資料表與回復前不同，整個交易回滾'; end if;
end
$post$;

commit;
