# Supabase 設定說明

Supabase 是之後讓家裡、公司、員工端、會員端共用同一份資料的後端資料庫。

## 目前狀態

目前系統預設還是展示模式：

```text
DEMO_DATA_MODE = true
SUPABASE_URL = ""
SUPABASE_ANON_KEY = ""
```

也就是說：

- 畫面可以操作。
- 目前資料主要存在瀏覽器本機。
- 不同瀏覽器或不同電腦不會自動共用資料。
- 展示版不會連到真實 Supabase 資料庫。

## 需要準備的資料

要正式串接 Supabase，需要兩個公開連線資訊：

```text
Project URL
anon public key
```

請不要提供 `service_role key`。那是管理員等級金鑰，不能放進前端網頁。

## 建立資料表

1. 打開 Supabase 專案。
2. 進入 `SQL Editor`。
3. 新增一個 query。
4. 打開本專案的 `supabase-schema.sql`。
5. 複製內容貼到 Supabase SQL Editor。
6. 按 `Run`。

目前的資料表是簡化版，只先用一張 `app_state` 儲存整包系統資料，適合從本機展示版過渡到雲端同步。

## 串接到系統

資料表建立完成後，再到 `js/app.js` 設定：

```js
const SUPABASE_URL = "你的 Project URL";
const SUPABASE_ANON_KEY = "你的 anon public key";
const DEMO_DATA_MODE = false;
```

設定後重新整理頁面，系統才會開始讀寫 Supabase。

## 重要提醒

現在這份 Supabase schema 是「第一階段同步方案」，目標是先讓多台電腦看到同一份資料。

正式營運前，建議再拆成更完整的資料表，例如：

- members：會員資料。
- bookings：預約資料。
- ticket_buckets：會員票券。
- recharge_records：儲值紀錄。
- staff_members：教練與員工。
- course_items：課程。
- ticket_items：可販售票券。
- audit_logs：操作紀錄。

這樣之後才能做更細的權限、報表、薪資與資料追蹤。
