# 雙連線併發：ChatGPT／你可獨立操作的手動方式（尚未執行；只能對測試庫）

用在「沒有本機 psql／連線字串，但工具可以同時開兩個工作階段（或同時送出兩個 SQL 呼叫）」的情況。**如果你的工具會把兩個呼叫依序執行（序列化），這個測試就沒有意義，請標「未驗證」，不要當成通過。**

判斷是否真的併發：Session B 的耗時必須明顯大於 0（被 A 的列鎖擋住，約等於 A 剩餘的睡眠秒數）；若 B 在 A 還沒結束就回來了且沒等待，代表沒有重疊。

## 0. 準備（一次；資料前綴 `CC-`；只動 CC- 列）
```sql
-- 確認是測試庫：system_identifier 必須是 7662742571317219726，且 to_regclass('public.change_log') is null；且 fn_refund_ticket 與 trg_tk_quota_guard 已存在（p0e_12 已套用）
insert into ticket_types(id,name,category) values ('CC-T','CC','私人教練') on conflict do nothing;
insert into members(id,name) values ('CC-M','CC會員') on conflict do nothing;
insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status,unlocked_sessions) values ('CC-Q','CC-M','CC-T','CC',12,5,'usable',8);
insert into bookings(id,member_id,category,ticket_type_id,date,start_time,duration,status,pending_contract,ticket_id,member_ids,attendance)
select b,'CC-M','私人教練','CC-T',(now() at time zone 'Asia/Taipei')::date+3,'10:00',60,'booked',false,'CC-Q','[]','{}' from unnest(array['CC-QB1','CC-QB2']) b;
```
## 1. 額度併發（Q11）——先送 Session A，**1 秒內**送 Session B
```sql
-- Session A（持鎖約 4 秒）
begin;
select set_config('request.jwt.claims', json_build_object('sub','<櫃檯員工 auth_id>','role','authenticated')::text, true);
select public.fn_deduct_ticket('CC-Q','CC-QB1','cc');
select pg_sleep(4);
commit;
```
```sql
-- Session B（記下開始與結束時間）
begin;
select set_config('request.jwt.claims', json_build_object('sub','<櫃檯員工 auth_id>','role','authenticated')::text, true);
select public.fn_deduct_ticket('CC-Q','CC-QB2','cc');
commit;
```
**預期**：B 等到 A 提交後才結束，並以 `TICKET.INSTALLMENT_LOCKED` 失敗（交易需 rollback）。驗證：
```sql
select sessions_remaining as rem_expected_4, (select count(*) from ticket_logs where ticket_id='CC-Q' and action::text='deduct') as deducts_expected_1 from member_tickets where id='CC-Q';
```
## 2. 雙退併發（R14a）
```sql
insert into member_tickets(id,member_id,ticket_type_id,plan_name,sessions_total,sessions_remaining,status) values ('CC-R','CC-M','CC-T','CC',6,3,'usable');
insert into bookings(id,member_id,category,ticket_type_id,date,start_time,duration,status,pending_contract,ticket_id,member_ids,attendance) values ('CC-RB1','CC-M','私人教練','CC-T',(now() at time zone 'Asia/Taipei')::date+3,'10:00',60,'booked',false,'CC-R','[]','{}');
insert into ticket_logs(id,ticket_id,action,delta,booking_id,operator,note) values ('CC-LG-R1','CC-R','deduct',-1,'CC-RB1','cc','fixture');
```
Session A：`begin; <claims>; select public.fn_refund_ticket('CC-R','CC-RB1'); select pg_sleep(4); commit;`；Session B（1 秒內）：`begin; <claims>; select public.fn_refund_ticket('CC-R','CC-RB1'); commit;`。
**預期**：A 回 `refunded:true`；B 等待後回 `refunded:false, reason:ALREADY_REFUNDED`；`CC-R` 餘額 4、refund 帳恰 1 筆。
## 3. 清理（必做；然後確認殘留 0）
```sql
delete from ticket_logs where ticket_id like 'CC-%' or booking_id like 'CC-%';
delete from bookings where id like 'CC-%'; delete from member_tickets where id like 'CC-%';
delete from members where id like 'CC-%'; delete from ticket_types where id like 'CC-%';
select (select count(*) from member_tickets where id like 'CC-%')+(select count(*) from bookings where id like 'CC-%')+(select count(*) from ticket_logs where ticket_id like 'CC-%' or booking_id like 'CC-%') as residue_expected_0;
```
## 4. 回報方式
每個情境回報：A／B 開始與結束時間、B 的等待秒數、各自回傳、最終餘額與帳本筆數、是否通過；工具若不能併發→「未驗證（原因）」。
