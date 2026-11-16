# P0E 前端發布版（2026-11-17 修訂，供 Codex 審查；尚未 commit／部署）

分支 `release/p0e-frontend-20261116`（worktree `../yugym-p0e-release`），基底 `origin/master 0ced889`（含已發布的場租修復）。版本 `261118.2300`。
範圍＝基底到工作區的完整差異：`git diff --cached origin/master`（已 `git add`、未 commit）＝42 檔；index.html 動到的函式：cancelBooking、_bkCoachLeaveUndo、renderMemTickets、_saveGroupMembers、_doBkMoveTicket、rpcBookingErrMsg／dbFriendlyError、refundTicket、mtkEatUndo、deductTicket、ticketTokens、openBookingDetail、leaveExt*、createBookingViaRpc、_submitBookingInner 等（皆為 P0-C 調課、P0-E 簽到才啟用、補償、原子退票、額度訊息、扣課／退款語意）。**沒有**場地防超賣、**沒有**整檔覆蓋。

## 發布前提：資料庫階段 08（新增，rev2）
`docs/prod-release/08_desk_deduct_{apply,rollback,verify_readonly}_prod.sql`（內容同 `docs/migrations/20261117_fn_desk_deduct_ticket*.sql`）：新函式 `fn_desk_deduct_ticket(票,預約,備註,操作識別)`。**必須先於前端套用**；不改既有 `fn_deduct_ticket`。正式庫尚未安裝任何一項。

## 扣堂：堂數與帳本一起成功／一起失敗；重送不重扣
同一交易內：鎖預約 → 驗預約未取消 → 鎖票券 → 驗狀態 → 冪等 → 驗餘額 → 扣 1 堂 → 寫帳；任何一步失敗整個回滾；前端無任何補償寫入。
- **鎖定順序＝預約→票券**，與 fn_refund_ticket／fn_cancel_booking／fn_move_booking_ticket 一致；已取消的預約被拒（BOOKING_CANCELLED）。
- **冪等**：一般扣課＝「這一堂在這張票只扣一次」；**合法多堂**＝每一次扣課帶一把穩定的操作識別（`gcr:預約:會員:第幾個名額`、`st:預約:新時長:第幾點`、`fol:預約:會員:第幾個名額`，不含時間／亂數），帳本備註尾端記 `｜op:識別`，同識別已記過就不再扣。沒帶識別的「多堂」前端直接拒絕。
- **團課建立改為先存（空名單）預約再逐名額扣**——新函式要求預約先存在才能鎖；班本來就可以空位先開。
- 盤點 multi 呼叫共 3 處（團課建立、自主訓練時長加扣、連續預約補位），已全改用穩定識別；原始碼已無 `{multi:true}` 呼叫。
**測試庫**（`docs/testdb/p0e/p0e_14_desk_deduct_tests.sql`，單一交易回滾）：同預約重送只扣一次；搶最後一堂只一筆成功（**循序，非真並行**）；帳本故障注入→堂數回復；**多堂扣三堂→整組重送仍三堂；第 2 堂故障、重試後合計恰好三堂（第 1 堂不重扣）**；不同識別＝合法下一次扣課；已取消預約不扣；已退款／用畢不扣；額度觸發器擋下整體回滾；鎖定順序靜態檢查；教練／未登入／anon 被擋——全數符合。前端 `tests/deductrpctest.js` 26 項。測後測試庫筆數與各表雜湊與測前相同、殘留 0。
**未驗證**：真並行（本環境把同批呼叫排成先後；「相同操作同時送出」靠預約＋票券列鎖與識別比對，邏輯上成立但**沒有雙連線實測**）、真實 HTTP／登入角色。

## 操作登記與生命週期（rev7：版本改為單調計數）
**先重現再修**：rev5／6 的版本是「內容指紋」，內容改回原樣版本也回到原值。測試庫以當時實作重現（`p0e_16_op_aba_tests.sql`）：時長 120→60→120（無退款帳）後，第一個 120 時登記的舊扣課請求**成功扣了 1 堂**、舊登記請求被接受；名單移除再加入同樣復活。
**修法**：版本改為表 `booking_op_rev` 的**單調遞增計數**，由 `bookings` 上的觸發器 `trg_booking_op_rev` 在 狀態／名單／座位票／時長／日期／開始時間／綁定票 任一欄位改變時由資料庫自己加 1——任何寫入路徑（前端 dbPut、RPC、後台）都會觸發，不靠前端自願呼叫；只增不減，不會倒退。
- 登記 `fn_desk_op_begin(slot, 票, 預約, 預期版本)`：鎖預約後比對，不符＝`REV_MISMATCH`；登記時記下版本與退款筆數。扣課：鎖預約後版本或退款筆數與登記時不同＝`STALE_OP`；已套用過的重送（帳本有 `｜op:識別`）一律 already。
- 重試／重新整理：版本與退款筆數都沒變→登記回傳同一把識別。操作表主鍵＝`(booking_id, ticket_id, slot, epoch)`。
- 改備註等無關欄位不改版本；取消（狀態）會前進；正常連續多堂（期間預約未變）不被誤擋。
- 撤除（移除名額／縮短時長／取消）與登記／扣課都先鎖預約列，互相序列化。
**證據**：①測試庫 `p0e_14_desk_deduct_tests.sql`（循序；同一交易內先裝實際部署用的 06 版本再裝 08；含 ABA1–ABA12：時長 120→60→120、名額移除再加入、座位票改了又改回，舊扣課與舊登記皆被拒，已套用重送仍 already，新的合法操作可扣，版本值 2 前進、備註不動、取消前進、表 RLS／無 policy／觸發器存在）；②真實呼叫端 `deductlifecycletest.js` 31 項（含 120→60→120 無退款帳、名額移除再加入的舊請求被拒、真實 `tkDeductUnit` 重新讀版本後可扣）。
**限制**：循序證據，沒有雙連線並行（見授權範圍 A3）。**08 會在 `bookings` 新增兩個觸發器**（`trg_booking_op_rev`、`trg_booking_op_rev_insdel`；正式庫 bookings 原有 6 個）。

## 取消與扣堂競爭（B1，rev4 已用伺服器單一交易修）
新函式 `fn_desk_cancel_booking(預約, 模式)`：同一交易內鎖預約→逐票（依票 id 排序）退款→寫取消狀態與 refund_waived→稽核帳；任何一步失敗整個回滾。模式沿用原政策（auto／force／plain 有淨扣課就退，none＝人員選擇不退）。團課、強制退／不退都涵蓋；**前端櫃檯取消不再有前端兩步**——業務拒絕或連線失敗＝「取消未執行、沒有資料被更動」，教練不能走的模式只顯示「櫃檯才能處理」，單人課自動政策仍走既有 `fn_cancel_booking`（也移除了回退）。前端舊邏輯只剩沒有雲端連線（本機 demo／測試替身）。
**部分退款**：部分票退成功、部分退不掉（例如餘額已滿）→ outcome＝`refund_partial`：成功的保留、失敗的票留「取消・部分退款」稽核帳、refund_waived＝true、回傳失敗票清單；畫面「部分退款，尚有待處理」，**不算全部成功**。全部退不掉＝`refund_failed`。
**交錯**：取消與扣堂都先鎖預約；取消先提交→扣堂／登記被拒（BOOKING_CANCELLED）；扣堂先提交→取消會連這一堂一起退。測試庫（循序，兩種先後各一次）：I1 扣堂先取消後＝淨 0 退款含該堂；I1b／I2／I3 取消後的扣堂、登記、已登記未扣的遲到請求全被拒；F1 取消途中注入故障＝預約仍 booked、第一張票也沒退、無退款帳。
證據：前端真實 cancelBooking `tests/deskcancelrpctest.js` 15 項（團課／單人／force／none、部分退款提示、傳輸失敗重試後不寫入、業務拒絕無前端寫入、重試遇「已取消」補收贈點、教練不落回前端）；測試庫 C1–C6、I1–I3、F1。
**本版修掉的不含**：舊前端（尚未更新的頁面）仍是兩步寫入——見授權範圍 §D、監控 09。

## 取消退款語意
`refund_waived=true` 現在由三種來源，畫面與 tooltip 都能分辨：**系統退票失敗**（留「取消・退票失敗」稽核帳）、**團課部分退款**（成功的票不留標記；失敗的票留「取消・部分退款」帳，提示「部分退款，尚有待處理」，不再統一算已完成）、**人員選擇不退**（既有「取消・扣課不退」帳）；沒有任何標記的舊資料顯示「原因不明」，不亂編。預約明細、「退回這一堂」視窗、圓點 tooltip（ticketTokens）同一套（`bkWaiveKind`／`bkWaiveKindSync`／`bkWaiveTip`）。補退仍走 `mtkEatUndo`。

## 測試
全套 502 支，失敗 11 支，皆為 `origin/master` 本來就失敗的舊測試（同樣失敗、數量不增）。
三支雜湊釘住測試（cancelnopromotetest、holdcirclestest、instcardrulestest）：改釘 P0-E 版（deductTicket、cancelBooking、ticketTokens 三個函式），並以行為測試驗證保留的保護——取消不遞補分期保留預約（72 項，含退票失敗／團課部分退款／人員選擇不退／tooltip 分類）、deductTicket 不碰分期保留與預約不啟用效期（deductrpctest ⑥）。
場租測試（facilityvenuetest 29、facilityfreshtest 11，取自舊工作區）對本版全過。

## 仍會整列回寫票券餘額的位置（未改）
`_bkCoachLeaveUndo`、`_grantIssue`、`_confirmInstallNext`、`_tkTidyDo`（扣方向）；`_mtkEatUndoDo`、`doGroupCancelSeat`、`deskRefundCancelled`、`_doSaleUndo`（退方向）；作廢／換票／樂透修復（歸零）。這些不是「正常扣堂」，但仍有舊物件覆蓋風險。
