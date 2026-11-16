# 真實 HTTP（PostgREST）角色權限測試方案（尚未執行；只能對測試庫）

## 0. 什麼才算「真實 HTTP」——避免誤認
| 做法 | 能證明什麼 | 標籤 |
|---|---|---|
| 在 SQL 裡 `set_config('request.jwt.claims', …)`，以擁有者連線呼叫函式 | 函式**內部**的身分判斷（`current_employee_id()`／`is_staff_desk()`／`auth.role()`）與觸發器行為 | **SQL 身分模擬** |
| `set role authenticated`／`anon` 後呼叫 | 資料庫層的 **EXECUTE 權限與 RLS** | **SQL 角色模擬**（比上一種強，但仍沒有 PostgREST、JWT 驗證、schema cache、HTTP 狀態碼） |
| 用 curl 打 `https://<專案>.supabase.co/rest/v1/rpc/<函式>`，帶 anon key 與使用者 JWT | PostgREST 實際暴露的函式、HTTP 狀態碼、JWT 驗證、角色切換 | **真實 HTTP** |

**回報規則**：只有 `http_role_tests.sh` 的結果（或同等的真實 HTTP 呼叫）才能標「真實 HTTP 已驗證」。SQL 模擬一律標「SQL 身分模擬」；不得合併成「權限已驗證」。前端 UI 另算。

## 1. 為什麼 ChatGPT 通常做不了、要由你在本機跑
ChatGPT 透過資料庫連線（SQL）驗收，沒有也不應持有 anon key、測試帳號的密碼或 JWT。真實 HTTP 需要這些，所以由你在自己的終端機設定環境變數後執行腳本，把輸出貼回給 ChatGPT 複核。**不要把金鑰、密碼、JWT 貼進對話或進版控。**

## 2. 前置
- 測試庫已套用 p0e_12（有 `fn_refund_ticket`、`trg_tk_quota_guard`）。
- 測試帳號：櫃檯 1、有登入的教練 1（測試庫目前各 1 位有 `auth_id`），另需一位**不是**該堂教練的帳號（可用同一位教練、把測試預約的 `coach_id` 指給沒有登入的教練）；一位會員帳號（測試庫 3 位會員有 `auth_id`）。以各自的帳密登入取得 access_token（自行執行，勿外流）。
- 夾具（可提交的隔離測試資料，前綴 `CC-`；ChatGPT 已被授權建立並清理）：
```sql
insert into ticket_types(id,name,category) values ('CC-T','CC','私人教練') on conflict do nothing;
insert into members(id,name) values ('CC-M','CC會員') on conflict do nothing;
insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status) values ('CC-R','CC-M','CC-T','CC',6,3,'usable');
insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions) values ('CC-Q','CC-M','CC-T','CC',12,4,'usable',8);   -- 已用 8＝額度上限
insert into bookings(id,member_id,coach_id,category,ticket_type_id,date,start_time,duration,status,pending_contract,ticket_id,member_ids,attendance)
 values ('CC-RB1','CC-M','<沒有登入的另一位教練 id>','私人教練','CC-T',(now() at time zone 'Asia/Taipei')::date+3,'10:00',60,'booked',false,'CC-R','[]','{}');
insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('CC-LG-R1','CC-R','deduct',-1,'CC-RB1','cc','fixture');
```
- 清理（必做，之後確認殘留 0）：
```sql
delete from ticket_logs where ticket_id like 'CC-%' or booking_id like 'CC-%'; delete from bookings where id like 'CC-%';
delete from member_tickets where id like 'CC-%'; delete from members where id like 'CC-%'; delete from ticket_types where id like 'CC-%';
```

## 3. 預期結果（PostgREST：無 EXECUTE 權限時 anon→**401**、已登入角色→**403**；函式自己回的 `ok:false` 是 **200**；函式內 `raise exception` 是 **400**）
| # | 呼叫 | 身分 | 測試庫預期 | 正式庫預期（日後） |
|---|---|---|---|---|
| H1 | `fn_refund_ticket` | anon（只帶 anon key） | 401 | 401 |
| H2 | `fn_refund_ticket` | 會員 | 200＋`AUTH.FORBIDDEN` | 同 |
| H3 | `fn_refund_ticket`（不存在的預約） | 櫃檯 | 200＋`REFUND.NO_BOOKING`（不寫入） | 同 |
| H4 | `fn_tk_refund_once`（內部） | 櫃檯／anon | 403／401 | 同 |
| H5 | `trg_tk_quota_guard`（觸發器函式） | 櫃檯 | 403 或 404（PostgREST 不暴露觸發器函式） | 同 |
| H6 | `fn_coach_leave_comp` | anon／會員／櫃檯（不存在的預約） | 401／200＋`AUTH.FORBIDDEN`／200＋`COMP.NOT_FOUND` | 同 |
| H7 | `fn_move_booking_ticket`（壞參數） | anon／會員／櫃檯 | 401／200＋`AUTH.FORBIDDEN`／200＋`ok:false` | 同 |
| H8 | `fn_refund_ticket`（夾具） | 非該堂教練→櫃檯→櫃檯再一次 | 200＋`REFUND.FORBIDDEN`→200＋`refunded:true`→200＋`ALREADY_REFUNDED` | 同 |
| H9 | `PATCH /member_tickets?id=eq.CC-Q`（`sessions_remaining` 4→3，使用量超過開通額度） | 櫃檯 | **400**，訊息含 `TICKET.INSTALLMENT_LOCKED`；再 GET 餘額仍為 4 | 同 |
| H10 | `fn_deduct_ticket`（任一參數） | anon | **200＋`NOT_STAFF`**（測試庫此函式 PUBLIC 可執行） | **401**（正式庫只有 authenticated） |
| H11 | `fn_member_join_group`／`fn_member_self_book` | anon | 200＋`AUTH.FORBIDDEN`（測試庫 PUBLIC） | 401 |
H10、H11 是**已知的測試庫與正式庫 ACL 差異**：腳本只印觀察值（INFO），不判 PASS／FAIL；不要把測試庫的 200 解讀成正式庫的行為。

## 4. 執行
`docs/testdb/http_role_tests.sh`（需 `SB_URL`、`ANON_KEY`、`JWT_DESK`、`JWT_MEMBER`、`JWT_COACH`；有夾具時加 `FIXTURES=1`）。輸出 PASS／FAIL／INFO 並以 FAIL 為退出碼；所有 FAIL 與 INFO 請原樣貼回驗收。
