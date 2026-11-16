# 教練請假補償：併發手動驗證（尚未執行；只能對測試庫 kucvxpjatptfckhlxptj）

單一交易的 SQL 測試無法證明併發安全，需兩條獨立連線：

1. 準備：一張已啟用、有 `expire_date` 的票，與同一自然週內兩堂都標成 `coach_leave` 的預約 A、B（同票）。
2. 連線 1：`begin; select fn_coach_leave_comp('A');`（先不 commit）。
3. 連線 2：`begin; select fn_coach_leave_comp('B');` — 應卡在票券列鎖（3 秒後回 `COMP.BUSY`，或等連線 1 commit）。
4. 連線 1 `commit`；連線 2 重打（或鎖等到後）→ 預期 `none / week_done`。
5. 驗證：`expire_date` 只多 7 天；`ticket_logs` 該週只有 1 筆「教練請假展延 7 天」。
6. 反向：撤銷 A、B 的兩條連線同時呼叫 → 只會有 1 筆「展延已收回」，到期日只退 7 天。
7. 清理：用 `docs/testdb/p0e/` 的清理腳本或手動還原該票。
