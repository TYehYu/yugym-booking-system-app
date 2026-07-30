/* 自主訓練改期的重複判定，對齊「預約」那一套（2026-07-30 使用者提問）
   fn_member_self_book 早就放行「自主訓練 vs 自主訓練」的同時段重疊（同一帳號可約多個名額，
   名額由場地容量決定），但 fn_member_self_reschedule 擋掉任何重疊 —— 同時段有兩筆自主訓練
   的會員，想把其中一筆往後移半小時會被 BOOKING.DUP 擋下（重新預約反而可以）。
   ⚠ 原本就有 x.id<>b.id，「跟自己那一筆」不會誤擋；這裡修的是「跟自己另一筆」。
   完整函式定義見 Supabase migration 20260730_reschedule_self_dup_rule。
   關鍵差異只有一行：dup 檢查加上 and x.category::text <> '自主訓練' */
