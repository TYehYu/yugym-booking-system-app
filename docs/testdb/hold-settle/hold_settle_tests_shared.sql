-- 回滾式測試（rev6 共享票）：只需暫裝本函式（測試庫 baseline＋tkwin 已有其他依賴）；整段在同一交易，最後故意拋 RESULT 讓全部回滾，不留資料。
-- 情境：預約會員 A 有新票（只能承接最近 1 堂）；別人名下（O）有同票種票並把 shared_with 共享給 A。一般預約本來就允許 A 用這張票。
-- SH1 共享票有效：第一堂轉正、其餘標 defer（先不動：不扣共享票、不取消卡位）；SH2 過期／SH3 額度 0／SH4 沒共享給 A／SH10 不同票種／SH11 已用完／SH12 起始日未到 → 不能算可用，照舊取消；
-- SH5 共享票只剩 1 堂 → 只承接 1 堂，其餘取消（不重複分配）；SH6 名單格式讀不懂／SH7 共享分期票缺已開通堂數 → UNVERIFIABLE_OTHER 整批停止、一筆都不動；
-- SH13 已不可用的票名單異常→不擋；SH14 可用的票名單異常→擋；SH8 預覽後共享票被用掉 → PLAN_CHANGED；SH9 名單是字串化的陣列 → 一樣能辨識。
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
create function pg_temp.mkcase(p_n text, p_new_total int, p_holds int, p_shared jsonb) returns void language plpgsql as $$
declare i int; v_a text; v_o text; tt record; d0 date := public.fn_tk_today();
begin
  select a, o into v_a, v_o from (select (array_agg(id order by id))[10] a, (array_agg(id order by id))[9] o from members) q;
  select id, category::text cat into tt from ticket_types where category::text <> '小班肌力' and coalesce(time_restricted,false)=false limit 1;
  perform pg_temp.mktk('ZZSH'||p_n||'n', v_a, tt.id, p_new_total, p_new_total, null, null);
  for i in 1..p_holds loop perform pg_temp.mkbk('ZZSH'||p_n||'u'||i, v_a, tt.id, tt.cat, d0+i, '19:00'); end loop;
end $$;
do $do$
declare R jsonb := '[]'::jsonb; adm record; tt record; tt2 text; mem text[]; d0 date := public.fn_tk_today(); r1 jsonb; r2 jsonb; h1 text; h2 text; va text; vo text; vb text; v1 int; v2 int; v3 int;
begin
  select id, auth_id into adm from employees where role::text in ('admin','front_desk') and auth_id is not null limit 1;
  select id, category::text cat into tt from ticket_types where category::text <> '小班肌力' and coalesce(time_restricted,false)=false limit 1;
  select id into tt2 from ticket_types where id <> tt.id limit 1;
  select array_agg(id order by id) into mem from members;
  va := mem[10]; vo := mem[9]; vb := mem[8];
  perform set_config('request.jwt.claims', json_build_object('sub',adm.auth_id,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm.auth_id::text, true);
  perform set_config('request.jwt.claim.role','authenticated', true);
  -- SH1 共享票有效（5 堂）：1 轉正、2 defer、0 取消；執行後不扣共享票、不取消卡位
  perform pg_temp.mkcase('1', 1, 3, null);
  perform pg_temp.mktk('ZZSH1s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH1n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH1.dry_defer_shared','pass', (r1->'plan'->'bind') = '["ZZSH1u1"]'::jsonb and (r1->'plan'->'defer') = '["ZZSH1u2","ZZSH1u3"]'::jsonb and (r1->'plan'->'cancel') = '[]'::jsonb
     and (select count(*) from jsonb_array_elements(r1->'rows') x where x->>'kind'='defer' and x->>'to'='ZZSH1s')=2));
  r2 := public.fn_hold_settle_new_ticket('ZZSH1n', false, null, r1->'plan');
  select sessions_remaining into v1 from member_tickets where id='ZZSH1n'; select sessions_remaining into v2 from member_tickets where id='ZZSH1s'; select count(*) into v3 from ticket_logs where ticket_id='ZZSH1s';
  R := R || jsonb_build_array(jsonb_build_object('t','SH1.exec_no_touch_shared','pass', (r2->>'ok')='true' and v1=0 and v2=5 and v3=0
     and (select count(*) from bookings where id='ZZSH1u1' and ticket_id='ZZSH1n' and pending_contract=false)=1
     and (select count(*) from bookings where id in ('ZZSH1u2','ZZSH1u3') and status::text='booked' and ticket_id is null and pending_contract is true)=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH2 共享票過期（效期在預約日之前）→ 不能承接，取消
  perform pg_temp.mkcase('2', 1, 3, null);
  perform pg_temp.mktk('ZZSH2s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va), 'expire_date', d0));
  r1 := public.fn_hold_settle_new_ticket('ZZSH2n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH2.expired_shared_not_usable','pass', (r1->'plan'->'defer') = '[]'::jsonb and (r1->'plan'->'cancel') = '["ZZSH2u2","ZZSH2u3"]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH3 共享票額度 0 → 取消
  perform pg_temp.mkcase('3', 1, 3, null);
  perform pg_temp.mktk('ZZSH3s', vo, tt.id, 5, 0, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH3n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH3.zero_quota_shared_not_usable','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH4 共享名單裡沒有 A（共享給別人）→ 取消
  perform pg_temp.mkcase('4', 1, 3, null);
  perform pg_temp.mktk('ZZSH4s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(vb)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH4n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH4.shared_to_someone_else','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH5 共享票只剩 1 堂：4 個卡位 → 1 轉正、1 defer、2 取消（不重複分配）
  perform pg_temp.mkcase('5', 1, 4, null);
  perform pg_temp.mktk('ZZSH5s', vo, tt.id, 5, 1, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH5n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH5.partial_quota_no_double','pass', (r1->'plan'->'defer') = '["ZZSH5u2"]'::jsonb and (r1->'plan'->'cancel') = '["ZZSH5u3","ZZSH5u4"]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH6 別人名下的共享名單格式讀不懂 → UNVERIFIABLE_OTHER（預覽與執行都停），一筆都不動
  perform pg_temp.mkcase('6', 1, 3, null);
  perform pg_temp.mktk('ZZSH6s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('abc'::text)));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH6u%';
  r1 := public.fn_hold_settle_new_ticket('ZZSH6n', true); r2 := public.fn_hold_settle_new_ticket('ZZSH6n', false, null, '{"bind":[],"hold":[],"cancel":[],"sig":"x"}'::jsonb);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH6u%'; select sessions_remaining into v1 from member_tickets where id='ZZSH6n';
  R := R || jsonb_build_array(jsonb_build_object('t','SH6.unreadable_shared_list_stops','pass', r1->>'error_code'='UNVERIFIABLE_OTHER' and r1->>'reason'='SHARED_UNREADABLE' and r2->>'error_code'='UNVERIFIABLE_OTHER' and h1=h2 and v1=1));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH7 共享給 A 的分期票缺已開通堂數（無法確認額度）→ UNVERIFIABLE_OTHER
  perform pg_temp.mkcase('7', 1, 3, null);
  perform pg_temp.mktk('ZZSH7s', vo, tt.id, 6, 6, '{"count":3,"current":1}'::jsonb, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH7u%';
  r1 := public.fn_hold_settle_new_ticket('ZZSH7n', true); r2 := public.fn_hold_settle_new_ticket('ZZSH7n', false, null, '{"bind":[],"hold":[],"cancel":[],"sig":"x"}'::jsonb);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH7u%';
  R := R || jsonb_build_array(jsonb_build_object('t','SH7.shared_installment_unverifiable_stops','pass', r1->>'error_code'='UNVERIFIABLE_OTHER' and r2->>'error_code'='UNVERIFIABLE_OTHER' and h1=h2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH8 預覽後共享票被用掉 → 確認指紋變 → PLAN_CHANGED、不做任何事
  perform pg_temp.mkcase('8', 1, 3, null);
  perform pg_temp.mktk('ZZSH8s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH8n', true);
  update member_tickets set sessions_remaining = 0 where id = 'ZZSH8s';
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH8u%';
  r2 := public.fn_hold_settle_new_ticket('ZZSH8n', false, null, r1->'plan');
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH8u%'; select sessions_remaining into v1 from member_tickets where id='ZZSH8n';
  R := R || jsonb_build_array(jsonb_build_object('t','SH8.shared_consumed_plan_changed','pass', r2->>'error_code'='PLAN_CHANGED' and h1=h2 and v1=1));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH9 名單是「字串化的陣列」（舊資料常見）→ 一樣辨識
  perform pg_temp.mkcase('9', 1, 3, null);
  perform pg_temp.mktk('ZZSH9s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb(('["' || va || '"]')::text)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH9n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH9.stringified_list','pass', (r1->'plan'->'defer') = '["ZZSH9u2","ZZSH9u3"]'::jsonb and (r1->'plan'->'cancel') = '[]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH10 不同票種的共享票 → 不算，取消（票種比對仍是完全相同）
  perform pg_temp.mkcase('10', 1, 3, null);
  perform pg_temp.mktk('ZZSH10s', vo, tt2, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va)));
  r1 := public.fn_hold_settle_new_ticket('ZZSH10n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH10.other_type_shared_not_counted','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH11 共享票已用完（status=used_up）→ 取消
  perform pg_temp.mkcase('11', 1, 3, null);
  perform pg_temp.mktk('ZZSH11s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va), 'status', 'used_up'));
  r1 := public.fn_hold_settle_new_ticket('ZZSH11n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH11.used_up_shared_not_usable','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH12 共享票尚未啟用且起始日在這些預約之後 → 不能承接，取消
  perform pg_temp.mkcase('12', 1, 3, null);
  perform pg_temp.mktk('ZZSH12s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', jsonb_build_array(va), 'start_date', d0 + 10));
  r1 := public.fn_hold_settle_new_ticket('ZZSH12n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH12.shared_not_started','pass', (r1->'plan'->'defer') = '[]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH13 同票種但「已不可用」（used_up）的別人名下的票，共享名單格式異常（'abc'、'[bad'）→ 不影響這次判定、不擋整批：照常 1 轉正、2 取消
  perform pg_temp.mkcase('13', 1, 3, null);
  perform pg_temp.mktk('ZZSH13a', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('abc'::text), 'status', 'used_up'));
  perform pg_temp.mktk('ZZSH13b', vb, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('[bad'::text), 'status', 'used_up'));
  r1 := public.fn_hold_settle_new_ticket('ZZSH13n', true);
  R := R || jsonb_build_array(jsonb_build_object('t','SH13.unusable_ticket_bad_list_does_not_block','pass', (r1->>'ok')='true' and (r1->'plan'->'bind') = '["ZZSH13u1"]'::jsonb and jsonb_array_length(r1->'plan'->'cancel')=2 and (r1->'plan'->'defer') = '[]'::jsonb));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  -- SH14 可用（usable）的別人名下的票，名單是壞掉的字串化陣列 '[bad'（轉型會丟錯）→ 仍要擋整批（UNVERIFIABLE_OTHER，不是 SETTLE.FAILED），一筆不動
  perform pg_temp.mkcase('14', 1, 3, null);
  perform pg_temp.mktk('ZZSH14s', vo, tt.id, 5, 5, null, null, jsonb_build_object('shared_with', to_jsonb('[bad'::text)));
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h1 from bookings b where id like 'ZZSH14u%';
  r1 := public.fn_hold_settle_new_ticket('ZZSH14n', true);
  select md5(string_agg(to_jsonb(b)::text,'|' order by id)) into h2 from bookings b where id like 'ZZSH14u%';
  R := R || jsonb_build_array(jsonb_build_object('t','SH14.usable_ticket_bad_list_blocks','pass', r1->>'error_code'='UNVERIFIABLE_OTHER' and r1->>'reason'='SHARED_UNREADABLE' and h1=h2));
  delete from bookings where id like 'ZZSH%'; delete from ticket_logs where ticket_id like 'ZZSH%'; delete from member_tickets where id like 'ZZSH%';
  raise exception 'RESULT total=% failed=%', jsonb_array_length(R), coalesce((select jsonb_agg(x->>'t') from jsonb_array_elements(R) x where (x->>'pass') is distinct from 'true'), '[]'::jsonb);
end $do$;
