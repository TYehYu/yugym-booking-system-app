begin;
set local lock_timeout='5s';
do $guard$begin if (select system_identifier::text from pg_control_system()) <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end $guard$;
do $pre$begin
 if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)')) is distinct from '550c28a816b6e46f636287d7fa33405a' then raise exception 'BODY_CHANGED';end if;
 if exists(select 1 from bookings where id like 'CC-HS-%') or exists(select 1 from members where id like 'CC-HS-%') or exists(select 1 from contracts where id like 'CC-HS-%') or exists(select 1 from member_tickets where id like 'CC-HS-%') then raise exception 'FIXTURES_NOT_CLEANED';end if;
end $pre$;
drop function public.zz_hs_call(text,text,jsonb,int,int,int);
drop function public.zz_hs_fingerprint();
drop function public.fn_hold_settle_new_ticket(text,boolean,text,jsonb);
drop function public.fn_contract_adopt_holds(text,text[],boolean);
drop trigger trg_contract_window_ins on bookings;
drop trigger trg_contract_window_upd on bookings;
drop trigger trg_bookings_hold_state_guard on bookings;
drop function public.trg_contract_window_booking();
drop function public.fn_contract_window_check(text,boolean);
drop function public.fn_hold_state_guard();
drop trigger trg_booking_op_rev on bookings;
drop trigger trg_booking_op_rev_insdel on bookings;
drop function public.fn_desk_cancel_booking(text,text);
drop function public.fn_desk_deduct_ticket(text,text,text,text);
drop function public.fn_desk_op_begin(text,text,text,text);
drop function public.fn_desk_booking_rev(text);
drop function public.fn_booking_rev_of(text);
drop function public.trg_booking_op_rev();
drop table public.ticket_deduct_ops;
drop table public.booking_op_rev;
drop trigger trg_tk_quota_guard on member_tickets;
drop function public.fn_refund_ticket(text,text,text);
drop function public.trg_tk_quota_guard();
drop function public.fn_ticket_net_checked(text,text);
CREATE OR REPLACE FUNCTION public.fn_hold_month_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t member_tickets%rowtype; v_net integer;
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)
    into v_net from ticket_logs where ticket_id = p_ticket and booking_id = p_booking;
  if v_net <= 0 then return false; end if;
  if coalesce(t.sessions_total, 0) > 0 and coalesce(t.sessions_remaining, 0) >= t.sessions_total then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system', '⚠ 已阻擋：餘額已滿，未再退課（效期屆滿自動取消）');
    return false;
  end if;
  update member_tickets
     set sessions_remaining = coalesce(sessions_remaining, 0) + 1,
         status = case when status::text = 'used_up' then 'usable' else status end
   where id = p_ticket;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'refund', 1, p_booking, 'system', coalesce(p_note, '取消返還原票'));
  return true;
end
$function$
;
CREATE OR REPLACE FUNCTION public.current_employee_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from employees where auth_id = auth.uid() limit 1;
$function$
;
do $check$begin if (select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f') <> '0915af25692a47c58e9dceca67d1442e' then raise exception 'BASELINE_NOT_RESTORED';end if;end $check$;
notify pgrst,'reload schema';commit;