-- 團課取消單一名額（fn_cancel_group_seat）行為測試｜測試庫 kucvxpjatptfckhlxptj｜單一交易、結尾 raise exception 回滾（無殘留）
-- 前置：測試庫已暫時安裝 06＋08＋docs/migrations/20261119_fn_cancel_group_seat.sql，且 bookings 已有 seat_notes 欄（測試庫基準缺此欄，正式庫有）。
-- ⚠ 循序測試；真並行見執行器 --seat-cancel 模式。
do $t$
declare
  v_m1 text; v_m2 text; v_uid uuid; v_uidc uuid; out jsonb := '{}'::jsonb; r jsonb; rv text; rv0 text;
  b4 jsonb; rem4 bigint; logs4 bigint; lg0 bigint; sa0 bigint;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if;
  select auth_id into v_uid from employees where id='e_fd'; select auth_id into v_uidc from employees where id='e_coach';
  select id into v_m1 from members order by id limit 1; select id into v_m2 from members order by id offset 1 limit 1;
  alter table public.ticket_logs disable trigger trg_tk_window_ledger;
  create function pg_temp.as_user(u text) returns void language sql as $f$ select set_config('request.jwt.claim.sub', u, true), set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true) $f$;
  create function pg_temp.q(p text) returns bigint language plpgsql as $f$ declare x bigint; begin execute p into x; return x; end $f$;
  create function pg_temp.rev(b text) returns text language sql as $f$ select public.fn_booking_rev_of(b) $f$;
  create function pg_temp.cs(b text, k text, rv text default null, m text default 'auto') returns jsonb language plpgsql as $f$ begin return public.fn_cancel_group_seat(b, k, coalesce(rv, public.fn_booking_rev_of(b)), m); exception when others then return jsonb_build_object('exception', sqlerrm); end $f$;
  create function pg_temp.rem(t text) returns bigint language sql as $f$ select sessions_remaining::bigint from member_tickets where id=t $f$;
  create function pg_temp.net(t text, b text) returns bigint language sql as $f$ select coalesce(sum(case when action::text='deduct' and delta<>0 then 1 when action::text='refund' then -1 else 0 end),0)::bigint from ticket_logs where ticket_id=t and booking_id=b $f$;
  create function pg_temp.bk(b text) returns jsonb language sql as $f$ select jsonb_build_object('m', member_ids, 'st', seat_tickets, 'att', attendance, 'n', seat_notes, 'status', status::text) from bookings where id=b $f$;
  create function pg_temp.nlog(t text, b text, a text) returns bigint language sql as $f$ select count(*) from ticket_logs where ticket_id=t and booking_id=b and action::text=a $f$;
  create function pg_temp.boom() returns trigger language plpgsql as $f$ begin if new.note like '團體課取消預約退回%' then raise exception 'BOOM'; end if; return new; end $f$;
  insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions,valid_days,start_date,expire_date,activated_at) values
    ('GS-SA',v_m1,'tt_group','A',8,4,'usable',8,null,null,null,null),('GS-SB',v_m1,'tt_group','B',8,4,'usable',8,null,null,null,null),
    ('GS-SC',v_m2,'tt_group','C',8,4,'usable',8,null,null,null,null),('GS-FULL',v_m1,'tt_group','F',8,8,'usable',8,null,null,null,null),
    ('GS-LEG',v_m1,'tt_group','L',8,5,'usable',8,28,date '2026-12-10',date '2027-01-06',now());
  insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,seat_notes,max_heads,coach_id) values
    ('GS-1','小班肌力','2026-12-10','19:00',60,'booked',jsonb_build_array(v_m1,v_m2,v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SA',v_m2,'GS-SC',v_m1||'#2','GS-SA'),null,5,null),
    ('GS-2','小班肌力','2026-12-11','19:00',60,'booked',jsonb_build_array(v_m1,v_m1),jsonb_build_object(v_m1||'#2','booked'),jsonb_build_object(v_m1,'GS-SA',v_m1||'#2','GS-SB'),jsonb_build_object(v_m1,'一',v_m1||'#2','二'),5,null),
    ('GS-3','小班肌力','2026-12-12','19:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SB'),null,5,null),
    ('GS-4','小班肌力','2026-12-13','19:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SB'),null,5,null),
    ('GS-5','小班肌力','2026-12-14','19:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SB'),null,5,null),
    ('GS-6','小班肌力','2026-12-15','19:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-FULL'),null,5,null),
    ('GS-7','小班肌力','2026-12-16','19:00',60,'booked',jsonb_build_array(v_m1),jsonb_build_object(v_m1,'checked_in'),jsonb_build_object(v_m1,'GS-SB'),null,5,null),
    ('GS-8','小班肌力','2026-12-17','19:00',60,'booked',jsonb_build_array(v_m1),jsonb_build_object(v_m1,'leave'),jsonb_build_object(v_m1,'GS-SB'),null,5,null),
    ('GS-9','小班肌力','2026-12-18','19:00',60,'booked',jsonb_build_array(v_m1,v_m1),'{}'::jsonb,null,null,5,null),
    ('GS-10','小班肌力','2026-12-19','19:00',60,'booked',jsonb_build_array(v_m1,v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SA',v_m1||'#2','GS-SA'),null,5,'e_coach'),
    ('GS-11','私人教練','2026-12-20','19:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,'{}'::jsonb,null,5,null),
    ('GS-12','小班肌力','2026-12-10','20:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-LEG'),null,5,null),
    ('GS-13','小班肌力','2026-12-21','19:00',60,'booked',jsonb_build_array(v_m1,v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SA',v_m1||'#2','GS-SA'),null,5,null),
    ('GS-14','小班肌力','2026-12-22','19:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SB'),null,5,null),
    ('GS-15','小班肌力','2026-12-12','20:00',60,'booked',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-LEG'),null,5,null),
    ('GS-16','小班肌力','2026-12-23','19:00',60,'cancelled',jsonb_build_array(v_m1),'{}'::jsonb,jsonb_build_object(v_m1,'GS-SB'),null,5,null);
  insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values
    ('GSL1','GS-SA','deduct',-1,'GS-1','x','夾具'),('GSL2','GS-SA','deduct',-1,'GS-1','x','夾具'),('GSL3','GS-SC','deduct',-1,'GS-1','x','夾具'),
    ('GSL4','GS-SA','deduct',-1,'GS-2','x','夾具'),('GSL5','GS-SB','deduct',-1,'GS-2','x','夾具'),
    ('GSL6','GS-SB','deduct',-1,'GS-3','x','夾具'),
    ('GSL7','GS-SB','deduct',-1,'GS-5','x','夾具'),('GSL7b','GS-SB','refund',1,'GS-5','x','夾具'),
    ('GSL8','GS-FULL','deduct',-1,'GS-6','x','夾具'),
    ('GSL9','GS-SB','deduct',-1,'GS-7','x','夾具'),('GSL10','GS-SB','deduct',-1,'GS-8','x','夾具'),
    ('GSL11','GS-SA','deduct',-1,'GS-9','x','夾具'),('GSL12','GS-SB','deduct',-1,'GS-9','x','夾具'),('GSL13','GS-SA','deduct',-1,'GS-9','x','夾具'),('GSL14','GS-SB','deduct',-1,'GS-9','x','夾具'),
    ('GSL15','GS-SA','deduct',-1,'GS-10','x','夾具'),('GSL16','GS-SA','deduct',-1,'GS-10','x','夾具'),
    ('GSL17','GS-LEG','deduct',-1,'GS-12','x','夾具'),('GSL18','GS-SA','deduct',-1,'GS-13','x','夾具'),
    ('GSL19','GS-SB','deduct',-1,'GS-14','x','夾具'),('GSL20','GS-LEG','deduct',-1,'GS-15','x','夾具');
  update member_tickets set sessions_remaining=8 where id='GS-FULL';

  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','',true);
  out := out || jsonb_build_object('A0_未登入', pg_temp.cs('GS-1', v_m1), 'A0b_版本_未登入', public.fn_group_seat_rev('GS-1'));
  perform pg_temp.as_user(v_uidc::text);
  out := out || jsonb_build_object('A1_教練取消別人的課被拒', jsonb_build_object('回傳', pg_temp.cs('GS-1', v_m1), '預約不變', jsonb_array_length(pg_temp.bk('GS-1')->'m')=3), 'A1b_教練讀別人版本被拒', public.fn_group_seat_rev('GS-1'));
  r := pg_temp.cs('GS-10', v_m1||'#2');
  out := out || jsonb_build_object('A2_該堂教練可取消自己的課', jsonb_build_object('回傳', r, 'SA餘額5', pg_temp.rem('GS-SA')=5));
  perform pg_temp.as_user(v_uid::text);
  out := out || jsonb_build_object('A3_缺版本', public.fn_cancel_group_seat('GS-1', v_m1, null, 'auto'), 'A3b_模式不合法', pg_temp.cs('GS-1', v_m1, null, 'zzz'), 'A3c_不是團課', pg_temp.cs('GS-11', v_m1), 'A3d_已取消的預約', pg_temp.cs('GS-16', v_m1));

  rv0 := pg_temp.rev('GS-1'); sa0 := pg_temp.rem('GS-SA');
  r := pg_temp.cs('GS-1', v_m1||'#2');
  out := out || jsonb_build_object('T1_同會員多名額取第2個', jsonb_build_object('回傳', r, '名單', pg_temp.bk('GS-1')->'m', '座位票', pg_temp.bk('GS-1')->'st', 'SA餘額+1', pg_temp.rem('GS-SA')=sa0+1, 'SA淨額1', pg_temp.net('GS-SA','GS-1')=1, '他人票SC不動', pg_temp.rem('GS-SC')=4 and pg_temp.net('GS-SC','GS-1')=1, '版本前進', pg_temp.rev('GS-1')::bigint > rv0::bigint));
  r := pg_temp.cs('GS-1', v_m1||'#2', rv0);
  out := out || jsonb_build_object('T4_重送_舊版本', jsonb_build_object('回傳', r, 'SA不變', pg_temp.rem('GS-SA')=sa0+1, '淨額仍1', pg_temp.net('GS-SA','GS-1')=1));
  out := out || jsonb_build_object('T4b_名額已不存在', jsonb_build_object('回傳', pg_temp.cs('GS-1', v_m1||'#2'), 'SA不變', pg_temp.rem('GS-SA')=sa0+1));
  r := pg_temp.cs('GS-2', v_m1);
  out := out || jsonb_build_object('T2_取消第1個名額_遞補', jsonb_build_object('回傳', r, '預約', pg_temp.bk('GS-2'), 'SA退第1名額的票', pg_temp.rem('GS-SA')=sa0+2, 'SB不動', pg_temp.rem('GS-SB')=4 and pg_temp.net('GS-SB','GS-2')=1));

  r := public.fn_desk_op_begin('gcr:GS-3:x:1','GS-SB','GS-3', pg_temp.rev('GS-3'));
  rv := r->>'op_key';
  r := pg_temp.cs('GS-3', v_m1);
  out := out || jsonb_build_object('T5a_取消後名單空_團課保留', jsonb_build_object('回傳', r, '預約', pg_temp.bk('GS-3'), 'status仍booked', (pg_temp.bk('GS-3')->>'status')='booked', 'SB餘額5', pg_temp.rem('GS-SB')=5));
  out := out || jsonb_build_object('T5b_取消前登記的操作被擋', public.fn_desk_deduct_ticket('GS-SB','GS-3','團課',rv));
  update bookings set member_ids=jsonb_build_array(v_m1), seat_tickets=jsonb_build_object(v_m1,'GS-SB') where id='GS-3';
  r := public.fn_desk_op_begin('gcr:GS-3:x:1','GS-SB','GS-3', pg_temp.rev('GS-3'));
  out := out || jsonb_build_object('T5c_重新加入_新epoch', r);
  r := public.fn_desk_deduct_ticket('GS-SB','GS-3','團課',r->>'op_key');
  out := out || jsonb_build_object('T5d_重新加入後扣堂成功', jsonb_build_object('回傳', r, 'SB餘額4', pg_temp.rem('GS-SB')=4, '淨額1', pg_temp.net('GS-SB','GS-3')=1));

  b4 := pg_temp.bk('GS-3'); rem4 := pg_temp.rem('GS-SB'); logs4 := pg_temp.q($$select count(*) from ticket_logs where booking_id='GS-3'$$);
  create trigger zz_boom before insert on ticket_logs for each row execute function pg_temp.boom();
  r := pg_temp.cs('GS-3', v_m1);
  drop trigger zz_boom on ticket_logs;
  out := out || jsonb_build_object('T6_故障整體回滾', jsonb_build_object('回傳', r, '預約完全不變', pg_temp.bk('GS-3')=b4, '餘額不變', pg_temp.rem('GS-SB')=rem4, '帳本筆數不變', pg_temp.q($$select count(*) from ticket_logs where booking_id='GS-3'$$)=logs4));

  rem4 := pg_temp.rem('GS-SB');
  r := pg_temp.cs('GS-4', v_m1);
  out := out || jsonb_build_object('T7_沒扣過_不退_名額照移除', jsonb_build_object('回傳', r, '名單', pg_temp.bk('GS-4')->'m', 'SB餘額不變', pg_temp.rem('GS-SB')=rem4, '說明帳', pg_temp.nlog('GS-SB','GS-4','adjust')));
  r := pg_temp.cs('GS-5', v_m1);
  out := out || jsonb_build_object('T8_已退款過', jsonb_build_object('回傳', r, 'SB餘額不變', pg_temp.rem('GS-SB')=rem4, '退款帳仍1', pg_temp.nlog('GS-SB','GS-5','refund')=1));
  r := pg_temp.cs('GS-6', v_m1);
  out := out || jsonb_build_object('T9_退票失敗_餘額已滿', jsonb_build_object('回傳', r, '名單', pg_temp.bk('GS-6')->'m', 'FULL餘額不變8', pg_temp.rem('GS-FULL')=8, '無退款帳', pg_temp.nlog('GS-FULL','GS-6','refund')=0, '稽核帳', pg_temp.nlog('GS-FULL','GS-6','adjust')));
  r := pg_temp.cs('GS-14', v_m1, null, 'none');
  out := out || jsonb_build_object('T10_不退堂', jsonb_build_object('回傳', r, '名單', pg_temp.bk('GS-14')->'m', 'SB餘額不變', pg_temp.rem('GS-SB')=rem4, '無退款帳', pg_temp.nlog('GS-SB','GS-14','refund')=0, '稽核帳', pg_temp.nlog('GS-SB','GS-14','adjust')));
  out := out || jsonb_build_object('T11a_已簽到不可取消', jsonb_build_object('回傳', pg_temp.cs('GS-7', v_m1), '預約不變', jsonb_array_length(pg_temp.bk('GS-7')->'m')=1), 'T11b_請假不可取消', jsonb_build_object('回傳', pg_temp.cs('GS-8', v_m1), '預約不變', jsonb_array_length(pg_temp.bk('GS-8')->'m')=1));
  r := pg_temp.cs('GS-9', v_m1);
  out := out || jsonb_build_object('T12_無座位票記錄且多名額多票_拒絕不猜', jsonb_build_object('回傳', r, '預約不變', jsonb_array_length(pg_temp.bk('GS-9')->'m')=2));
  lg0 := pg_temp.rem('GS-SA');
  r := pg_temp.cs('GS-13', v_m1||'#2');
  out := out || jsonb_build_object('T16_淨額小於名額數_不多退', jsonb_build_object('回傳', r, 'SA餘額不變', pg_temp.rem('GS-SA')=lg0, '無退款帳', pg_temp.nlog('GS-SA','GS-13','refund')=0, '名單剩1', jsonb_array_length(pg_temp.bk('GS-13')->'m')=1));
  r := pg_temp.cs('GS-12', v_m1);
  out := out || jsonb_build_object('T17a_舊制票首堂取消_效期改依新首堂', jsonb_build_object('回傳', r, 'LEG起算', (select start_date::text from member_tickets where id='GS-LEG'), 'LEG到期', (select expire_date::text from member_tickets where id='GS-LEG'), 'LEG餘額6', pg_temp.rem('GS-LEG')=6));
  r := pg_temp.cs('GS-15', v_m1);
  out := out || jsonb_build_object('T17b_最後一堂取消_退回未開通', jsonb_build_object('回傳', r, 'LEG起算空', (select start_date is null and expire_date is null and activated_at is null from member_tickets where id='GS-LEG'), 'LEG餘額7', pg_temp.rem('GS-LEG')=7));
  out := out || jsonb_build_object('L1_鎖順序_先預約後票券', jsonb_build_object('預約鎖位置', position('from bookings where id = p_booking_id for update' in pg_get_functiondef('public.fn_cancel_group_seat(text,text,text,text)'::regprocedure)), '票券鎖位置', position('from member_tickets where id = v_tid for update' in pg_get_functiondef('public.fn_cancel_group_seat(text,text,text,text)'::regprocedure))));
  out := out || jsonb_build_object('P1_權限', jsonb_build_object('anon取消', has_function_privilege('anon','public.fn_cancel_group_seat(text,text,text,text)','execute'), 'auth取消', has_function_privilege('authenticated','public.fn_cancel_group_seat(text,text,text,text)','execute'), 'anon版本', has_function_privilege('anon','public.fn_group_seat_rev(text)','execute'), '輔助函式對auth開放', has_function_privilege('authenticated','public.fn_seat_map_reindex(jsonb,text[],text[],integer)','execute')));
  raise exception 'GS_RESULT: %', out::text;
end $t$;