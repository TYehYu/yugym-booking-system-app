# YUGYM 開發進度交接文件

> 建立：2026-11-01。取代同名舊版（舊版內容已過時，這份完全重寫）。
> 目的：保存「預約容量競態修復」專案的進度，供 `/clear` 之後或換一台機器接手。
> 這份文件根據實際程式碼、Git 狀態與本次對話中跑過的測試紀錄整理，沒有用猜的。

---

## 0. 現況一句話

**✅ 2026-11-01：Stage 1 已重新核實並正式部署到正式庫（詳見第2.5節）。** 上一版文件曾誤寫「已上線」又曾被稽核推翻成「待部署」——這兩件事都已經是歷史，目前的事實是：唯讀稽核先發現正式庫其實沒有鎖 → 準備「鎖＋代課邏輯合併版」→ 測試庫完整驗證 → 使用者確認 → **已於今天實際執行 migration，部署後唯讀核對 `has_lock=true`／`has_lock_timeout=true`／`has_sub_coach=true` 三者皆存在**。

**行事曆記憶體修復（效能優化，跟 Stage1 的鎖無關）已正式部署上線。2a 確認已滿足。Stage 1 已部署（見上）。2b（idempotency key）、2c（自主訓練場地鎖）已在測試庫完整驗證通過，但還沒有部署到正式庫、前端變更也還沒 commit。2d（團課名額並發保護）方向 B 已定案（分4階段，見第3節），**2d-1／2d-2／2d-3 全部完成並驗證**：測試庫 `fn_group_save_members` 同時支援 add/remove/attendance孤兒鍵清理，前端 `_saveGroupMembers` 已改接這支 RPC，跟既有 `fn_member_join_group` 真並發測試過（搶名額／同時退名額），484 支既有 `tests/*.js` 全綠。2d-4（正式庫部署）還沒開始——目前全程只在本機/測試庫完成，`index.html` 本機工作目錄有改動但**沒有 commit、沒有推上正式網站**。另外同一天還獨立修復一個跟 2d 無關的員工列表顯示問題（見第8節，已完成，狀態與提交方式跟這次預約系統部署分開記錄，不要混在一起推）。**

> ⚠⚠ **2026-11-09 最新進度在第12節**——本節（第0節）與第1-11節內容截至2026-11-02，仍然有效、不要重新研究；但「目前卡在哪裡、下一步做什麼」請直接看第12節，那裡有2026-11-09最後一輪正式部署前審查的完整結論（含部署順序、三份SQL準備檔案路徑、2b的回復順序新發現、2c的死鎖分析、第5-8處路徑的程式碼核對結果）。

---

## 1. 兩個資料庫的識別資訊

| | Project ID | 用途 |
|---|---|---|
| 正式庫 | `rlpiomzplckzqnqrvrwc` | 真實營運資料，Mango 等教練與會員實際在用 |
| 測試庫 | `kucvxpjatptfckhlxptj`（`yugym-sprint3-test`） | 本次所有並發修復的開發與測試環境 |

- 本機 `config.js`（受 `git update-index --skip-worktree` 保護）指向測試庫；`master` 已提交版本指向正式庫。這是刻意的既有慣例，不是異常。
- 測試庫**不是**正式庫的完整鏡像——好幾支函式/欄位/資料表一開始根本不存在（見第 3 節），是這次對話過程中逐步唯讀取自正式庫、用合成資料補齊的，不是整庫複製。
- 測試庫固定 fixture：6 位員工、11 位會員、約 57 筆既有預約（這是使用者自己建的合成測試資料，每輪測試後都會核對筆數還原回 57）。

---

## 2. Stage 1 / 2a / 2b / 2c / 2d-1 / 2d-2 已完成的工作（已驗證，不要重新研究）

### Stage 1 — `space_check()` 加 advisory lock（✅ **2026-11-01 已部署正式庫**，部署前曾被稽核推翻舊文件的錯誤「已上線」記載，詳見第2.5節的完整時間線）
- 問題：預約建立時「查容量」到「真的寫入」之間沒有鎖，兩個並發請求可能都通過檢查、一起超賣。
- 修法（測試庫已驗證，內容本身沒有問題）：`pg_advisory_xact_lock`，鍵＝教練/場地資源＋日期，固定順序（教練鎖先於空間鎖）避免死鎖；加 `lock_timeout='3s'`，用 `set_config(...,true)` 設定並在鎖都拿到後立刻還原，不影響同一交易後續操作。
- **測試證據（測試庫，用真連線，不是模擬）**：兩條連線搶最後一格一般區名額、手動 `BEGIN` 持鎖直接證明阻塞/釋放、故意觸發真的 `lock_timeout`（抓到 Postgres 原生錯誤碼 `55P03`）、不同資源對照組互不阻塞。486 支既有測試全綠。
- 詳細 SQL、回滾版本、完整測試紀錄：`YUGYM_BOOKING_RACE_FIX_STAGE1.md`。
- **✅ 部署狀態：2026-11-01 已實際部署到正式庫並通過部署後核對（見第 2.5 節完整時間線與證據）。**

#### 2.5 稽核發現（2026-11-01）：Stage 1 從未真正部署到正式庫

**查核方法與證據**：
1. `select proname from pg_proc where pronamespace='public'::regnamespace and pg_get_functiondef(oid) ilike '%pg_advisory%';` → **0 筆**。正式庫整個 `public` schema 裡，沒有任何函式呼叫 `pg_advisory_xact_lock`（或任何 advisory lock）。
2. 正式庫目前的 `space_check()` 定義（已取得完整原文核對）：純粹是 `EXECUTE format(...)` 組查詢語句數 `bookings` 筆數，**沒有鎖、沒有 `lock_timeout`、沒有 `set_config`**，是完全原始、沒改過的版本。
3. `bookings` 表上的 4 個觸發器（`bookings_cancelled_by`／`bookings_touch`／`trg_bookings_group_guard`／`trg_change_log`）全部跟鎖無關，沒有藏在觸發器裡的替代實作。
4. `fn_create_booking()` 目前簽章**沒有 `p_idempotency_key` 參數**——這點跟 2b 文件原本寫的「測試庫已驗證、正式庫還沒碰」一致，沒有矛盾。
5. **`select * from list_migrations`（正式庫）查到的最後一筆是 `20261027175959_bookings_partner_policy_hoistable`（2026-10-27）**，之後完全沒有任何 migration 紀錄——Stage1/2b/2c/2d 這一整段並發修復工作（根據對話記錄都發生在 2026-10-31～11-01）**從未對正式庫執行過任何 migration**。
6. `git log` 查 commit `aecf37b`（上一版文件引用為部署依據）：這個 commit 內容是「教練端手機行事曆：週檢視全表掃描 7 次改成分組 1 次」，純前端效能優化，`diff` 只改 `index.html` 12 行新增/3行刪除，**跟 Stage 1 的資料庫鎖完全無關**。上一版文件把這個 commit 當成「Stage 1 已部署」的依據是錯的——很可能是把「測試庫驗證完成、原本打算部署」誤記成「已經部署」，或是把兩件事混在一起寫。

**區分三件事，不要再混為一談**：
| 項目 | 狀態 |
|---|---|
| Stage 1 的鎖**寫好、在測試庫驗證通過** | ✅ 真的做到了，SQL 本身沒問題 |
| Stage 1 的鎖**部署到正式資料庫** | ❌ 沒有，上面 6 點證據確認 |
| 行事曆週檢視效能修復（commit `aecf37b`） | ✅ 這個真的上線了，但它是前端效能優化，跟 Stage1 的鎖是兩件不相關的事，只是剛好在同一個版本號推送 |

**目前正式預約流程是否還有其他有效的並發保護？（逐條確認，不是「完全沒有保護」）**
- ❌ **一般課程/體驗課建立**（`fn_create_booking`→`space_check`，教練時間衝突、`general`/`group_room`/`treadmill` 容量檢查）：**沒有任何鎖**，純 COUNT 查詢，是教科書等級的 TOCTOU 競態，兩個並發請求可能一起通過檢查、一起超賣。這條是**最常用的建立預約路徑**，風險等級最高。
- ❌ **自主訓練場地/時段**（`fn_member_self_book`/`fn_member_self_venue`）：對**票券餘額**有保護（`select...for update member_tickets`，不會重複扣同一張票），但對**場地/時段本身**（`BOOKING.RESOURCE_BUSY` 檢查）只是 `EXISTS` 查詢，沒有鎖——兩個不同會員、不同票，仍可能搶到同一台跑步機/同一個時段。這正是 2c 要修的，而 2c 也還沒部署。
- ✅ **團課會員自行報名**（`fn_member_join_group`）：有 `SELECT * FROM bookings WHERE id=... FOR UPDATE`（鎖住整堂的列鎖）＋ `SELECT mt.* FROM member_tickets... FOR UPDATE`（鎖票），這條**已經正確保護，而且已經在正式庫上線**，不受這次稽核影響。
- ✅ **教練/櫃檯手動扣票**（`fn_deduct_ticket`）：有 `FOR UPDATE` 鎖票＋冪等判斷，已上線，沒問題。
- ❌ **團課名單管理（櫃檯/教練改名單）**：這正是整個 2d 系列要解決的問題，目前正式庫維持原狀（前端直接 `dbPut` 整列覆蓋，沒有鎖）——這個落差從頭到尾都知道，不是這次稽核的新發現。
- 其餘前端的 `onceAct` 防連點：只防「同一個人在同一台裝置連點兩下」，防不了「兩個不同的人/裝置幾乎同時送出」，不算真正的並發保護。

**風險等級（部署前）**：中——這不是這次對話造成的新風險（正式庫一直是這個狀態，只是文件誤記成已修復），代表「一般課程/體驗課」與「自主訓練場地」這兩條路當時確實暴露在真實的超賣/場地衝突風險下。**Stage 1 這條已經在2026-11-01部署後關閉**；自主訓練場地那條（2c負責）仍待部署。

### ✅ Stage 1 正式庫部署完成（2026-11-01）

**部署前額外核對過的交易鎖問題**：使用者追問過「前端若分開呼叫space_check與INSERT，鎖會不會提早釋放」——查證結果：`space_check` 全庫只有 `fn_create_booking` 一支呼叫者，且 `space_check` 的執行權限**只授予 `service_role`/`postgres`**（`authenticated`/`anon` 都沒有），前端在任何情況下都無法單獨呼叫它，鎖定／容量檢查／INSERT 保證都在 `fn_create_booking` 同一個交易內完成，不存在「檢查與寫入分離、鎖提早釋放」的風險。

**發現正式庫 `space_check()` 比測試庫原始版本多一段代課教練衝突邏輯**（`coalesce(substitute_coach_id, coach_id)`），不能直接貼測試庫版本，否則會讓代課規則回歸消失——改用「鎖＋代課邏輯合併版」部署 SQL（已先在測試庫套用並完整驗證：5支鎖定測試全PASS、合成資料驗證代課情境正確、其餘既有腳本重跑無連帶影響、測試資料清理後筆數核對回基準值）。

**部署執行**：`apply_migration` 於 2026-11-01 成功套用到正式庫 `rlpiomzplckzqnqrvrwc`。**部署後唯讀核對**：
```sql
select pg_get_functiondef(oid) ilike '%pg_advisory_xact_lock%' as has_lock,
       pg_get_functiondef(oid) ilike '%coalesce(substitute_coach_id, coach_id)%' as has_sub_coach,
       pg_get_functiondef(oid) ilike '%lock_timeout%' as has_lock_timeout
from pg_proc where proname='space_check' and pronamespace='public'::regnamespace;
-- has_lock=true, has_sub_coach=true, has_lock_timeout=true
```
三者皆確認存在。沒有建立任何正式庫測試預約，沒有修改既有預約資料。部署SQL、回滾SQL（正式庫原始版本）、完整核對紀錄都在 `YUGYM_BOOKING_RACE_FIX_STAGE1.md` 第6.5節。

**重新整理後的相依關係與部署順序**：
1. ~~Stage 1（`space_check` 加鎖）~~ ✅ **已部署（2026-11-01）**。
2. **2b（idempotency key）疊在 Stage 1 之上**：部署順序＝先更新 `fn_create_booking`（同時含 Stage 1 的鎖＋2b 的 key，兩個改動其實都在同一支函式，建議合併成一次部署，不要分兩次改同一支函式——**現在 Stage1 已單獨部署，之後 2b 上線時 `fn_create_booking` 要記得是在「已經有鎖的 `space_check`」之上疊加 idempotency key，不是從原始版本疊加**）→ 前端 idempotency 相關改動（`index.html`／`tests/recurtimetest.js`，本機已改、未 commit）。**2b 上線前兩項既有風險（內容比對缺 ticket_id、視窗內修改內容沒換新key）仍要先處理**，這點沒變。
3. **2c（`fn_member_self_book`/`fn_member_self_venue` 加 venue_unit 鎖）獨立於 Stage1/2b**，可以分開部署，上線前要先核對正式庫當下這兩支函式的定義（這次稽核確認至少跟上次複製時一致，沒有被改過，可以直接比對測試庫版本貼回去）。
4. **2d（`fn_group_save_members` 新函式＋前端 `_saveGroupMembers` 改接線）完全獨立**，不依賴 Stage1/2b/2c 任何一個，依賴的是已經上線的 `fn_member_join_group`（確認沒問題）。部署順序：先建 `fn_group_save_members`（純新增，不影響任何現有呼叫端）→ 再換前端 `_saveGroupMembers`／新增 `refundTicketDateRevertOnly`（必須先有 RPC 才能接，順序不能反）。
5. 四組彼此在 DB 層沒有互相依賴（改的是不同函式），可以照任意順序個別部署、個別驗證、個別回滾；但如果要排優先序，依「目前風險高低」建議 **Stage1 → 2d → 2c → 2b**（2b 的兩項已知風險需要額外時間處理，不急著搶第一）。

### 2a — 單筆建立預約改走已驗證的 RPC
- **結論：不需要修改。** 逐行核對後發現 `_submitBookingInner()` 的「一般課程（私教/友善/自主）」分支，不管單筆或連續預約都呼叫同一支 `runRecurringBooking()`（單筆只是 `slots` 陣列裡只有 1 個元素），這支引擎本來就已經有 RPC 資格判斷（`!noDeduct && tk && !holdOnly && !o.venue_pref && !bkIsSelf(bk)` 時走 `createBookingViaRpc`）。所以「單筆私教/友善課、有票、沒指定場地」這個最常見情境早就在走 Stage 1 保護過的 `fn_create_booking`。
- 體驗課、團體課完全不經過這條路（固定走 `dbPut`），但容量模型不同，不在 2a 範圍內。

### 2b — Idempotency Key（**測試庫已驗證，正式庫/前端 commit 都還沒做**）
- 目的：同一次操作網路重試或連點，不會建出第二筆預約、不會重複扣票。
- **後端（測試庫 `fn_create_booking`）**：新增 `p_idempotency_key` 參數。進函式先查有沒有這個 key；真正的並發保護在 `INSERT` 本身——包進子區塊、`EXCEPTION WHEN unique_violation` 接住，查出贏的那筆直接回傳。同 key 但內容不同（member/coach/category/date/time/duration 任一不同）回 `IDEMPOTENCY.CONFLICT`，不回傳舊預約。
- **順便發現並修的相容性落差**：測試庫原本連 `p_ticket_id` 參數都沒有（正式庫早就有），導致用真實前端呼叫形狀測試直接「函式不存在」。已補一個**相容性 shim**（只接受這個參數、不生效，測試庫沒有正式庫的 `benefit_consume_ticket`）。
- **前端**：`openBookingModal()` 開視窗時把 `window._bkOpId` 清空（代表新操作）；`submitBooking()` 沒有就生一個 `uid('IDEM')`、有就沿用（涵蓋同一次操作內的重試）；`_rrOpts` 帶 `opId`；`runRecurringBooking` 逐堂接上日期時間組出專屬 key；`createBookingViaRpc` 轉送 `p_idempotency_key`。
- **測試結果**：同key重送只拿到同一筆、**兩條連線真並發送同一個key只建1筆**、同key不同內容正確回衝突、失敗路徑不會燒掉key（可重試）。486支測試全綠（含更新 `tests/recurtimetest.js` 一條因簽名變更而過時的斷言）。
- **⚠ 正式上線前必須處理的 2 項風險，已記錄在 `YUGYM_BOOKING_RACE_FIX_PROD_CHECKLIST.md`**：
  1. 使用者在視窗沒關的情況下修改了預約內容，前端目前沒有主動換新 key 的機制。
  2. 內容比對目前**沒有包含 `ticket_id`**——測試庫因為 `p_ticket_id` 是假的所以沒差，但正式庫這個參數是真的會決定扣哪張票，上線前要補這個比對，並針對正式庫的 `benefit_consume_ticket` 路徑重新測一次。

### 2c — 自主訓練 `venue_unit` 資源鎖（**測試庫已驗證，正式庫還沒部署**）
- 問題：`fn_member_self_book`/`fn_member_self_venue` 原本只用 `EXISTS` 查詢判斷場地編號（例如哪一台跑步機）有沒有被佔用，沒有鎖，兩個會員可能同時搶到同一台。
- **測試庫原本完全沒有這兩支函式**（也沒有 `fn_biz_hours`／`desk_alert`／`bookings.sibling_of` 欄位／`venues` 表資料）——已唯讀取自正式庫、合成資料補齊這些前置相依，確認不影響 Stage1/2a/2b 後才繼續。
- 修法：跟 Stage 1 同款手法，`pg_advisory_xact_lock`，鍵＝場地編號＋日期，命名空間跟 Stage 1 不同（`yugym:venue_unit`，不會互相碰撞）。主要場地檢查與跑步機「同行使用」迴圈裡每個候選編號都各自上鎖。
- **測試結果**：baseline（未加鎖的搬運版本）先確認可正常運作；手動持鎖直接證明鎖生效；真並發搶同一台只成功1筆；不同台互不阻塞；`lock_timeout` 真的觸發且乾淨返回。486支測試全綠。資料完整性核對通過，無殘留鎖。
- 詳細 SQL、回滾版本：見本次對話紀錄（還沒整理成獨立檔案，下一輪可以考慮補一份 `YUGYM_BOOKING_RACE_FIX_STAGE2C.md`）。

### 2d-1 — `fn_group_save_members`（團課新增名額，只做 add 路徑；**測試庫已驗證，正式庫還沒碰**）
- 範圍：只實作第3.4節設計的 add 路徑（容量檢查、票券歸屬/類別/效期驗證、冪等防重複扣、`multi` 允許一票扣多格）；remove 路徑刻意留給 2d-2，這支目前不接受移除名額。
- **補齊測試環境的前置缺口**（唯讀複製正式庫定義，沒有改動邏輯，沒有複製任何真實會員個資/票券/預約）：
  1. 測試庫原本完全沒有 `fn_member_join_group`／`fn_deduct_ticket` 這兩支函式——已從正式庫原封不動複製過去（含必要的 `grant execute to authenticated`）。
  2. 測試庫 `bookings` 表原本缺 `max_heads`（integer，可空，無預設）與 `seat_tickets`（jsonb，可空，無預設）兩個欄位——型別/NULL 規則比對正式庫後用 `ALTER TABLE ADD COLUMN` 原樣補上，**沒有補資料**，既有 57 筆預約都還是 NULL、沒有異動。
  3. 其餘相依物件（enum 值 `ticket_log_action`/`ticket_status`/`booking_status`/`ticket_category`、`gen_random_uuid()`、`gen_short_id()`、`current_member_id()`/`current_employee_id()`/`is_staff_desk()`）測試庫本來就有，型別/內容核對過跟正式庫一致，沒有再動。
- **鎖定方式**：第一步 `SELECT * FROM bookings WHERE id=$1 FOR UPDATE`，跟 `fn_member_join_group` 搶同一列鎖，天然互斥（不需要另外設計跨函式協調）。
- **權限**：比照 `fn_deduct_ticket`——要求 `current_employee_id()` 不為 null（否則 `NOT_STAFF`）；非櫃檯以上（`is_staff_desk()` 為否）的教練只能動 `coach_id`／`substitute_coach_id` 是自己的那一堂，否則 `NOT_YOUR_BOOKING`。
- **測試結果**（`/Users/tungyeh/Projects/yugym-race-test/grpsave-2d1-test.js`，全程用真連線直接呼叫 RPC，測試後精準刪除本次建立的 3 筆 bookings／4 張 member_tickets／對應 ticket_logs，筆數核對回測試前基準，全部還原）：
  - T1 名額已滿（FULL）→ 正確擋下，沒有扣票也沒寫入名單
  - T2 票不屬於這個會員（TICKET_INVALID）→ 正確擋下
  - T3 票餘額為 0（NO_REMAINING）→ 正確擋下
  - T4 同一張票送兩次（`multi:false`）→ 只真的扣 1 次（冪等），但兩個名額都寫進 `member_ids`，`seat_tickets` 正確記成 `mid` 與 `mid#2` 兩個鍵（跟今天 `deductTicket`「已扣過也算成功」的既有行為一致）
  - T5 `multi:true` → 允許對同一張票再扣一次（合法的「一票扣多格」）
  - T6 非本堂教練操作別人的課 → `NOT_YOUR_BOOKING`；本堂負責教練操作自己的課 → 正常放行
  - **T7 真並發**：櫃檯呼叫 `fn_group_save_members` vs 會員呼叫既有 `fn_member_join_group`，同時搶同一堂最後 1 個名額（`max_heads=2`，已佔 1 格）——**兩邊永遠只有一方成功，名額最終剛好 2/2，沒有超賣**（跑了兩次，一次櫃檯贏、一次會員贏，兩種結果都正確處理）
  - 全部 7 項 PASS，測試前後資料庫筆數（bookings/member_tickets/ticket_logs/employees）完全一致
- **還沒做、2d-2 才處理**：remove 路徑（退名額/退票）、attendance 孤兒鍵清理（2d-1 不會縮減名單，不會產生孤兒鍵，暫不需要）、`refundTicket` 效期校正段的拆分。
- **正式庫部署前要做**：跟正式庫當下的 `bookings` 欄位與既有函式重新核對一次（2d-1 全程只在測試庫做，期間正式庫若有變更，貼過去前要重新比對，同 2c 的既有程序）。

### 2d-2 — `fn_group_save_members` 加上 remove 路徑（退名額/退票；**測試庫已驗證，正式庫還沒碰**）
- 做法：`CREATE OR REPLACE` 同一支 `fn_group_save_members`，簽名多一個參數 `p_removes jsonb`（跟 2d-1 的 `p_adds` 平行，也是一個陣列，每筆是一個 `member_id`，可重複＝退多個名額）。**同一個交易裡先處理 removes 再處理 adds**——這樣「退一個、換另一個人」不會被容量檢查誤擋（容量是逐筆即時算的，退的先生效，加的才檢查），但仍在同一把鎖、同一個交易裡，原子性沒有打折。
  - 2d-1 當時建的 4 參數舊版函式（沒有 `p_removes`）已經 `DROP FUNCTION` 掉，測試庫現在只剩這一支 5 參數版本，避免兩個簽名並存造成混淆。
- **remove 每一筆的規則**（照抄既有邏輯，不是重新設計）：
  1. 這個人要真的在目前（鎖定後、即時讀到的）名單上才能退，否則 `NOT_IN_ROSTER`——不像 2d-1 之前的 JS 版本是拿「視窗打開時的舊快照」算差異，這裡一律用鎖進去那一刻的真實名單判斷，不會被會員自己剛報名或別人剛改過的名額誤殺。
  2. 找這個人這堂「淨扣 > 0」的票（同前端 `grpNetDeductTicket`：多張票時挑最近一筆扣課的那張）。
  3. 找到才真的退：`sessions_remaining+1`、視情況 `used_up→usable`、寫 `ticket_logs(refund)`；退之前先檢查**不超過總堂數**（同 `refundTicket` 的 R3 稽核護欄），滿了就只留一筆 `adjust 0` 警示，不多退。
  4. 不管有沒有退到票，名額都正常退出 `member_ids`／`seat_tickets`（同前端既有行為：「找不到票可退」不影響名額異動，只是沒有票被退）。
- **刻意不做**：`refundTicket` 的「效期退回未開通」系統範圍校正（`tkHoldingBookings`）——跟 2d-1 的 add 路徑是同一個決定，這段事後自癒校正留給 2d-3 接線時處理，不是正確性的紅線。
- **測試結果**（`/Users/tungyeh/Projects/yugym-race-test/grpsave-2d2-test.js`，真連線直接呼叫 RPC，測試後精準刪除本次 4 筆 bookings／6 張 member_tickets／對應 ticket_logs，筆數核對回測試前基準，全部還原）：
  - R1 加入後再退 → 票真的退回（3→2→3）、名額跟 `seat_tickets` 都清乾淨
  - R3 退一個不在名單上的人 → `NOT_IN_ROSTER`
  - R4 票餘額已經是滿的 → 退票被護欄擋下（不會變成超過總堂數），但名額照樣正常退出名單
  - R5 名額已滿時「同一次呼叫」先退一個、換另一個人進來 → 成功，沒被容量檢查誤擋（驗證了「先 remove 後 add」這個處理順序是對的）
  - **R6 真並發**：兩條連線同時想退同一個人「僅有的」1 個名額 → 只有一方成功，票只真的退 1 次，沒有名額殘留
  - **R2 真並發**：櫃檯用 `fn_group_save_members` 退掉一個名額，同時會員用既有 `fn_member_join_group` 搶同一堂 → 驗證了鎖序的兩種合法結果都正確處理（會員搭上退出的名額／會員被擋在滿額那一刻之後櫃檯才退成功），兩種情況下名額都沒有不見也沒有超賣
  - 全部 PASS，測試前後資料庫筆數（bookings/member_tickets/ticket_logs）完全一致
  - 另外完整跑過一次 `tests/*.js` 全部 484 支既有測試（`node tests/<檔名>.js` 逐支執行），**0 支失敗**——這次完全沒有改 `index.html`，純粹是確認回歸基準線沒有被動到。
- **還沒做、2d-3 才處理**：attendance 孤兒鍵清理（remove 會縮減名單，2d-3 把前端接上去時才會真的產生孤兒鍵，要處理）、`refundTicket` 效期校正段拆分成獨立輕量函式、前端 `_saveGroupMembers` 收尾段改呼叫這支 RPC。

### 2d-3 — 前端接線：`_saveGroupMembers` 改呼叫 `fn_group_save_members`（**測試環境已完成並驗證，正式網站還沒部署**）

**改動範圍（`index.html`）**
- `fn_group_save_members`（測試庫）補上 **attendance 孤兒鍵清理**（2d-1/2d-2 都還沒做這段）：用跟 JS `seatKeys()` 同一套名額鍵規則（`mid`／`mid#N`），在 RPC 內用最終 `member_ids` 重算合法鍵，過濾掉不在名單上的 attendance 項目，寫回同一個交易。已重新驗證 2d-1/2d-2 的既有測試不受影響。
- 新增 `refundTicketDateRevertOnly(ticket_id, booking_id)`（`refundTicket` 後半段抽出）：只做「效期退回未開通」那段系統範圍校正，不碰餘額與帳本（那兩件事已經由 RPC 做）。
- `_saveGroupMembers`（43830 起）：
  - **不動**：ticket_type_id 自癒、容量軟性預檢、prev/next multiset diff、「沒票預先擋」整批擋下、整段挑票 cascade（`grpPickOf`／`rebookSameDayTicket`／`_used` 集合／`listUsableTickets`／`findUsableTicket`）。
  - **改動**：挑到票之後不再同步呼叫 `deductTicket`，改成規劃進 `_plan`（含 `activateTicketIfNeeded` 算好的效期參數），`removed[]` 整包交給 RPC 的 `p_removes`（不再前端查 `grpNetDeductTicket`）。規劃完一次呼叫 `sb.rpc('fn_group_save_members', {p_booking_id,p_max_heads,p_ticket_type_fix,p_adds,p_removes})`，取代原本逐筆扣票/退票＋最後 `dbPut('bookings',b)` 整列覆蓋。
  - RPC 回傳的 `results` 按順序對齊回 `_plan`，決定 `_addFam`／`_addTk`／`_noTk`（後續「⚠ 有名額沒有加入」視窗與連續預約追問完全不用改，吃的資料形狀一樣）。
  - 退掉的票逐一呼叫 `refundTicketDateRevertOnly` 補效期校正（best-effort，失敗不影響名單本身）。
  - 失敗處理：RPC 層級失敗（`NOT_STAFF`／`NO_BOOKING`／`NOT_YOUR_BOOKING`／`NOT_GROUP`）跳 toast 直接返回，不再往下跑。

**測試結果**
- DB 層：`grpsave-2d1-test.js`／`grpsave-2d2-test.js`／新增 `grpsave-2d3-attendance-test.js`（真連線測試 attendance 孤兒鍵清理：退掉有 `leave`/`checked_in` 狀態的名額後，鍵跟著名額數重新對齊，不殘留孤兒鍵，也不誤刪還在名單上的人的狀態）全部 PASS，測試資料建立/清理筆數核對一致。
- JS 層：`node tests/syntaxtest.js` 綠。全量 `tests/*.js`（484支）最初因為這次改動跑出 9 支紅——**全部是測試斷言在比對「程式碼長什麼樣」的舊字面模式**（例如直接 regex 比對 `deductTicket(...)`／`b.seat_tickets=Object.assign(...)`／`next.splice(...)` 這些已經搬進 RPC 或改寫法的程式碼），不是業務邏輯壞掉：
  - `compseattest.js`／`grpnotktest.js`／`grprefundtest.js`／`grpseatduptest.js`／`seatrecordtest.js`／`seattest.js`／`seattktest.js`：改成比對新的程式碼位置/寫法（例如確認 `_saveGroupMembers` 真的呼叫了 `sb.rpc('fn_group_save_members'...)`、`_noTk` 從 RPC 回傳結果併入），原本驗的規則/不變量本身沒有改變說法，只是改成驗證它現在在哪裡生效。
  - `grpjointest.js`：1 處同類字面斷言更新，其餘 77 項（`grpSeriesOf`／`_grpFollowRun`／`gfPickDates` 等）完全沒受影響，因為那些函式沒有被這次改動碰到。
  - `grpaddflowtest.js`：這支會**實際執行** `_saveGroupMembers` 全流程（沙箱）。補上 `sb.rpc` 的模擬實作（沿用沙箱既有的 `deductTicket`／`refundTicket`／`grpNetDeductTicket` 替身決定扣/退，模擬把結果寫回沙箱的假 `bookings` 表），6 個情境（含連續預約開/關、上一步退回、重複扣票保護、票不夠擋下）全部 PASS。
  - 修完後重跑全量 484 支，**0 支失敗**。

**還沒做（記在第6節風險清單，2d-4 前要處理）**
- 正式庫版本核對（2d-4 的既定程序）。
- `refundTicket` 原函式本身沒有被拆（只是多了一支 `refundTicketDateRevertOnly` 做子集），兩支目前各自獨立維護同一段效期校正邏輯——上線前可以考慮讓 `refundTicket` 內部直接呼叫新函式做那一段，避免兩份複本漂移，但這不影響正確性，先記録。

---

## 3. 2d（團課名額並發保護）—— 詳細設計（2026-11-01 定案方向，2d-1 已完成並驗證）

### 3.0 問題與決定
團課（小班肌力）有兩條獨立寫入入口：

| 入口 | 位置 | 保護現況 |
|---|---|---|
| 會員自行報名 | `fn_member_join_group`（正式庫既有函式，`SELECT...FOR UPDATE` 鎖住那一堂） | ✅ 已經正確保護，不用改 |
| 櫃檯/教練調整名單 | 前端 `_saveGroupMembers()`，index.html 43830行起 | ❌ 完全沒有保護 |

使用者選**方向 B**（整段收進新 RPC、鎖住那一堂），但**不要全面重寫**，要分階段、可回滾。以下是設計內容，**只分析不動手，沒有改任何程式碼或資料庫**。

### 3.1 現況盤點：`_saveGroupMembers` 的所有操作與票券規則（index.html 43830–44016）

1. **ticket_type_id 自癒**（43835）：舊匯入團課沒有票種時，存檔時順手補上。
2. **容量檢查**（43841）：`next.length > gmax + grpLeaveSeats(b)` 就擋（請假不佔位）。
3. **multiset diff**（43846-43853）：用 `prev`（視窗打開時的快照 `window._grpBase`）vs `next`（畫面編輯後的名單）算出 `added[]`／`removed[]`（同一人可佔多個名額，算的是計數差，不是集合差）。
4. **沒票預先擋**（43859-43881）：對每個新增會員，用 `listUsableTickets` 加總可扣總堂數，不夠就整批擋下、純讀不寫，不在鎖的範圍內。
5. **逐名額扣票（add 路徑）**（43883-43964）：挑票 cascade 依序——櫃檯指定的票（`grpPickOf`，要重驗）→ 同日取消重約找回原票（`rebookSameDayTicket`）→ 這堂還沒用過的票裡第一張非待確認的（`listUsableTickets`，已按效期排序）→ `findUsableTicket`（允許撞同一張，標 `multi:true`）。`_used` 集合＝`seat_tickets` 既有值 ∪ `grpDeductedTickets(bid)`（帳本裡淨扣>0 的票，涵蓋會員自己報名那條不寫 `seat_tickets` 的名額——10/20 剛補的坑）。呼叫 `deductTicket(tk,bid,op,{multi})`：教練走 `fn_deduct_ticket`（SECURITY DEFINER，已有 `FOR UPDATE`＋冪等判斷），櫃檯以上走直接 `dbPut`（沒有鎖，這是要補的洞之一）。扣成功才寫 `seat_tickets[key]`、記 `_addFam`/`_addTk`（給後續「連續預約」沿用）。
6. **逐名額退票（remove 路徑）**（43965-43975）：`grpNetDeductTicket` 找這個人對這堂「淨扣>0」的票（多張挑最近扣的），呼叫 `refundTicket`（直接 `dbPut`＋寫 log，也沒鎖；內含系統範圍的「效期退回未開通」檢查 `tkHoldingBookings`）。
7. **組回 `member_ids`、清孤兒 attendance、一次性 `await dbPut('bookings',b)`**（43977-43987）：**這一行是遺失更新的病灶**——`b` 是函式開頭 `dbGet` 到的舊快照，這裡整列覆寫，不是局部欄位更新。
8. **後續 UX**（44000-44015）：沒扣到票的名額跳警示視窗、開著「重複預約」才問後續場次。不碰資料，設計不動它。

### 3.2 `fn_member_join_group` 現有鎖定方式（會員自行報名，已經是對的）
- `SELECT * FROM bookings WHERE id=$1 FOR UPDATE`：鎖住整堂的列鎖（跟 Stage1/2c 用的 `pg_advisory_xact_lock` 手法不同，但原理一樣——搶同一把鎖就會排隊）。
- 挑到的票也鎖：`SELECT mt.* FROM member_tickets ... FOR UPDATE`。
- 全部在同一支 PL/pgSQL 函式、同一個交易裡做完「查名額→挑票→扣票→寫名單→寫帳本」。
- ⚠ **這是新 RPC 的相容基準**：新 RPC 第一步也要 `SELECT ... FROM bookings WHERE id=$1 FOR UPDATE`，這樣會跟 `fn_member_join_group` 自然互斥（搶同一列鎖，Postgres 保證排隊），不需要另外設計跨函式協調。

### 3.3 為什麼不能只加鎖、業務邏輯留在前端
Supabase 的每一次 `sb.rpc()` 呼叫是獨立一個 request＝一個交易，鎖只在那支 RPC 執行期間存在。`_saveGroupMembers` 現在是一長串分開的 await（`dbGet`→`listUsableTickets`→`deductTicket`→…→`dbPut`，中間教練走 `fn_deduct_ticket`、櫃檯走 `dbPut`，是兩條不同路），沒辦法「先鎖、中間穿插好幾支各自獨立的呼叫、最後解鎖」——鎖在第一支呼叫 return 時就已經放掉。所以要真的防住競態，**最終寫入那一段必須收進同一支 RPC、同一個交易**，這點沒有更小的做法；能縮小的是「要搬多少業務邏輯進去」。

### 3.4 分階段最小修改方案
核心想法：**挑票 cascade（3.1 第4、5段）留在前端完全不動，只把「真的寫入」那一刻收進新 RPC**。前端把「這次要加哪些名額、各自扣哪張票／要退哪些名額」算好傳進去，RPC 在鎖的保護下**重新驗證一次**（防前端規劃完到送出這段時間被別人搶走）才真的寫——跟 `fn_deduct_ticket` 現在的模式（教練呼叫、RPC 內重新驗證身分與餘額）是同一套哲學。

**新 RPC：`fn_group_save_members(p_booking_id, p_max_heads, p_ticket_type_fix, p_adds jsonb, p_removes jsonb)`**
- `p_adds`：陣列，每筆 `{member_id, ticket_id, multi, start_date, expire_date, activated_at, note}`——對照現有 `deductTicket` 呼叫時已經算好的參數，原封不動傳進來。
- `p_removes`：陣列，每筆就是一個 `member_id`（可重複＝一人退多個名額），**不帶 ticket_id**——退哪張票讓 RPC 在鎖裡用 `grpNetDeductTicket` 同一套 SQL 查（比前端先查好再傳更安全：退第二個名額時要看到第一個名額退完後的最新狀態，現在 JS 版本本來就是逐一查逐一退，搬進 RPC 用迴圈一樣逐筆查即可）。

RPC 內部順序（一個交易）：
1. `SELECT * FROM bookings WHERE id=$1 FOR UPDATE`（跟 `fn_member_join_group` 互斥）。
2. `ticket_type_id IS NULL` 且帶了 `p_ticket_type_fix` 就先補上。
3. 逐筆處理 `p_removes`：查淨扣>0 的票（同 `grpNetDeductTicket`），`sessions_remaining+1`（視情況 `used_up→usable`），寫 `ticket_logs(refund)`，刪 `seat_tickets`/`member_ids` 裡這個人的最後一個名額鍵；查不到票就這筆算失敗（同現有「讀不到票留警示帳＋return false」）。
4. 逐筆處理 `p_adds`（重現 `fn_deduct_ticket` 的驗證，不是重新發明）：鎖票 `FOR UPDATE`、確認屬於該會員、`usable`、有餘額（或對這堂已淨扣過→冪等 `already:true`），通過才 `-1`、寫 `seat_tickets`/`member_ids`/`ticket_logs(deduct)`；沒通過算進失敗清單，不整批 rollback（同現有「其餘名額已正常加入」）。
5. 用最終 `member_ids` 過濾 `attendance` 孤兒鍵（搬 `attObj`/`seatKeys` 的判斷邏輯）。
6. 寫 `max_heads`，一次 `UPDATE bookings SET member_ids=...,seat_tickets=...,attendance=...,max_heads=...,ticket_type_id=... WHERE id=$1`。
7. 回傳 `{ok:true, failed:{noTicket:[...]}}`，前端照失敗清單重建原本「⚠ 有名額沒有加入」視窗（文字/按鈕不變，資料來源從 JS 迴圈的 `_noTk` 換成 RPC 回傳）。

**效期退回未開通**（`refundTicket` 裡 `tkHoldingBookings` 的系統範圍檢查）**不放進這支 RPC**：那是事後自癒的校正，不是金額/名額的正確性紅線，牽涉查詢同一張票在其他預約（含單人課）上的狀態，邏輯量不小。做法：RPC 回傳的 `removed` 票券清單，前端沿用今天 `refundTicket` 後半段（抽成新的輕量函式，只做日期校正，餘額與 log 已經由 RPC 做了）逐張補跑一次。跟 RPC 之間短暫不原子，最壞情況是效期校正慢一拍，不會超賣、不會重複扣、不會名額對不上帳。

### 3.5 分階段落地順序（各自可單獨測試、單獨回滾）

| 階段 | 內容 | 風險 | 狀態 |
|---|---|---|---|
| 2d-1 | 測試庫建 `fn_group_save_members`，先只做 add 路徑＋鎖＋重新驗證；remove 路徑暫時原封不動用舊的 `grpNetDeductTicket`+`refundTicket` | 低——不動 remove，先驗證鎖與重新驗證邏輯 | ✅ 已完成並驗證（見第2節） |
| 2d-2 | remove 路徑也收進同一支 RPC（3.4步驟3）；`refundTicket` 拆成「餘額+log（進RPC）」與「效期校正（留前端）」兩段 | 中——拆既有函式，不是重寫邏輯 | ✅ 已完成並驗證（見第2節）；`refundTicket` 的拆分還沒做，留給 2d-3 |
| 2d-3 | 前端 `_saveGroupMembers` 收尾段（43942-43987）改呼叫新 RPC，移除逐筆 `deductTicket`/`refundTicket` 呼叫；前面挑票 cascade 與「沒票預先擋」完全不動 | 中——這段歷史事故最多（一串 2026-08~10 註解），每階段都要 `tests/grp*.js` 全綠 | ✅ 已完成並驗證（見第2節，含 attendance 孤兒鍵清理） |
| 2d-4 | 正式庫部署＋跟正式庫當下定義核對（比照 2c 既有程序） | 跟 2b/2c 上線前檢查清單一起走 | 未開始 |

每階段都用 `CREATE OR REPLACE FUNCTION` 可單獨換回舊版；2d-3 前端改動用 git diff 單獨 revert。

### 3.6 正確性要求對照

| 要求 | 怎麼保證 |
|---|---|
| 不得超額 | `FOR UPDATE` 鎖住整堂，容量在鎖裡用當下真實 `member_ids`/`attendance` 重算，不是前端舊快照 |
| 不得遺失更新 | 不再用「整份新名單覆蓋舊名單」，改成「加/退哪幾個名額」的差量操作，對這次操作範圍外的名額（例如會員剛自己報名那格）完全不碰 |
| 不得重複扣票 | add 路徑沿用 `fn_deduct_ticket` 同款冪等判斷（這堂這張票淨扣>0 就不再扣） |
| 不得錯誤退票 | remove 路徑的「退哪張票」改在鎖裡即時查，不是前端算好再傳可能過期的 ticket_id |

### 3.7 需要修改/新增的物件清單

**新增（測試庫先做）**
- Postgres 函式 `fn_group_save_members`（SECURITY DEFINER，仿 `fn_deduct_ticket`／`fn_member_join_group` 簽名風格）
- JS `refundTicketDateRevertOnly(ticket_id, booking_id)`（從 `refundTicket` 後半段抽出，23333-23378一帶）

**要改**
- `index.html` `_saveGroupMembers`（43830-43987，只動 43942起的扣票/退票/寫回；43830-43941 的自癒/容量檢查/diff/沒票預先擋/挑票 cascade 全不動）
- `index.html` `refundTicket`（拆兩段，呼叫端跟著改）

**不動（已確認相容或不在範圍）**
- `fn_member_join_group`、`fn_deduct_ticket`、`space_check`、2b/2c 的函式
- `openGroupMembers`、`grpFollowAsk`、`grpBackToCard` 等視窗/流程函式

**前端呼叫點**：`_saveGroupMembers`（43830）唯一呼叫點；`saveGroupMembers`(43800)／`grpFollowOnce`(43823) 只是包一層防連點，不用改。

**測試案例**
- 既有全部要過：`tests/grp*.js`（約21支：grpaddflowtest／grpalloctest／grpcanceltest／grpdeltest／grpdupseattest／grpjointest／grpleavepaidtest／grpmaxtest／grpnoseedtest／grpnotktest／grpprepvenuetest／grprefundtest／grprepofftest／grpseatduptest／grpseatfamtest／grpseattest／grpseriestest／grpsharedfollowtest／grpsorttest／grptrialtest／grpweektest）、`eatgrpsharetest.js`、`memgrpchecktest.js`、`memgrpviewtest.js`、`tlnogrp0911test.js`
- 新增（比照 Stage1/2c 真連線並發測試，沿用 `/Users/tungyeh/Projects/yugym-race-test/`）：
  1. 兩個櫃檯同時搶同一堂最後一個名額，只成功1筆
  2. 櫃檯存名單的同時，會員透過 `fn_member_join_group` 報名同一堂，兩邊都要保留
  3. 同一會員同時被加+退（net 0），不多扣不少扣
  4. 故意觸發 `lock_timeout`，確認乾淨返回不留殘局
  5. 既有「沒票擋下」「扣不到票警示」改用 RPC 回傳的 failed 清單重建，畫面文字不變

**下一步**：等使用者看過第7節的任務進度表、確認後才開始 2d-1。

---

## 4. 已修改的程式檔案、SQL Migration、測試檔案、Git 分支狀態

### Git（`/Users/tungyeh/Projects/yugym-booking-system-app`，目前在 `master` 分支）

```
已提交並部署（commit aecf37b，正式網站已是這個版本，v261031.2221）：
  - index.html：行事曆週檢視全表掃描優化（admCalMultiHTML 的 byDate 分組）

尚未 commit 的本機修改（working tree，屬於 2b 前端工作，測試庫已驗證但正式庫/前端都還沒上）：
  M index.html            — 2b idempotency key 前端串接（5處新增，見第2節）
  M tests/recurtimetest.js — 配合 createBookingViaRpc 新增參數，更新一條過時的正則斷言
  M CLAUDE.md              — ⚠ 不是這次工作產生的，對話開始前就存在的本機未提交修改，與本專案無關，不要動它

這次對話建立的文件（未提交）：
  ?? YUGYM_HANDOFF.md                      — 本檔
  ?? YUGYM_HEALTH_CHECK.md                 — 更早的全面健檢報告（安全/RLS/並發，Stage 1之前做的）
  ?? YUGYM_BOOKING_RACE_FIX_STAGE1.md      — Stage 1 完整 SQL/測試/回滾存檔
  ?? YUGYM_BOOKING_RACE_FIX_PROD_CHECKLIST.md — 正式上線前必須處理的項目（目前只有2b的2項）

殘留分支（已完成階段性任務，可留可刪，不影響任何東西）：
  preview-calweek-fix-20261101（本機與 origin 都有）— 行事曆修復上線前給 Mango 用的 preview 分支
```

### 測試庫（`kucvxpjatptfckhlxptj`）目前的函式/結構狀態

| 物件 | 狀態 |
|---|---|
| `space_check()` | Stage 1 版本（含鎖＋lock_timeout） |
| `fn_create_booking()` | Stage 1 + 2b 版本（含鎖＋idempotency key＋`p_ticket_id` 相容性shim） |
| `bookings.idempotency_key` | 已新增欄位＋ partial unique index |
| `fn_member_self_book()` / `fn_member_self_venue()` | 2c 版本（含 venue_unit 鎖） |
| `fn_biz_hours()` / `desk_alert()` | 2c 前置補齊（從正式庫唯讀複製，未修改） |
| `bookings.sibling_of` | 2c 前置新增欄位 |
| `venues` 表 | 補了1筆合成資料（`treadmill`，capacity=2） |
| `fn_member_join_group()` / `fn_deduct_ticket()` | 2d-1 前置補齊——從正式庫唯讀複製，**完全沒有修改**（含 grant execute to authenticated） |
| `bookings.max_heads` / `bookings.seat_tickets` | 2d-1 前置新增欄位（int／jsonb，比照正式庫型別，可空無預設，沒有補資料，既有 57 筆維持 NULL） |
| `fn_group_save_members()` | 2d-1 新建，**只有 add 路徑**（見第2節），remove 路徑 2d-2 才做 |

### 本機測試腳本（獨立資料夾，不在 git 專案裡）
`/Users/tungyeh/Projects/yugym-race-test/`——裡面有 `.env.local`（測試庫連線密碼，已 gitignore）、`ca-cert.crt`（Supabase 官方CA）、以及各階段的並發測試腳本（`lock-check.js`、`race-booking-test.js`、`lock-mechanism-proof.js`、`idempotency-test.js`、`selftrain-venue-test*.js`、**`grpsave-2d1-test.js`（2d-1 新增）** 等）。下次要重跑測試可以直接複用這個資料夾，連線設定都已經就緒。

---

## 5. 正式上線前檢查清單與回滾方式

完整內容在 `YUGYM_BOOKING_RACE_FIX_PROD_CHECKLIST.md`，這裡列重點：

- **⚠ Stage 1 上線前（2026-11-01 新增，優先序最高）**：確認是真的要部署（還沒做過，見第2.5節），`CREATE OR REPLACE FUNCTION public.space_check(...)` 直接貼測試庫驗證過的版本即可，正式庫現在的版本是完全原始、沒鎖的版本，貼的時候留好原始版本文字（已經在這份文件第2.5節記錄過原文）當回滾依據。
- **2b 上線前**：前端要補「修改預約內容要換新 idempotency key」的邏輯；後端內容比對要加入 `ticket_id`，並針對正式庫真正的 `benefit_consume_ticket` 路徑重測一次。
- **2c 上線前**：直接搬這次測試庫驗證過的 SQL 到正式庫前，要先重新核對正式庫當下的 `fn_member_self_book`/`fn_member_self_venue` 實際定義（2026-11-01 稽核已重新取得正式庫這兩支的完整原文並記錄在第2.5節，可以拿來跟測試庫版本比對，確認貼過去前沒有新的落差）。
- **2d-4 上線前**：`fn_group_save_members` 是全新函式，正式庫完全沒有同名物件，純新增不影響既有呼叫端；但必須先於前端 `_saveGroupMembers`／`refundTicketDateRevertOnly` 部署（順序不能反，否則前端會呼叫到不存在的 RPC）。
- **回滾**：Stage1/2b/2c 每一項都有單獨存檔的「原始版本」SQL（Stage1 原始版本已在第2.5節記錄；2b/2c 見本次對話紀錄），`CREATE OR REPLACE FUNCTION` 換回去即可個別回滾，互不影響。2d-4 回滾只需 `DROP FUNCTION fn_group_save_members`（純新增，刪掉不影響其他函式）＋前端 revert 對應的 git diff。

---

## 6. 目前尚未解決的風險、待確認事項

1. ~~Stage 1 的 `space_check` 加鎖從未部署到正式庫~~ ✅ **已於 2026-11-01 部署並核對完成（見第2.5節）**。自主訓練場地/時段（2c負責）仍待部署，風險仍在。
2. **2d-1、2d-2、2d-3 已完成並驗證（見第2節），只剩 2d-4（正式庫部署）**——下一步等使用者確認後開始。
3. `refundTicket`（原函式）與新的 `refundTicketDateRevertOnly` 目前各自維護一份幾乎相同的「效期退回未開通」校正邏輯，有兩份複本漂移的風險——2d-4 上線前可以考慮讓 `refundTicket` 內部改呼叫新函式，非阻斷項目，先記錄。
4. 2b 的 2 項上線前風險（內容比對缺 ticket_id、視窗內修改內容沒換新key）尚未修。**另外：2b 上線時 `fn_create_booking` 要在「已經部署 Stage1 鎖」的 `space_check` 之上疊加 idempotency key，不是從原始無鎖版本疊加**。
5. 2c 搬到正式庫前的版本核對：2026-11-01 已重新取得正式庫 `fn_member_self_book`/`fn_member_self_venue` 完整原文（記在第2.5節），確認跟上次複製時一致，可以直接貼測試庫版本，不是新的落差。
6. 2b／2d-3 的前端修改（index.html / tests/\*.js）還**沒有 commit**，只存在本機工作目錄，重開機或切分支要小心別搞丟。
7. 測試庫 `desk_alert` 因為 `recipient_type` 枚舉缺 `'desk'` 值，會靜默不寫入通知（不影響預約本身），正式庫沒有這個問題，暫不處理。

---

## 7. 下一次對話應該怎麼開始

1. 先讀這份文件＋`YUGYM_BOOKING_RACE_FIX_PROD_CHECKLIST.md`，**不要重新研究 Stage1（已部署）/2a/2b/2c/2d-1/2d-2/2d-3 已經驗證過的內容，也不要重新分析 2d 的設計（第3節已定案）**。
2. 第一件事：跟使用者確認要不要開始 2d-4（正式庫部署：把 `fn_group_save_members`、`index.html` 的 `_saveGroupMembers`／`refundTicketDateRevertOnly` 改動、`tests/*.js` 的斷言更新一起推到正式庫/正式網站），是否有要調整的地方。
3. 確認後照 2d-4 的既定程序：先跟正式庫當下的 `bookings` 欄位與既有函式（`fn_member_join_group`等）重新核對一次（測試庫是這次對話期間逐步建的，期間正式庫若有變更要重新比對），一樣遵守「先問再動、最小修改、可獨立回滾」的既有原則；動到畫面的部分記得先給預覽連結。
4. 2d 全部完成後，記得：把 2b/2c 的「正式上線前檢查清單」項目處理掉，才能真正把 2b/2c 部署到正式庫——Stage1 已經部署，但 2b/2c 這兩項到目前為止都只在測試庫驗證過，正式庫完全沒有變更過（2b 要注意是疊在「已有鎖」的 `space_check` 之上，見第6節第4項）。

---

## 8. 員工列表背景色/排序/人數統計沒跟著職務生效日期走（2026-11-01 已修復，與 2d 無關）

**狀態：✅ 2026-11-01 已推送 `origin/master` 並正式上線。**

### 後續兩筆追加修正（都已上線，與 2b/2c/2d 完全無關、沒有混在一起推）

**8a. 翻月顯示修正**（commit `8131848`＋`41db1bf`版本號，2026-11-01）：`stEtNow(c)`之前不管翻到哪個月都只吃「今天」的身分，導致瀏覽10月畫面時SANDY/MANGO的職務也跟著變成11月的新職務。改成 `stEtNow(c,ym)`，4個純顯示呼叫點改傳翻月選到的`_ym`；3個編輯/比對用途的呼叫點維持吃今天；`stPickOpen`加防呆擋歷史月份編輯。

**8b. 黃美蓉1-9月職務顯示**（commit `82c51a7`＋`cc192cf`版本號，2026-11-02，**正式上線**）：她的`pay_rules`完全沒有1-9月快照，原本會回退顯示「現在（合作）」。查出 `calcSalary` 直接用 `employment_type` 分支（不只讀費率數字），所以**沒有補pay_rules快照**，改成純前端、跟薪資計算完全分離的 `ET_DISPLAY_HISTORY_FALLBACK` 備援表（`stEtNow`內，只在`empAtMonth`真的找不到任何快照時才查）。**Supabase／`pay_rules`／`calcSalary`／`empPayConfig`完全沒有被改動**，薪資計算路徑一行都沒變。

- **部署確認**：`https://tyehyu.github.io/yugym-booking-system-app/` HTTP 200，`APP_VERSION='261102.0045'`，頁面含`ET_DISPLAY_HISTORY_FALLBACK`。
- **驗證結果**（本機模擬`stEtNow`跑過兩人2026-01~11全部月份）：黃美蓉 1-4月兼職、5-10月正職、11月合作；黃沛瀞各月維持不變（7-9月合作、11月兼職，她原本就有正確快照，不受影響）。
- **測試**：`syntaxtest.js`綠；薪資相關4支測試（`hrsalaryformtest`／`salarypartstest`／`salarytabtest`／`salarytaptest`）全綠；`stemptypetest.js`／`stlisttest.js`2處因函式結構變化過時的字面斷言已更新，全綠。
- ⚠ 踩過一次坑：版本號用殼層`date`指令算出來的是CET時區（差7小時），已改用`TZ=Asia/Taipei date`取得正確時間，之後bump版本號要記得指定時區。
- 存活檢查：`https://tyehyu.github.io/yugym-booking-system-app/` HTTP 200，頁面 `APP_VERSION='261101.0923'`，與推送版本一致。
- 正式庫資料核對：黃沛瀞 `pay_rules['2026-11'].employment_type='part_time'`（10月無覆寫，正確退回原職務，沒有往回污染）；黃美蓉 `pay_rules['2026-10'].employment_type='full_time'`（原樣保留）、`['2026-11']='contractor'`（新值）——兩個月份互不影響。
- 背景色／深色文字／排序／上方人數統計全部吃同一支 `stEtNow(c)`，結構上保證彼此一致，不會各自讀到不同值。

### 獨立部署準備（2026-11-01）

**怎麼做到跟 Stage1~2d-3 完全隔離**：本機 `index.html` 同時混著這次修正跟 2b/2d-3 的未完成改動（都還沒 commit）。做法是用 `git hash-object`／`git update-index --cacheinfo` 直接組一份「HEAD＋只有這次4處修正」的內容去 commit，全程**沒有對工作目錄的 `index.html` 執行任何寫入或 checkout**——用 `diff` 核對過，commit 前後工作目錄那個檔案逐位元組沒變，Stage1~2d-3 的修改一行都沒少。

**3 筆 commit（由舊到新）**：
1. `e14d0dd` — 員工列表 4 處修正本身（`_etRank`／`secs`分組／`etc`／`_etInk` 改用 `stEtNow(c)`）
2. `1c82dd5` — 補版本號（`APP_VERSION`/`APP_VERSION_LABEL` → `261101.0923`，用 `date` 指令取得的真實時間，不是推算；CLAUDE.md 規定每次改 index.html 都要帶）
3. `26d2cc4` — 對應的測試斷言更新（`tests/stemptypetest.js` 1 處字面比對）

**部署前檢查結果**：
- 語法檢查：對 commit 後的 HEAD 內容單獨抽出來跑過 `<script>` 區塊解析，3 塊全過。
- 既有測試：484 支裡唯一跟這次改動相關的 `tests/stemptypetest.js` 已經更新並在**同一份工作目錄檔案**上驗證過全線綠（因為員工列表那段程式碼在工作目錄版本跟這次 commit 版本是逐位元組相同的兩段，已用 `diff` 核對沒有差異，所以等同已經驗證過 commit 版本）。
- 歷史月份/其他引用點：`normEmp(c.employment_type||c.pay_type)` 其餘十幾處呼叫點（薪資頁、員工編輯表單下拉選單等）這次 commit 完全沒有觸碰，`git diff` 確認只改了預期的 4 行。

**部署方式**：`git push`（推上 `origin/master`）＝直接上線 GitHub Pages，1-2 分鐘生效，不需要任何 Supabase migration（純前端渲染邏輯，沒有資料庫改動）。

**回滾方式**：
- 推送前（目前狀態）：本機還沒推送，要撤銷的話 `git reset --hard aecf37b`（但目前沒有必要，三筆都已驗證過）。
- 推送後若要回滾：`git revert 26d2cc4 1c82dd5 e14d0dd`（依序，或一次指定範圍 `git revert e14d0dd^..26d2cc4`）建新的回滾 commit 再推送——不用 force push、不會動到之後若接著推送的 2b/2d-3 commit 歷史。

**風險**：低。純前端渲染邏輯（4 行＋1個版本常數），沒有資料庫 migration、沒有改動資料讀寫路徑，不影響薪資/班表/員工資料庫任何既有邏輯。

### 使用者回報
2026/11/01 起，黃沛瀞（SANDY）改兼職、黃美蓉（MANGO）改合作，員工列表的「職務」標籤文字已經正確顯示新職務，但整列背景色（色條／淡底）還停在舊職務的顏色。

### 根因（已確認，純讀程式碼，沒有連資料庫查這兩人的實際資料）
`index.html` 管理員「員工列表」的 `stRow` 渲染函式裡，**同一列用了兩套不同的職務判斷依據**：

| 用途 | 位置（行號） | 讀的欄位 |
|---|---|---|
| 「職務」pill 文字（使用者看到「已經更新」的那個） | 52664 `stPill(c.id,'et','職務',PAY_LABEL[_et]...)`，`_et=stEtNow(c)` | `stEtNow(c)` → `empAtMonth(c, stCurYm())` → 吃 `pay_rules[本月]` 月份快照，**生效日期感知** |
| 排序順序 | 52461-52462 `_etRank` | `normEmp(c.employment_type\|\|c.pay_type)` → 資料列上的**即時欄位，不感知生效日期** |
| 分區／人數統計（上方正職/兼職/合作/支援） | 52564 `secs` 分組 key | 同上，即時欄位 |
| 整列背景色／色條（`--pc`） | 52573 `etc` | 同上，即時欄位 |
| 文字深色版 | 52620 `_etInk` | 同上，即時欄位 |

`empAtMonth`／`stEtNow` 是系統既有、算薪資等多處都在用的「月份生效快照」機制（`empRuleAt` 取「不晚於這個月」的最後一份 `pay_rules` 快照），本身沒有問題。問題是 2026-10-28 那次改版把「職務」欄位本身換成吃 `stEtNow()`（正確），但同一列的**顏色、排序、分區統計這四處忘了跟著換**，還留在舊的「直接讀資料列欄位」寫法——這是遺漏，不是時間差/cron 延遲造成的。

另外發現 `typeLabel`／`const tl=typeLabel(c)`（52414、52572）現在整段是**死碼**（算出來沒有被用在任何輸出的 HTML 裡），應該是 10-28 改版把顯示換成 pill 後忘了拔掉的殘留——不影響正確性，先記錄，不在這次修。

### 回答使用者的 5 點檢查
1. 職務標籤與背景色是否用不同資料來源/判斷邏輯？——**是**，標籤用 `stEtNow(c)`，背景色/排序/統計用 `c.employment_type` 原始欄位。
2. 是否該用「依所選月份及生效日期計算的有效類型」而不是原始類型？——**是**，應該統一全部改用 `stEtNow(c)`。
3. 10/31 與 11/01 的職務切換是否正確？——`empAtMonth` 本身的月份快照機制是既有、經過驗證的（薪資計算也靠它），只要 `pay_rules['2026-11']` 確實有寫入新職務，`stEtNow()` 在 11/01 當天就會自動切過去，這段邏輯沒有問題，問題只在前面列的四個地方沒有呼叫它。
4. 上方人數統計是否也有問題？——**是**，`secs` 分組（進而影響「正職 N／兼職 N／合作 N／支援 N」的計數文字）用的是同一個有問題的即時欄位，同樣的病根。
5. 不修改既有員工歷史資料、薪資、抽成或班表——**這是純前端渲染的讀取欄位問題，沒有牽涉任何資料表寫入**，修法不會動到 `pay_rules`、薪資、抽成或班表本身的任何資料。

### 最小修正方案（尚未動手，等確認）
把以下 4 行的 `normEmp(c.employment_type||c.pay_type)` 改成 `stEtNow(c)`（`stEtNow` 內部已經做過 `normEmp`，不用再包一層）：
- `index.html:52462`（`_etRank`，排序）
- `index.html:52564`（`secs` 分組 key，影響分區與人數統計）
- `index.html:52573`（`etc`，整列背景色/色條）
- `index.html:52620`（`_etInk`，深色文字版）

四行都在同一個 `openEmployeesList`（或其所屬頁面函式）的 `stRow`/排序 closure 裡，`stEtNow` 已經是同一個作用域可見的既有函式，不需要新增任何函式、不改資料結構、不碰 `pay_rules`。改完要在測試環境核對：① 黃沛瀞／黃美蓉兩人 11/1 之後背景色與排序正確跟著新職務；② 隨便挑一個「還沒到生效日」或「過去月份」的人，確認沒有被這次修改波及（他們本來就該維持原樣，因為 `stEtNow()` 一直都是用「今天的月份」算，跟職務 pill 顯示的邏輯完全一致）；③ 上方正職/兼職/合作/支援統計數字變動後跟畫面實際分區列數一致。

### 實作（2026-11-01，使用者確認後動手，與 2d 系列分開）
把 4 行 `normEmp(c.employment_type||c.pay_type)` 改成 `stEtNow(c)`：
- `_etRank`（排序，約52465行）
- `secs` 分組 key（上方正職/兼職/合作/支援人數統計，約52570行）
- `etc`（整列背景色/色條，約52581行）
- `_etInk`（深色文字版，約52629行）

沒有動到的（確認過仍在、不在這次範圍）：`typeLabel`/`tl`（52418行，死碼，10-28改版殘留，算出來沒被用在任何輸出，這次不動）；50524／51739／52443／52478／52861起等其餘十幾處 `normEmp(c.employment_type||c.pay_type)`——那些是篩選、人資/薪資頁、員工編輯表單下拉選單，不在這次「員工列表」範圍內，沒有動。`pay_rules`、薪資、抽成、班表完全沒碰。

### 根因再確認（用正式庫真實兩筆資料核對，唯讀 SELECT，沒有寫入）
- **黃沛瀞（SANDY）**：`employment_type` 原始欄位＝`contractor`（舊值，從 7-10 月快照一路都是），`pay_rules['2026-11'].employment_type`＝`part_time`（新排程）。11/1 當天這兩個值不一致——**這就是會實際看到背景色沒跟著職務切過去的那一筆**。
- **黃美蓉（MANGO）**：`employment_type` 原始欄位剛好也已經是 `contractor`，與 `pay_rules['2026-11']` 的新值一致（10月快照是 `full_time`，但原始欄位本來就跟 10 月不一樣——原始欄位從來不是「當月正確值」，只是這次剛好 11 月巧合對上）。換句話說 MANGO 這筆**今天看背景色可能剛好是對的**，但那是巧合，不是因為程式邏輯正確；程式邏輯的缺陷兩人都有，只是 SANDY 的原始欄位剛好還停在更久以前、恰好露出破綻。
- 兩人的驗證都確認：`stEtNow(c)`／`empAtMonth` 這套「不晚於這個月的最後一份快照」機制本身沒問題（算薪資也在用、有既有測試 `stemptypetest.js` 覆蓋月份生效的切換），純粹是員工列表這 4 個地方忘了呼叫它。

### 測試結果
- `tests/syntaxtest.js` 綠。
- 全量 `tests/*.js`（484支）跑完只有 `tests/stemptypetest.js` 1 支因為字面比對舊程式碼而紅，已更新該斷言比對 `stEtNow(c)`，重跑全線。
- 最終：改動範圍內全部測試綠，沒有動到的其他引用點（薪資/班表/員工編輯表單）逐一確認仍是原字串，沒有被誤改。

**這次修復與 2d 系列完全分開處理，沒有混進 2d-3 的 commit/驗證批次。**

---

## 9. 自訂方案 1V2 訓練紀錄——唯讀排查結論：功能已經做好了，不是缺功能（2026-11-01）

### 使用者的報告
自訂方案購票時沒有 1V1/1V2 選項，導致雙人課程教練只能記錄一位會員的訓練課表；要求可設定1V1/1V2、兩人共用一張票各扣1堂、各自獨立訓練紀錄、同堂可查看編輯兩人、不影響既有一般1V2、沿用既有雙人訓練紀錄機制別重複開發、也要能補救已購買的舊自訂方案。

### 排查結果：整條鏈已經在 2026-09-22～09-26 分三次做完，程式碼裡都找得到日期與原因
逐一對照使用者的 6 點規則，全部已經是現況：

| 規則 | 現況（程式位置） |
|---|---|
| 1. 自訂方案可設1V1/1V2 | `index.html:60835-60845`（`#gt-c-fmt-row`）——自訂銷售選「教練課」或「友善教練課」時會出現「授課類型」選單（不指定/1V1/1V2），寫進 `member_tickets.format`。只對這兩種票種顯示（`_CUSTOM_TT`／`grantCustomFmtRow`，60779/61391） |
| 2-3. 1V2共用一張票、每次扣1堂 | 本來就是現有1V2票券的通用規則（票是堂數池，跟是不是「自訂」無關），自訂方案沒有另外一套扣法 |
| 4. 兩人各自獨立訓練紀錄 | `training_logs.slot`（1或2）＋`openTrainingLog`/`renderTrainingLogSheet`（71345-71920一帶）：讀/寫都用 `_slotOf(l)===_slot` 過濾，今日備註 `bookings.training_note` 也按slot分開存 |
| 5. 教練同堂可查看編輯兩人 | 同一個抽屜用頁籤切換 `tlSetSlot(1/2)`，不用離開這堂課 |
| 6. 不影響既有一般1V1/1V2 | 全部走同一套 `format==='1V2'` 判斷，自訂方案跟「友善優惠1V2」「主顧客1V2」這類固定商品完全同一條路，沒有另開分支 |
| 7.（舊方案補救） | `index.html:63646-63665`（`tkPtSave`）：在票券卡點「設定同行」指定第二位會員時，若該票 `format` 原本是空白會**自動補成 `'1V2'`**（只補空白，不覆蓋已標過1V1的）。「設定同行」按鈕的顯示條件 `_isV2=(format==='1V2'||format==='')`（47225行一帶，2026-09-26修正），**空白格式的舊票也看得到這顆按鈕**——所以 40 張正式庫既有的空白格式「自訂方案」票，直接在會員資料頁點「設定同行」指定第二位會員，就會自動補標 1V2，不需要任何程式改動或 migration |

### 結論
**這個功能不是缺，是已經做完的。** 沒有另外開發任何程式碼（完全沒改任何檔案，純讀程式碼核對）。可能的落差只有兩種，都不是程式問題：
1. 使用者測試時用的頁面是舊版快取，沒看到 09/22~09/26 這幾次修正後的畫面。
2. 真的有具體操作踩到問題（例如：選了「教練課」票種但看不到授課類型選單、設定同行後課表還是只有一份、舊票點了設定同行但沒有自動變1V2……），但目前唯讀排查沒有找到任何程式邏輯缺陷能解釋這類症狀。

**建議**：請在正式網站實際操作一次「自訂方案→選教練課→選1V2→建立訓練紀錄」跟「既有空白格式舊票→設定同行」這兩條路，如果有任何一步卡住，請告訴我卡在哪一步、看到什麼畫面/訊息，我才能針對真正的落差（如果有）動手，而不是重造一套已經存在的機制。

**修改檔案**：無。**測試結果**：N/A（純讀）。**是否需要正式庫migration**：否。**正式上線風險**：無（沒有改動）。

### 2026-11-01 二次確認：正式網站已經包含這套功能（唯讀核對 git 歷史，沒有改動）

**1. 正式版本是否已含 09/22~09/26 功能？是。**
- `git log` 確認四筆相關commit都在：`f98afed`（09/22 修正1V2課表看不到會員A/B）、`802cf13`（09/24 1V2同行會員）、`b0cfabe`（09/26 1V2同行會員：教練能設定，資料庫走專用函式）、`20c60a0`（09/26 1V2會員端：兩位都看得到對方的訓練紀錄）。
- `git merge-base --is-ancestor <commit> HEAD` 對這四筆都回傳是祖先，且 `git status --branch` 顯示本機 `master` 與 `origin/master` **沒有分叉**（HEAD 就是最新一次推送 `aecf37b`）——這四筆都已經在正式網站上，不是只存在本機或某個分支。

**2-3. 完整流程（購票→指定同行者→建課表→扣票）唯讀核對結果：**
- 購票：自訂銷售選「教練課」或「友善教練課」才會出現「授課類型」選單（1V1/1V2），寫進 `member_tickets.format`。
- 指定同行者：會員資料頁票券卡「設定同行」→`openTicketPartner`→`tkPtSave`→走 `fn_ticket_set_partner` RPC 寫入 `member_tickets.partners`（這一位→同行人的對應表），空白format的票會順便補標1V2。
- 建課表：`openTrainingLog` 讀票的 `format`（優先吃票券而非預約本身的format，09/22那筆修的就是這個），`1V2`才會有兩個頁籤（`_tlSlot` 1/2），`training_logs.slot` 分開存、`bookings.training_note` 也分slot存，兩邊互不污染。
- 扣票：1V2 完全沒有自己的一套扣票邏輯——走的是跟 1V1 完全一樣的單筆預約扣票路徑（`deductTicket`／`fn_deduct_ticket`），扣的是那一張**共用票**的 `sessions_remaining`，不因為是1V2就扣兩次。這是「沿用現有機制、沒有另外開發」的直接證據：1V2 從頭到尾只加了「第二位是誰、課表存哪個slot」這一層，完全沒碰扣票本身。

**4. 員工列表顏色修正是否已部署正式網站？否——還在本機，待上線。**
`git status` 顯示只有 `CLAUDE.md`（跟本案無關的既有本機修改）與 `index.html` 是未提交狀態，`index.html` 的未提交內容包含：員工列表顏色修正（第8節）、2b idempotency前端改動、2d-3 `_saveGroupMembers`/`refundTicketDateRevertOnly` 改動。這些全部**還沒 commit、沒有 push、沒有上正式網站**。

**結論：自訂方案1V2這套功能本身不需要任何修正，正式網站已經是完整版本。目前真正待上線的是：Stage1（資料庫，等權限確認）、員工列表顏色修正（前端）、2b/2d-3（前端+資料庫，仍在測試庫驗證階段，見第2/3節）——這些都還沒有互相污染或遺失。**

## 10. 2026-11-02 Stage 2b 測試庫Migration演練（已完成，正式庫完全未修改）

### 已完成工作
1. 設計並審查Stage 2b完整migration草案（`bookings.idempotency_key`欄位+唯一索引、`benefit_consume_ticket`、12參數`fn_create_booking`），以**正式庫現有邏輯**為底（含`created_by`/`v_actor`、`ticket_type_id`回填、`benefit_consume_ticket`分支），只新增idempotency比對區塊與ticket_id比對，沒有丟失任何既有功能。
2. 用獨立探測函式（`_pgrst_probe`，測試後已清除）在真實PostgREST上實測證實：**正式庫migration必須在同一交易內DROP舊版+CREATE新版**，不能新增並存——新增並存會讓舊版參數呼叫觸發`PGRST203`（無法判斷呼叫哪個函式），即使明確`NOTIFY pgrst, 'reload schema'`也一樣，不是cache過期的暫時現象。
3. 在測試庫 `kucvxpjatptfckhlxptj` 完整演練兩階段：
   - **Phase 1**（`rehearsal_phase1_mirror_prod_old_state_v2`）：把測試庫原本型別相同的11參數版本，內容換成正式庫migration前的逐字原文（先DROP再CREATE，因為`CREATE OR REPLACE`不能改參數名稱`p_idempotency_key`→`p_ticket_id`，會報`42P13`）；清除無比對價值的10參數舊版。
   - **Phase 2**（`rehearsal_phase2_drop_old_create_final_12param`）：DROP該11參數版本＋`CREATE OR REPLACE`最終12參數版本（新增idempotency比對、ticket_id比對，保留全部既有邏輯）。12參數版本因為參數名稱沒變，用`CREATE OR REPLACE`原地更新，不需要DROP，既有ACL不受影響。
4. 兩次migration皆執行成功。執行後確認：`fn_create_booking`測試庫現在**只剩一個12參數版本**，owner=`postgres`、`SECURITY DEFINER=true`、`search_path=public, pg_temp`、`anon`/`authenticated`/`service_role`的EXECUTE權限皆為`true`，與migration前完全一致。

### 已確認的安全事項
- `DROP`前已用`pg_depend`查證兩個資料庫（測試庫、正式庫）：舊版`fn_create_booking`**零依賴物件**，不需要`CASCADE`。
- `benefit_consume_ticket`正式庫本來就有、`SECURITY DEFINER`、權限鎖死只有`service_role`能直接呼叫——這次migration**不需要新建或修改它**，正式庫migration草案裡也沒有包含這支。（⚠️但測試庫目前這支的權限比正式庫寬，`anon`/`authenticated`都能直接呼叫，是既有落差，這輪沒有修正，見下方剩餘風險。）
- `public` schema的`CREATE`權限：測試庫與正式庫`anon`/`authenticated`皆為`false`，SECURITY DEFINER函式的`search_path`沒有被劫持風險。
- `anon`能執行`fn_create_booking`是正式庫既有基準狀態（不是這次造成的），新舊前端相容性只依賴`authenticated`角色，跟`anon`無關。
- Rollback SQL已備妥且逐字保存（Phase1的11參數原文、Phase2前的12參數舊內容、正式庫原始11參數定義），不是摘要。

### 尚未執行的功能測試（下次從這裡繼續）
1. 真實PostgREST呼叫：11-key（舊版形狀，不含idempotency_key）與12-key（新版形狀）呼叫`fn_create_booking`本身是否都成功、確認無`PGRST203`。
2. **真並發**（兩條連線`Promise.all`同時送出，不是依序重送）同一個`idempotency_key`＋**真實ticket_id**，確認只建立一筆預約、只扣一次票（既有`ticket-consume-test.js`的重送測試是依序送出，不是真並發，這項還沒測過）。
3. 同key、不同ticket_id→確認回`IDEMPOTENCY.CONFLICT`；扣券失敗（餘額不足/過期/分期未解鎖/非持有人未分享）→確認booking與扣票紀錄完整回滾。
4. 重跑`/Users/tungyeh/Projects/yugym-race-test/ticket-consume-test.js`（既有9項，因為函式內容這次補回了`created_by`/`ticket_type_id`，不是單純重複執行）。
5. `bookings`/`members`/`member_tickets`資料完整性核對（migration前基準：57/11/26），測試資料清理確認。
6. 全部PASS後才討論正式庫`rlpiomzplckzqnqrvrwc`的migration草案與部署時機（本輪完全未修改正式庫、未commit、未push）。

### 正式庫禁止事項（截至本節為止持續有效）
- `rlpiomzplckzqnqrvrwc` 禁止任何migration、schema變更、資料變更。
- 本機`index.html`仍有未commit的2b前端改動（含`window._bkOpFingerprint`風險修正）與2d-3改動，尚未推送。
- 正式庫`fn_create_booking`目前仍是11參數（含`p_ticket_id`、無`p_idempotency_key`）、`benefit_consume_ticket`已存在且權限正確（僅`service_role`）——這兩點在開始正式庫migration前應視為最新基準，不需要重新查證。

---

## 11. 2026-11-02 Stage2b Phase2 功能驗證＋並發/idempotency缺口修正（測試庫已23/23驗證，正式庫待部署）

**狀態：✅ 測試庫完整驗證通過，待使用者確認備份並指定非營業時間後部署正式庫。**

### 這輪新發現並修正的2個缺口（都只在測試庫，正式庫未受影響）
1. **並發缺口**：同idempotency_key真並發時，若兩請求剛好對同一教練/時段產生真實排程衝突，輸家可能在`space_check`的鎖後衝突檢查直接拿到`BOOKING.TIME_CONFLICT`，跳過原本該有的「已重複，回已有預約」保護。修法：把`perform space_check(...)`包一層`begin/exception`，只攔`BOOKING.TIME_CONFLICT`，捕捉到時才二次查`idempotency_key`，是自己造成的就回`already:true`，不是就原樣`raise`，不影響其他錯誤與不同key的真衝突。
2. **自動挑票比對缺口**：idempotency比對原本拿「請求的`p_ticket_id`（可能是null，代表讓DB自動挑票）」去比「`bookings.ticket_id`（扣票後已被覆寫成實際解析出的票）」，兩者語意不同，導致自動挑票情境下同key重送永遠回CONFLICT、拿不到already。修法：新增`bookings.requested_ticket_id`欄位，INSERT時存「原始請求值」（跟事後扣票覆寫的`ticket_id`分開），3處idempotency比對都改用這個新欄位比對，不影響明確指定ticket_id時的嚴格比對。
- **目前production前端未受影響**：唯一呼叫點`createBookingViaRpc`（index.html:24212）只在`tk`已解析出具體票券時才會呼叫這支RPC，`p_ticket_id`實際上永遠非null，自動挑票路徑在目前production是死碼；但函式本身合法支援，仍修正以求正確。

### 測試庫（`kucvxpjatptfckhlxptj`）目前狀態
- `fn_create_booking`：12參數最終版，含Stage1鎖＋idempotency比對（含`requested_ticket_id`）＋空間鎖後TIME_CONFLICT二次查詢，皆`SECURITY DEFINER`、`search_path='public, pg_temp'`、`anon/authenticated/service_role`皆有EXECUTE。
- `bookings`新增2欄：`idempotency_key`（text，可空，`bookings_idem_key_uq` partial unique index）、`requested_ticket_id`（text，可空）。
- 23/23既有測試PASS：`idempotency-test.js`(4)／`ticket-consume-test.js`(9)／`idem-concurrent-realticket-test.js`(10輪同key真並發)，另加1項不同key控制組PASS。全部在`/Users/tungyeh/Projects/yugym-race-test/`。
- 已用anon key對測試庫做**真實PostgREST HTTP呼叫**驗證：11-key舊形狀與12-key新形狀皆回`HTTP 200 {"ok":false,"error_code":"AUTH.FORBIDDEN"}`，確認無PGRST203、無schema cache問題（用anon key即可驗證RPC解析層，不需service_role或會員JWT，AUTH.FORBIDDEN在函式最前面就return，不會建立任何測試資料）。
- Migration手法（DROP舊11參數版本＋CREATE新12參數版本＋補GRANT，同一交易）已在測試庫完整演練兩次成功（拆回11參數原貌再升級回12參數），確認原子性與ACL正確恢復。

### 正式庫（`rlpiomzplckzqnqrvrwc`）部署前審查結論：**GO**，待排程
- 現況已核對且與審查時一致、無漂移：`bookings`10,911筆、`fn_create_booking`仍11參數原版、新2欄位與索引皆不存在。
- `space_check()`已核對與測試庫**逐字相同**，Stage1的鎖保護不受這次migration影響。
- 4個`bookings`既有觸發器（`bookings_cancelled_by`/`bookings_touch`/`trg_bookings_group_guard`/`trg_change_log`）皆已核對只動`status`/`date`/`start_time`/`duration`/`category`，新增2個nullable欄位不受影響。
- Migration SQL／Rollback SQL已備妥存檔：`/Users/tungyeh/Projects/yugym-race-test/PROD_pre_migration_snapshot_fn_create_booking.sql`（含正式庫原11參數`fn_create_booking`完整原文、回滾步驟逐條列出）。部署用的完整12參數CREATE語句即本節上方「測試庫目前狀態」描述的最終版本，與測試庫`restore_phase2_final_validated_state`那次migration逐字相同。
- 部署後驗證流程：①唯讀SQL核對簽名/grants/SECURITY DEFINER ②比照測試庫手法用anon key對正式庫做一次HTTP smoke call（11-key/12-key各一次，不建立預約）。
- 備份確認（2026-11-02，使用者於Dashboard確認）：Supabase Pro方案，Scheduled backups有效，最新可見備份 2026/10/31 22:00:14 UTC。PITR**暫不加購**（使用者決定，已知風險：migration以外的意外資料問題只能靠每日備份，最多損失近一天資料）。
- 部署當下**零行為變化**：新邏輯全部掛在`p_idempotency_key IS NOT NULL`之後，前端2b idempotency串接尚未commit，現有預約/扣票/教練排課完全不受影響。
- 風險：`CREATE UNIQUE INDEX`非CONCURRENTLY在10,911筆上預估鎖寫入秒級以內；DROP+CREATE必須在同一交易內完成且CREATE後立即補GRANT（DROP會清掉原ACL）。

### 下一步
使用者人在國外，確認返台後排非營業時間執行。**執行前不需要重新驗證任何已過的項目**，直接照本節「Migration SQL／Rollback SQL」與「部署後驗證流程」執行即可。

---

## 12. 2026-11-09 正式部署前最後審查（最新狀態，/clear後從這裡接續）

> 本節整合2026-11-09當天多輪唯讀健檢與部署前審查的最終結論。第1-11節（截至2026-11-02）仍然有效、不要重新研究；本節只記錄**新查到的、或與第1-11節結論不同的部分**。

### 12.0 一句話現況

**Stage1/2a維持第2節結論不變（Stage1已部署、2a不需修改）。2b/2c/2d-1~2d-3維持「測試庫已驗證、正式庫未部署」。新增：2d-4/2c/2b三份可直接審查的部署用SQL已存檔（見12.2），2b找到一個原文件沒記載的回復順序風險（見12.4），2c找到一個理論死鎖窗口（見12.4，風險可接受）。本輪全程唯讀，無任何SQL/Migration/RPC業務呼叫、無commit/push/部署。**

**是否具備進入正式部署階段：2d-4與2c可以（GO），2b還差兩件事才能進（前端逐字核對＋UNIQUE INDEX耗時實測，見12.4）。**

### 12.1 Stage1/2a/2b/2c/2d-1~2d-4 進度總表（2026-11-09唯讀核對結果）

| 階段 | 測試庫 | 正式庫 | 與第1-11節結論有無變化 |
|---|---|---|---|
| Stage1（`space_check`鎖） | ✅ | ✅已部署 | 無變化，本輪重新核對過仍是`has_lock=true`/`has_lock_timeout=true` |
| 2a | — | ✅不需修改 | 無變化 |
| 2b（idempotency） | ✅12參數＋`requested_ticket_id`比對＋TIME_CONFLICT重試保護，**兩項舊風險皆已修復**（並非文件早先所寫的「尚未修」，那是第2b節的舊版敘述，已被第11節的後續工作取代——本輪確認第11節才是正確現況） | ❌未部署（仍11參數、無idempotency欄位） | **更正**：第6節第4項「2b兩項風險尚未修」已過時，實際已修復，只剩部署本身 |
| 2c（venue_unit鎖） | ✅兩支皆有advisory lock+lock_timeout | ❌未部署 | 無變化；新增死鎖分析（12.4） |
| 2d-1~2d-3 | ✅`fn_group_save_members`存在，5參數，含FOR UPDATE | ❌函式不存在 | 無變化 |
| 2d-4 | — | ⏳待辦 | 無變化；本輪已備妥部署SQL |

### 12.2 新增的三份部署準備SQL檔案（本輪新增，未執行，可直接審查）

| 檔案路徑 | 內容 |
|---|---|
| `docs/migrations/_PREP_2d4_fn_group_save_members.sql` | 完整CREATE定義＋GRANT＋相依物件核對（已確認正式庫`bookings`的`member_ids/seat_tickets/attendance/max_heads/coach_id/substitute_coach_id/category`欄位與`current_employee_id()`/`is_staff_desk()`皆已存在）＋部署前後驗證SQL＋回復方式 |
| `docs/migrations/_PREP_2c_venue_lock.sql` | `fn_member_self_book`/`fn_member_self_venue`新舊版本逐字diff（只加鎖，業務邏輯零變動）＋死鎖風險分析（見12.4）＋回復用原始版本 |
| `docs/migrations/_PREP_2b_fn_create_booking.sql` | 11→12參數完整定義＋DROP+CREATE+GRANT單一交易程序＋為何無法用「向後相容新增」部署（PostgreSQL函式替換語意限制，已用2026-11-01的`pgrst_overload_probe_*`三支migration實測證實）＋部署/回復順序（見12.4） |

### 12.3 測試庫／正式庫已確認差異

- 核對49筆測試庫migration（`list_migrations`），無重複、無孤立未配對項目；`pgrst_overload_probe_v1/v2`皆有對應`_cleanup`。
- 正式庫目前`fn_create_booking`/`fn_member_self_book`/`fn_member_self_venue`/`space_check`皆恰好1個overload，無殘留重複版本；`fn_group_save_members`完全不存在——皆與預期一致，無意外。
- `20261104_fn_member_self_reschedule_venue_fix`：正式庫與測試庫（`20261104_fn_member_self_reschedule_baseline/_grant_align/_venue_fix`）**已配對完成**，這是與Phase2無關的獨立bugfix（自主訓練改期時場地檢查邏輯），動的是`fn_member_self_reschedule`，不是2c要動的`fn_member_self_book`/`self_venue`，兩庫無結構落差。
- `bookings.pending_contract`：正式庫本來就有；測試庫2026-11-02才補齊（`add_bookings_pending_contract`），屬於測試庫補正式庫既有欄位的落差，方向與風險皆無異常。

### 12.4 部署順序、驗證、停止、回復（詳見三份SQL檔案，此處只列摘要與新發現）

**順序：2d-4 → 2c → 2b**（依「異動範圍×呼叫頻率×變更方式」風險排序，已驗證成立）。三階段部署皆是「資料庫先、前端後」。

**⚠ 2b回復順序新發現（原文件未記載）**：回復必須**前端先revert（停止送出idempotency相關參數）→ 資料庫後DROP+CREATE回11參數版本**。原因：新RPC的`p_idempotency_key`有`DEFAULT NULL`，所以部署時「舊前端＋新RPC」安全（省略尾端參數即可，idempotency單純不啟用）；但回復時若順序顛倒（先把DB退回11參數、前端commit還留著），前端送出的呼叫形狀會對不到任何現存簽章，**導致全店無法建立任何一般課程預約**。

**⚠ 2c死鎖理論風險（新發現，風險可接受，非阻斷項目）**：兩支自主訓練RPC的跑步機多台迴圈「先鎖使用者指定的主場地、再依1..容量遞增鎖其餘候選」，不是全域單調順序——若會員A主場地是treadmill_3（鎖3→找1,2）、會員B同時主場地是treadmill_1（鎖1→找2,3），理論上可構成鎖等待環。後果有界：`pg_advisory_xact_lock`參與Postgres標準死鎖偵測＋函式本身設了`lock_timeout=3s`，最壞情況3秒後乾淨返回錯誤，不會卡死或資料不一致。既有2c測試沒覆蓋這個排列組合（只測了「搶同一台」「不同台互不阻塞」），建議列為上線後觀察項目。

**各階段驗證SQL／停止條件／回復SQL**：完整內容在對應的`_PREP_*.sql`檔案內，不在此重複貼出。停止條件統一原則：任一階段部署後的唯讀驗證（簽章/鎖/權限）不符預期，立即停止、不得繼續下一階段。

### 12.5 2b尚未完成項目（擋住GO的兩件事）

1. 本機`index.html`的2b前端`_bkOpFingerprint`等改動尚未commit，commit前需重新逐字核對內容沒有被其他並行工作覆蓋（本輪只確認關鍵字存在，沒有逐字核對）。
2. `CREATE UNIQUE INDEX bookings_idem_key_uq`在正式庫萬筆規模（`bookings`現況10,911+筆，第11節基準）上的精確鎖定耗時未實測，只有「秒級以內」的估算，建議正式部署前找時段做一次`EXPLAIN`或在低峰時段直接執行並記錄實際耗時。

### 12.6 第5-8處預約寫入路徑——本輪已實際讀程式碼核對（不再是待確認）

逐一讀取`submitBooking`/`_submitBookingInner`（體驗課/團課分支，約39254/39291行）、`submitPendingHold`（38584行）、場租建立（約36296行）、跑步機同行切換（約42935-42955行）後確認：**全部是前端直接`dbPut`，寫入前只有`validateBooking`等純SELECT式檢查（TOCTOU，檢查與寫入之間沒有鎖），沒有資料庫交易、沒有唯一約束綁住時段**。防重複送出保護參差不齊：
- `submitBooking`：有同分頁旗標`window._bkSubmitting`（僅防同裝置連點，防不了跨裝置/跨人同時送出）。
- `submitPendingHold`：有`window._phSubmitting`（同上限制）。
- 跑步機同行切換（約42935-42955行）：**沒有找到任何防連點旗標**。
- 場租建立：使用與`submitBooking`相同的送出流程，同樣只有同裝置防護。

這是結構性既有風險（不是本輪造成的），本輪**只核對現況、未提出修復方案、未修改任何程式碼**，留給之後視優先序另外排入Phase2的待辦清單。

### 12.7 行事曆小卡標籤顯示——獨立任務，狀態與根因（尚未修改程式碼，等候下一步指示）

與Phase2完全分開的獨立任務。根因已查到：`.evc-stag`/`.evc-fri`標籤在卡片寬度55px以下會被CSS設成`display:none`，但控制「要不要隱藏時間」的`:has(.evc-stag)`／`:has(.evc-fri)`選擇器判斷的是DOM元素**是否存在**、不是**是否可見**——所以即使標籤本身已經因為太窄而隱藏，那條「有標籤就讓掉時間」的規則依然成立，導致**55px以下標籤與時間會一起消失**，不符合「保留標籤、隱藏時間」的原始設計意圖（該意圖在77-87px門檻其實已經正確實作，只有低於55px的最窄區間才會觸發這個副作用）。相關CSS位置：`index.html`約7731-7757行（時間隱藏門檻）、約8036-8057行（標籤全字→縮寫→隱藏三段門檻）。尚未提出修改方案細節，也尚未動任何程式碼，等候使用者對「55px以下要不要讓時間回來」這個行為決定後再進行。

---

## /clear 後續接指令（可直接貼上）

```
請先完整閱讀 YUGYM_HANDOFF.md 第12節（2026-11-09最後狀態），
不要重新執行已經完成的分析（Stage1/2a/2b/2c/2d-1~2d-3的測試庫驗證、
三份 docs/migrations/_PREP_*.sql 的內容核對、2b回復順序風險、2c死鎖分析、
第5-8處路徑的程式碼核對、行事曆小卡根因）。

確認讀完後，直接回報：
1. 目前卡在哪裡（2b還差哪兩件事才能GO）。
2. 下一步要先處理 Phase 2 的 2b 收尾，還是先處理獨立的行事曆小卡標籤任務。

等待我指示後才開始動作。本輪若涉及正式庫 rlpiomzplckzqnqrvrwc，僅允許 SELECT；
測試庫 kucvxpjatptfckhlxptj 若需要驗證，先問過我再執行。
不得自行 commit、push、部署，或清理既有 worktree（ab-face-deploy／mango-cal-deploy）。
```

