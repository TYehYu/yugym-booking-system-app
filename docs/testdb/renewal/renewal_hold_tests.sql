-- 續約銜接卡位 v2：資料庫行為驗證（只測試庫 kucvxpjatptfckhlxptj；單一 DO 區塊，結尾故意 raise exception 讓所有夾具整段 rollback，不留任何資料）。
-- 前提：已套用 docs/migrations/20261120_renewal_hold_slots.sql。今天（台北）＝2026-11-16；月份上限＝2026-11-30。
-- 真正「同時」的並行（兩條連線）無法在單一 SQL 呼叫內做到（工具依序執行、dblink 需密碼）→ 另備受控執行器（見 docs/RENEWAL_HOLD_DESIGN_FOR_REVIEW.md）。
create function pg_temp.try(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $f$;

do $t$
declare res jsonb := '[]'::jsonb; v_sub uuid := (select auth_id from employees where id='e_fd');   -- 測試庫既有的櫃檯帳號（只拿來當登入身分，不改它）
  r jsonb; n int; o text; v_claims text;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  -- ── 夾具（維運身分：不帶 claims → 守門放行）──
  insert into ticket_types(id,name,category) values ('CC-RN-TT','CC續約私教','私人教練'),('CC-RN-TT2','CC其他票種','私人教練');
  insert into members(id,name,status) values ('CC-RN-M1','CC會員1','active'),('CC-RN-M2','CC會員2','active'),('CC-RN-M3','CC會員3','active');
  -- 到期的卡位（過去、待簽約、沒合約、綁了會員）：維運身分塞進去
  insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values
    ('CC-RN-PAST','CC-RN-M1','CC-RN-TT','私人教練','2026-11-10','19:00',60,'booked',true),
    ('CC-RN-TODAY','CC-RN-M1','CC-RN-TT','私人教練','2026-11-16','19:00',60,'booked',true);
  v_claims := jsonb_build_object('role','authenticated','sub',v_sub::text)::text;
  perform set_config('request.jwt.claims', v_claims, true);   -- 之後都用「已登入的櫃檯」身分（守門生效）

  -- ═══ 一、沒有合約的卡位 ═══
  res := res || jsonb_build_object('case','I1 任意未來一週（2027-03-02，遠超月份上限）','out', pg_temp.try($q$insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values ('CC-RN-A1','CC-RN-M1','CC-RN-TT','私人教練','2027-03-02','19:00',60,'booked',true)$q$));
  res := res || jsonb_build_object('case','I2 沒有會員的空堂超出月份仍被擋（既有行為不變）','out', pg_temp.try($q$insert into bookings(id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values ('CC-RN-OPEN','CC-RN-TT','私人教練','2027-03-02','20:00',60,'booked',true)$q$));
  o := pg_temp.try($q$insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values ('CC-RN-A2','CC-RN-M1','CC-RN-TT','私人教練','2027-03-03','19:00',60,'booked',true),('CC-RN-A3','CC-RN-M1','CC-RN-TT','私人教練','2027-03-04','19:00',60,'booked',true),('CC-RN-A4','CC-RN-M1','CC-RN-TT','私人教練','2027-03-10','19:00',60,'booked',true)$q$);
  select count(*) into n from bookings where member_id='CC-RN-M1' and pending_contract and ticket_id is null and status::text<>'cancelled' and date>=public.fn_tk_today();   -- 分開計數（同一運算式裡的子查詢會比寫入先執行）
  res := res || jsonb_build_object('case','I3 另外再卡 3 堂（同七天內 2 堂＋之後一週 1 堂）：不設總共兩堂上限、不同七天範圍可同時存在','insert',o,'valid_holds',n);
  res := res || jsonb_build_object('case','I4 卡位沒綁票、沒扣堂','out', jsonb_build_object('ticket_bound',(select count(*) from bookings where id like 'CC-RN-A%' and ticket_id is not null),'ledger_rows',(select count(*) from ticket_logs where booking_id like 'CC-RN-A%')));
  res := res || jsonb_build_object('case','I5 卡位直接簽到被擋','out', pg_temp.try($q$update bookings set status='checked_in' where id='CC-RN-A1'$q$));
  res := res || jsonb_build_object('case','I5b 全新的待簽約卡位直接以「已簽到」INSERT → 被擋（INSERT 也要擋）','out', pg_temp.try($q$insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values ('CC-RN-AI','CC-RN-M1','CC-RN-TT','私人教練','2027-03-02','21:00',60,'checked_in',true)$q$) || ' / 列是否建立=' || (select count(*) from bookings where id='CC-RN-AI'));
  res := res || jsonb_build_object('case','I5c upsert（INSERT … ON CONFLICT DO UPDATE，前端 dbPut 的寫法）把既有卡位改成已簽到 → 被擋','out', pg_temp.try($q$insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values ('CC-RN-A1','CC-RN-M1','CC-RN-TT','私人教練','2027-03-02','19:00',60,'checked_in',true) on conflict (id) do update set status=excluded.status$q$) || ' / A1 狀態=' || (select status::text from bookings where id='CC-RN-A1'));
  res := res || jsonb_build_object('case','I5d upsert 只改備註（狀態不變）→ 可以','out', pg_temp.try($q$insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract,note) values ('CC-RN-A1','CC-RN-M1','CC-RN-TT','私人教練','2027-03-02','19:00',60,'booked',true,'upsert 改備註') on conflict (id) do update set note=excluded.note$q$));
  res := res || jsonb_build_object('case','I6 到期卡位（11/10）改備註可以','out', pg_temp.try($q$update bookings set note='到期後改備註' where id='CC-RN-PAST'$q$));
  insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,start_date,expire_date,activated_at) values ('CC-RN-TKN','CC-RN-M1','CC-RN-TT','CC新票8堂',8,8,'usable','2026-11-16','2027-12-31',now());
  res := res || jsonb_build_object('case','I7 到期卡位不能由一般流程轉正（綁票）','out', pg_temp.try($q$update bookings set ticket_id='CC-RN-TKN', pending_contract=false where id='CC-RN-PAST'$q$));
  res := res || jsonb_build_object('case','I8 到期卡位不能改期救活（改到未來）','out', pg_temp.try($q$update bookings set date='2027-03-20' where id='CC-RN-PAST'$q$));
  res := res || jsonb_build_object('case','I8b upsert 不能把到期卡位改期救活或綁票（INSERT 路徑也要擋）','out', pg_temp.try($q$insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values ('CC-RN-PAST','CC-RN-M1','CC-RN-TT','私人教練','2027-03-20','19:00',60,'booked',true) on conflict (id) do update set date=excluded.date$q$) || ' / ' || pg_temp.try($q$insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract,ticket_id) values ('CC-RN-PAST','CC-RN-M1','CC-RN-TT','私人教練','2026-11-10','19:00',60,'booked',false,'CC-RN-TKN') on conflict (id) do update set ticket_id=excluded.ticket_id, pending_contract=excluded.pending_contract$q$) || ' / PAST 日期=' || (select date::text from bookings where id='CC-RN-PAST'));
  res := res || jsonb_build_object('case','I9 到期卡位可以取消（歷史資料保留，列仍在）','out', pg_temp.try($q$update bookings set status='cancelled' where id='CC-RN-PAST'$q$) || ' / 列仍在=' || (select count(*) from bookings where id='CC-RN-PAST'));
  res := res || jsonb_build_object('case','I10 今天的卡位仍有效（保留到當天）：可以轉正','out', pg_temp.try($q$update bookings set ticket_id='CC-RN-TKN', pending_contract=false where id='CC-RN-TODAY'$q$));

  -- ═══ 二、承接既有卡位 ═══
  insert into contracts(id,member_id,member_name,plan_name,sessions,ticket_type_id) values ('CC-RN-CT1','CC-RN-M2','CC會員2','CC八堂合約',4,'CC-RN-TT');
  insert into ticket_grant_requests(id,member_id,plan_name,sessions,payload,contract_id,status) values ('CC-RN-GR1','CC-RN-M2','CC八堂合約',4,'{"plan":{"ticket_type_id":"CC-RN-TT","valid_days":60}}'::jsonb,'CC-RN-CT1','pending');
  insert into bookings(id,member_id,ticket_type_id,category,coach_id,date,start_time,duration,status,pending_contract,venue_unit) values
    ('CC-RN-B1','CC-RN-M2','CC-RN-TT','私人教練',null,'2027-03-02','19:00',60,'booked',true,'U1'),
    ('CC-RN-B2','CC-RN-M2','CC-RN-TT','私人教練',null,'2027-03-03','19:00',60,'booked',true,'U2'),
    ('CC-RN-B3','CC-RN-M2','CC-RN-TT','私人教練',null,'2027-03-10','19:00',60,'booked',true,'U3'),
    ('CC-RN-B4','CC-RN-M2','CC-RN-TT','私人教練',null,'2027-03-11','19:00',60,'booked',true,'U4'),
    ('CC-RN-B5','CC-RN-M2','CC-RN-TT','私人教練',null,'2027-03-12','19:00',60,'booked',true,'U5');
  -- 備份原預約的關鍵欄位，承接後要逐列相同（只有 contract_id 可以變）
  create temp table _before on commit drop as select id, member_id, date, start_time, coach_id, venue_unit, duration, status, pending_contract, ticket_id from bookings where id in ('CC-RN-B1','CC-RN-B2','CC-RN-B3','CC-RN-B4','CC-RN-B5');
  r := public.fn_contract_adopt_holds('CC-RN-CT1', array['CC-RN-B1','CC-RN-B2','CC-RN-B3','CC-RN-B4','CC-RN-B5'], true);
  res := res || jsonb_build_object('case','II1 八堂合約…（這裡合約 4 堂）一次選 5 堂（跨兩週）→ 堂數不足：整批不動並列出原因','out', jsonb_build_object('ok',r->'ok','problems',r->'problems','contract_ids_set',(select count(*) from bookings where id like 'CC-RN-B_' and contract_id is not null)));
  r := public.fn_contract_adopt_holds('CC-RN-CT1', array['CC-RN-B1','CC-RN-B2','CC-RN-B3','CC-RN-B4']);
  res := res || jsonb_build_object('case','II2 承接 4 堂（跨兩週）→ 成功，占滿合約 4 堂','out', jsonb_build_object('ok',r->'ok','adopted',r->'adopted','used_after',r->'used_after','left_after',r->'left_after'));
  res := res || jsonb_build_object('case','II2b 沿用原預約：編號／日期／時間／場地／狀態逐列相同、只多了 contract_id、沒有新增或刪除預約','out', jsonb_build_object(
      'unchanged_rows',(select count(*) from _before o join bookings b using (id) where b.date=o.date and b.start_time=o.start_time and b.venue_unit is not distinct from o.venue_unit and b.duration=o.duration and b.status=o.status and b.pending_contract=o.pending_contract and b.ticket_id is not distinct from o.ticket_id and b.member_id=o.member_id and b.coach_id is not distinct from o.coach_id and b.id in ('CC-RN-B1','CC-RN-B2','CC-RN-B3','CC-RN-B4')),
      'rows_B1_to_B5',(select count(*) from bookings where id in ('CC-RN-B1','CC-RN-B2','CC-RN-B3','CC-RN-B4','CC-RN-B5')),
      'with_contract',(select count(*) from bookings where contract_id='CC-RN-CT1')));
  r := public.fn_contract_adopt_holds('CC-RN-CT1', array['CC-RN-B1','CC-RN-B2','CC-RN-B3','CC-RN-B4']);
  res := res || jsonb_build_object('case','II3 重送同一批 → ok、全部 already、不重複占額','out', jsonb_build_object('ok',r->'ok','adopted',r->'adopted','already',r->'already','used_after',r->'used_after'));
  r := public.fn_contract_adopt_holds('CC-RN-CT1', array['CC-RN-B5']);
  res := res || jsonb_build_object('case','II4 合約已占滿，再承接第 5 堂 → 堂數不足、列出剩餘 0','out', jsonb_build_object('ok',r->'ok','problems',r->'problems'));
  res := res || jsonb_build_object('case','II4b 繞過 RPC 直接寫 contract_id 也被資料庫額度守衛擋下（不能突破合約堂數）','out', pg_temp.try($q$update bookings set contract_id='CC-RN-CT1' where id='CC-RN-B5'$q$));
  -- 不得自動承接的：已取消、已到期、已屬其他合約、別人的、票種不符、已綁票
  insert into contracts(id,member_id,member_name,plan_name,sessions,ticket_type_id) values ('CC-RN-CT2','CC-RN-M3','CC會員3','CC合約2',8,'CC-RN-TT'),('CC-RN-CT9','CC-RN-M3','CC會員3','CC別份合約',8,'CC-RN-TT');
  insert into ticket_grant_requests(id,member_id,plan_name,sessions,payload,contract_id,status) values ('CC-RN-GR2','CC-RN-M3','CC合約2',8,'{"plan":{"ticket_type_id":"CC-RN-TT","valid_days":60}}'::jsonb,'CC-RN-CT2','pending'),('CC-RN-GR9','CC-RN-M3','CC別份合約',8,'{"plan":{"ticket_type_id":"CC-RN-TT","valid_days":60}}'::jsonb,'CC-RN-CT9','pending');
  insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract,contract_id,ticket_id) values
    ('CC-RN-X1','CC-RN-M3','CC-RN-TT','私人教練','2027-04-01','19:00',60,'cancelled',true,null,null),
    ('CC-RN-X2','CC-RN-M3','CC-RN-TT','私人教練','2026-11-12','19:00',60,'booked',true,null,null),
    ('CC-RN-X3','CC-RN-M3','CC-RN-TT','私人教練','2027-04-02','19:00',60,'booked',true,'CC-RN-CT9',null),
    ('CC-RN-X4','CC-RN-M2','CC-RN-TT','私人教練','2027-04-03','19:00',60,'booked',true,null,null),
    ('CC-RN-X5','CC-RN-M3','CC-RN-TT2','私人教練','2027-04-04','19:00',60,'booked',true,null,null),
    ('CC-RN-X6','CC-RN-M3','CC-RN-TT','私人教練','2027-04-05','19:00',60,'booked',false,null,'CC-RN-TKN'),
    ('CC-RN-X7','CC-RN-M3','CC-RN-TT','私人教練','2027-04-06','19:00',60,'booked',true,null,null);
  r := public.fn_contract_adopt_holds('CC-RN-CT2', array['CC-RN-X1','CC-RN-X2','CC-RN-X3','CC-RN-X4','CC-RN-X5','CC-RN-X6','CC-RN-X7','CC-RN-NOPE']);
  res := res || jsonb_build_object('case','II5 不得自動承接：取消／到期／屬其他合約／別人的／票種不符／已綁票／不存在，且有效的 X7 也不被偷偷單獨承接（整批不動）','out', jsonb_build_object('ok',r->'ok','reasons',(select jsonb_object_agg(p->>'booking_id', p->>'reason') from jsonb_array_elements(r->'problems') p),'X7_contract',(select contract_id from bookings where id='CC-RN-X7')));
  -- 暫定使用期間
  insert into contracts(id,member_id,member_name,plan_name,sessions,ticket_type_id) values ('CC-RN-CT3','CC-RN-M3','CC會員3','CC合約3',8,'CC-RN-TT');
  insert into ticket_grant_requests(id,member_id,plan_name,sessions,payload,contract_id,status) values ('CC-RN-GR3','CC-RN-M3','CC合約3',8,'{"plan":{"ticket_type_id":"CC-RN-TT","valid_days":10}}'::jsonb,'CC-RN-CT3','pending');
  insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values
    ('CC-RN-W1','CC-RN-M3','CC-RN-TT','私人教練','2027-05-02','19:00',60,'booked',true),('CC-RN-W2','CC-RN-M3','CC-RN-TT','私人教練','2027-05-08','19:00',60,'booked',true),('CC-RN-W3','CC-RN-M3','CC-RN-TT','私人教練','2027-05-16','19:00',60,'booked',true);
  r := public.fn_contract_adopt_holds('CC-RN-CT3', array['CC-RN-W1','CC-RN-W2','CC-RN-W3']);
  res := res || jsonb_build_object('case','III1 合約有效 10 天：5/2、5/8、5/16 → 超期（5/16 超出 5/2＋10 天）：列出原因與可用區間，整批不動','out', jsonb_build_object('ok',r->'ok','problems',(select jsonb_agg(p) from jsonb_array_elements(r->'problems') p where p->>'reason'='OUT_OF_WINDOW'),'adopted_any',(select count(*) from bookings where id like 'CC-RN-W_' and contract_id is not null)));
  r := public.fn_contract_adopt_holds('CC-RN-CT3', array['CC-RN-W1','CC-RN-W2']);
  res := res || jsonb_build_object('case','III2 只承接 5/2、5/8（在暫定期間內）→ 成功','out', jsonb_build_object('ok',r->'ok','adopted',r->'adopted'));
  res := res || jsonb_build_object('case','III3 承接後把 5/8 改期到 5/16（超出暫定期間）→ 資料庫拒絕（不靜默留下超期課程）','out', pg_temp.try($q$update bookings set date='2027-05-16' where id='CC-RN-W2'$q$));
  res := res || jsonb_build_object('case','III4 把最早一堂 5/2 往前改到 4/20（暫定期間被拉長超過 10 天）→ 拒絕','out', pg_temp.try($q$update bookings set date='2027-04-20' where id='CC-RN-W1'$q$));
  res := res || jsonb_build_object('case','III5 取消最早一堂 5/2 → 可以，暫定期間改以 5/8 起算','out', pg_temp.try($q$update bookings set status='cancelled' where id='CC-RN-W1'$q$));
  r := public.fn_contract_adopt_holds('CC-RN-CT3', array['CC-RN-W3']);
  res := res || jsonb_build_object('case','III6 重新起算後，5/16（距 5/8 只有 8 天）可以承接','out', jsonb_build_object('ok',r->'ok','adopted',r->'adopted'));
  -- 付款（發放票券）後：沿用既有轉正，同一筆預約綁新票
  update ticket_grant_requests set status='issued', ticket_id='CC-RN-TKN' where id='CC-RN-GR1';
  res := res || jsonb_build_object('case','IV1 付款發放後：承接的卡位沿用既有轉正（同一筆 B1 綁新票、pending 收掉；先前未付款時它仍是待簽約、不能簽到）','out',
     pg_temp.try($q$update bookings set status='checked_in' where id='CC-RN-B2'$q$) || ' / 轉正=' || pg_temp.try($q$update bookings set ticket_id='CC-RN-TKN', pending_contract=false where id='CC-RN-B1'$q$)
     || ' / B1 列數=' || (select count(*) from bookings where id='CC-RN-B1') || ' 仍屬合約=' || (select contract_id from bookings where id='CC-RN-B1'));
  res := res || jsonb_build_object('case','IV2 舊票（本期票）不被動：新票只被轉正的那一堂扣（此處模擬餘額不變，確認卡位流程沒有任何自動扣票）','out', jsonb_build_object('ledger_rows_for_holds',(select count(*) from ticket_logs where booking_id like 'CC-RN-%')));
  -- 合約取消（連動取消卡位）不被暫定期間檢查卡住
  insert into contracts(id,member_id,member_name,plan_name,sessions,ticket_type_id) values ('CC-RN-CT4','CC-RN-M3','CC會員3','CC合約4',8,'CC-RN-TT');
  insert into ticket_grant_requests(id,member_id,plan_name,sessions,payload,contract_id,status) values ('CC-RN-GR4','CC-RN-M3','CC合約4',8,'{"plan":{"ticket_type_id":"CC-RN-TT","valid_days":10}}'::jsonb,'CC-RN-CT4','pending');
  insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract,contract_id) values ('CC-RN-D1','CC-RN-M3','CC-RN-TT','私人教練','2027-06-02','19:00',60,'booked',true,'CC-RN-CT4'),('CC-RN-D2','CC-RN-M3','CC-RN-TT','私人教練','2027-06-09','19:00',60,'booked',true,'CC-RN-CT4');
  -- ═══ 有效天數異常：不得靜默變成不限期 ═══
  perform set_config('request.jwt.claims', '{}', true);   -- 維運身分塞夾具
  insert into contracts(id,member_id,member_name,plan_name,sessions,ticket_type_id) values ('CC-RN-CT5','CC-RN-M3','CC會員3','CC無效天數',8,'CC-RN-TT'),('CC-RN-CT6','CC-RN-M3','CC會員3','CC文字天數',8,'CC-RN-TT'),('CC-RN-CT7','CC-RN-M3','CC會員3','CC零天',8,'CC-RN-TT');
  insert into ticket_grant_requests(id,member_id,plan_name,sessions,payload,contract_id,status) values
    ('CC-RN-GR5','CC-RN-M3','CC無效天數',8,'{"plan":{"ticket_type_id":"CC-RN-TT"}}'::jsonb,'CC-RN-CT5','pending'),
    ('CC-RN-GR6','CC-RN-M3','CC文字天數',8,'{"plan":{"ticket_type_id":"CC-RN-TT","valid_days":"三十天"}}'::jsonb,'CC-RN-CT6','pending'),
    ('CC-RN-GR7','CC-RN-M3','CC零天',8,'{"plan":{"ticket_type_id":"CC-RN-TT","valid_days":0}}'::jsonb,'CC-RN-CT7','pending');
  insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract,contract_id) values
    ('CC-RN-V0','CC-RN-M3','CC-RN-TT','私人教練','2027-07-01','19:00',60,'booked',true,'CC-RN-CT5');
  insert into bookings(id,member_id,ticket_type_id,category,date,start_time,duration,status,pending_contract) values
    ('CC-RN-V1','CC-RN-M3','CC-RN-TT','私人教練','2027-07-02','19:00',60,'booked',true),('CC-RN-V2','CC-RN-M3','CC-RN-TT','私人教練','2027-07-03','19:00',60,'booked',true),('CC-RN-V3','CC-RN-M3','CC-RN-TT','私人教練','2027-07-04','19:00',60,'booked',true);
  perform set_config('request.jwt.claims', v_claims, true);
  r := public.fn_contract_adopt_holds('CC-RN-CT5', array['CC-RN-V1']);
  res := res || jsonb_build_object('case','VD1 合約的方案沒有 valid_days → 承接明確列為問題、不承接（不是靜默當成不限期）','out', jsonb_build_object('ok',r->'ok','reasons',(select jsonb_agg(p->>'reason') from jsonb_array_elements(r->'problems') p),'adopted',(select count(*) from bookings where id='CC-RN-V1' and contract_id is not null)));
  r := public.fn_contract_adopt_holds('CC-RN-CT6', array['CC-RN-V2']);
  res := res || jsonb_build_object('case','VD2 valid_days 是文字（三十天）→ 同樣列為問題、不承接','out', jsonb_build_object('ok',r->'ok','reasons',(select jsonb_agg(p->>'reason') from jsonb_array_elements(r->'problems') p)));
  r := public.fn_contract_adopt_holds('CC-RN-CT7', array['CC-RN-V3'], true);
  res := res || jsonb_build_object('case','VD3 valid_days 是 0 → dry-run 也列為問題','out', jsonb_build_object('ok',r->'ok','reasons',(select jsonb_agg(p->>'reason') from jsonb_array_elements(r->'problems') p)));
  res := res || jsonb_build_object('case','VD4 繞過 RPC：把卡位改期（占用動作）→ 資料庫拒絕（CONTRACT.VALID_DAYS_INVALID）','out', pg_temp.try($q$update bookings set date='2027-07-05' where id='CC-RN-V0'$q$));
  res := res || jsonb_build_object('case','VD5 取消（p_active=false）不被擋：設定異常的合約也能取消卡位','out', pg_temp.try($q$update bookings set status='cancelled' where id='CC-RN-V0'$q$));
  o := pg_temp.try($q$update ticket_grant_requests set status='cancelled' where id='CC-RN-GR4'$q$);
  select count(*) into n from bookings where contract_id='CC-RN-CT4' and status::text<>'cancelled';
  res := res || jsonb_build_object('case','V1 取消待審核申請 → 連動取消所有未轉正卡位，不被暫定期間檢查卡住','cancel',o,'remaining_active',n,'rows_kept',(select count(*) from bookings where contract_id='CC-RN-CT4'));
  raise exception 'RN_RESULTS %', res::text;
end $t$;
