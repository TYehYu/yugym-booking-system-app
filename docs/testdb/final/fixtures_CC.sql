-- 真並行／真實 HTTP 驗收用夾具（只對測試庫 kucvxpjatptfckhlxptj；前綴 CC-，驗收後用 cleanup 區塊清除並核對殘留 0）
-- 前置：測試庫已套用階段 06（fn_tk_refund_once 06 版）與 08（docs/prod-release/08_desk_deduct_apply_prod.sql 的內容，去掉正式庫守門）。
insert into ticket_types(id,name,category) values ('CC-T','CC','小班肌力') on conflict do nothing;
insert into members(id,name) values ('CC-M','CC會員') on conflict do nothing;
insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions) values
  ('CC-TK1','CC-M','CC-T','CC票1',8,6,'usable',8), ('CC-TK2','CC-M','CC-T','CC票2',8,1,'usable',8), ('CC-TK3','CC-M','CC-T','CC票3',8,6,'usable',8) on conflict do nothing;
insert into bookings(id,category,date,start_time,duration,status,member_ids,attendance,seat_tickets,max_heads) values
  ('CC-B1','小班肌力',(now() at time zone 'Asia/Taipei')::date+5,'19:00',60,'booked','["CC-M"]','{}','{}',5),
  ('CC-B2','小班肌力',(now() at time zone 'Asia/Taipei')::date+6,'19:00',60,'booked','["CC-M"]','{}','{}',5),
  ('CC-B3','小班肌力',(now() at time zone 'Asia/Taipei')::date+7,'19:00',60,'booked','["CC-M"]','{}','{}',5),
  ('CC-B4','小班肌力',(now() at time zone 'Asia/Taipei')::date+8,'19:00',60,'booked','["CC-M"]','{}','{}',5),
  ('CC-B5','小班肌力',(now() at time zone 'Asia/Taipei')::date+9,'19:00',60,'booked','["CC-M"]','{}','{}',5) on conflict do nothing;
-- ===== cleanup（驗收後執行；之後比較基準雜湊）=====
-- delete from ticket_deduct_ops where booking_id like 'CC-%';
-- delete from ticket_logs where ticket_id like 'CC-%' or booking_id like 'CC-%';
-- delete from bookings where id like 'CC-%'; delete from booking_op_rev where booking_id like 'CC-%';
-- delete from member_tickets where id like 'CC-%'; delete from members where id='CC-M'; delete from ticket_types where id='CC-T';
