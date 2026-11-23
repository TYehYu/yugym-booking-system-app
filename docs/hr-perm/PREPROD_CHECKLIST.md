# 正式上線前要設定的項目與回復（人事權限修補 v2）

> 正式庫維持唯讀。以下全部「上線前」才做，且每一步都需使用者明確授權。

## A. 上線順序（缺一不可；已拆成兩支 migration，各附獨立回復檔，測試庫已實跑）
| 步驟 | 內容 | 舊前端是否仍可用 | 回復 |
|---|---|---|---|
| 1 | **2a 相容階段** `20261119a_hr_perm_compat.sql`：只新增（表、函式、檢視含到班狀態 `attendance_presence`、補打卡 2 欄）；不改任何既有政策、不掛觸發器 | 完全可用（實測 L1–L11：舊的讀他人底薪、直接改狀態、舊式打卡寫入全部照舊） | `rollback_2a_hr_perm_compat.sql` |
| 2 | 提供並寫入 `manager_scope`、`hr_grants`（見 B） | — | 刪列 |
| 3 | **上新版前端**（v261118.1500）並通過各角色驗收（真實 HTTP＋瀏覽器） | 新前端在 2a 狀態可用（讀去敏名單檢視、核准走 RPC） | `git revert` 並再跳一次 `CACHE_EPOCH` |
| 4 | **2b 收權階段** `20261119b_hr_perm_revoke.sql`：收回舊政策、掛出勤觸發器（含「舊頁面保護」：別人那天有待審申請就拒絕直接寫出勤）、主管出勤範圍政策 | 見下表 | `rollback_2b_hr_perm_revoke.sql` |
回復順序固定：**先 2b（恢復權限）→ 再退前端 → 最後才視需要回 2a**。⚠ 順序顛倒（先退前端、後還原 2b）會讓教練／櫃檯／主管只看到自己 1 列員工。

### 2b 之後仍開著「舊頁面」（尚未重新整理的分頁／舊 PWA）的相容情況
| 動作 | 結果 |
|---|---|
| 非管理員讀員工名單 | 只剩自己 1 列 → 教練欄、員工限定方案比對缺人；**重新整理即恢復** |
| 補打卡核准／駁回（含管理員） | 舊頁面是直接改表。**2b 起第 1 步（寫出勤）就被明確拒絕（`ATT.PENDING_REQUEST`），什麼都不會留下**（舊版曾「寫了出勤、狀態卻沒改」）；重新整理後改走核准函式 |
| 主管的出勤總覽／值班進度（舊頁面） | 只看得到本人＋所管；新版另用「到班狀態」補全店的到班／下班旗標 |
| 補打卡送出（本人） | 不受影響 |
| 上班／下班打卡 | 可用；時間改由伺服器決定（畫面可能與記錄差到 1 分鐘，重新整理後一致） |
| 取消今日下班 | 下班後 10 分鐘內可；超過會被擋並提示改走補打卡申請 |
| 薪資歷史（管理員） | 不受影響（過渡期） |
PWA：`sw.js` 以 HEAD 比對指紋、換版後約 6 秒背景抓新版、下次開啟生效；上 2b 前先確認各裝置已更新（既有 APP_VERSION 檢查會提示重新整理）。

## B. 必須先由你提供的資料
| 項目 | 現況（正式庫唯讀統計） | 要你決定 |
|---|---|---|
| 主管管轄名單 `manager_scope` | 在職員工 14 人；`is_manager` 2 位（皆教練）；`is_supervisor` 0 位；**資料庫沒有「誰管誰」** | 每位主管管哪些員工（沒資料＝主管無人可核准，管理員仍可） |
| 人事授權 `hr_grants` | 目前沒有任何人事專責人員；管理員 2 位、櫃檯 1 位 | 誰要有 `pay_view／pay_adjust／pay_publish／insure／employment／leave_settle` |
| `hr_settings.admin_implicit_hr` | 預設 `'true'`（管理員自動擁有） | 何時改 `'false'`（改前必須先給實際負責人 `hr_grants`，否則薪資歷史、薪資檢視無人可看） |
| 管理員自核補打卡 | 正式庫有 2 位在職管理員 → 互相核准可行 | 已依你的第一版規則：所有人都不可核准自己的 |

## C. 回復
- 資料庫：`docs/hr-perm/rollback_hr_perm_gaps.sql`（測試庫已實跑）。新表資料（`hr_grants`、`manager_scope`、`hr_settings`）會隨表刪除，回復前先匯出。補打卡新增的 `requested_by`／`reviewed_by` 兩欄保留。
- 前端：`git revert` 該 commit 後重新發布；`CACHE_EPOCH` 需再跳號一次（讀取規則變更）。
- 回復順序（與上線相反）：先回復 SQL 的收權部分，再回前端。

## D. 測試庫暫補物件清單（只在測試庫；`00_testdb_parity_prep.sql`／`rollback_00_parity_prep.sql`）
把測試庫補到與正式庫一致，才能忠實驗證。**這些不是新功能，也不進正式庫 migration。**
| 物件 | 說明 |
|---|---|
| `fn_employees_guard()`＋觸發器 `trg_employees_guard` | 正式庫既有的員工表守衛，測試庫原本沒有 |
| 資料表 `salary_history`＋政策 `sh_read／sh_self／sh_write`（+GRANT） | 正式庫既有（205 列的匯入歷史月薪），測試庫原本沒有；v2 會再把 `sh_read`、`sh_write` 換成新政策 |
| `employees` 欄位：`avatar_url`、`duty_order`、`duty_matrix`、`line_notify`、`birthday_bonus_off`、`line_user_id`、`line_bind_token`、`leader_members`、`leader_t1`、`leader_b1`、`leader_t2`、`leader_b2` | 正式庫既有、測試庫原本沒有 |
| `attendance` 欄位：`note`、`fixed_by`、`fixed_at` | 同上 |
| v2 套用物件（不屬於「暫補」，但目前也只在測試庫）：`hr_grants`、`manager_scope`、`hr_settings`、`has_hr_duty()`、`is_my_report()`、`fn_punch_decide()`、`fn_employee_update_general()`、`fn_attendance_self_guard()`＋`trg_attendance_self_guard`、檢視 `employees_public／employees_manager_scope／employees_pay／employees_insure／employees_employment`、`punch_requests` 兩欄與新政策、`employees_select_v2／employees_update_v2`、`sh_read_hr／sh_write_*` | 還原用 `rollback_hr_perm_gaps.sql` |
| 測試庫不存在、因此**未驗證**的項目 | `fn_set_employment_type`（主管調僱用別，定義者函式，理論不受影響）；`shifts／duty_slots` 的 `sh_manager／ds_manager` 政策（只查自己那一列，自己那列仍可見） |
