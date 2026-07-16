# YUGYM OS｜Sprint 1 系統盤點報告

> 產出日期：2026-07-16　　範圍：正式資料庫 `rlpiomzplckzqnqrvrwc`（yugym-booking-system）+ 前端 `index.html`
> 本 Sprint 只做**唯讀盤點**，未修改任何正式資料庫或程式。
> 資料庫版本：PostgreSQL 17.6　　地區：ap-northeast-1（東京）

---

## 0. 一頁摘要（先看這個）

| 項目 | 現況 |
|---|---|
| 資料表數量 | **25 張**（舊遷移文件只寫 8 張，已嚴重過時） |
| 三支核心 RPC | **已部署**：`fn_create_booking` / `fn_cancel_booking` / `fn_checkin_booking`（+7 支 helper） |
| 前端是否用 RPC | **完全沒有**（0 處 `sb.rpc`）。預約/取消/簽到全是前端多步驟寫入 |
| RLS 安全性 | **高風險**：幾乎每張表都有 `USING (true)` 全開政策，等於沒保護 |
| 真實營運資料 | 會員 432、票券 2226、預約 1462、班表 162、出勤 113 |

### ⚠️ 三個必須先處理的發現

1. **`fn_create_booking` 目前是壞的**：函式內用了 `p_category::booking_category` 做型別轉換，但資料庫**沒有 `booking_category` 這個型別**（實際型別叫 `ticket_category`）。這支 RPC 一被呼叫就會落入例外、回傳 `ok:false`。**Sprint 3 前端切換 RPC 前，這支一定要先修好。**
2. **RLS 大門敞開**：`members`、`bookings`、`member_tickets` 等幾乎所有表都有一條 `qual=true` 的 ALL 政策，任何人拿公開 anon key 就能讀寫全部會員個資。這是 Sprint 2 的核心工作。
3. **`fn_checkin_booking` 有兩個版本重複**：一個含權限驗證（`p_operator` 版與非 `p_operator` 版），呼叫時參數若沒對準會踩到沒有權限檢查的那支。需擇一保留。

---

## 1. 資料表清單（25 張）

狀態說明：**Active**＝程式正在用；**Planned**＝表已建、程式尚未接；**Legacy/待確認**＝疑似舊制或重複。

| 表名 | 筆數 | 用途 | 狀態 |
|---|---:|---|---|
| members | 432 | 會員主檔 | Active |
| employees | 12 | 員工主檔（欄位極多，含薪資/勞健保/特休） | Active |
| member_tickets | 2226 | 會員票券（堂數餘額） | Active |
| bookings | 1462 | 預約 | Active |
| shifts | 162 | 員工班表 | Active |
| attendance | 113 | 出勤打卡 | Active |
| ticket_logs | 57 | 票券異動紀錄 | Active |
| notifications | 48 | 通知 | Active |
| exercises | 22 | 動作資料庫 | Active |
| ticket_type_member_levels | 18 | 票種×會員等級對應 | Active |
| course_plans | 17 | 課程方案 | Active |
| ticket_types | 9 | 票券種類（已擴充：含 benefit_type、category_id、validity_mode） | Active |
| category | 7 | 分類 | Active |
| salary_templates | 6 | 薪資模板 | Active |
| purchases | 5 | 購課紀錄 | Active |
| venues | 4 | 場地（舊制？與 spaces 疑似重疊） | 待確認 |
| space_resources | 4 | 場地資源（跑步機等） | Planned |
| member_level | 3 | 會員等級定義 | Active |
| spaces | 3 | 空間（general/group_room/treadmill，RPC 用） | Planned |
| purchase_applications | 3 | 線上購課申請 | Active |
| punch_requests | 3 | 補打卡申請 | Active |
| reward_rules | 2 | 簽到發點規則（RPC 用） | Planned |
| training_logs | 2 | 訓練紀錄 | Active（資料少） |
| leave_settlements | 0 | 特休結算 | Planned |
| app_state | 0 | 全域狀態（KV） | 待確認 |

> **`venues`(4) vs `spaces`(3)**：兩張都在描述場地，疑似新舊並存。`bookings` 同時有 `venue_unit`（text）與 `space_id`/`resource_id`（FK 到 spaces/space_resources）。需在 Sprint 4 釐清哪一套是正式的。

---

## 2. 核心 RPC 與 Helper 盤點

資料庫 `public` schema 內共 18 支函式。分三類：

### 2.1 Booking Engine（Sprint 3 前端要切換的目標）

| 函式 | 簽章 | 狀態 |
|---|---|---|
| `fn_create_booking` | `(member_id, coach_id, category, benefit_type, date, start_time, duration, space_id, resource_id, note)` | ⚠️ **壞的**（見發現①） |
| `fn_cancel_booking` | `(booking_id, reason)` | 看似完整，邏輯 OK（≥24h 返還、<24h 教練課標記可申請補課券） |
| `fn_checkin_booking` | 兩個重載：`(booking_id, checkin_source)` 含權限檢查／`(booking_id, checkin_source, operator)` **無**權限檢查 | ⚠️ **重複**（見發現③） |

**設計亮點（值得保留）**：這套 RPC 用「benefit_type」抽象化——`fn_create_booking` 不管扣的是堂數票還是自主訓練點數，一律呼叫 `benefit_consume`，由票種的 `benefit_type` 欄位決定扣哪張票（FIFO、最早到期優先、`FOR UPDATE` 鎖列防併發）。整包是單一交易，任何步驟失敗會全部 rollback——這正是修正版文件要的「不再有半套資料」。

### 2.2 Helper / Handler

| 函式 | 用途 |
|---|---|
| `space_check` | 場地/教練時間衝突檢查（general 上限3、group_room 獨占、treadmill 檢查資源狀態） |
| `benefit_consume` | 扣票（FIFO、寫 ticket_logs deduct） |
| `benefit_refund` | 退票（回原 batch、保留原到期日、寫 refund log） |
| `handle_checkin_reward` | 簽到發點（查 reward_rules、當天簽到才發、隔天補簽 skipped） |
| `gen_short_id` | 產生短 ID（BK-/LG-/TK- 前綴） |

### 2.3 權限輔助函式（RLS 用）

`current_staff_role` / `current_employee_id` / `current_member_id` / `is_admin` / `is_staff_desk` / `is_any_staff` / `is_coach` / `can_coach_see_member` / `rls_auto_enable`

> 這些函式都已存在且看似正確——代表 Sprint 2 修 RLS 時，**判斷「誰是誰」的工具已經齊備**，只需把各表的政策從 `USING(true)` 換成用這些函式判斷即可。

### 2.4 benefit_type 對照（RPC 依賴）

票種目前的 `benefit_type` 分佈：`coaching_session`(3)、`training_pass`(2)、`friendly_session`(1)、`group_session`(1)、`massage_session`(1)、`none`(1，體驗不扣)。

---

## 3. RLS 安全稽核（Sprint 2 依據）

**現況：形同虛設。** 每張表雖然 `rls_enabled=true`，但幾乎都掛了一條 `USING (true) WITH CHECK (true)` 的 `xxx_all` 政策，對 `public` 角色全開。這條在，其他比較嚴謹的政策（如 `mt_select_member`、`bookings_select_member`）就沒有意義了——因為 RLS 是「OR」邏輯，一條全開就全通。

| 風險等級 | 表 | 問題 | 建議政策 |
|---|---|---|---|
| 🔴 極高 | members | `members_all USING(true)` | 會員只讀自己（`auth_id=auth.uid()`）；櫃台/admin 全權；教練讀學員 |
| 🔴 極高 | member_tickets | `member_tickets_all USING(true)` | 會員只讀自己（`member_id=current_member_id()`）；staff_desk 全權 |
| 🔴 極高 | bookings | `bookings_all USING(true)` | 會員讀自己；教練讀自己的課；staff_desk 全權 |
| 🔴 高 | employees | `employees_all USING(true)`＋`employees_insert` 對 anon 開放 | 本人讀自己；員工讀名單；admin 全權；insert 收斂 |
| 🔴 高 | ticket_logs / purchases / purchase_applications | 全開＋部分對 anon 開 | 收斂到 staff / 本人 |
| 🟠 中 | attendance / shifts / salary_templates / punch_requests / leave_settlements | 薪資出勤全開 | 員工讀自己、admin 全權 |
| 🟢 低 | ticket_types / course_plans / category / member_level / spaces / space_resources / venues / exercises / reward_rules | 設定型資料，登入者可讀即可 | 讀開放、寫限 admin |

> **Sprint 2 執行原則**：先在測試環境把每張表的 `xxx_all USING(true)` 政策移除、改用權限函式，跑通「會員只看得到自己」的測試，再套正式。動政策**不會改資料**，但會改變前端讀得到什麼，所以要連前端一起回歸測試（避免某頁突然讀不到資料）。

---

## 4. 列舉型別（Enums）

共 14 個：`booking_status`(booked/checked_in/completed/cancelled/no_show)、`ticket_category`(私人教練/小班肌力/自主訓練/體驗/運動按摩)、`ticket_status`、`pay_status`、`invoice_status`、`ticket_log_action`、`reward_status_enum`(pending/issued/skipped/revoked)、`member_gender`、`member_source`、`member_status`、`staff_role`、`staff_status`、`employment_type`、`notify_recipient`。

> ⚠️ 注意：**沒有 `booking_category`**。`fn_create_booking` 誤用了這個不存在的型別（發現①）。`bookings.category` 欄位實際是 `ticket_category` 型別。

---

## 5. 索引（含可清理項）

大表索引齊全（bookings 有 date/coach/member；member_tickets 有 member/status/type）。但發現**重複索引**，Sprint 4 可清：

- `bookings`：`idx_bookings_coach` = `ix_bookings_coach`（重複）、`idx_bookings_date` = `ix_bookings_date`（重複）
- `member_tickets`：`idx_tickets_member` = `ix_member_tickets_member`（重複）
- `members`：`members_phone_key` = `members_phone_unique`（重複 unique）
- `leave_settlements`：`leave_settlements_emp_id_year_key` = `leave_settlements_emp_year_idx`（重複 unique）

> 重複索引不影響正確性，但浪費寫入效能與空間，屬 Sprint 4 清理項。

---

## 6. 資料表關聯（ERD 精要）

```
auth.users ─1:1─ employees.auth_id
auth.users ─1:1─ members.auth_id

members ─1:N─ member_tickets ─1:N─ ticket_logs
members ─1:N─ bookings
members ─N:1─ member_level (members.level → member_level.level)
members ─N:1─ employees (default_coach_id)

ticket_types ─1:N─ course_plans / member_tickets / purchases / bookings
ticket_types ─N:1─ category (category_id)
ticket_types ─M:N─ member_level (透過 ticket_type_member_levels)

course_plans ─1:N─ member_tickets (source_plan_id)

employees ─1:N─ bookings (coach_id / original_coach_id)
employees ─1:N─ leave_settlements (emp_id)

bookings ─N:1─ member_tickets (ticket_id，扣抵來源)
bookings ─N:1─ spaces (space_id) / space_resources (resource_id)

reward_rules ─(邏輯)→ member_tickets (簽到發點時新建票)
```

無外鍵關聯的獨立表：`app_state`、`notifications`、`attendance`、`shifts`、`punch_requests`、`salary_templates`、`exercises`、`training_logs`、`purchase_applications`。（其中 notifications / attendance / shifts 靠 text 欄位 recipient_id / emp_id 軟關聯，未設 FK。）

---

## 7. 前端 ⇄ 後端對照

**結論：前端 0 處呼叫 RPC。** 預約、取消、簽到三個核心流程全是前端多步驟寫入（走 `dbGetAll/dbGet/dbPut/dbDel`）。

| 流程 | 前端函式（行號） | 目前做法 | 對應的後端 RPC |
|---|---|---|---|
| 建立預約 | `submitBooking`(10483–10604) → `runRecurringBooking`(10641–10691) | `dbPut('bookings')` + `deductTicket` + `logTicket` + `pushNotification` **四件事分開做**，非交易式 | `fn_create_booking`（未使用，且壞的） |
| 取消預約 | `cancelBooking`(11414–11469) | 改狀態 + `refundTicket` + `logTicket` + `pushNotification` 分開 | `fn_cancel_booking`（未使用） |
| 簽到 | `checkInBooking`(10985–11006)（會員/掃碼/櫃台都轉呼叫它） | `dbPut` 改狀態 + `markTicketUsedIfDone` + `grantCheckinReward` 發券 | `fn_checkin_booking`（未使用） |

前端扣退票的底層函式：`deductTicket`(6404)、`refundTicket`(6413)、`logTicket`(6348)、`pushNotification`(6286)、`findUsableTicket`(6344)。

### ⚠️ 發現④：前後端「怎麼決定扣哪種票」的邏輯不一致（Sprint 3 關鍵）

- **後端 RPC**：靠票種的 `benefit_type` 欄位（`coaching_session`/`training_pass`/…）決定扣哪張票，單一權威欄位。
- **前端**：完全沒用 `benefit_type`（grep 命中 0）。而是靠 `category`（課程類別字串）+ `ticket_type_id` + `plan_name` + 顏色/名稱關鍵字（如名稱含「友善」、`color==='pt'`、寫死 id `pt`/`group`/`self_training`）拼湊判斷。

**影響**：Sprint 3 要把前端切成呼叫 `fn_create_booking`，就必須傳入正確的 `benefit_type`。但前端現在根本沒有這個概念，且票種資料的 `benefit_type` 是否對每張票都正確、是否涵蓋所有舊資料，需要在 Sprint 3 前先驗證與補齊對應。這是切換 RPC 的**最大工程風險點**，比想像中的「換個呼叫」複雜。

### 前端簽到發點 vs 後端 reward_rules

前端 `grantCheckinReward`(11163) 自己用類別+名稱關鍵字判斷發不發自主訓練點數；後端 `handle_checkin_reward` 則查 `reward_rules` 表決定。兩套邏輯並存，Sprint 3 切換時需確認 `reward_rules` 的規則與前端現行行為一致，否則發點行為會改變。

---

## 8. Sprint 1 結論與交棒 Sprint 2/3

1. **盤點完成**：25 表、18 函式、14 enum、RLS 政策、索引皆已記錄（本文件即 Schema Dictionary + Function Inventory + ERD）。
2. **Sprint 2（安全）先做**：把全開 RLS 收斂。權限函式已齊備，工作是「換政策 + 前端回歸測試」，不動資料。
3. **Sprint 3（RPC 切換）前置工作**：
   - 修 `fn_create_booking` 的 `booking_category` → `ticket_category`（否則前端切過去會全部失敗）。
   - 收斂 `fn_checkin_booking` 重複的兩支，保留含權限檢查那支。
   - **驗證/補齊票種 `benefit_type`**（發現④）：前端靠類別字串判斷、後端靠 benefit_type，切換前要確保每張現存票券都能對到正確 benefit_type，並讓前端在建立預約時傳對值。此為最大工程風險。
   - 確認 `reward_rules` 與前端 `grantCheckinReward` 現行發點行為一致。
4. **Sprint 4（清理）候選**：重複索引、`venues` vs `spaces` 二選一、舊 docs 同步。
