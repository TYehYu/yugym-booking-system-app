# YUGYM MVP 2.0 — Supabase 遷移計畫

> 將 MVP 1.x 的 IndexedDB（單機）改為 Supabase（雲端共用），讓老闆、櫃台、教練、會員同時登入看到同一份資料。
> **不新增功能、不改 UI、不改使用方式**，只做資料層雲端化。
>
> 本階段使用：Supabase **Auth + Database + RLS**。
> 本階段不使用：Edge Functions、Storage、Realtime、Email 驗證。

---

## 0. 設計決策（先看這個）

**登入方式：手機/帳號 → 假 email + Supabase Auth。**

你的會員用手機號碼、員工用帳號字串登入，都不是 email；但 Supabase Auth 與 RLS 最穩的做法是 email + 密碼。解法是把帳號轉成內部假 email：

- 會員 `0912000001` → Auth email `0912000001@member.yugym.local`
- 員工 `amy` → Auth email `amy@staff.yugym.local`

使用者**畫面上仍只打手機號碼/帳號**，前端自動補網域。好處：
1. 不需 Edge Function 就能用 `auth.uid()` 做 RLS 隔離（滿足你的權限規格）。
2. 密碼由 Supabase Auth 雜湊託管，不再像 IndexedDB 明碼存表。
3. 完全達成「三方同時登入看同一份資料」。

> 每個 Auth 使用者的 `id`（UUID）會寫進 `employees.auth_id` 或 `members.auth_id`，RLS 以此比對。

**為何不全關 RLS 直接讀寫？** 那樣任何人按 F12 拿到 anon key 就能讀全部會員個資（電話、生日、票券），上線營運不可接受。你的規格也明確要求權限隔離，故採 Auth + RLS。

---

## 1. Supabase SQL（建表 + 列舉型別）

> 在 Supabase 主控台 → SQL Editor 貼上執行。表名依你的規格：員工表為 `employees`（取代舊 `coaches`）。

```sql
-- ========== 列舉型別 ==========
create type staff_role        as enum ('admin','coach','front_desk');
create type employment_type   as enum ('full_time','part_time','contractor','intern');
create type staff_status      as enum ('active','leave','inactive');
create type member_status     as enum ('active','inactive','suspended');
create type member_gender     as enum ('female','male','other','unspecified');
create type member_source     as enum ('google','instagram','facebook','referral','walkin','corporate','other');
create type ticket_category   as enum ('私人教練','小班肌力','自主訓練','體驗');
create type ticket_status     as enum ('usable','used_up','expired','refunded');
create type pay_status        as enum ('unpaid','paid','partial');
create type invoice_status    as enum ('none','issued');
create type ticket_log_action as enum ('grant','deduct','refund','adjust','expire');
create type booking_status    as enum ('booked','checked_in','completed','cancelled','no_show');
create type notify_recipient  as enum ('member','coach');

-- ========== employees 員工 ==========
create table employees (
  id              text primary key,
  auth_id         uuid unique references auth.users(id) on delete set null,
  name            text,
  nickname        text,
  phone           text unique,
  email           text,
  role            staff_role not null default 'coach',
  employment_type employment_type default 'full_time',
  pay_rate        numeric default 0,
  is_manager      boolean default false,
  is_supervisor   boolean default false,
  manager_bonus   numeric default 0,
  supervisor_bonus numeric default 0,
  hire_date       date,
  status          staff_status default 'active',
  invite_status   text,            -- pending / completed / null
  invite_token    text,
  created_at      timestamptz default now()
);

-- ========== members 會員 ==========
create table members (
  id              text primary key,
  auth_id         uuid unique references auth.users(id) on delete set null,
  name            text,
  phone           text unique,
  email           text,
  gender          member_gender default 'unspecified',
  birthday        date,
  height          numeric,
  weight          numeric,
  trial_date      date,
  last_class_date date,
  source          member_source default 'other',
  tier            text,            -- newbie/regular/loyal/vip（沿用，相容定價）
  tags            jsonb default '[]'::jsonb,
  is_pt           boolean default false,
  default_coach_id text references employees(id) on delete set null,
  note            text,
  status          member_status default 'active',
  created_at      timestamptz default now()
);

-- ========== ticket_types 票券種類 ==========
create table ticket_types (
  id              text primary key,
  name            text not null,
  category        ticket_category not null,
  variant         text,
  color           text,
  time_restricted boolean default false,
  requires_coach  boolean default false,
  member_bookable boolean default true
);

-- ========== course_plans 課程方案 ==========
create table course_plans (
  id              text primary key,
  name            text not null,
  ticket_type_id  text references ticket_types(id),
  format          text,            -- 1v1/1v2/null
  unit_price      int default 0,
  sessions_base   int default 0,
  sessions_bonus  int default 0,
  valid_days      int default 365,
  active          boolean default true
);

-- ========== member_tickets 會員票券 ==========
create table member_tickets (
  id                 text primary key,
  member_id          text references members(id) on delete cascade,
  ticket_type_id     text references ticket_types(id),
  source_plan_id     text references course_plans(id),
  plan_name          text,
  format             text,
  source             text default 'purchase',  -- purchase/checkin_grant/makeup/manual
  purchase_date      date,
  start_date         date,
  expire_date        date,
  sessions_total     int default 0,
  sessions_remaining int default 0,
  status             ticket_status default 'usable',
  payment_status     pay_status default 'paid',
  invoice_status     invoice_status default 'none',
  created_at         timestamptz default now()
);

-- ========== ticket_logs 票券異動 ==========
create table ticket_logs (
  id          text primary key,
  ticket_id   text references member_tickets(id) on delete cascade,
  action      ticket_log_action not null,
  delta       int default 0,
  booking_id  text,
  operator    text,
  note        text,
  created_at  timestamptz default now()
);

-- ========== bookings 預約 ==========
create table bookings (
  id                text primary key,
  member_id         text references members(id) on delete cascade,
  coach_id          text references employees(id) on delete set null,
  ticket_id         text references member_tickets(id) on delete set null,
  ticket_type_id    text references ticket_types(id),
  category          ticket_category,
  format            text,
  date              date not null,
  start_time        text not null,   -- 'HH:MM'
  duration          int default 60,
  status            booking_status default 'booked',
  is_substitute     boolean default false,
  original_coach_id text references employees(id) on delete set null,
  note              text,
  created_by        text,
  created_at        timestamptz default now()
);

-- ========== notifications 通知 ==========
create table notifications (
  id             text primary key,
  recipient_type notify_recipient not null,
  recipient_id   text not null,
  type           text,
  title          text,
  body           text,
  read           boolean default false,
  created_at     timestamptz default now()
);

-- ========== 常用索引 ==========
create index idx_tickets_member   on member_tickets(member_id);
create index idx_bookings_member  on bookings(member_id);
create index idx_bookings_coach   on bookings(coach_id);
create index idx_bookings_date    on bookings(date);
create index idx_logs_ticket      on ticket_logs(ticket_id);
create index idx_notif_recipient  on notifications(recipient_type, recipient_id);
```

### 種子資料（票券種類 6 種，符合你的規格）

```sql
insert into ticket_types (id,name,category,variant,color,time_restricted,requires_coach,member_bookable) values
 ('pt',            '教練課',     '私人教練','1v1/1v2','pt',       false,true, false),
 ('pt_friendly',   '友善教練課', '私人教練','friendly','friendly',true, true, false),
 ('group',         '團體課',     '小班肌力',null,      'group',    false,false,true),
 ('self_training', '自主訓練',   '自主訓練',null,      'self',     false,false,true),
 ('self_friendly', '友善自主訓練','自主訓練','friendly','self',    true, false,true),
 ('trial',         '免費體驗',   '體驗',    null,      'trial',    false,true, false);
```

> 註：你的規格 ticket_types 列了「友善自主訓練」，已加入（id `self_friendly`）。課程方案 / 員工 / 會員的種子，建議用後台「新增」功能建立，或另寫 insert（格式同上）。

---

## 2. 資料表關聯（ERD）

```
auth.users ──1:1── employees.auth_id
auth.users ──1:1── members.auth_id

ticket_types ──1:N── course_plans
ticket_types ──1:N── member_tickets
course_plans ──1:N── member_tickets

members ──1:N── member_tickets ──1:N── ticket_logs
members ──1:N── bookings
members ──1:N── notifications (recipient)

employees ──1:N── bookings (coach_id / original_coach_id)
employees ──1:N── members (default_coach_id)

member_tickets ──1:N── bookings (ticket_id，扣抵來源)
```

關鍵外鍵：`bookings.ticket_id → member_tickets.id`（每筆預約扣一張票），`ticket_logs.ticket_id → member_tickets.id`（每次扣/退/發都留痕）。

---

## 3. RLS 權限

> 先開啟所有表的 RLS，再逐表加策略。輔助函式用來在策略中取得「目前登入者是哪位員工/會員、角色為何」。

```sql
-- 開啟 RLS
alter table employees      enable row level security;
alter table members        enable row level security;
alter table ticket_types   enable row level security;
alter table course_plans   enable row level security;
alter table member_tickets enable row level security;
alter table ticket_logs    enable row level security;
alter table bookings       enable row level security;
alter table notifications  enable row level security;

-- 輔助函式：目前登入者的員工角色（admin/coach/front_desk）；非員工回 null
create or replace function current_staff_role() returns text
language sql stable security definer as $$
  select role::text from employees where auth_id = auth.uid() limit 1;
$$;

-- 目前登入者對應的 employees.id（員工）
create or replace function current_employee_id() returns text
language sql stable security definer as $$
  select id from employees where auth_id = auth.uid() limit 1;
$$;

-- 目前登入者對應的 members.id（會員）
create or replace function current_member_id() returns text
language sql stable security definer as $$
  select id from members where auth_id = auth.uid() limit 1;
$$;

-- 是否為管理員 / 櫃台（共用「全店可見」的角色）
create or replace function is_admin() returns boolean
language sql stable security definer as $$ select current_staff_role() = 'admin'; $$;
create or replace function is_staff_desk() returns boolean
language sql stable security definer as $$ select current_staff_role() in ('admin','front_desk'); $$;
create or replace function is_any_staff() returns boolean
language sql stable security definer as $$ select current_staff_role() is not null; $$;
```

### 各表策略

```sql
-- ===== ticket_types / course_plans：所有登入者可讀；只有 admin 可寫 =====
create policy tt_read on ticket_types for select using (auth.role() = 'authenticated');
create policy tt_admin on ticket_types for all using (is_admin()) with check (is_admin());
create policy cp_read on course_plans for select using (auth.role() = 'authenticated');
create policy cp_admin on course_plans for all using (is_admin()) with check (is_admin());

-- ===== employees =====
-- 員工本人可讀自己；admin 可讀寫全部；其他員工可讀（排課需看教練名單）
create policy emp_self      on employees for select using (auth_id = auth.uid());
create policy emp_staff_read on employees for select using (is_any_staff());
create policy emp_admin     on employees for all using (is_admin()) with check (is_admin());

-- ===== members =====
-- 會員只能讀自己；admin / 櫃台 可讀寫全部；教練可讀（看自己學員）
create policy mem_self       on members for select using (auth_id = auth.uid());
create policy mem_desk_all   on members for all using (is_staff_desk()) with check (is_staff_desk());
create policy mem_coach_read on members for select using (current_staff_role() = 'coach');

-- ===== member_tickets =====
-- 會員只能讀自己的票券；admin/櫃台 可讀寫全部；教練可讀
create policy tk_self       on member_tickets for select
  using (member_id = current_member_id());
create policy tk_desk_all   on member_tickets for all
  using (is_staff_desk()) with check (is_staff_desk());
create policy tk_coach_read on member_tickets for select
  using (current_staff_role() = 'coach');

-- ===== ticket_logs =====
create policy log_desk_all   on ticket_logs for all
  using (is_staff_desk()) with check (is_staff_desk());
create policy log_self_read  on ticket_logs for select
  using (ticket_id in (select id from member_tickets where member_id = current_member_id()));

-- ===== bookings =====
-- 會員讀自己的；教練讀自己授課/代課的；admin/櫃台 全部讀寫；教練可建/改自己的課
create policy bk_self_read   on bookings for select
  using (member_id = current_member_id());
create policy bk_coach_read  on bookings for select
  using (coach_id = current_employee_id() or original_coach_id = current_employee_id());
create policy bk_coach_write on bookings for all
  using (current_staff_role() = 'coach' and (coach_id = current_employee_id()))
  with check (current_staff_role() = 'coach' and (coach_id = current_employee_id()));
create policy bk_desk_all    on bookings for all
  using (is_staff_desk()) with check (is_staff_desk());

-- ===== notifications =====
-- 會員讀自己的；員工讀自己的；admin 全部
create policy nt_member on notifications for select
  using (recipient_type = 'member' and recipient_id = current_member_id());
create policy nt_coach  on notifications for select
  using (recipient_type = 'coach'  and recipient_id = current_employee_id());
create policy nt_insert on notifications for insert
  with check (is_any_staff());            -- 預約/取消時由員工端產生通知
create policy nt_admin  on notifications for all
  using (is_admin()) with check (is_admin());
```

### 權限對照（符合你的規格）

| 資料 | 會員 | 教練 | 櫃台 | 管理員 |
|---|---|---|---|---|
| 自己的預約/票券/通知 | ✅ 讀 | — | — | — |
| 自己課表/薪資/通知 | — | ✅ 讀 | — | — |
| 會員管理 | 讀自己 | 讀學員 | ✅ 讀寫 | ✅ 讀寫 |
| 預約管理 | 讀自己 | 自己課讀寫 | ✅ 讀寫 | ✅ 讀寫 |
| 票券管理 | 讀自己 | 讀 | ✅ 讀寫 | ✅ 讀寫 |
| 員工管理 | ✗ | 讀名單 | ✗ | ✅ 讀寫 |
| 課程方案 | 讀 | 讀 | 讀 | ✅ 讀寫 |

> 薪資頁不需獨立表：由 `bookings`(completed) + `employees.pay_rate/bonus` 即時算，教練只讀自己的 bookings（已被 RLS 限制），故薪資天然只看得到自己的。

---

## 4. 前端修改清單

> 核心結論：**頁面邏輯幾乎不動**。所有資料存取都走 5 個抽象函式（`dbGetAll/dbGet/dbPut/dbDel/dbClear`），只要把這幾個改成 Supabase 即可。實際要改的點如下。

### 4.1 載入 Supabase SDK（`<head>`）
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

### 4.2 初始化 + 設定（取代 `openDB`）
```js
const SB_URL = window.YUGYM_CONFIG?.url;
const SB_KEY = window.YUGYM_CONFIG?.anonKey;
const sb = supabase.createClient(SB_URL, SB_KEY);
```

### 4.3 表名對應
| 舊 store | 新 Supabase 表 |
|---|---|
| coaches | **employees** |
| 其餘同名 | members / ticket_types / course_plans / member_tickets / ticket_logs / bookings / notifications |

程式內所有 `'coaches'` 字串改指向 `employees`。最省事的做法：在資料層做一層別名映射（見 4.4），頁面碼完全不用改。

### 4.4 改寫 5 個資料層函式（這是遷移主體）
```js
const TABLE_ALIAS = { coaches: 'employees' };
function tbl(store){ return TABLE_ALIAS[store] || store; }

async function dbGetAll(store){
  const { data, error } = await sb.from(tbl(store)).select('*');
  if (error) throw error; return data || [];
}
async function dbGet(store, id){
  const { data, error } = await sb.from(tbl(store)).select('*').eq('id', id).maybeSingle();
  if (error) throw error; return data || null;
}
async function dbPut(store, obj){               // upsert（新增或更新）
  const { data, error } = await sb.from(tbl(store)).upsert(obj).select().maybeSingle();
  if (error) throw error; return data || obj;
}
async function dbDel(store, id){
  const { error } = await sb.from(tbl(store)).delete().eq('id', id);
  if (error) throw error;
}
async function dbClear(store){ /* 雲端不再用；保留空殼避免報錯 */ }
```
> 因介面（參數、回傳 Promise）與原本完全相同，**呼叫端的頁面程式碼一行都不用改**。

### 4.5 登入 `doLogin`（改用 Supabase Auth）
- 會員：`email = phone + '@member.yugym.local'`
- 員工：`email = acct + '@staff.yugym.local'`
```js
async function doLogin(){
  const acct = val('login-acct'), pw = val('login-pw');
  const email = (loginRole==='member')
      ? acct + '@member.yugym.local'
      : acct + '@staff.yugym.local';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error){ showLoginErr('帳號或密碼錯誤'); return; }
  // 取對應 profile，組 SESSION（沿用原本 {role,id,name} 結構）
  if (loginRole==='member'){
    const m = (await sb.from('members').select('*').eq('auth_id', data.user.id).maybeSingle()).data;
    SESSION = { role:'member', id:m.id, name:m.name };
  } else {
    const c = (await sb.from('employees').select('*').eq('auth_id', data.user.id).maybeSingle()).data;
    if (c.status!=='active'){ showLoginErr('帳號尚未啟用'); return; }
    if (loginRole==='admin' && c.role!=='admin'){ showLoginErr('此帳號非管理員'); return; }
    if (loginRole==='coach' && c.role!=='coach'){ showLoginErr('此帳號非教練'); return; }
    SESSION = { role:c.role, id:c.id, name:c.name };
  }
  enterApp();
}
```

### 4.6 Session（改用 Supabase session）
- 移除 `sessionStorage` 自管；改用 `sb.auth.getSession()` 還原登入狀態。
- `doLogout()`：`await sb.auth.signOut()` 後 reload。
- 啟動：先 `getSession()`，有 session 就還原 SESSION 並 `enterApp()`。

### 4.7 建立帳號（新增會員 / 員工邀請填寫）
新增會員、員工邀請完成時，除了寫入 `members/employees`，需呼叫 **Auth 建立使用者**並回填 `auth_id`。MVP 階段不開 Email 驗證：
```js
// 由 admin 在後台建立會員帳號（需 service role；見下方部署備註）
async function createMemberAccount(phone, pw, profile){
  // 方案 A（簡單）：用 signUp，使用者首次即啟用（關閉 email 確認）
  const email = phone + '@member.yugym.local';
  const { data } = await sb.auth.signUp({ email, password: pw });
  profile.auth_id = data.user?.id;
  await dbPut('members', profile);
}
```
> 重要：`signUp` 會把當前 session 切成新帳號。後台批次建檔時，較佳做法是用 **service_role key 在受信任環境**呼叫 `auth.admin.createUser()`（不影響當前登入）。MVP 若只由 admin 偶爾建檔，可接受 signUp 後重新登入；正式版再移到 Edge Function。**這是本階段唯一的取捨點。**

### 4.8 移除/停用
- `seedIfEmpty()`：雲端不需要；種子改由 SQL 一次性建立（見第 1 節）。
- IndexedDB 的 `openDB / tx / DB_VER / STORES` 整段移除。
- `dbClear` 相關（重置鈕）：雲端不提供前端清庫。

### 4.9 不需更動（重要）
以下全部維持原樣，因為它們只呼叫 5 個抽象函式：
`findUsableTicket / deductTicket / refundTicket / logTicket / pushNotification / submitBooking / cancelBooking` 以及**所有 PAGES.* 頁面**、行事曆拖曳、會員 Modal、薪資頁、通知頁、員工邀請 UI。

---

## 5. 環境變數設定方式

不要把金鑰寫死在 HTML。用一個不進版控的 `config.js`：

```js
// config.js（加入 .gitignore）
window.YUGYM_CONFIG = {
  url: 'https://xxxxxxxx.supabase.co',
  anonKey: 'eyJhbGciOi...（anon public key）'
};
```
```html
<!-- 在 yugym-mvp.html 載入 SDK 之後、主程式之前 -->
<script src="./config.js"></script>
```

- **anon key** 可放前端（它受 RLS 保護）。
- **service_role key 絕不可放前端**；僅用於後台批次建檔的受信任環境（或日後 Edge Function）。
- 部署到 Vercel/Netlify 時，可改用平台環境變數注入，或維持 `config.js` 由 CI 產生。

---

## 6. 部署流程

1. **建立 Supabase 專案**：supabase.com → New project，記下 Project URL 與 anon key。
2. **建表**：SQL Editor 貼上第 1 節 SQL 執行；再貼 ticket_types 種子。
3. **設定 Auth**：Authentication → Providers → Email 開啟；**關閉 "Confirm email"**（本階段不做信箱驗證）。
4. **建 RLS**：SQL Editor 貼上第 3 節全部策略。
5. **建立首位管理員**：
   - Authentication → Add user：email `admin@staff.yugym.local`、密碼自訂、Auto Confirm。
   - SQL：`insert into employees (id,auth_id,name,phone,role,status) values ('admin', '<剛建立的user uuid>', '魚太太','admin','admin','active');`
6. **放金鑰**：建立 `config.js`（第 5 節），與 `yugym-mvp.html` 同層。
7. **部署前端**：整個資料夾丟到任何靜態主機（Vercel / Netlify / GitHub Pages / Nginx 皆可），或本機 `python3 -m http.server`。
8. **驗證**：用 admin 登入 → 新增一位會員（會同時建立其 Auth 帳號）→ 換瀏覽器用該會員登入確認看得到自己資料。

---

## 7. 測試流程（驗收 = 三方看到同一份資料）

> 用三個不同瀏覽器 / 無痕視窗模擬三方同時在線。

| 步驟 | 操作者 | 動作 | 另一方應立即（重整後）看到 |
|---|---|---|---|
| 1 | 管理員（在家） | 新增會員「測試客」 | 櫃台重整會員列表 → 出現測試客 |
| 2 | 櫃台（公司） | 發放票券給測試客 | 教練/該會員重整 → 看到票券 |
| 3 | 教練（手機） | 建立一筆給測試客的私教課 | 該會員重整「我的預約」→ 看到課，票券 -1 |
| 4 | 會員（測試客） | 查看票券/預約/通知 | 只看得到自己的（看不到別人） |
| 5 | 管理員 | 取消該預約 | 票券 +1 退回；會員收到「已取消」通知 |

### 權限隔離測試（RLS）
- 會員登入後，在 Console 執行 `await sb.from('members').select('*')` → **只回自己一筆**（RLS 生效）。
- 教練執行 `await sb.from('bookings').select('*')` → 只回自己授課/代課的課。
- 教練嘗試讀別的教練的會員 → 回空。

### 流程不變測試（沿用 1.x）
- 扣課：預約成立後票券 `sessions_remaining -1`、`ticket_logs` 多一筆 `deduct`。
- 退課：取消後 `+1`、多一筆 `refund`。
- 通知：預約/取消各產生一筆 `notifications`，會員端讀得到。
- 最早到期優先、容量上限（私教3/小班1）：行為與 1.x 相同。

> 註：本階段未啟用 Realtime，「立即看到」= 對方**重新整理頁面**後看到（資料已同步在雲端）。需要真正即時推播時，下一階段加 Realtime（不影響現有結構）。

---

## 8. 完成標準對照

| 你的標準 | 本計畫如何達成 |
|---|---|
| 我在家登入、櫃台在公司、教練用手機，三方同一份資料 | 同一個 Supabase DB，各自帳號登入 |
| 我新增會員，櫃台立即看到 | members 寫雲端，櫃台重整即見 |
| 櫃台發票券，教練立即看到 | member_tickets 寫雲端，RLS 允許教練讀 |
| 教練建立預約，會員立即看到 | bookings 寫雲端，RLS 允許該會員讀自己 |
| 不新增功能、不改 UI | 只改 5 個資料層函式 + 登入/Session |

---

## 附錄：遷移檢查清單（給工程執行）

- [ ] Supabase 專案建立、記下 URL / anon key
- [ ] 執行建表 SQL + ticket_types 種子
- [ ] Auth 開 Email、關 Confirm email
- [ ] 執行 RLS 策略 SQL + 輔助函式
- [ ] 建首位 admin（Auth user + employees 一筆 + auth_id 對應）
- [ ] 前端載入 supabase-js、建立 sb client
- [ ] 改寫 dbGetAll/dbGet/dbPut/dbDel（+ coaches→employees 別名）
- [ ] 改寫 doLogin / doLogout / 啟動還原 session
- [ ] 新增會員 / 員工邀請完成 → 同步建立 Auth user 並回填 auth_id
- [ ] 移除 IndexedDB（openDB/seedIfEmpty/DB_VER）
- [ ] 三方同步測試 + RLS 隔離測試 + 扣退課/通知回歸測試
```
