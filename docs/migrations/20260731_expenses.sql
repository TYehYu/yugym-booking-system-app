/* 本月其他支出（2026-07-31 使用者指示：財務要有一個表格可以填房租、水電等額外開銷）

   營運分析的「利潤」原本刻意只算「課堂這門生意」（銷課金額 − 教練薪資），
   不含房租水電等固定成本 —— 那些成本記在這裡。
   ⚠ 同日使用者定案：這些支出要算進本月利潤，見 index.html 的 PAGES.dashboard。 */
create table if not exists public.expenses (
  id          text primary key,
  ym          text not null,                 -- YYYY-MM，翻月查詢用
  date        date,                          -- 實際發生日（可空）
  category    text not null,                 -- 房租／水電／網路／清潔／耗材／設備／稅務規費／其他
  amount      numeric not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text
);
create index if not exists expenses_ym_idx on public.expenses(ym);

alter table public.expenses enable row level security;

drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses
  for all using (is_admin()) with check (is_admin());
