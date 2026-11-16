-- 階段 08 內容改回原樣（A→B→A）的操作作廢測試｜測試庫 kucvxpjatptfckhlxptj｜單一交易、結尾 raise exception 回滾
do $t$
declare
  v_mid text; v_uid uuid; out jsonb := '{}'::jsonb; r jsonb; k text; rv0 text;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  if to_regclass('public.change_log') is not null then raise exception 'TESTDB.GUARD: prod?'; end if;
  select auth_id into v_uid from employees where id='e_fd';
  execute $mig$__MIG__$mig$;
  select id into v_mid from members order by id limit 1;
  alter table public.ticket_logs disable trigger trg_tk_window_ledger;
  insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions) values
    ('PB-Z',v_mid,'tt_group','Z',8,6,'usable',8),('PB-X',v_mid,'tt_group','X',8,6,'usable',8),('PB-W',v_mid,'tt_group','W',8,6,'usable',8);
  insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,max_heads,ticket_id) values
    ('PB-D1','自主訓練','2026-12-17','19:00',120,'booked','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,1,'PB-Z'),
    ('PB-D2','自主訓練','2026-12-18','19:00',120,'booked','[]'::jsonb,'{}'::jsonb,'{}'::jsonb,1,'PB-Z'),
    ('PB-S1','小班肌力','2026-12-19','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-S2','小班肌力','2026-12-20','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null),
    ('PB-S3','小班肌力','2026-12-21','19:00',60,'booked',jsonb_build_array(v_mid),'{}'::jsonb,'{}'::jsonb,5,null);
  create function pg_temp.q(p text) returns bigint language plpgsql as $f$ declare x bigint; begin execute p into x; return x; end $f$;
  create function pg_temp.as_user(u text) returns void language sql as $f$ select set_config('request.jwt.claim.sub', u, true), set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true) $f$;
  create function pg_temp.ded(p_t text, p_b text, p_note text default null, p_key text default null) returns jsonb language plpgsql as $f$ begin return public.fn_desk_deduct_ticket(p_t, p_b, p_note, p_key); exception when others then return jsonb_build_object('exception', sqlerrm); end $f$;
  create function pg_temp.rev(p_b text) returns text language plpgsql as $f$ begin return (public.fn_desk_booking_rev(p_b))->>'rev'; end $f$;
  create function pg_temp.begin_rev(p_slot text, p_t text, p_b text, p_rev text) returns jsonb language plpgsql as $f$ begin return public.fn_desk_op_begin(p_slot, p_t, p_b, p_rev); exception when others then return jsonb_build_object('exception', sqlerrm); end $f$;
  create function pg_temp.begin_op(p_slot text, p_t text, p_b text) returns text language plpgsql as $f$ declare x jsonb; begin x := public.fn_desk_op_begin(p_slot, p_t, p_b, (public.fn_desk_booking_rev(p_b))->>'rev'); return coalesce(x->>'op_key', x->>'error_code'); end $f$;
  create function pg_temp.net(t text, b text) returns bigint language sql as $f$ select coalesce(sum(case when action::text='deduct' and delta<>0 then 1 when action::text='refund' then -1 else 0 end),0)::bigint from ticket_logs where ticket_id=t and booking_id=b $f$;
  perform pg_temp.as_user(v_uid::text);

  -- A 時長 120→60→120，期間沒有退款帳；第一個 120 時登記的舊請求此時才到達
  rv0 := pg_temp.rev('PB-D1');
  k := (public.fn_desk_op_begin('st:PB-D1:120:1','PB-Z','PB-D1',rv0))->>'op_key';
  update bookings set duration=60 where id='PB-D1';
  update bookings set duration=120 where id='PB-D1';
  out := out || jsonb_build_object('A0_內容已改回原樣', jsonb_build_object('duration', (select duration from bookings where id='PB-D1'), '無退款帳', pg_temp.q($$select count(*) from ticket_logs where booking_id='PB-D1' and action::text='refund'$$)=0, '版本值是否回到原值(現況應為真=缺陷)', pg_temp.rev('PB-D1')=rv0));
  out := out || jsonb_build_object('A1_舊扣課請求遲到', jsonb_build_object('回傳', pg_temp.ded('PB-Z','PB-D1','自主訓練',k), '淨扣課(應為0)', pg_temp.net('PB-Z','PB-D1')));
  out := out || jsonb_build_object('A2_舊登記請求(帶第一個120的版本)遲到', pg_temp.begin_rev('st:PB-D1:120:2','PB-Z','PB-D1',rv0));
  out := out || jsonb_build_object('A3_新的合法操作(重新讀版本)可登記並扣', jsonb_build_object('回傳', pg_temp.ded('PB-Z','PB-D1','自主訓練',pg_temp.begin_op('st:PB-D1:120:1','PB-Z','PB-D1')), '淨', pg_temp.net('PB-Z','PB-D1')));

  -- B 名額移除後再加入、內容恢復原樣
  rv0 := pg_temp.rev('PB-S1');
  k := (public.fn_desk_op_begin('gcr:PB-S1:M:1','PB-X','PB-S1',rv0))->>'op_key';
  update bookings set member_ids='[]'::jsonb where id='PB-S1';
  update bookings set member_ids=jsonb_build_array(v_mid) where id='PB-S1';
  out := out || jsonb_build_object('B0_名單已恢復原樣', jsonb_build_object('版本值是否回到原值(現況應為真=缺陷)', pg_temp.rev('PB-S1')=rv0));
  out := out || jsonb_build_object('B1_舊扣課請求遲到', jsonb_build_object('回傳', pg_temp.ded('PB-X','PB-S1','團課',k), '淨扣課(應為0)', pg_temp.net('PB-X','PB-S1')));
  out := out || jsonb_build_object('B2_舊登記請求遲到', pg_temp.begin_rev('gcr:PB-S1:M:2','PB-X','PB-S1',rv0));
  -- C 座位票 seat_tickets 改了又改回
  rv0 := pg_temp.rev('PB-S3');
  k := (public.fn_desk_op_begin('gcr:PB-S3:M:1','PB-W','PB-S3',rv0))->>'op_key';
  update bookings set seat_tickets=jsonb_build_object(v_mid,'PB-W') where id='PB-S3';
  update bookings set seat_tickets='{}'::jsonb where id='PB-S3';
  out := out || jsonb_build_object('C1_座位票改了又改回_舊扣課遲到', jsonb_build_object('回傳', pg_temp.ded('PB-W','PB-S3','團課',k), '淨扣課(應為0)', pg_temp.net('PB-W','PB-S3')));
  -- D 保留的性質：已套用重送仍 already；未改內容的正常多堂不被誤擋；不相關欄位(note)更新不作廢
  rv0 := pg_temp.rev('PB-S2');
  k := (public.fn_desk_op_begin('gcr:PB-S2:M:1','PB-X','PB-S2',rv0))->>'op_key';
  r := pg_temp.ded('PB-X','PB-S2','團課',k);
  update bookings set duration=90 where id='PB-S2'; update bookings set duration=60 where id='PB-S2';
  out := out || jsonb_build_object('D1_已套用重送(之後內容改又改回)仍already不重扣', jsonb_build_object('回傳', pg_temp.ded('PB-X','PB-S2','團課',k), '淨1', pg_temp.net('PB-X','PB-S2')=1));
  r := pg_temp.ded('PB-X','PB-S2','團課',pg_temp.begin_op('gcr:PB-S2:M:2','PB-X','PB-S2'));
  r := pg_temp.ded('PB-X','PB-S2','團課',pg_temp.begin_op('gcr:PB-S2:M:3','PB-X','PB-S2'));
  out := out || jsonb_build_object('D2_正常連續多堂(期間預約未變)不被誤擋', jsonb_build_object('淨3', pg_temp.net('PB-X','PB-S2')=3));
  rv0 := pg_temp.rev('PB-S2'); update bookings set note='備註變更' where id='PB-S2';
  out := out || jsonb_build_object('D3_改備註(無關欄位)版本不變', pg_temp.rev('PB-S2')=rv0);
  raise exception 'ABA_RESULT: %', out::text;
end $t$;
