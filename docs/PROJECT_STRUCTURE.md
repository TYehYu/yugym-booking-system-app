# 專案結構說明

這份文件協助之後接手專案的人快速知道每個檔案的用途。

## 核心檔案

- `index.html`
  - 預約系統的主要頁面。
  - 放置側邊選單、行事曆、會員管理、課程管理、教練管理、營運摘要與彈跳視窗的 HTML 結構。

- `css/app.css`
  - 所有畫面樣式。
  - 包含側邊欄、行事曆、預約小卡、會員小卡、課程管理、彈跳視窗、右下角提示訊息等樣式。

- `js/app.js`
  - 主要功能邏輯。
  - 包含資料初始化、預約規則、會員資料、票券儲值、課程管理、教練管理、營運摘要、Supabase 讀寫與畫面更新。

- `assets/`
  - Logo 與圖片素材。

- `docs/`
  - 規則文件、專案說明與跨電腦開發說明。

## 啟動檔

- `開啟預約系統.bat`
  - 一鍵啟動本機預覽服務。

- `start-booking-system.ps1`
  - 啟動本機服務並開啟瀏覽器。

- `preview-server.ps1`
  - 本機小型網頁伺服器。
  - 使用期間黑色視窗要保持開著。

## 後端與雲端

- `supabase-schema.sql`
  - 建立 Supabase 第一階段同步用的資料表。

- `SUPABASE_SETUP.md`
  - 說明如何建立 Supabase 資料表、設定 Project URL 與 anon public key。

## 文件

- `AGENTS.md`
  - Codex 之後進入專案時要遵守的工作規則。

- `README.md`
  - 給人快速了解與開啟專案。

- `docs/SYSTEM_RULES.md`
  - 預約、票券、會員、教練與營運規則。

- `docs/WORK_FROM_COMPANY.md`
  - 如何在公司電腦繼續製作與更新。

## 目前資料儲存方式

目前預設是展示模式：

- 程式碼存在專案檔案裡。
- 操作資料主要存在瀏覽器本機。
- Chrome 與 Codex 內建瀏覽器的本機資料可能不同步。
- 換電腦後，要靠 GitHub 同步程式碼。
- 真正要讓資料同步，需要接 Supabase。

## 修改時的建議位置

- 改畫面排版：優先看 `css/app.css`。
- 改預約規則：優先看 `js/app.js` 裡的 `validateSelection`、`validateBookingMove`、`capacityFor`。
- 改行事曆排列：優先看 `renderCalendar`、`arrangeBookingLanes`。
- 改會員票券：優先看 ticket bucket、recharge、booking progress 相關區塊。
- 改課程管理：優先看 course item 與 ticket item 相關區塊。
- 改教練或營運摘要：優先看 staff、salary rules、operations summary 相關區塊。
## 2026/05/25 新增串接文件

- `docs/FRONTEND_INTEGRATION.md`
  - 管理端、會員端、教練端共用資料的串接規格。
  - 包含給太太的交接訊息、資料模型、權限原則、第一版開發順序。
- `supabase-frontend-schema.sql`
  - 正式多端同步用的 Supabase 資料表草案。
  - 目前是草案，不會取代現有展示版 `app_state` 同步方式。
