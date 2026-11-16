do $bf$
declare
  c_ticket   constant text := 'TK-mvp2vrdxd4h8';
  c_member   constant text := 'm1a1779dd9cefb3b';
  c_plan     constant text := '團課 4週優惠';
  c_type     constant text := 'tt-mqdt4ubv8e5i';
  c_first    constant date := date '2026-11-02';
  c_expire   constant date := date '2026-11-29';
  c_valid    constant integer := 28;
  c_total    constant integer := 4;
  c_rem      constant integer := 1;
  c_sig      constant text := 'BACKFILL-05B';
  c_b1       constant text := 'BK-mt9upc8jeyp3';   -- 11/02 已簽到
  c_b2       constant text := 'BK-mt9upcchql3q';   -- 11/09 已簽到
  c_b3       constant text := 'BK-mt9upcgf0vqo';   -- 11/16 已報名未到
  t member_tickets%rowtype; v_first date; v_n integer; v_logs integer; v_bad integer; v_mode text; v_amb integer; v_g integer; v_d integer; v_dd integer; v_sum bigint; v_bk integer;
  v_hash_before text; v_hash_after text; v_exp_act timestamptz := (c_first::timestamp at time zone 'Asia/Taipei');
begin
  -- ① 票券身分與目前狀態（任何一項不符就中止——狀態有變代表前提不成立，要重新審查）
  select * into t from member_tickets where id = c_ticket for update;
  if not found then raise exception 'BACKFILL.ABORT: 找不到票券 %', c_ticket; end if;
  if t.member_id is distinct from c_member or t.plan_name is distinct from c_plan or t.ticket_type_id is distinct from c_type
     or t.status::text is distinct from 'usable' or t.sessions_total is distinct from c_total or t.sessions_remaining is distinct from c_rem
     or t.valid_days is distinct from c_valid then
    raise exception 'BACKFILL.ABORT: 票券身分或堂數狀態與審查時不同（member=% plan=% status=% total=% rem=% valid_days=%）', t.member_id, t.plan_name, t.status, t.sessions_total, t.sessions_remaining, t.valid_days; end if;
  if t.activated_at is not null or t.start_date is not null or t.expire_date is not null then
    raise exception 'BACKFILL.ABORT: 效期已有值（activated_at=% start=% expire=%）——可能已被 P0-E 或人工開通，不覆蓋', t.activated_at, t.start_date, t.expire_date; end if;
  v_mode := to_jsonb(t) ->> 'activation_mode';
  if v_mode is not null then raise exception 'BACKFILL.ABORT: activation_mode 已有值（%），不覆蓋', v_mode; end if;
  if (to_jsonb(t) ->> 'extended_at') is not null or (to_jsonb(t) ->> 'extended_from') is not null or (to_jsonb(t) ->> 'extended_by') is not null
     or (to_jsonb(t) ->> 'void_mode') is not null or coalesce((to_jsonb(t) ->> 'no_refund')::boolean, false)
     or (to_jsonb(t) ->> 'shared_with') is not null or (to_jsonb(t) ->> 'installment') is not null then
    raise exception 'BACKFILL.ABORT: 票券有展延／作廢／共享／分期紀錄，不屬於單純未開通案例'; end if;
  -- ② 帳本：只有 發放 1 筆＋扣課 3 筆；沒有退款、調整、展延、作廢、退費字樣
  select count(*) into v_logs from ticket_logs where ticket_id = c_ticket;
  select count(*) into v_bad from ticket_logs where ticket_id = c_ticket
     and (action::text not in ('grant', 'deduct') or note ilike '%展延%' or note ilike '%延長%' or note ilike '%作廢%' or note ilike '%退費%' or note ilike '%補正%');
  if v_logs <> 4 or v_bad <> 0 then
    raise exception 'BACKFILL.ABORT: 帳本不是審查時的樣子（共 % 筆，其中 % 筆是退款／調整／展延／作廢／補正）', v_logs, v_bad; end if;
  -- ②b 帳本逐筆精確核對（不只看筆數與類型）：1 筆 grant／delta +4／無預約；3 筆 deduct／各 delta −1／正好對應三個已審查預約；delta 總和＝剩餘堂數
  select count(*) filter (where action::text = 'grant' and delta = 4 and booking_id is null),
         count(*) filter (where action::text = 'deduct' and delta = -1 and booking_id in (c_b1, c_b2, c_b3)),
         count(distinct booking_id) filter (where action::text = 'deduct' and delta = -1 and booking_id in (c_b1, c_b2, c_b3)),
         coalesce(sum(delta), 0)
    into v_g, v_d, v_dd, v_sum from ticket_logs where ticket_id = c_ticket;
  if v_g <> 1 or v_d <> 3 or v_dd <> 3 or v_sum <> c_rem then
    raise exception 'BACKFILL.ABORT: 帳本明細與審查時不同（grant+4 共 % 筆、deduct-1 對應三個預約共 % 筆（不重複 % 個）、delta 總和 %）', v_g, v_d, v_dd, v_sum; end if;
  -- ②c 三個預約的歸屬與日期：必須是她的座位票、小班肌力、日期符合審查資料
  select count(*) into v_bk from bookings b
   where b.category::text = '小班肌力' and (b.seat_tickets ->> c_member) = c_ticket
     and ((b.id = c_b1 and b.date = date '2026-11-02') or (b.id = c_b2 and b.date = date '2026-11-09') or (b.id = c_b3 and b.date = date '2026-11-16'));
  if v_bk <> 3 then raise exception 'BACKFILL.ABORT: 預約歸屬與審查時不同（符合的預約 % 個，應為 3：票券歸屬、課別、日期）', v_bk; end if;
  -- ③ 最早「實際簽到」的上課日要等於 c_first；沒有更早的簽到；同一堂不能有兩張她的票（歧義不猜）
  select min(d) into v_first from (
    select b.date d from bookings b where b.ticket_id = c_ticket and b.category::text <> '小班肌力' and b.status::text in ('checked_in', 'completed')
    union all
    select b.date from (select l.booking_id from ticket_logs l where l.ticket_id = c_ticket group by 1
                         having sum(case l.action::text when 'deduct' then 1 when 'refund' then -1 else 0 end) > 0) n
      join bookings b on b.id = n.booking_id
     where b.category::text = '小班肌力'
       and exists (select 1 from jsonb_each_text(coalesce(b.attendance, '{}'::jsonb)) a where a.value = 'checked_in' and (a.key = c_member or a.key like c_member || '#%'))
  ) s;
  if v_first is distinct from c_first then raise exception 'BACKFILL.ABORT: 最早實際簽到日是 %，不是審查時的 %', v_first, c_first; end if;
  select count(*) into v_amb from (
    select n.booking_id from (select l.ticket_id, l.booking_id from ticket_logs l group by 1, 2
                               having sum(case l.action::text when 'deduct' then 1 when 'refund' then -1 else 0 end) > 0) n
      join member_tickets mt on mt.id = n.ticket_id
     where mt.member_id = c_member and n.booking_id in (select l2.booking_id from ticket_logs l2 where l2.ticket_id = c_ticket)
     group by n.booking_id having count(*) > 1) z;
  if v_amb > 0 then raise exception 'BACKFILL.ABORT: 有 % 堂課她同時有兩張票的淨扣課，歸屬有歧義，不猜', v_amb; end if;
  if c_expire < (now() at time zone 'Asia/Taipei')::date then
    raise exception 'BACKFILL.ABORT: 預期到期日 % 已經過了，是否仍要補正需要人工決定', c_expire; end if;
  -- ④ 其他票券的快照（補正後必須完全相同）
  select md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_hash_before from member_tickets where id <> c_ticket;
  -- ⑤ 補正（條件式更新，只會成功一次；不改堂數、狀態、activation_mode）
  update member_tickets set start_date = c_first, expire_date = c_expire, activated_at = v_exp_act
   where id = c_ticket and activated_at is null and start_date is null and expire_date is null and status::text = 'usable'
     and sessions_total = c_total and sessions_remaining = c_rem and valid_days = c_valid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'BACKFILL.ABORT: 條件式更新影響 % 列（應為 1）', v_n; end if;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), c_ticket, 'adjust', 0, null, 'system',
          '補正（' || c_sig || '）：已有簽到但效期未開通，依最早簽到課程日 ' || to_char(c_first, 'YYYY-MM-DD') || ' 起算，效期至 ' || to_char(c_expire, 'YYYY-MM-DD') || '；單張補正，不改堂數');
  -- ⑥ 事後核對
  select * into t from member_tickets where id = c_ticket;
  if t.start_date is distinct from c_first or t.expire_date is distinct from c_expire or t.activated_at is distinct from v_exp_act
     or t.sessions_total <> c_total or t.sessions_remaining <> c_rem or t.status::text <> 'usable' or (to_jsonb(t) ->> 'activation_mode') is not null then
    raise exception 'BACKFILL.POSTCHECK_FAILED: 補正後的票券與預期不符'; end if;
  if (select count(*) from ticket_logs where ticket_id = c_ticket) <> 5 then raise exception 'BACKFILL.POSTCHECK_FAILED: 帳本應為 5 筆'; end if;
  select md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_hash_after from member_tickets where id <> c_ticket;
  if v_hash_after is distinct from v_hash_before then raise exception 'BACKFILL.POSTCHECK_FAILED: 其他票券被改動'; end if;
end
$bf$;