# 上線前要填的名單格式（人事權限 2a／2b）

> 正式庫 2026-11-18 唯讀統計：在職員工 14 人；`is_manager`＝2 位（皆教練）；`is_supervisor`＝0；管理員 2 位；櫃檯 1 位。
> **下面兩份名單由你決定、提供；我沒有替你填。** 範例全是假資料。

## 1. 主管管轄名單 `manager_scope`（誰管誰）
| 欄位 | 說明 |
|---|---|
| `manager_id` | 主管的員工 id；必須是 `employees.is_manager = true` 且在職（資料庫函式 `is_my_report()` 也會再檢查一次） |
| `employee_id` | 被管員工的 id；不能等於自己；建議只列在職者 |
- 一位主管可以管多人；一個人也可以有多位主管。
- **沒有列＝該主管不能核准任何人的補打卡、也看不到任何人的出勤明細／申請**（管理員不受影響）。上 2b 前一定要填，否則店長的出勤總覽只剩他自己。
- 主管「本人」的出勤與申請本來就看得到，不用列。
- 範本：`docs/hr-perm/templates/manager_scope.csv`。

## 2. 人事職責名單 `hr_grants`（誰有哪個人事職責）
| 欄位 | 說明 |
|---|---|
| `employee_id` | 員工 id（在職） |
| `duty` | 只能是下列六種之一 |
| 職責 | 實際效果（2a／2b 已做） |
|---|---|
| `pay_view` | 讀 `employees_pay`（算薪必要欄位）與 `salary_history`；**讀不到**身分證、銀行、電話、Email、地址、投保單位 |
| `insure` | 讀 `employees_insure`（投保明細）；讀不到身分證、銀行 |
| `employment` | 讀 `employees_employment`（到職、轉正、離職、特休） |
| `pay_adjust`／`pay_publish`／`leave_settle` | 目前只有「授權紀錄」，對應的寫入功能（調整、發布、結算）還沒做，先填也不會有效果 |
- 過渡期 `hr_settings.admin_implicit_hr='true'`：管理員自動擁有全部職責；**管理員不需要填**。
- 要讓「系統管理員的人事權限另外授予」生效，才把它改成 `'false'`，並替實際負責人填上 `hr_grants`；改之前的三個前提見 `ADMIN_BASE_TABLE_AND_ATTENDANCE_TIME.md`（⚠ 前端與帳號寫入函式沒完成前不要改）。
- 範本：`docs/hr-perm/templates/hr_grants.csv`。

## 3. 填完之後
1. 把名單貼進 `docs/hr-perm/validate_lists.sql`（唯讀）→ 每列 `problem` 都要是空的。
2. 取得授權後，用 `docs/hr-perm/import_lists.sql` 匯入（冪等；附回復）。
3. 用各角色帳號實登驗收一次（`ACCEPTANCE_REPORT.md` 的點擊清單）再上 2b。
