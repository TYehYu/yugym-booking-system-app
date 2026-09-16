-- 2026-09-16 常用動作加分類
-- 使用者：「常用動作四列分類 上肢推 上肢拉 下肢推 下肢拉 其他
--          這個在手機端也可以一併優化」
--
-- 五個分類（順序就是畫面上頁籤的順序）：
--   上肢推／上肢拉／下肢推／下肢拉／其他
--
-- ⚠ 為什麼不沿用既有的 TL_BODY_PARTS（功能性／上肢／下肢）：
--   那一組是 training_logs 的「部位」，粒度與語意都不同（沒有推／拉之分），
--   而且 0911 之後新增動作已經不問部位了（body_part 多半是空的）。
--   兩者混用會讓「上肢」同時有兩種意思，所以另開一欄。
--
-- ⚠ 不設 default、不加 NOT NULL：null 就是「還沒分類」，讀取端一律當「其他」。
--   這樣新教練加動作時不必被迫先選分類，也不會因為回填失敗留下半套狀態。
-- ⚠ 不做 check 約束：分類清單是前端的常數，日後使用者要增減一類不必再動資料庫。
--   （值寫錯頂多歸到「其他」，不會壞資料。）
-- ⚠ RLS 不動：授權依據仍是 coach_id（cxe_select／cxe_write 都是「admin 或自己的」）。
-- ⚠ trg_change_log 已經在這張表上，加欄位不需要重建觸發器。
alter table public.coach_exercises
  add column if not exists category text;

comment on column public.coach_exercises.category is
  '動作分類：上肢推／上肢拉／下肢推／下肢拉／其他。null＝還沒分類，讀取端當「其他」。與 training_logs.body_part（功能性／上肢／下肢）是不同的兩套，不要混用。';
