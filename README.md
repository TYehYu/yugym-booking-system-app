# 有肌訓練預約管理系統

健身房預約與營運管理系統（MVP 2.0），供管理員、櫃台、教練、會員四種角色使用，共用同一份 Supabase 雲端資料。

正式網址：https://tyehyu.github.io/yugym-booking-system-app/

## 功能範圍

預約行事曆、會員與票券管理、教練課與團體課、簽到與出席、員工排班與出勤、營運分析與財務摘要。

## 技術架構

單一 `index.html`（約 22,000 行），無建置流程、無框架，純 HTML/CSS/JS；資料層走 Supabase（含 RLS 與資料庫 RPC）。部署由 GitHub Pages 從 `master` 根目錄直出。

## 主要檔案

- `index.html` — 整個應用程式
- `config.js` — Supabase 連線設定（anon key 為公開金鑰，由 RLS 保護）
- `manifest.json`、`sw.js`、`icon-*.png` — PWA（可加到手機桌面）
- `開啟預約系統.bat` — 本機預覽（啟動 `preview-server.ps1`，埠 8765）
- `docs/` — 設計、安全模型、測試結果與 migration
- `YUGYM-MVP2-Supabase遷移.md` — 建表 SQL 與遷移設計

## 接手開發先看

1. `CLAUDE.md` — 開發慣例與資料層規則
2. `docs/HANDOFF.md` — 目前狀態、待辦、回退方法
3. `docs/SECURITY_MODEL.md` — 角色與 RLS 設計

## 注意事項

- **推上 `master` = 直接上線**，櫃台與教練實際在用，推送前務必確認改動已驗證。
- 本專案處理真實會員個資，勿將會員清單、CSV、Excel 進版控，亦勿把真實個資搬到測試環境或本機。
