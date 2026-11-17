# 階段 12 發布範圍（交 Codex 最終審查；**正式發布前需使用者明確授權**）

狀態：**尚未 commit、未 push、未在正式庫執行任何東西**（正式庫只做過唯讀 SELECT）。分支 `feat/convert-pending-keep-nearest`，基底 `origin/master` `7461a42`（2026-11-17 `git fetch` 後確認 `HEAD..origin/master` 為 0，沒有更新的 master 提交）。前端版本 `261117.1056`（rev6 起）。

## 範圍
**包含（3 個入口）**
1. 手動「轉正簽約」（預約詳情 → 轉正簽約 → 整理清單 → 確認整理）。
2. 後台直接發放票券（免簽約：單堂教練課等）發放完成後的卡位整理（`_grantIssue` → `askChargeUnpaid`）。
3. 待審核核准發放（銷售建約 → 收款審核 → 確認收款・發放票券）後的卡位整理（`_grantReqApprove` → `askChargeUnpaid`）。

**不包含**
- **入口 C「購買申請審核」**（`appInvoice`／`confirmCompleteInvoice` → `_issueTicketsFromApp`）沒有接卡位整理，**列為後續工作**。
- **「先承接既有卡位」**（建約後 `adoptOfferAfterCreate` 的承接畫面）：本輪點擊驗收一律選「先不承接」，**沒有驗證承接路徑**。
- 其他票券來源（續約卡位、補扣等既有流程）不變。

## 內容
| 層 | 內容 |
|---|---|
| 資料庫 | 新增一支函式 `fn_hold_settle_new_ticket(text,boolean,text,jsonb)`（security definer、固定 search_path、權限僅 postgres＋authenticated；兩段式 dry／exec、`sig` 簽章防清單變動、鎖序 advisory → bookings → tickets、重送回 `already`）。**不動任何資料、不改既有物件。** 本體 md5 `550c28a816b6e46f636287d7fa33405a`（rev7：共享票防誤取消＋已不可用票名單異常不擋；`cdae07ef…`／`0637e6b6…` 已作廢）。 |
| 前端 | `index.html`：`holdSettle*` 系列＋確認視窗（轉正／分期保留／取消（紅框）／不動／可由其他票承接）；`_doConvertPending`、`askChargeUnpaid`、核准發放後呼叫；移除「整串轉正」按鈕。 |
| 順序 | **先套 `12_hold_settle_apply_prod.sql`（資料庫），驗證通過後再發布前端**（推上 master＝直接上線）。 |
| 回復 | 預設只退前端（`git revert`），**保留函式**；前端已發布後不能僅因退版就刪函式（仍開著新頁面的人會呼叫）。完整移除用 `12_hold_settle_rollback_prod.sql`，需 `app.hs_frontend_reverted='yes'`＋`app.hs_removal_authorization`（僅為守門，**不是授權**），另行取得使用者授權。 |

## 前置依賴與唯讀核對（2026-11-17，正式庫 `rlpiomzplckzqnqrvrwc`，只跑 `12_hold_settle_verify_readonly.sql` 的 PRE 條件）
| 檢查 | 結果 |
|---|---|
| 尚未存在 `fn_hold_settle_new_ticket` | true |
| 依賴函式 5 支（`current_employee_id`、`is_staff_desk`、`fn_tk_today`、`fn_tk_is_unopened`、`fn_tk_holding`） | true |
| **rev6 新增依賴** `fn_tk_shared_has(jsonb,text)` 本體 md5 `0d0d61af566726ed67f884d3f733856f`（正式庫已另行唯讀查證吻合；測試庫相同） | 套用檔與唯讀驗證檔已釘住；rev6 後的完整 PRE 尚未再對正式庫跑一次 |
| 階段 06／08／11 物件都在（`trg_tk_quota_guard`、`fn_desk_deduct_ticket`、`fn_hold_state_guard`） | true |
| 階段 11 函式指紋＝測過版本（adopt `05c51530…`／state `22edb0f9…`／month `e7152b65…`） | true |
| `bookings` 的 10 個必要欄位 | true |
| `system_identifier` ＝ apply 檔守門值 `7637215626725903220` | true |

⚠ 這是「現在」的快照；正式套用前仍要重跑（apply 檔本身也會在交易內再核對一次，不符整筆回滾）。

## rev6：共享票防誤取消（2026-11-17，Codex 指出）
- 問題：承接判定只查會員自己名下的同票種票，漏了別人共享給他的票（一般預約允許）→ 可能誤取消下一堂。
- 修正與測試：見 `docs/testdb/hold-settle/README.md` 的「rev6 補充」。舊本體 13 案例 7 案失敗（問題重現）、新本體 13／13 通過；共享票過期、額度 0、未共享給此人、不同票種、已用完、起始日未到都**不會**被誤算成可用；共享名單讀不懂或共享分期票缺額度 → 整批停止、保留所有卡位。
- 前端：`UNVERIFIABLE_OTHER` 新增人話訊息；確認畫面「先不動」列註明含別人共享的票；APP_VERSION `261117.1056`。
- **rev7 發布前驗證（`evidence/REV7_PRERELEASE_VERIFICATION_20261117.md`）**：套用／唯讀驗證／回復完整演練（含回復閘的負面案例）、CC1–CC6 真並行 51/0（CC6＝共享票並行，有鎖等待證據）、已不可用票名單異常的案例（rev6 會整批擋、rev7 不擋；可用票名單異常仍擋）、櫃檯畫面共享票「先不動」點擊、拆除後基準全吻合。
- **rev7 沒有重跑**：手動轉正 D1–D7 與發票入口 A／B 的畫面點擊（證據是 rev5；改動只在「其他票」判定）、06／08／11 組合整套 32 案。請 Codex 決定是否重跑。

## 驗收證據（細節見 `docs/testdb/hold-settle/evidence/`）
- 並行：CC1–CC5 真實並行 **44 通過／0 失敗**（`hold_settle_conc_report.json`）。
- 手動轉正點擊驗收 D1–D7：通過；清除＋基準比對 `HS_BROWSER_SEED_CLEANED`（`browser_seed_report_manual_convert_CLEANED.json`）。
- **發票入口 A／B 點擊驗收：通過**（`SALE_ENTRY_ACCEPTANCE_20261117.md`）。第一次夾具腳本報告為 `FAILED`（`booking_op_rev` 殘留 39 筆）：**原始報告原樣保留**（`sale_seed_report_run1_FAILED_ORIGINAL.json`），並附補清核對與清除順序修正。
- 測試庫暫裝環境（階段 06／08／11／12／`zz_hs_*`）已拆除，函式 60／policies 70／grants 799／資料表 29／觸發器 21（名稱指紋，公式與 apply 檔內相同）／列數 57‧26‧29‧0‧0／Auth 6 全部回到基準。
- 腳本自測 69 通過；`tests/holdsettletest.js` 34、`prodreleasetest.js` 38、`migrationgranttest.js` 13 通過。
- 全量 `tests/*.js`：19 檔失敗，**同批在 `origin/master` 乾淨匯出檔上同樣失敗且訊息逐檔相同**（既有問題，不是本分支造成；未處理）。

## 驗收替代與限制（請審查者知悉）
1. **紙本簽署確認框用測試替代**：「用紙本」使用原生 `confirm()`，內建瀏覽器吃掉對話框，驗收時於頁面執行 `window.confirm=()=>true`（相當於代按「確定」）；原始碼未改。**真實瀏覽器上的原生對話框沒有在此環境驗證**，上線後請以真實登入走一次「用紙本」。
2. **測試庫曾暫補欄位**：測試庫缺正式庫才有的欄位（`member_tickets.sale_kind`、`sold_by` 等共 23 欄，見 `phase_sale_drift_columns.sql`），為了讓畫面發放流程走完而暫補，驗完全部 drop。這代表**測試庫與正式庫 schema 有落差**，發票入口的結果以「補齊欄位後的測試庫」為準，不是原樣測試庫。
3. 入口 A 只對免簽約（單堂）教練課成立，驗收時暫建單堂方案後已刪除。
4. **「先承接既有卡位」未包含在這輪點擊驗收**（見上）。
5. 測試庫 `fn_create_booking` 比正式庫新（多一個冪等參數），「丁」路徑不作為放行依據。
6. 直接呼叫 `askChargeUnpaid` 的結果只算函式測試，不能取代入口 A／B 的真人按鈕驗收。
7. 發布後仍需真實登入（櫃檯／教練）手動走一遍：轉正簽約、直接發放後整理、核准發放後整理，並確認教練看不到轉正入口。

## 檔案指紋
`FINGERPRINTS_STAGE12.sha256`（與既有 P0-E 的 `FINGERPRINTS.sha256` 分開，因為 `index.html` 已不同）。發布前逐項比對，**任何一項不符＝停止**。

## 預計發布的檔案
**資料庫（由使用者在正式庫手動執行，非 git 部署）**
- `docs/prod-release/12_hold_settle_apply_prod.sql`
- `docs/prod-release/12_hold_settle_verify_readonly.sql`
- `docs/prod-release/12_hold_settle_rollback_prod.sql`（備而不用）

**進版控（推上 master＝上線的只有 `index.html`，其餘是文件與測試）**
- `index.html`
- `docs/migrations/20261121_hold_settle_new_ticket.sql`、`docs/migrations/20261121_hold_settle_new_ticket_rollback.sql`
- `docs/prod-release/12_RELEASE_SCOPE_FOR_REVIEW.md`、`docs/prod-release/FINGERPRINTS_STAGE12.sha256`
- 測試：`tests/holdsettletest.js`（新）；修改 `bindpendtest.js`、`chargeunpaidinsttest.js`、`convpendtest.js`、`gtcapdroptest.js`、`instholdtest.js`、`instretaintest.js`、`renewalholdtest.js`、`unpaidchargetest.js`
- `docs/testdb/hold-settle/**`（README、計畫、`TESTENV_REMOVE.md`、測試 SQL、執行器、`phase_*`、`rehearsal/`、`evidence/`）

**不進發布**：工作目錄暫存、`sessions.json`／`.env.test`（含登入或金鑰，從不進版控）、他人分支的未提交變更（例如 `fix/recurring-booking-error-msg`）。

## 授權前置（正式發布前）
- [ ] Codex 最終審查通過。
- [ ] 使用者明確授權（正式庫執行 apply；推上 master）。
- [ ] 授權當下重跑 `12_hold_settle_verify_readonly.sql` 的 PRE，全為 true。
- [ ] 比對 `FINGERPRINTS_STAGE12.sha256` 全數吻合；確認 `origin/master` 仍是 `7461a42`（若有新提交，先合併並重跑測試）。
