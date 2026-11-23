# 人事線整合紀錄（2026-11-22）

- 新工作目錄：`/Users/tungyeh/Projects/yugym-hr-integrate-20261122`，分支 `feat/hr-integrate-20261122`，基底 origin/master `af00891`（線上 261122.2156）。**未 commit、未 push、未發布。**
- 來源：`yugym-staff-v2`（`feat/staff-management-v2`，含人事權限＋新版員工管理＋歷史薪資保護）的未提交變更，以 `git diff 34fa6ef` 轉成補丁、`git apply --3way` 套到新基底。原目錄內容未動（但見下方「揭露」）。
- 衝突 2 處已解：①CSS 區塊兩邊都保留（櫃檯月曆樣式＋員工管理樣式）②版本號改 `261122.2330`。
- 整合後另修 2 處測試／文案：打卡異常視窗的遲到說明補回「不寬限幾分鐘」（新版視窗簡化時被拿掉，`latepunchtest` 釘住它）；`leaderbonustest` 的聘僱類型下拉允許歷史月份的 `disabled`。
- 測試：全套與 `origin/master` 比較**沒有新增失敗**（兩邊同一批既有失敗）；`migrationgranttest` 13/13；slim 建置自驗通過；`git diff --check` 通過。
- 讀取層影響：以屬性存取重掃 163→166 個函式；整合新增的 3 個（`payRulesPreserveHistory`、`staffHubDrawRows`、`staffHubProfile`）都在管理員頁；master 這 13 個提交沒有新增「非管理員讀敏感員工欄位」的函式。教練名單／排班／預約用的是去敏名單，另以真實登入驗收。
- 揭露：我為了產生補丁在 `yugym-staff-v2` 執行過 `git add -N .` 再 `git reset -q`，**檔案內容沒變，但該目錄原有的「已暫存」狀態被清掉**（原本 5 個測試檔已暫存、`index.html` 一部分已暫存；現在全是未暫存）。內容完整，只是暫存區分類不同。

## 驗收結果（2026-11-22，整合樹 v261122.2330 對測試庫 2a＋2b）
- **真實 HTTP（`run_hr_acceptance.js`）：120 通過／0 失敗**（含主管出勤範圍、到班狀態、舊頁面保護、change_log／簽章、`fn_set_employment_type`）。
- **瀏覽器（各角色真實登入工作階段）：**
  - 桌機 1280：櫃檯（名單 12 人無敏感欄、他人電話只給櫃檯／店長；行事曆教練篩選列完整；建立預約視窗可開；補卡視窗只有「代登補打卡申請」、顯示「待主管核准」）、教練（名單／行事曆／今日／薪資 $40,000／方案頁皆無權限錯誤；自己底薪可讀）、主管（出勤只看本人＋所管、到班狀態 3 筆、補卡視窗標題「本人與所管員工」、自己的申請「本人申請・需他人核准」）、管理員（新版員工名單／月度作業、可讀全員薪資、員工管理頁正常）。
  - 手機 390×844：教練（今日值班「上班中」、行事曆、薪資、通知）、主管、櫃檯（補卡視窗無核准鈕）、管理員（員工名單＋月度作業）皆無權限錯誤、無橫向捲動。
- 「今日值班」圈對到班狀態的簡化畫法：測試資料當天沒有符合條件的排班，首頁沒有渲染該卡，所以**只做了函式直接呼叫驗證**（已到班／已下班／未打卡三種輸出正確），沒有在首頁實景看到。
- console 錯誤全部是測試庫缺的表／函式（`training_options`、`workout_plans`、`coach_exercises`、`fn_member_names`），與本批無關；沒有任何人事物件相關錯誤。
- 未涵蓋：真實多人同時打卡、PWA／LIFF、正式庫資料量；歷史薪資缺口見 `PAY_HISTORY_GAPS.md`（沒有補、也沒有宣稱已全面保護）。

## 清除與還原（2026-11-22 驗收結束後）
- 驗收程式清除：`HR_ACCEPT_CLEANED`（121 通過／0 失敗；資料表與登入帳號無任何變動）。
- 測試庫依序還原 `rollback_2b`、`rollback_2a`；核對與 BASE_B（2026-11-19 記錄）**逐項相同**：policies `7ed93cae…`（77）、triggers `d140193b…`、relations `0df39c4f…`（31）、cols `2f1d3831…`、grants `5013f50b…`、函式 62 支（hash `56db1069…` 同樣相同，分期發布沒有動到測試庫函式）；列數 employees 6／attendance 1／punch_requests 0／salary_history 0／change_log 0／auth 6／member_tickets 26／bookings 57。
- parity 暫補物件與 `punch_requests.requested_by／reviewed_by` 兩個保留欄位仍在（見 `TESTDB_STATE.md`）。測試庫目前沒有任何人事 2a／2b 物件、沒有 zz 測試函式。
