-- 取消後票券仍被扣的「待查異常」清單（唯讀；上線後定期跑）
-- ⚠ 命中只代表「待查」：預約已取消、帳本在這張票上仍有淨扣課、且沒有標「取消未退」。可能原因很多（歷史匯入、舊前端兩步寫入、
--   手動調整、取消與扣堂競爭…），**新增的列不能直接證明是競爭**，要逐筆看帳本時間順序與操作人。
-- 2026-11-18 上線前基準（正式庫唯讀）：17 筆，皆為歷史資料（含 IMPB 匯入），本次發布前就存在；上線後只看「新增」的列再逐筆查。
-- 本版（階段 08＋新前端）上線後，櫃檯取消與扣堂已由伺服器鎖保護；仍會出現新增列的主要來源是：尚未更新的舊前端（兩步寫入）。
select b.id, b.date, b.start_time, n.ticket_id, n.net, b.cancelled_at, b.cancelled_by
  from bookings b
  join (select booking_id, ticket_id,
               sum(case when action::text='deduct' and coalesce(delta,0)<>0 then 1 when action::text='refund' then -1 else 0 end) as net
          from ticket_logs where booking_id is not null group by booking_id, ticket_id) n on n.booking_id=b.id and n.net>0
 where b.status::text='cancelled' and coalesce(b.refund_waived,false)=false
 order by b.cancelled_at desc nulls last;
