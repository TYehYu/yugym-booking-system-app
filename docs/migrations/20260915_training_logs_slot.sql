-- 2026-09-15 1V2 的訓練紀錄分兩份
-- 使用者：「如果是1v2 上方用兩個標籤頁1跟2 不用填名字 教練自己會知道就好」
--
-- 背景（查證過的事實）：
--   ・1V2 的 booking 是單人單張（member_id 一個人、sibling_of 全 null、同時段只有一張）
--   ・489 張 1V2 票只有 11 張設了 shared_with，而且那 11 張實際約課的也只有持有人
--   ・扣課是一堂一點，沒有一堂扣兩點
--   → 系統對 1V2 的認知就是「一張票、一個人」，第二位學員在資料裡不存在
--
-- 使用者選擇：不登記第二位是誰，只用 1／2 頁籤，教練自己知道。
-- 所以第二位的紀錄掛在第一位的 member_id 上，用 slot 區分：
--   slot = null 或 1 → 第一位（所有舊資料都是這個，不必回填）
--   slot = 2         → 第二位
--
-- ⚠⚠ 加了這個欄位，**所有「以會員身分看自己」的讀取端都必須濾掉 slot=2**，
--    否則第一位會員會看到別人的動作與重量，而且他的三大項 PR 會被另一個人的成績蓋掉
--    （PR 完全從 training_logs 推導，沒有獨立來源）。
--    前端已處理的地方：ppOpenTraining／PP 快取／mem_training／m_training／
--    抽屜的 memAllLogs 與 memLogs／tlOpenExerciseHistory。
-- ⚠ RLS 不動：授權依據仍是 member_id／coach_id。這代表 slot=2 的紀錄在資料庫層
--    仍屬於第一位會員 —— 防線在前端，不是在 RLS。這是「不填名字」方案的必然代價。
-- ⚠ trg_change_log 已經在這張表上，加欄位不需要重建觸發器。
alter table public.training_logs
  add column if not exists slot smallint;

comment on column public.training_logs.slot is
  '1V2 的第幾位學員：null/1=第一位（舊資料皆此），2=第二位。第二位沒有自己的 member_id，紀錄掛在第一位身上，靠這一欄區分。';
