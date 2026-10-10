-- 字軌自動同步排程（2026-10-10 使用者：「每兩個月我要上傳號碼　這個有辦法自動化嗎」）
--
-- 使用者兩個都要：畫面上一顆〔同步字軌〕手動按，加上這個排程自動跑。
-- 實際動作在 edge function ecpay-invoice 的 action=syncWords：
--   ① GetGovInvoiceWordSetting  財政部配給本統編哪幾段號碼
--   ② AddInvoiceWordSetting     把綠界還沒有的那幾段建進去
--   ③ UpdateInvoiceWordStatus   設成啟用
--
-- ⚠ 每天跑是刻意的：財政部哪一天放下一期的配號不固定，每天查一次才不會錯過。
--   沒有新配號時它只是兩次查詢、什麼都不會寫（已建過的用「同字軌＋同期別＋
--   號碼區間重疊」判斷，不會重建）。
-- ⚠ 只會建 FX。FS 是舊系統的字軌，白名單寫死在 edge function 裡，不從外面傳。
-- ⚠ 19:20 UTC ＝ 台北 03:20。cron.schedule 吃 UTC，這個庫其他排程也都是 UTC。
-- ⚠ <PUBLISHABLE_KEY> 照抄既有排程（line-daily-report 等）用的那一把 publishable key；
--   不要寫 service_role key 進 cron.job，那張表誰都查得到。

select cron.unschedule('ecpay-word-sync')
  where exists (select 1 from cron.job where jobname = 'ecpay-word-sync');

select cron.schedule('ecpay-word-sync', '20 19 * * *', $job$
  select net.http_post(
    url := 'https://rlpiomzplckzqnqrvrwc.supabase.co/functions/v1/ecpay-invoice',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <PUBLISHABLE_KEY>',
      'apikey','<PUBLISHABLE_KEY>'),
    body := '{"action":"syncWords","dryRun":false}'::jsonb)
$job$);
