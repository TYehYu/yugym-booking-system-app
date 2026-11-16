# 教練手機體驗課測試（測試庫 kucvxpjatptfckhlxptj）

- `coach_report.json` 為**原始報告，未修改**：overall=FAILED，唯一原因是清除步驟對 `ticket_deduct_ops`、`booking_op_rev` 送 DELETE 得到 HTTP 404。
- 404 原因：這兩張暫存表在目前測試庫（06+08 基準）已不存在，不是資料沒清掉；報告內 diff 為 tablesChanged=[]、authUsersChanged=false。
- 後續唯讀基準核對（2026-11-16，測試庫）：bookings 57、member_tickets 26、ticket_logs 29、members 11、venues 1、employees 6、auth.users 6；各表雜湊與基準一致；函式 60、觸發器 21、資料表 29；CC-* 預約 0、通知 0。
- 本次發布只含：快速預約體驗課過濾、版本號、coachquicktrialtest、coachhomev2test 正則、本證據。
