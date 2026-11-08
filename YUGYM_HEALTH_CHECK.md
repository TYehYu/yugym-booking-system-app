# YUGYM 健檢報告

> 建立：2026-11-01。範圍：安全健檢＋預約建立／堂數扣除核心流程初步檢查。
> 方式：讀取正式庫（`rlpiomzplckzqnqrvrwc`）結構與唯讀 SQL 查詢、閱讀 `index.html` 原始碼。
> **未修改任何程式碼或資料庫內容**（pg_net 一項曾嘗試一次 migration，詳見下方）。

---

## 1. 安全健檢

### 1.1 pg_net WARN（已知例外，不處理）

- Supabase 顧問回報：`pg_net` 擴充套件的目錄位置顯示在 `public` schema。
- 實查：`pg_net` 的所有函式與資料表（`http_post`／`http_get`／`http_request_queue` 等）其實都已經在 `net` schema，不在 `public`；只有擴充套件本身的 metadata 指標指到 public，不影響實際呼叫路徑。
- 嘗試修正：`alter extension pg_net set schema net;` → 失敗，報錯 `cannot move extension "pg_net" into schema "net" because the extension contains the schema`（`net` schema 本身是這個擴充套件建立出來的成員物件，無法把擴充套件搬進自己建立的 schema，屬循環依賴）。
- 真正要清掉這條 WARN 需要整個 drop/recreate pg_net，牽動 5 個正式排程（LINE 推播 ×3、發票字軌同步、line-auth-warm）與既有 `http_request_queue` 資料，風險遠高於這條 WARN 本身代表的安全效益。
- **結論：列為已知平台限制，不處理，不需再排查。**

### 1.2 22 張舊表的 anon 權限

- 以下舊表對 `anon`（未登入）角色開了完整 `SELECT/INSERT/UPDATE/DELETE`：`members`、`employees`、`member_tickets`、`purchases`（已實查這 4 張；`contracts` 只開了 REFERENCES/TRIGGER/TRUNCATE，沒有 DML）。CLAUDE.md 記載這類舊表共 22 張，屬 baseline 時代遺留慣例，新表不會跟進。
- 這批表**完全靠 RLS policy 擋著**，權限層本身沒有防線。已逐條核對 `members`／`employees`／`member_tickets`／`purchases` 的 policy，全部正確要求 `auth.uid()` 或 `is_admin()`/`is_staff_desk()` 等身分判斷，anon（`auth.uid()` 必為 null）在目前的 policy 寫法下一律會被擋下。
- 未逐一核對其餘 18 張舊表的 policy 內容（只核對了上述 4 張 + CLAUDE.md 口頭記載的清單）。

### 1.3 已確認的 RLS 防護

- 全部 `public` schema 的表都已啟用 RLS（查無任何 `relrowsecurity=false` 的表）。
- 查無任何 `qual` 等同 `true`（無條件放行）的 policy。
- 抽查 7 支高風險 `SECURITY DEFINER` 函式（`fn_admin_delete_member`、`fn_cancel_booking`、`fn_create_booking`、`fn_staff_apply`、`fn_member_self_venue`、`fn_member_leave_group`、`fn_complete_member_registration`），內部都有正確的身分檢查（`current_staff_role()='admin'`、`current_member_id()` 比對、`auth.uid()` 非空等），anon/未登入呼叫這些 RPC 時會被內部邏輯擋下，不是只靠 GRANT 層。
- 程式碼（`index.html`／`config.js`）內沒有找到硬編碼的 service_role key 或其他機密；只有公開的 publishable key 與 LINE LIFF/Channel ID（本來就設計成公開值）。

---

## 2. 預約容量檢查與建立預約之間的競態條件

- `fn_create_booking` 呼叫 `space_check()` 檢查教練／場地／空間是否衝突，`space_check` 內部只用 `SELECT count(*)` 查詢現有 `bookings` 是否重疊，**沒有加鎖**（無 `FOR UPDATE`，也沒有 advisory lock）。
- 查過 `bookings` 表的 constraint：**沒有任何 unique 或 exclusion constraint** 能在資料庫層面防止同一教練／場地在重疊時段出現兩筆有效預約。
- 代表兩筆幾乎同時送出的建立預約請求（例如兩位櫃檯幾乎同時搶同一教練同一時段），理論上都可能通過 `space_check` 的檢查、再各自完成 `INSERT`，造成超約。
- **尚未驗證**：是否曾在正式環境實際發生過（未查 `bookings` 表是否存在教練/場地重疊的既存髒資料；上次場地容量漏算是另一個不同成因的既修問題，不是這一個）。

---

## 3. 票券扣課順序與購買順序不一致

- `benefit_consume()`（一般預約扣課用的 FIFO 選票邏輯）用 `ORDER BY mt.expire_date ASC NULLS LAST` 選要扣的票，不是按購買／建立順序。
- 專案慣例（`yugym-deduct-order-rule.md`）記載的定版規則是「照購買順序扣課」，兩者是不同的鍵。
- 實查正式庫：目前可用（`status='usable'` 且 `sessions_remaining>0`）的票券中，依會員＋`benefit_type` 分組比較「購買順序」與「到期順序」，**有 40 組不一致**（總候選 1611 組）。最常見成因推測是展延（展延會推後 `expire_date`，但不會改變原始購買順序），但**未逐筆回溯每一組不一致的實際原因**，也未驗證這 40 組是否真的造成過「扣錯票」的實際後果（只確認了排序鍵本身的落差，沒有去追扣課紀錄是否因此選到非預期的票）。

---

## 4. 櫃檯與教練建立重複預約的潛在問題

- 會員自行預約自主訓練用的 `fn_member_self_book`，有擋「同一會員同時段已有其他非自主訓練預約」（`BOOKING.DUP`）。
- 櫃檯／教練建立預約用的 `fn_create_booking`，呼叫的 `space_check()` 只檢查「教練時間衝突」與「空間/資源衝突」，**完全沒有檢查「同一會員」是否已有時段重疊的其他預約**。
- 代表理論上同一位會員可能被（櫃檯或教練操作）排進兩個不同教練、彼此重疊的時段，系統不會擋下。
- **尚未驗證**：正式資料庫中是否已存在這種同會員重疊預約的既存案例；也未確認這是刻意設計（例如允許會員同時約教練課＋旁聽團課）還是純粹遺漏。

---

## 5. 優先級、證據與建議處理方式

| # | 問題 | 優先級 | 證據 | 尚未驗證 | 建議處理 |
|---|---|---|---|---|---|
| 1 | pg_net 擴充套件目錄位置 WARN | 低（知悉即可） | Supabase 顧問 WARN＋實際函式位置核對＋嘗試修正的錯誤訊息 | — | 列為已知例外，不處理 |
| 2 | 22 張舊表 anon 有完整 DML 權限 | 中（已有 RLS 擋著，但是單層防線） | `information_schema.role_table_grants`（4 張已查）＋對應 policy 內容核對 | 其餘 18 張舊表的 policy 未逐一核對 | 不急著改既有表（CLAUDE.md 明確警告過改既有 grants 的風險），列入下次 Supabase 排程性安全複查的項目 |
| 3 | 建立預約的競態條件（無鎖＋無 constraint） | 中高（會員與營運影響：超約） | `space_check` 原始碼無 `FOR UPDATE`；`bookings` 表無 unique/exclusion constraint | 未查正式資料是否已有重疊預約的既存案例；未評估實際併發機率（可能櫃檯操作頻率低，風險視窗小） | 建議安排獨立時段設計修正（例如用 advisory lock 包住 `space_check`+`INSERT`，或補 exclusion constraint），需要完整測試輪，不建議順手改 |
| 4 | 扣課順序（到期日）與購買順序不一致 | 中（與定版規則衝突，但多數情況結果相同） | 正式庫查詢：1611 組候選中 40 組排序不同 | 未回溯這 40 組的具體成因與是否已造成扣錯票的實際案例 | 建議先抽查這 40 組的扣課紀錄，確認是否已造成實際影響，再決定要不要調整 `benefit_consume` 的排序鍵 |
| 5 | 櫃檯/教練建立預約未擋同會員時段重疊 | 中（資料完整性與現場排課風險） | `fn_create_booking`／`space_check` 原始碼比對 `fn_member_self_book` 的對照檢查 | 未確認是否為刻意設計；未查正式資料是否已有重疊案例 | 先跟使用者確認這是否為刻意放行（例如允許會員同時掛兩個教練的課），再決定要不要補檢查 |

---

**本文件由唯讀查核彙整而成，第 1.1 節的 pg_net migration 嘗試是本次對話中唯一一次寫入操作（已失敗、未變更任何內容）。其餘所有項目皆未修改程式碼或資料庫。**
