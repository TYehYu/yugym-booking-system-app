# LINE 官方帳號會員入口

## 目標流程

官方帳號圖文選單 → LIFF URL → LINE Login → 後端驗證 ID token → YUGYM 會員帳號 → 新會員建立或舊會員連結審核。

## 必要設定

- 建立 LINE Login channel，並與 YUGYM LINE 官方帳號連結。
- 建立 LIFF app，Scope 至少 `openid`、`profile`；需要 email 才另外申請。
- Endpoint URL 與 Callback URL 必須使用正式 HTTPS 網址。
- 將 LIFF URL 填入 `config.js` 的 `lineLiffUrl`。
- LINE Channel Secret 只能存於 Supabase Edge Function secret，禁止放在 `config.js` 或瀏覽器。
- 後端必須驗證 LINE ID token；前端傳來的 profile／userId 不可直接信任。

## 尚待提供

- LINE Login Channel ID
- LIFF ID／LIFF URL
- 正式站 HTTPS 網址與 callback path
- 官方帳號是否要求登入時同時加好友

取得以上設定前，LINE 按鈕維持隱藏，手機＋密碼登入仍可用。

