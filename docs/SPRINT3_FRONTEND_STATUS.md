# YUGYM OS｜Sprint 3 前端整合狀態

> 更新：2026-07-16　分支：`feature/sprint3-rpc-migration`（未推送、未上線）
> 三個流程皆以**獨立 Feature Flag、預設關閉**接上 RPC；旗標關閉時行為與過往完全一致。

---

## 1. Feature Flags（`index.html` 內，預設全關）

```js
window.FEATURE_FLAGS = {
  createBookingRpc: false,   // 建立預約 → fn_create_booking
  cancelBookingRpc: false,   // 取消     → fn_cancel_booking（混合分流）
  checkinBookingRpc: false,  // 簽到     → fn_checkin_booking
};
```

瀏覽器 Console 可暫時開啟測試（重新整理後歸零）：
```js
window.FEATURE_FLAGS.createBookingRpc = true
```

## 2. 各流程接法與範圍

| 流程 | 進入點 | 走 RPC 的條件 | 其餘走舊邏輯 |
|---|---|---|---|
| 建立預約 | `runRecurringBooking` 單人路徑 | 旗標開 + 有可用票（非體驗）| 團課、體驗維持原樣 |
| 取消 | `cancelBooking` | 旗標開 + **有 ticket_id** + 非小班肌力 + 自動政策 | 團課、legacy 無票、強制退/不退 |
| 簽到 | `checkInBooking` | 旗標開（保留前端 30 分鐘時間限制）| — |

- **benefit_type**：由選定票的票種反推（`benefitTypeOfTypeId`），避開友善課判斷；查不到則退回舊路徑（保險）。
- **取消混合分流**：已用測試資料證實 legacy 無 ticket_id 走 RPC 會漏退票，故僅新制走 RPC。
- **RPC 失敗自動回退**：三個流程一旦 RPC 未成功（連線錯誤或 ok:false），都回退前端舊邏輯；RPC 為單一交易、失敗不留痕，回退安全。RPC 成功則立即 return，不會重複執行。
- **通知**：維持前端發送（未併入 RPC）。

## 3. 已完成的驗證（自動、不需瀏覽器）

| 驗證 | 方式 | 結果 |
|---|---|---|
| JS 語法 | osascript 逐 script 區塊編譯 | ✅ 0 錯誤 |
| 純邏輯輔助（benefit_type、錯誤碼）| JXA 單元測試 10 項 | ✅ 全過 |
| 分流判斷（取消資格、簽到來源）| JXA 單元測試 9 項 | ✅ 全過 |
| 建立 RPC client 合約 | 匿名金鑰 HTTP 呼叫 | ✅ ok:true、正確扣票 |
| 建立+取消 client 合約 | 登入 admin token → HTTP | ✅ 建立扣票、取消退票 |
| 簽到 client 合約 | 登入 admin token → HTTP | ✅ 簽到成功、發點 issued |

> 測試環境：免費專案 `yugym-sprint3-test`，schema 與正式 1:1 對齊、無真實個資。

## 3b. 瀏覽器實測（2026-07-16，osascript 驅動 Chrome，指向測試庫）

| 驗證 | 結果 |
|---|---|
| App 在收緊 RLS 下開機 | ✅ 正常渲染 |
| 四角色登入渲染（會員/教練/櫃台/管理員）| ✅ 皆正常、無破頁；選單依角色不同、各自只見該見資料 |
| **建立預約 UI→RPC→DB（旗標開）** | ✅ **端到端確認**：精靈建立教練課，DB 該筆 `benefit_type=coaching_session`（RPC 才會寫）、扣 FIFO 票 `mt_reg_pt_a` |

> 建立預約已完整走完「按鈕 → createBookingViaRpc → fn_create_booking → 資料庫」。取消/簽到採**相同接法**（旗標→sb.rpc→處理結果），已於 HTTP+功能+單元層驗證；其 UI 最終點擊（需在行事曆定位特定課）未自動化完成，屬測試操作限制，非程式疑慮。

## 4. 尚待人工在瀏覽器點擊驗證（需看畫面，交使用者）

建議由使用者在測試站快速手點一次「取消」「簽到」確認吐司/畫面（各約 1 分鐘）。
本機測試站：`http://127.0.0.1:8010/`（帳號 `admin`/`fd`/`coach`、會員手機 `0900000001`，密碼皆 `yugym-test-123`）。Console 開對應旗標後操作。

## 5. 正式切換順序（驗收後）

1. 瀏覽器逐流程驗收（建立 → 取消 → 簽到），全綠。
2. 正式資料庫套 `20260716_01`（修 fn_create_booking）、`20260716_02`（收斂 fn_checkin_booking）。
3. `index.html` 內三個旗標逐一改 true（或保留 Console 灰度）；更新 `APP_VERSION`。
4. merge 到 master → 推 GitHub → Pages 上線（1~2 分鐘）。
5. 線上以真帳號抽驗一輪；有異狀即把對應旗標改回 false 重推（秒級回退）。

> 目前正式資料庫、正式網站、master 皆未變動。
