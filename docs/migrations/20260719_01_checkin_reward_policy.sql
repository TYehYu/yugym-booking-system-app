-- 簽到獎勵：當日或事後補簽皆發放；課程日為第 1 天，第 7 天 23:59:59 到期。
begin;

create or replace function public.handle_checkin_reward(p_booking_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  b bookings%rowtype;
  rule reward_rules%rowtype;
  v_ticket text;
  v_expire_date date;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.reward_status <> 'pending' then return; end if;

  select * into rule
  from reward_rules
  where event_type = 'booking_checkin'
    and source_benefit_type = b.benefit_type
    and active = true
  order by created_at nulls last
  limit 1;

  if not found or b.member_id is null then
    update bookings set reward_status = 'skipped' where id = b.id;
    return;
  end if;

  -- valid_days=7：課程日算第 1 天，因此日期欄存第 7 天（+6）。
  v_expire_date := b.date + greatest(coalesce(rule.valid_days, 7), 1) - 1;
  v_ticket := gen_short_id('TK-');

  insert into member_tickets
    (id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining,
     start_date, expire_date, status, source, source_type, source_ref, source_booking_id)
  values
    (v_ticket, b.member_id, rule.reward_ticket_type_id, '自主訓練點數',
     rule.reward_amount, rule.reward_amount, b.date, v_expire_date, 'usable',
     'checkin_grant', 'checkin', b.id, b.id);

  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), v_ticket, 'grant', rule.reward_amount, b.id, 'system',
          '教練課簽到發放自主訓練點數（含補簽）');

  update bookings
  set reward_status='issued', reward_issued_at=now(),
      reward_type=rule.reward_ticket_type_id, reward_issued=true
  where id=b.id;
end
$function$;

revoke execute on function public.handle_checkin_reward(text) from public, anon, authenticated;
commit;
