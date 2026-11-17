# 階段 12 發票入口點擊驗收・證據與清除補記（2026-11-17，測試庫 `kucvxpjatptfckhlxptj`）

正式庫全程唯讀；本輪沒有 commit／push／部署。

## 一、功能結果（真人櫃檯畫面點擊，`serve_test_frontend.js` + 測試櫃檯登入）

| 入口 | 畫面路徑 | 整理清單 | DB 核對 |
|---|---|---|---|
| A 後台直接發放（免簽約的單堂教練課） | 會員明細 ＋儲值 → 方案 → 不開發票 → 業績歸屬 → 確認收到，發放票券 | 轉正 11/18；取消 11/19–11/30 共 12 堂 | 餘額 1/0；deduct 1、grant 1；帳本加總 0；12 堂取消皆有 `cancel_reason`、未綁票、無扣課；購買紀錄 1 |
| B 待審核核准發放（10 堂方案） | 銷售建約 →（承接卡位畫面按「先不承接」）→ 收款審核 → 用紙本 → 確認收款・發放票券 | 轉正 11/18–11/27 共 10 堂；取消 11/28–11/30 共 3 堂 | 餘額 10/0；deduct 10、grant 1；帳本加總 0；3 堂取消皆有 `cancel_reason`；購買紀錄 1、合約 1 |
| C 購買申請審核（`_issueTicketsFromApp`） | 未驗 | 未接卡位整理 | **後續工作，不在本次發布範圍** |

兩個入口在「整理清單出現、尚未按確認」時資料都未動（A：1/1、booked 13、deduct 0；B：10/10、booked 13、deduct 0），按確認後才變動。

## 二、驗收替代與限制（發布文件必須承載）

1. **紙本簽署的 `confirm()` 用測試替代**：`_grantReqSetSign` 的「用紙本」是原生 `confirm()`，內建瀏覽器會吃掉對話框使按鈕無效。驗收時在頁面執行 `window.confirm = () => true`（相當於代按「確定」），應用程式邏輯與原始碼**沒有**改動。真實瀏覽器上的原生對話框行為未在此環境驗證。
2. **測試庫曾暫補欄位**：測試庫缺正式庫才有的欄位（`member_tickets.sale_kind` 等），第一次發放因此失敗（PGRST204，非新功能問題）。暫補清單與回滾見 `phase_sale_drift_columns.sql`（`member_tickets` 14 欄、`contracts` 4 欄、`ticket_grant_requests` 2 欄、`purchases` 3 欄；皆 nullable、無預設），驗完已全部 drop，核對 `information_schema` 無殘留。
3. **暫建單堂方案**：入口 A 只對免簽約（單堂）教練課成立，驗收時在測試庫暫建方案 `CC-HS-PL1-5ebada`（1 堂、$1,700）；驗完已刪除（先把夾具票券／購買紀錄的 `plan_id` 設為 null 才能刪，兩者本來就是夾具列）。
4. **「先承接既有卡位」未包含在這輪點擊驗收**：入口 B 建約後會跳出承接畫面（`adoptOfferAfterCreate`），本輪一律選「先不承接」；承接路徑不在本次範圍。
5. **D1′（直接呼叫 `askChargeUnpaid`）只算函式測試**，不能取代上列真人按鈕驗收。

## 三、第一次夾具腳本報告：`FAILED`（原始報告保留）

- 原始報告：`sale_seed_report_run1_FAILED_ORIGINAL.json`（**未修改**，與工作目錄原檔 `cmp` 一致）；同輪 manifest：`sale_seed_manifest_run1.json`；夾具對照：`sale_fixture_map_run1.json`。
- 判定 `FAILED` 的原因（報告內 `diff`）：清除步驟 11 項都成功（HTTP 204／200），但基準比對發現 `booking_op_rev` 由 57 筆變 96 筆（多 39 筆），`authUsersChanged:false`，其餘資料表無變動。
- 根因：腳本的清除順序是 `booking_op_rev` 先、`bookings` 後；刪除 `bookings` 時觸發器 `trg_booking_op_rev` 又寫下 39 筆刪除登記（夾具 3 位會員 × 13 堂卡位），變成孤兒。
- 補清前核對（測試庫 SQL）：`booking_op_rev` 共 96 筆，`booking_id like 'CC-HS-%'` 39 筆，`like 'CC-HS-S%-5ebada'` 39 筆（三者一致，且 96−39＝57＝基準）。
- 補清動作：`delete from booking_op_rev where booking_id like 'CC-HS-S_H__-5ebada' returning 1;` → 回傳 **39 列**。
- 說明：補清後我沒有另外再下一次 `count(*)`；`booking_op_rev` 隨後在階段 08 拆除時整張被 drop，所以事後只剩「96−39＝57」的算術與刪除回傳列數作證。
- 清除順序修正：`run_hold_settle_sale_seed.js` 現在把 `booking_op_rev` 排在 `bookings` **之後**（檔內註解寫明原因）。**這支修正後的腳本沒有重跑**（夾具已清）；與先前連續預約驗收（同樣模式）的修正一致。第一輪的補清屬人工精確刪除，不是腳本自行完成。

## 四、測試庫暫裝環境拆除（`phase_teardown_testdb.sql`，單一交易、含事後指紋核對，不使用 CASCADE）

依 `TESTENV_REMOVE.md` 步驟 1–5：`zz_hs_*`、階段 12、階段 11（三觸發器＋四函式；`fn_hold_month_guard` 還原）、階段 08（四函式、`fn_booking_rev_of`、兩觸發器、`trg_booking_op_rev()`、兩表）、階段 06（觸發器＋兩函式；`fn_tk_refund_once` 還原）。還原內容取自已審查的 `11_renewal_hold_rollback_prod.sql`／`06_quota_refund_rollback_prod.sql` 的 DDL 區塊（機械抽出，不是手抄），交易內以 `pg_get_functiondef` md5 `20399e1e…`（month guard）與 `md5(prosrc):length` `cc6de55f…:1156`（refund_once）核對，不符整筆回滾；實際已 commit。

## 五、基準指紋核對（拆除後，測試庫）

| 項目 | 基準（暫裝前） | 拆除後 | 結果 |
|---|---|---|---|
| 函式 60（`oid::regprocedure‖md5(prosrc)‖proacl`） | `46734cf88d702e404332127c784268c4` | 同左 | 吻合 |
| policies 70 | `1450d8903a3fa15260e40e642e0e07e6` | 同左 | 吻合 |
| grants 799 | `9c771db5a3c87da43142351da9ac6e3d` | 同左 | 吻合 |
| 資料表 29（`md5(string_agg(table_name…))`） | `b73ccaa06dea56ea8480fecc35d74332` | 同左 | 吻合 |
| **觸發器 21（名稱指紋）** | `ec1249d99b7a0b52efca5734d42d546d` | 同左 | **吻合**（公式：`md5(string_agg(tgname,'|' order by tgname))`，範圍＝所有 schema 的非 internal 觸發器共 21 個；試過多種候選公式，唯一吻合者即此，先前文件只記數字、沒記公式，現補記） |
| 觸發器**定義**指紋 | （基準只有名稱指紋） | 21 個定義：`md5(string_agg(pg_get_triggerdef(oid),'｜' order by pg_get_triggerdef(oid)))`＝`226110beb2a8fd3cd19c9d949545a234`；釘住的兩個卡位觸發器 `trg_bookings_hold_month_guard`＝`bd919dd7342e1a26f1b870538b93de4f`、`trg_bookings_contract_hold_guard`＝`82c324805c4aaefc70a4795a35be1c69`（與 11 階段檔釘住值一致） | 兩個釘住值吻合；全定義指紋**沒有暫裝前基準可比**，僅留作之後比對的參考 |
| 列數 bookings／member_tickets／ticket_logs／contracts／ticket_grant_requests | 57／26／29／0／0 | 57／26／29／0／0 | 吻合 |
| `fn_hold_month_guard` 本體 md5 | `9b10b9c5e488b65e7771eb62676883c9` | 同左 | 吻合 |
| `fn_tk_refund_once` `md5(prosrc):length` | `cc6de55f10efb79d804296a7bc387a26:1156` | 同左 | 吻合 |
| 階段 06／08／11／12／`zz_hs_*` 殘留 | 無 | 無 | 吻合 |
| CC-HS／CC-EMP／ZZ 殘留（bookings、member_tickets、members、employees、ticket_types） | 0 | 0 | 吻合 |
| Auth 使用者 | 6（FINAL_ACCEPTANCE_EVIDENCE.md、Codex 演練皆 6） | 6；兩支夾具腳本的前後比對皆 `authUsersChanged:false`（比對內容＝id、email、updated_at、last_sign_in_at 雜湊） | 吻合 |

註：`zz_prod_benefit_refund`、`zz_prod_fn_cancel_booking` 兩支函式在拆除後仍在，屬暫裝前基準內的既有物件（函式總數與指紋吻合），不是本輪殘留。

## 六、測試
- `run_hold_settle_selftest.js`：69 通過／0 失敗。
- `tests/holdsettletest.js`：34 通過／0 失敗；`tests/prodreleasetest.js`：38 通過／0 失敗；`tests/migrationgranttest.js`：13 通過／0 失敗。
- 全量 `tests/*.js`（511 檔，以 `HOME` 指向本分支的符號連結跑，因測試寫死 `$HOME/Projects/yugym-booking-system-app/`）：19 檔失敗；**同一批 19 檔在乾淨 `origin/master`（7461a42）上同樣失敗，且失敗訊息逐檔比對相同**，不是本分支造成。
