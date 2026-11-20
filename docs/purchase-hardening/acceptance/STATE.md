# 補充核對已完成（本輪不發布）

參閱 ../release/README.md。原三個摘要算式無法回溯，沒有改寫或假稱匹配；已保存明確的 recheck_catalog_query.sql，在本輪演練前後全部結構／權限／資料數目相同。正式庫PRE21項通過、31張未繳完分期票的合約基本完整性彙總正常。正式套用及未使用前回復交易演練10項、發布檔自測22項通過。正式庫沒有寫入，無 commit／push。

# 最新狀態：驗收完成、環境已拆除（2026-11-19）

目前仍是「先驗收、不推送」。沒有 commit、push、部署或正式庫寫入。候選版本號維持 261119.1741。

本輪 run a877f2：`ICA_ACCEPT_COMPLETE`。真 HTTP 並行／權限 20/20；全表逐列資料 hash 與 Auth 前後相同，無 pending、無清除失敗。證據見 evidence/run_a877f2_acceptance_report.json。前一輪 CLEANUP_INCOMPLETE 原始報告仍保留，未改寫成成功。

實際 UI：桌機電子補簽、手機電子一次繳清、手機紙本補簽核取、發票失敗提示、收款回應遺失後相同收據重試。會員簽署使用真實滑鼠拖曳事件，不注入簽名資料。電子簽署完成而尚未收款時，額度與金額不變；櫃檯收款後才開通。回應遺失重試回 already，不重收、不重開。

獨立 SQL：REMOTE 開通12／餘額12／累計12000／新收款與收據各2；PHONE 開通12／餘額12／累計12000／新收款與收據各1；PAPER、INVOICE 各開通8／餘額12／累計8000／新收款與收據各1。四張課票 deduct 全0；調整帳筆數與新收款一致。紙本確認收據2；INVOICE 留有 failed 發票1。

畫面發現並修正：一次繳清第2～3期時，舊票卡用收款筆數補未繳列，錯顯第3期未繳。現在依新原子收款 note 的確定期數範圍及已完成期數處理，並保留舊資料原行為。新增 installmentpaydisplaytest 7項，相關11支全過；最終小幅條件收緊後重跑該7項與slim通過。slim script解析／識別字與字串保真驗證皆過。

清除：主代理另查資料庫，原預約57／票券26／帳本29／會員11／Auth6，收據及發票0，本輪票券、購買、合約、員工、登入殘留0。之後完整 TEST-only teardown 單一交易成功，移除候選、觀測函式、invoices、receipts、暫補欄位／觸發器並還原原函式。函式含ACL hash 0915af25692a47c58e9dceca67d1442e、觸發器定義 hash 4c2e4e6b18ec340c90fbc4cf6b999ebf 與最初基準相同。觀測函式0、收據與發票表不存在。兩個本機server已停止，三個驗收分頁已登出。

核對限制：columns／policies／table-grants 最初只有摘要指紋，未保存其確切公式；本輪兩種另算公式無法直接與舊摘要比較，不能宣稱這三個hash逐項一致。拆除腳本按精確物件清單還原，函式ACL與觸發器指紋及全表資料已獨立核對。原摘要與本輪值均原樣保存；後續若需要宣稱三者完全一致，先找回原公式，不可改基準配合現值。

其他驗收界線：發票為受控服務失敗模擬，沒有真正呼叫綠界或財政部；初次售票是既有票券已付第一期的夾具前提，本輪不能替代完整初次售票實測。教練UI驗到非所屬會員不可讀、無收費入口，HTTP另驗教練不能收款；未驗教練查看自己所屬會員的收費介面。

手機畫面證據：工作區 review-evidence/purchase-hardening-20261119/live-a877f2/。

---
以下為歷史交接，不代表目前仍有暫裝環境：

# 最新狀態：等待恢復並重建登入（2026-11-19 21:50）

run `6bb3c9` 的三個真並行案例及權限／舊寫入檢查，共 **20/20 通過**，證據已存 `evidence/run_6bb3c9_concurrency.json`。UI 還沒完成。等待逾時後程式已自動清除登入，`sessions.json` 不存在；最後全表 snapshot 連線逾時，原判定為 CLEANUP_INCOMPLETE，原檔完整保留為 `evidence/run_6bb3c9_CLEANUP_INCOMPLETE_ORIGINAL.json`。

主代理另用 SQL 查過：本輪 Auth／員工／會員／票券／合約／收款／帳本／收據殘留全 0；bookings/tickets/logs/members/auth=57/26/29/11/6，invoices=0。這不能代替尚未完成的完整逐表 hash。

已修工具：只讀 GET 逾時最多重試一次，不自動重試財務 POST；同一次隱藏金鑰可先恢復核對，保留舊報告後自動重建，不必為重建再輸入。selftest 現在 **50/50**。原報告仍保持 FAILED 類結果，不改成成功。新命令請加 `--minutes 90`。同一 work 路徑恢復成功後舊 JSON 會原樣移入 previous-* 子目錄，再開始新一輪。

測試庫暫裝物件仍在，兩個 server 仍在（21402／71924）。**不要拆除環境再叫使用者恢復**；恢復流程需要現有輔助函式。沒有正式庫寫入、commit 或 push。

---

# 實際驗收交接狀態（2026-11-19）

使用者只授權驗收，**不推送、不發布、不寫正式庫**。本輪沒有 commit。

## 現在停在哪裡

測試庫 `kucvxpjatptfckhlxptj` 已暫裝候選、所需正式依賴與測試觀測／清除函式，尚未建立本輪登入或業務夾具。等待使用者在終端機隱藏輸入測試庫 service_role JWT。

命令：
```
node /private/tmp/yugym-booking-health-20261119/docs/purchase-hardening/acceptance/run_acceptance.js --env /private/tmp/yugym-booking-safety.env --work /private/tmp/yugym-installment-accept-20261119
```

先不要按 Enter。執行器先做真 HTTP 並行與權限檢查，再輸出「夾具與並行驗證已就緒」。使用者回覆完成後讀 work/concurrency_report.json、profiles.json；**絕不可印出 sessions.json**。

- 櫃檯站 `http://127.0.0.1:8796/`，server PTY **21402**。
- 會員站 `http://127.0.0.1:8795/?as=member`，server PTY **71924**。
- 教練視角可在獨立新 port 啟動同一 server 再 `?as=coach`，避免覆蓋櫃檯／會員的同源 localStorage。
- 兩個站只讀本候選 index，session 由本機工具注入。外部正式 API 及 ecpay-invoice 一律阻擋。發票為受控失敗模擬；不可宣稱真開票整合已驗證。
- server 有假資料工具面板：只導向實際 openMemberDetail；「遺失一次收款回應」會讓真測試庫收款提交成功後丟失一次回應，不會重送請求。禁止用它代替實際簽署或收款函式。

## 已通過的準備驗證

- 安裝完整相關觸發器／角色函式／invoices 組合下，52 個原 SQL 行為加 2 個依賴／觀測守門測項：54 項全過，整段 rollback。
- 整套安裝＋拆除演練：收據／發票表與觀測函式移除，函式＋ACL hash 回到 `0915af25692a47c58e9dceca67d1442e`。演練整段 rollback。
- 驗收工具 selftest **44** 項通過，不連網、不需金鑰。
- 實際安裝後 SQL 指紋與檔案 expected.json 一致；外部匿名呼叫 helper HTTP 401。
- 安全顧問：收據表無 policy 為刻意 default-deny；公開 API 的 SECURITY DEFINER 執行權是刻意提供已登入身分，三支業務 RPC 各有角色／本人檢查；觀測 RPC 額外限制 CC-EMP-ICA-D 本輪身分與 CC-ICA 物件。不能宣稱顧問零警告。其餘既有提示未動。

## 真並行 cases

- CC1 同一票、相同收據：一次成功，另一次 already，只有一筆新購買。
- CC2 同一票、不同收據但舊確認：一次成功，另一次 PLAN_CHANGED。
- CC3 兩張票搶同一張折抵券：一次成功，另一次 BALANCE_CHANGED，折抵只扣一次。
- 都要求兩個 HTTP 200、不同 pid、等的是持鎖者 txid、waiter 完成晚於 holder。未見到鎖就失敗，不放寬。
- 普通教練／會員／匿名不能收費，舊式直接開通被觸發器拒絕。

## 必做瀏覽器驗收

以真正候選原始碼、真測試 Auth 身分操作（非唯讀預覽）：
1. 桌機櫃檯，REMOTE：開啟分期表、確認本次內容、送簽；確認尚未收費或開通。
2. 會員 390px：找到待簽、開啟本次確認、以 UI 簽名；確認金額／堂數／涵蓋期數，簽後不自動收費。
3. 櫃檯重新開 REMOTE，送出收費；核對恰一筆收款、開通增加4、總餘額不變。
4. PHONE：改為剩餘全繳8堂或自訂費用，確認需另簽；重開仍預填已簽內容，快捷鍵「下一期」仍只一期。
5. PAPER：提示與核取框，未確認無法收費；確認後正常收費，系統不假裝有電子影像。
6. INVOICE：刻意不選不開發票，使用 fixture email，收費後受控發票失敗；票券／收款不回退、失敗發票留存可追蹤。沒有真正連外開票。
7. 遺失回應：用另一筆還可收的票（例如 REMOTE 的第3期，先完成補簽），按工具「遺失一次收款回應」後按真收費鈕；看到結果不明，DB 恰1次，原視窗相同內容重試應 already，仍1次。
8. 教練介面不出現收費入口；HTTP 已另驗 NOT_DESK。

Cua：IAB browser 2；若上下文被壓縮先 rewriteDocumentation。不同角色用不同 port 避免同源 session 覆蓋；每次記錄實際 viewport。canvas 必須實際 UI 簽署，不可補 _signInk 或直接塞圖冒充真人流程。所有帳號／合約是假資料，不是真實法律簽署。

## 清除與拆除

瀏覽器全部登出後主代理寫 work/ui_done.json：
`{"complete":true,"logoutConfirmed":true,"desktop":true,"mobile":true,"signature":true,"paper":true,"invoiceChecks":true}`

只在全部對應證據成立時寫 true。執行器會自動核對／清理，報告必須 ICA_ACCEPT_COMPLETE；提早 Enter 則 UI_UNVERIFIED。無論失敗也清理，不宣稱未做的部分通過。中斷後同一命令進入恢復，不自行刪 manifest。

執行器沿用 reviewed harness：建立前原子追蹤、精確 id、未知狀態查證、Auth 分頁、完整表資料 hash。收據僅 service helper 依精確已追蹤 id 清理；service 只有測試用 SELECT，沒有直接 INSERT／UPDATE／DELETE 權限。畫面衍生購買、帳本、發票、收據依新建票券關聯＋測前 id 不存在證明登記。最後清 change_log，刪 sessions.json，再核對全部表與 Auth。

清理完成後，**主代理還要獨立查 DB**，並執行由以下產生的 TEST-only 拆除檔：
`python3 docs/purchase-hardening/acceptance/build_environment.py --teardown`
輸出已有單一交易、叢集／本體 pin／空收據與空發票守門；不使用 CASCADE。不要在有資料時強制拆除。原函式由 captured JSON 還原，保留原 ACL。完整原始基準在 catalog_baseline.json。

最後停止兩個 server，核對函式、ACL、觸發器、欄位、policy、grants 及資料與最初基準一致。沒有正式庫寫入，不 push。
