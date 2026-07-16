# YUGYM OS｜Sprint 3 RPC 測試結果（測試環境）

> 產出：2026-07-16　環境：免費測試專案 `yugym-sprint3-test`（`kucvxpjatptfckhlxptj`）
> schema 由正式庫萃取、1:1 對齊（25 表/14 enum/18 函式/55 政策/56 索引/22 外鍵，全部相符），**不含真實會員資料**。
> 本輪只在測試環境操作；**正式資料庫與正式網站未修改**。

---

## 0. 總結

資料庫端三支 RPC 全部驗證通過（含修復與收斂）。**可以進入前端切換（Sprint 3-3~3-5）**。

| 項目 | 結果 |
|---|---|
| fn_create_booking 修復（booking_category→ticket_category） | ✅ 修復前重現錯誤、修復後正常 |
| fn_checkin_booking 收斂（移除無權限三參數版） | ✅ 收斂前 2 參數呼叫「is not unique」報錯 → 收斂後正常 |
| 建立預約全情境 | ✅ 通過 |
| 取消退票全情境（含 legacy 缺口） | ✅ 通過，且證實 legacy 缺口 |
| 簽到 + 發點 + 權限 | ✅ 通過 |

---

## 1. fn_create_booking：修復前後

| 步驟 | 呼叫 | 結果 |
|---|---|---|
| 修復前 | 建立教練課預約 | `ok:false, error_code:"type booking_category does not exist"`（重現 Sprint 1 發現①）|
| 套修復 `20260716_01` | booking_category → ticket_category | 成功 |
| 修復後 | 同一筆 | `ok:true`，扣 FIFO 最早到期票 `mt_reg_pt_a`（5→4）|

## 2. 建立預約：扣票與錯誤碼

| 測試 | 預期 | 實際 |
|---|---|---|
| 一般教練課 | 扣 coaching 票、FIFO 最早到期 | ✅ 扣 mt_reg_pt_a |
| 友善教練課 | 扣 friendly 票（不碰 coaching）| ✅ 扣 mt_fri_friendly |
| 自主訓練 | 扣 training_pass 點 | ✅ 扣 mt_fri_self |
| 體驗（none）| 不扣任何票 | ✅ benefit_ref=null |
| 會員無票 | TICKET.EMPTY | ✅ |
| 會員僅過期票 | TICKET.EXPIRED | ✅ |

## 3. 場地 / 時段衝突（space_check）

| 測試 | 預期 | 實際 |
|---|---|---|
| 同教練同時段 | BOOKING.TIME_CONFLICT | ✅ |
| 一般區同時段第 4 筆（上限 3）| BOOKING.SPACE_FULL | ✅ |
| 團課教室同時段第 2 筆（獨占）| BOOKING.RESOURCE_BUSY | ✅ |
| 跑步機同一台同時段第 2 筆 | BOOKING.RESOURCE_BUSY | ✅ |
| 跑步機維修中（tm2）| BOOKING.RESOURCE_MAINTENANCE | ✅ |

> 失敗的建立皆完整 rollback（無半套 booking、無誤扣票）—— 交易性驗證通過。

## 4. 取消退票（fn_cancel_booking）

| 測試 | 預期 | 實際 |
|---|---|---|
| 24h 前取消（有 ticket_id）| refunded，票 +1，寫 refund log | ✅ 退 mt_reg_pt_a、log +1 |
| 24h 內取消（教練課）| forfeited，不退，makeup=eligible_pending | ✅ |
| **legacy 取消（無 ticket_id）** | ⚠️ 回 "refunded" 但 refunded_ticket=null、**票實際沒退** | ✅ **證實缺口** |

**帳目核對**：`mt_reg_pt_a` 5→4→3→(退)4 ✅；legacy 會員票 `mt_leg_pt` 維持 5 未動 ✅；ticket_logs 9 筆 deduct / 1 筆 refund，總和相符 ✅。

> legacy 缺口已用真實資料驗證 → **前端取消必須採「混合分流」**：有 ticket_id 走 RPC，無 ticket_id 走前端舊邏輯（[SPRINT3_RPC_MIGRATION_PLAN.md](./SPRINT3_RPC_MIGRATION_PLAN.md) §2）。

## 5. 簽到與發點（fn_checkin_booking + handle_checkin_reward）

| 測試 | 預期 | 實際 |
|---|---|---|
| 教練課當天簽到 | reward issued，發自主點 +2 / 7 天 | ✅ 產生 TK- 票（tt_self, 2 點, 7 天, 指回原 booking）|
| 團課當天簽到 | skipped（無 reward rule）| ✅ |
| 重複簽到 | 冪等 already:true，不重複發點 | ✅ |
| 未登入者簽到（安全版）| MEMBER.INVALID | ✅ 擋下 |
| 櫃台登入後簽到（安全版）| 成功 | ✅（模擬 JWT，is_any_staff=true, emp=e_fd）|

## 6. fn_checkin_booking 收斂：一個「阻擋前端」的隱藏地雷

收斂前，資料庫同時存在 2 參數與 3 參數兩個版本。用 2 個參數呼叫時 Postgres 回：
`function fn_checkin_booking(unknown, unknown) is not unique`。

**意義**：前端若照計畫用 `sb.rpc('fn_checkin_booking',{p_booking_id,p_checkin_source})`（2 參數）會**直接失敗**。所以「收斂成一支」不是整潔問題，是前端能呼叫的**前提**。套 `20260716_02`（移除無權限的 3 參數版）後，2 參數呼叫恢復正常且唯一。

---

## 7. 尚未在此階段驗證（交棒）

- **RLS 權限隔離矩陣**：測試環境目前套的是正式庫「現況」政策（含 `USING(true)` 全開），所以此刻無隔離可測。收斂 RLS 是 **Sprint 2** 的工作——屆時把 [SPRINT2_RLS_DESIGN.md](./SPRINT2_RLS_DESIGN.md) 套到本測試專案再跑四角色矩陣。
- **真實併發**：RPC 以 `FOR UPDATE` 列鎖序列化同票消耗（設計上正確），但真正的多用戶端併發需前端整合階段以並行連線驗證。
- **前端整合**：Sprint 3-3~3-5 把 index.html 三個流程改呼叫 RPC（含混合取消、benefit_type 由選定票反推），再於測試環境端到端跑一次。

---

## 8. 已套用於測試專案的 migration

1. `0000_baseline_schema` / `0001_functions_and_rls` / `0002_rls_auto_enable_event_trigger`（重建 schema）
2. `20260716_01_fix_fn_create_booking`（修復型別）
3. `20260716_02_consolidate_fn_checkin_booking`（收斂重複）

> 正式庫尚未套用任何一項。待前端整合驗收後，才將 `01`、`02` 排入正式 Migration。
