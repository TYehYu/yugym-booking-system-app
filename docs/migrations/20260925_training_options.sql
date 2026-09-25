/* 工具／姿勢清單可自己增刪（2026-09-25 使用者：「工具／姿勢的選項要能自己增刪」）

   起因：TL_TOOLS（10 個）與 TL_POSTURES（5 個）寫死在程式裡，
   店裡進了新器材就加不進去。

   ══ 設計：只存「差異」，不存整份清單 ══════════════════════════════════
   程式裡的 TL_TOOLS／TL_POSTURES 留著當**內建預設**，這張表只記兩種事：
     ・新增的自訂項目        hidden=false
     ・被隱藏的內建項目      hidden=true（name 就是內建那一個）
   挑選清單 ＝ 內建（扣掉被隱藏的）＋ 自訂。

   ⚠⚠ 為什麼不做成「整份清單搬進資料庫」：
     ① TL_TOOLS 是同步常數，十幾個呼叫端直接讀它；改成非同步讀表要動很多地方，
        而且每一處都多一個「還沒載好」的狀態。
     ② 表壞掉或讀不到時，只存差異的做法會退回內建清單（照常能用）；
        整份搬進去的話就是整個清單消失。
   ⚠⚠ 「刪除」是**隱藏**不是真刪：training_logs 裡已經有 tool='四角槓' 的紀錄，
     真刪會讓歷史紀錄的標籤對不上。隱藏只影響「之後還能不能選」。

   ══ 每位教練各一份 ════════════════════════════════════════════════
   使用者：「這些課表內容　教練各自新增刪除應該不會影響彼此吧」

   ⚠⚠ 第一版做成全店共用（理由是「店裡有什麼器材是全店的事實」），
     使用者這一問才發現預期相反。回頭看也確實該各自一份 ——
     **常用動作（coach_exercises）本來就是每位教練自己一份**
     （0909 使用者定的「自建的只有自己看得到」），
     工具／姿勢是那些動作的屬性，跟著各自一份才一致。
   ⚠ 代價說清楚：店裡真的沒有的器材，每位教練要各自藏一次。
     使用者知情並選了這一邊。
   ⚠ 已經寫進 training_logs 的工具名稱不受影響 ——
     那是紀錄，不是清單；B 教練看得到 A 教練記的「飛輪」，
     只是自己的挑選清單裡沒有那一項。 */

create table if not exists public.training_options (
  id          text primary key,
  coach_id    text not null,
  kind        text not null check (kind in ('tool','posture')),
  name        text not null,
  hidden      boolean not null default false,
  sort_order  integer,
  created_at  timestamptz not null default now()
);

/* 同一位教練的同一種 kind 底下不要有兩筆同名
   （清單是給人點的，重複兩列只會讓人挑錯）。
   ⚠ 鍵要含 coach_id：兩位教練各自加「飛輪」是正常的，不該互相擋。 */
create unique index if not exists training_options_coach_kind_name_idx
  on public.training_options (coach_id, kind, name);

alter table public.training_options enable row level security;

/* GRANT ← 2026/10/30 之後不寫就是不能用（見 _TEMPLATE_new_table.sql） */
grant select, insert, update, delete on public.training_options to authenticated;
grant select, insert, update, delete on public.training_options to service_role;
/* anon 不給：未登入的人不會用到訓練選項。 */

/* 只碰得到自己那一份（管理員例外，要收拾殘局時看得到全部）。
   ⚠ 與 coach_exercises 的 cxe_select／cxe_write 同一套判準，
     兩張表的可見範圍本來就該一致。
   ⚠ 會員讀不到也用不到 —— 這是教練端與櫃檯端的欄位。 */
drop policy if exists training_options_read on public.training_options;
drop policy if exists training_options_write on public.training_options;
create policy training_options_select on public.training_options
  for select using ((select is_admin()) or coach_id = (select current_employee_id()));
create policy training_options_write on public.training_options
  for all using ((select is_admin()) or coach_id = (select current_employee_id()))
  with check ((select is_admin()) or coach_id = (select current_employee_id()));
