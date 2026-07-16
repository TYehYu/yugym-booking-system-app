# YUGYM OS｜Sprint 3 RPC Migration 實作計畫

> 產出：2026-07-16　狀態：**計畫文件；程式與資料庫尚未修改**
> 依據 [Sprint 2.5 Review](自使用者文件) 與 [SPRINT2_5_BENEFIT_MAPPING_AUDIT.md](./SPRINT2_5_BENEFIT_MAPPING_AUDIT.md)。
> ⚠️ Sprint 3 是**第一個會修改正式程式與正式資料庫的 Sprint**。線上系統有真實會員、要求零停機。

---

## 0. 這個 Sprint 的風險等級

前面 1 / 2 / 2.5 都是「只讀 + 寫文件」，零風險。**Sprint 3 開始真的動手**：改 index.html 的預約/取消/簽到、改正式資料庫的 RPC。因此每一步都要能獨立驗證、獨立回退。

---

## 1. 執行順序（依 Review 文件）

| 步驟 | 內容 | 動到什麼 | 風險 |
|---|---|---|---|
| 3-1 | 修 `fn_create_booking`（型別 bug） | 正式 DB（但函式無人呼叫） | 低 |
| 3-2 | 收斂 `fn_checkin_booking`（移除無權限版） | 正式 DB（函式無人呼叫） | 低 |
| 3-3 | 前端：建立預約改呼叫 `fn_create_booking` | index.html | 高 |
| 3-4 | 前端：取消改「混合策略」 | index.html | 高 |
| 3-5 | 前端：簽到改呼叫 `fn_checkin_booking` + 發點一致性 | index.html | 高 |
| 3-6 | 測試環境完整驗證（三流程 × 多情境） | 測試環境 | — |
| 3-7 | 驗收後部署正式（推 GitHub → Pages） | 線上 | 高 |

3-1、3-2 的 SQL 已備妥於 `docs/migrations/`（尚未執行）。

---

## 2. 混合取消策略（步驟 3-4，最關鍵）

**問題重述**：現有 236 筆未來預約幾乎都沒有 `ticket_id`（只有 1 筆有）。`fn_cancel_booking` 靠 `ticket_id` 退票，對這些舊預約會退不到票。

**策略：依 booking 有無 `ticket_id` 自動分流（不回填歷史）**

```
取消一筆 booking b：
  if b.ticket_id 存在（＝新制、由 fn_create_booking 建立）:
      → 呼叫 sb.rpc('fn_cancel_booking', { p_booking_id: b.id, p_reason })
  else（＝舊制，無扣票關聯）:
      → 走現行前端舊邏輯 cancelBooking（refundTicket 靠 category/log 重找票退）
```

- 好處：新舊預約各自用能正確退票的路徑；不動歷史資料；隨時間推移，舊制預約自然消化殆盡。
- 小班肌力（group_session）舊制取消仍走前端 log 比對邏輯，不變。
- 前端只需在取消入口加一個 `if (b.ticket_id)` 判斷分流，改動面小、好回退。

---

## 3. 建立預約改 RPC（步驟 3-3）

**benefit_type 怎麼傳（Sprint 2.5 結論）**：不從 category 猜。沿用現行 `findUsableTicket` 選定要扣的票 → 讀該票 `ticket_type.benefit_type` → 傳給 RPC。

```
submitBooking / runRecurringBooking 內：
  1. 照舊選定 member、coach、category、date、time、（friendly 與否已知）
  2. tk = findUsableTicket(...)            // 現行邏輯，已能區分友善
     benefitType = tk 對應 ticket_type 的 benefit_type
     （體驗課無票 → benefitType = 'none'）
  3. res = sb.rpc('fn_create_booking', {
        p_member_id, p_coach_id, p_category, p_benefit_type: benefitType,
        p_date, p_start_time, p_duration, p_space_id, p_resource_id, p_note })
  4. if (!res.ok) → 顯示錯誤（用 error_code 對應中文訊息），不再自己 dbPut/deduct
  5. 成功 → 用回傳的 booking_id / remaining_after 更新畫面
```

- 移除該路徑原本的 `dbPut('bookings')` + `deductTicket` + `logTicket`（改由 RPC 一次完成）。
- `pushNotification` 是否併入 RPC？現階段 RPC 未發通知 → 建議**通知仍由前端發**（維持現況，降低 RPC 改動），或列為後續。
- 團體課（多人）：逐人呼叫 RPC，或後續加批次 RPC；Sprint 3 先支援單人/逐人。
- **空間參數**：`p_space_id`/`p_resource_id` 對應現行 general/group_room/treadmill 邏輯，需確認前端傳值與 `space_check` 一致。

錯誤碼對應（RPC 回傳 → 中文）：`BOOKING.TIME_CONFLICT`＝教練時段衝突、`BOOKING.SPACE_FULL`＝一般區已滿(3)、`BOOKING.RESOURCE_BUSY`＝該資源已被預約、`TICKET.EMPTY`/`TICKET.EXPIRED`/`POINT.EMPTY`＝無可用票/點。

---

## 4. 簽到改 RPC + 發點一致性（步驟 3-5）

```
checkInBooking(b, source) 內：
  res = sb.rpc('fn_checkin_booking', { p_booking_id: b.id, p_checkin_source: source })
  if (res.ok) → 更新畫面（reward_status: issued=有發點 / skipped=未發）
  移除前端 grantCheckinReward 自行發點（改由後端 handle_checkin_reward）
```

**發點一致性驗證（切換前必做）**：後端靠 booking.benefit_type + reward_rules 發點。需逐案比對前端 `grantCheckinReward` 現行行為：
- 對象：教練課(coaching)、友善課(friendly) 簽到才發 → reward_rules 已符。
- 數量/效期：+2 點、7 天 → 確認與前端一致。
- 「當天簽到才發、隔天補簽不發」：後端已實作，確認前端現行是否相同，避免行為改變。
- **前提**：booking 必須有 benefit_type。新制由 fn_create_booking 寫入；舊制 booking 無 benefit_type → 若對舊 booking 簽到，後端會查不到規則而 skipped。需確認：對舊預約簽到的發點，走舊前端邏輯或可接受不發（依業務決定）。

---

## 5. 測試環境策略（步驟 3-6）— 需使用者決定

計畫文件都要求「先測試環境、再正式」。目前**尚無測試環境**。選項：

| 選項 | 做法 | 成本 | 擬真度 |
|---|---|---|---|
| A. Supabase 測試分支 | 用 MCP 建 branch（含 schema + 資料快照），在分支上跑 RPC/RLS/前端 | 約 US$0.0134/小時（≈US$0.32/天），用完刪除 | 高（真環境） |
| B. 另建免費 Supabase 專案 | 手動貼 schema + 少量假資料 | 免費 | 中（需自行搭） |
| C. 本機驗證為主 | RPC 邏輯以少量假資料在分支/專案驗；前端指向測試設定 | 視上二者 | 視情況 |

> 建議 **A**：最貼近正式、成本極低、驗完即刪。需你同意這筆小額費用。

---

## 6. 部署與回退（步驟 3-7）

- 前端改動在 git 分支 `sprint3-rpc-migration` 上做，本機/測試環境驗證後才 merge 到 master 推線上。
- 每個流程（建立/取消/簽到）可獨立開關：可用一個前端旗標（如 `USE_RPC_CREATE`）逐一切換，出問題只回退該項。
- 正式 DB migration（3-1、3-2）先於前端切換套用（因函式無人呼叫，先上安全）。
- 回退：前端 `git revert` + 重推；DB 函式 `CREATE OR REPLACE` 還原。

---

## 7. 驗收標準（對齊 Review 文件）

- [ ] 新增預約全面改用 RPC（單人；團課逐人）
- [ ] 舊預約取消可正常退票（走舊邏輯分流）
- [ ] 新預約取消可透過 RPC 正確退票（ticket_id 回補、log refund）
- [ ] 友善課扣票完全一致（benefit_type 由選定票反推）
- [ ] 簽到發點與現行一致（reward_rules 比對通過）
- [ ] 正式網站零停機、會員無感切換

---

## 8. 現在卡在哪 / 下一步

**已備妥（未執行）**：`docs/migrations/` 兩支修復 SQL。
**需你決定才能往下**：
1. 測試環境用哪個選項（建議 A，小額費用）。
2. 是否同意「混合取消策略」「benefit_type 由選定票反推」「通知暫留前端」這三個設計決策。

決定後，我會先在測試環境套 migration + 改前端 + 跑完整驗證，全綠再請你決定是否部署正式。**在你同意前，不動正式資料庫、不動 index.html。**
