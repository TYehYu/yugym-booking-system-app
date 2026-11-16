-- 陳玟勳單張票補正｜測試庫隔離驗證（單一交易、結尾必定 raise exception 回滾；只能對測試庫 kucvxpjatptfckhlxptj）
-- 核心區塊與 05b_apply／05b_rollback 逐字相同（只在執行時把票券／會員／票種／方案四個常數換成夾具值）。結果在 CHEN_BF_RESULT: 之後。
do $t$
declare
  core_a text := $core$do $bf$
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
$bf$;$core$;
  core_r text := $core$do $rbk$
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
  t member_tickets%rowtype; v_n integer; v_g integer; v_d integer; v_dd integer; v_adj integer; v_all integer; v_sum bigint; v_exp_act timestamptz := (c_first::timestamp at time zone 'Asia/Taipei'); v_hash_before text; v_hash_after text;
begin
  select * into t from member_tickets where id = c_ticket for update;
  if not found then raise exception 'BACKFILL.ROLLBACK_ABORT: 找不到票券'; end if;
  -- 只在「仍然是補正後的樣子」才還原；之後被人改過（展延、手動調整、撤銷簽到重算…）就中止，不蓋掉
  if t.start_date is distinct from c_first or t.expire_date is distinct from c_expire or t.activated_at is distinct from v_exp_act
     or (to_jsonb(t) ->> 'activation_mode') is not null or t.member_id is distinct from c_member or t.status::text <> 'usable'
     or (to_jsonb(t) ->> 'extended_at') is not null or (to_jsonb(t) ->> 'extended_from') is not null then
    raise exception 'BACKFILL.ROLLBACK_ABORT: 票券已不是補正後的樣子（start=% expire=% activated_at=% status=%），不還原', t.start_date, t.expire_date, t.activated_at, t.status; end if;
  -- 任何寫入之前，完整核對票種／方案／效期天數／堂數／狀態與帳本（補正後有新增使用、退款或其他調整就拒絕，改走重新審查）
  if t.ticket_type_id is distinct from c_type or t.plan_name is distinct from c_plan or t.valid_days is distinct from c_valid
     or t.sessions_total is distinct from c_total or t.sessions_remaining is distinct from c_rem then
    raise exception 'BACKFILL.ROLLBACK_ABORT: 票種／方案／效期天數／堂數與補正當時不同（type=% plan=% valid_days=% total=% rem=%），不還原', t.ticket_type_id, t.plan_name, t.valid_days, t.sessions_total, t.sessions_remaining; end if;
  select count(*), count(*) filter (where action::text = 'grant' and delta = 4 and booking_id is null),
         count(*) filter (where action::text = 'deduct' and delta = -1 and booking_id in (c_b1, c_b2, c_b3)),
         count(distinct booking_id) filter (where action::text = 'deduct' and delta = -1 and booking_id in (c_b1, c_b2, c_b3)),
         count(*) filter (where action::text = 'adjust' and delta = 0 and booking_id is null and note like '補正（' || c_sig || '）%'),
         coalesce(sum(delta), 0)
    into v_all, v_g, v_d, v_dd, v_adj, v_sum from ticket_logs where ticket_id = c_ticket;
  if v_all <> 5 or v_g <> 1 or v_d <> 3 or v_dd <> 3 or v_adj <> 1 or v_sum <> c_rem then
    raise exception 'BACKFILL.ROLLBACK_ABORT: 帳本已不是「補正後」的樣子（共 % 筆；grant % deduct % 補正帳 % delta 總和 %）——補正之後有使用、退款或其他調整，或已還原過，不還原，請重新審查', v_all, v_g, v_d, v_adj, v_sum; end if;
  select md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_hash_before from member_tickets where id <> c_ticket;
  update member_tickets set start_date = null, expire_date = null, activated_at = null
   where id = c_ticket and start_date = c_first and expire_date = c_expire and activated_at = v_exp_act;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'BACKFILL.ROLLBACK_ABORT: 條件式更新影響 % 列（應為 1）', v_n; end if;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), c_ticket, 'adjust', 0, null, 'system', '補正還原（' || c_sig || '）：效期恢復未啟用；原補正紀錄帳保留作稽核');
  select * into t from member_tickets where id = c_ticket;
  if t.start_date is not null or t.expire_date is not null or t.activated_at is not null or t.sessions_remaining <> c_rem or t.sessions_total <> c_total then
    raise exception 'BACKFILL.ROLLBACK_POSTCHECK_FAILED'; end if;
  select md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_hash_after from member_tickets where id <> c_ticket;
  if v_hash_after is distinct from v_hash_before then raise exception 'BACKFILL.ROLLBACK_POSTCHECK_FAILED: 其他票券被改動'; end if;
end
$rbk$;$core$;
  v_mid text; v_ok boolean; r text; out jsonb := '{}'::jsonb; t member_tickets%rowtype; v_n int; v_logs int; v_start_after date;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: prod?'; end if;
  create function pg_temp.run_core(p_core text, p_exp text default '2026-11-29') returns text language plpgsql as $f$
  declare c text;
  begin
    c := replace(replace(replace(replace(replace(replace(replace(replace(p_core, '''BK-mt9upc8jeyp3''', '''PB-B1'''), '''BK-mt9upcchql3q''', '''PB-B2'''), '''BK-mt9upcgf0vqo''', '''PB-B3'''), '''TK-mvp2vrdxd4h8''', '''PB-TK'''), '''m1a1779dd9cefb3b''', quote_literal((select id from members where id like '%' order by id limit 1))), '''團課 4週優惠''', '''PB團課4週'''), '''tt-mqdt4ubv8e5i''', '''tt_group'''), 'date ''2026-11-29''', 'date ''' || p_exp || '''');
    execute c; return 'OK';
  exception when others then return sqlerrm; end $f$;
  select id into v_mid from members order by id limit 1;
  -- 夾具（先關掉 P0-E 的簽到觸發器，免得建夾具時就被自動啟用；之後再打開驗相容）
  alter table public.bookings disable trigger trg_tk_checkin_activate; alter table public.bookings disable trigger trg_tk_window_booking_ins; alter table public.bookings disable trigger trg_tk_window_booking_upd; alter table public.ticket_logs disable trigger trg_tk_window_ledger;
  insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions,valid_days) values ('PB-TK',v_mid,'tt_group','PB團課4週',4,1,'usable',4,28);
  insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,max_heads) values
    ('PB-B1','小班肌力','2026-11-02','19:00',60,'checked_in',jsonb_build_array(v_mid),jsonb_build_object(v_mid,'checked_in'),jsonb_build_object(v_mid,'PB-TK'),5),
    ('PB-B2','小班肌力','2026-11-09','19:00',60,'checked_in',jsonb_build_array(v_mid),jsonb_build_object(v_mid,'checked_in'),jsonb_build_object(v_mid,'PB-TK'),5),
    ('PB-B3','小班肌力','2026-11-16','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,jsonb_build_object(v_mid,'PB-TK'),5);
  insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values
    ('PB-LG0','PB-TK','grant',4,null,'pb','發放（團課 4週優惠）'),('PB-LG1','PB-TK','deduct',-1,'PB-B1',v_mid,'會員自行報名團體課扣 1 堂'),('PB-LG2','PB-TK','deduct',-1,'PB-B2',v_mid,'會員自行報名團體課扣 1 堂'),('PB-LG3','PB-TK','deduct',-1,'PB-B3',v_mid,'會員自行報名團體課扣 1 堂');
  out := out || jsonb_build_object('0_夾具', (select jsonb_build_object('rem',sessions_remaining,'activated',activated_at is not null,'start',start_date) from member_tickets where id='PB-TK'));

  -- A 前提不成立就中止（每一個都在子交易裡改夾具、跑核心、再回滾夾具）
  create function pg_temp.abort_case(p_name text, p_mut text, p_expect text, p_exp text default '2026-11-29', p_which text default 'a') returns jsonb language plpgsql as $f$
  declare r text; h_mut text; h_after text; snap text := $q$select md5(coalesce((select string_agg(t::text,'|' order by id) from member_tickets t where id like 'PB-%'),'') || coalesce((select string_agg(l::text,'|' order by id) from ticket_logs l where ticket_id like 'PB-%'),''))$q$;
  begin
    begin
      execute p_mut; execute snap into h_mut;                       -- 先套用「讓前提不成立」的改動，記下這時的狀態
      r := pg_temp.run_core(current_setting(case p_which when 'a' then 'pb.core_a' else 'pb.core_r' end), p_exp);
      execute snap into h_after;                                    -- 核心跑完（應該中止）後的狀態，必須與上一個相同＝核心沒有寫入任何東西
      raise exception 'PB_ROLLBACK_CASE:%', coalesce(r,'') || '¦' || (h_mut = h_after)::text;
    exception when others then
      if sqlerrm like 'PB_ROLLBACK_CASE:%' then r := split_part(substr(sqlerrm, 18), '¦', 1); h_after := split_part(sqlerrm, '¦', 2); else r := 'UNEXPECTED:'||sqlerrm; h_after := 'false'; end if;
    end;
    return jsonb_build_object('中止且原因正確', r like case p_which when 'a' then 'BACKFILL.ABORT:%' else 'BACKFILL.ROLLBACK_ABORT:%' end and r like '%'||p_expect||'%', '訊息', left(r,100), '核心沒有寫入任何東西', h_after = 'true');
  end $f$;
  perform set_config('pb.core_a', core_a, true); perform set_config('pb.core_r', core_r, true);
  out := out || jsonb_build_object('A1_票券已被開通', pg_temp.abort_case('a1', $m$update member_tickets set activated_at=now(), start_date='2026-11-16', expire_date='2026-12-13' where id='PB-TK'$m$, '效期已有值'));
  out := out || jsonb_build_object('A2_activation_mode已有值', pg_temp.abort_case('a2', $m$update member_tickets set activation_mode='checkin' where id='PB-TK'$m$, 'activation_mode'));
  out := out || jsonb_build_object('A3_餘額與審查時不同', pg_temp.abort_case('a3', $m$update member_tickets set sessions_remaining=2 where id='PB-TK'$m$, '堂數狀態'));
  out := out || jsonb_build_object('A4_票券狀態不是usable', pg_temp.abort_case('a4', $m$update member_tickets set status='refunded' where id='PB-TK'$m$, '堂數狀態'));
  out := out || jsonb_build_object('A5_帳本多了退款', pg_temp.abort_case('a5', $m$insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('PB-LGR','PB-TK','refund',1,'PB-B3','x','取消退課')$m$, '帳本不是審查時'));
  out := out || jsonb_build_object('A6_帳本有展延字樣', pg_temp.abort_case('a6', $m$update ticket_logs set note='效期展延 7 天' where id='PB-LG0'$m$, '帳本不是審查時'));
  out := out || jsonb_build_object('A7_最早簽到日不同', pg_temp.abort_case('a7', $m$update bookings set date='2026-10-30' where id='PB-B1'$m$, '預約歸屬'));
  out := out || jsonb_build_object('A8_沒有任何實際簽到', pg_temp.abort_case('a8', $m$update bookings set attendance='{}'::jsonb, status='booked' where id in ('PB-B1','PB-B2')$m$, '最早實際簽到日'));
  out := out || jsonb_build_object('A9_同一堂有兩張她的票_歧義', pg_temp.abort_case('a9', format($m$insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status) values ('PB-TK2','%s','tt_group','x',4,3,'usable'); insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('PB-LG9','PB-TK2','deduct',-1,'PB-B1','x','x')$m$, v_mid), '歧義'));
  out := out || jsonb_build_object('A10_預期到期日已過', pg_temp.abort_case('a10', 'select 1', '已經過了', '2026-11-10'));
  out := out || jsonb_build_object('A11_其他欄位有展延紀錄(jsonb讀取;測試庫無此欄位則略過)', case when exists (select 1 from information_schema.columns where table_name='member_tickets' and column_name='extended_at') then pg_temp.abort_case('a11', $m$update member_tickets set extended_at=now() where id='PB-TK'$m$, '展延') else '"略過：測試庫沒有 extended_at 欄位"'::jsonb end);
  out := out || jsonb_build_object('A7b_另有更早的實際簽到', pg_temp.abort_case('a7b', format($m$insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,max_heads,ticket_id) values ('PB-B0','私人教練','2026-10-30','10:00',60,'checked_in',jsonb_build_array('%1$s'),'{}'::jsonb,'{}'::jsonb,1,'PB-TK')$m$, v_mid), '最早實際簽到日'));
  out := out || jsonb_build_object('N1_筆數同_有一筆delta錯(-2)', pg_temp.abort_case('n1', $m$update ticket_logs set delta=-2 where id='PB-LG1'$m$, '帳本明細'));
  out := out || jsonb_build_object('N2_筆數同_grant的delta錯(3)', pg_temp.abort_case('n2', $m$update ticket_logs set delta=3 where id='PB-LG0'$m$, '帳本明細'));
  out := out || jsonb_build_object('N3_筆數同_扣課對到別的預約', pg_temp.abort_case('n3', format($m$insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,max_heads) values ('PB-B4','小班肌力','2026-11-23','19:00',60,'booked',jsonb_build_array('%1$s'),'{}'::jsonb,jsonb_build_object('%1$s','PB-TK'),5); update ticket_logs set booking_id='PB-B4' where id='PB-LG3'$m$, v_mid), '帳本明細'));
  out := out || jsonb_build_object('N4_筆數同_兩筆扣課對到同一預約', pg_temp.abort_case('n4', $m$update ticket_logs set booking_id='PB-B1' where id='PB-LG3'$m$, '帳本明細'));
  out := out || jsonb_build_object('N5_預約的座位票屬於別張票', pg_temp.abort_case('n5', format($m$update bookings set seat_tickets=jsonb_build_object('%s','PB-OTHER') where id='PB-B3'$m$, v_mid), '預約歸屬'));
  out := out || jsonb_build_object('N6_預約日期與審查資料不同', pg_temp.abort_case('n6', $m$update bookings set date='2026-11-23' where id='PB-B3'$m$, '預約歸屬'));

  -- B 成功路徑
  r := pg_temp.run_core(core_a);
  select * into t from member_tickets where id='PB-TK'; select count(*) into v_logs from ticket_logs where ticket_id='PB-TK';
  out := out || jsonb_build_object('B1_補正成功', jsonb_build_object('結果', r, 'start', t.start_date, 'expire', t.expire_date, 'activated_at_台北', (t.activated_at at time zone 'Asia/Taipei')::text, '堂數不變', t.sessions_remaining=1 and t.sessions_total=4, '狀態', t.status::text, 'activation_mode仍空', t.activation_mode is null, '帳本筆數', v_logs, '新增紀錄帳', (select left(note,70) from ticket_logs where ticket_id='PB-TK' and action::text='adjust')));
  r := pg_temp.run_core(core_a);
  select count(*) into v_logs from ticket_logs where ticket_id='PB-TK';
  out := out || jsonb_build_object('B2_重複執行被擋_沒有重複補', jsonb_build_object('訊息', left(r,60), '帳本仍5筆', v_logs=5));

  -- C 與 P0-E 相容（打開觸發器）：已補正的票視為「舊制已開通」
  alter table public.bookings enable trigger trg_tk_checkin_activate; alter table public.bookings enable trigger trg_tk_window_booking_ins; alter table public.bookings enable trigger trg_tk_window_booking_upd; alter table public.ticket_logs enable trigger trg_tk_window_ledger;
  update bookings set status='checked_in', checked_in_at=now(), attendance = attendance || jsonb_build_object(v_mid,'checked_in') where id='PB-B3';
  select * into t from member_tickets where id='PB-TK'; select count(*) into v_logs from ticket_logs where ticket_id='PB-TK';
  out := out || jsonb_build_object('C1_11/16簽到_P0E觸發器不改效期', jsonb_build_object('start', t.start_date, 'expire', t.expire_date, '帳本仍5筆(沒有新啟用紀錄)', v_logs=5));
  update bookings set status='booked', checked_in_at=null, attendance = attendance - v_mid where id='PB-B1';
  select * into t from member_tickets where id='PB-TK'; select count(*) into v_logs from ticket_logs where ticket_id='PB-TK';
  out := out || jsonb_build_object('C2_撤銷11/02簽到_mode為空時不重算位移', jsonb_build_object('start仍11/02', t.start_date='2026-11-02', 'expire仍11/29', t.expire_date='2026-11-29', '帳本仍5筆', v_logs=5));
  update bookings set status='checked_in', attendance = attendance || jsonb_build_object(v_mid,'checked_in') where id='PB-B1';
  update member_tickets set activation_mode='checkin' where id='PB-TK';
  update bookings set status='booked', attendance = attendance - v_mid where id='PB-B1';
  select start_date into v_start_after from member_tickets where id='PB-TK';
  out := out || jsonb_build_object('C3_對照：若當初寫了mode=checkin_撤銷同一個簽到會把起算日位移', jsonb_build_object('起算日變成', v_start_after, '位移了', v_start_after is distinct from date '2026-11-02'));
  update bookings set status='checked_in', attendance = attendance || jsonb_build_object(v_mid,'checked_in') where id='PB-B1';
  update member_tickets set activation_mode=null, start_date='2026-11-02', expire_date='2026-11-29' where id='PB-TK';
  delete from ticket_logs where ticket_id='PB-TK' and note like '撤銷簽到%';

  -- D 回復
  out := out || jsonb_build_object('R1_補正後又用掉一堂(剩餘0)', pg_temp.abort_case('r1', $m$update member_tickets set sessions_remaining=0 where id='PB-TK'$m$, '堂數', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R2_補正後帳本多一筆扣課', pg_temp.abort_case('r2', $m$insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('PB-LGX','PB-TK','deduct',-1,null,'x','後來又扣')$m$, '帳本已不是', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R3_補正後帳本多一筆退款', pg_temp.abort_case('r3', $m$insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('PB-LGX','PB-TK','refund',1,'PB-B3','x','取消退課')$m$, '帳本已不是', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R4_補正後帳本多一筆其他調整', pg_temp.abort_case('r4', $m$insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('PB-LGX','PB-TK','adjust',0,null,'x','手動調整')$m$, '帳本已不是', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R5_筆數同_delta被改', pg_temp.abort_case('r5', $m$update ticket_logs set delta=-2 where id='PB-LG1'$m$, '帳本已不是', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R6_有效天數不同', pg_temp.abort_case('r6', $m$update member_tickets set valid_days=30 where id='PB-TK'$m$, '堂數', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R7_方案名稱不同', pg_temp.abort_case('r7', $m$update member_tickets set plan_name='別的方案' where id='PB-TK'$m$, '堂數', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R8_票種不同', pg_temp.abort_case('r8', $m$update member_tickets set ticket_type_id=(select id from ticket_types where id<>'tt_group' limit 1) where id='PB-TK'$m$, '堂數', '2026-11-29', 'r'));
  out := out || jsonb_build_object('R9_狀態不是usable', pg_temp.abort_case('r9', $m$update member_tickets set status='refunded' where id='PB-TK'$m$, '已不是補正後', '2026-11-29', 'r'));
  r := pg_temp.run_core(core_r);
  select * into t from member_tickets where id='PB-TK'; select count(*) into v_logs from ticket_logs where ticket_id='PB-TK';
  out := out || jsonb_build_object('D1_回復成功', jsonb_build_object('結果', r, 'start', t.start_date, 'expire', t.expire_date, 'activated_at', t.activated_at, '堂數不變', t.sessions_remaining=1, '帳本筆數(原補正帳保留＋還原帳)', v_logs));
  r := pg_temp.run_core(core_r);
  out := out || jsonb_build_object('D2_重複回復被擋', left(r,70));
  r := pg_temp.run_core(core_a);
  out := out || jsonb_build_object('D3_回復後不能直接再補正_需重新審查', left(r,80));
  update member_tickets set start_date='2026-11-02', expire_date='2026-11-29', activated_at=timestamptz '2026-11-01 16:00:00+00' where id='PB-TK';
  update member_tickets set expire_date='2026-12-20' where id='PB-TK';
  r := pg_temp.run_core(core_r);
  out := out || jsonb_build_object('D4_補正後效期被人改過_回復不蓋掉', left(r,60));
  raise exception 'CHEN_BF_RESULT: %', out::text;
end $t$;
