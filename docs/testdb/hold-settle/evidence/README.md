# CC1–CC5 真並行驗證原始證據（測試庫 kucvxpjatptfckhlxptj）
- `hold_settle_conc_report.json`：執行器原始報告（整體判定 `HS_CONC_COMPLETE`；44 通過／0 失敗；略過 0；待處理 0；資料表差異無、登入帳號與測前相同）。每個案例的兩個請求原始 HTTP 回應、真並行證據（持鎖者看到對手被擋、等的鎖就是持鎖者的 advisory／txid 鎖）都在 `evidence.cases`。
- `hold_settle_conc_manifest.json`：本輪建立／清除的追蹤檔（`finished: true`）。內含測試登入的假信箱（`@cc-test.yugym.local`）與已刪除的測試 Auth 帳號 id；**沒有任何金鑰、JWT、密碼**。
- 憑證掃描（2026-11-16，保存前）：JWT 形式、`sb_secret_`／`sb_publishable_`、Bearer、apikey、password、access／refresh token、service_role 字樣、長 base64 字串——兩個檔案皆 0 命中。
- 執行環境：測試庫暫裝階段 06／08／11 實際版本＋本函式 rev5（本體 md5 `cdae07ef…`）＋ `phase_install_hs_zz.sql`；指紋核對通過後才開始；跑完已拆除並核對基準（函式 60／policies 70／grants 799／觸發器 21／資料表 29／列數 57,26,29,0,0）。
