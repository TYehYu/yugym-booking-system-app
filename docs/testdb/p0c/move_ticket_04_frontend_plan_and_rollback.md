# P0-C 前端修改方案、測試與回復方案（尚未實作、尚未執行）

## D. 前端修改方案（待授權後才動 index.html）

1. `_doBkMoveTicket`：改為呼叫 `sb.rpc('fn_move_booking_ticket', {p_from_booking, p_to_booking, p_mode})`（RPC 是「RLS 相關特殊查詢」，屬 CLAUDE.md 允許直呼 sb 的例外）。
   - 成功後必須 `dbCacheClear`（繞過 dbPut 的寫入）並重繪。
   - 不再在前端寫 ticket_logs／bookings；移除前端搬帳邏輯。
   - 錯誤碼對應繁中訊息：`MOVE.BUSY`（請稍後再試）、`MOVE.TYPE_MISMATCH`、`MOVE.TIME_RESTRICTED`、`MOVE.SHADOW_CARD`、`MOVE.LEDGER_*`（請洽管理員，不可重試）、`HOLD.MONTH_LIMIT:日期`（提示可改選「原課取消」）、`AUTH.FORBIDDEN`/`MOVE.FORBIDDEN`、`MOVE.INTERNAL_ERROR`。
   - 不自動重試；BUSY 以外一律不重送。
2. `bkMoveBlockReason`／`bkMoveCandidates` 保留作為 UI 預先過濾（RPC 才是最終裁決），前端規則副本以 drift-guard 測試與 SQL 對照。
3. `FEATURE_FLAGS` 新增 `moveTicketRpc`（預設 OFF）；OFF 時維持舊路徑，ON 才走 RPC，供分階段上線與快速回退。B 模式旗標（`contractHoldB`、`grantCancelRpc`）維持 OFF，不動。
4. convertGuard（暫時性前端防線）只加在三個轉正入口，僅檢查不寫備註、不產生 alert 列；完整轉正原子性留給 P0-D。
5. 改版必更新 `APP_VERSION`／`APP_VERSION_LABEL`。

### 測試（node tests/，沿用現有風格）
- 更新 `tests/bkmovetktest.js`（7 處引用移動函式）。
- 新增 drift-guard：把 RPC 檔內相容規則與前端 `bkTicketTypeOk` 等函式的規則清單 md5 比對，任一邊改動即失敗。
- 新增 convertGuard 測試：只出現在三個入口、不寫 notes／alert。
- 新增旗標測試：`moveTicketRpc` OFF 走舊路徑、ON 只走 RPC、不再前端寫帳。
- 全套回歸：以已知 7 個基準失敗為準線，不得新增失敗。

## 剩餘風險（明列，不宣稱已完全防止併發）
1. **影子卡競態**：`bookings.sibling_of` 無外鍵，鎖列擋不住客戶端同時新增影子卡；後果只是外觀孤兒卡（不帶票／帳）。以 `move_ticket_03_shadow_orphan_scan_readonly.sql` 定期掃描。RPC 於寫入後再檢查一次可縮小視窗，但無法歸零。
2. 前端規則副本與 SQL 可能漂移（以 drift-guard 測試降低）。
3. 同步 S2 會改變測試庫守門觸發器行為（改為與正式庫一致）。
4. 舊分頁在重新整理前仍走舊寫入路徑（DB 端刻意不加觸發器阻擋）。
5. convertGuard 為暫時防線；轉正完整原子性待 P0-D。
6. 友善課可用 VIP／限定票（規則 3 單向）係抄自前端，需業主確認是否刻意。
7. 5 筆陳舊 pending hold、4 組可能多退款、2 張票未解釋的人工 adjust，仍需逐案審查。
8. 測試庫 `is_staff_desk` 原本不含店長，同步前店長測試會失敗（屬預期）。

## E. 回復方案（皆需授權；整檔單一交易，失敗全部回滾）
| 層級 | 動作 | 檔案 |
|---|---|---|
| RPC | `drop function public.fn_move_booking_ticket(text,text,text);`（僅測試庫，需授權） | migration 檔頭 |
| 測試庫同步（A：同步後立即回復，尚未建 RPC） | 執行 `20261115_move_ticket_testdb_01_sync_ROLLBACK.sql`：RPC 已存在就中止 → 刪 zz 複本（R3）→ 五支函式依完整簽章還原並核對 md5／長度／ACL／無多餘重載（R2）→ 條件式刪三欄（R1；有相依物件或非空資料就中止，不 CASCADE） | `docs/testdb/` |
| 測試庫完整回復（B：已建 RPC 之後） | 執行 `20261115_move_ticket_testdb_02_FULL_ROLLBACK.sql`：先 `drop function fn_move_booking_ticket`，其後與 A 的 R3／R2／R1 完全相同 | `docs/testdb/` |
| 備份 | 原始定義存於 `..._00_backup_originals_DEFS.sql`，核對用 `..._00_backup_verify_readonly.sql`（唯讀） | `docs/testdb/` |
| 真實 RPC 測試夾具 | `move_ticket_06_rpc_cleanup.sql` ＋ Admin API 刪帳號 | `docs/testdb/` |
| 前端 | 旗標 `moveTicketRpc` 關閉即回舊路徑；必要時 revert 該提交（不 force push） | — |
| 資料 | 調課為單一交易；已成功的調課以反向調課或人工 adjust 處理，逐案審查 | — |
