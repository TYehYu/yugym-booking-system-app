-- 2026-08-08 使用者定案：「課程如果是因為"教練請假"該堂課該方案期限延長一週，
-- 如果是會員請假才給補課券」。
--
-- 教練課的教練請假是「退票＋效期＋7 天＋改成自主訓練」，status 會變成 'coach_leave'。
-- 團體課沒辦法改成自主訓練（一堂好幾個人），做法是「整堂取消＋逐名額退票＋效期各＋7 天」，
-- status 會變成 'cancelled' —— 光看 status 分不出「教練沒來」與「會員自己取消」，
-- 而後者才是補課券的適用情形。加一個旗標記錄取消的原因。
--
-- 教練課那條也一併寫入這個旗標，兩種做法用同一個欄位查得到。
alter table public.bookings add column if not exists coach_leave boolean;
comment on column public.bookings.coach_leave is
  '因教練請假而取消／改為自主訓練：票券已退回且效期延長 7 天，依規定不補發補課券（2026-08-08）';
