# 有肌訓練預約管理系統

這是一個給健身房後台使用的預約與會員管理原型，重點是讓老闆、店長或櫃台可以快速查看預約、管理會員票券、安排教練課與團體課。

## 目前狀態

- 可在本機瀏覽器操作。
- 目前預設使用展示資料，不會連到真實會員資料庫。
- 資料主要存在瀏覽器本機，若要多台電腦共用資料，需要接上 Supabase 或其他後端資料庫。
- 會員真實資料不要上傳到 GitHub 或公開雲端資料夾。

## 如何開啟

最簡單方式：

1. 點兩下 `開啟預約系統.bat`。
2. 等黑色視窗出現啟動訊息。
3. 開啟 `http://127.0.0.1:8765/index.html`。
4. 使用期間請保留黑色視窗；關掉視窗後，本機網址會停止服務。

如果只是看靜態頁，也可以直接打開 `index.html`，但建議用本機網址測試，畫面與功能比較穩定。

## 主要檔案

- `index.html`：頁面結構。
- `css/app.css`：畫面樣式。
- `js/app.js`：預約、會員、課程、教練與資料邏輯。
- `assets/`：Logo 與圖片素材。
- `docs/`：系統規則、專案結構、跨電腦開發說明。
- `supabase-schema.sql`：Supabase 資料表建立語法。
- `SUPABASE_SETUP.md`：Supabase 設定說明。

## 接續開發先看

如果隔天、換電腦、或換人接手，請先看：

- `docs/CURRENT_STATUS.md`
- `docs/NEXT_ACTIONS.md`
- `docs/SYSTEM_RULES.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/MAINTENANCE.md`

## GitHub 與跨電腦工作

程式碼可以放在 GitHub，這樣家裡與公司都可以接續更新同一個專案。

注意：GitHub 同步的是「程式碼」，不是每台瀏覽器裡的本機操作資料。正式要讓家裡、公司、員工端共用同一份會員與預約資料，需要接 Supabase。

詳細流程請看：

- `docs/WORK_FROM_COMPANY.md`
- `SUPABASE_SETUP.md`

## 隱私提醒

這個專案可能會處理真實會員姓名、電話、生日、付款與預約紀錄。正式使用前，請先完成：

- 移除測試用或真實匯入的 Excel 檔。
- 確認 `.gitignore` 有排除會員清單、CSV、Excel。
- 資料庫開啟權限控管。
- 員工帳號與操作權限分級。
