# YUGYM Phase 2 正式部署前最終檢查表（2026-11-09）

> 本輪全程唯讀分析＋本機文件修改，未執行任何Migration/DDL/DML/RPC寫入/commit/push/部署。
> 三份完整SQL見 `docs/migrations/_PREP_2d4_fn_group_save_members.sql`／`_PREP_2c_venue_lock.sql`／
> `_PREP_2b_fn_create_booking.sql`，本表只列順序、條件、驗證、停止、回復摘要，不重複貼SQL。
> 部署順序固定：**2d-4 → 2c → 2b**（異動範圍×呼叫頻率×變更方式風險遞增排序）。

---

## 階段 1／3：2d-4（`fn_group_save_members` 新增團課名額RPC）

**前置條件**
- 正式庫目前無同名函式（已核對，純新增，無覆蓋風險）。
- 前端 `_saveGroupMembers` 尚未接線呼叫這支RPC（已核對），故此階段**資料庫可先上、前端完全不受影響**，與2b的「DB先前端後」順序規則一致但風險更低（前端甚至還沒開始呼叫）。
- v_leave容量計算bug（2026-11-09第三輪發現）已修正並在測試庫7項情境＋2d-1/2d-2既有回歸測試全部驗證通過（含修正既有測試腳本裡2個與本修正無關的過期日期）。
- REVOKE/GRANT已加固（CREATE後先REVOKE public/anon/service_role，再只GRANT authenticated），測試庫已驗證三者權限狀態符合預期。
- **本輪（第五輪）新確認**：唯讀查正式庫`select current_user`，這個MCP連線實際角色是`postgres`；比對先前查到的`pg_default_acl`，postgres角色建立的新函式預設ACL只有`{postgres=X}`，**不會自動給anon/authenticated/service_role/PUBLIC**——代表走這條部署路徑時，連前面擔心的「default ACL意外放行」都不會發生，REVOKE那三行會是no-op（本來就沒東西可撤），GRANT authenticated則是唯一真正生效的授權。若改用其他部署管道（例如Dashboard SQL Editor，可能用不同角色執行），腳本裡的REVOKE仍是必要的保險，不依賴猜對角色。
- 本機`_PREP_2d4_fn_group_save_members.sql`已逐字diff比對測試庫`pg_get_functiondef`實際回傳內容，**完全一致（0差異）**。

**部署順序**
1. 正式庫執行 `_PREP_2d4_fn_group_save_members.sql`（CREATE OR REPLACE＋REVOKE防護＋GRANT authenticated，純新增，含v_leave修正）。
2. 唯讀驗證（見下）。
3. 確認無誤後，前端2d-3接線改動才能commit／部署。

**驗證方式**（唯讀）
```sql
select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname='fn_group_save_members';
select pg_get_functiondef(oid) ilike '%for update%' as has_lock,
       pg_get_functiondef(oid) ilike '%jsonb_array_elements_text(v_member_ids) m(mid)%' as has_vleave_fix
  from pg_proc where proname='fn_group_save_members';
select has_function_privilege('authenticated', oid, 'EXECUTE') as auth_ok,
       has_function_privilege('anon', oid, 'EXECUTE') as anon_should_be_false,
       has_function_privilege('service_role', oid, 'EXECUTE') as svc_should_be_false
  from pg_proc where proname='fn_group_save_members';
```
預期：函式存在、5參數、含FOR UPDATE、含v_leave修正字樣；authenticated=true，anon/service_role=false。**不建立任何測試預約**。

**停止條件**：驗證SQL任一項不符預期 → 立即停止，不得進入2c。

**回復方案**：`DROP FUNCTION public.fn_group_save_members(text, integer, text, jsonb, jsonb);` 純新增函式，刪除不影響其他物件；若前端已接線，須先revert前端commit確認無呼叫端後才能刪。

---

## 階段 2／3：2c（`fn_member_self_book`／`fn_member_self_venue` 加 venue_unit 鎖）

**前置條件**
- 兩支函式簽章不變（CREATE OR REPLACE原地更新），已逐字diff核對業務邏輯零變動，只包一層`pg_advisory_xact_lock`。
- 已核對正式庫自2026-11-01比對後未被其他migration觸碰過（`20261104_fn_member_self_reschedule_venue_fix`動的是不同函式）。

**部署順序**
1. 正式庫執行 `_PREP_2c_venue_lock.sql`（CREATE OR REPLACE兩支函式）。簽章不變，前端不用改、不用重新部署。
2. 唯讀驗證（見下）。

**驗證方式**（唯讀）
```sql
select proname, pg_get_functiondef(oid) ilike '%pg_advisory%' as has_lock,
       pg_get_functiondef(oid) ilike '%lock_timeout%' as has_timeout
  from pg_proc where proname in ('fn_member_self_book','fn_member_self_venue');
```
預期：兩列皆 `has_lock=true, has_timeout=true`。

**停止條件**：驗證不符預期，或上線後24小時內自主訓練預約出現非預期的`RESOURCE_BUSY`／逾時暴增 → 停止並回復。

**回復方案**：`CREATE OR REPLACE` 貼回 `_PREP_2c_venue_lock.sql` 內保存的原始版本（簽章不變，GRANT不受影響，前端完全不用動）。

**已知殘留風險（非阻斷，上線後觀察）**：兩個會員同時以不同台跑步機為主場地互搶對方候選號，理論上可構成鎖等待環；有`lock_timeout=3s`與Postgres死鎖偵測雙重保護，最壞情況3秒後乾淨回錯誤，不會卡死或資料不一致。既有測試未覆蓋此排列組合。

---

## 階段 3／3：2b（`fn_create_booking` 11→12參數，加 Idempotency Key）

**前置條件（擋住GO的兩件事，均已於本輪完成核對，見`_PREP_2b_fn_create_booking.sql`新增章節）**
1. ✅ 前端12參數具名呼叫與RPC簽章逐字核對相符（Task A，已核對）。
2. ✅ UNIQUE INDEX耗時與風險評估（Task B，已唯讀實測：11,413筆/3.3MB，partial index因全新欄位全NULL而建出空索引，毫秒等級；真正風險是ACCESS EXCLUSIVE鎖等待佇列，非掃描耗時）。
3. 仍待辦（不是分析問題，是执行前的人工動作）：commit前用`git add -p`只挑2b相關hunk，避免夾帶工作目錄裡另外33個檔案的其他未驗證改動一併上線（見`_PREP_2b`內C節）。

**部署順序（嚴格：資料庫先，前端後）**
1. 正式庫在單一交易內執行：`BEGIN; SET LOCAL lock_timeout='3s'; DROP FUNCTION(11參數); ALTER TABLE ADD COLUMN ×2; CREATE UNIQUE INDEX; CREATE FUNCTION(12參數); GRANT; COMMIT;`（完整SQL見`_PREP_2b_fn_create_booking.sql`，`lock_timeout`與其設計依據為本輪新增內容）。
2. 唯讀驗證（見下）。
3. 確認無誤後，本機2b前端改動（`_bkOpFingerprint`／`opId`／`idemKey`）才能commit並部署到GitHub Pages。

**驗證方式**（唯讀）
```sql
select pg_get_function_identity_arguments(oid) from pg_proc where proname='fn_create_booking'; -- 應含p_idempotency_key
select has_function_privilege(r,'public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)','EXECUTE')
  from unnest(array['anon','authenticated','service_role']) r; -- 三者皆應true
```
另以anon key對正式庫做11鍵（舊形狀）與12鍵（新形狀）各一次HTTP smoke call，確認皆回正常錯誤（如`AUTH.FORBIDDEN`）而非`PGRST203`/`PGRST202`，不建立真實預約。

**停止條件**：任一驗證不符預期，或部署交易觸發`lock_timeout`錯誤 → 整個交易已自動回滾（11參數版本完整保留），不得重試前先排查是誰佔用`bookings`鎖，不得直接重跑。

**回復方案（不能只依賴順序——見`_PREP_2b`內D節，本輪新增）**

⚠ 新發現：PWA快取（`sw.js`）讓「前端revert」生效時間不可控——會員端更新是**靜默、只在下次開啟才生效**（無提示），員工端雖有5分鐘輪詢提示但**需手動點擊**才換版。這代表就算照「前端先、DB後」的順序操作，仍可能有分頁/連線在退版當下還在跑新前端。

1. **優先方案**：資料庫端**不DROP簽章**，改用`CREATE OR REPLACE`把12參數函式內容換回「忽略`p_idempotency_key`、照常insert」的版本——簽章維持12參數不變。效果：無論某連線當下是舊前端（11鍵，第12鍵吃DEFAULT NULL）還是新前端（12鍵，該鍵被忽略），呼叫都會成功，**不存在快取滯後造成的失敗窗口**，不需要賭「大家多快會重新整理」。
2. **次要方案（僅當12參數版本本身有嚴重bug、必須連簽章一起撤除時）**：真正DROP回11參數版，但必須：
   a. 排在離峰時段（打烊後/開店前）執行；
   b. 接受仍可能有極少數會員連線在退版瞬間遇到一次性預約失敗（重試/重新整理即可恢復，不會資料不一致）；
   c. 退版後請現場人員實際協助員工端點擊「系統已更新→重新整理」，不要假設會自動發生。

**仍記錄在案、非阻斷項目**：`YUGYM_BOOKING_RACE_FIX_PROD_CHECKLIST.md`列的2項2b風險（內容變更換key、ticket_id納入比對）本輪確認前端與SQL皆已實作，可視為已解決，但正式庫`benefit_consume_ticket`指定票券扣款路徑尚未在正式庫環境重新測過（測試庫該參數是不生效的相容性shim）。

---

## 整體GO/NO-GO

| 階段 | 技術面結論 |
|---|---|
| 2d-4 | **GO**（第五輪：確認部署角色postgres下REVOKE/GRANT結果可預期，v_leave修正與REVOKE/GRANT已在測試庫驗證、本機腳本與測試庫逐字一致） |
| 2c | **GO**（死鎖理論風險已知且有界，列為上線後觀察項） |
| 2b | **GO**（A/B兩項此前擋住GO的分析缺口已補齊；唯一剩餘動作是commit前的人工hunk篩選，非技術風險） |

本表為技術面分析結論，不代表實際執行核准——仍需使用者與ChatGPT審查後，針對正式庫 `rlpiomzplckzqnqrvrwc` 的每一筆寫入/DDL逐項明確核准才能執行。
