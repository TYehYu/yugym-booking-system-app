-- 2026-08-08 使用者定案：教練課／友善教練課的票券發放規則
--
-- 「合約回傳審核的機制，如果是『紙本合約』就不用再經過審核，因為客戶已經看過紙本合約
--   並完成匯款才會走到儲值這一步。審核是因為客戶必須要等我們上傳電子合約，看過並簽名
--   回傳系統，再確認是否已經匯款的關係。」
--
-- 所以只有「電子合約」那條路要等：合約簽回來＋確認收到款項，才發票券。
-- 紙本維持現狀（當場簽、當場發）。
--
-- 待發放的那一筆先存在這裡：把賣票當下算好的所有數字（堂數、分期、折抵券、業績歸屬…）
-- 原封不動存成 payload，審核通過時照樣發，不用櫃檯重填一次。
create table if not exists public.ticket_grant_requests (
  id            text primary key,
  member_id     text,
  member_name   text,
  plan_name     text,
  sessions      integer,
  amount        numeric,          -- 應收金額（審核視窗要大字標出來的那個數字）
  payload       jsonb,            -- 賣票當下算好的完整發放內容
  contract_id   text,             -- 對應的電子合約（等它 signed_at 有值才算簽好）
  sign_type     text,             -- 目前一律 'remote'（紙本不進審核）
  status        text not null default 'pending',   -- pending / issued / cancelled
  requested_by  text,
  requested_at  timestamptz default now(),
  reviewed_by   text,
  reviewed_at   timestamptz,
  ticket_id     text,             -- 審核通過後發出來的票券
  issued_at     timestamptz,      -- 30 分鐘完整退回從這一刻起算
  cancel_reason text,
  note          text,
  created_at    timestamptz default now()
);

create index if not exists idx_tgr_status on public.ticket_grant_requests(status);
create index if not exists idx_tgr_member on public.ticket_grant_requests(member_id);

alter table public.ticket_grant_requests enable row level security;

drop policy if exists tgr_select on public.ticket_grant_requests;
create policy tgr_select on public.ticket_grant_requests
  for select using (is_any_staff());

drop policy if exists tgr_write on public.ticket_grant_requests;
create policy tgr_write on public.ticket_grant_requests
  for all using (is_staff_desk()) with check (is_staff_desk());

-- 增量同步：新表一律要掛 change_log 觸發器（見 CLAUDE.md）
drop trigger if exists trg_change_log on public.ticket_grant_requests;
create trigger trg_change_log after insert or delete or update
  on public.ticket_grant_requests for each row execute function fn_log_change();

comment on table public.ticket_grant_requests is
  '待審核的票券發放（只有電子合約走這條）：合約簽回來＋確認收款後才真的發票券（2026-08-08）';

-- ── 新表要一併列進 fn_table_sigs，否則前端快取的簽章校驗看不到它的變動（見 CLAUDE.md）──
do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_table_sigs';
  if position('''staff_applications'',''reward_rules''' in d) = 0 then
    raise exception 'fn_table_sigs 的表清單已不是預期的樣子，請人工確認';
  end if;
  d := replace(d, '''staff_applications'',''reward_rules''',
                  '''staff_applications'',''reward_rules'',''ticket_grant_requests''');
  execute d;
end $do$;

-- ⚠ 2026-08-08 補：光有 RLS policy 不夠，還要 grant。
-- policy 管的是「這一列給不給看」，grant 管的是「這個角色能不能碰這張表」——
-- 少了 grant，authenticated 連 SELECT 都會被擋成 42501（使用者回報：切導覽列一直跳權限不足）。
grant select, insert, update, delete on public.ticket_grant_requests to authenticated;
grant select, insert, update, delete on public.ticket_grant_requests to service_role;
