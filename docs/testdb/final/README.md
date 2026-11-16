# 最終驗收（rev2：一次執行的執行器 `run_final_acceptance.js`）

**這是目前的做法，取代下方舊的分段說明。**

## 流程（使用者只下一條命令）
1. （Claude 先做）測試庫暫時安裝階段 06＋08＋觀測函式：`phase_install_testdb.sql`；測前基準已記錄。
2. 使用者執行 `run_final_acceptance.js`：隱藏輸入測試庫 service_role 金鑰 → 核對專案身分 → 官方 Auth 管理介面建立 3 個專屬登入（櫃檯／教練／會員）→ 2 筆員工、1 筆登入會員、夾具 → 匿名與角色 HTTP → 真並行（持鎖者在 pg_stat_activity 親眼觀測到等候者被自己擋住，才算證明）→ 開兩個本機站（新 8101／舊 8102，`/cc-login?role=…` 免輸入密碼登入）等待畫面走查（Claude 走查後建立 `ui_done`，或使用者按 Enter）→ 依精確 id 清除（含刪除 3 個登入）→ 測前後逐列基準比對。
3. （Claude 後做）`phase_remove_testdb.sql` 移除暫時安裝（含還原 `fn_tk_refund_once` 原版，已驗 md5 相同），再核對函式／表／觸發器／權限基準。

## 安全特性（rev2，已依 Codex 審查修正）
- **金鑰格式**：只接受**舊版 JWT 形式的 service_role 金鑰**（`eyJ…` 三段，payload 的 ref 必須是測試庫、role 必須是 service_role）。新版 `sb_secret_…` 未驗證是否支援 Auth 管理介面，一律拒絕，不與舊版視為可互換。金鑰隱藏輸入、只在記憶體、不存檔、不打印；非互動終端機拒絕；請求只送往固定的測試庫網址。
- **憑證存放（修正先前說法）**：管理金鑰、隨機密碼、JWT 在**程序記憶體**；但 `/cc-login` 會把測試登入的 **session 寫進測試瀏覽器的 localStorage**（僅 127.0.0.1:8101／8102）。走查結束前必須開 `/cc-logout` 清除；`ui_done` 證據需回報 `logoutConfirmed:true`，否則整體判為未驗證。manifest／evidence／report 不含憑證。
- **每輪唯一夾具 id**（`CC-…-<runId>`）：建立前先確認不存在（已存在就停止，不覆蓋、不當成本輪所有）；寫入前只標 `planned`；確定建成才標 `created`；結果不明先查證（建前已證實不存在、現在存在＝本輪所建）；查證不了標 `unknown`，**清除時不刪**、列出。
- **基準失敗即停止**：OpenAPI、每張表、登入帳號清單任何必要讀取失敗（含 HTTP 非 2xx）就停止、尚未建立任何東西；分頁加穩定排序並核對列數完整；不會把「前後相同的錯誤」當一致。
- **清除**：只刪 `created`（及走查中可歸屬於本輪測試身分的新建列）；HTTP 非 2xx 算失敗；刪除後逐項確認已不存在；失敗保留不含憑證的 `leftover_objects.json`。
- **中斷與恢復**：SIGINT／SIGTERM 在各階段停止新增操作並進入收尾；所有網路請求 20 秒逾時；啟動時若偵測到未完成的 manifest，**不覆蓋**，自動進入查證／恢復流程（不建立任何新東西），完成後封存舊 manifest，請再執行一次進行新一輪。
- **走查期間新建資料**：收尾時以前後快照找出新增列，**可歸屬於本輪測試員工**（created_by／operator 或欄位引用本輪 id）者納入精確 id 清除；無法歸屬者只列出、不刪，並使清除判定為「未完全成功」。
- **驗收不假通過**：`--no-ui`、按 Enter 提早結束、逾時、缺少完整走查證據、並行未證明鎖等待、清除未完全成功，一律整體判定 `UNVERIFIED`（不是 `COMPLETE`）；身分特徵不符、必要函式檢查不符立即停止；並行斷言同時核對餘額、扣退帳本與預約狀態。
- **兩階段收尾**：①本執行器清除（本輪帳號與資料）②Claude 另行執行 `phase_remove_testdb.sql` 移除 06／08／觀測函式並核對基準。**兩者都完成才算收尾**；執行器結束時會提醒。
- 觀測函式 `zz_cc_overlap` 只允許 `CC-EMP-` 開頭的本輪測試員工呼叫。無法還原的只有 Auth 稽核紀錄（已在報告列明）。
- `--selftest`（不連網、不用金鑰）40 項，涵蓋：金鑰格式、基準讀取失敗、列數不完整、分頁排序、id 已存在、建立結果不明的各種分支、清除只刪 created、HTTP 500／刪後仍存在、中斷、未完成 manifest 的恢復、走查新建資料歸屬、整體判定、非 TTY、原始碼不寫憑證。

---
（以下為舊版分段說明，僅供參考）

# 最終驗收：真並行、真實 HTTP、畫面（測試庫 kucvxpjatptfckhlxptj；正式庫完全不碰）

## 已備妥（不需要任何憑證）
- 隔離本機環境：pg 函式庫裝在暫存目錄（非全域）；`.env.test`（publishable key，**不是**登入 JWT，權限 600、在 repo 之外）。
- `http_anon_check.js`：匿名 HTTP 邊界，**已實跑 11／11 通過**（匿名呼叫四支函式 401／42501；兩張操作表匿名讀寫被拒；內部函式不暴露；不存在函式 404 對照）。
- `concurrency_overlap.js`：兩條重疊交易（重複扣堂、搶最後一堂、取消與扣堂兩種先後、相同操作同時）——**已寫好、語法檢查過，未實跑**（缺資料庫連線）。
- `http_roles.js`：櫃檯成功＋教練／會員／匿名邊界＋操作表直接讀寫——**已寫好，未實跑**（缺 JWT）。
- `fixtures_CC.sql`：夾具（已在測試庫驗證可執行並回滾）與清除步驟。
- `make_test_site.sh`：產生只指向測試庫的「新前端」與「舊前端」本機站；`get_jwt.sh`：用測試帳號換 JWT（密碼隱藏輸入）。

## 只差使用者的 3 件事（全在測試庫，不涉及正式庫、不要貼到對話）
1. **資料庫連線（真並行）**：Supabase 測試庫 → Project Settings → Database → Connection string（Session pooler 或 Direct）。測試庫的資料庫密碼若不記得，可在同頁 Reset database password（測試庫，不影響正式）。把整串存成環境變數 `TEST_DB_URL`（只放你自己的終端機／本機 `.env.test`，**不要貼進對話**）。另需櫃檯員工的 `auth.users.id`（測試庫 `select auth_id from employees where id='e_fd'`）存成 `DESK_AUTH_UID`。
2. **測試帳號（HTTP 與畫面）**：在測試庫 Authentication 為櫃檯、教練、會員各準備一個**測試專用**登入（可用既有測試員工／會員，於 Dashboard 重設其測試密碼；或新建）。然後本機執行 `sh docs/testdb/final/get_jwt.sh <.env.test> DESK <email>`（教練 COACH、會員 MEMBER 各一次）。密碼只在終端機隱藏輸入。
3. **授權建立階段 06＋08 於測試庫（暫時安裝、驗完回復）與 CC- 夾具**：目前測試庫是乾淨基準（已確認）。你說可以，我就安裝、跑 `concurrency_overlap.js`／`http_roles.js`、再回復並比對基準。（若你想自己在終端機操作也可以：`06_*apply` 的測試庫版 `docs/testdb/p0e/p0e_12_apply_quota_refund_testdb.sql`＋08 套用檔去掉正式庫守門。）

## 實跑順序（完成上面三件事後）
1. 安裝 06＋08（測試庫）＋ `fixtures_CC.sql`。
2. `set -a; . <.env.test>; set +a`
3. `node docs/testdb/final/http_anon_check.js`；`JWT 已在 .env.test` → `node docs/testdb/final/http_roles.js`
4. `TEST_DB_URL=… DESK_AUTH_UID=… node docs/testdb/final/concurrency_overlap.js`（證據：`concurrency_evidence.json`：pid、時間線、B 被鎖等待的觀測）
5. 畫面：`sh docs/testdb/final/make_test_site.sh <.env.test>` → 兩個 `python3 -m http.server`（8101 新／8102 舊），用測試帳號登入，照 `docs/prod-release/P0E_ONE_SHOT_AUTHORIZATION_SCOPE_DRAFT.md` A2 走查表走新前端＋新資料庫、舊前端＋新資料庫。
6. 清除 `fixtures_CC.sql` 的 cleanup 區塊、回復 08／06、比對基準（筆數與各表雜湊＝基準、殘留 0）。
