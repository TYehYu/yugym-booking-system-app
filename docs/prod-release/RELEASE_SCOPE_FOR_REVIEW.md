# P0E 發布範圍與上線阻擋（供 Codex 獨立審查；精簡版）

日期：2026-11-15。正式庫 `rlpiomzplckzqnqrvrwc` **全程只讀，尚未部署任何東西**。階段檔與順序見 `README_PROD_RUNBOOK.md`，本檔只寫「現在還差什麼」。

## 1. 兩位會員現況（正式庫唯讀，與 `YUGYM_OPEN_ISSUES_20261115.md` 逐項相符、沒有變動）
- **曾邦宏** `TK-muqmorr0zr1v`（教練培訓 1V2，分期 3 期、已開通 8／12）：餘額 4；帳本 deduct 14／refund 6／adjust 2（一筆 delta 0 的分期收款、一筆 −1 的校正）／grant 12；淨扣 8、含校正算 9 ≠ 餘額已用 8 ⇒ **帳本比餘額多 1 的歷史差異仍在**（決策 B：不補、不刪、不隱藏對帳警示）。預約 7 簽到＋1 待上（11/20）＋6 取消。自 11/15 07:51（UTC）校正後沒有新帳本或預約異動。
- **陳玟勳** `TK-mvp2vrdxd4h8`：見 `05_backfill_DRYRUN_20261115.md`（效期仍未開通、乾跑預期 11/02→11/29、有 11/16 時間順序風險）。

## 2. 發布範圍（沒有任何一項已在正式庫執行）
| 階段 | 內容 | 本輪新增的驗證 |
|---|---|---|
| 01 P0-C 調課 RPC／02 P0-E 簽到才啟用／03 TKWIN／04 補償／06 額度防護＋原子退票／07 benefit_refund 補鎖 | 資料庫 SQL，順序與回復見 runbook | 部署前唯讀檢查**今天重跑，仍符合**：新物件 0、`activation_mode` 欄位無、依賴 4 項齊、`notify_recipient` 含 desk、`benefit_refund` 指紋 `dbe63afe…:736` 與權限未變、`fn_move_booking_ticket` 不存在、票券 4674 張＋雜湊記錄、既有待處理資料 4 筆（P0-C 之前調課遺留，部署前後不應改變） |
| 前端 `index.html` | P0-C／P0-E／補償接線、`fn_refund_ticket`、額度訊息 | 見 §3「阻擋」 |
| 05 歷史補正 | 另需授權 | 乾跑見專檔 |

## 3. 上線阻擋（還差什麼）
1. **前端必須重建，不能直接上目前工作區的 `index.html`**：工作區的 P0E 修改還在舊基底（`8500aa8`、未提交），遠端 `master` 已前進（含 Codex 的 `0ced889` 場租修復、教練行事曆、跑步機等 5 個提交）。把工作區對 `index.html` 的差異（2028 行）套到最新遠端會有 **16 處衝突**：版本號 1 處；P0E 自己的 6 處（`dbFriendlyError`／`rpcBookingErrMsg` 的額度與 HOLD 訊息 4 處、`_doBkMoveTicket`、`expandBkCard` 分期按鈕順序）需手動合併；其餘 9 處是工作區舊殘留（教練行事曆診斷／輪詢、`bkCardPop`、`ppRecordHtml`、`coachHomeV2`），遠端已處理，應採遠端版本。做法：從 `origin/master` 開新分支，只套 P0E 的部分，再跑整套測試。
2. 各階段仍需你**逐階段授權**，且順序固定：01、02、03、04、06（前端之前）；前端最後；05 另議。
3. 仍**未驗證**（工具做不到，非忽略）：並行（Q11、R14a／b：本環境把同批呼叫排成先後，已證實未重疊）、真實 HTTP／登入角色（需你本機執行）、前端 UI 手動走一遍。
4. 曾邦宏類問題「防再發」的覆蓋範圍：額度防護觸發器對**所有**扣課入口有效（見 §4）；原子退票只修「退」；**櫃檯扣課 `deductTicket` 前端仍是非原子的整列回寫（14 處呼叫，只列清單未替換）**——並行下仍可能 lost update。+1 差異當初怎麼來的無法證明。

## 4. 本輪補上的驗證（其餘已通過且內容未變的不重做）
- **入口原文實測（補 Q12／R14c 的缺口）**：在測試庫、單一交易、整段回滾，先在交易內裝額度觸發器，再把**正式庫三支入口函式原文**（`fn_deduct_ticket`、`fn_member_join_group`、`fn_member_self_book`；指紋與正式庫逐字相同）建成暫時函式執行：櫃檯扣課在分期滿額時丟出 `TICKET.INSTALLMENT_LOCKED`、會員報團課／自助預約回 `ok=false, error_code=TICKET.INSTALLMENT_LOCKED`；被擋時**餘額不變、無帳本、無預約列、名單不多人**；一般票與開通下一期後**不被誤擋**。6 個情境全部符合。`fn_group_save_members` 只做靜態檢視（錯誤處理形狀與上面相同：`exception when others → error_code=SQLERRM`），未動態測。
- **靜態檢視正式庫 12 支入口**：所有會扣課的入口最後都是 `update member_tickets set sessions_remaining = …`，觸發器全部涵蓋；錯誤去向：`fn_deduct_ticket` 直接丟給呼叫端，其餘有 `exception when others → error_code=SQLERRM` 並整體回滾。
- **「安裝檔＝正式庫本體」已證實**：`trg_bookings_cancelled_by`／`trg_bookings_touch`／`fn_bookings_group_guard` 的正式庫指紋與 `p0e_13` 安裝檔常數逐字相同（原先只比長度）；兩個 hold 守門函式與測試庫相同；`desk_alert` 只差一行註解與權限（正式庫更嚴，P0E 函式為 security definer，不受影響）。
- 測試庫基準：本輪所有測試整段回滾，筆數與各表雜湊與測試前相同、殘留 0。

## 5. 審查重點
§3-1 的前端合併範圍；§2 階段順序與 05 的時間風險；§3-4 的殘餘風險是否可接受；§4 的實測是否足以取代 Q12／R14c（並行與 HTTP 仍未驗）。
