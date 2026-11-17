# 團課取消單一名額（fn_cancel_group_seat）驗收結果（測試庫 kucvxpjatptfckhlxptj；2026-11-16）

整體：**驗證完成（C3 有證據限制，見下）**。分兩輪證據合併：第一輪（完整：HTTP＋並行＋點擊，`seat_report.json`）與第二輪（`--conc-only`：C1／C2／C3，`conc_report_conc_only.json`，狀態 `CONC_COMPLETE`，27 通過／0 失敗／0 未驗證）。第一輪的 C1、C3 當時判「未驗證」，原因查明是**觀測工具問題**（`CONCURRENCY_OBSERVATION.md`），函式本身行為正確；第二輪改觀測方式後已驗證。沿用的 HTTP、點擊與 C2 證據來自第一輪（當時功能未變）。

| 項目 | 結果 | 證據來源 |
|---|---|---|
| SQL 行為測試（grpcancel_tests.sql） | 全過 | 第一輪 |
| 前端單元測試（tests/grpseatcancelrpctest.js，28 項） | 全過（併入體驗課修復後重跑仍全過） | 第一輪＋重跑 |
| 真實 HTTP H1–H6 | 全過 | 第一輪 |
| 並行 C2（同堂兩個不同名額） | **已驗證**（兩輪皆過；第二輪以 pid＋阻擋關係重驗） | 第一、二輪 |
| 並行 C1（同名額同版本同時取消） | **已驗證**：持鎖者以 pid 指名等候者被擋、案例標記相符、等的是持鎖者交易、等候者在持鎖者結束後才完成；一方 refunded、另一方 REV_MISMATCH；只移除第 2 個名額、第 1 個名額與票不動；第 2 張票恰 +1 且恰 1 筆退款；帳實一致 | 第二輪 |
| 並行 C3（會員自助報名 fn_member_join_group × 櫃檯取消，搶同一張票） | **已驗證（有證據限制）**：恰一個外部連線被持鎖者指名被擋、它在等持鎖者的交易、會員回應在持鎖者結束之後、會員看到的是退款後的餘額（持鎖者 6、會員 5）；兩邊都成功、B6 清空、B7 只有該會員且座位票指向同票、餘額＝起點、恰 1 退 1 扣、帳實一致、無覆蓋無半套 | 第二輪 |
| 實際點擊（連點兩下確定鈕） | 通過（只送出一次 fn_cancel_group_seat，無半套狀態） | 第一輪 |
| 清除與基準 | 兩輪執行器清除皆成功；暫時安裝移除後完整基準逐項相同（見下） | 收尾 |

## C3 證據限制（誠實記錄）
會員端是**既有的 fn_member_join_group（經 PostgREST，會員 JWT）**，沒有改它，所以**無法在請求上放專屬標記**（C1／C2 的等候者有 `application_name=cc:<kind>:<role>:<預約id>` 標記，C3 的會員請求沒有）。C3 的歸屬是靠：①持鎖者指名恰一個非自己的 pid 被擋；②它在等持鎖者的 transactionid；③會員回應在持鎖者結束之後；④會員看到的餘額是持鎖者提交後的值；⑤受控環境（測試庫、當時只有本輪連線）。**不是**以 query 文字判斷（會員連線的 query 在上輪顯示為 COMMIT、本輪為 PostgREST 呼叫包裝且只存前 90 字，兩者都不作依據）。Codex 已在「本輪受控環境」下接受此限制。

## 收尾基準比對（測試庫，唯讀重算，2026-11-16 收尾時）
基準值是移除暫時安裝前、第一次建立基準時在本會話查得並記錄的值，公式相同（函式名稱＋參數、函式 ACL、觸發器名稱＋啟用狀態、資料表名稱、policies、table grants、`fn_tk_refund_once` 的 `pg_get_functiondef` md5）。

| 項目 | 基準 | 收尾重算 | 一致 |
|---|---|---|---|
| 函式數／名稱簽章 | 60／5819fd66445ccd5fa8e4cc258aee55a1 | 60／5819fd66445ccd5fa8e4cc258aee55a1 | ✓ |
| 函式 ACL 簽章 | 4dcdc48323383e033d7bd6f1fd148b39 | 4dcdc48323383e033d7bd6f1fd148b39 | ✓ |
| 觸發器數／簽章 | 21／677fa33c0f1738780c8a2d8a3ae09075 | 21／677fa33c0f1738780c8a2d8a3ae09075 | ✓ |
| 資料表數／簽章 | 29／b73ccaa06dea56ea8480fecc35d74332 | 29／b73ccaa06dea56ea8480fecc35d74332 | ✓ |
| policies 簽章 | 1450d8903a3fa15260e40e642e0e07e6 | 1450d8903a3fa15260e40e642e0e07e6 | ✓ |
| table grants 簽章 | 9c771db5a3c87da43142351da9ac6e3d | 9c771db5a3c87da43142351da9ac6e3d | ✓ |
| fn_tk_refund_once（pg_get_functiondef md5） | 6d0f7214b1a8b4ce1d14b4f781723325 | 6d0f7214b1a8b4ce1d14b4f781723325 | ✓ |
| 各表筆數與逐列雜湊（bookings 57／member_tickets 26／ticket_logs 29／members 11／venues 1／employees 6／auth.users 6） | 基準 | 完全相同 | ✓ |
| seat_notes 欄、CC-* 殘留、venues multi／group | 無 | 無 | ✓ |

備註：第一輪點擊過程有一步誤點到會員資料（steps.log 已標 misclick，無取消動作）。第二輪的第一次嘗試因我的 runner 作用域錯誤（`revOf` 未定義）在並行案例之前中止，沒有產生任何並行結果，已修正並重跑。
