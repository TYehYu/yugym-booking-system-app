# fn_move_booking_ticket 真實 authenticated RPC 測試程序（尚未執行）

> 目標庫：**測試庫** `kucvxpjatptfckhlxptj`（專案名 yugym-sprint3-test）。禁止連線或寫入正式庫 `rlpiomzplckzqnqrvrwc`。
> 為什麼要有這份：`move_ticket_01_sql_tests.sql` 以資料庫擁有者連線、用 JWT 設定模擬身分，擁有者會繞過 GRANT 與 RLS，
> **不能證明**各角色真的能／不能呼叫。本程序走真實 PostgREST（`/rest/v1/rpc/fn_move_booking_ticket`），用真實登入取得的 access_token。

## 1. 隔離測試身分（不使用任何既有帳號、會員、員工、票券）

| 身分 | Auth 帳號（email） | 對應資料列 | 備註 |
|---|---|---|---|
| 櫃檯 | `mvr-desk-<runid>@staff.yugym.local` | employees `MVR-E-DESK`（front_desk） | |
| 店長教練 | `mvr-mgr-<runid>@staff.yugym.local` | employees `MVR-E-MGR`（coach, is_manager） | 需 S2 已同步 is_staff_desk |
| 一般教練 | `mvr-coach-<runid>@staff.yugym.local` | employees `MVR-E-COACH` | |
| 另一位教練 | `mvr-coach2-<runid>@staff.yugym.local` | employees `MVR-E-COACH2` | 用來測「別人的課」 |
| 會員 | `mvr-member-<runid>@member.yugym.local` | members `MVR-M-AUTH` | |

- `<runid>` 為本次執行的時間戳（例如 `20261115T1000`），避免與任何既有帳號重複。
- 帳號由 **Auth Admin API** 建立（`POST /auth/v1/admin/users`，`email_confirm: true`），**需使用測試庫的 service_role key，且需另外授權**（這是 auth 寫入，不是 SQL 寫入）。
  - 密碼在 shell 內用 `openssl rand -base64 24` 產生，只存在 shell 變數；**不寫進檔案、不貼進對話、不進 SQL**。
  - service_role key 只用來建立／刪除這五個帳號，以及案例 R9（證明 service_role 被拒）；其餘案例一律用各身分自己登入取得的 token。
- 建好後取得五個 uuid，填入 `move_ticket_05_rpc_fixture.sql` 的 `<UUID_*>` 佔位（沒填會因轉型失敗而中止）。

## 2. 全部新增的資料（清理檔 `move_ticket_06_rpc_cleanup.sql` 逐項對應）

| 位置 | 內容 | 識別條件 |
|---|---|---|
| auth.users | 5 個測試帳號 | email `mvr-%@%`（以 Admin API 刪除） |
| employees | 4 筆 | id `MVR-E-%` |
| members | `MVR-M-AUTH` ＋ 每案例 1 筆（r01–r11） | id `MVR-M-%`，姓名 `MVR測試…` |
| ticket_types | 3 筆 | id `MVR-T-%` |
| member_tickets | 11 筆 | id `MVR-TK-%` |
| bookings | 22 筆（原預約 `MVR-F-*`、新預約 `MVR-T-*`）＋取消／調課流程可能新增的卡 | id `MVR-%`、member_id `MVR-M-%` |
| ticket_logs | 夾具 11 筆（`MVR-LG-*`）＋ RPC／取消流程寫的帳（`LG-…`） | ticket_id `MVR-TK-%` 或 booking_id `MVR-%` |
| notifications | 取消流程的 `desk_alert`（recipient `desk`、id `NT-…`）。**精準限定**：同時符合 RUNID 姓名前綴、`created_at >= RUN_START`、`recipient_type='desk'`，且 id 在人工核對過的清單內；條件集合與清單必須完全相同，否則中止 | 先跑 `move_ticket_07_notifications_candidates_readonly.sql` 列候選，核對後把 id 填入清理檔 |
| change_log | **無**——測試庫沒有此表也沒有觸發器（2026-11-14 唯讀確認；守門也用這點辨識非正式庫） | — |
| 其他觸發器寫入 | 無——測試庫 bookings／ticket_logs／member_tickets／members／ticket_types 只有兩個守門觸發器（只檢查，不寫資料） | — |

關聯：members 刪除會級聯 bookings、member_tickets；member_tickets 刪除會級聯 ticket_logs；`bookings.sibling_of` 無外鍵，所以清理檔仍明確寫出各表條件。

## 3. 執行流程（每一步先貼 Project ID 與完整 SQL／指令，經授權才執行）

1. 記下 `RUN_START`（ISO 時間）。
2. Auth Admin API 建立 5 個帳號（授權）。
3. 執行 `move_ticket_05_rpc_fixture.sql`（授權；開頭有庫識別守門，結尾自我核對筆數）。
4. 以各身分登入取得 token，依下表逐案例呼叫；每案例後以 SELECT 驗證不變量。**任何失敗立即停止，不自動重試，先清理再回報。**
5. 執行 `move_ticket_06_rpc_cleanup.sql`（授權；先盤點、非夾具新增資料不為 0 則中止、刪除後必須全為 0 否則回滾）。
6. Admin API 刪除 5 個帳號，唯讀查詢確認 `auth.users` 無 `mvr-%` 殘留。

呼叫格式：`curl -s "$MV_URL/rest/v1/rpc/fn_move_booking_ticket" -H "apikey: $MV_ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"p_from_booking":"MVR-F-r03","p_to_booking":"MVR-T-r03","p_mode":"cancel"}'`

## 4. 案例矩陣

| # | 夾具 | 身分 | 呼叫 | 預期 |
|---|---|---|---|---|
| R1 | r01 | 無登入（僅 apikey=anon） | cancel | HTTP 401/403 或 permission denied（anon 無 EXECUTE） |
| R2 | r02 | 會員 | cancel | `ok:false`、`AUTH.FORBIDDEN` |
| R3 | r03 | 櫃檯 | cancel | `ok:true` |
| R4 | r04 | 店長教練 | cancel | `ok:true` |
| R5 | r05（教練自己的課） | 一般教練 | cancel | `ok:true` |
| R6 | r06（別人的課） | 一般教練 | cancel | `MOVE.FORBIDDEN` |
| R7 | r07 | 櫃檯 | 連送兩次 | 第一次 ok；第二次 `MOVE.FROM_STATE` 或 `MOVE.TO_STATE`，帳本筆數不增 |
| R8 | r08（日期超過可保留日、該票 0 堂） | 櫃檯 | hold | `HOLD.MONTH_LIMIT:YYYY-MM-DD`，資料未變；改用 cancel 則通過 |
| R9 | r09 | service_role key | cancel | 拒絕（permission denied）— 證明未授權 |
| R10 | r10 | 櫃檯 | 同時送兩個請求（`&` ＋ `wait`） | 恰好一個 ok；另一個 `MOVE.BUSY` 或 `FROM_STATE/TO_STATE`；不變量成立 |
| R11 | r11 | 櫃檯 | 先 hold 調課，再以 `zz_prod_fn_cancel_booking`（正式庫版本複本，經 RPC 呼叫）取消新預約 | 退 1 堂（餘額回到 3），重複取消不重複退 |

> R11 的 zz 複本沒有授權給 authenticated；以 SQL（擁有者＋模擬 JWT）執行，已屬 SQL 測試範疇，真實角色路徑只驗證「取消後的帳本與餘額」。若要走真實取消路徑，需授權測試庫另外同步正式庫的 `fn_cancel_booking`，本次不做。

## 5. 不變量（每次成功呼叫後以 SELECT 驗證）

1. `sessions_remaining` 不變（調課本身不增減堂數）。
2. 該票 `sum(delta)` 不變。
3. 原預約淨額 0、新預約淨額 1（淨額＝deduct 筆數 − refund 筆數）。
4. 新預約 `ticket_id` = 該票且 `pending_contract=false`；原預約 hold 模式 `pending_contract=true` 且 `ticket_id` 為空。

## 6. 回報格式

簡表：案例、身分、HTTP 狀態、`error_code`、不變量是否成立；最後附清理前盤點與清理後歸零證明。
