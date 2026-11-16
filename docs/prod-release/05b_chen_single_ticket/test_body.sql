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
