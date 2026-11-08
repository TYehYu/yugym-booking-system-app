# 分期保留額度（Fix B/C）併發風險 — 後續改善待辦

> 建立：2026-11-09。範圍：施佩怡案例 Fix A/B/C（`submitPendingHold`／`_doConvertPending`）的
> 分期鎖定額度（`lockedLeft`／`_holdQuota`）併發風險。
> **這份文件跟 `YUGYM_BOOKING_RACE_FIX_STAGE1.md`／`YUGYM_BOOKING_RACE_FIX_PROD_CHECKLIST.md`
> 是兩個不同的專案，不要混在一起**——Phase 2 那組修的是「預約時段/場地容量」的競態
> （`space_check`／idempotency key／`fn_group_save_members`），這份修的是「分期已簽約但未
> 開通的額度」要不要被標記成『分期待繳費保留』的競態，兩者程式碼路徑完全不同。
>
> **狀態：2026-11-09 決策採方案A——本輪不新增 RPC、不做 migration，風險已知、已記錄、接受現狀上線。**

---

## 1. 風險是什麼

`submitPendingHold()`（建卡位）與 `_doConvertPending()`（整串轉正）都是：
**先讀一次「目前還剩多少分期鎖定額度可以標記」→ 在記憶體裡逐筆扣 → 逐筆 `dbPut('bookings',...)`**。

整個過程完全沒有：
- 任何 RPC（不像 `fn_deduct_ticket`／`fn_member_join_group`／`fn_member_self_venue` 都用了
  `select ... for update` 鎖住 `member_tickets`／`bookings`）
- 任何資料庫交易（多筆 `dbPut` 是各自獨立的請求，不是同一個 transaction）
- 任何唯一性約束或 check constraint（`bookings`／`member_tickets` 的 constraint 只有
  primary key 與 foreign key，查證於 2026-11-09 正式庫唯讀稽核）

## 2. 會在什麼情境下出事

兩個操作**幾乎同時**對**同一位會員、同一張分期票**動作，例如：
- 櫃檯跟教練同時在各自的裝置上幫同一位會員處理預約
- 同一人開兩個分頁，重複點了「整串轉正」或「建立卡位」

兩邊都會讀到同一份「目前已標記幾堂」的舊快照，各自以為自己還有額度可以標記，
結果可能把同一份鎖定額度**標記超過一次**（例如 4 堂的額度被兩個操作各標記了 4 堂，
變成 8 堂都掛著「分期待繳費保留」）。

## 3. 後果有多嚴重（這點很重要，決定了為什麼本輪可以接受風險）

- **不會超扣票券**：`lockedLeft`／held 分支從不呼叫 `deductTicket`，純粹是在 `bookings.note`
  寫字串，不動 `member_tickets.sessions_remaining`。
- **不會刪除或覆蓋既有預約**：沒有 constraint 會因為這個情境報錯或 rollback，最壞狀況是
  「標記的堂數比實際應保留的多」。
- **真正的風險點在下一步**：下一期收款觸發 `promoteHeldBooking()`（開通下一期）時，它會按
  「最早的 held 預約」往下自動補綁票券——如果前面因為併發多標記了幾堂，`promoteHeldBooking`
  有可能多綁幾堂超過這期實際繳費的堂數。**這是現有風險會真正造成影響的地方**，但仍然只是
  「綁錯對象」，可以靠人工核對 `ticket_logs` 與 `bookings.note` 事後更正，不是資料遺失。

## 4. 回復方式（方案A上線後，如果真的撞到）

1. 查 `bookings` 表 `note='分期待繳費保留（收款後自動補扣）'` 且 `member_id=<該會員>` 的筆數，
   比對這一期應保留的堂數。
2. 多出來的筆數，手動把 `note` 清成 `null`（UPDATE，需使用者另外核准，不在唯讀範圍內）。
3. 不需要回滾程式碼——`index.html` 本身邏輯正確，問題只會發生在「兩個操作真的同時命中」
   的極窄時間窗內。

## 5. 未來要做的事（本輪不實作，留給下一輪）

比照 `fn_deduct_ticket` 已經驗證過的模式，新增一支 `SECURITY DEFINER` RPC（暫定
`fn_tag_installment_hold`），把「讀 lockedLeft → 標記 bookings」包進同一個交易：

```sql
-- 草案方向，尚未設計細節、尚未測試，不能直接套用
select sessions_total, unlocked_sessions
  from member_tickets where id = p_ticket_id for update;   -- 鎖住這張票，擋住併發讀到同一份快照
-- 在同一個交易內重新計算 lockedLeft、重新數現有 held 筆數，再批次 update bookings.note
```

需要的前置工作（下一輪再排）：
- 設計 `lockedLeft` 的「唯一真相來源」：目前是前端用 `sessions_total - unlocked_sessions` 現場
  算，RPC 版本要決定這個算式搬到 DB 端用同一套邏輯，還是前端算好當參數傳入、RPC 只負責鎖與寫。
- 測試庫（`kucvxpjatptfckhlxptj`）先行驗證，比照 Phase 2 的流程。
- 正式庫部署需要 migration + 使用者另外授權。
