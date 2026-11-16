# P0-E 併發測試程序（測試庫 kucvxpjatptfckhlxptj；尚未執行）

單一交易的 SQL 測試（p0e_05）測不到併發。以下用兩個獨立連線（兩個 SQL 視窗或兩個 `execute_sql` 對話，各自 `begin;` 不 commit）手動驗證。
每個案例前先以夾具建立資料（`PEC-` 前綴、事後以前綴清除），**需授權才能寫入**；任何失敗立即停止，先清理再回報。

| # | 情境 | 做法 | 預期 |
|---|---|---|---|
| C1 | 兩人同時為同一張未啟用票預約，合起來超出窗口（vd=7；A 預約 d+0，B 預約 d+10，各自未提交） | 連線 1：insert 預約＋deduct 帳，不 commit；連線 2：同樣 insert B | 連線 2 會等連線 1 的票券列鎖；連線 1 commit 後連線 2 看到 A，拋 `TKWIN.OUT_OF_WINDOW`；最終只有 A |
| C2 | 同一預約被簽到兩次（RPC＋名冊同時） | 兩連線同時 update 同一筆為 checked_in | 啟用只發生一次（條件式更新）；痕跡帳 1 筆；到期日不變 |
| C3 | 簽到（超期取消）與取消同時 | 連線 1：簽到首堂（觸發超期取消 X）；連線 2：同時取消 X | 不死結；若連線 2 先鎖 X，連線 1 的 NOWAIT 失敗 → 寫櫃檯警示、簽到成功；X 只退一次堂 |
| C4 | 簽到與撤銷同時（同一筆預約） | 連線 1 簽到、連線 2 撤銷 | 以預約列鎖序列化；最終狀態與票券欄位一致（已簽到→有效期；已撤銷→未啟用） |
| C5 | 調課（P0-C RPC）與同票簽到同時 | 連線 1：fn_move_booking_ticket；連線 2：簽到同票的另一堂 | 鎖順序皆為「預約→票」，不死結；若調課先，簽到後啟用依最終綁定正確 |
| C6 | 重送（連續兩次簽到 RPC） | 同一請求送兩次 | 第二次回 already，不重複啟用、不重複取消 |

驗證 SQL（每案例後）：該票 `start_date／expire_date／activated_at／activation_mode`、`sessions_remaining`、該票 `ticket_logs` 的 `sum(delta)` 與每筆預約淨額、`notifications` 新增筆數。
清理：以 `PEC-` 前綴刪除夾具（含 notifications 依 RUNID 精準限定，做法同 docs/testdb/move_ticket_06）。
