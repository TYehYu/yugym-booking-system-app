# YUGYM OS｜安全模型（Security Model）

> 產出：2026-07-16（Sprint 2 設計階段）　狀態：**設計文件，尚未套用**
> 搭配 [SPRINT2_RLS_DESIGN.md](./SPRINT2_RLS_DESIGN.md)（各表實際政策與 migration SQL）與 [SPRINT1_SYSTEM_AUDIT.md](./SPRINT1_SYSTEM_AUDIT.md)（現況盤點）閱讀。

---

## 1. 現況與最重要的前提

### 1.1 只有員工有登入帳號

| 對象 | 總數 | 有 Auth 帳號 | 能登入嗎 |
|---|---:|---:|---|
| 員工 employees | 12 | 12 | ✅ 全部可登入 |
| 會員 members | 432 | **0** | ❌ 目前無人能以會員身分登入 |

**推論**：系統目前是「12 位員工用各自帳號登入操作」在運行；會員端（會員登入看自己票券/預約、會員自助簽到）**目前沒有實際登入流量**。所有現存「會員只讀自己」的 RLS 政策（`mt_select_member`、`bookings_select_member`）因為沒有會員登入身分可比對，實務上從未生效。

### 1.2 這代表 Sprint 2 的真正安全邊界

現在唯一真實的登入者就是那 12 位員工。真正的漏洞是：**現在幾乎每張表都有 `USING(true)` 全開政策，任何人（含未登入的 anon）拿公開金鑰就能讀寫全部資料**。收斂這個，就是 Sprint 2 的核心價值。

### 1.3 一個必須先決定的分岔（影響設計範圍）

因為會員沒有帳號，Sprint 2 有兩條路：

- **路線 A（建議，範圍收斂）**：這次只把權限收斂到「**員工已登入才可存取，未登入 anon 一律擋掉**（除了少數必要的公開流程）」。會員自己讀自己資料的細緻權限，等到「會員登入」功能真正上線時（未來 Sprint）再做。理由：現在沒有會員登入流量，先把最大的洞（anon 全開）補起來，風險最低、最快見效。
- **路線 B（完整，範圍較大）**：這次就把會員 Auth、會員 RLS 一起做完。但這需要為 432 位會員建立 Auth 帳號、處理登入流程，工程與風險都大很多，且目前沒有實際需求驅動。

> 本文件以**路線 A** 為預設設計。路線 B 的細緻會員政策仍會寫入 RLS 設計文件，但標記為「未來啟用」，Sprint 2 不套用。

---

## 2. 角色定義

| 角色 | 來源 | 判斷函式 | 說明 |
|---|---|---|---|
| **admin**（管理員） | employees.role='admin' | `is_admin()` | 全店資料讀寫、員工/方案/票種設定 |
| **front_desk**（櫃台） | employees.role='front_desk' | `is_staff_desk()`（含 admin） | 會員/預約/票券/購課日常讀寫 |
| **coach**（教練） | employees.role='coach' | `is_coach()` | 讀自己的課、讀學員、讀員工名單；只改自己的預約 |
| **member**（會員） | members.auth_id | `current_member_id()` | （目前無帳號）未來：只讀自己的預約/票券/通知 |
| **anon**（未登入） | 無 auth | `auth.uid() IS NULL` | 僅限少數公開流程（見 §4） |

輔助函式（Sprint 1 確認皆已存在於資料庫）：
`current_staff_role()`、`current_employee_id()`、`current_member_id()`、`is_admin()`、`is_staff_desk()`、`is_any_staff()`、`is_coach()`、`can_coach_see_member(m_id)`。

> Sprint 2 幾乎不需寫新函式，工作是把各表政策從 `USING(true)` 換成呼叫這些既有函式。

---

## 3. 登入機制（現行，維持不變）

帳號轉內部假 email 後走 Supabase Auth：

- 員工：`{帳號}@staff.yugym.local`
- 會員（未來）：`{手機}@member.yugym.local`

登入後前端組出 `SESSION = { role, id, name }`。員工 profile 以 `employees.auth_id = auth.uid()` 反查，RLS 函式即依此判斷角色。員工建立帳號走 Edge Function `create-staff-account`（service_role，不切換當前登入者）。

---

## 4. 必須保留的公開（anon / 半公開）流程

即使收斂權限，以下流程仍需在**未登入或跨身分**下運作，設計時不能一併擋死。Sprint 2 測試務必逐項驗證：

| 流程 | 涉及表 | 現有政策 | 設計處置 |
|---|---|---|---|
| 員工邀請填寫（憑 token） | employees | `employees_invite_select/update`（anon by token） | 保留，但收斂為「僅能讀/改自己 invite_token 對應那筆」 |
| 會員自助註冊 | members | `public_self_signup_members` INSERT（anon） | 保留 insert，但不開放 anon select/update |
| 線上購課申請 | purchase_applications | `pa_insert/select/update`（anon） | 保留，收斂為僅能操作自己送出的申請 |
| 全域狀態 KV | app_state | anon 讀寫固定 id | 低風險，維持（僅該固定 id） |

---

## 5. 權限對照（目標）

✅=可讀寫　🔍=可讀　—=不可

| 資料 | 會員(未來) | 教練 | 櫃台 | 管理員 | anon |
|---|---|---|---|---|---|
| 會員 members | 🔍自己 | 🔍學員 | ✅ | ✅ | 僅自助註冊 insert |
| 票券 member_tickets | 🔍自己 | 🔍 | ✅ | ✅ | — |
| 預約 bookings | 🔍自己 | 自己課✅／其他🔍 | ✅ | ✅ | — |
| 票券異動 ticket_logs | 🔍自己 | 🔍 | ✅ | ✅ | — |
| 員工 employees | — | 🔍名單 | 🔍 | ✅ | 僅 invite by token |
| 出勤/班表/薪資 | — | 🔍自己 | 🔍 | ✅ | — |
| 購課申請 purchase_applications | 🔍自己 | — | ✅ | ✅ | 自己送出的 |
| 設定型（票種/方案/分類/等級/場地/動作/發點規則） | 🔍 | 🔍 | 🔍 | ✅寫 | 🔍（登入後） |
| 通知 notifications | 🔍自己 | 🔍自己 | ✅ | ✅ | — |

> 「教練只讀自己的薪資」不需獨立權限：薪資由 `bookings`(completed) + `employees` 費率即時算，教練的 bookings 已被 RLS 限制在自己，故薪資天然只看得到自己。

---

## 6. 已知殘留風險（本模型無法單靠 RLS 解決）

1. **anon key 公開在 config.js 且倉庫公開**：這是設計上可接受的（anon key 本就設計成可公開，安全靠 RLS）。前提是 RLS 收斂完成——所以 Sprint 2 完成前，這個洞是實質存在的。
2. **service_role key**：絕不可進前端/倉庫，僅存在於 Edge Function 環境。需確認 `create-staff-account` 的金鑰是走 Supabase 環境變數而非寫死。（Sprint 2 順帶檢查項。）
3. **會員無帳號**：在會員登入上線前，會員資料的保護完全依賴「anon 被擋、只有員工能讀」。一旦未來開放會員登入，需補上細緻的會員自我隔離政策（本文件 §5 已預先設計，標記未來啟用）。
