-- 2026-08-04 使用者指示：「只要不是自己使用的圓形卡的預約都要顯示享」（已套用）
-- 共享票的圓形卡兩邊都要看到完整戳記。會員原本只能讀自己的預約，
-- 共享對象扣同一張票的堂讀不到 → 會員端圓形卡缺角、數字對不上。
-- 開放：掛在「我可使用的票」（我持有或共享給我）上的預約可讀；
-- 只多出同一個堂數池內的課，別人的其他資料照舊看不到。
create policy bookings_select_shared_pool on public.bookings for select using (
  ticket_id is not null and exists (
    select 1 from member_tickets t
    where t.id = bookings.ticket_id
      and ( t.member_id = current_member_id()
            or coalesce(t.shared_with,'[]'::jsonb) @> to_jsonb(array[current_member_id()]) )
  )
);
