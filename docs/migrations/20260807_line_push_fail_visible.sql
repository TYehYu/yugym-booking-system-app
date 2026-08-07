-- 2026-08-07　「今天 20:00 的團課，昨天系統沒有通知耶」
--
-- 查證：
--   ・pg_cron（line-push-24h，每 30 分鐘、UTC 0–13 ＝台北 08:00–21:30）8/06 12:00 UTC
--     ＝台北 20:00 那一輪有正常執行（cron.job_run_details runid 3087 succeeded），
--     鎖定的正是「24 小時後 20:00–20:30」的課。
--   ・該堂的兩位會員（周莉純、許佳慈）都有 line_user_id、line_notify 也是 true，
--     所以不是被 skip_no_line / skip_opt_out 跳過。
--   ・當天的推播結果已被 net._http_response 的保留期（約 6 小時）清掉，查不到；
--     但同一支函式今天多次回報 failed:1，而那幾堂的會員全部都綁了 LINE。
--
-- 結論：LINE 的 push 對「用 LIFF 登入過、但沒有把官方帳號加為好友」的人會直接被拒。
--       失敗只在回應 JSON 裡回一個數字 failed:N —— 櫃檯與會員都不會知道，
--       於是就變成「昨天沒收到通知」。真正的洞是**失敗沒有留下任何紀錄**。
--
-- 對策（使用者定案「都改」）：
--   ① Edge Function line-push-daily v8：同一人只發一則（團課同一個會員佔 2–3 個名額時，
--      member_ids 會重複同一個 id，原本逐個推 → 客人一次收到 2–3 則一樣的提醒）。
--   ② v8：推播失敗時寫一筆櫃檯通知（notifications, type='line_push_fail'），
--      並把時間與原因記在 members.line_push_failed_at / line_push_error；
--      下次推成功就自動清掉旗標。
--   ③ 前端 index.html：會員資料頁的「LINE 通知」旁標紅「⚠ 提醒送不到」，
--      滑過去看得到原因與日期，櫃檯可當場請客人加好友。
--
-- 本檔為欄位 migration 的備查（已透過 Supabase migration
-- `members_line_push_failure_flags` 套用到正式庫）。
alter table public.members
  add column if not exists line_push_failed_at timestamptz,
  add column if not exists line_push_error text;

comment on column public.members.line_push_failed_at is '最後一次 LINE 上課提醒推播失敗的時間（成功一次就清空）';
comment on column public.members.line_push_error is '最後一次失敗的原因（LINE API 回應摘要）；最常見是尚未加入官方帳號好友';
