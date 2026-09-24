-- ══ 1V2 同行會員看得到那幾堂課（2026-09-23）══════════════════════════════
-- 談定的範圍之一：「新增進來的會員可以共同擁有這個方案的權益　包含查看課程預約」。
--
-- ⚠ 另開一條而不是改 bookings_select_shared_pool：policy 是 OR 的，新增一條
--   不會動到既有那條的行為（共享票那套完全不受影響），出事也只要 drop 這一條。
-- ⚠ 只給 SELECT。同行者**不能**拿這張票約課、不能改、不能取消 ——
--   他沒有付錢，那些是持票人的權利（使用者：「只有一位付錢、另一位跟著上」）。
-- ⚠ 不開 member_tickets 的讀取：他看得到「哪一天有課」就夠了，
--   剩幾堂、買多少錢是持票人的事。哪天畫面真的缺東西再補，先給最小權限。
create policy bookings_select_partner on bookings
  for select
  using (
    ticket_id is not null
    and exists (
      select 1 from member_tickets t
       where t.id = bookings.ticket_id
         and t.partner_id is not null
         and t.partner_id = (select current_member_id())
    )
  );
