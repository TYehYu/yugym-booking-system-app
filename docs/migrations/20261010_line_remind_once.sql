-- 一次性的待辦提醒（2026-10-10 使用者：「好 幫我設提醒」）
--
-- 第一則：11/7 早上 09:00（台北）提醒自己上傳 115 年 9-10 月的 FS 空白發票。
--   舊系統 BookFast 的公告寫明「停用後加值中心不代為上傳前期空白字軌」，
--   他們 9 月底結束合作，所以那一組要自己到財政部平台傳，期限 11/1～11/10。
--   使用者 11/7 回國，所以排在 11/7。
--
-- Edge function：line-remind（訊息文字寫在函式裡的 REMINDERS，外面只能指定 key）
--   ⚠ 刻意不接任意文字：line-push-test 就是因為「可以發任意訊息」在 2026-07-25
--     被停成空殼，不要把那個洞開回來。
--   ⚠ 函式裡有 until='2026-11-10'：`0 1 7 11 *` 每年都會跡一次，靠那個日期擋掉，
--     明年不會再發一則過期的提醒。所以這個 job 不刪也不會亂發。
-- ⚠ <PUBLISHABLE_KEY> 照抄既有排程用的那一把 publishable key。

select cron.schedule('remind-invoice-blank-fs', '0 1 7 11 *', $job$
  select net.http_post(
    url := 'https://rlpiomzplckzqnqrvrwc.supabase.co/functions/v1/line-remind',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <PUBLISHABLE_KEY>',
      'apikey','<PUBLISHABLE_KEY>'),
    body := '{"key":"invoice-blank-fs"}'::jsonb)
$job$);
