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
- **快取紀元 `CACHE_EPOCH`（2026-10-08）**：跨工作階段快取「要不要整份丟掉」看這個字串。**只有改到讀取／快取規則（分頁、`LEAN_DROP`、簽章、增量補資料）時才手動跳號**；改版面或業務邏輯一律不要動。原本這裡綁的是 `APP_VERSION`，等於每推一次版全店冷啟動一次（1008 使用者回報開場 4.2 秒、「開場還原 0 張」，而那天推了五個版本）。
- `LEAN_DROP`（2026-08-04 讀取量優化）：列出列表讀取「不搬」的欄位，`dbGetAll` 不會把它們撈回來。兩組理由不同：**bookings 的 9 欄是全程式碼沒人用**（整表 6.4MB→5.1MB）；**contracts 的 3 欄（`body_snapshot`／`fill_snapshot`／`signature`）有人用，但只在「打開某一份合約」時用**，而那條路走的是單筆 `dbGet`（全欄位）——那三欄佔整張表 96%，而櫃檯每點開一位會員就會整表搬一次（2026-08-09）。欄位清單是**從實際回傳的資料學來的**，資料庫加欄位會自動被涵蓋，不需同步任何清單。若日後要開始使用其中某個欄位，**先把它從 `LEAN_DROP` 移除**（`tests/leanselecttest.js` 會擋下沒移除就使用的情況）。單筆 `dbGet` 仍是 `select('*')`，`dbPut` 有護欄會在回寫前補齊缺欄位。

## 新增資料表的規矩（2026/10/30 Supabase 變更）

Supabase 公告：**自 2026/10/30 起，`public` schema 中新建立的 table 不再自動取得 Data API 存取權限**。
之後才建的表（migration 建立、preview branch、本機 `supabase db reset` 重建）
都必須在**同一支 migration 裡**明確 GRANT，否則 Data API 會 `permission denied`。

照 `docs/migrations/_TEMPLATE_new_table.sql` 抄，四件事缺一不可：
建表 → `enable row level security` → **GRANT** → policy。

```sql
grant select, insert, update, delete on public.<新表> to authenticated;
grant select, insert, update, delete on public.<新表> to service_role;
-- anon 預設不給（公告第 3 點）。真的需要「未登入就要讀」才給 select，並寫明理由。
```

- **`authenticated`** ＝ 登入後的所有人（會員／教練／櫃檯／管理員都是它）。身分判斷全靠 RLS policy，不是 Postgres role，所以一律給四個權限。
- **`service_role`** ＝ Edge Function 用，繞過 RLS，**一張都不能漏**。
- **`anon`** ＝ 未登入。22 張舊表有 anon 權限是 baseline 時代的遺留（靠 policy 的 `auth.uid() IS NOT NULL` 擋著），**照現況保留、新表不要跟進**。

⚠ **現有的表不受這次變更影響，不要為了它去動既有 grants** —— 0812 就是被一次大範圍 REVOKE 害到，service_role 在 30 張表失效，而失敗還被 catch 吞掉。
⚠ 漏 GRANT 的症狀是**靜默的**：SELECT 失敗被 `dbGetAll` 的 catch 吞掉（回空陣列），畫面只是「還沒有資料」，一直到 INSERT 才爆權限不足（0812、0909 各踩一次）。
⚠ `tests/migrationgranttest.js` 會掃 `docs/migrations/*.sql` 守住這件事。

## Supabase

- 專案：`rlpiomzplckzqnqrvrwc.supabase.co`（本 session 可透過 Supabase MCP 工具直接查表、跑 SQL、看 logs）
- 資料表：`employees / members / ticket_types / course_plans / member_tickets / ticket_logs / bookings / notifications`，全表啟用 RLS
- RLS 輔助函式：`current_staff_role() / current_employee_id() / current_member_id() / is_admin() / is_staff_desk() / is_any_staff()`
- Edge Function：`create-staff-account` — 以 service_role 建立員工 Auth 帳號與重設密碼（避免前端 `signUp` 切換掉管理員 session）。前端以 `action` 參數區分建立/重設。

### 正式庫／測試庫權限邊界（2026-11-04 定案）

- **測試庫 `kucvxpjatptfckhlxptj`**：允許自主執行必要的 SELECT、測試資料操作，以及可回滾的函式修復與 migration；執行前先確認 `project_id` 正確、保留修改紀錄（原始定義／rollback SQL）。
- **正式庫 `rlpiomzplckzqnqrvrwc`**：僅允許唯讀診斷（SELECT）。任何 INSERT／UPDATE／DELETE／DDL／migration／RPC 寫入或部署，一律要先取得使用者明確授權才能執行。
- 禁止自動執行 DROP、TRUNCATE、大量刪除，以及跨環境（測試庫↔正式庫）的資料覆蓋。
- ⚠⚠ **這份文件只是工作規範，不是實際的工具權限控管**——Claude Code 的權限系統是「依工具名稱」授權（例如整支 `execute_sql`／`apply_migration` 允許或需要確認），**不會依呼叫時傳入的 `project_id` 參數做技術隔離**；同一支工具一旦被允許免確認執行，呼叫時無論傳哪個 `project_id` 都會直接執行，不會自動分辨測試庫或正式庫。
  **因此這裡不設定、也不應該設定任何「自動允許」規則**——對正式庫有寫入可能的操作，一律維持需要使用者在當下核准（看得到 `project_id`、看得到實際 SQL 再決定），這是目前唯一能落地的分離方式；真正的技術層級隔離（例如讓這個連線從一開始就看不到正式庫）需要在 Supabase MCP 連線設定／組織層級處理，不是這份文件或這個對話能做到的。
  每次操作前，**自己**要在送出前把 `project_id` 講在前面給使用者看（唯讀診斷也一樣），不要假設讀過這份文件就代表可以少一道確認。

### 回報格式規範（2026-11-04 定案）

- 每次工具權限確認前，先用簡短繁中說明：目標資料庫（測試/正式）、操作類型（唯讀/寫入）、影響範圍、建議選項與風險。
- 需要使用者複製貼上執行的指令，獨立放在 Markdown 程式碼區塊，不與說明文字混在一起。
- 操作完成後用簡短表格回報：已完成、失敗、待確認、下一步；不重複貼出大量 SQL 或程式碼。
- 權限確認介面由 Claude Code 控制，不得聲稱能修改其按鈕；只能在工具呼叫前提供建議選項讓使用者選。
- 測試庫可在已授權範圍內修改並測試；正式庫任何寫入、DDL、migration、部署一律先取得明確核准。
- 不得自動選擇「Don't ask again」或設定全域工具自動允許。
- 優先節省 Token：避免重複查詢、長篇報告、不必要的程式碼輸出。
- 每次任務回報最後附上精簡任務進度表：任務名稱、完成狀態（已完成／進行中／待辦／阻塞）、下一步、整體完成度。完成度依實際驗證結果估算，未測試的修改不算完成。

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

## 省 Token 工作原則

- **單一任務**：一次只做使用者當下要求的那件事，不要順便延伸處理其他發現的問題（先回報，等指示）。
- **最少必要檔案**：只讀、只改完成任務真正需要的檔案；不要為了「順便確認」而展開大範圍瀏覽。
- **不自行啟動 Agent**：不要主動 spawn subagent 或 workflow，除非使用者明確要求。
- **Supabase 最小範圍查詢**：查詢只問當下需要的欄位/表，不要整表掃描或連帶查無關資料；能用現有對話脈絡回答就不要重新查。
- **修改前確認**：會動到 App 功能、資料庫、正式環境的操作，先說明要做什麼、等使用者同意再動手。
- **完成後停止**：任務做完就停，不要自動延伸到下一步、不要自行接著做「順便」的優化。
- 不要把大量開發歷史寫進本檔——交接與進度紀錄另開檔案（如 `YUGYM_HANDOFF.md`），`CLAUDE.md` 只放長期有效的架構規則。
