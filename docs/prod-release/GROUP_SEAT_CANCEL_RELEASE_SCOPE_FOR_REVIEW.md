# 團課「取消單一名額」原子化：一次發布範圍（交 Codex 最終審查）

狀態：**準備完成，尚未對正式庫做任何寫入、尚未 commit／push／部署**。只差使用者一次明確的正式發布授權。

## 發布內容（只有這一件）
1. **正式庫（階段 10，單一交易）**：新增三支函式 `fn_seat_map_reindex`（內部）、`fn_group_seat_rev`、`fn_cancel_group_seat`。不動任何資料、不動 06／08 物件、不動 `seat_notes` 欄、不動其他函式／表／policies／權限。
2. **前端**：`index.html`（`doGroupCancelSeat` 在雲端模式改走 `fn_cancel_group_seat`，含重送保護的操作情境；版本號改為**發布當下的台北時間**）＋ 測試 `tests/grpseatcancelrpctest.js`、`tests/seattest.js`。
3. 文件／證據（`docs/`）：遷移檔與回復檔、`docs/prod-release/10_*`、`docs/testdb/grpcancel/*`、`docs/testdb/final/run_final_acceptance.js`（測試工具，非執行檔）。

**不包含**：Mango 行事曆效能、未驗證的 Safari 崩潰、05 backfill、曾邦宏資料、場地防超賣、其他特殊扣退款入口、audit trigger。已確認遠端 `origin/master` 含 `fa3433d`（快速預約體驗課修復），整合版基於 e1e5ea8，保留階段 11、12、課卡、連續預約與提示。2026-11-17 重新核對正式庫 PRE 9 項全 true、POST 10 項全 false。

## 正式庫實測前置（2026-11-16，唯讀 SELECT，project `rlpiomzplckzqnqrvrwc`）
- `bookings.seat_notes`：`jsonb`、可為空、無預設值（非空 1 筆）。
- 06／08 都在：`fn_tk_refund_once` 本體 md5 `bba19026075474e59d57365e38361f1e`（06 版，含 `app.tk_operator`；與 `06_quota_refund_apply_prod.sql` 抽出的本體逐位元相同）、`fn_booking_rev_of` 定義 md5 `42ab6f3a…8131`、`trg_booking_op_rev` `5391036b…9a9b`、`fn_refund_ticket` `2140c88e…fd9b`；`booking_op_rev`／`ticket_deduct_ops` 存在且啟用 RLS。
- 三支新函式名稱**完全不存在**（不論參數）。`10_*_verify_readonly.sql` 的 PRE 9 項全 true、POST 10 項全 false。
- 指紋方法已驗證：本機抽函式本體算 md5 ＝ 正式庫 `md5(prosrc)`（以 06 的三支函式比對，逐位元相同）。

## 三支函式的釘住指紋（`md5(prosrc)`，來源＝`docs/migrations/20261119_fn_cancel_group_seat.sql`）
| 函式 | 本體 md5 | security definer | 權限（proacl） |
|---|---|---|---|
| fn_seat_map_reindex(jsonb,text[],text[],integer) | 0960ccde99493b7d79dd4d40a0fa45c6 | false | {postgres=X/postgres}（純內部） |
| fn_group_seat_rev(text) | 5f33108bc3b98e200eefbc23ad8070c8 | true | {postgres=X/postgres,authenticated=X/postgres} |
| fn_cancel_group_seat(text,text,text,text) | c8a70d1d1d2918660543f0e5c69c89f6 | true | {postgres=X/postgres,authenticated=X/postgres} |
`search_path` 皆為 `public, pg_temp`。權限文字與 proconfig 格式已在測試庫（rollback 模擬）驗證逐字相同。

## 套用檔 `10_group_seat_cancel_apply_prod.sql` 的安全設計
- 一個 `begin … commit`；`lock_timeout 5s`。
- **前置 guard（任一不符就停、沒有任何變更）**：叢集識別是正式庫、有 `change_log`、`seat_notes` 為 jsonb、06／08 物件齊全且為釘住版本、三個名稱都不存在。
- 建立用 `create function`（**不用 or replace**）：即使 guard 被繞過，同名物件存在也會直接失敗，不會覆蓋未知同名物件。
- **提交前核對（任一不符就整個回滾）**：三支恰 3 個、本體 md5、security definer／search_path、proacl 逐字相同（anon／service_role／public 不可執行）；函式總數＝原有+3；其餘函式（本體＋權限）、policies、table grants、觸發器數、資料表數與套用前簽章相同。
- 唯一副作用是三支函式；回復只需 drop 三支。

## 回復
- **DB 回復** `10_group_seat_cancel_rollback_prod.sql`：單一交易；先核對三支存在且本體 md5＝本次安裝版本（否則視為未知同名物件，停止不刪）；核對沒有其他函式本體引用、沒有任何資料庫物件相依（pg_depend）；**不用 CASCADE**；刪除後比對其餘物件簽章不變。
- **順序（重要）**：套用＝**先 DB、後前端**（新前端會呼叫新函式，缺函式則取消名額失敗）。回復＝**先前端、後 DB**（舊前端走原本非原子路徑，不呼叫這三支函式，所以 DB 函式留著也無害；前端退版後預設保留資料庫函式；已開啟的新前端仍可能呼叫。完整移除須另行授權）。
- **前端安全回復**：對本次前端 commit 做 `git revert`（普通 push，不強推）；約 1–2 分鐘生效。回復後新增的行為只剩「取消名額又回到非原子的舊寫入」，與發布前相同。
- 已透過 RPC 完成的取消不需要回復資料（結果就是正確的名單／退款／帳本）。

## 停止條件（任一發生就停，不現場擴大修改，回報）
1. 發布前最新遠端 `origin/master` 不是已整合的 `e1e5ea8`、或 `index.html` 與固定指紋不符（除了版本號那一行）。
2. 正式庫 `10_*_verify_readonly.sql` PRE 任一項不是 true（含三支函式名稱已存在）。
3. apply 交易任何一步報錯（它會自己回滾）；回滾後要重新確認 POST 全 false 才能再議。
4. apply 後 verify POST 任一項不是 true。
5. 前端部署後線上檔案與精簡建置雜湊不同、或版本號不是發布當下的台北時間。
6. 發布後第一段時間內出現 `fn_cancel_group_seat` 的 BUSY／INTERNAL_ERROR／TICKET_UNKNOWN 異常增多、或帳本與餘額不一致（用唯讀診斷查，不寫入）→ 先回復前端，再議。

## 已驗證／未驗證
- **已驗證（測試庫）**：SQL 行為、前端單元 28 項、真實 HTTP H1–H6、點擊（連點只送一次）、並行 C1／C2／C3（C3 的證據限制見 `docs/testdb/grpcancel/evidence/RESULT.md`）、收尾基準逐項相同。
- **未在正式庫實測**：正式庫沒有做過任何寫入測試；發布後只做唯讀驗證（結構、指紋、權限），不在正式環境製造測試預約／扣退款。
- **仍待處理（本次不含）**：其他整列回寫餘額的入口、audit trigger、場地防超賣。

## 執行順序（授權後）
1. 唯讀重跑 `10_*_verify_readonly.sql`（PRE 全 true、POST 全 false）。
2. 執行 `10_*_apply_prod.sql`（單一交易）。
3. 唯讀重跑 verify（PRE 最後一項變 false、其餘 true；POST 全 true）。
4. 更新 `APP_VERSION` 為發布當下台北時間、重算指紋、跑相關測試與精簡建置、commit、普通 push 到 master。
5. 部署後唯讀確認線上版本與精簡建置一致。
