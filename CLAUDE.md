# YUGYM 健身房管理系統

單一 HTML 檔的健身房管理系統（MVP 2.0），四種角色（管理員/櫃台/教練/會員）共用同一份 Supabase 雲端資料。

## 檔案結構

- `index.html` — 整個應用程式（約 22,000 行）。無建置流程、無框架，純 HTML/CSS/JS。
  - 前段：CSS（`<style>` 至約 4157 行）
  - 第一段 `<script>`（約 4278–5493 行）：資料層、登入/Session、權限、路由骨架
  - 第二段 `<script>`（5494 行起）：所有頁面 `PAGES.*`（約 40 頁）與業務邏輯
- `config.js` — Supabase URL + anon key（不進版控；沒有它會無法連線）
- `YUGYM-MVP2-Supabase遷移.md` — 建表 SQL、RLS 策略、遷移設計文件

## 每次改版必做

改完 `index.html` 後，更新檔內的 `APP_VERSION` 與 `APP_VERSION_LABEL`（搜尋 `const APP_VERSION`），格式為 `YYMMDD.HHmm`，例如 `260716.1213`。

## 資料層（重要慣例）

- 所有資料存取只走 `dbGetAll / dbGet / dbPut / dbDel`（Supabase 版，介面同舊 IndexedDB 版）。頁面程式碼不要直接呼叫 `sb.from()`，除非是 RLS 相關的特殊查詢。
- `TABLE_ALIAS = { coaches: 'employees' }`：程式內傳 `'coaches'` 的舊呼叫會自動對應到 `employees` 表。
- `dbGetAll` 已用 `.range()` 分頁迴圈處理 PostgREST 單次 1000 筆上限——大表（member_tickets、bookings）務必保留此機制，否則會出現票券顯示 0 堂、行事曆缺課等截斷症狀。
- `dbPut` 是 upsert；`id` 為 text 主鍵（非 UUID）。

## Supabase

- 專案：`rlpiomzplckzqnqrvrwc.supabase.co`（本 session 可透過 Supabase MCP 工具直接查表、跑 SQL、看 logs）
- 資料表：`employees / members / ticket_types / course_plans / member_tickets / ticket_logs / bookings / notifications`，全表啟用 RLS
- RLS 輔助函式：`current_staff_role() / current_employee_id() / current_member_id() / is_admin() / is_staff_desk() / is_any_staff()`
- Edge Function：`create-staff-account` — 以 service_role 建立員工 Auth 帳號與重設密碼（避免前端 `signUp` 切換掉管理員 session）。前端以 `action` 參數區分建立/重設。

## 登入機制

帳號轉內部假 email 後走 Supabase Auth：

- 會員：`{手機號}@member.yugym.local`
- 員工：`{帳號}@staff.yugym.local`

登入後組出 `SESSION = { role, id, name }`；角色為 `admin / front_desk / coach / member`。員工邀請流程用 `employees.invite_token`（匿名可憑 token 讀單筆）。

## 開發與測試

- 本機執行：`python3 -m http.server`，瀏覽器開 `http://localhost:8000`（`config.js` 需在同層）。
- 驗證多角色行為時，用不同無痕視窗分別登入不同角色。
- UI 文字一律繁體中文；程式註解也以繁體中文為主，沿用現有風格。
- 改動業務邏輯時注意票券流程的成對操作：扣課要寫 `ticket_logs`（`deduct`），取消要退回（`refund`），預約/取消要產生 `notifications`。
