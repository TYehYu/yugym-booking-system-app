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

## 4. 尚待人工在瀏覽器點擊驗證（需看畫面，交使用者）

本機測試站：`http://127.0.0.1:8010/`（指向測試庫；登入 帳號 `admin` / 密碼 `yugym-test-123`，選「管理員」）。
逐一開旗標，確認 UI 成功/錯誤吐司、扣退票堂數、發點提示皆正確（清單見對話）。

## 5. 正式切換順序（驗收後）

1. 瀏覽器逐流程驗收（建立 → 取消 → 簽到），全綠。
2. 正式資料庫套 `20260716_01`（修 fn_create_booking）、`20260716_02`（收斂 fn_checkin_booking）。
3. `index.html` 內三個旗標逐一改 true（或保留 Console 灰度）；更新 `APP_VERSION`。
4. merge 到 master → 推 GitHub → Pages 上線（1~2 分鐘）。
5. 線上以真帳號抽驗一輪；有異狀即把對應旗標改回 false 重推（秒級回退）。

> 目前正式資料庫、正式網站、master 皆未變動。
