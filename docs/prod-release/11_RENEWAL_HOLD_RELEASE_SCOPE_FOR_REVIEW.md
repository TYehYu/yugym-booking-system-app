# 階段 11｜續約銜接卡位 v2 發布範圍（供 Codex 審查；尚未授權、尚未執行）

分支 `feat/renewal-hold-slots`（基於 origin/master `fa3433d`，已確認 origin/master 沒有新提交，無需整合）。

## 一、發布內容（兩部分，順序固定：先資料庫、再前端）
| 部分 | 內容 |
|---|---|
| 資料庫（正式庫） | 1 支既有函式 `fn_hold_month_guard` 加一段（有會員的待簽約卡位放行）＋ 4 支新函式 ＋ 3 個新觸發器。**不動任何資料、不動既有表／policy／table grants** |
| 前端 | `index.html`（一個檔）：七天規則、承接卡位畫面、到期灰色顯示、暫定期間顯示、錯誤訊息 |

檔案：`11_renewal_hold_apply_prod.sql`（單一交易，前置核對→套用→提交前核對→commit，任一步不符整個回滾）、`11_renewal_hold_rollback_prod.sql`、`11_renewal_hold_verify_readonly.sql`（只有 SELECT）。來源 `docs/migrations/20261120_renewal_hold_slots.sql`，由產生器逐字抽出（本體 md5 已釘住）。

## 二、七天限制目前「只在前端把關」（明列）
- 「每次操作只能排 D～D＋6」資料庫**不強制**（資料庫看不出哪幾筆屬於同一次操作）。
- 資料庫端強制的只有：待簽約卡位不能簽到（`HOLD.UNPAID_CHECKIN`）、沒有合約的卡位過了上課當天不能轉正／改期救活（`HOLD.EXPIRED`）、合約暫定期間與有效天數異常（`CONTRACT.*`）、承接的額度與資格。
- 因此：繞過前端直接寫入的人（或舊版前端）可以一次建立超過七天的無合約卡位；沒有總量上限。這是已知限制，非缺陷。

## 三、事故回復規則（定案）
| 情況 | 做法 |
|---|---|
| 前端**尚未**發布 | 可直接執行已演練的回復檔 |
| 前端**已**發布 | 預設**只退前端**（git revert），保留資料庫物件；**不得僅憑前端退版就刪函式**（舊前端不呼叫新函式、留著無害；仍開啟的新版頁面會呼叫 `fn_contract_adopt_holds`，刪掉承接會直接失敗） |
| 資料庫規則本身出問題 | 先依事故原因提出**局部停用或修復方案**（例如只停用 `trg_contract_window_ins／upd`、或修單一函式）。**完整移除須另行取得使用者授權**，並先處理仍開啟的新版頁面（通知重新整理、確認沒有人正在承接） |
回復檔檔頭已寫入此規則。回復後既有卡位資料不被改動。

## 四、正式庫現況（2026-11-16 唯讀）
- 15 項前置核對全部 true（叢集識別 `7637215626725903220`、欄位、6 支依賴函式與 2 個既有觸發器的定義 md5、原版守門函式 `20399e1e…`、新物件名稱未被占用）。
- 影響面：合約下預約 0；待處理申請 6 筆（有效天數皆合法）；已過期卡位 0；歷史未收款簽到 0。
- `fn_tgr_cancel_cascade`：測試庫與正式庫只差 2 行註解，連動取消測試對正式庫有效。

## 五、驗證結果（均在測試庫／本機）
- 循序 SQL 套件、前端 `renewalholdtest.js` 55 項、失敗路徑自測 64 項。
- 真並行 S1（額度）／S2（重送）／S3（暫定期間）：以 pid＋txid 阻擋證明通過（Codex 已核對原始報告）；測試庫已還原至原基準。
- **完整演練（測試庫 `kucvxpjatptfckhlxptj`，整檔執行、不跳過任何保護）**：由正式 apply／rollback／verify 機械替換產生測試庫版，**精確差異**：
  - apply：2 行——叢集識別 `7637215626725903220`→`7662742571317219726`；`to_regclass('public.change_log') is not null`→`is null`（測試庫沒有 change_log；訊息文字同步改）。
  - rollback：1 行——叢集識別替換。
  - verify：2 行——同 apply 那兩項。
  - 其餘（函式本體、權限、觸發器、提交前核對、回復內容）逐字相同；已程式比對：apply 還原這兩處替換後與已演練版完全一致；rollback 去註解後完全一致。
  - 流程：基準快照 → apply（commit 成功、無例外）→ verify（PRE 三項「尚未存在／原版」變 false，POST 18 項全 true）→ rollback（commit 成功）→ 基準核對：函式 60／簽章 `4194d8b4…`／權限 `fd52f29d…`、觸發器 21／`5eb7e496…`、資料表 29、policies `1450d890…`、table grants `9c771db5…`、守門函式 `20399e1e…`、bookings 57 筆雜湊 `f3f5a066…`、contracts／申請 0，**與套用前逐項相同**。第一次執行即全數通過，無失敗需修正。
  - 誠實揭露：貼進 SQL 執行器的 verify 為了篇幅縮短了各項的說明文字（條件式一致）；apply／rollback 為完整文字，函式本體由 md5 釘住比對。
- 受影響測試重跑：續約相關全部通過；`convpendtest`、`swrescuetest`、`tkcntscopetest` 三支失敗，**在基底 `fa3433d` 同樣失敗（發布前即存在，與本次無關）**。精簡建置 `node build/slim.js` 成功（5901→3470 KB）。

## 六、尚未驗證／風險
- **三個發布範圍維持獨立**：續約卡位（本分支）、團課取消（stage 10）、錯誤提示（recur-err）。三者不互相依賴；若只發布續約，**不為另外兩支的衝突擴大合併**。兩支分支與本分支在 `index.html` 約 15632 行（`runRecurringBooking`）重疊，將來各自發布時需各自在最新 master 上重做並重測。
- `APP_VERSION` 須在發布當下改為實際台北時間（目前 `261116.2006`）。
- 資料庫新規則不追溯舊資料；rollback 後已建立的長期卡位仍保留。
- 到期為「讀取時判斷」（無排程），畫面與場地占用邏輯已一致，但未在真實會員畫面做實機驗證。

## 七、停止條件
apply 任一核對失敗（會自動回滾）、verify 任一項非預期、前端發布後承接或轉正出現 `ADOPT.*`／`HOLD.*` 以外的錯誤 → 停止，不再繼續，回報後再決定退前端或執行 rollback。

## 八、固定指紋（本版）
| 檔案 | md5 |
|---|---|
| `11_renewal_hold_apply_prod.sql` | `97b2226641c0a4652894fcfb7e2cd50f` |
| `11_renewal_hold_rollback_prod.sql` | `b88044a96b1c7091879aea02d600d693` |
| `11_renewal_hold_verify_readonly.sql` | `cfbf7ea5d2345486807010024bc28fea` |
| `docs/migrations/20261120_renewal_hold_slots.sql` | `ade43aae09d4af46da725654394a2fed` |
| `index.html`（版本號發布當下才改） | `5d1bf4d874a8457b3ae4959f2c14bf8e` |
函式本體 md5：`fn_hold_month_guard` 新版 `e7152b65…`（原版定義 `20399e1e…`）、`fn_hold_state_guard` `22edb0f9…`、`fn_contract_window_check` `f6dbf9948…`、`trg_contract_window_booking` `d3c291fa…`、`fn_contract_adopt_holds` `05c51530…`。
