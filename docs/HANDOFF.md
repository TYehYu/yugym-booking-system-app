# YUGYM 交接說明（跨機器接續）

> 更新：2026-07-16 晚間。此檔隨 repo `git clone` 帶走，讓另一台電腦（或新的 Claude Code 對話）快速接手。
> **repo 為公開**，本檔不放任何密碼。測試帳密另由使用者口頭/私下保管。

---

## 1. 現在的狀態（一句話）

Sprint 2（RLS 安全收斂）+ Sprint 3（預約/取消/簽到改走資料庫 RPC）**已於 2026-07-16 晚間正式上線**，線上版本 `260716.1830`，運作正常。

## 2. 正式環境

- GitHub：`TYehYu/yugym-booking-system-app`（公開，主分支 `master`）。推 master = 上線（GitHub Pages）。
- 正式網址：https://tyehyu.github.io/yugym-booking-system-app/
- Supabase 正式專案：`rlpiomzplckzqnqrvrwc`（含真實會員資料，**勿搬個資到本機/測試**）。
- 前端旗標（`index.html` 的 `window.FEATURE_FLAGS`）目前**全開**：`createBookingRpc / cancelBookingRpc / checkinBookingRpc`。

## 3. 已完成 / 進度

- ✅ Sprint 1 盤點、2.5 票券對應：見 `docs/SPRINT1_SYSTEM_AUDIT.md`、`docs/SPRINT2_5_BENEFIT_MAPPING_AUDIT.md`
- ✅ Sprint 2 RLS 收斂：設計 `docs/SPRINT2_RLS_DESIGN.md`、`docs/SECURITY_MODEL.md`；測試 `docs/SPRINT2_RLS_TEST_RESULTS.md`；已套正式（`docs/migrations/20260716_03_rls_hardening.sql`）。未登入讀 members/tickets 已為 0。
- ✅ Sprint 3 RPC 切換：計畫 `docs/SPRINT3_RPC_MIGRATION_PLAN.md`；測試 `docs/SPRINT3_RPC_TEST_RESULTS.md`；前端狀態 `docs/SPRINT3_FRONTEND_STATUS.md`；正式已套 `docs/migrations/20260716_01_*.sql`、`_02_*.sql`。
- ✅ Baseline schema（補回 migration 歷史）：`docs/migrations/0000_*.sql`、`0001_*.sql`
- ✅ **RPC 授權收斂（2026-07-16 深夜，已套正式）**：`docs/migrations/20260716_04_rpc_authz_hardening.sql`
  - 背景：`fn_*` / `benefit_*` 皆為 SECURITY DEFINER（設計上繞過 RLS），但 EXECUTE 沿用 PostgreSQL 預設值（授予 PUBLIC），且身分檢查不一致（僅 `fn_checkin_booking` 有做）。Sprint 2 的 RLS 只約束直接讀寫資料表，不涵蓋此路徑。
  - 修法：內部函式（`benefit_consume/benefit_refund/handle_checkin_reward/space_check/rls_auto_enable`）收回外部 EXECUTE；`fn_create_booking`/`fn_cancel_booking` 補身分檢查（比照 `fn_checkin_booking`）；三支前端 RPC 收回 anon、僅 authenticated 可呼叫。詳見 migration 檔內說明與檢查清單。
  - 已驗證：測試庫未登入呼叫全擋（42501）、員工建立/簽到/取消三流程正常（扣退票正確）、會員無法越權操作他人資料（AUTH.FORBIDDEN）；正式庫已確認並比對授權矩陣。
  - 查核：正式庫 `ticket_logs` 全數為正常人員操作，無異常紀錄。
- ✅ **教練無法下班打卡修復（已套正式）**：`docs/migrations/20260716_05_fix_attendance_self_write.sql`
  - Sprint 2 RLS 收斂將 `attendance` 的 `att_self` 寫成僅 `for select`，教練對自己的出勤只能讀不能寫，`punchOut()` 的 upsert 被擋。同份 migration 的 `punch_requests` 用相同條件卻給 `for all`，判定為漏寫。已比照改為 `for all`，範圍仍限縮 `emp_id = current_employee_id()`。。

## 4. 待辦（接手後要做的）

1. **使用者用真帳號在正式站抽驗**：管理員登入 → 各頁（首頁/預約/會員/財務/營運分析）確認無因 RLS 收緊而空白；建立/取消/簽到各一筆確認扣退票、發點、吐司正常。
2. 抽驗無誤後 **刪除測試專案** `yugym-sprint3-test`（`kucvxpjatptfckhlxptj`，免費，用完即刪）。
3. （未來）會員登入上線時，啟用已預留的會員自我隔離 RLS 政策。

## 5. 回退方法（都很快）

- 某 RPC 流程出問題 → 把 `index.html` 對應旗標改回 `false`、commit、`git push` → ~30 秒生效。
- 某頁因 RLS 讀不到資料 → 對該表補開放政策：`create policy <t>_all on <t> for all using (true) with check (true);`（Supabase SQL Editor 或 MCP 執行，秒生效）。
- 資料庫 RPC 若需還原 → 各 migration 檔內附說明，`create or replace` 回舊版即可。

## 6. 在新電腦接手的步驟

1. 安裝並登入 Claude Code（用你的 claude.ai 帳號；Supabase MCP 會隨帳號連上）。
2. `git clone https://github.com/TYehYu/yugym-booking-system-app.git`（整包程式+文件+migration 都到手）。
3. 設定 git 身分：`git config --global user.name "劉怡秀"`、`git config --global user.email "lamboruni@gmail.com"`。
4. 若要用 gh CLI：重新 `gh auth login`（帳號 TYehYu）。
5. 開新的 Claude Code 對話時，請它先讀 `CLAUDE.md` 與本 `docs/HANDOFF.md`。
6. 本機預覽測試（可選）：`python3 -m http.server`（`config.js` 已在同層，指向正式庫——**注意：本機測試若連正式庫會動到真實資料，建議改指測試庫或另建假資料**）。

## 7. 重要慣例（同 CLAUDE.md）

- 資料存取只走 `dbGetAll/dbGet/dbPut/dbDel`；`coaches` 別名對應 `employees`。
- `dbGetAll` 的 `.range()` 分頁不可拆（否則大表被截斷）。
- 改版更新 `APP_VERSION` / `APP_VERSION_LABEL`（格式 `YYMMDD.HHmm`）。
- 不搬真實會員個資到測試環境或本機。
