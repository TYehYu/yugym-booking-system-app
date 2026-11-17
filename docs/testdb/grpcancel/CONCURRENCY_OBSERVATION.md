# C1／C3 並行證明：為什麼上一輪沒成立、這一輪怎麼改（2026-11-16，測試庫）

## 上一輪原始事實（seat_report.json 時間線）
- **C1**（同名額同版本同時取消）：功能結果正確——一方 refunded、另一方 BUSY（3 秒 lock_timeout）；票只退 1 次。但持鎖者的 `blocked_waiters` 是空的。
- **C3**（會員自助報名 × 櫃檯取消）：功能結果正確——兩邊都成功、餘額＝起點、帳本各 1 筆。持鎖者有指名一個被擋的 pid，但它的 query 文字是 `COMMIT`，被當成「不是 fn_member_join_group」而判未證明。

## 原因（已用測試庫實證，屬觀測工具問題，不是函式問題）
- 測試庫 PG 17.6，`stats_fetch_consistency=cache`：`pg_stat_activity` 在**同一個交易內只拍一次快照**。持鎖者在同一交易裡輪詢，第一圈的快照會被一直重用——對手若在第一圈之後才出現（C1 就是：持鎖者做完事時對手還沒啟動），就永遠看不到。
- 實證：同一交易內 `set_config('application_name', …, true)` 後再讀 `pg_stat_activity`，仍是舊值；呼叫 `pg_stat_clear_snapshot()` 後才更新（rollback 的測試，沒留下任何東西）。
- C1 的 BUSY 因此是「持鎖者沒看到對手，抱滿 5 秒；對手 3 秒 lock_timeout 先逾時」的後果，函式保護正常運作。
- `COMMIT` 這個 query 文字**不作為依據**：測試庫 public 沒有 deferrable 約束或觸發器，所以等待不是發生在 COMMIT 的延遲檢查；文字是 PostgREST 連線上的呈現問題，原因未深究——判斷改看 pid 與阻擋關係。

## 這一輪的改動（只改測試工具，沒改任何功能函式）
1. `zz_cc_overlap`：輪詢每圈先 `pg_stat_clear_snapshot()`；交易內標記 `application_name = cc:<kind>:<role>:<預約id>`（本輪案例識別，交易結束自動還原）；回傳被擋者的 pid、狀態、`waits_on`、`waits_on_my_txid`、首次看到時間、輪詢圈數、持鎖者自己的鎖；輪詢間隔 20ms。
2. 判定（`verifyBlocked`）：不同 pid ＋ `pg_blocking_pids` 指名該 pid ＋ application_name 與本輪案例相符 ＋ 等的是持鎖者交易 ＋ 等候者在持鎖者結束之後才完成。C3 的會員 RPC 不能標記，改用：恰一個外部連線被擋、等持鎖者交易、會員回應在持鎖者結束之後、會員看到退款後的餘額。
3. 時間預算：輪詢上限 2000ms < 函式 lock_timeout 3000ms < authenticated statement_timeout 8000ms；不放寬任何函式內保護，自測與 runner 啟動都會檢查。
4. 功能斷言補強：名單、座位票、出席、備註、餘額、帳本；帳實一致＝餘額差等於新增帳本 delta 總和。C1：只移除第 2 個名額、第 1 個名額與票不動、第 2 張票恰 +1 且恰 1 筆退款。C3：B6 清空、B7 只有該會員且座位票指向同票、餘額＝起點、恰 1 退 1 扣、無覆蓋無半套。
5. `--conc-only`：只跑 C1／C2／C3，HTTP 與點擊證據沿用已通過、功能未變的那一輪；通過狀態為 `CONC_COMPLETE`。
