# P0-E Phase 3：T01–T20 對照、執行順序、P0-C 銜接修改（尚未執行任何寫入）

目標庫：測試庫 `kucvxpjatptfckhlxptj`。正式庫 `rlpiomzplckzqnqrvrwc` 禁止修改。**測試任一項失敗 → 不得進入正式庫部署。**
所有腳本最前面都有庫識別守門；SQL 測試與 T19 單一 DO 語句、結尾必定回滾，不留資料。

## T01–T20 對照

| T | 情境 | 驗證方式 | 測試名（p0e_05 除非註明） | 資料庫變更 | 備註 |
|---|---|---|---|---|---|
| T01 | 預約不啟用效期 | SQL | A1 | 無（回滾） | |
| T02 | 預約取消後仍未啟用 | SQL | T02 | 無 | Phase 3 補強 |
| T03 | 首次簽到正確啟用 | SQL | A2 | 無 | 起算日＝課程日、到期＝+valid_days−1、痕跡帳 delta 0 |
| T04 | 重複簽到不重算 | SQL ＋ 手動併發 | A3、C6（p0e_06） | 無 | |
| T05 | 超出預約窗口被拒 | SQL | W2、W3 | 無 | 新增與改期兩條路 |
| T06 | 取消最早預約後重算窗口 | SQL | W4 | 無 | |
| T07 | 首次簽到後自動取消超期課 | SQL | O1 | 無 | 以「暫停窗口觸發器」建出歷史殘留 |
| T08 | 自動取消後正確退堂 | SQL | O1（餘額、淨額）、O2（重跑不重退） | 無 | |
| T09 | 取消退款失敗則整筆回滾 | SQL | O4（取消失敗）、T09（退款失敗） | 無 | 兩種失敗點各一案 |
| T10 | 撤銷唯一簽到恢復未啟用 | SQL | R2、R3 | 無 | |
| T11 | 撤銷後依其他簽到重算 | SQL | R1 | 無 | |
| T12 | 補簽以實際課程日計算 | SQL | T12、P1 | 無 | P1＝到期日已過不自動取消 |
| T13 | 共享票並發簽到只啟用一次 | SQL（非並發）＋ 手動併發 | T13、C2 | 無 | 真正併發只能手動（p0e_06 C2） |
| T14 | 1V2 不誤取消另一會員 | SQL | O3 | 無 | 需 bookings.partner_id（P0-C 同步後才有；否則 SKIP＝不算通過） |
| T15 | 團課席位及帳本正確 | SQL | G1、G2、G3、G4、O1（團課類別不取消） | 無 | 座位 key 格式為假設，以此測試驗證 |
| T16 | 分期與自主訓練不受影響 | SQL | T16 | 無 | |
| T17 | 固定日期票不被覆寫 | SQL | L2、W2（窗口） | 無 | |
| T18 | 已啟用歷史票不被批次改動 | SQL ＋ 唯讀 | L1、W6；p0e_02 後置檢查雜湊；p0e_04 V4 | 無 | 套用前後既有票券雜湊必須相同、無任何票帶 activation_mode |
| T19 | P0-C 調課回歸 | SQL | p0e_08 M1–M3 ＋ 重跑 P0-C 全套（move_ticket_01） | 無 | 前置：P0-C 已套用並完成下方「銜接修改」 |
| T20 | 多人同時預約不得突破窗口 | SQL（序列）＋ 手動併發 | T20、C1 | 無 | 真正併發只能手動 |

## 建議執行順序（每步先貼 Project ID 與完整 SQL，授權後才執行）
1. p0e_00 唯讀前置檢查（記錄 `n_tickets`、`hist_md5`）。
2.（P0-C 必須先完成其階段：同步 → 建 RPC → P0-C 測試，並套用下方銜接修改。）
3. p0e_02 套用 P0-E（單一交易，後置檢查失敗自動回滾）。
4. p0e_04 唯讀驗證（填入第 1 步的值）。
5. p0e_05 SQL 測試（預期 fail=0；SKIP 逐項說明原因）。
6. p0e_08 T19 ＋ 重跑 P0-C 全套。
7. p0e_06 手動併發（C1–C6；夾具需另行授權）。
8. 回復驗證：p0e_03 回復 → 再跑 p0e_04（物件消失、歷史雜湊不變）→ 視需要重新套用。
9. 彙整 T01–T20 報告；全部 PASS 才可討論正式庫（正式庫另需盤點：新制未開通票的預約跨度；授權後才做）。

## P0-C 銜接修改（對 `docs/migrations/20261115_fn_move_booking_ticket.sql`；P0-C worktree 的檔案，這次**沒有改**）
1. 例外處理的放行清單加入 `TKWIN.%`（目前只有 `MOVE.%`、`HOLD.MONTH_LIMIT:%`、`CONTRACT.%`，不加會被轉成 `MOVE.INTERNAL_ERROR`）。
2. 在函式內第一個 UPDATE bookings 之前：`perform set_config('app.tkwin_skip_booking','on',true);`
3. 成功路徑回傳之前：`perform set_config('app.tkwin_skip_booking','',true);`（失敗路徑隨子交易回滾自動還原）。
4. 確認三筆帳的順序仍是：refund（原預約）→ deduct（新預約）→ adjust 0（痕跡）——窗口檢查掛在 deduct 上，此時帳與預約都是最終狀態。
5. 合併後 P0-C 的 drift-guard（函式 md5 清單）需更新。

## 風險（Phase 3 執行時仍成立）
- 測試庫落後正式庫：缺 `bookings_cancelled_by`／`bookings_touch`／`group_guard`／`change_log` 觸發器，這些互動測不到；`partner_id`／`coach_leave` 欄位需 P0-C 同步後才有（O3、N3 會 SKIP）。
- 真正併發（T13、T20）只能手動兩連線驗證，結果以人工回報為準。
- 夾具與測試 SQL 尚未在資料庫實跑過；首次實跑的語法／型別問題以「修正後重跑」處理，不放寬測試。


## 更新（2026-11-16）：P0-C 銜接已改為「獨立修補 migration」，不修改 P0-C 工作區
- `docs/migrations/20261116_p0e_move_ticket_tkwin_patch.sql`：用 `create or replace` 取代 P0-C 已部署的 `fn_move_booking_ticket`，與 P0-C 審查版本體（md5 411549f6…、13276）恰好 3 處差異（TKWIN.% 透傳、第一個 UPDATE 前開跳過旗標、成功回傳前還原旗標）。
- 套用：`p0e_09_apply_tkwin_patch_testdb.sql`（守門＋前置條件＋後置檢查，單一交易）；回復：`p0e_09_tkwin_patch_rollback.sql`（還原 P0-C 原本體並核對）。尚未執行，需授權。
- 建議順序：P0-E 主 migration（p0e_02）→ TKWIN 修補（p0e_09）→ p0e_04 驗證 → p0e_05 SQL 測試 → p0e_08（T19）→ 重跑 P0-C 全套（move_ticket_01，用精簡輸出）。
- 已修正：舊的 `to_regproc('...()')` 守門寫法（帶括號永遠回 NULL）與兩處前置條件（改用 to_regprocedure）；SQL 測試改為精簡輸出。
