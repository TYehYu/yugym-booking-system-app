/* ② 會員自行報名團課時，也要記下「這一格用哪張票」（2026-10-20 使用者指示「做」）

   原本只寫 member_ids 與 ticket_logs，bookings.seat_tickets 空著 ——
   櫃檯之後要替同一人加第 2 個名額時，_saveGroupMembers 的 _used 看不到這張票、
   沒帶 multi，就撞上「這一堂在這張票上已經扣過 1 堂，不重複扣」的護欄
   → 名額加了、堂數沒扣（柯麗貞 10/20 就是這樣，見
     20261020_fix_kelizhen_second_seat.sql）。

   只加兩段，其餘逐字照原本的定義（含所有既有註解）：
     ・v_seats / v_key：算這一格的名額鍵，照前端 seatKeys()
       （第 1 格＝mid、第 2 格起＝mid#n）
     ・update bookings 一併寫 seat_tickets
   ⚠ 上面的 BOOKING.DUP 目前讓同一位會員不能從會員端報第二格，所以 v_seats 恆為 0；
     照規則算是為了日後放寬時不會寫錯鍵 —— 寫錯鍵＝圓形卡認錯格（0829 踩過）。
   ⚠ 前端那一半（grpDeductedTickets 改問帳本）已經上線，
     兩邊是各自獨立的防線，這一支修的是「事實一開始就該被記下來」。 */
create or replace function public.fn_member_join_group(p_booking_id text, p_ticket_id text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_mid text := current_member_id();
        v_b bookings%rowtype; v_tk member_tickets%rowtype; v_cnt int; v_max int;
        v_seats int; v_key text;                                   -- ← 2026-10-20 新增
begin
  if v_mid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select * into v_b from bookings where id=p_booking_id for update;
  if not found or v_b.status <> 'booked' or v_b.category::text <> '小班肌力' then
    return jsonb_build_object('ok',false,'error_code','BOOKING.NOT_FOUND'); end if;
  if (v_b.date::text||' '||v_b.start_time)::timestamp <= (now() at time zone 'Asia/Taipei') then
    return jsonb_build_object('ok',false,'error_code','BOOKING.PAST_DATE'); end if;
  -- 會員端團課只開放「一週內」報名（2026-09-08 使用者指示）：今天算第 1 天，往後含今天共 7 天。
  -- 前端三道（預約表單來源、首頁課卡圓鈕、報名前攔截）已經擋住，這裡是最後一道 --
  -- 前端是畫面，不是防線。⚠ 只擋會員自己報名這條路；櫃檯與教練排課不經過這支。
  if v_b.date > (((now() at time zone 'Asia/Taipei')::date) + 6) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.TOO_FAR'); end if;
  if coalesce(v_b.member_ids,'[]'::jsonb) @> to_jsonb(v_mid) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.DUP'); end if;
  -- 有效名額＝名單數 − 請假數（2026-08-12 請假釋出名額）
  v_cnt := jsonb_array_length(coalesce(v_b.member_ids,'[]'::jsonb))
         - (select count(*)::int from jsonb_each_text(coalesce(v_b.attendance,'{}'::jsonb)) t where t.value='leave');
  -- 2026-10-09 使用者指示：「完全沒有人報名的要阻擋」「因為教練可能會有其他安排
  -- 不能臨時安插上課」，同日再收斂：「這一句只限當天的課程　如果會員要加隔天沒人
  -- 報名的課程是可以的」。
  --   → **只有今天**的團課、而且一個人都還沒有時，會員不能自己報進去。
  --     隔天以後的空堂照樣開放（教練還有時間安排）。
  -- ⚠ 用有效名額判斷：名單上只剩請假的人，等於沒有人。
  -- ⚠ 只擋會員自己報名這條路 —— 櫃檯／教練改名單走的是 bookings 的直接寫入，
  --   不經過這支，所以「跟教練溝通過後臨時加開」的權限完全沒有被動到。
  if v_cnt <= 0 and v_b.date = ((now() at time zone 'Asia/Taipei')::date) then
    return jsonb_build_object('ok',false,'error_code','BOOKING.NO_SEED'); end if;
  v_max := coalesce(v_b.max_heads,5);
  if v_cnt >= v_max then return jsonb_build_object('ok',false,'error_code','BOOKING.FULL'); end if;

  if p_ticket_id is not null then
    select mt.* into v_tk from member_tickets mt
      join ticket_types tt on tt.id=mt.ticket_type_id
     where mt.id=p_ticket_id and mt.member_id=v_mid and mt.status='usable'
       and coalesce(mt.sessions_remaining,0)>0 and tt.category::text='小班肌力'
       and (mt.expire_date is null or mt.expire_date >= v_b.date)
     limit 1 for update;
    if not found then return jsonb_build_object('ok',false,'error_code','TICKET.INVALID_PICK'); end if;
  else
    select mt.* into v_tk from member_tickets mt
      join ticket_types tt on tt.id=mt.ticket_type_id
     where mt.member_id=v_mid and mt.status='usable' and coalesce(mt.sessions_remaining,0)>0
       and tt.category::text='小班肌力'
       and (mt.expire_date is null or mt.expire_date >= v_b.date)
     order by mt.expire_date asc nulls last, mt.purchase_date asc nulls last, mt.created_at asc
     limit 1 for update;
    if not found then return jsonb_build_object('ok',false,'error_code','TICKET.NONE'); end if;
  end if;

  -- ── 2026-10-20 新增 ───────────────────────────────────────────────
  -- 這一格的名額鍵，照前端 seatKeys()：第 1 格＝mid、第 2 格起＝mid#n。
  select count(*)::int into v_seats
    from jsonb_array_elements_text(coalesce(v_b.member_ids,'[]'::jsonb)) x where x = v_mid;
  v_key := case when v_seats > 0 then v_mid||'#'||(v_seats+1) else v_mid end;

  update bookings
     set member_ids   = coalesce(member_ids,'[]'::jsonb) || to_jsonb(v_mid),
         -- 逐名額記下用了哪張票：櫃檯之後要加第 2 格時，才知道這張票已經在這一堂用過
         seat_tickets = coalesce(seat_tickets,'{}'::jsonb) || jsonb_build_object(v_key, v_tk.id)
   where id=v_b.id;
  -- ──────────────────────────────────────────────────────────────────
  update member_tickets set sessions_remaining = sessions_remaining-1,
         status = case when sessions_remaining-1<=0 then 'used_up' else status end
   where id=v_tk.id;
  insert into ticket_logs (id,ticket_id,action,delta,booking_id,operator,note)
  values (gen_short_id('LG-'),v_tk.id,'deduct',-1,v_b.id,v_mid,
          case when p_ticket_id is null then '會員自行報名團體課扣 1 堂'
               else '會員自行報名團體課扣 1 堂（會員指定此票券）' end);
  perform desk_alert(v_mid,'self_book','　自行報名了團體課',
    to_char(v_b.date,'MM/DD')||' '||v_b.start_time||'　團體課（名單 '||(v_cnt+1)||'/'||v_max||'）');
  return jsonb_build_object('ok',true,'booking_id',v_b.id,'ticket_id',v_tk.id,'remaining_after',v_tk.sessions_remaining-1);
exception when others then return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;
