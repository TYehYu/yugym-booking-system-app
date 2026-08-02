-- 2026-07 以前的薪資改用匯入紀錄（2026-08-02 使用者指示）
--   「因為系統從 7 月才正式開始使用，6 月以前的薪資可以用我匯入的這個內容嗎」
--   「6 月份的就不用列公式了」「單純紀錄課堂數、值班數、續約數、實領薪資」
--
-- 六月以前系統裡沒有預約與打卡資料，任何公式算出來的都是憑空生出來的數字，
-- 所以那些月份直接顯示這張表的內容，不重新計算（見 index.html 的 SYS_PAY_FROM）。
create table if not exists salary_history (
  id       text primary key,          -- emp_id|YYYY-MM
  emp_id   text not null,
  ym       text not null,             -- YYYY-MM
  net      numeric,                   -- 實領薪資
  pt       numeric,                   -- 教練課堂數
  grp      numeric,                   -- 團體課堂數
  duty     numeric,                   -- 值班時數
  renew    numeric,                   -- 續約張數
  massage  numeric,                   -- 運動按摩堂數
  grade    text,                      -- 當時職等（老闆／店長／正職／兼職／合作／工讀）
  source   text,                      -- 資料來源分頁
  note     text,                      -- 推算或待確認的說明
  created_at timestamptz default now()
);
create index if not exists salary_history_emp_ym on salary_history(emp_id, ym);
alter table salary_history enable row level security;
drop policy if exists sh_read on salary_history;
drop policy if exists sh_self on salary_history;
drop policy if exists sh_write on salary_history;
create policy sh_read  on salary_history for select using (is_staff_desk() or is_admin());
create policy sh_self  on salary_history for select using (emp_id = current_employee_id());
create policy sh_write on salary_history for all using (is_admin()) with check (is_admin());

-- 資料來源：使用者提供的「有肌訓練 薪資-4.xlsx」
--   ・RANDY / SANDY / MANGO / BARRY / ZOE / 小曾 六人 → 各自的 PAY 分頁（2023–2026/06，實領為原始值）
--   ・ANN / ROCKY / ERIC / 羅威 四人 → 薪資總表（2026/01–06；沒有 PAY 分頁）
--     這四人沒有勞健保扣抵，薪資總表上的金額就是實領。
--     （初次匯入時曾依「薪資設定」分頁把 ERIC、羅威當工讀扣 735，
--       2026-08-02 使用者回覆「羅威跟 eric 不用扣勞健保」→ 已加回並清掉 note。）
--   ・「境妤老師」（2026/01–03 共 8,000）未匯入 —— 外聘老師，不建員工資料
--     （2026-08-02 使用者確認）。之後再看到這個名字不用再問一次。
-- 共 205 筆。
