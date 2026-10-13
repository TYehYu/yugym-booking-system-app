-- VIP 加購：運動按摩 2 堂 $2,000（2026-10-13 使用者指示）
--
-- 沿用舊系統的名稱「加購運動按摩」—— 正式庫匯入的 12 張就是這個名字、
-- 同樣是 2 堂 $2,000（$1,000/堂），不要另外取一個新名字讓歷史對不起來。
-- 效期 365 天：使用者定案「跟 VIP 主方案一樣」（VIP 教練課 12 堂就是 365 天）。
-- ⚠ plan_type='vip' → 只出現在銷售的 VIP 那一組，不混進一般方案清單。
-- ⚠ installment=false：$2,000 的加購不需要分期。
-- ⚠ 票種沿用既有的運動按摩 tt-mrghed5b6ke2，不另建票種（另建會多一個不計堂數的出口）。

insert into course_plans
  (id, name, ticket_type_id, format, unit_price, sessions_base, sessions_bonus,
   valid_days, active, plan_type, installment, member_applyable, archived, staff_only)
values
  ('cp-vip-ms2', '加購運動按摩', 'tt-mrghed5b6ke2', '1v1', 1000, 2, 0,
   365, true, 'vip', false, false, false, false)
on conflict (id) do update set
  name=excluded.name, ticket_type_id=excluded.ticket_type_id, format=excluded.format,
  unit_price=excluded.unit_price, sessions_base=excluded.sessions_base,
  valid_days=excluded.valid_days, active=excluded.active, plan_type=excluded.plan_type,
  installment=excluded.installment;
