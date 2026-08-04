-- 2026-08-04 讀取量優化第三批：變更日誌（已套用於正式庫）
--
-- 第二批（fn_table_sigs）做到「沒人改過就不抓表」。但只要有人動一筆（簽到、取消、
-- 售票），簽章就變了，下一次讀取仍是整張 bookings（約 5MB）重抓 —— 櫃檯忙起來
-- 幾乎每次換頁都會踩到。
--
-- 這張表由觸發器記下「哪張表的哪一列被改了」（只記表名與主鍵，不記內容），
-- 前端就能只把那幾列撈回來補進快取：
--   ① 問日誌：這張表在水位（fn_table_sigs 回傳的 _log）之後有哪些 row_id 動過
--   ② 只撈那些 id（走既有的主鍵索引，通常幾筆到幾十筆）
--   ③ 撈得到＝新增/更新 → 併進快取；撈不到＝已刪除 → 從快取移除
-- 任何一步不順（沒水位、讀不到日誌、超過 400 筆）前端都退回整表重抓。
--
-- RLS：只有員工端讀得到（會員端資料量本來就小，維持原本讀法）。
-- 保留 3 天，每小時清一次（前端超過保留期就退回整表重抓）。
create table if not exists public.change_log(
  seq    bigint generated always as identity primary key,
  tbl    text        not null,
  row_id text        not null,
  op     char(1)     not null,          -- I / U / D
  at     timestamptz not null default now()
);
create index if not exists change_log_at_idx on public.change_log(at);

create or replace function public.fn_log_change() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  insert into public.change_log(tbl,row_id,op)
  values (tg_table_name,
          coalesce((case when tg_op='DELETE' then old.id else new.id end), '')::text,
          left(tg_op,1));
  return null;   -- AFTER trigger，回傳值不影響原本的寫入
end $$;

do $$
declare t text;
  tabs text[] := array[
    'bookings','member_tickets','members','employees','ticket_logs','purchases',
    'attendance','shifts','notifications','purchase_applications','punch_requests',
    'member_link_requests','course_plans','ticket_types','contracts','contract_templates',
    'expenses','training_logs','exercises','venues','duty_slots','salary_templates',
    'salary_history','leave_settlements','staff_applications','reward_rules'];
begin
  foreach t in array tabs loop
    execute format('drop trigger if exists trg_change_log on public.%I', t);
    execute format('create trigger trg_change_log after insert or update or delete on public.%I
                    for each row execute function public.fn_log_change()', t);
  end loop;
end $$;

alter table public.change_log enable row level security;
drop policy if exists change_log_select_staff on public.change_log;
create policy change_log_select_staff on public.change_log for select using (is_any_staff());
revoke all on table public.change_log from anon, authenticated;
grant select on table public.change_log to authenticated;

select cron.schedule('change_log_prune','7 * * * *',
  $$delete from public.change_log where at < now() - interval '3 days'$$)
where not exists (select 1 from cron.job where jobname='change_log_prune');

-- 同日追加：fn_table_sigs 一併回傳日誌水位 _log，讓前端把「簽章」與「已套用到哪裡」
-- 記在同一個瞬間（見 20260804_fn_table_sigs.sql 的最新版本）。
