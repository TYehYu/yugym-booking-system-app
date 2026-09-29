/* 生日禮金：每位員工一個開關（2026-09-29 使用者：「生日禮金可以手動調整嗎　我要取消rocky的」）

   現況：生日禮金完全自動 —— 只要員工的生日月對上「這張薪資單發放時的月份」
   （birthPayMonthOf，9 月薪資 10/5 發，所以 10 月壽星掛在 9 月那張），
   就加 G.birthday_bonus（1,000）。全系統沒有任何地方關得掉。

   起因是 Rocky（林柏灝）—— **合作教練**（employment_type=contractor），
   10/17 生日，9 月薪資單會自動加 1,000。

   ⚠ 使用者選的是「每位員工一個開關」，不是「合作教練一律不發」——
     所以不要在程式裡按 employment_type 判斷，規則由人去決定。

   ⚠ 用「關掉」當旗標（birthday_bonus_off）而不是「開啟」：
     預設 false＝照發，既有三十幾位員工完全不受影響，也不必回填。 */

alter table public.employees
  add column if not exists birthday_bonus_off boolean not null default false;

comment on column public.employees.birthday_bonus_off is
  '關掉這位員工的生日禮金（預設 false＝照發）。2026-09-29 新增，合作教練等不適用的情況用它。';

/* ⚠ 不需要 GRANT：employees 是既有的表，權限與 RLS 照舊
   （2026/10/30 的新規只管「之後新建的表」，見 CLAUDE.md）。 */
