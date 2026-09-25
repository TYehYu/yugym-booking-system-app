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

/* ══ GRANT 補寫（2026-09-25）══════════════════════════════════════════════
   Supabase 公告：自 2026/10/30 起 public schema 中**新建立的 table**
   不再自動取得 Data API 存取權限；migration 建立、preview branch、
   本機 supabase db reset 重建的表都必須明確 GRANT。

   這一段是**補寫**，不是修改：內容與正式庫目前的權限完全一致，
   對正式庫執行是 no-op。目的是讓「重建環境／db reset」跑完之後，
   權限與正式庫一樣，不會因為缺 GRANT 而 permission denied。
   ⚠ 一格都沒有放寬或收緊 —— 公告第 6 點：不要為了這次更新動既有 grants。
   ⚠ anon 那幾張是 baseline 時代留下的（Supabase 預設就給），
     靠 RLS policy 的 auth.uid() IS NOT NULL 擋著。**新表不要跟進**，
     範本見 _TEMPLATE_new_table.sql。 */

grant select, insert, update, delete on public.expenses to authenticated, service_role;
