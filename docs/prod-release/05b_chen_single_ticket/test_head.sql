-- 陳玟勳單張票補正｜測試庫隔離驗證（單一交易、結尾必定 raise exception 回滾；只能對測試庫 kucvxpjatptfckhlxptj）
-- 核心區塊與 05b_apply／05b_rollback 逐字相同（只在執行時把票券／會員／票種／方案四個常數換成夾具值）。結果在 CHEN_BF_RESULT: 之後。
do $t$
declare
