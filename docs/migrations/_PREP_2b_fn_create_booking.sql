/* ══ 2b 部署準備（2026-11-09）══════════════════════════════════════════
   目標：fn_create_booking 從 11 參數升級到 12 參數（新增 p_idempotency_key），
   疊在已部署的 Stage1 鎖（space_check）之上，含 2026-11-02 事後補的兩項
   風險修正（requested_ticket_id 比對、TIME_CONFLICT 重試保護）。

   ── ⚠ 為什麼不能用向後相容的「純新增」部署（本輪研究結論）──────────────
   PostgreSQL 的 CREATE OR REPLACE FUNCTION 用「函式名稱＋完整參數型別列表」
   判斷是否取代既有定義（含必要參數＋有 DEFAULT 的尾端參數），而不是只看
   「前綴是否相容」。對一個已存在的 11 參數函式執行
   `CREATE OR REPLACE FUNCTION fn_create_booking(...11個原參數..., p_idempotency_key text DEFAULT NULL)`，
   因為完整參數型別列表變成 12 個、跟現有的 11 個不同，PostgreSQL 判定這是
   「新的、不同的函式」，結果是**新增一個 12 參數 overload，原本的 11 參數
   版本依然存在**——兩個同名不同參數數的函式同時掛在 public schema 下。
   這正是測試庫 2026-11-01 用 `pgrst_overload_probe_v1_old`／`_v2_new`／
   `_cleanup` 三支migration實測證實的現象：PostgREST 的 schema cache 在
   「兩個同名函式並存」時，對只帶 11 個欄位的 POST 請求會因為無法唯一判斷
   該呼叫哪一個而回 `PGRST203`，即使明確 NOTIFY pgrst 重載也一樣。
   **結論：沒有「純新增、零空窗」的部署路徑**，DROP+CREATE 是必要手段，
   能做的只有縮短空窗（同一交易內完成）與排好前後端切換順序（見下）。

   ── 部署程序（單一交易，含權限恢復）────────────────────────────────────
   BEGIN;
     -- ① 記錄回滾用的權限快照（部署前）：本輪已查得 anon/authenticated/
     --   service_role 三者皆 EXECUTE=true，DROP 會清空這些 ACL。
     DROP FUNCTION public.fn_create_booking(text, text, text, text, date, text, integer, text, text, text, text);
     -- ② 新增兩個欄位（若尚未存在；本輪已確認正式庫目前沒有這兩欄）
     ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS idempotency_key text;
     ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS requested_ticket_id text;
     CREATE UNIQUE INDEX IF NOT EXISTS bookings_idem_key_uq
       ON public.bookings (idempotency_key) WHERE (idempotency_key IS NOT NULL);
     -- ③ 建立 12 參數最終版（見下方完整定義）
     CREATE FUNCTION public.fn_create_booking(...) ...;
     -- ④ 立刻補權限（DROP會清掉原ACL，CREATE後必須在同一交易內恢復）
     GRANT EXECUTE ON FUNCTION public.fn_create_booking(...) TO anon, authenticated, service_role;
   COMMIT;

   ── 12 參數最終版定義（測試庫 restore_phase2_final_validated_state，已逐字核對）──

   CREATE OR REPLACE FUNCTION public.fn_create_booking(p_member_id text, p_coach_id text, p_category text, p_benefit_type text, p_date date, p_start_time text, p_duration integer DEFAULT 60, p_space_id text DEFAULT 'general'::text, p_resource_id text DEFAULT 'general_area'::text, p_note text DEFAULT NULL::text, p_ticket_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
   AS $function$
   declare
     v_booking text := gen_short_id('BK-');
     v_consume jsonb;
     v_qty int := 1;
     v_ref text;
     v_actor text;
     v_existing record;
   begin
     if not is_any_staff() then
       if current_member_id() is null or current_member_id() <> p_member_id then
         return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
       end if;
     end if;

     if p_idempotency_key is not null then
       select id, member_id, coach_id, category, date, start_time, duration, ticket_id, requested_ticket_id
         into v_existing from bookings where idempotency_key = p_idempotency_key;
       if found then
         if v_existing.member_id is not distinct from p_member_id
            and v_existing.coach_id is not distinct from p_coach_id
            and v_existing.category::text = p_category
            and v_existing.date = p_date
            and v_existing.start_time = p_start_time
            and v_existing.duration = p_duration
            and v_existing.requested_ticket_id is not distinct from p_ticket_id
         then
           return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,'already',true);
         else
           return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
         end if;
       end if;
     end if;

     v_actor := coalesce(current_employee_id(), current_member_id());

     begin
       perform space_check(p_space_id, p_resource_id, p_date, p_start_time, p_duration, p_coach_id, null);
     exception when others then
       if p_idempotency_key is not null and sqlerrm = 'BOOKING.TIME_CONFLICT' then
         select id, member_id, coach_id, category, date, start_time, duration, ticket_id, requested_ticket_id
           into v_existing from bookings where idempotency_key = p_idempotency_key;
         if found then
           if v_existing.member_id is not distinct from p_member_id
              and v_existing.coach_id is not distinct from p_coach_id
              and v_existing.category::text = p_category
              and v_existing.date = p_date
              and v_existing.start_time = p_start_time
              and v_existing.duration = p_duration
              and v_existing.requested_ticket_id is not distinct from p_ticket_id
           then
             return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,'already',true);
           else
             return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
           end if;
         end if;
       end if;
       raise;
     end;

     begin
       insert into bookings (id, member_id, coach_id, category, benefit_type, date, start_time, duration,
                             status, space_id, resource_id, reward_status, note, created_by, idempotency_key, created_at, requested_ticket_id)
       values (v_booking, p_member_id, p_coach_id, p_category::ticket_category, p_benefit_type, p_date,
               p_start_time, p_duration, 'booked', p_space_id, p_resource_id, 'pending', p_note, v_actor, p_idempotency_key, now(), p_ticket_id);
     exception when unique_violation then
       if p_idempotency_key is not null then
         select id, member_id, coach_id, category, date, start_time, duration, ticket_id, requested_ticket_id
           into v_existing from bookings where idempotency_key = p_idempotency_key;
         if found then
           if v_existing.member_id is not distinct from p_member_id
              and v_existing.coach_id is not distinct from p_coach_id
              and v_existing.category::text = p_category
              and v_existing.date = p_date
              and v_existing.start_time = p_start_time
              and v_existing.duration = p_duration
              and v_existing.requested_ticket_id is not distinct from p_ticket_id
           then
             return jsonb_build_object('ok',true,'booking_id',v_existing.id,'benefit_ref',v_existing.ticket_id,'already',true);
           else
             return jsonb_build_object('ok',false,'error_code','IDEMPOTENCY.CONFLICT');
           end if;
         end if;
       end if;
       raise;
     end;

     if p_ticket_id is not null and p_benefit_type <> 'none' then
       v_consume := benefit_consume_ticket(p_ticket_id, p_member_id, v_qty, v_booking);
     else
       v_consume := benefit_consume(p_member_id, p_benefit_type, v_qty, v_booking);
     end if;

     v_ref := v_consume->>'benefit_ref';
     update bookings b set ticket_id = v_ref,
            ticket_type_id = (select mt.ticket_type_id from member_tickets mt where mt.id = v_ref)
      where b.id = v_booking;

     return jsonb_build_object('ok',true,'booking_id',v_booking,'benefit_ref',v_ref,
                               'remaining_after', v_consume->'remaining_after');
   exception when others then
     return jsonb_build_object('ok',false,'error_code',sqlerrm);
   end
   $function$;

   -- 權限恢復（本輪查得的部署前基準：anon/authenticated/service_role皆true）
   GRANT EXECUTE ON FUNCTION public.fn_create_booking(text, text, text, text, date, text, integer, text, text, text, text, text)
     TO anon, authenticated, service_role;

   ── 部署前必要條件 ────────────────────────────────────────────────────
   1. 已確認正式庫目前恰好只有1個fn_create_booking overload（11參數），
      DROP不會誤殺其他版本。
   2. CREATE UNIQUE INDEX 在萬筆規模上預估秒級鎖定，建議非營業時間執行
      （精確耗時本輪未實測，仍是估算，見下方尚未解決風險）。
   3. 前端（本機index.html未commit）已實作 _bkOpFingerprint 內容指紋機制，
      確認送出前才會視內容是否變更決定要不要換新 opId——這段邏輯已存在
      於本機工作目錄，commit前應再次核對逐字未被覆蓋。

   ── 部署／回復順序（本輪最重要發現，務必依此順序）──────────────────────
   部署：資料庫先（DROP+CREATE+GRANT）→ 前端後。
     安全原因：新RPC的 p_idempotency_key 有 DEFAULT NULL，舊前端（還沒送
     這個參數）呼叫12參數函式時省略尾端參數完全合法，PostgREST正常比對、
     正常執行（idempotency單純不啟用），不會報錯。
   回復：**前端先revert（停止送出idempotency相關欄位）→ 資料庫後**（DROP
     12參數版本、CREATE回11參數原版、補GRANT）。
     ⚠ 絕對不可以反過來：若資料庫先回退成11參數，而前端commit還留著，
       前端呼叫時仍會帶 opId 相關欄位組出的呼叫形狀，若前端程式碼本身
       沒有11/12參數分支（目前沒有），PostgREST比對不到11參數簽章會直接
       回呼叫失敗，等於**全店無法建立任何教練課/友善課/自主訓練以外的
       預約**——這是本輪審查新找到、原文件未記載的回復順序風險。

   ── 部署後唯讀驗證 ────────────────────────────────────────────────────
   select pg_get_function_identity_arguments(oid) from pg_proc where proname='fn_create_booking';
   -- 預期含 p_idempotency_key
   select has_function_privilege(r, 'public.fn_create_booking(text,text,text,text,date,text,integer,text,text,text,text,text)','EXECUTE')
     from unnest(array['anon','authenticated','service_role']) r;
   -- 三者皆應為 true
   -- 以anon key對正式庫做一次HTTP smoke call（11-key舊形狀、12-key新形狀各一次），
   -- 確認皆回正常錯誤（如AUTH.FORBIDDEN）而非PGRST203，不建立真實預約。

   ── 尚未解決的風險（2026-11-09第一輪列出，第二輪已逐項核對，見下方新章節）─
   1. 【已核對，見下方B】CREATE UNIQUE INDEX 精確鎖定耗時。
   2. 【已核對，見下方A】本機index.html前端逐字內容與12參數簽章是否相符。
   ══════════════════════════════════════════════════════════════════════ */


/* ══ 2026-11-09 第二輪：A/B評估結果＋lock_timeout設計驗證＋相依關係確認 ═══
   本輪全程唯讀（正式庫 rlpiomzplckzqnqrvrwc 僅執行SELECT診斷），
   無DDL/DML/RPC寫入/commit/push/部署。

   ── A. 前端12參數與函式簽章逐字核對（結論：相符）──────────────────────
   `createBookingViaRpc`（index.html:24298-24317）以具名JSON呼叫
   `sb.rpc('fn_create_booking', {...})`，12個鍵：
     p_member_id, p_coach_id, p_category, p_benefit_type, p_date,
     p_start_time, p_duration, p_space_id, p_resource_id, p_note,
     p_ticket_id, p_idempotency_key
   與本檔案12參數定義（第39行）逐字相符（PostgREST用具名JSON比對，
   參數順序不影響比對結果，只看名稱集合是否完整對應）。
   `_bkOpFingerprint`／`_bkFp`／`window._bkOpId`（35716-35717、39428-39430）
   與 idemKey 組法 `opId+':'+ds+'@'+ts`（39644-39645）在index.html內
   皆各只有單一定義，git diff顯示為相對現有11參數版`createBookingViaRpc
   (o,tk,ds,ts)`的乾淨新增，未見重複定義或被其他並行修改覆蓋的跡象。
   PROD_CHECKLIST.md列的兩項2b風險現況：
     風險①（內容變更要換新key）：已實作，見_bkFp指紋比對（39430）。
     風險②（ticket_id要納入內容比對）：已實作，見本檔案第39/60/69/84/93/
       111/120行的requested_ticket_id欄位與比對邏輯。
   兩項風險修正皆已存在於本機工作目錄，尚未commit。

   ── B. UNIQUE INDEX鎖定耗時與風險（正式庫唯讀實測，2026-11-09）─────────
   實測數據（SELECT診斷，非估算）：
     bookings現況 11,413 筆／資料本體 3.3MB／含索引總計 5.2MB／
     索引本身 1.84MB，PostgreSQL 17.6；idempotency_key／
     requested_ticket_id 兩欄確認皆尚未存在（new_cols_already_exist=0）。
   關鍵機制（修正第一輪「秒級估算」的保守假設）：
     本交易內 CREATE UNIQUE INDEX 執行時機在 ALTER TABLE ADD COLUMN
     idempotency_key（無DEFAULT，PG11+為metadata-only、不改寫資料）
     之後——此時全部11,413列的idempotency_key都還是NULL。要建的索引是
     partial index（WHERE idempotency_key IS NOT NULL），因此建出來的
     索引本體是空的，只需一次全表循序掃描判斷謂詞（全部不符合，不需
     排序或寫入任何索引項目）。以3.3MB／11,413列的規模，這個掃描預期
     是毫秒等級，比第一輪「秒級以內」的估算更樂觀，不是風險主因。
   真正風險：鎖等待佇列，不是掃描耗時。
     DROP FUNCTION／兩個ALTER TABLE／CREATE UNIQUE INDEX都需要對
     `bookings`（或`fn_create_booking`）取得ACCESS EXCLUSIVE鎖，此鎖
     等級會擋下所有其他鎖模式，包含單純SELECT。若部署當下`bookings`
     上剛好有其他交易持有任何鎖（即使只是一筆還沒COMMIT的預約寫入），
     本交易會排隊等待；一旦排隊，後續所有想存取`bookings`的新查詢也會
     被卡在佇列後面——這才是「卡店」的真正成因，不是索引建立本身慢。
     2026-11-09唯讀查詢當下`pg_locks`對bookings的鎖數＝0，但這只是查
     詢當下的快照，不代表部署執行當下也必然淨空，仍需離峰時段執行。

   ── SET LOCAL lock_timeout='3s' 設計驗證（不假設有效，逐項查證）────────
   1. 涵蓋範圍：`SET LOCAL`作用到目前交易結束為止，放在BEGIN後、
      DROP FUNCTION前第一行，會涵蓋交易內之後所有需要取鎖的敘述
      （DROP FUNCTION／兩個ALTER TABLE／CREATE UNIQUE INDEX／
      CREATE FUNCTION／GRANT全部包含在內；CREATE FUNCTION與GRANT本身
      只動pg_proc目錄、不需要bookings表鎖，但仍受同一個lock_timeout
      設定管轄，不會被排除）。
   2. 與statement_timeout的關係（正式庫實測，非假設）：
      唯讀查得目前連線階段 lock_timeout=0（預設無上限，會無限等待鎖！
      這代表**目前若不手動SET LOCAL，部署交易遇到鎖衝突會卡住不動，
      而不是等3秒就失敗**，手動加這行是必要的，不是錦上添花）；
      statement_timeout=2min，idle_in_transaction_session_timeout=0；
      查過pg_db_role_setting無任何role層級覆蓋這兩個參數。
      2min遠大於3s，lock_timeout會先觸發，兩者不衝突、不會互相搶著生效。
   3. 失敗時的回滾範圍：lock_timeout觸發時PostgreSQL丟出
      `55P03 lock_timeout`錯誤，在顯式BEGIN...COMMIT區塊內任何敘述出錯
      都會讓整個交易進入abort狀態、直到ROLLBACK（或連線關閉自動回滾）
      為止——即使DROP FUNCTION與ALTER TABLE已經「執行過」，只要還沒
      COMMIT就會一併復原，不會出現「11參數函式已刪除、12參數還沒建好」
      的中間狀態殘留在資料庫裡。失敗後原11參數版`fn_create_booking`
      與原表結構完全復原，可直接重試或擇期再做。
   4. GRANT為何必須在同一交易內：DROP+CREATE是建立全新物件（12參數
      ≠ 11參數，非CREATE OR REPLACE），不會繼承舊函式的ACL，新函式
      預設權限只有擁有者可執行。但因為PostgreSQL的DDL具事務性，其他
      session在本交易COMMIT之前完全看不到任何變更（看到的仍是舊的
      11參數函式與舊表結構）——只要GRANT發生在COMMIT之前，就不會有
      「函式存在但anon/authenticated/service_role無權限呼叫」的對外
      可見窗口，風險只在於忘記寫這一行（COMMIT後就真的叫不動），不在
      於時序。
   5. PostgREST schema cache刷新（唯讀查pg_event_trigger確認，非假設）：
      正式庫已存在並啟用（evtenabled='O'）Supabase內建的
      `pgrst_ddl_watch`（ddl_command_end）與`pgrst_drop_watch`
      （sql_drop）兩個event trigger，COMMIT後會自動對PostgREST送出
      reload schema通知，不需要手動下`NOTIFY pgrst, 'reload schema'`。
      因為Postgres的NOTIFY在交易中只是排進隊列、COMMIT時才真正送達
      監聽端，所以交易中途（DROP完、CREATE還沒做）不會有過早通知導致
      PostgREST看到「找不到函式」的中間狀態。
   建議部署SQL在原本的`BEGIN;`之後加一行：
     SET LOCAL lock_timeout = '3s';

   ── C. 2b前端與12參數RPC相依關係／新舊版本相容性矩陣（Task 3）──────────
   機制：`sb.rpc()`以具名JSON呼叫，PostgreSQL依「函式名稱＋完整具名
   參數集合」解析，多送或少送一個具名參數、且無對應DEFAULT可補時，
   會直接判定「找不到匹配的函式」（42883 undefined_function，
   PostgREST對外呈現為找不到對應RPC），不是「忽略多餘欄位」。

   | 情境 | 前端 | 資料庫 | 結果 |
   |---|---|---|---|
   | 目前正式庫現況 | 舊（11鍵，無idemKey） | 舊（11參數） | 正常（現況） |
   | 正確部署順序 | 舊（過渡期，尚未上線） | 新（12參數，p_idempotency_key有DEFAULT NULL） | 正常——舊前端省略第12個鍵，PostgREST找到12參數函式，該參數吃DEFAULT NULL，idempotency單純不啟用 |
   | 正確部署順序（完成後） | 新（12鍵） | 新（12參數） | 正常（最終狀態） |
   | ⚠部署順序顛倒（前端先上線） | 新（12鍵，含p_idempotency_key） | 舊（11參數，無此形參） | **全壞**：PostgreSQL找不到接受12個具名鍵的函式，42883，全店無法建立教練課/友善課/自主訓練以外的預約 |
   | ⚠回復順序顛倒（DB先退版） | 新（12鍵，commit還沒revert） | 舊（11參數） | **全壞**，與上列同一種失敗機制 |
   | 正確回復順序 | 舊（已revert，不送idemKey鍵） | 舊（11參數） | 正常 |

   結論：**部署必須DB先、前端後；回復必須前端先、DB後**（與原文件
   162-173行方向一致，本輪新增的是失敗機制的具體解釋：不是「行為異常」
   而是PostgREST/PostgreSQL具名參數解析直接找不到函式，屬於硬性全斷，
   沒有「部分正常」的中間地帶）。
   另：目前本機git working tree除2b相關改動外，另有33個其他檔案的
   未提交修改（index.html同一份diff裡混了其他未完成工作，如
   cancelBooking／renderCoachAgenda／coachHomeV2等非2b段落）。這是
   流程面風險，不是API相容性風險：commit時若沒有只挑2b相關的hunk，
   2b的前端部署會連帶夾帶其他未驗證完成的改動一起上線。建議commit前
   用`git add -p`只挑idempotency相關的hunk，或確認其餘改動也已各自
   驗證完成可以一起上線。

   ── D. 維護窗口與失敗回復方案（2026-11-09第三輪，不只依賴部署順序）─────
   新發現（讀`sw.js`＋`verUpCheck`確認，非假設）：「前端先revert」這個
   回復步驟的生效時間**不是立即、也沒有上限**，原因是現有PWA快取策略
   （sw.js，2026-09-18定案）：
     - `CACHE='yugym-v2'`是固定字串，不隨每次推版更動；一般推版靠
       背景`freshen()`比對ETag，換版後「先回舊的快取版本」給使用者，
       新檔案要等下一次開啟才真正套用。
     - 員工端（`verUpEnabled()`：role≠member）有`verUpCheck`每5分鐘
       HEAD一次，偵測到新版會跳「系統已更新→重新整理」，但**需要使用者
       手動點擊**，不是強制。
     - 會員端完全沒有這個提示——`verUpEnabled()`對member回false，更新
       是**靜默**的，只有「下次重新開啟App」才會生效。
   結論：只要有會員（或沒點重新整理的員工）在revert推送當下仍開著舊的
   分頁／PWA，他們的瀏覽器裡**仍在執行新的12鍵前端**，可能持續到他們
   自己關掉App或等下次自然開啟為止——沒有任何機制能從伺服器端強制
   在限定時間內讓所有已開啟的連線換版。若此時資料庫已經退回11參數，
   這些仍停留在新前端的連線會立刻開始遇到「全壞」（42883/找不到函式），
   且會員端拿不到任何提示去重新整理——這正是「不能只依賴部署順序」
   要處理的缺口：順序本身只保證*新推送之後*的行為正確，不保證*退版
   當下所有既存連線*都已經跟上。

   **建議的回復方案（兩層，取代單純「DROP回11參數」）**：
   1. 【優先】**不要DROP簽章，改用CREATE OR REPLACE停用idempotency邏輯**：
      保留12參數簽章不變，把函式內容換回「忽略p_idempotency_key、
      永遠正常insert」的版本（等同業務邏輯回到11參數版，但簽章仍是
      12參數）。這樣無論某個連線當下跑的是舊前端（11鍵，第12鍵吃
      DEFAULT NULL）還是新前端（12鍵，該鍵被忽略不生效），呼叫一律
      成功，**不存在任何快取滯後造成的失敗窗口**。這是本輪新增、
      優於原「DROP+CREATE回11參數」方案的回復路徑，從根本解決
      SW快取時間不可控的問題，而不是靠「猜大家多快會換版」。
   2. 【只有在1無法解決問題時才用】真正DROP回11參數簽章：僅限於
      12參數版本本身有嚴重bug、必須連簽章一起撤除的情況。此時必須：
        a. 排在離峰時段（打烊後、開店前），將「仍有開啟中舊連線」的
           機率壓到最低；
        b. 接受仍可能有極少數會員連線在退版瞬間遇到預約失敗（有界
           風險：使用者重試或重新整理App即可恢復，不會造成資料不
           一致，只是那一次操作失敗）；
        c. 退版後主動確認：對仍在跳「系統已更新」提示的員工端，請
           現場人員實際點擊「重新整理」，不要假設他們會自己注意到。
   ══════════════════════════════════════════════════════════════════════ */
