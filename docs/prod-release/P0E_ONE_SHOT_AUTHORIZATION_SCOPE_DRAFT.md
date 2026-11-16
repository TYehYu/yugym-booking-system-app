# P0E 正式上線｜一次授權範圍（rev4；驗收證據已齊，待使用者一次批准）

對象：正式庫 `rlpiomzplckzqnqrvrwc` 與正式站（master → GitHub Pages）。**本檔是範圍，不是已執行。** 使用者一次批准＝批准下列明列的步驟、驗證與回復；範圍外一律不做。批准後由 Claude 執行、Codex 驗收。
固定版本：分支 `release/p0e-frontend-20261116`、基底 `origin/master 0ced889`（已確認無新提交）、前端版本 261118.2300；所有檔案雜湊見 `FINGERPRINTS.sha256`，證據見 `FINAL_ACCEPTANCE_EVIDENCE.md`。

## A. 開始前（任一不符＝不開始）
1. 再次 `git fetch`：`origin/master` 必須仍是 `0ced889`。若有新提交 → **只審查受影響差異**（特別是 `index.html` 重疊處），審完才繼續；不覆蓋、不強推。
2. `FINGERPRINTS.sha256` 逐項比對通過（含 `index.html` 與各階段 SQL）。
3. 跑 `00_prod_precheck_readonly.sql`（唯讀）重新記錄基準：各階段物件是否已存在、`09` 待查異常清單筆數（上次 17 筆歷史資料）、票券與帳本雜湊。**已存在的階段不重裝**；若某階段「半裝」（只有部分物件）＝停止回報。
4. 開始前告知門市：預計 1–2 分鐘的 GitHub Pages 切換期間請勿同時做扣堂與取消（非強制，只是降低並存期風險）。

## B. 資料庫安裝順序（全部在前端發布之前；每階段：套用 → 同階段唯讀驗證 → 通過才下一階段）
| 順序 | 檔案（`docs/prod-release/`） | 內容 | 舊前端在線時的影響 |
|---|---|---|---|
| 1 | `01_p0c_apply_prod.sql` → `01_p0c_verify_readonly.sql` | `fn_move_booking_ticket`（P0-C 調課） | 無（舊前端不呼叫） |
| 2 | `02_p0e_apply_prod.sql` → `02_p0e_verify_readonly.sql` | 欄位 `activation_mode`＋4 個觸發器（P0-E 簽到開通） | 未開通票在預約／改日期／扣課帳時做預約窗口檢查，跨度超過效期天數會被擋，舊前端只顯示通用錯誤 |
| 3 | `03_tkwin_apply_prod.sql` → `03_tkwin_verify_readonly.sql` | 取代 P0-C 函式 | 無 |
| 4 | `04_comp_apply_prod.sql` → `04_comp_verify_readonly.sql` | 教練請假補償；取代 `fn_tk_activate`／`recalc` | 無（只被觸發器與新前端呼叫） |
| 5 | `06_quota_refund_apply_prod.sql` → `06_quota_refund_verify_readonly.sql` | 分期額度防護觸發器＋`fn_refund_ticket`（原子退票） | **舊前端櫃檯扣課超過已開通堂數會被擋**（預期；只顯示通用錯誤） |
| 6 | `07_benefit_refund_lock_apply_prod.sql`（無獨立驗證檔，以 00 的函式定義比對確認） | `benefit_refund` 補鎖 | 無 |
| 7 | `08_desk_deduct_apply_prod.sql` → `08_desk_deduct_verify_readonly.sql` | 表 `ticket_deduct_ops`／`booking_op_rev`、`bookings` 上 2 個觸發器、4 支 `fn_desk_*` | 無（舊前端不呼叫）；**新前端必須有它們** |
（`05` 回填與 `05b`：`05` 只是提案、**不執行**；`05b` 陳玟勳單張補正已另案執行並結案。）
每階段套用檔都是單一交易，內含叢集識別守門與事後核對，不符就整段回滾。**停止條件**：任一套用檔報錯、任一驗證檔有任何不符、階段物件數與預期不同 ＝ 立刻停止，不進下一階段，用該階段回復檔回復（前端尚未發布，回復安全）。

## C. 前端發布（所有資料庫階段驗證通過、且你仍在線才做）
1. 在發布分支建立提交（內容＝`git diff --cached origin/master`，與 `FINGERPRINTS.sha256` 一致），合併進 `master` 後 push（**推上 master＝直接上線**）。不使用強推。
2. 等 1–2 分鐘，抓正式站 `index.html` 確認版本 `261118.2300`；頁面可載入。
3. 之後只做唯讀驗證：版本號、頁面載入、唯讀查詢、`09_monitor_cancel_deduct_race_readonly.sql` 與基準比對。**不在正式站新增預約、扣堂或取消退票。**
**停止條件**：版本號沒變、頁面載入錯誤、唯讀查詢出現新異常（`09` 筆數較基準增加）→ 停止並回報；是否回復由你決定（見 D）。

## D. 安全回復（兩種情境；預設一律保留相容的資料庫函式與操作表）
- **D1 前端尚未發布**（資料庫階段安裝中）：依反向順序回復 08 → 07／06 → 04 → 03 → 02 → 01（`*_rollback_prod.sql`，02 的回復檔會檢查後續階段是否還在）。回復 08 前確認 `select count(*), max(created_at) from ticket_deduct_ops` ＝ 0 筆、`index.html` 仍是舊版。兩張表保留、可再次安裝。
- **D2 前端已發布後**：預設＝`git revert` 前端並 push（只影響之後載入的頁面，**已開啟的新頁面不會停**；「一段時間沒有成功紀錄」不能證明舊頁面已消失），**不動資料庫物件**（06／08 函式對舊前端無害，也讓仍開著的新頁面繼續正確運作）。需緊急停用新函式才 `revoke execute … from authenticated`（可逆，指令與核對步驟同 rev3：`fn_desk_*` 四支、必要時加 `fn_refund_ticket`；之後檢查 `pg_stat_activity` 無執行中呼叫、核對事故預約的餘額與帳本淨額、`09` 清單、`ticket_deduct_ops` 有無懸空登記）。**刪除資料庫物件不是自動動作**，需另行書面授權、維護窗、備份後再依反向順序回復。

## E. 明確不在範圍
場地防超賣、`05` 其餘票回填、任何正式資料的手動修正、正式站的寫入式驗證、其他功能、強推或改寫 master 歷史。

## F. 仍未涵蓋的餘額寫入入口與殘餘風險
**1. 前端仍整列回寫票券餘額（`dbPut('member_tickets', 整列)`），並行下仍可能把剛發生的扣／退蓋掉（lost update）；本發布沒有改，08 與 06 的觸發器只擋「超額使用」，不擋蓋掉：**
- 扣方向：`_bkCoachLeaveUndo`（教練請假復原）、`_grantIssue`（補課券發放）、`_confirmInstallNext`（分期下一期）、`_tkTidyDo`（票券整理）。
- 退／加方向：`_mtkEatUndoDo`（取消吃票復原）、`doGroupCancelSeat`（團課取消名額）、`deskRefundCancelled`（櫃檯補退已取消預約）、`_doSaleUndo`（撤銷銷售）。
- 直接設值：`doReactivateTicket`（重新開通，設為指定堂數）；歸零類：`_voidTicketDo`（作廢）、`_doSwapTicket`（換票）、`_lottoFixDo`（樂透修復）。
- 另有大量 `dbPut('member_tickets')`（共 44 處）是改效期／備註／付款等非「扣退堂」用途，未逐一證明不含餘額欄位寫入——**只靠整列回寫的既有行為，沒有被本次驗證**。
**2. 舊前端並存**：發布後一段時間仍有人開著舊頁面，其取消與扣堂仍是兩步寫入（沒有 08 保護）；靠 `09` 監控與「請櫃檯重新整理」逐漸消失。
**3. 並行證據的範圍**：5 組真並行涵蓋 `fn_desk_*` 的互相競爭；**沒有**涵蓋「新函式 vs 上列整列回寫入口」同時發生，也沒有正式庫流量下的壓力測試。
**4. 驗證邊界**：測試庫跑的是安裝檔不是正式庫套用檔本身（見證據彙整 §2）；教練／會員角色沒有走畫面；點擊證據的時間戳是秒級。
**5. 曾邦宏類問題**：+1 差異的來源仍無法證明；本發布讓「新扣堂與取消」原子化，並以額度觸發器防超額，**不能保證**這類歷史差異不再由上列整列回寫入口產生。
