/* 排程補發停課的 LINE 通知（2026-10-23，已套用）

   使用者人在歐洲，要求「台北時間 8:00 補發」。但 line-closeday 的授權是
   「呼叫者必須是管理員或主管」—— pg_cron 沒有人的身分，帶的是 publishable key，
   那支會回 AUTH.FORBIDDEN。

   不把 service_role 金鑰塞進 cron.job（那等於把最高權限寫在排程設定裡），
   改成**把授權本身存成一筆資料**：管理員下單時寫一列，排程只是「照著做」。
   排程拿不到這張表就什麼都發不出去，而這張表只有管理員寫得進去。
   line-closeday 在 scheduled 模式下，date／extDays 一律以那一列為準，
   body 給什麼都不算 —— 排程不能自己決定發什麼。

   ⚠ 一次性：done_at 填了就不再發。line-closeday 自己也會去重
     （同一天同一位只發一次，依據 notifications type='cday_line'），
     兩道各自獨立 —— 排程重跑、或有人同時按按鈕，都不會重複發給同一個人。

   搭配的排程（每 10 分鐘看一次有沒有到期的待辦，沒有就什麼都不做）：
     select cron.schedule('cday-line-send', '*/10 * * * *', $job$
       select net.http_post(
         url := 'https://rlpiomzplckzqnqrvrwc.supabase.co/functions/v1/line-closeday',
         headers := jsonb_build_object('Content-Type','application/json',
           'Authorization','Bearer <publishable key>','apikey','<publishable key>'),
         body := '{"scheduled":true}'::jsonb)
     $job$);
   實測：還沒到時間時回 {"ok":true,"scheduled":true,"skipped":"no_due_job"}。 */
create table if not exists public.cday_line_jobs (
  id          text primary key,
  close_date  date        not null,
  ext_days    int         not null default 0,
  run_after   timestamptz not null,
  created_by  text        not null,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  result      jsonb
);

alter table public.cday_line_jobs enable row level security;

grant select, insert, update, delete on public.cday_line_jobs to authenticated;
grant select, insert, update, delete on public.cday_line_jobs to service_role;
-- anon 不給：這張表沒有任何未登入要讀的理由

-- 只有管理員（主管也不行：這是「代替管理員對外發訊息」的授權憑據）
create policy cday_line_jobs_admin on public.cday_line_jobs
  for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

comment on table public.cday_line_jobs is
  '排程補發停課 LINE 通知的待辦；一列＝一次授權。排程讀它、發完填 done_at。';
