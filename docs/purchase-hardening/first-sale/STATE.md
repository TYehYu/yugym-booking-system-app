# 最新狀態：首次購買真人驗收與還原完成

見 ACCEPTANCE_COMPLETE.md。aa5a92 為 FIRST_SALE_COMPLETE；主代理獨立核對殘留0，測試環境已完整拆除並逐項回原基準，兩server停止。沒有正式庫寫入、commit／push。以下為歷史步驟，**不需要再執行建立夾具指令**。

---

# 重跑準備（前次電話唯一鍵衝突）

run55a023 在建立第一位假會員時HTTP409，尚未開始UI；原FAILED報告保存為run_55a023_FAILED_ORIGINAL.json。自動清除及逐表／Auth比對成功；主代理獨立SQL確認fixture會員／員工／Auth皆0，原bookings57／tickets26／members11／logs29／Auth6。修正為建立帳號前先逐筆確認假電話未使用，與同輪第二位互不重複；讀取失敗不能當作不存在，最多試10次。自測23項全過。改用r2新工作路徑保留原報告，server已同步切換。

# 等待使用者輸入一次測試庫金鑰（尚未真人畫面驗收）

本輪不 commit、push、部署或寫正式庫。使用者要求補上首次購買完整流程與真正測試環境開票；不能用先前已有第一期票券的夾具冒充首次購買。

## 目前已完成

- 正式庫 ecpay-invoice v16 原始碼唯讀取回，暫存在 `/private/tmp/ica-invoice-production-source.ts`，**不含正式環境 secrets 值**。測試 helper 只讀其中 provider codec，固定 stage，Deno.env 回空值讓它只用官方共用測試帳號。Stage host + path allowlist、禁止 redirect、20秒timeout，沒有部署 Edge Function。
- `stage_provider_report.json`：官方 sandbox 真開票、查同單同額、重複編號拒絕、再查仍同張、查無明確區分，共6項通過。
- `app_stage_report.json`：執行 candidate 的真 invIssueForPurchase / _invRetry，與官方sandbox往返、持久層為記憶體假資料。刻意丟失成功回應後，_invRetry 查回原張，不再送Issue，共5項通過。**不是DB或瀏覽器驗收**。
- 修正 index：先保存 failed/prepared 追蹤再送Issue，保存不了不開票；成功回應的保存錯誤不吞；重試先查 GetIssue，只有明確查無 code2才可同編號重送；同單／同額／有效未作廢才承接號碼，未知結果停止。競爭碰重複編號5070357再查一次。首次發放的完成提示保留發票待確認警示。
- 新 `tests/invoicerecoverytest.js`18項通過；first-sale工具自測20項通過。舊 invoicetest 167項通過（兩個舊的「不throw／吞錯」形狀釘選改成新的追蹤失敗保護，保留其餘檢查）。grantreviewtest經發布前重新比對，原本只有1項基底失敗；另一項是新版requestId讓範例按鈕的舊正則失效，已改成實際執行按鈕表達式，確認範例不送簽、真分期帶正確requestId，目前只剩與基底逐項相同的1項失敗。23支相關測試最終只剩這支既有失敗，完整輸出related_results.json。最初的比較腳本未保留相對require且漏了帶空白的HOME拼接，因此test_results.json及第一次related_results不能當有效對照；已改用Module編譯掛鉤，保持原__dirname／相對require且指向本工作目錄，未重設HOME。
- 測試庫 kucvxpjatptfckhlxptj 已暫裝 candidate、observer、原UI驗收的parity，以及首次流程所需額外欄位與正式stage12函式（md5 550c28a8…）。`build_environment.py`產生 install / teardown；已完整交易演練安裝→移除、全 catalog 比對成功，再真正commit安裝。目前尚無本輪Auth或業務夾具。

## 使用者命令

```
node /private/tmp/yugym-booking-health-20261119/docs/purchase-hardening/first-sale/run_first_sale.js --env /private/tmp/yugym-booking-safety.env --work /private/tmp/yugym-first-sale-20261119-r2
```

隱藏輸入測試庫 service_role JWT，不貼對話。90分鐘等待期從夾具建立完開始；不要按Enter。`profiles.json`可讀；**sessions.json不可印出**。

- Staff server http://127.0.0.1:8787/，PTY 15341。
- Member server http://127.0.0.1:8788/?as=member，PTY 97899。
- server只本機綁定，資產allowlist拒絕讀docs、sessions等。測試開票代理校驗同源JSON、只允許本輪假會員的真測試庫purchase、同額及@example.invalid，固定stage；只有issue/query，不用正式keys。
- 頁面測試面板可走真 openSalesModal、openMemberDetail；不是直接呼叫_ grantIssue。簽名必須真人UI拖曳，不可注入dataURL。
- **測試版loadContractTpl回傳「測試專用，不具法律效力」條款**，其餘合約內容填表／簽署／核准／發放走實際函式。不修改DB既有CT-DEFAULT；不把假簽署當真法律行為。

## 待做畫面

1. 桌機開始銷售→教練課，選REMOTE member與本輪REMOTE12堂方案、分3期、指定本輪教練、建立合約。此時沒有票券／收款。
2. 在待審核（會員明細或原頁）的單選電子簽，原生confirm用對話API接受（本輪假合約），會員8788實際簽署；再回櫃檯核准收首期4000、明確選不開發票。核對1張票12總／剩12／開4／累計4000、1grant12、1purchase4000、正確已簽合約連票、request issued。
3. 手機390 staff，選PAPER member與PAPER12堂方案同樣建立，選紙本（只記確認、不假裝簽名影像）；首次收款勾開票、寄假email。可先按「遺失下一次開票回應」來測真stage成功但app失敗標記；工具面板「核對測試發票」呼叫真invRetry恢復同張。應始終1張票、1收款、1invoice issued，stage_manifest恰1Issue加Query。這是測試用深連到真重試函式，不是完整財務選單授權驗收。
4. 核對畫面與獨立SQL，保存截圖。兩頁登出 /cc-logout，viewport.reset，CUA完成摘要。

## 收尾

完成後才寫 work/ui_done.json：
`{"complete":true,"logoutConfirmed":true,"desktop":true,"mobile":true,"electronic":true,"paper":true,"provider":true}`。
Runner自動核對每會員恰1票／1收款／1grant／1合約／issued申請，REMOTE無發票、PAPER一張issued，並依精確id清除全表及Auth、change_log。必須 FIRST_SALE_COMPLETE；失敗原報告保留，不改成功。它重跑同命令時會先恢復但不重建；恢復後用新work路徑並配合重啟server。

主代理再獨立查殘留0與筆數基準，然後執行 `/private/tmp/ica_first_teardown.sql`（builder可重產，含版本／測試庫守門，候選及額外stage12一起拆）。用 acceptance/recheck_catalog_query.sql 與 recheck_catalog_baseline.json 核對全數回原值。兩server停止。

**SHA256SUMS 需在驗收完更新**；前端已加本輪invoice recovery，先前release的SQL本體未變，不能把先前UI/原前端雜湊當成新版本證據。若發布需另行授權、升版及重新核對遠端。
