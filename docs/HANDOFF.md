# YUGYM 交接說明（跨機器接續）

> 更新：2026-07-17 深夜（收工）。此檔隨 repo `git clone` 帶走，讓另一台電腦（或新的 Claude Code 對話）快速接手。
> **repo 為公開**，本檔不放任何密碼、不放漏洞細節。測試帳密與資安鑑識紀錄見專案根目錄
> `PRIVATE_DO_NOT_UPLOAD_security-incident-20260716.md`（受 `.gitignore` 保護，不進版控，只在本機）。

---

## 1. 現在的狀態（一句話）

Sprint 2/3 已上線穩定運作；7/17 完成首頁改版（Dashboard V2）、一輪一日流程測試，修掉數個真 bug
（教練課可無教練、手機撞號、票券到期日顯示 null、切頁重複撈取造成 LAG、錯誤訊息露出 SQL 原文），
全部已上線。**線上版本 `260717.2231`**。

## 1.5 今天（2026-07-17）做了什麼

**首頁改版 Dashboard V2**（依使用者「首頁資訊更新」設計稿）：Hero 只留問候＋時鐘、狀態卡帶 4 個 KPI、
右欄「今日待辦事項」＋「快速操作 2×2」、教練任務列不再捲動（有幾位長多少）。移除今日營收 KPI、
課堂類型圓餅圖、今日值班卡（皆經使用者確認）。窄視窗以 @container 換行、右欄撐滿。清掉 −120 行死碼。
Slime 10.3 收尾（Hero／工作中心／提醒改用 .slime-flow）。

**一日流程測試發現並修掉的 bug（皆已上線、皆在測試庫或正式庫規模驗證過）：**
1. **教練課可以沒有教練** —— 從「新增預約」建教練課，教練欄不出現、送出建立 coach_id=null 的私人
   教練課、票照扣。根因：needCoach 判斷依賴後台可設的 requires_coach 旗標，而「VIP 教練課」「限定
   教練課」該旗標為 false。改以 category 為準（bkNeedCoach()）。正式庫「限定教練課」尚有 10 堂可用，
   是活的風險 —— 程式已修，但這兩筆資料的 requires_coach 建議一併改為 true（見 §4）。
2. **手機號撞號 + 無格式驗證** —— 建會員時手機未 normPhone、無格式驗證，'abc' 也能建；且
   0912345678 與 0912-345-678 重複檢查測不到卻登入時撞同一帳號。已在存檔前正規化＋驗 ^09\d{8}$。
3. **票券到期日 null 顯示成字串 "null"** —— 正式庫 2,229 筆有 2,073 筆無到期日（舊方案「永久有效」）。
   新增 fmtExpire()，統一顯示「永久有效」。
4. **切頁 LAG** —— dbGetAll 無快取，refreshNavBadges 每次切頁重複撈 bookings/purchase_applications。
   加 8 秒 TTL 快取＋寫入即失效（含三條 RPC）。切頁網路請求 8→6、後續切頁 0。
5. **錯誤訊息露出 SQL 原文** —— 教練打卡失敗看到「new row violates row-level security policy...」。
   資料層統一翻譯（dbFriendlyError）＋表名對照＋showToast 可設時長。這正是 7/16「教練說有打卡」的成因。

**票券頁 UX**：會員票券列表加搜尋／狀態篩選／限筆 100；發放票券的 432 選項 <select> 加即時搜尋；
快速操作「售票/儲值」直接落在「會員票券」分頁（原本落在空的購買申請分頁）。

**行事曆流程驗證通過**（取消退票、簽到發點）：24h 外取消退 1 堂、24h 內不退；教練課簽到發自主訓練
2 點、效期 7 天自課程日起算 —— 完全符合票券規格 V4。ticket_logs 帳本 deduct/refund/grant 皆成對正確。

## 2. 正式環境

- GitHub：`TYehYu/yugym-booking-system-app`（公開，主分支 `master`）。**推 master = 上線**（GitHub Pages，1~2 分鐘生效）。
- 正式網址：https://tyehyu.github.io/yugym-booking-system-app/
- Supabase 正式：`rlpiomzplckzqnqrvrwc`（含真實會員資料，**勿搬個資到本機/測試**）。
- Supabase 測試：`kucvxpjatptfckhlxptj`（`yugym-sprint3-test`，免費，schema 與正式 1:1）。
  **已決定長期留用**（靠它重現問題、驗證修補）。帳密見上述 PRIVATE 檔。
  測試時灌大量假資料驗證正式庫規模，一律用可辨識前綴（`BK-SEED17-*`/`m-BULK17-*`/`TK-BULK17-*`）
  方便一鍵清除；今天所有測試資料已清乾淨，僅保留 `BK-SEED17-*`（18 筆今日課）與 `SH-SEED17-*`
  （3 筆排班）供下次示範首頁用，不需要可 `delete from bookings where id like 'BK-SEED17-%'` 清除。
- 前端旗標（`window.FEATURE_FLAGS`）**全開**：`createBookingRpc / cancelBookingRpc / checkinBookingRpc`。
- ⚠️ **本機 `config.js` 目前指向測試庫**，並以 `git update-index --skip-worktree config.js` 防止誤推
  （線上那份仍正確指向正式庫）。要改回正式庫：檔內註解留有原始設定；解除保護用
  `git update-index --no-skip-worktree config.js`。
- ⚠️ **快取層（commit 4d3f5e7）動的是全系統唯一資料入口 dbGetAll，影響每一頁**。若上線後出現
  「資料沒更新／看到舊資料」，第一個懷疑它，可 `git revert 4d3f5e7` 快速回退。日後新增 RPC 或
  直接 sb.from().insert/update/delete 時，務必比照加 dbCacheClear()。

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

### 🔴 等使用者決策（都是正式庫資料異動，我未擅自執行）

1. ~~**「VIP 教練課」「限定教練課」的資料歸屬**~~ **✅ 已結（2026-07-18）**：使用者澄清這兩者
   **就是一般教練課，只是當初用活動價格另立票種，且皆已停售**（`sellable=false`、`is_legacy=true`、
   `category=私人教練`、`benefit_type=coaching_session`）。故**無資料模型遷移需求** —— 沒有獨立的
   「VIP/限定方案」概念要搬進 `course_plans`，就是兩筆退役的教練課票種，67 張既有票（VIP 46、限定 21）
   照常使用即可。唯一筆誤 `requires_coach=false` 已於 2026-07-18 補為 `true`（正式庫，經使用者同意執行；
   回退＝改回 false）。預約行為昨天已由 `bkNeedCoach()` 看 category 修正，此次僅補齊後台顯示一致。
2. **1,016 堂「永久有效」票券**：正式庫 2,073 筆無到期日票券（250 筆仍有剩餘、共 1,016 堂、涉 412 位
   會員）。使用者已確認**這是舊方案的賣法（以前賣永久有效）**，非資料缺漏 —— 顯示已改為「永久有效」。
   **無需補資料**；但若日後要讓舊票也有效期，這批是對象。

### 立即

3. **正式站抽驗 Dashboard V2**：管理員登入正式站 → 首頁確認狀態卡 4 KPI、教練任務列、待辦、快速操作
   正常；各頁（預約/會員/財務/營運分析）不因改版而異常。（今天在測試庫已充分驗證，正式站僅需目視。）
4. **7/16 鄭百益的 `clock_out` 為 null**：仍未補（黃美蓉、曹智詠已於 7/16 補齊）。**由教練自行補打卡
   或送補卡申請** —— 出勤紀錄不由系統代填。今天已修「打卡失敗訊息看不懂」的根因（§1.5 第 5 點），
   日後再發生會顯示人話＋引導「請改用申請補打卡」。

### 接續開發

5. **票券系統 V4**（規格已存 `docs/TICKET_SYSTEM_V4_SPEC.md`，尚未實作）：方案（Plan）與會員票券
   （快照）分離、後台 CRUD／停用／封存、分期規則。動工前先做文末的現況落差分析。上述待辦 #1 併入此。
6. **RPC 未檢查票券到期日**：`fn_create_booking/checkin/cancel` 定義中無 expire 字樣，到期檢查只在
   前端。永久有效票不受影響，但這與 7/16 的授權漏洞同類（前端擋 ≠ 系統擋）。若日後票券恢復有效期，
   應在 `fn_create_booking` 補到期檢查。
7. **Slime Phase 10.2b（FLIP 平滑動畫）／10.5（其餘管理頁）**：10.2b 只在拖曳視窗大小時看得到，
   投報率最低、風險最高，建議最後做。**10.4（行事曆）已評估為不適用**——行事曆日欄要壓縮不換行，
   套 slime 會破壞功能；當時另發現並修掉一個 `window.innerWidth` 估算欄寬的舊 bug（見下）。
8. **Dashboard V1.1 微調剩餘項**（改版後多數已被 V2 取代，重評估）：手機版教練任務改橫向滑動、
   提醒事項優先級 Badge（V2 待辦卡已用顏色分級，可視為部分達成）。
9. （未來）會員登入上線時，啟用已預留的會員自我隔離 RLS 政策。

## 5. 已知問題（評估後暫不處理）

- **行事曆課卡字級分級用 `window.innerWidth` 估算欄寬**（`index.html` 約 8299 行）：
  `colW = (window.innerWidth - 80) / nDays` 用視窗寬冒充容器寬，未扣側邊欄（232/64px）與 content
  padding，高估約 24%（1400px 視窗、7 日檢視：估 189px vs 實際 152px）。後果：該縮字的課卡沒縮，
  同時段兩張卡並排時字會擠出來。且渲染時只算一次、resize 不重算。正解是量測 `.cal-daycol` 實際
  `getBoundingClientRect().width` 或改 CSS container query。**今天探查 Slime 10.4 時發現，尚未修**
  （非新問題，一直存在；影響是美觀而非功能，故未擋上線）。

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
