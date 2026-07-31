/* 撤回「會員自己可以一次訂兩台跑步機」（2026-07-31 使用者當日改口）

   理由（使用者原話）：會員端自己只能一次約一個名額，要同時約兩台就請櫃檯處理，
   避免一次多筆預約有失公平。

   → fn_member_self_book 還原成只收一台（5 參數版）。
   「一堂佔兩台」的能力仍然保留，但只在櫃檯端：預約明細的場地燈號開關
   （venueUnitDots／bkToggleVenueUnit），第二台是不綁票、不扣點的同行使用預約。
   bookings.sibling_of 欄位維持，那是櫃檯端在用的。

   ⚠ 同日稍早的 20260731_self_book_two_units 已被本檔取代，不要再套用那一支。
   完整函式定義見正式庫；本檔只記錄決策與差異。 */
drop function if exists public.fn_member_self_book(date, text, text, text, text, text);
-- 5 參數版的完整定義見 20260729 系列與正式庫（本次只是把第 6 個參數 p_venue_unit2 拿掉）
