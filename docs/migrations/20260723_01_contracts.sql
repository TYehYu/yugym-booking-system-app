-- ══════════════════════════════════════════════════════════════════════
-- 2026-07-23　簽約功能（合約範本 + 簽約紀錄）
--
-- 使用者定案：
--   ① 電子簽約＝**現場平板簽**（櫃台畫面上讓會員手寫簽名），會員端只查看得到；
--   ② 合約條款＝**系統內建範本、後台可編輯**（簽約時以變數帶入會員／方案／金額…）。
--
-- 套用狀態：測試庫 kucvxpjatptfckhlxptj（MCP 套用）／正式庫 rlpiomzplckzqnqrvrwc（待執行）
-- 回退：drop table public.contracts; drop table public.contract_templates;
-- ══════════════════════════════════════════════════════════════════════

-- ── 合約範本（後台可編輯；預留多份，目前用 CT-DEFAULT 一份）──
create table if not exists public.contract_templates(
  id          text primary key,
  name        text not null,
  body        text not null default '',
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.contract_templates enable row level security;

drop policy if exists contract_templates_read on public.contract_templates;
create policy contract_templates_read on public.contract_templates
  for select using (is_any_staff());

-- 範本只有管理員能改（櫃台簽約時只需要讀）
drop policy if exists contract_templates_admin on public.contract_templates;
create policy contract_templates_admin on public.contract_templates
  for all using (is_admin()) with check (is_admin());

-- ── 簽約紀錄 ──
--  body_snapshot＝簽約當下的合約全文（範本日後被編輯，舊約仍看得到當時條款）
--  signature＝電子簽名 base64 PNG（紙本為 null）
create table if not exists public.contracts(
  id            text primary key,
  member_id     text not null,
  member_name   text,
  plan_name     text,
  sessions      integer,
  amount        numeric,
  expire_date   date,
  sign_type     text not null default 'paper',   -- electronic | paper
  signature     text,
  body_snapshot text,
  ticket_id     text,
  purchase_id   text,
  staff_id      text,
  note          text,
  signed_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists contracts_member_idx on public.contracts(member_id);
create index if not exists contracts_signed_idx on public.contracts(signed_at desc);
alter table public.contracts enable row level security;

-- 員工（管理員/櫃台/教練）可讀寫；會員只能讀自己的
drop policy if exists contracts_staff_all on public.contracts;
create policy contracts_staff_all on public.contracts
  for all using (is_any_staff()) with check (is_any_staff());

drop policy if exists contracts_member_read on public.contracts;
create policy contracts_member_read on public.contracts
  for select using (member_id = current_member_id());

-- ── 內建預設範本（可在「系統設定 → 合約範本」修改）──
insert into public.contract_templates(id,name,body) values (
  'CT-DEFAULT','課程購買合約',
$tpl$YUGYM 有肌訓練　課程購買合約

立約人（以下簡稱「會員」）：{{會員姓名}}
聯絡電話：{{會員電話}}
簽約日期：{{簽約日期}}

一、購買內容
　　方案名稱：{{方案名稱}}
　　課程堂數：{{堂數}} 堂
　　課程效期：{{效期}}
　　購買金額：新台幣 {{金額}} 元整
　　付款方式：{{付款方式}}

二、課程使用
　　1. 會員須於效期內完成課程，逾期未使用之堂數不予保留、不予退費。
　　2. 每次上課採預約制，預約成立即扣除一堂；於課程開始 24 小時前取消者退回該堂，
　　　 24 小時內取消或未到者，該堂不予退回。
　　3. 課程僅限本人使用，不得轉讓他人。

三、退費
　　1. 會員因故無法繼續上課，得檢附證明申請退費，退費金額依已使用堂數按原價計算後之餘額辦理。
　　2. 已使用之優惠、贈品或折抵券價值，於退費時一併扣除。

四、其他
　　1. 會員應據實填寫個人健康狀況，並於身體不適時主動告知教練。
　　2. 本場館依個人資料保護法蒐集、處理及利用會員個人資料，僅用於課程服務與聯繫。
　　3. 本合約未盡事宜，依中華民國相關法令及本場館公告規定辦理。

會員簽名：$tpl$
) on conflict (id) do nothing;
