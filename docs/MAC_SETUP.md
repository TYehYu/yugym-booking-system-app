# Mac 開發環境建置與風險控管清單

> 建立：2026-07-23，配合開發機從 Windows 換到 Mac。
> **repo 為公開**，本檔零金鑰、零密碼、零漏洞細節。所有機密改由私有 repo
> `TYehYu/yugym-private-ops` 承載（見 §1）。
> 逐步操作與 Windows/Mac 差異見 `HANDOFF.md` §7、§7b；本檔專注在**不要出事**的檢查項。

---

## 1. 機密檔案從哪來

測試帳密與資安鑑識紀錄**不在本 repo**（`.gitignore` 擋著 `PRIVATE_DO_NOT_UPLOAD_*`）。
它們放在另一個 **private** repo：

```bash
git clone https://github.com/TYehYu/yugym-private-ops.git
```

放在主 repo **之外**的同層目錄，不要 clone 成子目錄（否則有被主 repo 收進版控的風險）。

| 需要的東西 | 在 private repo 的位置 |
|---|---|
| 測試庫 url / anonKey | `config.test.js` |
| 四角色測試帳號與密碼 | `security-incident-20260716.md` §7 |
| 兩起資安事件的完整鑑識紀錄 | `security-incident-20260716.md` |

**那個 repo 必須永遠保持 private。** 內容含可直接複製的攻擊步驟。

---

## 2. 開工順序（照做，不要跳）

```bash
# ① 兩個 repo 都 clone，放在同層
git clone https://github.com/TYehYu/yugym-booking-system-app.git
git clone https://github.com/TYehYu/yugym-private-ops.git
cd yugym-booking-system-app

# ② 換成測試庫設定 —— 在做任何事之前
cp ../yugym-private-ops/config.test.js ./config.js

# ③ 立刻上防誤推保護
git update-index --skip-worktree config.js

# ④ 驗證保護生效：config.js 不該出現在變更清單
git status --short
```

第 ②③ 步的順序不能顛倒，也不能省。**repo 內的 `config.js` 指向正式庫**（GitHub Pages
部署需要它），全新 clone 一開起來就是連正式庫——那裡有 440 位真實會員、2,229 張票券。
在正式庫上「測試」等於改真實營運資料。

要改回正式庫（推版前更新該檔時）：`git update-index --no-skip-worktree config.js`。

---

## 3. 每次開工的檢查項

```bash
git status --short                    # 應乾淨，且 config.js 不出現
grep -o 'url:.*' config.js            # 應是測試庫，不是 rlpiomzplckzqnqrvrwc
git log origin/master..HEAD --oneline # 應為空（無未推 commit）
```

瀏覽器再確認一次：登入後看會員數。測試庫是個位數到數十筆的種子資料，
正式庫是 440 位。**數字對不上就是連錯庫，立刻停手。**

---

## 4. 推版前的檢查項

推 `master` = **直接上線**（GitHub Pages，1~2 分鐘生效，櫃台/教練/會員正在用）。

- [ ] `index.html` 改完跑過語法檢查（漏一個大括號 = 全站白畫面）
- [ ] `APP_VERSION` / `APP_VERSION_LABEL` 已更新，格式 `YYMMDD.HHmm`，**用實際時間**
- [ ] `git status` 確認 `config.js` 沒被一起 commit（skip-worktree 應已擋掉）
- [ ] 本機測試庫實測過要上的功能
- [ ] `git diff --cached` 掃一遍，確認沒有金鑰、密碼、真實個資混進去

---

## 5. 不得進入本 repo 的東西

`.gitignore` 目前擋 `PRIVATE_DO_NOT_UPLOAD_*`、`member-import.js`、`*.xlsx`、`*.xls`、`*.csv`。
**但那是檔名比對，換個名字就失效**——實際判準是內容：

- 任何密碼、access token、service_role key
- 可直接複製的攻擊步驟或 payload
- 真實會員個資（姓名、電話、票券、出勤、財務）
- 未修補漏洞的細節

前車之鑑：2026-07-16 測試密碼寫進 `docs/` 推上公開 repo，commit 已推送後
**git 歷史消不掉**（改寫歷史需 force push 且 GitHub 可能留快取），最後只能換密碼收場。
**推出去就撤不回來**，寧可多看一眼 `git diff --cached`。

---

## 6. 改資料庫時的固定檢查

新增 `SECURITY DEFINER` 函式或 Edge Function 時，逐項確認：

- [ ] `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;` —— **明確寫出，不要依賴預設值**
      （PostgreSQL 預設把 EXECUTE 給 `PUBLIC`，`anon` 也是成員）
- [ ] 只 `GRANT` 給實際需要的角色（前端 RPC 通常只需 `authenticated`）
- [ ] **函式內自行檢查呼叫者身分**（`is_any_staff()` / `current_member_id()` / `is_admin()`）
- [ ] Edge Function 不可只靠 `verify_jwt` —— **anon key 本身就是合法 JWT 且公開在 `config.js`**，
      需要管理員權限的動作必須驗呼叫者的 access_token 並查 `employees.role`
- [ ] 部署後用**公開 anon key** 實際打一次，確認回 `42501` / `403` / `AUTH.FORBIDDEN`

**RLS 綠燈 ≠ 系統安全。** RLS 只保護資料表的直接讀寫；`SECURITY DEFINER` 函式與
Edge Function 是兩條完全獨立的路徑，各自驗。兩起實際事件都出在這裡。

---

## 7. 待處理的風險項

- [ ] **輪替正式庫 anon key**（Supabase → API Settings → rotate）。舊 key 已在公開 repo
      流傳多時。目前所有路徑都受 RLS / RPC 授權保護，屬殘餘風險，但輪替可收斂。
      **輪替後要同步更新 `config.js` 並推版**，否則線上會連不上。
- [ ] 檢查 `auth.users` 有無非預期帳號、管理員密碼是否曾被改動
      （Supabase → Authentication → Users，看 `updated_at` 異常者）。
- [ ] 會員自助申辦上線前，為 `member_signup` 加簡易節流（同 IP／同手機頻率）。

---

## 8. 其他 Mac 差異

- 本機預覽：`python3 -m http.server 8000`，開 `http://localhost:8000`（`config.js` 需同層）。
  Windows 那台 python 壞掉才改用 Node 版腳本，Mac 直接用 python3 即可。
- 換行：repo 內 CRLF/LF 混雜，Mac 的 git 預設 `autocrlf=input` 即可。
  若 diff 出現整檔變更，先確認不是換行造成的。
- `/__preview` 三角色手機預覽頁是會話用 scratchpad，不在 repo，新機器要請 Claude 重建。
- 多角色驗證：用不同無痕視窗分別登入。**密碼請自己輸入，不要交給 Claude 代打。**
