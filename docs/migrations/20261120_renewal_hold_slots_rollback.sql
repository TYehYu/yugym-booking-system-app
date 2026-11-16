-- 續約銜接卡位 v2 回復（測試庫）：移除新增的物件並還原原本的 fn_hold_month_guard。不用 CASCADE；不動任何資料。
-- ⚠ 順序：若測試庫還裝著並行驗證用的 zz_rn_adopt（它引用承接函式），要先執行 docs/testdb/renewal/phase_remove_renewal_zz.sql；否則下面的「沒有其他函式引用」檢查會拒絕刪除（這是故意的，不用 CASCADE）。
-- 單一交易：先核對（四支新函式都在且本體＝本次安裝版本、沒有其他函式引用它們）→ 刪除 → 還原守門函式 → 核對還原後指紋＝原版（20399e1ec62751e958ae8c2a1d00064f，等於套用前、正式庫現行）；任何一步不符整個回滾。
begin;
set local lock_timeout = '5s';
do $g$ begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_hold_state_guard()')), '') is distinct from '22edb0f9a4893e9d891a420ba4588440' then raise exception 'RN.RB: fn_hold_state_guard 的本體不是本次安裝的版本（可能被改過），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_window_check(text,boolean)')), '') is distinct from 'f6dbf9948aa381932b0f8d7fa605dfbe' then raise exception 'RN.RB: fn_contract_window_check 的本體不是本次安裝的版本（可能被改過），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.trg_contract_window_booking()')), '') is distinct from 'd3c291fa4a1d308a9edaee54a5924f7c' then raise exception 'RN.RB: trg_contract_window_booking 的本體不是本次安裝的版本（可能被改過），停止，不刪除'; end if;
  if coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('public.fn_contract_adopt_holds(text,text[],boolean)')), '') is distinct from '05c51530e595cf296f9b8da951f66093' then raise exception 'RN.RB: fn_contract_adopt_holds 的本體不是本次安裝的版本（可能被改過），停止，不刪除'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname not in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds','fn_hold_month_guard')   -- 守門函式會在同一個交易內還原，註解裡提到新函式名不算引用
               and p.prosrc ~ '(fn_hold_state_guard|fn_contract_window_check|trg_contract_window_booking|fn_contract_adopt_holds)') then
    raise exception 'RN.RB: 還有其他函式引用新函式，停止（不用 CASCADE）'; end if;
end $g$;
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
do $v$ begin
  if (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname='fn_hold_month_guard' and p.pronamespace='public'::regnamespace) is distinct from '20399e1ec62751e958ae8c2a1d00064f' then
    raise exception 'RN.RB.POST: 還原後的 fn_hold_month_guard 與原版不同，整個交易回滾'; end if;
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('fn_hold_state_guard','fn_contract_window_check','trg_contract_window_booking','fn_contract_adopt_holds')) then
    raise exception 'RN.RB.POST: 新函式沒有全部移除，整個交易回滾'; end if;
end $v$;
commit;
