-- 薪資規則按月保存 + 店長獎金兩段門檻（2026-08-02 使用者指示）
--   ①「目前獎金門檻是 80 堂 4000、100 堂追加 2000，所以給我兩個設定門檻」
--   ②「每個員工的薪資規則每個月都要獨立，有可能七月跟八月的薪資條件會有所不同，
--      但是要先沿用上個月的條件」
--
-- 原本規則只存「現在」一份：八月一調薪，回頭看七月的薪資單也會變成新條件，
-- 跟當時實際發出去的錢對不上。改成一個月一份快照存在 pay_rules。
--   pay_rules = { "2026-07": {...規則欄位...}, "2026-08": {...} }
-- 算某個月的薪資時取「不晚於那個月」的最後一份快照；沒設過的月份往前沿用
-- （這就是「先沿用上個月的條件」）。見 index.html 的 empAtMonth / empRuleAt。
alter table employees add column if not exists pay_rules jsonb;

-- 店長獎金改成兩段門檻（門檻②為「追加」）：
--   leader_t1 / leader_b1 ＝ 第一段門檻課堂 / 獎金（預設 80 堂 $4,000）
--   leader_t2 / leader_b2 ＝ 第二段門檻課堂 / 追加獎金（預設 100 堂 +$2,000）
-- 滿 100 堂 ＝ 4000 + 2000 ＝ 6000。leader_t2 填 0 ＝ 不用第二段。
-- （取代 20260802_leader_bonus_per_coach.sql 的 leader_target / leader_bonus，
--   那兩欄從未寫入正式資料，直接停用即可。）
alter table employees
  add column if not exists leader_t1 integer,
  add column if not exists leader_b1 integer,
  add column if not exists leader_t2 integer,
  add column if not exists leader_b2 integer;
