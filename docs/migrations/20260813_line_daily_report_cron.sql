-- 2026-08-13（已於當日套用正式庫）
-- 使用者指示：每天 22:00 LINE 通知——
-- ①店長＋管理員：今日營收（含現金/匯款拆分）、今日教練課堂數、今日團課人數
-- ②當天有上課紀錄的教練：自己當天的課堂數（店長同時有上課則附在戰報後面，不另發）
-- Edge Function：line-daily-report（口徑：堂數＝已簽到/已完成；團課人次不含請假；
--   營收＝當日收款 deal_amount 合計、split 用 pay_split 拆現金/匯款；
--   body {debug:true, date:'YYYY-MM-DD'} 試算不發訊）
-- 額度估算：每天約 +5~6 則（戰報 2＋教練約 3.6）≈ +170 則/月，
--   加原有 ~700–950 則/月，仍遠低於中用量 3,000。
select cron.schedule('line-daily-report','0 14 * * *', $$
  select net.http_post(
    url := 'https://rlpiomzplckzqnqrvrwc.supabase.co/functions/v1/line-daily-report',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX',
      'apikey','sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX'),
    body := '{}'::jsonb)
$$);

-- 2026-08-13 追加（同日）：
-- ① 全部 LINE 推播訊息抬頭 YUGYM → 有肌訓練（line-push-daily v17、line-member-auth v15、line-daily-report v2）
-- ② 每天 22:30 忘記下班打卡提醒（Edge Function line-punch-remind）：
--    今天有 clock_in 沒 clock_out 的員工 → LINE 提醒補打卡＋「👀 老闆在盯著你」；
--    未綁定 LINE 的漏打卡者寫櫃檯通知。body {debug:true, date} 試算模式。
select cron.schedule('line-punch-remind','30 14 * * *', $$
  select net.http_post(
    url := 'https://rlpiomzplckzqnqrvrwc.supabase.co/functions/v1/line-punch-remind',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX',
      'apikey','sb_publishable_HXJH0NSDKBYaiFamrN_mpw_U6gH_MdX'),
    body := '{}'::jsonb)
$$);

-- 2026-08-14 追加：line-push-daily v18 —— 自主訓練的開課提醒加「📍 場地：X」
--   （venue_unit 為主：treadmill→跑步機、group→教室、multi→多功能區；
--    舊匯入資料從 note 的「教室:」段撈，與前端 selfVenueLabel 同一套判讀，
--    差別是預設多功能區也明白寫出來）。已用 debug 模式對 8/15–8/17 三種場地實測。
