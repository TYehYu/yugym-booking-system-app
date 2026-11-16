-- 真實 RPC 測試後、清理前：列出「候選通知」供人工核對（唯讀 SELECT；只能對測試庫 kucvxpjatptfckhlxptj）。
-- 把 <RUN_START_ISO>、<RUNID> 換成本次的值（與夾具／清理檔相同）。
-- 核對後，把 id 以逗號串起來填進 06 清理檔的 <NOTIF_IDS>；一筆都沒有就填空字串。
-- 同時另列「測試期間出現、但不符合 RUNID 條件」的通知（預期 0；不為 0 代表有別的操作也在產生通知；清理不會刪它們，而且清理檔的保險檢查會因此中止，需人工處理後再清理）。
select id, recipient_type::text as recipient_type, created_at, left(title, 40) as title_head
  from notifications
 where recipient_type::text = 'desk' and id like 'NT-%'
   and created_at >= '<RUN_START_ISO>'::timestamptz
   and title like 'MVR測試會員-<RUNID>-%'
 order by created_at limit 100;

select count(*) as non_fixture_since_start
  from notifications
 where created_at >= '<RUN_START_ISO>'::timestamptz and title not like 'MVR測試會員-<RUNID>-%';
