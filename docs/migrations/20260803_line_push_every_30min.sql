-- 2026-08-03 使用者指示（已套用正式庫）：
-- 「通知的時間統一改成前一天的同一時間，如果是明天 12 點上課就今天 12 點通知，
--   這樣讓每個客人都有 24 小時的時間準備，如果有要請假忘記跟教練說明的還可以盡早告知」
--
-- 原：pg_cron 每日台北 18:00（UTC 10:00）呼叫 line-push-daily，一次推整天。
-- 新：每 30 分鐘呼叫一次；Edge Function（line-push-daily v6）以「現在取 30 分鐘地板
--     ＋24 小時」為目標時段，只推該時段開課的課（半開區間 [slot, slot+30)，
--     容忍 cron 觸發漂移；非整/半點的零星課次落在區間內一樣推得到）。
-- 訊息同 v5（對外教練名、第 n/N 堂、倒數三堂續約提醒），另加一行
-- 「如需請假或調整，請盡早告知教練 🙏」。
--
-- 切換日（8/3）晚間的過渡：今天 18:00 舊排程已推過明天整天 → 明天 21:30 之後
-- 開課的課會多收到一次（舊＋新各一）；僅此一晚，之後不重複。
select cron.unschedule('line-push-daily-18');
select cron.schedule(
  'line-push-24h',
  '0,30 * * * *',
  $$
  select net.http_post(
    url := 'https://rlpiomzplckzqnqrvrwc.supabase.co/functions/v1/line-push-daily',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX',
      'apikey','sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX'
    ),
    body := '{}'::jsonb
  );
  $$
);
