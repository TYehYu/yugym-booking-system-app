# YUGYM 健身房管理系統

單一 HTML 檔的健身房管理系統（MVP 2.0），四種角色（管理員/櫃台/教練/會員）共用同一份 Supabase 雲端資料。

## 檔案結構

- `index.html` — 整個應用程式（約 22,000 行）。無建置流程、無框架，純 HTML/CSS/JS。
  - 前段：CSS（`<style>` 至約 4157 行）
  - 第一段 `<script>`（約 4278–5493 行）：資料層、登入/Session、權限、路由骨架
  - 第二段 `<script>`（5494 行起）：所有頁面 `PAGES.*`（約 40 頁）與業務邏輯
- `config.js` — Supabase URL + anon key（進版控，Pages 部署需要它；anon key 是公開金鑰，由 RLS 保護）
- `YUGYM-MVP2-Supabase遷移.md` — 建表 SQL、RLS 策略、遷移設計文件

## 每次改版必做

改完 `index.html` 後，更新檔內的 `APP_VERSION` 與 `APP_VERSION_LABEL`（搜尋 `const APP_VERSION`），格式為 `YYMMDD.HHmm`，例如 `260716.1213`。

## 資料層（重要慣例）

- 所有資料存取只走 `dbGetAll / dbGet / dbPut / dbDel`（Supabase 版，介面同舊 IndexedDB 版）。頁面程式碼不要直接呼叫 `sb.from()`，除非是 RLS 相關的特殊查詢。
- `TABLE_ALIAS = { coaches: 'employees' }`：程式內傳 `'coaches'` 的舊呼叫會自動對應到 `employees` 表。
- `dbGetAll` 已用 `.range()` 分頁迴圈處理 PostgREST 單次 1000 筆上限——大表（member_tickets、bookings）務必保留此機制，否則會出現票券顯示 0 堂、行事曆缺課等截斷症狀。
- `dbPut` 是 upsert；`id` 為 text 主鍵（非 UUID）。
- 簽章校驗（2026-08-04 讀取量優化第二批）：`dbGetAll` 的快取過期時，會先呼叫 `fn_table_sigs()`（回傳每張表的「筆數:整列雜湊和」，約 60ms）比對；簽章沒變就直接沿用快取、**完全不抓表**，變了才重抓那一張。簽章一定先於資料取得，寫入時 `dbCacheClear` 會一併丟掉共用簽章。**新增 RPC 或任何繞過 dbPut 的寫入，一樣要記得 `dbCacheClear`**，否則本機看不到自己的改動。
- 增量補資料（2026-08-04 讀取量優化第三批）：`change_log`（DB 觸發器，只記表名＋主鍵）讓 `dbGetAll` 在簽章不同時，只把變動的那幾列撈回來補進快取，而不是整表重抓。任何解釋不了的情況（日誌查不到、超過 400 筆、沒有水位）一律退回整表重抓；且每 10 分鐘至少會整表重抓一次校正（`fullAt`）。**新增資料表時記得一併加 `trg_change_log` 觸發器並列進 `fn_table_sigs`**，否則該表只會走原本的整表重抓（正確但較慢）。
- 跨工作階段快取（2026-08-04 第三批第二段）：每張表的快取（含簽章與日誌水位）會存進 IndexedDB（`yugym-cache`），下次開場 `cacheHydrate(uid)` 先載回來，再走簽章校驗——載回來的一律 `t=0`，**一定先校驗才會被採用**。存檔鍵含 auth uid、超過 1 天不用、`doLogout` 會 `cacheWipe()` 清空。
- `LEAN_DROP`（2026-08-04 讀取量優化）：列出列表讀取「不搬」的欄位，`dbGetAll` 不會把它們撈回來。兩組理由不同：**bookings 的 9 欄是全程式碼沒人用**（整表 6.4MB→5.1MB）；**contracts 的 3 欄（`body_snapshot`／`fill_snapshot`／`signature`）有人用，但只在「打開某一份合約」時用**，而那條路走的是單筆 `dbGet`（全欄位）——那三欄佔整張表 96%，而櫃檯每點開一位會員就會整表搬一次（2026-08-09）。欄位清單是**從實際回傳的資料學來的**，資料庫加欄位會自動被涵蓋，不需同步任何清單。若日後要開始使用其中某個欄位，**先把它從 `LEAN_DROP` 移除**（`tests/leanselecttest.js` 會擋下沒移除就使用的情況）。單筆 `dbGet` 仍是 `select('*')`，`dbPut` 有護欄會在回寫前補齊缺欄位。

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

## 部署（正式環境）

- GitHub 倉庫：`TYehYu/yugym-booking-system-app`（公開），主分支 `master`
- 正式網址：https://tyehyu.github.io/yugym-booking-system-app/ （GitHub Pages，從 master 根目錄出）
- **推上 master = 直接上線**（櫃台/教練/會員實際在用），約 1–2 分鐘生效。推送前務必確認改動已驗證。
- 舊的手動上傳時代備份在 `backup-260716-manual-era` 分支。
- 現行系統的執行檔只有 `index.html + config.js`，另加 PWA 三件組（`manifest.json` / `sw.js` / `icon-192.png` / `icon-512.png`，`index.html` 有掛載與註冊，勿刪）。
- `docs/` 是**現行**文件（設計、安全模型、測試結果、migration），非遺留檔案。舊版（Codex 時代）的 `js/`、`css/`、`assets/` 與 5 月份文件已於 2026-07-16 清除，需要時可從 git 歷史取回。

## 開發與測試

- 本機執行：`python3 -m http.server`，瀏覽器開 `http://localhost:8000`（`config.js` 需在同層）。
- 驗證多角色行為時，用不同無痕視窗分別登入不同角色。
- UI 文字一律繁體中文；程式註解也以繁體中文為主，沿用現有風格。
- 改動業務邏輯時注意票券流程的成對操作：扣課要寫 `ticket_logs`（`deduct`），取消要退回（`refund`），預約/取消要產生 `notifications`。
