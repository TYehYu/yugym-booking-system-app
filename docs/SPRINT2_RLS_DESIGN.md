# YUGYM OS｜Sprint 2 RLS 設計（RLS Design）

> 產出：2026-07-16　狀態：**設計文件，SQL 尚未執行於任何環境**
> 前提與角色定義見 [SECURITY_MODEL.md](./SECURITY_MODEL.md)。採**路線 A**：本次收斂「未登入 anon 全開」的漏洞，會員細緻自我隔離政策標記為「未來啟用」。

---

## 1. 設計原則

1. **移除所有 `USING(true)` 全開政策**——這是漏洞根源（RLS 是 OR 邏輯，一條全開就全通）。
2. **改用 Sprint 1 已存在的權限函式**判斷（`is_staff_desk()` / `is_coach()` / `current_employee_id()` / `current_member_id()` …），本 Sprint 不需新增函式。
3. **保留必要的公開流程**（員工邀請 by token、會員自助註冊 insert、線上購課申請、app_state KV）。
4. **會員自我隔離政策先寫、標記未來啟用**（會員目前 0 帳號，無流量）。
5. 先在**測試環境**跑通四角色測試，再排正式 Migration。**本 Sprint 不動正式資料庫。**

---

## 2. 各表目標政策

分四組。每組先說「這組表放什麼」，再給政策。

### 第 1 組：會員敏感資料（櫃台/管理員全權；教練可讀；會員未來讀自己）
表：`members`、`member_tickets`、`ticket_logs`、`bookings`、`notifications`、`purchases`

```sql
-- ===== members =====
drop policy if exists members_all    on members;   -- USING(true) 全開，移除
drop policy if exists members_select on members;
drop policy if exists members_update on members;
drop policy if exists members_delete on members;
-- 保留：public_self_signup_members（anon 自助註冊 insert）
create policy mem_staff_all  on members for all    using (is_staff_desk()) with check (is_staff_desk());
create policy mem_coach_read on members for select using (is_coach());
-- 未來啟用（會員登入上線後）：
-- create policy mem_self_read on members for select using (auth_id = auth.uid());

-- ===== member_tickets =====
drop policy if exists member_tickets_all on member_tickets;   -- 全開，移除
-- 保留既有：mt_all_staff (is_staff_desk)、mt_select_member（會員自己，未來才有流量）
create policy mt_coach_read on member_tickets for select using (is_coach());

-- ===== ticket_logs =====
drop policy if exists ticket_logs_all on ticket_logs;   -- 全開，移除
-- 保留既有：tl_all_staff (is_staff_desk)
create policy tl_coach_read on ticket_logs for select using (is_coach());
-- 未來：會員讀自己票券的異動
-- create policy tl_self_read on ticket_logs for select
--   using (ticket_id in (select id from member_tickets where member_id = current_member_id()));

-- ===== bookings =====
drop policy if exists bookings_all on bookings;   -- 全開，移除
-- 保留既有：bookings_all_staff (is_staff_desk)、bookings_select_all_coach（教練讀）
create policy bk_coach_write on bookings for all
  using (is_coach() and coach_id = current_employee_id())
  with check (is_coach() and coach_id = current_employee_id());
-- 未來：會員讀自己（bookings_select_member 已存在，等會員登入才有效）

-- ===== notifications =====
drop policy if exists notifications_all on notifications;   -- 全開，移除
-- 保留既有：notif_all_staff (is_staff_desk)
-- 未來：會員/教練讀自己的
-- create policy nt_member on notifications for select
--   using (recipient_type='member' and recipient_id = current_member_id());
-- create policy nt_coach on notifications for select
--   using (recipient_type='coach' and recipient_id = current_employee_id());

-- ===== purchases =====
drop policy if exists purchases_all on purchases;   -- 全開，移除
create policy pur_staff_all on purchases for all using (is_staff_desk()) with check (is_staff_desk());
```

### 第 2 組：員工 / 人資 / 出勤 / 薪資（員工讀自己；管理員全權；櫃台視情況）
表：`employees`、`attendance`、`shifts`、`salary_templates`、`punch_requests`、`leave_settlements`、`training_logs`

```sql
-- ===== employees =====
drop policy if exists employees_all on employees;   -- 全開，移除
-- 保留：employees_invite_select/update（anon 憑 token 填邀請）、employees_insert（收斂見下）
create policy emp_self_read   on employees for select using (auth_id = auth.uid());
create policy emp_staff_read  on employees for select using (is_any_staff());  -- 排課需看教練名單
create policy emp_admin_all   on employees for all    using (is_admin()) with check (is_admin());
-- 收斂 insert：原 employees_insert 對 anon 全開，建議改為僅 invite 流程 / admin
--   （實際 insert 由 Edge Function service_role 執行，anon insert 可考慮移除，測試環境驗證）

-- ===== attendance / shifts / punch_requests：員工讀自己，admin/desk 全權 =====
drop policy if exists attendance_all     on attendance;
create policy att_self  on attendance for select using (emp_id = current_employee_id());
create policy att_staff on attendance for all    using (is_staff_desk()) with check (is_staff_desk());

drop policy if exists shifts_all on shifts;
create policy sh_self  on shifts for select using (emp_id = current_employee_id());
create policy sh_staff on shifts for all    using (is_staff_desk()) with check (is_staff_desk());

drop policy if exists punch_requests_all on punch_requests;
create policy pr_self  on punch_requests for all
  using (emp_id = current_employee_id()) with check (emp_id = current_employee_id());
create policy pr_staff on punch_requests for all using (is_staff_desk()) with check (is_staff_desk());

-- ===== salary_templates / leave_settlements：僅 admin =====
drop policy if exists salary_templates_all on salary_templates;
create policy sal_admin on salary_templates for all using (is_admin()) with check (is_admin());

drop policy if exists leave_settlements_all               on leave_settlements;
drop policy if exists leave_settlements_all_authenticated on leave_settlements;
create policy ls_admin on leave_settlements for all using (is_admin()) with check (is_admin());

-- ===== training_logs：員工讀寫（教練填課後訓練紀錄），未來會員讀自己 =====
drop policy if exists training_logs_all on training_logs;
-- 保留既有 tlog_*_auth（authenticated 全權）或收斂為 is_any_staff，測試環境決定
```

### 第 3 組：設定型 / 參考資料（登入者可讀；只有 admin 可寫）
表：`ticket_types`、`course_plans`、`category`、`member_level`、`ticket_type_member_levels`、`spaces`、`space_resources`、`venues`、`exercises`、`reward_rules`

```sql
-- 模式：移除全開 → 登入可讀、admin 可寫。以 ticket_types 為例，其餘同模式套用。
drop policy if exists ticket_types_all on ticket_types;
-- 保留既有 tt_select_all (auth.uid() is not null)、tt_write_admin
-- 其餘表（course_plans 已有 cp_*；category/member_level/... 目前僅有 xxx_all 全開）：
--   drop <table>_all;
--   create policy <t>_read  on <table> for select using (auth.uid() is not null);
--   create policy <t>_admin on <table> for all    using (is_admin()) with check (is_admin());
```

需套用此模式的表（目前只有 `xxx_all` 全開一條）：`category`、`member_level`、`ticket_type_member_levels`、`spaces`、`space_resources`、`venues`、`exercises`、`reward_rules`。

### 第 4 組：特殊
- `app_state`：維持現況（anon 讀寫固定 id `yugym-booking-system-v1`），低風險。可移除多餘的 `app_state_all USING(true)`，保留三條 by-id 政策。
- `purchase_applications`：保留 `pa_insert/select/update`（anon 線上購課），移除 `purchase_applications_all` 全開；若要更嚴謹，select/update 收斂為「僅自己送出的申請」（需有可比對的送出者欄位，測試環境確認）。

---

## 3. 回滾方案（Rollback）

每條 migration 都可逆。若正式套用後任一頁讀不到資料，立即執行回滾把全開政策加回：

```sql
-- 緊急回滾：把某表恢復為全開（暫時，換取服務不中斷，再排查）
create policy <table>_all on <table> for all using (true) with check (true);
```

> 完整回滾腳本會在正式 Migration 前，依「實際要執行的 migration」一對一產生並存檔於 `docs/migrations/`。原則：**migration 與 rollback 成對，且都先在測試環境跑過。**

---

## 4. 四角色測試計畫（測試環境）

> 在**測試環境**（複製一份 schema + 少量假資料，或 Supabase 分支）建立四個測試帳號，逐項驗證。**不在正式資料庫測試。**

| # | 角色 | 操作 | 預期結果 |
|---|---|---|---|
| 1 | anon（未登入） | `select * from members` | **0 筆**（或錯誤），不再讀到會員 |
| 2 | anon | 會員自助註冊 insert members | 成功（保留流程） |
| 3 | anon | 憑 invite_token 讀該筆 employees | 成功；讀其他員工 → 0 筆 |
| 4 | 會員（未來） | 讀自己的票券/預約 | 只回自己（本 Sprint 因無帳號，標記待驗） |
| 5 | 教練 | 讀 bookings | 可讀（排課需要） |
| 6 | 教練 | 改別的教練的 booking | 被擋 |
| 7 | 教練 | 改自己的 booking | 成功 |
| 8 | 教練 | 讀 salary_templates | 被擋 |
| 9 | 教練 | 讀自己的 attendance/shifts | 只回自己 |
| 10 | 櫃台 | 會員/票券/預約/購課 讀寫 | 全部成功 |
| 11 | 櫃台 | 改 ticket_types（設定） | 被擋（只有 admin 可寫） |
| 12 | 管理員 | 全部表讀寫 + 改設定 | 全部成功 |
| 13 | 全角色 | 走一遍前端主要頁面 | 無任何頁「讀不到該讀的資料」 |

**回歸重點**：因為前端所有讀取都走 anon key + 員工登入後的 authenticated session，收緊政策後最可能出事的是「某頁在特定角色下突然空白」。測項 13 必須四個角色各跑一遍前端。

---

## 5. 正式變更流程（驗收後才做）

1. 依本設計產生「實際 migration SQL」+ 對應 rollback，存 `docs/migrations/2026xxxx_rls_hardening.sql`。
2. 測試環境套用 → 跑 §4 全部 13 項 → 全綠。
3. 前端四角色回歸（測項 13）→ 無破頁。
4. 排正式 Migration（記錄時間、版本、操作者、驗證結果）。
5. 文件同步、Git commit。

---

## 6. 交棒 Sprint 2.5 / 3

- **Sprint 2.5（Benefit Mapping Audit）**：解決 Sprint 1 發現④——前端靠類別字串、後端靠 `benefit_type`。需盤點 2226 張票券的 benefit_type 對應是否完整正確。
- **Sprint 3（RPC Migration）**：前端切換到 `fn_create/cancel/checkin_booking`。切換前先修 `fn_create_booking` 的 `booking_category` bug、收斂重複的 `fn_checkin_booking`。
