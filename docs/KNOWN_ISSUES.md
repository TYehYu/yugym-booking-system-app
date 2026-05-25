# 已知問題

這份文件記錄反覆出現或尚未完全確認的問題。

## 目前尚待確認

### Supabase 尚未正式啟用

問題：

- 目前資料主要存在瀏覽器本機。
- 家裡、公司、Codex 內建瀏覽器、外部 Chrome 可能看到不同資料。

影響：

- 重新整理、換瀏覽器或換電腦時，資料可能不一致。

目前處理方式：

- 展示版先使用假資料。
- 程式碼用 GitHub 同步。

之後建議：

- 完成 Supabase 第一階段同步。

### 文件可能需要定期更新

問題：

- 專案需求變動很快，文件可能落後。

影響：

- Codex 接續時可能讀到舊規則。

目前處理方式：

- 新增 `docs/MAINTENANCE.md` 作為保養流程。

之後建議：

- 每完成一大段功能，就更新 `CURRENT_STATUS`、`NEXT_ACTIONS`、`SYSTEM_RULES`、`DECISION_LOG`。

## 已改善

### 長對話造成接續速度變慢

問題：

- 對話累積太長，Codex 每次需要花時間重新整理上下文。

處理：

- 新增 `docs/CURRENT_STATUS.md`。
- 新增 `docs/MAINTENANCE.md`。
- 新增 `docs/NEXT_ACTIONS.md`。
- 新增 `docs/DECISION_LOG.md`。
- 新增 `docs/KNOWN_ISSUES.md`。
