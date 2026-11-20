# 2026/11/20 待使用者輸入金鑰

- 原任務：使用者已說「檢查安全，才推」。安全驗收通過前不發布；視窗美化不混入。
- 測試庫現已暫裝 06/08/11、目前正式庫扣堂/取消/額度/帳本依賴、候選轉正函式及 zz_hs_call/zz_hs_fingerprint。與 candidate.sql 指紋一致：990f6dd850e5beb6a1e2360a2075174d；ACL postgres/authenticated。
- ACCEPTANCE_BEFORE.json 是本輪安裝前完整目錄基準及要還原的原函式定義；函式指紋 0915af25692a47c58e9dceca67d1442e，bookings57/tickets26/logs29/members11/Auth6。
- acceptance_install_test.sql 與 acceptance_restore_test.sql 已合併成單一回滾交易完整演練，還原指紋符合；實際 install 已 commit，尚未建立本輪測試資料。
- 使用者執行 run_acceptance.cjs，只用隱藏輸入金鑰。先跑 C0 同合約重送競爭、C3 合約列鎖競爭；嚴格等待證據通過才準備 C1 桌機、C2 手機假資料實點。前置指紋不符/任一案例失敗即清除，不放行畫面。
- 使用已審查 harness.js，契約清除排在預約與 booking_op_rev 後、票券與會員前。工具自測17與原 harness64通過。
- 工作目錄：/private/tmp/yugym-contract-acceptance-20261120。sessions.json 僅在該目錄 0600，不能印到對話、不能入版控；清除時刪除。
- 使用者看到「夾具就緒」先回報，暫不按 Enter。代理啟動 serve_acceptance.cjs（本機綁定、測試庫、不載入 SW）、開實際程式，以假資料按鈕走原 openConvertPending。C1 桌機1280、C2手機390均應顯示6轉正/6保留/2取消，點確認後獨立SQL核對原id、帳本與餘額。
- C1/C2 操作完才請使用者按 Enter。程式再核對兩組結果、清除、逐表/Auth與基準比對。報告 hold_settle_browser_seed_report.json、concurrency_report.json。確認後使用 acceptance_restore_test.sql 還原，並重跑原 recheck_catalog_query.sql 逐項比對 ACCEPTANCE_BEFORE。
- 準備的正式 apply/rollback 仍為 review_only，尚未整檔演練及最終安全審查；未 commit/push；遠端 e9b1077。

## 最新結案狀態

桌機/手機與兩項真並行均完成。原清理報告FAILED（4筆員工變更日誌）已保留並精確補清；測試庫已還原且目錄逐項與測前一致，假帳號/夾具/日誌0，sessions.json已刪除，本機站與瀏覽器已關。正式apply/rollback整檔在測試庫含commit演練成功；重複apply被擋。待依使用者條件授權正式套用與推送，不需重做驗收。

## 發布更新

使用者已再次明確同意沿用安全安排並發布；正式庫函式已套用990f6dd850e5beb6a1e2360a2075174d，原權限不變，其他函式/政策/觸發器及業務資料的交易內核對通過。前端發布固定版本261120.1626；最終發布回條保存在私人workspace review-evidence/contract-hold-release-20261120/。
