# 兩個補核對：①系統管理員仍可讀基表敏感欄位 ②打卡時間由誰決定

## ① 關閉人事自動授予後，管理員仍可讀他人員工基表敏感欄位
**現象（實測）**：舊的 v2 把 `admin_implicit_hr` 設 false 後，管理員讀 `employees_pay`、薪資歷史都 0 列，但讀員工基表仍是全員全欄位（含底薪、身分證、銀行）。
**根因**：基表 SELECT 政策是 `is_admin()`；Postgres 沒有欄位層 RLS，政策只能放行「整列」。

### 帳號管理「真正需要」的欄位（以 `index.html` 屬性存取掃描＋流程盤點）
| 功能 | 需要的欄位 |
|---|---|
| 邀請／建立員工、重設密碼、停用／刪除（`submitStaffInvite`、`openResetStaffPw`、`deleteStaff`、`staffApplyApprove`；實際建帳由 Edge Function `create-staff-account`＋service_role 完成） | `id、auth_id、name、nickname、phone、email、role、status、is_manager、is_supervisor、employment_type、job_title、invite_status、invite_token、must_setup、need_punch、can_teach、emp_no、created_at` |
| LINE 綁定／解除（`openEmpEditModal`、`ppStaffLineBind/Unbind`、`_doLineUnbind`、`stSwitchRow`、`ppEmpSwitchOn`） | `line_user_id、line_bind_token、line_notify` |
**不需要**：薪資／單價／獎金、身分證、銀行、投保（單位、級距、日期、狀態）、特休、生日、到職日、緊急聯絡人、地址、備註。

### 已做（2a，隨 2a 一起上）
- 檢視 `employees_account`（只有 `is_admin()` 才有資料，欄位只含上表）。實測：管理員 10 列、櫃檯／教練／薪資人員 0 列；外露薪資／證件等欄 0 個；需要的 11 欄齊全；關閉自動授予後管理員仍讀得到（不受影響）。
- `admin_full_hr()`；2b 的基表 SELECT／UPDATE 改用它：關閉自動授予後，**管理員讀基表只剩自己 1 列**（實測 X3／X3b）。
- `fn_my_hr_access()`：前端可據此知道「我能不能讀基表整列」。

### ⚠ 還沒做、且是「切換前提」（所以預設仍是 `'true'`）
關閉後管理員在基表上**也不能 UPDATE 他人**（UPDATE 需要先讀得到那列）。所以在以下三件事完成前，**不可**把 `admin_implicit_hr` 設成 `'false'`：
1. 前端：員工管理頁的帳號相關畫面改讀 `employees_account`；薪資／投保／任用畫面改讀 `employees_pay／insure／employment`（依職責）。
2. 資料庫：帳號寫入 RPC（建議 `fn_staff_account_update(p_id, p_patch)`：僅允許 `role／status／is_manager／is_supervisor／phone／nickname／need_punch／can_teach／job_title／employment_type` 這類帳號欄位）。
3. 人事職責持有人另有自己的薪資／投保／任用編輯 RPC（現在寫入仍僅管理員）。
### 長期（方案 A）：拆表
把 `base_salary／pay_*／pt_*／group_rate／duty_hourly／pay_rules／…／id_number／id_no／bank_account／insured_*／*_insurance_status／pension_status／annual_leave_*／al_*／birthday／address／emergency_*` 搬進 `employee_private`（RLS：本人讀自己；有對應職責者讀；管理員不自動）。這是唯一能讓「系統管理員完全看不到」成立的做法，但需要改寫所有讀寫這些欄位的前端與 RPC（約 160 個函式），建議另案分批。

## ② 首次上班打卡、補上空白下班：是否接受前端傳入任意時間？
**結論：不接受。**（舊的 v2 接受：實測前端傳任何值，只要欄位原本是空的就照寫。）
### 2b 的做法（資料庫觸發器 `fn_attendance_self_guard`，只管「以 authenticated 身分直接寫表」）
| 情況 | 行為 |
|---|---|
| 第一次打卡（INSERT） | 只能是**今天**、只能記上班；前端送什麼時間都被換成伺服器現在時間（台北，分鐘精度）；帶下班時間或工時 → 拒絕 |
| 補下班（空白→有值） | 下班時間＝伺服器現在時間；工時由伺服器重算（前端傳的時間、工時一律不採信）；列必須是今天或前一天（跨午夜班） |
| 已有的上班／下班／工時／員工／日期／備註／更正人 | 本人不能改 |
| 按錯取消下班 | 只限今天、下班打卡後 10 分鐘內；之後走補打卡申請 |
| 前端 dbPut 的整筆 upsert（衝突路徑） | INSERT 階段發現同員工同日／同 id 已有列就放行，交給 UPDATE 階段逐欄判斷 → 舊寫法不用改 |
| 歷史更正 | 一律走「補打卡申請 → 主管（所管）／管理員（別人的）核准 → `fn_punch_decide`」；管理員仍可直接更正（既有行為） |
| 定義者函式、service_role、後台 SQL | 不受限（`fn_punch_decide` 才能寫入歷史時間） |
實測：前端傳 `03:33` 的第一次打卡存成伺服器時間；補下班傳 `03:44`＋工時 99 存成伺服器時間與伺服器算的工時；整筆 upsert 傳 `23:59`＋15 存成伺服器時間與 0.5；改既有時間、改日期／備註／更正人、新增昨天或 5 天前的卡都被擋；10 分鐘內取消下班可，30 分鐘後與取消昨天的被擋。
### 前端配合（已改）
`punchOut`、`doScanPunch`（上班）、`confirmScanOut` 改顯示 `dbPut` 回傳的資料列（伺服器時間），不再顯示裝置時間；`dbFriendlyError` 新增 `ATT.*` 人話並指向「申請補打卡」。
### 限制
- 時間精度是分鐘；伺服器時區固定台北。
- 裝置時鐘錯誤不再影響記錄（優點）；但「取消下班」的 10 分鐘窗口以伺服器時間計。
- 舊頁面（2b 後尚未重新整理）打卡仍可用，只是畫面顯示的時間可能與記錄差到一分鐘，重新整理後以伺服器為準。
