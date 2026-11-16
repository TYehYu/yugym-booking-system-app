-- 影子卡（sibling_of）孤兒掃描：唯讀 SELECT。測試庫、正式庫皆可執行（正式庫僅限 SELECT，需照慣例先顯示 Project ID）。
-- 背景：bookings.sibling_of 沒有外鍵，鎖定原預約列擋不住「客戶端同時新增影子卡」。
-- 競態只會造成：調課後，原預約（已取消或已轉為待簽約）底下又出現一張未取消的影子卡（純外觀孤兒，不帶票、不帶帳）。
-- 本掃描找出這類資料；只輸出 id 與必要欄位，不輸出會員姓名。

-- S1：未取消的影子卡，其母卡已取消、或已不綁票（待簽約）
select c.id as child_id, c.sibling_of as parent_id, c.date, c.start_time,
       p.status::text as parent_status, (p.ticket_id is not null) as parent_has_ticket,
       coalesce(p.pending_contract, false) as parent_pending
  from bookings c
  join bookings p on p.id = c.sibling_of
 where c.sibling_of is not null
   and c.status::text is distinct from 'cancelled'
   and (p.status::text = 'cancelled' or p.ticket_id is null)
 order by c.date desc
 limit 200;

-- S2：母卡不存在的影子卡（斷鏈）
select c.id as child_id, c.sibling_of as parent_id, c.date, c.status::text as status
  from bookings c
 where c.sibling_of is not null
   and not exists (select 1 from bookings p where p.id = c.sibling_of)
 limit 200;

-- S3：影子卡帶了票或帳（不應發生；影子卡不得有 ticket_id 或 ticket_logs）
select c.id as child_id, c.ticket_id,
       (select count(*) from ticket_logs l where l.booking_id = c.id) as log_rows
  from bookings c
 where c.sibling_of is not null
   and (c.ticket_id is not null or exists (select 1 from ticket_logs l where l.booking_id = c.id))
 limit 200;
