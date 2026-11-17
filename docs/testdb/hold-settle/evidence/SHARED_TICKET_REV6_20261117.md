# rev6 共享票防誤取消：重現、修正與驗證（2026-11-17，測試庫 `kucvxpjatptfckhlxptj`；正式庫只做唯讀）

## 問題
一般預約允許會員使用別人 `member_tickets.shared_with` 共享給他的票；rev5 的 `fn_hold_settle_new_ticket` 判斷「其他票能否承接」只查 `member_id = 預約會員` 的同票種票。新票只能承接最近一堂時，下一堂即使有有效共享票也被標成 `cancel`。

## 做法（全在測試庫、回滾式夾具；`hold_settle_tests_shared.sql`，13 案例）
1. 暫裝 rev6 函式（md5 `0637e6b6dd1ac5fbd51a1f271d7250f4`，與 migration 檔逐字一致）。
2. 跑 13 案例：`RESULT total=13 failed=[]`。
3. 以 DO 區塊把已裝函式反向 patch 回舊本體；核對 md5＝`cdae07ef77d777934c352245a96d8922`（＝先前打包版）後，**同一份** 13 案例重跑：
   `RESULT total=13 failed=["SH1.dry_defer_shared","SH1.exec_no_touch_shared","SH5.partial_quota_no_double","SH6.unreadable_shared_list_stops","SH7.shared_installment_unverifiable_stops","SH8.shared_consumed_plan_changed","SH9.stringified_list"]` → 問題重現（SH1：有效共享票卻取消 2 堂）。
4. drop 函式；核對基準（見下）。

## 案例
| 案例 | 情境 | 期望 | 舊 | 新 |
|---|---|---|---|---|
| SH1 | 共享票 5 堂有效、新票 1 堂、3 卡位 | 1 轉正、2 defer、0 取消；執行後共享票餘額不變、無帳本、卡位仍 booked | ✗ | ✓ |
| SH2 | 共享票效期在預約日前 | 不可用，取消 2 | ✓ | ✓ |
| SH3 | 共享票額度 0 | 取消 2 | ✓ | ✓ |
| SH4 | 共享名單沒有此會員 | 取消 2 | ✓ | ✓ |
| SH5 | 共享票只剩 1 堂、4 卡位 | 1 轉正、1 defer、2 取消（不重複分配） | ✗ | ✓ |
| SH6 | 別人名下名單格式讀不懂（`"abc"`） | UNVERIFIABLE_OTHER（預覽與執行），一筆不動 | ✗ | ✓ |
| SH7 | 共享給此人的分期票缺已開通堂數 | UNVERIFIABLE_OTHER，一筆不動 | ✗ | ✓ |
| SH8 | 預覽後共享票被用掉 | PLAN_CHANGED，不做任何事 | ✗ | ✓ |
| SH9 | 名單是字串化陣列 `'["id"]'` | 一樣辨識為共享 → defer | ✗ | ✓ |
| SH10 | 不同票種的共享票 | 不算，取消 | ✓ | ✓ |
| SH11 | 共享票 used_up | 取消 | ✓ | ✓ |
| SH12 | 共享票起始日在預約之後（未啟用） | 取消 | ✓ | ✓ |

## 無法確認時的行為
共享名單格式讀不懂、或共享的分期票缺已開通堂數 → 整批停止（UNVERIFIABLE_OTHER），沒有任何轉正、扣堂或取消，所有卡位保留；前端顯示人話訊息並要求管理員確認。

## 正式庫唯讀查證（只取彙總）
`shared_with` 現況：24 筆全是字串陣列（usable 18、used_up 6），沒有非字串元素、沒有空陣列、沒有其他型別 → 新增的「讀不懂就停」在現況不會觸發。`fn_tk_shared_has` 本體 md5 `0d0d61af566726ed67f884d3f733856f`＝測試庫。

## 拆除後基準（測試庫，與暫裝前一致）
函式 60 `46734cf8…`、policies `1450d890…`、grants `9c771db5…`、觸發器（名稱指紋）`ec1249d9…`、資料表 `b73ccaa0…`、列數 57／26／29／0／0、ZZ 殘留 0、Auth 6、`fn_hold_settle_new_ticket` 殘留 0。

## 沒做的事（請 Codex 複審時決定）
06／08／11 組合整套 32 案、CC1–CC5 真並行、瀏覽器點擊、階段 12 套用／回復演練——都沒有針對 rev6 新本體重跑（需重裝 06／08／11 與金鑰）。改動只在「其他票」的名單與判定；轉正／扣堂／取消的寫入段沒動。
