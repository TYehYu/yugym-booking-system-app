# Supabase 測試／正式環境同步

## 唯一來源

`docs/migrations/` 是 schema、RPC、RLS 的唯一版本來源。禁止只在 Dashboard 手動修改正式專案。

## 每次發布

1. 記錄兩個專案目前的 migration 清單、Edge Functions 名稱與版本。
2. 先把缺少的 migration 依檔名順序套到測試專案。
3. 執行 `LAUNCH_UAT_CHECKLIST.md`，尤其是匿名與四角色權限。
4. 執行 Supabase database/security advisors，P0 問題必須歸零。
5. 備份正式資料，記錄發布前 migration 版本。
6. 逐支套用正式 migration；每支完成後執行 read-only smoke test。
7. 比較兩邊 migration、函式定義雜湊、RLS policies 與 Edge Functions，差異必須為零。

## 本批預定順序

1. `20260719_01_checkin_reward_policy.sql`
2. `20260719_02_member_registration_and_legacy_link.sql`

目前測試專案連線權限不足；取得權限前不可宣稱環境已同步。

