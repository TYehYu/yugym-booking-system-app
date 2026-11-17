# 新票轉正整理：測試庫驗證（只在測試庫 kucvxpjatptfckhlxptj 跑）

測試庫原本缺階段 06／08／11 的物件，所以**驗證前要暫裝實際發布版本**，測完全部拆除：
1. 暫裝（依序）：06＝`docs/migrations/20261118_tk_quota_guard.sql`＋`20261118_fn_refund_ticket.sql`（會覆蓋 `fn_tk_refund_once`，先備份原定義）；08＝`20261117_fn_desk_deduct_ticket.sql`；11＝`20261120_renewal_hold_slots.sql`（核對本體指紋 adopt 05c51530…／state 22edb0f9…／month e7152b65…）；最後 `20261121_hold_settle_new_ticket.sql`（本體 md5 cdae07ef…（rev5））。
2. 跑 `hold_settle_tests.sql`：夾具（ZZ 開頭）全建在同一個交易內，最後故意拋 `RESULT total=… failed=[…]` 讓整個交易回滾，不留資料；`failed` 應為 `[]`、`contract_fixture` 應為 `t`（真的建了合約與申請單夾具）。
3. 拆除：drop 本函式；11 的三個觸發器與 4 支函式、還原 `fn_hold_month_guard` 原版；08 的函式／觸發器／兩張表；06 的觸發器／函式、還原 `fn_tk_refund_once` 原版。核對基準。

本次結果（rev4）：總共 32 項、failed=[]、contract_fixture=t（含：近的保留／遠的取消／重送不重扣／不動他人；分期 4-8-2；分期算不準整批停止；扣堂故障整批回復；清單任一欄變動 PLAN_CHANGED；錨點查無／他人／身分變動；過期與合約內卡位不動；效期窗口；跨路徑防重扣；施佩怡型；已取消手足；重複資料；其他票券 defer；非櫃檯）。
基準（暫裝前＝拆除後，已核對一致）：函式 60 `46734cf8…`、policies 70 `1450d890…`、grants 799 `9c771db5…`、觸發器 21 `ec1249d9…`、資料表 29 `b73ccaa0…`、列數 bookings/member_tickets/ticket_logs/contracts/ticket_grant_requests＝57/26/29/0/0、`fn_tk_refund_once` 定義 md5 `6d0f7214…`。測試庫目前**沒有**裝本函式或 06／08／11。
**歷史限制（後續真並行已完成，44/0，見 evidence）**：工具依序執行呼叫（已實測：兩個「同時」送出的呼叫其實一前一後）、dblink 需密碼。計畫見 `TEST_MAPPING_AND_PLAN.md` §C。

## rev5 補充（其他票券逐筆分配）
只裝本函式（baseline＋tkwin 已有）跑 `hold_settle_tests_rev5_subset.sql`：21 項全過（S1／S3 核心、X1–X4、T1 其他票上課日已過期、T2 部分涵蓋、T3 確認後其他票額度被用掉→PLAN_CHANGED、T4 不重複分配、T5 其他票未啟用窗口、T6 資料無法判讀→UNVERIFIABLE_OTHER、T7 其他票起始日）。未受影響的整套（06／08／11 組合 32 項）不重跑；完整檔 `hold_settle_tests.sql` 已含 T 案例，供下次暫裝完整環境時使用。測後已移除並核對基準（函式 60／policies 70／grants 799／觸發器 21／資料表 29／列數 57,26,29）。

## 目前狀態（Codex 備援，2026-11-16）
階段 12 完整套用／驗證／回復演練與三個負面保護案例已完成。06／08／11／12 暫裝已全部移除，測試庫回到原始基準。瀏覽器實際點擊驗收仍待執行，不可將夾具清除成功當成畫面通過。詳見 TEST_MAPPING_AND_PLAN.md 第 F 節及 evidence/stage12_codex_rehearsal_20261116.json。

## rev6 補充（共享票防誤取消，2026-11-17）
問題：一般預約允許會員用別人 `shared_with` 共享給他的票，但 rev5 判斷「其他票能否承接」只查會員自己名下的同票種票 → 新票只能承接最近一堂時，下一堂明明還有有效共享票可用，卻被標成取消（誤取消）。
修正（本體 md5 `550c28a816b6e46f636287d7fa33405a`，取代 `cdae07ef…`）：「其他票」＝同票種、狀態可用，且（會員自己名下，或別人名下而 `fn_tk_shared_has(shared_with, 會員)` 為真）；狀態、堂數、效期、起始日、未啟用窗口的核對與自己的票完全相同；共享票進確認指紋與鎖定；**不扣共享票、不取消卡位（標 defer）**。別人名下、同票種、有名單的票，名單格式讀不懂（不是字串陣列／字串化的字串陣列）→ `UNVERIFIABLE_OTHER`（`reason:SHARED_UNREADABLE`）整批停止，一筆都不動。新增依賴 `fn_tk_shared_has(jsonb,text)`（正式庫與測試庫本體 md5 皆 `0d0d61af…`），套用檔與唯讀驗證檔都釘住它。
測試：`hold_settle_tests_shared.sql`（13 案例 SH1–SH12，回滾式）。**舊本體（cdae07ef…）13 案中 7 案失敗**（SH1 dry／exec、SH5、SH6、SH7、SH8、SH9）＝問題重現；**新本體 13／13 通過**。舊本體是把已裝新本體反向 patch 回去，核對 md5＝`cdae07ef77d777934c352245a96d8922` 後才跑，不是手寫的近似版。
範圍說明：這輪只重跑了「受影響」的部分——共享票 13 案、前端與發布檔結構測試、腳本自測；**階段 06／08／11 組合的整套 32 案、CC1–CC5 真並行、瀏覽器點擊驗收、階段 12 套用／回復演練都沒有針對新本體重跑**（需要重裝 06／08／11 與金鑰輸入，請 Codex 複審時決定是否重跑）。

## rev7（2026-11-17）
本體 md5 `550c28a816b6e46f636287d7fa33405a`：在 rev6 之上，共享名單判讀與確認指紋只看「可用（usable）」的別人名下共享票——已不可用的票名單異常不再擋整批（SH13）；可用票名單異常仍擋（SH14，含 `[bad` 轉型會丟錯的情況）。共享票測試 15 案例；CC6 共享票並行已加入執行器。詳見 `evidence/REV7_PRERELEASE_VERIFICATION_20261117.md`。
