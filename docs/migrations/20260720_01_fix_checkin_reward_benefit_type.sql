-- ══════════════════════════════════════════════════════════════════════════
-- 20260720_01 · 修復：簽到發點自 2026-07-16 切 RPC 後從未對真實預約生效
-- ══════════════════════════════════════════════════════════════════════════
-- 根因：handle_checkin_reward 以 bookings.benefit_type 對 reward_rules，但除了
-- 7/17 兩筆測試預約外，全庫（匯入與所有現行建立路徑）benefit_type 皆為 null
-- → 對不到規則 → 一律標記 skipped、不發點。7/13~7/16 的發點是舊前端直接發的
-- （切 RPC 前），故 7/17 的 RPC 驗證（用有 benefit_type 的測試預約）通過、
-- 真實會員課全數漏發。
--
-- 修法：
--  ① handle_checkin_reward 在 benefit_type 為 null 時推導：
--     category='私人教練' → 票券快照 plan_name 含「友善」→ friendly_session，
--     否則 coaching_session（兩規則同為 2 點/7 天，分類不影響金額）。
--  ② 補發 2026-07-16 起被 skipped 的已簽到教練課（查核時 41 筆；效期依原課程日
--     ＋6，最早 7/22，皆未過期；已確認皆無與舊前端直發重疊，並以 not exists 再防）。
--
-- 回退：改回 docs/migrations/20260719_01_checkin_reward_policy.sql 的函式版本；
-- 補發的點數票可依 note『補發（benefit_type 修復）』辨識刪除並沖回 ticket_logs。
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
  v_bt text;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.reward_status <> 'pending' then return; end if;

  -- benefit_type 為 null（匯入與現行建立路徑皆未寫入）→ 以 category＋票券快照推導
  v_bt := b.benefit_type;
  if v_bt is null and b.category = '私人教練' then
    select case when t.plan_name like '%友善%' then 'friendly_session' else 'coaching_session' end
      into v_bt from member_tickets t where t.id = b.ticket_id;
    if v_bt is null then v_bt := 'coaching_session'; end if;
  end if;

  select * into rule
  from reward_rules
  where event_type = 'booking_checkin'
    and source_benefit_type = v_bt
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

-- ② 補發：7/16 起被 skipped 的已簽到教練課（防重複：已有 grant 紀錄者不動）
update bookings b set reward_status='pending'
 where b.reward_status='skipped' and b.checked_in_at is not null
   and b.checked_in_at >= '2026-07-16' and b.category='私人教練' and b.member_id is not null
   and not exists (select 1 from ticket_logs l where l.booking_id=b.id and l.action='grant');

select public.handle_checkin_reward(b.id)
from bookings b
where b.reward_status='pending' and b.checked_in_at is not null
  and b.checked_in_at >= '2026-07-16' and b.category='私人教練' and b.member_id is not null;

commit;

-- 驗證（執行後跑）：
-- select reward_status, count(*) from bookings
--  where checked_in_at>='2026-07-16' and category='私人教練' and member_id is not null group by 1;
-- select count(*), min(expire_date), max(expire_date) from member_tickets
--  where source_type='checkin' and start_date>='2026-07-16';
