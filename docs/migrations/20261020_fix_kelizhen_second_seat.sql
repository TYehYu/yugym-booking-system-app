/* ① 柯麗貞 10/20 20:00 團課：第 2 個名額補扣 1 堂（2026-10-20 使用者指示「做」）

   使用者回報：「這邊不正確　應該要顯示用兩個點數」「意思是這個會員可以用同個方案的
   兩堂課預約同一堂　用兩堂課佔用兩個名額」。

   事實（查正式庫）：
     bookings BK-msqy9ewuvzx4  member_ids 有兩格 MEM-1869205EEA30
     seat_tickets 只有 "MEM-1869205EEA30#2"，第 1 格沒有
     ticket_logs 這一堂淨扣 1 堂，MTK-B549B087BF6B 餘額 8（應為 7）
     05:20 留下一筆 delta 0：「⚠ 已阻擋：這一堂在這張票上已經扣過 1 堂，不重複扣」

   根因：10/19 她是從會員端自己報名的第 1 格，fn_member_join_group 只寫
     member_ids 與 ticket_logs、**不寫 seat_tickets** → 今天櫃檯加第 2 格時
     _saveGroupMembers 的 _used 是空的 → 沒帶 multi → 撞護欄 → 名額加了、堂數沒扣。
   根因已於 20261020_member_join_group_seat_tickets.sql 修掉；
   前端那一半已上線（grpDeductedTickets，改問帳本而不是只問 seat_tickets）。

   ⚠ 只修這一筆。9/1 以後全掃過，另一筆同型的是羅書恆 9/03（BK-mshkvlfvpq8s），
     那堂早已簽到、當時那張票已用完且過期，使用者定案**不追**。 */
begin;

insert into ticket_logs (id,ticket_id,action,delta,booking_id,operator,note)
values (gen_short_id('LG-'),'MTK-B549B087BF6B','deduct',-1,'BK-msqy9ewuvzx4','SYS',
        '補扣：10/20 20:00 第 2 個名額（第 1 格由會員端自行報名、未記票券，'
        ||'加第 2 格時被「不重複扣」護欄擋掉，名額已在名單、堂數未扣）');

update member_tickets
   set sessions_remaining = sessions_remaining - 1,
       status = case when sessions_remaining - 1 <= 0 then 'used_up' else status end
 where id='MTK-B549B087BF6B';

-- 補記第 1 格用的票（名額鍵照前端 seatKeys()：第 1 格＝mid、第 2 格起＝mid#n）
update bookings
   set seat_tickets = coalesce(seat_tickets,'{}'::jsonb)
                      || jsonb_build_object('MEM-1869205EEA30','MTK-B549B087BF6B')
 where id='BK-msqy9ewuvzx4';

commit;

-- 驗算：剩餘應為 7、seat_tickets 應有兩個 MEM-1869205EEA30 的鍵
select t.sessions_total as 總堂, t.sessions_remaining as 剩餘, t.status,
       b.seat_tickets
  from member_tickets t, bookings b
 where t.id='MTK-B549B087BF6B' and b.id='BK-msqy9ewuvzx4';
