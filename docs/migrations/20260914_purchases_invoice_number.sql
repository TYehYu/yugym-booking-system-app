-- 2026-09-14 purchases 補 invoice_number 欄位
-- 使用者：「那個 purchases 的欄位補一下」
--
-- 背景：0902 的前端早就在寫這個欄位了（invIssueForPurchase 開立成功後
--   dbPut('purchases', {...invoice_type:'ecpay', invoice_number:rd.InvoiceNo})，
--   index.html 13928 與 64103 兩處），但**欄位從來沒建**。
--   兩處都包在 try{}catch(_){} 裡，所以 PostgREST 退件是靜默的 —— 不炸、不擋銷售，
--   症狀只有一個：「今日營收」那一頁的發票號欄永遠空白
--   （index.html 21872 讀 _dayPur 的 p.invoice_number、21882 讀 p.invoice_number）。
--   0914 電子發票正式上線、開始開真發票之後，這個空白櫃檯馬上就會看到。
--
-- ⚠ 發票號碼的**權威來源仍是 invoices 表**（那張表一直是對的）。
--   purchases.invoice_number 只是給「今日營收」列表用的冗餘欄位，
--   讓它不必為了一個號碼去 join 另一張表。
--
-- ⚠ LEAN_DROP 只設定 bookings／contracts，purchases 不在其中，
--   所以新欄位 dbGetAll 會照常撈回來，前端不必改。
-- ⚠ purchases 是既有表，trg_change_log 與 fn_table_sigs 都已經有了，不必再加。
--   但加欄位會改變每一列的雜湊 → 簽章變動 → 各客戶端會重抓一次 purchases
--   （約 380 筆，很小，一次性）。

alter table public.purchases
  add column if not exists invoice_number text;

-- 回填：把已開立的發票號碼補回 purchases。
-- 2026-09-14 當下 invoices 是 0 筆（新系統還沒開過正式發票，上線測試那張
-- 刻意直接打 Edge Function、沒有寫表），所以這句現在是 no-op；
-- 留著是為了日後若重跑本 migration，已開立的發票不會漏掉。
update public.purchases p
   set invoice_number = i.invoice_number
  from public.invoices i
 where i.purchase_id = p.id
   and i.status = 'issued'
   and i.invoice_number is not null
   and p.invoice_number is null;
