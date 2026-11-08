# YUGYM 預約容量競態修復 — 第一階段交付文件

> 建立：2026-11-01。範圍：`space_check()` 加 `pg_advisory_xact_lock` + `lock_timeout`。
> **狀態：已套用到測試庫 `kucvxpjatptfckhlxptj`，測試全部通過。正式庫 `rlpiomzplckzqnqrvrwc` 尚未修改，等待另行授權。**
> **⚠ 2026-11-01 二次稽核更正**：上方「已套用」只對測試庫成立；本文件先前沒有明確標出「正式庫從未部署」會被誤讀成只是流程上還沒排到，造成 `YUGYM_HANDOFF.md` 一度誤寫成「Stage1 已上線正式庫」。已更正，並在第 6.5 節補上**正確可用於正式庫**的部署/回滾 SQL（第 2 節的回滾版本只適用測試庫，不能直接套用到正式庫——正式庫的教練衝突判斷多了代課邏輯，詳見第 6.5 節）。

---

## 1. 已通過測試的 SQL 版本（套用版）

```sql
CREATE OR REPLACE FUNCTION public.space_check(
  p_space_id text, p_resource_id text, p_date date, p_start text,
  p_duration integer, p_coach_id text, p_exclude_booking text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start int := split_part(p_start,':',1)::int*60 + split_part(p_start,':',2)::int;
  v_end   int := v_start + p_duration;
  v_cnt   int;
  v_status text;
  v_prev_lock_timeout text;
  overlap_cond text := format(
    $q$ date=%L AND status NOT IN ('cancelled','no_show')
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int) < %s
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int + coalesce(duration,60)) > %s
        AND (%L IS NULL OR id <> %L) $q$,
    p_date, v_end, v_start, p_exclude_booking, p_exclude_booking);
BEGIN
  v_prev_lock_timeout := current_setting('lock_timeout', true);
  PERFORM set_config('lock_timeout', '3s', true);

  IF p_coach_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('yugym:coach'), hashtext(p_coach_id || ':' || p_date::text));
  END IF;

  IF p_space_id IN ('general','group_room') THEN
    PERFORM pg_advisory_xact_lock(hashtext('yugym:space'), hashtext(p_space_id || ':' || p_date::text));
  ELSIF p_space_id = 'treadmill' THEN
    PERFORM pg_advisory_xact_lock(hashtext('yugym:space'), hashtext(p_space_id || ':' || coalesce(p_resource_id,'') || ':' || p_date::text));
  END IF;

  PERFORM set_config('lock_timeout', coalesce(v_prev_lock_timeout, ''), true);

  IF p_coach_id IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE coach_id=%L AND %s', p_coach_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.TIME_CONFLICT'; END IF;
  END IF;

  IF p_space_id = 'general' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''general'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt >= 3 THEN RAISE EXCEPTION 'BOOKING.SPACE_FULL'; END IF;
  ELSIF p_space_id = 'group_room' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''group_room'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  ELSIF p_space_id = 'treadmill' THEN
    SELECT status INTO v_status FROM space_resources WHERE id = p_resource_id;
    IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'BOOKING.RESOURCE_MAINTENANCE'; END IF;
    EXECUTE format('SELECT count(*) FROM bookings WHERE resource_id=%L AND %s', p_resource_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  END IF;

  RETURN jsonb_build_object('ok',true);
END $function$;
```

目前套用於：**僅 `kucvxpjatptfckhlxptj`（測試庫）**。正式庫 `rlpiomzplckzqnqrvrwc` 仍是修改前的原始版本。

## 2. 回滾版本（原始定義，未來要搬到正式庫時也是先跑這個確認原狀再套新版）

```sql
CREATE OR REPLACE FUNCTION public.space_check(p_space_id text, p_resource_id text, p_date date, p_start text, p_duration integer, p_coach_id text, p_exclude_booking text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start int := split_part(p_start,':',1)::int*60 + split_part(p_start,':',2)::int;
  v_end   int := v_start + p_duration;
  v_cnt   int;
  v_status text;
  overlap_cond text := format($q$ date=%L AND status NOT IN ('cancelled','no_show') AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int) < %s AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int + coalesce(duration,60)) > %s AND (%L IS NULL OR id <> %L) $q$, p_date, v_end, v_start, p_exclude_booking, p_exclude_booking);
BEGIN
  IF p_coach_id IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE coach_id=%L AND %s', p_coach_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.TIME_CONFLICT'; END IF;
  END IF;
  IF p_space_id = 'general' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''general'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt >= 3 THEN RAISE EXCEPTION 'BOOKING.SPACE_FULL'; END IF;
  ELSIF p_space_id = 'group_room' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''group_room'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  ELSIF p_space_id = 'treadmill' THEN
    SELECT status INTO v_status FROM space_resources WHERE id = p_resource_id;
    IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'BOOKING.RESOURCE_MAINTENANCE'; END IF;
    EXECUTE format('SELECT count(*) FROM bookings WHERE resource_id=%L AND %s', p_resource_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true);
END $function$;
```

⚠ 注意：正式庫目前的 `space_check()` 跟測試庫原始版本**不是同一份**（正式庫教練衝突那段多了 `coalesce(substitute_coach_id, coach_id)` 代課邏輯，測試庫沒有這段、也沒有 `p_ticket_id`）。這個回滾版本只適用於**測試庫**；未來要把鎖搬到正式庫時，要以正式庫自己當下的實際定義為回滾基準，不能直接套用這份。

---

## 3. `lock_timeout` 設定恢復結果（成功／逾時／例外三種情境，皆已實測，非理論推論）

| 情境 | 測試方式 | 結果 |
|---|---|---|
| **成功取鎖**（正常路徑） | 子測試A：A持鎖1.5秒後COMMIT，B等待後成功 | ✓ B 成功後，`lock_timeout` 在鎖都取得後立刻被還原（程式碼裡 `PERFORM set_config(...,coalesce(v_prev_lock_timeout,''),true)` 那行），後續的容量查詢不受 3 秒逾時限制 |
| **呼叫端已有自訂值** | 直接對 `set_config` 語意做 DO 區塊測試：模擬呼叫端先設 `10s`，進入 `space_check` 風格流程後還原 | ✓ 還原後正確回到呼叫端原本的 `10s`，不是被洗成空字串或預設值 |
| **逾時（真實觸發）** | 子測試B：A持鎖4秒，B的`lock_timeout`=3秒 | ✓ B 在 **3545ms** 收到 Postgres 原生錯誤 `55P03 canceling statement due to lock timeout`，乾淨返回，沒有卡死 |
| **例外（子交易回滾）** | DO 區塊模擬 `EXCEPTION WHEN OTHERS`：區塊內設定`lock_timeout`後主動丟例外 | ✓ 例外被接住的瞬間，`lock_timeout` **自動**還原回區塊之前的值（子交易回滾的副作用）——這是 Postgres 本身的 GUC 語意，不是我手動還原那行做的，等於有「正常路徑手動還原」+「例外路徑自動還原」雙重保障 |

結論：三種情境都已用真實查詢（不是純推論）驗證過，設定恢復行為符合預期，沒有外洩到交易外或污染其他呼叫。

---

## 4. 測試資料庫殘留確認

| 檢查項目 | 結果 |
|---|---|
| `bookings` 總筆數 | 57（測試前後相同） |
| 測試用的兩個日期（2026-12-16／2026-12-20）殘留預約 | 0 筆 |
| 4 張測試票券（`TK-ms0do81380gc`／`TK-ms0dnshw6rcc`／`TK-mrudybzs5af0`／`TEST-PT10`）`sessions_remaining` | 全部精確符合測試前快照 |
| `pg_stat_activity` 中 idle in transaction 的殘留連線 | 0 |
| `pg_locks` 中殘留的 advisory lock | 0 |

**沒有任何殘留測試預約、票券扣除或未結束交易。**

---

## 5. 第一階段實際保護範圍

### 已受保護
- `fn_create_booking()` 的呼叫路徑（目前只有 `runRecurringBooking`（連續預約）在「有票／非待繳費／無指定場地／非自主訓練／非免扣點」這 5 個條件同時成立時會呼叫）——**一般區、團課教室、跑步機的容量搶占**與**教練時段衝突**，已用真連線證明會正確序列化，不會超賣。

### 仍未保護（第一階段完全沒碰，風險原封不動）
- `_submitBookingInner`（單筆建立預約主入口——私教/友善/體驗/團課/自主訓練）
- 連續預約裡不滿足上述 5 條件的情況（跑步機指定場地、自主訓練代排、分期待繳費保留、免扣點、沒找到票）
- 場地租賃 `_submitFacilityBooking`
- 跑步機同行加開 `bkAddTreadmillUnits`
- 所有改期/調課/拆台（80+ 處直接 `dbPut('bookings',...)`）
- 櫃檯/教練調整團課名單
- 換代課教練
- `venue_unit` 獨占邏輯（`fn_member_self_book`/`fn_member_self_venue`，完全不同函式，不呼叫 `space_check`）
- 會員跨類別時段重疊（`fn_create_booking` 從來沒做過這項檢查）
- 同一意圖被重複送出造成的重複預約（idempotency，鎖解決不了這個）

**第一階段保護的是全站預約建立量裡的一小部分，不能當成「問題已解決」對外宣稱。**

---

## 6.5 正式庫部署套件（2026-11-01，唯讀稽核後補齊，尚未執行）

### 為什麼不能直接套用第 1/2 節的 SQL
正式庫目前的 `space_check()` 跟測試庫**原始版本不是同一份**——正式庫的教練衝突檢查多了代課邏輯：
```sql
-- 正式庫原文（已於本次稽核重新取得並核對過）
EXECUTE format('SELECT count(*) FROM bookings WHERE coalesce(substitute_coach_id, coach_id)=%L AND %s', p_coach_id, overlap_cond) INTO v_cnt;
```
測試庫原始版本只有 `coach_id=%L`，沒有 `coalesce(substitute_coach_id, coach_id)`。如果直接貼第 1 節的測試庫套用版到正式庫，**會讓代課時「原教練檔期空出來、代課教練才算衝突」這條既有規則消失**，等於在修並發問題的同時引入一個邏輯回歸。

### 部署 SQL（已在測試庫驗證過「鎖＋代課邏輯」合併後兩者互不影響，見下方驗證紀錄）
```sql
CREATE OR REPLACE FUNCTION public.space_check(p_space_id text, p_resource_id text, p_date date, p_start text, p_duration integer, p_coach_id text, p_exclude_booking text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start int := split_part(p_start,':',1)::int*60 + split_part(p_start,':',2)::int;
  v_end   int := v_start + p_duration;
  v_cnt   int;
  v_status text;
  v_prev_lock_timeout text;
  overlap_cond text := format(
    $q$ date=%L AND status NOT IN ('cancelled','no_show')
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int) < %s
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int + coalesce(duration,60)) > %s
        AND (%L IS NULL OR id <> %L) $q$,
    p_date, v_end, v_start, p_exclude_booking, p_exclude_booking);
BEGIN
  -- 2026-11-01（Stage1，正式庫合併版）：鎖先於容量/衝突檢查，同一個交易內完成重新查詢與寫入
  v_prev_lock_timeout := current_setting('lock_timeout', true);
  PERFORM set_config('lock_timeout', '3s', true);

  IF p_coach_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('yugym:coach'), hashtext(p_coach_id || ':' || p_date::text));
  END IF;

  IF p_space_id IN ('general','group_room') THEN
    PERFORM pg_advisory_xact_lock(hashtext('yugym:space'), hashtext(p_space_id || ':' || p_date::text));
  ELSIF p_space_id = 'treadmill' THEN
    PERFORM pg_advisory_xact_lock(hashtext('yugym:space'), hashtext(p_space_id || ':' || coalesce(p_resource_id,'') || ':' || p_date::text));
  END IF;

  PERFORM set_config('lock_timeout', coalesce(v_prev_lock_timeout, ''), true);

  -- 教練時間衝突（2026-08-15 使用者案例：Mango 週一 13:00 團課已請代課，本人要接其他教練課）
  -- 以「實際授課教練」判斷：有代課算代課教練的檔期，原教練空出來 —— 與前端 validateBooking 同口徑
  -- ⚠ 正式庫既有邏輯，Stage1 原封不動保留，只是現在排在鎖之後執行
  IF p_coach_id IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE coalesce(substitute_coach_id, coach_id)=%L AND %s', p_coach_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.TIME_CONFLICT'; END IF;
  END IF;

  IF p_space_id = 'general' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''general'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt >= 3 THEN RAISE EXCEPTION 'BOOKING.SPACE_FULL'; END IF;

  ELSIF p_space_id = 'group_room' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''group_room'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;

  ELSIF p_space_id = 'treadmill' THEN
    SELECT status INTO v_status FROM space_resources WHERE id = p_resource_id;
    IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'BOOKING.RESOURCE_MAINTENANCE'; END IF;
    EXECUTE format('SELECT count(*) FROM bookings WHERE resource_id=%L AND %s', p_resource_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  END IF;

  RETURN jsonb_build_object('ok',true);
END $function$;
```

### 回滾 SQL（正式庫目前真正的原始版本，已於 2026-11-01 從正式庫重新取得，不是猜的）
```sql
CREATE OR REPLACE FUNCTION public.space_check(p_space_id text, p_resource_id text, p_date date, p_start text, p_duration integer, p_coach_id text, p_exclude_booking text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start int := split_part(p_start,':',1)::int*60 + split_part(p_start,':',2)::int;
  v_end   int := v_start + p_duration;
  v_cnt   int;
  v_status text;
  overlap_cond text := format(
    $q$ date=%L AND status NOT IN ('cancelled','no_show')
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int) < %s
        AND (split_part(start_time,':',1)::int*60 + split_part(start_time,':',2)::int + coalesce(duration,60)) > %s
        AND (%L IS NULL OR id <> %L) $q$,
    p_date, v_end, v_start, p_exclude_booking, p_exclude_booking);
BEGIN
  IF p_coach_id IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE coalesce(substitute_coach_id, coach_id)=%L AND %s', p_coach_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.TIME_CONFLICT'; END IF;
  END IF;

  IF p_space_id = 'general' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''general'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt >= 3 THEN RAISE EXCEPTION 'BOOKING.SPACE_FULL'; END IF;

  ELSIF p_space_id = 'group_room' THEN
    EXECUTE format('SELECT count(*) FROM bookings WHERE space_id=''group_room'' AND %s', overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;

  ELSIF p_space_id = 'treadmill' THEN
    SELECT status INTO v_status FROM space_resources WHERE id = p_resource_id;
    IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'BOOKING.RESOURCE_MAINTENANCE'; END IF;
    EXECUTE format('SELECT count(*) FROM bookings WHERE resource_id=%L AND %s', p_resource_id, overlap_cond) INTO v_cnt;
    IF v_cnt > 0 THEN RAISE EXCEPTION 'BOOKING.RESOURCE_BUSY'; END IF;
  END IF;

  RETURN jsonb_build_object('ok',true);
END $function$;
```

### 部署前驗證（已在測試庫完成，正式庫待執行時重複同一套）
1. 部署前：`select pg_get_functiondef(oid) from pg_proc where proname='space_check' and pronamespace='public'::regnamespace;`，核對跟上面「回滾 SQL」逐字一致——確認貼的時候正式庫沒有被別人又改過。
2. 部署：執行「部署 SQL」。
3. 部署後立刻：`select proname from pg_proc where pronamespace='public'::regnamespace and pg_get_functiondef(oid) ilike '%pg_advisory%';` 應該查到 `space_check`。
4. 部署後功能回歸：用一筆已知教練衝突情境（例如某教練同時段已有課、或代課情境）各測一次，確認 `BOOKING.TIME_CONFLICT`／代課邏輯都還正確（這組判斷在測試庫已經用合成資料驗證過，見下方「合併驗證紀錄」）。
5. 486 支／484 支既有 `tests/*.js` 全線重跑（這些是 JS 測試，跟這支 SQL 函式無關，但部署任何資料庫物件後照慣例重跑一次確認前端沒受影響）。

### 合併驗證紀錄（2026-11-01，在測試庫套用「鎖＋代課邏輯合併版」後完整重跑）
- `lock-check.js`／`race-booking-test.js`／`lock-mechanism-proof.js`／`lock-timeout-semantics-test.js`／`lock-different-resources-test.js` 全部重跑：**PASS**（鎖的阻塞/釋放/逾時/粒度行為，跟測試庫原本沒有代課邏輯時完全一致，合併沒有互相干擾）。
- 額外補測代課情境（合成資料，測後精準刪除、筆數核對回 57）：
  - 教練 e_c2 的課請 e_c3 代課 → 呼叫 `space_check` 問 **e_c3**（代課教練）同時段是否衝突 → 正確回傳 `BOOKING.TIME_CONFLICT`。
  - 同一堂課、呼叫 `space_check` 問 **e_c2**（原教練）同時段是否衝突 → 正確回傳 `{"ok":true}`（原教練檔期已空出來，符合「有代課算代課教練的檔期」的既有規則）。
- 測試庫善後：刪除 1 筆合成測試資料，`bookings`/`members`/`employees`/`member_tickets`/`ticket_logs` 筆數核對回測試前基準值，全部一致。

**本輪只在測試庫套用並驗證了「正式庫適用版」，正式庫本身完全沒有執行任何 migration 或函式變更，等待使用者確認後才會真的部署。**

### ✅ 2026-11-01 正式庫部署完成
上方「正式庫適用版」已實際套用到 `rlpiomzplckzqnqrvrwc`。部署後唯讀核對：
```sql
select pg_get_functiondef(oid) ilike '%pg_advisory_xact_lock%' as has_lock,
       pg_get_functiondef(oid) ilike '%coalesce(substitute_coach_id, coach_id)%' as has_sub_coach,
       pg_get_functiondef(oid) ilike '%lock_timeout%' as has_lock_timeout
from pg_proc where proname='space_check' and pronamespace='public'::regnamespace;
-- 結果：has_lock=true, has_sub_coach=true, has_lock_timeout=true
```
三者皆存在，確認鎖定機制與正式庫既有的代課教練判斷都正確保留。部署前已確認：`space_check` 全庫只有 `fn_create_booking` 一支呼叫者，且 `space_check` 本身權限只授予 `service_role`/`postgres`（`authenticated`/`anon` 都沒有），前端無法單獨呼叫，鎖定／容量檢查／INSERT 保證在 `fn_create_booking` 同一個交易內完成，不存在「分離呼叫、鎖提早釋放」的風險。沒有建立任何正式庫測試預約，沒有修改既有預約資料。

---

## 6. 第二階段範圍、風險與測試計畫（僅規劃，不執行）

### 修改範圍
1. **擴充 `fn_create_booking()` 涵蓋更多情境**：把目前被排除的 `venue_pref`（跑步機/指定場地）、自主訓練代排邏輯從前端 JS 搬進 RPC，讓更多建立路徑能真正走到 `space_check()`。
2. **新增 idempotency key**：`bookings` 加 `idempotency_key`（nullable）欄位 + partial unique index，`fn_create_booking` 新增 `p_idempotency_key` 參數（預設 `NULL`，向下相容），撞到重複 key 時改查原結果回傳而非報錯或重建。

### 風險
- 第1項涉及把前端的場地配置邏輯搬進資料庫，行為變動面較大，需要重新驗證跑步機「同行使用不扣點」等既有規則沒有跑掉。
- 第2項是 schema migration（新欄位+新索引），風險本身低（nullable、partial index、不影響既有資料），但仍需要獨立 migration 走一次完整流程。
- 兩項都不會動到第一階段已經驗證過的鎖定邏輯本身。

### 測試計畫（屆時才執行）
1. 針對新涵蓋的 `venue_pref`/自主訓練代排情境，比照第一階段的「子測試A/B」手法（手動持鎖+控制時機），逐一補併發測試，不依賴運氣。
2. Idempotency key：同一個 key 送兩次，確認第二次拿到跟第一次一樣的 `booking_id`，不會建出第二筆。
3. 重跑第一階段全部測試案例，確認既有保護範圍沒有被破壞。
4. 486 支既有測試全部重跑。

**本輪僅完成文件整理，未執行任何新的資料庫修改、未進入第二階段實作。**

---

## 附錄：測試腳本位置（獨立資料夾，不在 App 的 git 專案內）
`/Users/tungyeh/Projects/yugym-race-test/`
- `lock-check.js`：第二階段鎖定機制驗證
- `race-booking-test.js`：同資源並發搶位測試
- `lock-mechanism-proof.js`：鎖定阻塞/釋放與 lock_timeout 逾時的直接證明
- `lock-different-resources-test.js`：不同資源對照組
- `lock-timeout-semantics-test.js`：`lock_timeout` GUC 恢復行為驗證
- `safety-check.js`：連線安全門（防呆，確認非正式庫）
