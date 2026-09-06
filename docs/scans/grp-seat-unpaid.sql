-- ══ 團課名額「有沒有扣到票」逐名額掃描（2026-09-06）══════════════════════════
--
-- 用途：找出進了名單卻沒有扣課的團課名額（畫面上的紅虛線「需補票」）。
--       依 0820 定案「團課名額一律要扣到票才進名單」，正常情況應該掃不到東西。
--
-- ⚠ 為什麼不能逐 booking 掃：團課一筆 booking 裝多個名額（member_ids 陣列），
--   而且 bookings.ticket_id 對團課**永遠是空的** —— 票的歸屬記在 seat_tickets
--   與 ticket_logs。拿 ticket_id is null 當條件會全部命中，數字毫無意義。
--   （0906 就是這樣掃出一個假警報，見 yugym-grp-seat-paid-rule 的教訓。）
--
-- 判準與程式同一套（seatTicketOf）：
--   ① seat_tickets 有這個名額鍵 → 有票
--   ② 沒有就退回「這筆預約下該會員還有淨扣課的票」
--      （deduct 但排除 delta=0 的補連結，減掉 refund，淨值 > 0）
--   ①② 都不成立 → 需補票
--
-- 名額鍵規則見 seatKeys()：member_ids 依序展開，同一人第 2 個位子加 '#2'。
--
-- 0906 基準結果：未來 109 個名額 0 筆、0820~0905 共 96 個 0 筆；
--                0820 之前 442 筆全落在 5–7 月遷移期（依遷移結案決議不碰）。
-- ═══════════════════════════════════════════════════════════════════════════

with g as (
  select b.*
  from bookings b
  where b.category = '小班肌力'
    and b.status in ('booked','checked_in','completed','no_show')
    and jsonb_typeof(b.member_ids) = 'array'
    and jsonb_array_length(b.member_ids) > 0
),
seats as (
  select g.id as bid, g.date, g.start_time, g.status, g.seat_tickets, g.import_ref,
         e.mid,
         row_number() over (partition by g.id, e.mid order by e.ord) as occ
  from g, lateral jsonb_array_elements_text(g.member_ids) with ordinality as e(mid, ord)
),
keyed as (
  -- 第 1 個位子＝純 member id，第 2 個以後加 #n
  select s.*, case when s.occ = 1 then s.mid else s.mid || '#' || s.occ end as skey
  from seats s
),
judged as (
  select k.*,
    -- ⚠ coalesce 不能省：seat_tickets 是 NULL 時 `? key` 回 NULL，
    --   三值邏輯會讓那幾列從「有票」與「需補票」兩邊的 count 同時消失。
    coalesce(k.seat_tickets ? k.skey, false) as has_seat_tk,
    exists (
      select 1
      from ticket_logs l
      join member_tickets t on t.id = l.ticket_id and t.member_id = k.mid
      where l.booking_id = k.bid
      group by l.ticket_id
      having sum(case when l.action = 'deduct' and coalesce(l.delta,0) <> 0 then 1
                      when l.action = 'refund' then -1
                      else 0 end) > 0
    ) as has_net_deduct
  from keyed k
)
select j.date, j.start_time, j.bid, j.mid, m.name, j.skey,
       j.import_ref is not null as from_import
from judged j
left join members m on m.id = j.mid
where not j.has_seat_tk and not j.has_net_deduct
  and j.date >= '2026-08-20'      -- 0820 之前是遷移期，沒有帳可查，不列
order by j.date, j.start_time;


-- ── 附：同一位會員在同一堂佔多個名額時的漏扣檢查 ────────────────────────────
-- 上面的 ②「淨扣課」是**逐會員**判斷的，所以「兩個名額只扣到一堂」會被判成有票。
-- 這一段補掉那個縫：名額數 > 淨扣課數 就列出來。
-- ⚠ 共享票會假陽性：票主是另一個 member_id，這裡的 join 抓不到（例：林政緯分享給林繼霖）。
--   逐筆看到人名對不上時先確認是不是共享票，再判斷。
-- 0906 用這一段抓到羅書恆 8/27 與 9/03 各漏扣 1 堂（已校正 LG-FIX-lsh-20260906）。

with g as (
  select b.* from bookings b
  where b.category = '小班肌力'
    and b.status in ('booked','checked_in','completed','no_show')
    and jsonb_typeof(b.member_ids) = 'array'
    and b.date >= '2026-08-20'
),
seats as (
  select g.id as bid, g.date, e.mid
  from g, lateral jsonb_array_elements_text(g.member_ids) as e(mid)
),
per as (
  select bid, date, mid, count(*) as seat_n,
    (select coalesce(sum(case when l.action = 'deduct' and coalesce(l.delta,0) <> 0 then 1
                              when l.action = 'refund' then -1
                              else 0 end), 0)
     from ticket_logs l
     join member_tickets t on t.id = l.ticket_id and t.member_id = seats.mid
     where l.booking_id = seats.bid) as net_deduct
  from seats
  group by bid, date, mid
)
select p.date, p.bid, m.name, p.seat_n, p.net_deduct
from per p
left join members m on m.id = p.mid
where p.seat_n > p.net_deduct
order by p.date;
