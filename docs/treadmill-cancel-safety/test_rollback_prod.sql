-- Review artifact only. Production execution requires release authorization.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $guard$begin
if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'RELEASE.WRONG_ENV';end if;
if not exists(select 1 from pg_proc where oid='public.fn_cancel_booking(text,text,boolean)'::regprocedure
 and md5(prosrc)='f8a5ac30094b81d9f46e00f6e6d8f842' and proacl::text='{postgres=X/postgres,=X/postgres}'
 and prosecdef and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.VERSION_OR_ACL';end if;
end $guard$;
do $installed$begin
if not exists(select 1 from pg_proc where oid='public.fn_treadmill_sibling_parent_guard()'::regprocedure and md5(prosrc)='43efe9d94f06fb70171fcb7a7fc4b6d5' and prosecdef and proconfig=array['search_path=public, pg_temp'])
 or has_function_privilege('anon','public.fn_treadmill_sibling_parent_guard()','execute')
 or has_function_privilege('authenticated','public.fn_treadmill_sibling_parent_guard()','execute')
 or has_function_privilege('service_role','public.fn_treadmill_sibling_parent_guard()','execute')
 or not exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_treadmill_sibling_parent_guard' and tgfoid='public.fn_treadmill_sibling_parent_guard()'::regprocedure and tgenabled='O' and tgtype=23) then raise exception 'RELEASE.SIBLING_GUARD_INVALID';end if;
end $installed$;
create temp table tc_release_snapshot on commit drop as
select (select md5(string_agg(oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_booking','fn_treadmill_sibling_parent_guard')) functions,
 (select md5(string_agg(pg_get_triggerdef(oid),'|' order by tgrelid,tgname)) from pg_trigger where not tgisinternal and tgname<>'trg_treadmill_sibling_parent_guard') triggers;
CREATE OR REPLACE FUNCTION public.fn_cancel_booking(p_booking_id text, p_reason text DEFAULT NULL::text, p_refund boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  b bookings%rowtype;
  v_hours_before numeric;
  v_should_refund boolean;
  v_start_ts timestamptz;
  v_actor text;                 -- 'desk' | 'coach' | 'member'
  v_emp text;
  v_grace boolean;
  v_self_training boolean;
  v_legacy_group boolean;
  v_why text; v_ret jsonb;
begin
  select * into b from bookings where id=p_booking_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;

  -- ── 判定身分 ──
  -- is_staff_desk() 對非員工回的是 NULL 不是 false，一律用 coalesce 收斂。
  if coalesce(is_staff_desk(), false) then
    v_actor := 'desk';
  elsif current_staff_role() is not null then
    v_actor := 'coach';
    v_emp := current_employee_id();
    if v_emp is null or b.coach_id is distinct from v_emp then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
    if b.category::text = '小班肌力' then
      return jsonb_build_object('ok',false,'error_code','GROUP.DESK_ONLY','actor','coach');
    end if;
  else
    v_actor := 'member';
    if current_member_id() is null or b.member_id is null or current_member_id() is distinct from b.member_id then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
  end if;

  if b.status='cancelled' then return jsonb_build_object('ok',true,'already',true); end if;

  v_start_ts := ((b.date || ' ' || b.start_time)::timestamp at time zone 'Asia/Taipei');
  v_hours_before := extract(epoch from (v_start_ts - now()))/3600;
  v_grace := coalesce(b.created_at is not null and now() - b.created_at <= interval '10 minutes', false);
  -- ⚠ benefit_type 可能是 NULL，一定要 coalesce（0821 修過一次：NULL 會讓整條規則失效）
  v_self_training := coalesce(b.benefit_type = 'training_pass', false)
                     or coalesce(b.category::text = '自主訓練', false);
  v_legacy_group := coalesce(b.category::text = '小班肌力', false)
                    and coalesce(jsonb_array_length(coalesce(b.member_ids,'[]'::jsonb)), 0) = 0;

  -- ── 會員自助只限團課與自主訓練（2026-08-21）──
  if v_actor = 'member' and not v_self_training and not v_legacy_group then
    return jsonb_build_object('ok',false,'error_code','CANCEL.DESK_ONLY',
      'category', b.category::text, 'actor', v_actor);
  end if;

  -- ── 24 小時內不能自行取消：2026-08-21 起**只擋會員**（原本連教練一起擋）──
  -- 教練改時間本來就不受限，擋取消只是讓他多繞一步；櫃檯與管理員一向不受限。
  if v_actor = 'member' and v_hours_before < 24 and not v_grace and not v_self_training then
    return jsonb_build_object('ok',false,'error_code','CANCEL.TOO_LATE',
      'hours_before', round(v_hours_before,2), 'actor', v_actor);
  end if;

  if v_actor='desk' then
    v_should_refund := coalesce(p_refund, true);
    v_why := null;
  else
    v_should_refund := true;
    v_why := case
      when v_self_training then '（自主訓練，已退回 1 點）'
      when v_grace then '（預約後 10 分鐘內取消，已退回 1 堂）'
      else '（已退回 1 堂）' end;
  end if;

  if v_should_refund and b.ticket_id is not null then
    v_ret:=public.benefit_refund(b.ticket_id,1,b.id);
    if not coalesce((v_ret->>'refunded')::boolean,false) then raise exception 'REFUND.NO_DEDUCT'; end if;
  end if;

  update bookings set status='cancelled', cancelled_at=now(), refund_waived=(not v_should_refund),
    reward_status = case when reward_status='issued' then 'revoked' else reward_status end,
    makeup_status = case when not v_should_refund and b.benefit_type in ('coaching_session','friendly_session')
                         then 'eligible_pending' else 'not_requested' end
  where id=b.id;

  if v_actor='member' then
    perform desk_alert(b.member_id,'self_cancel','　自行取消了'||b.category::text,
      to_char(b.date,'MM/DD')||' '||b.start_time||'　'||b.category::text||coalesce(v_why,''));
  end if;

  return jsonb_build_object('ok',true,'booking_id',b.id,
    'cancellation_result', case when v_should_refund then 'refunded' else 'forfeited' end,
    'hours_before', round(v_hours_before,2),
    'refunded_ticket', case when v_should_refund then b.ticket_id else null end,
    'makeup','not_requested');
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm);
end
$function$;

drop trigger trg_treadmill_sibling_parent_guard on public.bookings;
drop function public.fn_treadmill_sibling_parent_guard();

do $guard$begin
if (pg_control_system()).system_identifier::text <> '7662742571317219726' then raise exception 'RELEASE.WRONG_ENV';end if;
if not exists(select 1 from pg_proc where oid='public.fn_cancel_booking(text,text,boolean)'::regprocedure
 and md5(prosrc)='f57f64a33082355d881b0d345bf6edd7' and proacl::text='{postgres=X/postgres,=X/postgres}'
 and prosecdef and proconfig=array['search_path=public, pg_temp']) then raise exception 'RELEASE.VERSION_OR_ACL';end if;
end $guard$;
do $absent$begin
if to_regprocedure('public.fn_treadmill_sibling_parent_guard()') is not null or exists(select 1 from pg_trigger where tgrelid='public.bookings'::regclass and tgname='trg_treadmill_sibling_parent_guard') then raise exception 'RELEASE.NAME_OCCUPIED';end if;
end $absent$;
do $unchanged$begin
if exists(select 1 from tc_release_snapshot s where s.functions is distinct from
 (select md5(string_agg(oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and proname not in ('fn_cancel_booking','fn_treadmill_sibling_parent_guard'))
 or s.triggers is distinct from (select md5(string_agg(pg_get_triggerdef(oid),'|' order by tgrelid,tgname)) from pg_trigger where not tgisinternal and tgname<>'trg_treadmill_sibling_parent_guard')) then raise exception 'RELEASE.UNRELATED_OBJECT_CHANGED';end if;
end $unchanged$;
commit;
