# 正式庫部署手冊（只建檔，**尚未授權、尚未執行**）

正式庫 `rlpiomzplckzqnqrvrwc`（叢集識別 7637215626725903220）。每個檔案都在最前面守門：叢集識別不符或缺 `change_log`／`fn_table_sigs` 就直接中止。**每一階段都要你另外明確授權**，且前一階段已部署並驗證通過。

## 順序與相依

| 階段 | 內容 | 前置條件（檔內自動檢查） | 部署後驗證（唯讀） | 失敗回復 |
|---|---|---|---|---|
| 00 | 部署前唯讀檢查 | — | `00_prod_precheck_readonly.sql`，記下票券雜湊與各表筆數 | — |
| 01 | P0-C `fn_move_booking_ticket` | 函式不存在；依賴函式與 bookings 欄位齊全 | `01_p0c_verify_readonly.sql` | `01_p0c_rollback_prod.sql`（drop 函式；前端須先退回舊版） |
| 02 | P0-E 簽到才啟用（15 函式＋4 觸發器＋`activation_mode` 欄位） | 無 `fn_tk_*`／`trg_tk_*`／欄位；`desk_alert` 等依賴在；`notify_recipient` 含 `desk` | `02_p0e_verify_readonly.sql`（函式 15、觸發器 4、欄位 1、API 角色無權限、票券雜湊不變） | `02_p0e_rollback_prod.sql`（刪觸發器與函式；**預設保留欄位**；後續階段要先回復） |
| 03 | TKWIN 銜接修補（P0-C RPC 放行 `TKWIN.%`＋略過預約端檢查旗標） | RPC 是 P0-C 原版（指紋＋ACL）；P0-E 已部署 | `03_tkwin_verify_readonly.sql` | `03_tkwin_rollback_prod.sql`（還原 P0-C 原版） |
| 04 | 教練請假補償（4 函式；取代 `fn_tk_activate`／`fn_tk_recalc`） | 兩支重算函式是 P0-E 原版（指紋） | `04_comp_verify_readonly.sql` | `04_comp_rollback_prod.sql`（還原兩支原版；補償帳本保留） |
| 06 | 分期額度防護觸發器＋原子退票 `fn_refund_ticket`（升級 `fn_tk_refund_once` 為向下相容版） | `fn_tk_refund_once` 是 P0-E 原版（指紋）；新物件不存在 | `06_quota_refund_verify_readonly.sql` | `06_quota_refund_rollback_prod.sql` |
| 07 | `benefit_refund` 補鎖（修並行雙退） | 現行本體＝2026-11-15 盤點版（指紋 dbe63afe…:736） | 指紋＝補鎖版、ACL 不變（檔內後置檢查） | `07_benefit_refund_lock_rollback_prod.sql` |
| 前端 | `index.html`（含 `fn_refund_ticket`、額度訊息、P0-C／P0-E／補償接線） | **01、02、03、04、06 全部完成** | 真實登入各角色手動走一遍（見下） | 退回舊版 `index.html` 重新部署（約 1–2 分鐘） |
| 05 | 歷史效期補正（`05_backfill_…PROPOSAL_NOT_EXECUTED.sql`） | 02 已部署並驗證；**另外取得你的正式庫寫入授權**；先重跑乾跑確認清單 | 乾跑清單前後比對 | 補正有逐筆痕跡帳；以票券 id 逆向還原日期 |

反向回復順序：前端 → 06／07 → 04 → 03 → 02 → 01。`02` 的回復檔會檢查後續階段是否還在，還在就中止。

## 為什麼前端一定要最後
新前端的 `refundTicket` 只走 `fn_refund_ticket`；RPC 不存在時退課會失敗（會提示補退）。舊前端配新資料庫是相容的：舊前端自己啟用效期（P0-E 規則對這些票不生效）、舊 `refundTicket` 仍可退款、額度不足時只會顯示通用錯誤。所以資料庫階段先上、空窗期內不會壞，只是新規則還沒完全生效。

## 執行注意
- 低流量時段；每個檔案已 `set local lock_timeout='5s'`，拿不到鎖就整段回滾，沒有影響。
- 票券雜湊後置檢查若因「套用期間有人改票券」失敗，同樣整段回滾，重跑即可。
- 02 會對 `member_tickets` 加一個可為空、無預設值的欄位（metadata-only）；06 會新增一個 `member_tickets` 的 BEFORE UPDATE 觸發器（只在三個欄位變動時才觸發）。
- 02 之後 `member_tickets` 的整列雜湊會變 → `fn_table_sigs` 簽章變，**可能**讓所有人下次載入時整表重抓一次（4674 列；推測，未驗證）。
- 部署後前端手動驗收（真實登入）：櫃檯／教練／會員各預約、簽到、撤銷、取消退課、教練請假與復原；分期票預約第 N+1 堂應被擋並顯示人話；同一預約雙擊取消只退一次。
- 本目錄的所有 SQL 都沒有在正式庫執行過；測試庫上通過的是各階段對應的測試，**併發與真實 HTTP／登入角色尚未驗證**。
