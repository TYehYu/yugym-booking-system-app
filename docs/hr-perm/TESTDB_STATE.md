# 測試庫 kucvxpjatptfckhlxptj 狀態紀錄（人事權限 2a／2b）

> 更新：2026-11-19。**正式庫 rlpiomzplckzqnqrvrwc 全程唯讀，未發布。** 以下全部只存在於測試庫。

## 0. 兩種「基準」不是同一件事
| 名稱 | 定義 | 怎麼回到 |
|---|---|---|
| **原始測試庫** | 2026-11-17 我開始這個專案之前的測試庫（缺正式庫的守衛觸發器、`salary_history`、`change_log` 等；出勤政策是 `att_self`／`att_staff`） | 依第 4 節三步（2b → 2a → 全部暫補）＋刪兩個保留欄位。**當時沒有記錄原始指紋**，所以第 4 節是「推導＋交易內演練」，不是比對舊指紋 |
| **人事測試前基準（BASE_B）** | 2a／2b 都還沒套、但「暫補物件」與兩個保留欄位都還在（＝每次驗收前後我比對的對象） | 只還原 2b、2a；指紋見第 3 節，歷次實跑都與它逐項相同 |
兩者的差別＝第 2 節的暫補物件與兩個保留欄位。

## 1. 目前狀態（Codex 2026-11-18 實測收尾）：**BASE_B，2a／2b 已還原**

真實 HTTP 與清理報告 HR_ACCEPT_CLEANED：121 通過、0 失敗；畫面實點與獨立資料庫核對完成。
2b → 2a 已在測試庫單一交易還原，提交前及提交後指紋皆與第 3 節 BASE_B 相同。
測試專用 zz_hr_verify／zz_hr_verify2／zz_hr_fingerprint 已移除，本機驗收站已關閉。
第 2 節 parity 暫補與兩個保留欄位仍在，屬 BASE_B，並未還原到未記錄原始指紋的最初測試庫。
詳細紀錄見 CODEX_ACCEPTANCE_20261118.md。正式庫未寫入，未 commit、push、部署。

## 2. 暫補物件（為了讓測試庫和正式庫一致才能驗得準）：來源、保留原因、回復
| # | 物件 | 來源 | 為什麼留著（保留原因） | 回復 |
|---|---|---|---|---|
| P1 | `fn_employees_guard()`＋觸發器 `trg_employees_guard`（員工表守衛：非管理員只能改 6 個非敏感欄） | 正式庫既有（`pg_get_functiondef` 唯讀取得） | 沒有它就驗不出「改自己底薪被擋」「僱用別窄門」；正式庫本來就有 | `rollback_00_parity_prep.sql` |
| P2 | 資料表 `salary_history`（匯入的歷史月薪）＋政策 `sh_read／sh_self／sh_write`＋GRANT | 正式庫既有（205 列；欄位／政策唯讀取得；測試庫建空表） | 薪資歷史的權限修補要有表才驗得到 | 同上 |
| P3 | `employees` 12 欄：`avatar_url、duty_order、duty_matrix、line_notify、birthday_bonus_off、line_user_id、line_bind_token、leader_members、leader_t1／b1／t2／b2` | 正式庫有、測試庫沒有（欄位清單比對） | 去敏名單、薪資檢視要引用這些欄位；缺欄位檢視建不起來 | 同上（`drop column`） |
| P4 | `attendance` 3 欄：`note、fixed_by、fixed_at` | 同上 | 出勤守衛要驗「備註／更正人不可自改」 | 同上 |
| P5 | 出勤政策改成正式庫的 5 條（`att_admin、att_self_ins、att_self_read、att_self_upd、att_staff_read`），取代測試庫原本的 `att_self／att_staff` | 正式庫政策（唯讀取得） | 正式庫櫃檯對出勤是「唯讀」，測試庫原本卻可寫，會讓驗證失真 | 同上（還原成原本兩條） |
| P6 | **parity B**：`change_log` 表、`fn_log_change()`、四張表的 `trg_change_log`（attendance／employees／punch_requests／salary_history）、`fn_table_sigs()` | 正式庫既有（唯讀取得定義） | 驗證新觸發器與「變更日誌／簽章快取」並存（前端增量補資料依賴它） | `rollback_01_parity_prep_b.sql` |
| P7 | **parity B**：`fn_set_employment_type(text,text)`（主管調整僱用別） | 正式庫既有 | 驗證它（定義者函式＋旗標）在 2b 政策下仍可用 | 同上 |
| P8 | **兩個保留欄位**：`punch_requests.requested_by`（代登人）、`punch_requests.reviewed_by`（核准人） | **2a 新增的資料結構**（第一輪合併版 v2 就加了；`add column if not exists`） | 2a／2b 的回復檔**刻意不刪**這兩欄：新欄位只要被寫過，刪欄位就會丟資料；它們不影響任何政策或舊前端 | 要回「原始」才手動：`alter table public.punch_requests drop column requested_by, drop column reviewed_by;` |
測試專用（驗收結束後必刪）：`zz_hr_verify2(text)`、`zz_hr_fingerprint()`（`drop function …`）；驗收程式建立的 6 位 `CC-EMP-HR-*` 員工與登入（程式按 Enter 自動清除並比對基準）。

## 3. 指紋（`select public.zz_hr_fingerprint()`；欄位：policies／triggers／functions／relations／cols／grants／列數）
| 狀態 | policies | triggers | functions | relations |
|---|---|---|---|---|
| **BASE_B**（2026-11-19 記錄） | `7ed93cae34cd4509f58299d37d12bbfb`（77） | `d140193bffbde4945b72c80fe7332490` | `56db1069bfdab98505fdc92af54f9bcd`（62） | `0df39c4fc683084fabffcbc62848fd09`（31） |
grants＝`5013f50b5ce4ef1c949e67d37d69ef6e`、cols＝`2f1d3831dc3f3f7cce4a7e9f4906cdfd`；列數 employees 6／attendance 1／auth.users 6／punch_requests 0／salary_history 0／change_log 0。
（舊版 BASE＝未加 parity B 時的指紋 `c9ec52e3…`／76 條，已被 BASE_B 取代。）

## 4. 還原順序（驗收結束後；每一步都核對）
1. 驗收程式清除（按 Enter）：資料表與登入帳號回到測前基準。
2. `rollback_2b_hr_perm_revoke.sql` → 重跑 `zz_hr_verify2('base')`（只剩 fn_set_employment_type 的 6 項，與 2b 狀態結果相同）。
3. `rollback_2a_hr_perm_compat.sql` → 指紋必須＝ **BASE_B**。
4. 移除 `zz_*` 函式。
5. 若要回**原始測試庫**：`rollback_01_parity_prep_b.sql` → `rollback_00_parity_prep.sql` → 刪 P8 兩欄。這一整串已用「交易內演練」驗證可行（執行→取指紋→強制回滾，不留變動），結果見 `ACCEPTANCE_REPORT.md`。
