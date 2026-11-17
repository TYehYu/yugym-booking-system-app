-- 回滾式測試（需先暫裝階段 06／08／11 的實際版本與本函式；測完全部移除並核對基準）：N1 清單雜湊、N2 錨點查無、N3 錨點身分變動、C1 過期／合約內不動、C2 效期窗口、C3 跨路徑防重扣；S1 近的保留／遠的取消／重送不重扣／不動他人；S3 分期三段；S4 分期算不準整批停止；S5 扣堂故障不取消；
-- S6 清單變動 PLAN_CHANGED、缺清單 EXPECT_REQUIRED；S7 無會員卡位錨點；S8 非櫃檯；S9 他人的預約當錨點被拒。
create function pg_temp.mkbk(p_id text, p_mem text, p_type text, p_cat text, p_date date, p_time text, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(b) into t from bookings b where b.status::text='booked' limit 1;
  insert into bookings select * from jsonb_populate_record(null::bookings, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_id',null,'ticket_type_id',p_type,'category',p_cat,
    'pending_contract',true,'date',p_date,'start_time',p_time,'status','booked','contract_id',null,'checked_in_at',null,'note',null,'member_ids','[]'::jsonb,'sibling_of',null,
    'trial_name',null,'trial_phone',null,'seat_tickets',null,'attendance',null,'cancelled_at',null,'cancelled_by',null,'cancel_reason',null,'recurring',false,'duration',60,'coach_id',null) || p_x);
end $$;
create function pg_temp.mktk(p_id text, p_mem text, p_type text, p_total int, p_rem int, p_inst jsonb, p_unl int, p_x jsonb default '{}') returns void language plpgsql as $$
declare t jsonb;
begin
  select to_jsonb(m) into t from member_tickets m limit 1;
  insert into member_tickets select * from jsonb_populate_record(null::member_tickets, t || jsonb_build_object('id',p_id,'member_id',p_mem,'ticket_type_id',p_type,'status','usable',
    'sessions_total',p_total,'sessions_remaining',p_rem,'installment',p_inst,'unlocked_sessions',p_unl,'expire_date',null,'start_date',null,'activated_at',null,'shared_with',null,'payment_status','paid','plan_name','ZZ測試票') || p_x);
end $$;
do $do$
declare R jsonb := '[]'::jsonb; adm record; tt record; mem text[]; d0 date := public.fn_tk_today(); r1 jsonb; r2 jsonb; r3 jsonb; v int; v2 int; h1 text; h2 text; i int; ct jsonb; ctok boolean := true; dd date;
begin
  select id, auth_id into adm from employees where role::text in ('admin','front_desk') and auth_id is not null limit 1;
  select id, category::text cat into tt from ticket_types where category::text <> '小班肌力' and coalesce(time_restricted,false)=false limit 1;
  select array_agg(id) into mem from (select id from members order by id limit 11) q;
  perform set_config('request.jwt.claims', json_build_object('sub',adm.auth_id,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm.auth_id::text, true);
  perform set_config('request.jwt.claim.role','authenticated', true);
  -- S1
  perform pg_temp.mktk('ZZTK1', mem[1], tt.id, 3, 3, null, null);
  perform pg_temp.mkbk('ZZB1e', mem[1], tt.id, tt.cat, d0+5, '10:00'); perform pg_temp.mkbk('ZZB1a', mem[1], tt.id, tt.cat, d0+1, '10:00');
  perform pg_temp.mkbk('ZZB1d', mem[1], tt.id, tt.cat, d0+4, '09:00'); perform pg_temp.mkbk('ZZB1c', mem[1], tt.id, tt.cat, d0+2, '15:00'); perform pg_temp.mkbk('ZZB1b', mem[1], tt.id, tt.cat, d0+2, '08:00');
  perform pg_temp.mkbk('ZZX_chk', mem[1], tt.id, tt.cat, d0+1, '12:00', jsonb_build_object('checked_in_at', now()));
  perform pg_temp.mkbk('ZZX_tk',  mem[1], tt.id, tt.cat, d0+1, '13:00', jsonb_build_object('ticket_id','ZZTK1','pending_contract',false));
  perform pg_temp.mkbk('ZZX_oth', mem[2], tt.id, tt.cat, d0+1, '14:00');
  perform pg_temp.mkbk('ZZX_inst',mem[1], tt.id, tt.cat, d0+6, '14:00', jsonb_build_object('note','分期待繳費保留（收款後自動補扣）'));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZX_%';
  r1 := public.fn_hold_settle_new_ticket('ZZTK1', true);
  R := R || jsonb_build_array(jsonb_build_object('t','S1.dry','pass', (r1->'plan') - 'sig' - 'skip' - 'defer' = jsonb_build_object('bind',jsonb_build_array('ZZB1a','ZZB1b','ZZB1c'),'hold','[]'::jsonb,'cancel',jsonb_build_array('ZZB1d','ZZB1e'))));
  r2 := public.fn_hold_settle_new_ticket('ZZTK1', false, null, r1->'plan');
  select sessions_remaining into v from member_tickets where id='ZZTK1'; select count(*) into v2 from ticket_logs where ticket_id='ZZTK1' and action::text='deduct';
  R := R || jsonb_build_array(jsonb_build_object('t','S1.exec','pass', (r2->>'ok')='true' and v=0 and v2=3
     and (select count(*) from bookings where id in ('ZZB1a','ZZB1b','ZZB1c') and ticket_id='ZZTK1' and pending_contract=false)=3
     and (select count(*) from bookings where id in ('ZZB1d','ZZB1e') and status::text='cancelled' and cancel_reason like '新票轉正整理%')=2));
  r3 := public.fn_hold_settle_new_ticket('ZZTK1', false, null, r1->'plan');
  select sessions_remaining into v from member_tickets where id='ZZTK1'; select count(*) into v2 from ticket_logs where ticket_id='ZZTK1' and action::text='deduct';
  R := R || jsonb_build_array(jsonb_build_object('t','S1.resend_idempotent','pass', (r3->>'already')='true' and v=0 and v2=3));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZX_%';
  R := R || jsonb_build_array(jsonb_build_object('t','S1.others_untouched','pass', h1=h2));
  -- S3 分期 12 堂、開通 4、14 個卡位
  perform pg_temp.mktk('ZZTK3', mem[3], tt.id, 12, 12, '{"count":3,"current":1}'::jsonb, 4);
  for i in 1..14 loop perform pg_temp.mkbk('ZZB3_'||lpad(i::text,2,'0'), mem[3], tt.id, tt.cat, d0+i, '11:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZTK3', true);
  R := R || jsonb_build_array(jsonb_build_object('t','S3.dry','pass', jsonb_array_length(r1->'plan'->'bind')=4 and jsonb_array_length(r1->'plan'->'hold')=8 and (r1->'plan'->'cancel') = jsonb_build_array('ZZB3_13','ZZB3_14')));
  r2 := public.fn_hold_settle_new_ticket('ZZTK3', false, null, r1->'plan');
  select sessions_remaining into v from member_tickets where id='ZZTK3';
  R := R || jsonb_build_array(jsonb_build_object('t','S3.exec','pass',(r2->>'ok')='true' and v=8
     and (select count(*) from bookings where id like 'ZZB3_%' and status::text='booked' and ticket_id is null and note like '分期待繳費保留%')=8
     and (select count(*) from bookings where id like 'ZZB3_%' and status::text='cancelled')=2));
  -- S4
  perform pg_temp.mktk('ZZTK4', mem[4], tt.id, 6, 6, '{"count":3,"current":1}'::jsonb, 2);
  perform pg_temp.mkbk('ZZB4_h', mem[4], tt.id, tt.cat, d0+20, '11:00', jsonb_build_object('note','分期待繳費保留（收款後自動補扣）'));
  for i in 1..9 loop perform pg_temp.mkbk('ZZB4_'||i::text, mem[4], tt.id, tt.cat, d0+i, '11:00'); end loop;
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZB4_%';
  r1 := public.fn_hold_settle_new_ticket('ZZTK4', true);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZB4_%';
  R := R || jsonb_build_array(jsonb_build_object('t','S4.ambiguous_stops','pass', r1->>'error_code'='INST_AMBIGUOUS' and h1=h2));
  -- S5 扣堂故障（第 2 堂在這張票上已有扣課帳）→ 整批回復
  perform pg_temp.mktk('ZZTK5', mem[5], tt.id, 2, 2, null, null);
  for i in 1..4 loop perform pg_temp.mkbk('ZZB5_'||i::text, mem[5], tt.id, tt.cat, d0+i, '11:00'); end loop;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values ('ZZLG5','ZZTK5','deduct',-1,'ZZB5_2',adm.id,'故意：這一堂已被扣過');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZB5_%';
  r1 := public.fn_hold_settle_new_ticket('ZZTK5', true); r2 := public.fn_hold_settle_new_ticket('ZZTK5', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZB5_%'; select sessions_remaining into v from member_tickets where id='ZZTK5';
  R := R || jsonb_build_array(jsonb_build_object('t','S5.failure_no_cancel','pass', r2->>'error_code'='SETTLE.FAILED' and h1=h2 and v=2 and (select count(*) from ticket_logs where ticket_id='ZZTK5' and action::text='deduct')=1));
  -- S6
  perform pg_temp.mktk('ZZTK6', mem[6], tt.id, 2, 2, null, null);
  for i in 2..4 loop perform pg_temp.mkbk('ZZB6_'||i::text, mem[6], tt.id, tt.cat, d0+i, '11:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZTK6', true);
  perform pg_temp.mkbk('ZZB6_1', mem[6], tt.id, tt.cat, d0+1, '11:00');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZB6_%';
  r2 := public.fn_hold_settle_new_ticket('ZZTK6', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZB6_%';
  R := R || jsonb_build_array(jsonb_build_object('t','S6.plan_changed','pass', r2->>'error_code'='PLAN_CHANGED' and h1=h2));
  r3 := public.fn_hold_settle_new_ticket('ZZTK6', false, null, null);
  R := R || jsonb_build_array(jsonb_build_object('t','S6.expect_required','pass', r3->>'error_code'='EXPECT_REQUIRED'));
  -- S7 無會員卡位：從其中一筆點轉正，同姓名電話的一串一起整理；別人的不動
  perform pg_temp.mktk('ZZTK7', mem[7], tt.id, 2, 2, null, null);
  for i in 1..3 loop perform pg_temp.mkbk('ZZB7_'||i::text, null, tt.id, tt.cat, d0+i, '11:00', jsonb_build_object('trial_name','ZZ王','trial_phone','0900000007')); end loop;
  perform pg_temp.mkbk('ZZB7_o', null, tt.id, tt.cat, d0+1, '16:00', jsonb_build_object('trial_name','ZZ別人','trial_phone','0900000008'));
  r1 := public.fn_hold_settle_new_ticket('ZZTK7', true, 'ZZB7_1');
  R := R || jsonb_build_array(jsonb_build_object('t','S7.anchor_dry','pass', (r1->'plan') - 'sig' - 'skip' - 'defer' = jsonb_build_object('bind',jsonb_build_array('ZZB7_1','ZZB7_2'),'hold','[]'::jsonb,'cancel',jsonb_build_array('ZZB7_3'))));
  r2 := public.fn_hold_settle_new_ticket('ZZTK7', false, 'ZZB7_1', r1->'plan');
  R := R || jsonb_build_array(jsonb_build_object('t','S7.anchor_exec','pass',(r2->>'ok')='true'
     and (select count(*) from bookings where id in ('ZZB7_1','ZZB7_2') and member_id=mem[7] and ticket_id='ZZTK7' and trial_name is null)=2
     and (select status::text from bookings where id='ZZB7_o')='booked' and (select member_id from bookings where id='ZZB7_o') is null));
  -- S9 別的會員的卡位當錨點 → 拒絕
  r3 := public.fn_hold_settle_new_ticket('ZZTK7', true, 'ZZX_oth');
  R := R || jsonb_build_array(jsonb_build_object('t','S9.anchor_other_member','pass', r3->>'error_code'='ANCHOR_NOT_ELIGIBLE'));
  -- N1 清單雜湊：id 不變、但日期／時間／教練／票券剩餘改了 → PLAN_CHANGED、不做事
  perform pg_temp.mktk('ZZTKN1', mem[8], tt.id, 2, 2, null, null);
  for i in 1..3 loop perform pg_temp.mkbk('ZZBN1_'||i::text, mem[8], tt.id, tt.cat, d0+i, '11:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZTKN1', true);
  update bookings set start_time='12:30' where id='ZZBN1_1';
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZBN1_%';
  r2 := public.fn_hold_settle_new_ticket('ZZTKN1', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZBN1_%';
  R := R || jsonb_build_array(jsonb_build_object('t','N1a.time_changed','pass', r2->>'error_code'='PLAN_CHANGED' and h1=h2 and (select sessions_remaining from member_tickets where id='ZZTKN1')=2));
  r1 := public.fn_hold_settle_new_ticket('ZZTKN1', true);
  update bookings set date=d0+1+10 where id='ZZBN1_1';   -- 日期改了（同一筆仍在清單內）
  r2 := public.fn_hold_settle_new_ticket('ZZTKN1', false, null, r1->'plan');
  R := R || jsonb_build_array(jsonb_build_object('t','N1b.date_changed','pass', r2->>'error_code'='PLAN_CHANGED'));
  r1 := public.fn_hold_settle_new_ticket('ZZTKN1', true);
  update bookings set coach_id=(select id from employees where id<>adm.id limit 1) where id='ZZBN1_2';
  r2 := public.fn_hold_settle_new_ticket('ZZTKN1', false, null, r1->'plan');
  R := R || jsonb_build_array(jsonb_build_object('t','N1c.coach_changed','pass', r2->>'error_code'='PLAN_CHANGED'));
  r1 := public.fn_hold_settle_new_ticket('ZZTKN1', true);
  update bookings set duration=90 where id='ZZBN1_3';   -- 時長改了
  r2 := public.fn_hold_settle_new_ticket('ZZTKN1', false, null, r1->'plan');
  R := R || jsonb_build_array(jsonb_build_object('t','N1d.duration_changed','pass', r2->>'error_code'='PLAN_CHANGED'));
  r1 := public.fn_hold_settle_new_ticket('ZZTKN1', true);
  update member_tickets set sessions_remaining=1, sessions_total=2 where id='ZZTKN1';   -- 票券餘額變了
  r2 := public.fn_hold_settle_new_ticket('ZZTKN1', false, null, r1->'plan');
  R := R || jsonb_build_array(jsonb_build_object('t','N1e.ticket_changed','pass', r2->>'error_code'='PLAN_CHANGED'));
  -- N2 錨點查無 → ANCHOR_NOT_FOUND（不會當成沒指定而去整理別的）
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZBN1_%';
  r1 := public.fn_hold_settle_new_ticket('ZZTKN1', true, 'ZZ_NOT_EXIST'); r2 := public.fn_hold_settle_new_ticket('ZZTKN1', false, 'ZZ_NOT_EXIST', '{"bind":[],"hold":[],"cancel":[],"sig":"x"}'::jsonb);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZBN1_%';
  R := R || jsonb_build_array(jsonb_build_object('t','N2.anchor_not_found','pass', r1->>'error_code'='ANCHOR_NOT_FOUND' and r2->>'error_code'='ANCHOR_NOT_FOUND' and h1=h2));
  -- N3 執行階段錨點身分變動（姓名改了）→ PLAN_CHANGED，同串與別人的都不動
  perform pg_temp.mktk('ZZTKN3', mem[9], tt.id, 2, 2, null, null);
  for i in 1..2 loop perform pg_temp.mkbk('ZZBN3_'||i::text, null, tt.id, tt.cat, d0+i, '11:00', jsonb_build_object('trial_name','ZZ陳','trial_phone','0900000009')); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZTKN3', true, 'ZZBN3_1');
  update bookings set trial_name='ZZ陳改' where id='ZZBN3_1';
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZBN3_%';
  r2 := public.fn_hold_settle_new_ticket('ZZTKN3', false, 'ZZBN3_1', r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZBN3_%';
  R := R || jsonb_build_array(jsonb_build_object('t','N3.anchor_identity_changed','pass', r2->>'error_code'='PLAN_CHANGED' and h1=h2 and (select sessions_remaining from member_tickets where id='ZZTKN3')=2));
  -- C1 相容：已過期卡位不動、合約內卡位不動（階段 11 的守門觸發器全程啟用）
  perform pg_temp.mktk('ZZTKC1', mem[1], tt.id, 3, 3, null, null);
  perform pg_temp.mkbk('ZZBC1_past', mem[1], tt.id, tt.cat, d0-3, '11:00');
  perform pg_temp.mkbk('ZZBC1_a', mem[1], tt.id, tt.cat, d0+1, '08:30');
  begin
    insert into contracts(id, member_id, member_name, plan_name, sessions, ticket_type_id) values ('ZZCT', mem[1], 'ZZ', 'ZZ合約', 12, tt.id);
    insert into ticket_grant_requests(id, member_id, contract_id, status, sessions, payload) values ('ZZGR', mem[1], 'ZZCT', 'pending', 12, jsonb_build_object('plan', jsonb_build_object('valid_days', 30, 'ticket_type_id', tt.id)));
    perform pg_temp.mkbk('ZZBC1_ct', mem[1], tt.id, tt.cat, d0+2, '08:30', jsonb_build_object('contract_id','ZZCT'));
  exception when others then ctok := false; R := R || jsonb_build_array(jsonb_build_object('t','C1.contract_fixture_skipped','info',sqlerrm));
  end;
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id in ('ZZBC1_past','ZZBC1_ct');
  r1 := public.fn_hold_settle_new_ticket('ZZTKC1', true); r2 := public.fn_hold_settle_new_ticket('ZZTKC1', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id in ('ZZBC1_past','ZZBC1_ct');
  R := R || jsonb_build_array(jsonb_build_object('t','C1.expired_and_contract_untouched','pass', (r2->>'ok')='true' and h1=h2 and r1->'plan'->'bind'=jsonb_build_array('ZZBC1_a'), 'contract_fixture', ctok));
  -- C2 效期窗口：尚未啟用、有效 7 天；12 天內的卡位 → 窗口內轉正、窗外「不動」（不取消）
  perform pg_temp.mktk('ZZTKW', mem[9], tt.id, 10, 10, null, null, jsonb_build_object('valid_days',7));
  for i in 1..12 loop perform pg_temp.mkbk('ZZBW_'||lpad(i::text,2,'0'), mem[9], tt.id, tt.cat, d0+i, '17:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZTKW', true);
  r2 := public.fn_hold_settle_new_ticket('ZZTKW', false, null, r1->'plan');
  R := R || jsonb_build_array(jsonb_build_object('t','C2.window','pass', (r2->>'ok')='true' and jsonb_array_length(r1->'plan'->'bind')=7 and jsonb_array_length(r1->'plan'->'skip')=5 and jsonb_array_length(r1->'plan'->'cancel')=0
     and (select count(*) from bookings where id like 'ZZBW_%' and status::text='booked' and ticket_id is null)=5, 'plan', r1->'plan'));
  -- C3 跨路徑：用本函式轉正後，櫃檯扣堂函式再扣同一堂不重複扣；取消該堂退一次
  select count(*) into v from ticket_logs where ticket_id='ZZTKC1' and action::text='deduct';
  r3 := public.fn_desk_deduct_ticket('ZZTKC1','ZZBC1_a','手動重複');
  select count(*) into v2 from ticket_logs where ticket_id='ZZTKC1' and action::text='deduct';
  R := R || jsonb_build_array(jsonb_build_object('t','C3.no_double_deduct_via_desk_fn','pass', (r3->>'already')='true' and v=v2));
  r3 := public.fn_desk_cancel_booking('ZZBC1_a');
  R := R || jsonb_build_array(jsonb_build_object('t','C3.cancel_refund_once','pass', (r3->>'ok')='true' and (select sessions_remaining from member_tickets where id='ZZTKC1')=3));
  -- X 施佩怡型／分期保護／其他票券（沿用舊 instretain 測試要保護的意圖；每段用完即清，同一位會員 mem[10]）
  -- X1 12 堂合約、開通 8、已用 7（avail=1、未開通 4），已有 3 筆分期保留手足＋13 筆未標記卡位 → 算不準：整批停止、一筆都不動
  perform pg_temp.mktk('ZZXC1', mem[10], tt.id, 12, 5, '{"count":3,"current":2}'::jsonb, 8);
  for i in 1..3 loop perform pg_temp.mkbk('ZZXC1h'||i, mem[10], tt.id, tt.cat, d0+30+i, '19:00', jsonb_build_object('note','分期待繳費保留（收款後自動補扣）')); end loop;
  for i in 1..13 loop perform pg_temp.mkbk('ZZXC1u'||lpad(i::text,2,'0'), mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZXC1%';
  r1 := public.fn_hold_settle_new_ticket('ZZXC1', true);
  r2 := public.fn_hold_settle_new_ticket('ZZXC1', false, null, '{"bind":[],"hold":[],"cancel":[],"sig":"x"}'::jsonb);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZXC1%';
  R := R || jsonb_build_array(jsonb_build_object('t','X1.shi_shape_stops','pass', r1->>'error_code'='INST_AMBIGUOUS' and r2->>'error_code'='INST_AMBIGUOUS' and h1=h2 and (select sessions_remaining from member_tickets where id='ZZXC1')=5, 'r1', r1));
  delete from bookings where id like 'ZZXC1%'; delete from ticket_logs where ticket_id like 'ZZXC1%'; delete from member_tickets where id like 'ZZXC1%';
  -- X2 已取消的分期保留手足不算現成手足；同樣 13 筆 → 轉正 1、分期保留 4、取消 8
  perform pg_temp.mktk('ZZXC2', mem[10], tt.id, 12, 5, '{"count":3,"current":2}'::jsonb, 8);
  for i in 1..3 loop perform pg_temp.mkbk('ZZXC2h'||i, mem[10], tt.id, tt.cat, d0+30+i, '19:00', jsonb_build_object('note','分期待繳費保留（收款後自動補扣）','status','cancelled')); end loop;
  for i in 1..13 loop perform pg_temp.mkbk('ZZXC2u'||lpad(i::text,2,'0'), mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZXC2', true);
  R := R || jsonb_build_array(jsonb_build_object('t','X2.cancelled_sibling_not_counted','pass', jsonb_array_length(r1->'plan'->'bind')=1 and jsonb_array_length(r1->'plan'->'hold')=4 and jsonb_array_length(r1->'plan'->'cancel')=8));
  r2 := public.fn_hold_settle_new_ticket('ZZXC2', false, null, r1->'plan');
  select sessions_remaining into v from member_tickets where id='ZZXC2';
  R := R || jsonb_build_array(jsonb_build_object('t','X2.exec','pass',(r2->>'ok')='true' and v=4 and (select count(*) from bookings where id like 'ZZXC2u%' and status::text='cancelled')=8 and (select count(*) from bookings where id like 'ZZXC2u%' and note like '分期待繳費保留%')=4
     and (select count(*) from bookings where id like 'ZZXC2h%' and status::text='cancelled')=3));
  delete from bookings where id like 'ZZXC2%'; delete from ticket_logs where ticket_id like 'ZZXC2%'; delete from member_tickets where id like 'ZZXC2%';
  -- X3 重複資料：同一天同時段兩筆都標記分期保留＋超額 → 不當機、不出負數，整批停止
  perform pg_temp.mktk('ZZXC3', mem[10], tt.id, 6, 6, '{"count":3,"current":1}'::jsonb, 2);
  perform pg_temp.mkbk('ZZXC3h1', mem[10], tt.id, tt.cat, d0+30, '19:00', jsonb_build_object('note','分期待繳費保留（收款後自動補扣）'));
  perform pg_temp.mkbk('ZZXC3h2', mem[10], tt.id, tt.cat, d0+30, '19:00', jsonb_build_object('note','分期待繳費保留（收款後自動補扣）'));
  for i in 1..9 loop perform pg_temp.mkbk('ZZXC3u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZXC3', true);
  R := R || jsonb_build_array(jsonb_build_object('t','X3.duplicate_holds_no_crash','pass', r1->>'error_code'='INST_AMBIGUOUS'));
  delete from bookings where id like 'ZZXC3%'; delete from ticket_logs where ticket_id like 'ZZXC3%'; delete from member_tickets where id like 'ZZXC3%';
  -- X4 另有同票種可用票券（舊票剩 3）：新票轉正 2、其他票可承接的 3 堂先不動（defer）、再多的 1 堂才取消；defer 的不扣不取消
  perform pg_temp.mktk('ZZXC4a', mem[10], tt.id, 2, 2, null, null);
  perform pg_temp.mktk('ZZXC4b', mem[10], tt.id, 3, 3, null, null);
  for i in 1..6 loop perform pg_temp.mkbk('ZZXC4u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZXC4a', true);
  R := R || jsonb_build_array(jsonb_build_object('t','X4.other_ticket_defer_dry','pass', r1->'plan'->'bind'=jsonb_build_array('ZZXC4u1','ZZXC4u2') and r1->'plan'->'defer'=jsonb_build_array('ZZXC4u3','ZZXC4u4','ZZXC4u5') and r1->'plan'->'cancel'=jsonb_build_array('ZZXC4u6')));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id in ('ZZXC4u3','ZZXC4u4','ZZXC4u5');
  r2 := public.fn_hold_settle_new_ticket('ZZXC4a', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id in ('ZZXC4u3','ZZXC4u4','ZZXC4u5');
  R := R || jsonb_build_array(jsonb_build_object('t','X4.other_ticket_defer_exec','pass',(r2->>'ok')='true' and h1=h2 and (select sessions_remaining from member_tickets where id='ZZXC4b')=3 and (select status::text from bookings where id='ZZXC4u6')='cancelled'));
  r3 := public.fn_hold_settle_new_ticket('ZZXC4b', true);
  R := R || jsonb_build_array(jsonb_build_object('t','X4.then_settle_other_ticket','pass', r3->'plan'->'bind'=jsonb_build_array('ZZXC4u3','ZZXC4u4','ZZXC4u5') and jsonb_array_length(r3->'plan'->'cancel')=0));
  delete from bookings where id like 'ZZXC4%'; delete from ticket_logs where ticket_id like 'ZZXC4%'; delete from member_tickets where id like 'ZZXC4%';
  -- T 其他票券逐筆分配（rev5；同一位會員 mem[10]，每段用完即清）
  -- T1 其他票今天沒過期、但上課日已過期 → 承接不了，超額全取消
  perform pg_temp.mktk('ZZT1a', mem[10], tt.id, 2, 2, null, null); perform pg_temp.mktk('ZZT1b', mem[10], tt.id, 3, 3, null, null, jsonb_build_object('expire_date', d0+2));
  for i in 1..6 loop perform pg_temp.mkbk('ZZT1u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZT1a', true);
  R := R || jsonb_build_array(jsonb_build_object('t','T1.other_expired_by_class_date','pass', jsonb_array_length(r1->'plan'->'defer')=0 and jsonb_array_length(r1->'plan'->'cancel')=4 and jsonb_array_length(r1->'plan'->'bind')=2));
  delete from bookings where id like 'ZZT1%'; delete from ticket_logs where ticket_id like 'ZZT1%'; delete from member_tickets where id like 'ZZT1%';
  -- T2 其他票到期日涵蓋一部分 → 涵蓋的 defer、其餘取消；T3 確認後其他票額度被用掉 → PLAN_CHANGED、不做事
  perform pg_temp.mktk('ZZT2a', mem[10], tt.id, 2, 2, null, null); perform pg_temp.mktk('ZZT2b', mem[10], tt.id, 3, 3, null, null, jsonb_build_object('expire_date', d0+4));
  for i in 1..6 loop perform pg_temp.mkbk('ZZT2u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZT2a', true);
  R := R || jsonb_build_array(jsonb_build_object('t','T2.partial_by_expiry','pass', r1->'plan'->'defer'=jsonb_build_array('ZZT2u3','ZZT2u4') and r1->'plan'->'cancel'=jsonb_build_array('ZZT2u5','ZZT2u6')));
  update member_tickets set sessions_remaining=0 where id='ZZT2b';
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZT2u%';
  r2 := public.fn_hold_settle_new_ticket('ZZT2a', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZT2u%';
  R := R || jsonb_build_array(jsonb_build_object('t','T3.other_quota_used_after_confirm','pass', r2->>'error_code'='PLAN_CHANGED' and h1=h2 and (select sessions_remaining from member_tickets where id='ZZT2a')=2));
  r1 := public.fn_hold_settle_new_ticket('ZZT2a', true);
  R := R || jsonb_build_array(jsonb_build_object('t','T3b.repreview_after_quota_gone','pass', jsonb_array_length(r1->'plan'->'defer')=0 and jsonb_array_length(r1->'plan'->'cancel')=4));
  delete from bookings where id like 'ZZT2%'; delete from ticket_logs where ticket_id like 'ZZT2%'; delete from member_tickets where id like 'ZZT2%';
  -- T4 兩張其他票各剩 1 堂：三筆超額只能分配 2 筆（不重複分配同一堂數），且各自對應不同的票
  perform pg_temp.mktk('ZZT4a', mem[10], tt.id, 2, 2, null, null); perform pg_temp.mktk('ZZT4b', mem[10], tt.id, 1, 1, null, null); perform pg_temp.mktk('ZZT4c', mem[10], tt.id, 1, 1, null, null);
  for i in 1..5 loop perform pg_temp.mkbk('ZZT4u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZT4a', true);
  R := R || jsonb_build_array(jsonb_build_object('t','T4.no_double_allocation','pass', jsonb_array_length(r1->'plan'->'defer')=2 and jsonb_array_length(r1->'plan'->'cancel')=1
     and (select count(distinct x->>'to') from jsonb_array_elements(r1->'rows') x where x->>'kind'='defer')=2));
  delete from bookings where id like 'ZZT4%'; delete from ticket_logs where ticket_id like 'ZZT4%'; delete from member_tickets where id like 'ZZT4%';
  -- T5 其他票尚未啟用（有效 3 天）：窗口自第一筆分配起算 → 只能承接 3 天內；T7 其他票起始日在後面：起始日前的不能承接
  perform pg_temp.mktk('ZZT5a', mem[10], tt.id, 2, 2, null, null); perform pg_temp.mktk('ZZT5b', mem[10], tt.id, 5, 5, null, null, jsonb_build_object('valid_days', 3));
  for i in 1..8 loop perform pg_temp.mkbk('ZZT5u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZT5a', true);
  R := R || jsonb_build_array(jsonb_build_object('t','T5.other_unopened_window','pass', r1->'plan'->'defer'=jsonb_build_array('ZZT5u3','ZZT5u4','ZZT5u5') and jsonb_array_length(r1->'plan'->'cancel')=3));
  delete from bookings where id like 'ZZT5%'; delete from ticket_logs where ticket_id like 'ZZT5%'; delete from member_tickets where id like 'ZZT5%';
  perform pg_temp.mktk('ZZT7a', mem[10], tt.id, 2, 2, null, null); perform pg_temp.mktk('ZZT7b', mem[10], tt.id, 5, 5, null, null, jsonb_build_object('start_date', d0+5));
  for i in 1..7 loop perform pg_temp.mkbk('ZZT7u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  r1 := public.fn_hold_settle_new_ticket('ZZT7a', true);
  R := R || jsonb_build_array(jsonb_build_object('t','T7.other_start_date','pass', r1->'plan'->'defer'=jsonb_build_array('ZZT7u5','ZZT7u6','ZZT7u7') and r1->'plan'->'cancel'=jsonb_build_array('ZZT7u3','ZZT7u4')));
  delete from bookings where id like 'ZZT7%'; delete from ticket_logs where ticket_id like 'ZZT7%'; delete from member_tickets where id like 'ZZT7%';
  -- T6 其他分期票資料無法判讀（沒有已開通堂數）→ 無法確認，整批停止、不取消
  perform pg_temp.mktk('ZZT6a', mem[10], tt.id, 2, 2, null, null); perform pg_temp.mktk('ZZT6b', mem[10], tt.id, 6, 6, '{"count":3,"current":1}'::jsonb, null);
  for i in 1..5 loop perform pg_temp.mkbk('ZZT6u'||i, mem[10], tt.id, tt.cat, d0+i, '19:00'); end loop;
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZT6u%';
  r1 := public.fn_hold_settle_new_ticket('ZZT6a', true); r2 := public.fn_hold_settle_new_ticket('ZZT6a', false, null, '{"bind":[],"hold":[],"cancel":[],"sig":"x"}'::jsonb);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZT6u%';
  R := R || jsonb_build_array(jsonb_build_object('t','T6.unverifiable_stops','pass', r1->>'error_code'='UNVERIFIABLE_OTHER' and r2->>'error_code'='UNVERIFIABLE_OTHER' and h1=h2));
  delete from bookings where id like 'ZZT6%'; delete from ticket_logs where ticket_id like 'ZZT6%'; delete from member_tickets where id like 'ZZT6%';
  -- S8 非櫃檯
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001', true);
  r1 := public.fn_hold_settle_new_ticket('ZZTK1', true);
  R := R || jsonb_build_array(jsonb_build_object('t','S8.non_staff','pass', r1->>'error_code'='NOT_STAFF'));
  raise exception 'RESULT total=% failed=% contract_fixture=%', jsonb_array_length(R), coalesce((select jsonb_agg(x->>'t') from jsonb_array_elements(R) x where (x->>'pass') is distinct from 'true'), '[]'::jsonb), ctok;
end $do$;
