# YUGYM OS｜Sprint 2.5 Benefit Mapping 盤點

> 產出：2026-07-16　狀態：**唯讀盤點，未修改任何資料**
> 目的：確認前端（靠 category 字串）與後端 RPC（靠 `benefit_type`）的落差是否可安全對齊，作為 Sprint 3 前端切換 RPC 的前置。

---

## 0. 一頁結論

| 檢查項 | 結果 | 風險 |
|---|---|---|
| 票種 `benefit_type` 是否齊全 | ✅ 9 種票種全部有值 | 無 |
| 2226 張票券能否對到 benefit_type | ✅ **100% 對得到**（0 空、0 孤兒、0 可用票對不到） | 無 |
| category → benefit_type 是否唯一 | ⚠️ 一對一，**除了「私人教練」分成一般/友善兩種** | 中，可解 |
| `bookings.benefit_type` 現況 | 🔴 1462 筆**全空** | 低（前進用 RPC 填即可） |
| `bookings.ticket_id` 現況 | 🔴 僅 4/1462 有值；236 筆未來預約僅 1 筆有 | **高**（影響取消退票） |
| reward_rules vs 前端發點 | 2 條規則，需與前端行為比對（Sprint 3） | 中 |

**總評**：票券資料很乾淨，可以切。但「取消退票」與「友善課判斷」兩點必須先解，否則貿然切 RPC 會造成退票失效。

---

## 1. category → benefit_type 對照表

| 前端 category | benefit_type | 對應票種 | 是否唯一 |
|---|---|---|---|
| 私人教練 | `coaching_session` | 教練課/限定/VIP（legacy） | ⚠️ 與 friendly 共用 category |
| 私人教練（友善） | `friendly_session` | 友善教練課 | ⚠️ 需靠票種判斷 |
| 小班肌力 | `group_session` | 團體課 | ✅ |
| 自主訓練 | `training_pass` | 自主訓練 / 友善自主訓練 | ✅ |
| 體驗 | `none`（不扣） | 體驗課 | ✅ |
| 運動按摩 | `massage_session` | 運動按摩 | ✅ |

### 唯一的模糊點：私人教練 → coaching / friendly

「私人教練」這個 category 同時對應 `coaching_session` 與 `friendly_session`，光看 category 分不出來。友善與否的訊號在**票種本身**（票種「友善教練課」`tt-mqdt4ijw29ga` 的 benefit_type 才是 friendly_session）。

**建議解法（Sprint 3 採用）**：不要讓前端從 category「猜」 benefit_type。而是沿用前端現有的選票邏輯（`findUsableTicket` 已能區分友善），**先選定要扣的票 → 讀該票 ticket_type 的 benefit_type → 把這個 benefit_type 傳給 `fn_create_booking`**。這樣完全避開 category 的模糊，且與現行扣票行為一致。

> 注意：`fn_create_booking` 內部的 `benefit_consume` 會再依 benefit_type 做 FIFO 選票，可能與前端預選的「同 benefit_type 但不同批」的票不同。只要 benefit_type 對，FIFO 選最早到期是 RPC 的正確職責，可接受。

---

## 2. 票券 benefit_type 分布（健康度）

| benefit_type | 票券總數 | 可用票 | 可用剩餘堂數 |
|---|---:|---:|---:|
| coaching_session | 1116 | 107 | 477 |
| group_session | 651 | 21 | 228 |
| training_pass | 210 | 179 | 387 |
| friendly_session | 171 | 23 | 95 |
| massage_session | 78 | 19 | 21 |
| **合計** | **2226** | **349** | **1208** |

全部對得到 benefit_type，無任何未對應。

---

## 3. 兩個資料缺口（Sprint 3 必須先處理）

### 缺口 A：`bookings.ticket_id` 幾乎全空 → 取消退票會失效 🔴

| 指標 | 數字 |
|---|---:|
| 總預約 | 1462 |
| 有記錄 ticket_id | **4** |
| 進行中（booked/checked_in） | 293 |
| 進行中且有 ticket_id | 3 |
| 未來未上課（booked 且 date≥今天） | 236 |
| 未來預約且有 ticket_id | **1** |

**問題**：現行前端 `deductTicket` 扣票時，沒有把「扣了哪張票」寫回 `bookings.ticket_id`。而 `fn_cancel_booking` 是靠 `ticket_id` 呼叫 `benefit_refund` 退票。若直接把取消切成 RPC，**235 筆現存未來預約一取消，票不會退回**。

**建議策略（三選一，Sprint 3 決策）**：
1. **混合切換（建議）**：新預約走 `fn_create_booking`（會寫 ticket_id）→ 這些用 RPC 取消沒問題；**既有無 ticket_id 的舊預約，取消仍走前端舊邏輯**（`refundTicket` 靠 category/log 重新找票退）。以「booking 有無 ticket_id」自動分流。風險最低。
2. **回填 ticket_id**：為 236 筆未來預約回推當初扣的票並補寫 ticket_id。難點：舊扣票沒留關聯，回推不一定準（可能退錯批）。需人工核對，成本高。
3. **強化 fn_cancel_booking**：當 ticket_id 為空時，讓 RPC 內部依 member+benefit_type 找一張票退（模擬前端舊邏輯）。可行但改動 RPC，需完整測試。

> 小班肌力（group_session）取消，前端目前是靠比對 ticket_logs 的 deduct/refund 逐筆退，RPC 沒有這段邏輯——這也並入上述策略一併處理。

### 缺口 B：`bookings.benefit_type` 全空 → 前進填即可 🟢

1462 筆 booking 的 benefit_type 全是 null。這是低風險：`fn_create_booking` 會在建立時寫入 benefit_type，往後新預約自動有值。歷史預約留空不影響（歷史不需要再算 benefit）。若簽到發點需要用到（見下），才需考慮回填。

---

## 4. 簽到發點：reward_rules vs 前端

資料庫 `reward_rules` 目前 2 條（皆 `booking_checkin` 事件、發 2 點自主訓練、效期 7 天）：

| 規則 | 來源 benefit_type | 發放 | 數量/效期 |
|---|---|---|---|
| rr_checkin_coaching | coaching_session | training_pass 券 | +2 / 7 天 |
| rr_checkin_friendly | friendly_session | training_pass 券 | +2 / 7 天 |

後端 `handle_checkin_reward` 靠 booking 的 `benefit_type` 查規則發點。**但 booking.benefit_type 現在全空**（缺口 B）——代表若現在就切簽到到 RPC，`handle_checkin_reward` 查不到規則、一律 skipped、**不會發點**。

**影響 Sprint 3**：簽到切 RPC 前，必須確保 booking 建立時就寫入正確 benefit_type（缺口 B 前進面已解），且需與前端現行 `grantCheckinReward`（靠類別+名稱關鍵字判斷「教練課/友善課才發」）的行為逐案比對，確認發點對象、數量、效期一致，避免切換後會員拿到的點數變多或變少。

---

## 5. 交棒 Sprint 3（RPC Migration）前置清單

切換前端到 RPC **之前**，必須完成：

1. **修 `fn_create_booking`**：`p_category::booking_category` → `ticket_category`（Sprint 1 發現①，否則建立預約全失敗）。
2. **收斂 `fn_checkin_booking`**：兩支重載擇一，保留含權限檢查那支（Sprint 1 發現③）。
3. **決定取消策略**：採 §3 缺口 A 的「混合切換」（建議）或其他。
4. **benefit_type 傳遞**：前端改為「選定票 → 取該票 benefit_type → 傳 RPC」（§1 建議解法）。
5. **發點行為比對**：reward_rules 與前端 `grantCheckinReward` 對齊（§4）。
6. 全部先在**測試環境**驗，再切正式；每個流程（建立/取消/簽到）獨立可回退。

> 資料面結論：**可以切，但不是「換個呼叫」這麼簡單**。票券資料乾淨是最大利多；真正要處理的是「取消退票的 ticket_id 缺口」與「友善課/發點行為的語意對齊」。
