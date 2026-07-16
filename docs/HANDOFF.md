# YUGYM 交接說明（跨機器接續）

> 更新：2026-07-16 深夜（收工）。此檔隨 repo `git clone` 帶走，讓另一台電腦（或新的 Claude Code 對話）快速接手。
> **repo 為公開**，本檔不放任何密碼、不放漏洞細節。測試帳密與資安鑑識紀錄見專案根目錄
> `PRIVATE_DO_NOT_UPLOAD_security-incident-20260716.md`（受 `.gitignore` 保護，不進版控，只在本機）。

---

## 1. 現在的狀態（一句話）

Sprint 2（RLS 收斂）+ Sprint 3（預約/取消/簽到走 RPC）已上線並運作正常；當晚另修補了一個
RPC 授權漏洞、一個教練無法下班打卡的迴歸，並完成首頁改版與平板版面收斂。線上版本 `260716.2235`。

## 2. 正式環境

- GitHub：`TYehYu/yugym-booking-system-app`（公開，主分支 `master`）。**推 master = 上線**（GitHub Pages，1~2 分鐘生效）。
- 正式網址：https://tyehyu.github.io/yugym-booking-system-app/
- Supabase 正式：`rlpiomzplckzqnqrvrwc`（含真實會員資料，**勿搬個資到本機/測試**）。
- Supabase 測試：`kucvxpjatptfckhlxptj`（`yugym-sprint3-test`，免費，schema 與正式 1:1）。
  **已決定長期留用**（當晚兩次靠它重現問題、驗證修補）。帳密見上述 PRIVATE 檔。
- 前端旗標（`window.FEATURE_FLAGS`）**全開**：`createBookingRpc / cancelBookingRpc / checkinBookingRpc`。
- ⚠️ **本機 `config.js` 目前指向測試庫**，並以 `git update-index --skip-worktree config.js` 防止誤推
  （線上那份仍正確指向正式庫）。要改回正式庫：檔內註解留有原始設定；解除保護用
  `git update-index --no-skip-worktree config.js`。

## 3. 已完成 / 進度

### Sprint 1~3（2026-07-16 白天～晚間）

- ✅ Sprint 1 盤點、2.5 票券對應：`docs/SPRINT1_SYSTEM_AUDIT.md`、`docs/SPRINT2_5_BENEFIT_MAPPING_AUDIT.md`
- ✅ Sprint 2 RLS 收斂：設計 `docs/SPRINT2_RLS_DESIGN.md`、`docs/SECURITY_MODEL.md`；測試 `docs/SPRINT2_RLS_TEST_RESULTS.md`；已套正式（`docs/migrations/20260716_03_rls_hardening.sql`）。未登入讀 members/tickets 已為 0。
- ✅ Sprint 3 RPC 切換：`docs/SPRINT3_RPC_MIGRATION_PLAN.md`、`docs/SPRINT3_RPC_TEST_RESULTS.md`、`docs/SPRINT3_FRONTEND_STATUS.md`；正式已套 `20260716_01_*.sql`、`_02_*.sql`。
- ✅ Baseline schema（補回 migration 歷史）：`docs/migrations/0000_*.sql`、`0001_*.sql`

### 當晚追加（2026-07-16 20:00 後）

- ✅ **RPC 授權收斂（已套正式）**：`docs/migrations/20260716_04_rpc_authz_hardening.sql`
  - 背景：`fn_*` / `benefit_*` 皆為 SECURITY DEFINER（設計上繞過 RLS），但 EXECUTE 沿用 PostgreSQL 預設值（授予 PUBLIC），且身分檢查不一致（僅 `fn_checkin_booking` 有做）。Sprint 2 的 RLS 只約束直接讀寫資料表，不涵蓋此路徑。
  - 修法：內部函式收回外部 EXECUTE；`fn_create_booking`/`fn_cancel_booking` 補身分檢查；三支前端 RPC 收回 anon。RLS 政策依賴的 7 支輔助函式維持原狀。詳見 migration 檔內說明與**日後新增 SECURITY DEFINER 函式的檢查清單**。
  - 已驗證：測試庫未登入呼叫全擋（42501）、員工三流程正常（扣退票正確）、會員越權回 `AUTH.FORBIDDEN`；正式庫已比對授權矩陣。
  - 查核：正式庫 `ticket_logs` 全數為正常人員操作，**無遭利用痕跡**。
- ✅ **教練無法下班打卡修復（已套正式）**：`docs/migrations/20260716_05_fix_attendance_self_write.sql`
  - Sprint 2 RLS 收斂將 `attendance` 的 `att_self` 寫成僅 `for select`，教練對自己的出勤只能讀不能寫，`punchOut()` 的 upsert 被擋。同份 migration 的 `punch_requests` 用相同條件卻給 `for all`，判定為漏寫。已比照改為 `for all`，範圍仍限縮 `emp_id = current_employee_id()`。
  - **使用者已實測：教練下班打卡正常。**
- ✅ **清除舊版（Codex 時代）遺留**：刪除 24 個檔案、15,113 行（`js/app.js`、`css/app.css`、`assets/` 舊品牌圖、重複的啟動檔、5 月份文件 16 份）。`README.md` 改寫為現況；`CLAUDE.md` 修正「`docs/` 為舊版遺留」的錯誤描述。
- ✅ **首頁總覽改版**：KPI 由 5 格併為 3 格（今日課堂含已完成/未完成明細）、消除卡片下方空白（stretch + 內容靠上所致）、教練任務只列今天有課者、圓餅圖圖例不再斷行。
- ✅ **Slime Layout Engine Phase 10.2a**：建立 `.slime-flow` / `.slime-card` / `.slime-stack` CSS 原語（見 `index.html` 內詳細註解）。採 flex-wrap 而非 grid auto-fit，因規格要求逐卡宣告 min/max/grow/shrink。
- ✅ **Slime Phase 10.3（試點）**：`.mc-main-row`（教練任務 + 值班/圓餅）改用 `.slime-flow`，移除 1100px 視窗斷點。順帶修掉「側邊欄於 1080px 隱藏、容器變寬 200px 但舊斷點不知情仍堆疊」的問題。**使用者已確認並排正常。**
- ✅ **平板側邊欄收成圖示列**：601~1080px 原本改放改版前的橫向 `.navbar-row`（等於平板維護第二套導覽、視覺回到舊設計）。改為同一個側邊欄收窄成 64px rail。

## 4. 待辦

### 立即

1. **正式站抽驗剩餘項目**：管理員登入 → 各頁（首頁/預約/會員/財務/營運分析）確認無因 RLS 收緊而空白；建立/取消各一筆確認扣退票、發點、吐司。
   （**簽到已由使用者實際操作多筆確認正常**；**教練下班打卡已確認正常**。）
2. **驗證 `v260716.2235` 的平板圖示列**：拉窄視窗至 ~1080px，確認側邊欄平滑收成 64px、圖示 tooltip 正常、帳號選單往右展開不被裁切。
3. **今日（7/16）三筆 `clock_out` 為 null**：黃美蓉 09:34、曹智詠 15:52、鄭百益 15:56 上班打卡後，因上述 RLS 漏寫而無法下班打卡。政策已修，**由教練自行補打卡或送補卡申請**。

### 接續開發

4. **Slime Phase 10.3 未完**：首頁還有兩套版面未收斂 —— `.mc-hero-top`（flex + 寫死 `min-width:520px`）、`.mc-grid2`（`1fr 1fr` + 900px 斷點）。
5. **Slime Phase 10.2b（FLIP 平滑動畫）**：規格要求「拖曳視窗時卡片需平滑流動」。CSS 重排為瞬間跳位，需 JS 記錄前後位置再反向 transform。**建議最後做** —— 只在拖曳視窗大小時看得到，櫃台/教練固定視窗不會觸發，投報率最低、風險（效能、閃爍）最高。
6. **Slime Phase 10.4 / 10.5**：預約行事曆、其餘管理頁套用。
7. **Dashboard V1.1 微調**（規格書列 5 項，已完成 2 項）：
   - ✅ 圓餅圖 Legend 靠近圖表 8~12px
   - ✅ 今日教練任務相關（改為只列有課教練）
   - ⬜ 今日值班區塊增加 20~30px 寬度
   - ⬜ 今日教練任務卡片統一高度
   - ⬜ 提醒事項加入優先級 Badge（紅/橘/綠）與 Icon
   - ⬜ 手機版教練任務改橫向滑動
8. （未來）會員登入上線時，啟用已預留的會員自我隔離 RLS 政策。

## 5. 已知問題（評估後暫不處理）

- **22:00 起始的預約在行事曆上看不見**：格線為 `mm < CAL_END_H*60`，最後一格 21:30，22:00 的課落在可視範圍外。
  早上側有 Phase B 動態展開處理（有早課自動往前長），**結束時間卻寫死**，無對稱機制。
  正式庫現況：全 1,449 筆有效預約中僅 **2 筆**（`IMP-01224` 5/28、`IMP-01200` 5/29），皆為 5 月匯入的舊資料、皆已完成。
  無營運影響（課已上完、票已扣），統計不受影響（直接讀 DB）；唯一症狀是翻回那兩週看不到那兩堂。
  修它需做整套動態結束展開（改 6 處寫死的 `CAL_END_H`，牽動拖曳上限與現在線），為 2 筆舊資料不划算。
  **若日後要開放 22:00 後的晚間課程，再一併處理**（動態展開 + `＋` 入口 + `bkTimeOptions` 延長至 23:00）。
  註：預約表單 `bkTimeOptions` 目前允許 08:00~22:00，故 22:00 的課「建得出來卻看不見」。

## 6. 回退方法（都很快）

- 某 RPC 流程出問題 → `index.html` 對應旗標改回 `false`、commit、push → ~30 秒生效。
- 前端改版有問題 → `git revert <commit>` 後 push → 1~2 分鐘生效。
- 某頁因 RLS 讀不到資料 → 對該表補開放政策：`create policy <t>_all on <t> for all using (true) with check (true);`（Supabase SQL Editor 或 MCP 執行，秒生效）。
- 資料庫 RPC / 政策若需還原 → 各 migration 檔內附回退語法。

## 7. 在新電腦接手的步驟

1. 安裝並登入 Claude Code（用你的 claude.ai 帳號；Supabase MCP 會隨帳號連上）。
2. `git clone https://github.com/TYehYu/yugym-booking-system-app.git`
3. 設定 git 身分：`git config --global user.name "..."`、`git config --global user.email "..."`
4. 若要用 gh CLI：`gh auth login`（帳號 TYehYu）。**注意**：Windows 上中文路徑會被編碼弄壞，腳本請放純英文路徑；輸入 `!` 指令前先按 Shift 切英文輸入法，否則會打成全形 `！` 而無反應。
5. 開新的 Claude Code 對話時，請它先讀 `CLAUDE.md` 與本 `docs/HANDOFF.md`。
6. **資安鑑識紀錄與測試帳密不在 repo 內** —— 在原機器的 `PRIVATE_DO_NOT_UPLOAD_security-incident-20260716.md`，換機器需另行複製（勿透過公開管道傳送）。
7. 本機預覽：點兩下 `開啟預約系統.bat`（埠 8765），或 `python -m http.server`。
   **`config.js` 決定連哪個庫，本機那份目前指向測試庫**（見 §2）。

## 8. 重要慣例（同 CLAUDE.md）

- 資料存取只走 `dbGetAll/dbGet/dbPut/dbDel`；`coaches` 別名對應 `employees`。
- `dbGetAll` 的 `.range()` 分頁不可拆（否則大表被截斷）。
- 改版更新 `APP_VERSION` / `APP_VERSION_LABEL`（格式 `YYMMDD.HHmm`）。
- 不搬真實會員個資到測試環境或本機。
- **新增 `SECURITY DEFINER` 函式時**：務必明確 `REVOKE EXECUTE FROM PUBLIC, anon`（勿依賴預設值）、只 GRANT 給實際需要的角色、函式內以 `is_any_staff()` / `current_member_id()` 檢查呼叫者身分。**RLS 綠燈不代表此路徑安全**，兩者需分別驗證。
- **GitHub Pages 快取 `Cache-Control: max-age=600`**：推版後看到舊版屬正常，按 `Ctrl+Shift+R` 強制重新整理，或等 10 分鐘。
