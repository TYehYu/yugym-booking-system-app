# Codex 接手驗收 2026-11-18

尚未發布、未 commit/push，正式庫沒有寫入。

## 已驗證

- 測試庫真實 HTTP 120 通過、0 失敗，原始結果在 /private/tmp/yugym-hr-codex-accept-20261118/http_results.json。
- 櫃檯手機透過帳號選單代登 2026-11-08，被管教練的申請送出 pending。
- 所管主管手機實點核准；獨立 SELECT 確認 approved、代登人 DSK、核准人 MGR、09:00–18:00、工時 9 小時。主管只看到本人與所管申請，本人沒有核准按鈕。
- 教練桌機本人薪資正常顯示假底薪 40,000，下班打卡實點成功，顯示伺服器時間 16:37。一般教練沒有代登／審核入口。
- 管理員桌機本人申請沒有核准按鈕；美化後實點核准 CCH 2026-11-13 申請，成功。
- 人事測試 33 通過；相關 16 支測試檔全部通過。精簡建置自驗通過，5951KB → 3510KB。

## 本輪修正

- 發現櫃檯、主管原本無法透過正常導覽進入代登／審核。帳號選單新增共用入口，僅櫃檯、主管、管理員可用，沿用既有視窗與伺服器權限。
- 補卡視窗放大姓名、日期、時段；待審核／缺下班／遲到三個摘要；時鐘 SVG；縮短說明；手機操作換行。
- runner 清除 change_log 改成只刪本輪精確資料 ID，移除僅以時間範圍刪日誌的方式。

## 清理與還原完成

- 原始報告 HR_ACCEPT_CLEANED，121 通過、0 失敗、無清除失敗或待處理，資料表與 Auth 前後一致。
- 獨立查本輪 743c50 員工、出勤、補卡申請與六個精確 Auth id，殘留都是 0，Auth 共 6。
- 先 rollback 2b、再 rollback 2a，同一交易內以 BASE_B 完整指紋斷言，不符即 rollback；commit 成功。
- commit 後再查一次，政策 77、函式 62、關聯 31、觸發器／權限／欄位指紋，與 TESTDB_STATE.md 的 BASE_B 全部相同。
- 最後移除 zz_hr_verify/zz_hr_verify2/zz_hr_fingerprint，不用 CASCADE。本機驗收站 8793 關閉。
- 留下的是正式庫對齊 parity 層與 requested_by/reviewed_by 兩欄，即人事測試前 BASE_B；不宣稱回到未記錄指紋的最初原始測試庫。
- 正式庫沒有寫入，尚未 commit、push 或部署。正式上線前仍需確認主管管轄與人事職責名單、處理 PREPROD_CHECKLIST.md 所列上線條件。

截圖與原始清除報告在 /Users/tungyeh/Documents/ChatGPT/YUGYM OS/review-evidence/。
