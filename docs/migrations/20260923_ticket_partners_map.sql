-- ══ 1V2 同行：每一位可用人各自一位同行人（2026-09-23 定版）═════════════════
-- 使用者確認的模型：
--   「兒子買了1v2票共享給爸爸　在爸爸的共享票這邊設定同行媽媽
--     用爸爸的名字預約的時候就會看到 [爸爸][媽媽]
--     如果在兒子設定同行爸爸　用兒子的名字預約就會看到[兒子][爸爸]」
--
-- 也就是：**在誰的票卡上設，就是設誰的同行人**。同一張票可以有好幾組，互不影響。
--   partners = { "<上課那位的 member_id>": "<他的同行人 member_id>" }
--
-- ⚠ 為什麼不是同日稍早那個單一欄位 partner_id：
--   一張票只有一格，做不到「爸爸那邊是媽媽、兒子那邊是爸爸」。
--   partner_id 欄位留著不刪（沒有任何資料），程式已改讀 partners，
--   只在「持有人」那一格當最後退路（見 tkPartnerOf）。
--
-- ⚠ 共享與同行是**正交**的兩件事（使用者當天重新定義）：
--   ・共享 shared_with：A 買票跟其他人一起使用 —— 1V1、1V2 都可以，回答「誰能用堂數」
--   ・同行 partners   ：1V2 限定 —— 回答「這堂是哪兩位」，
--     目的是「讓兩個會員都看得到預約，以及教練要填寫兩人的訓練紀錄」
--   同行者**不扣課、不能拿這張票約課**（使用者：「只有一位付錢、另一位跟著上」）。
alter table member_tickets
  add column if not exists partners jsonb not null default '{}'::jsonb;

comment on column member_tickets.partners is
  '1V2 同行：{上課那位的 member_id: 他的同行人 member_id}。在誰的票卡上設就是設誰的。'
  '⚠ 不扣同行者的課、他也不能拿這張票約課——那是 shared_with 在做的事。';

-- 同行者要看得到「以他為同行人」的那幾堂課
drop policy if exists bookings_select_partner on bookings;
create policy bookings_select_partner on bookings
  for select
  using (
    ticket_id is not null and member_id is not null
    and exists (
      select 1 from member_tickets t
       where t.id = bookings.ticket_id
         and t.partners ->> bookings.member_id = (select current_member_id())
    )
  );
