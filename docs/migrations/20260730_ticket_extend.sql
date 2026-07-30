-- 票券展延（2026-07-30 使用者指示，對應合約〔展延規則〕：
-- 課程到期後可申請展延一次，展延期限同原方案期限；展延之課程不得申請退費）
alter table member_tickets add column if not exists extended_at   timestamptz;
alter table member_tickets add column if not exists extended_by   text;
alter table member_tickets add column if not exists extended_from date;   -- 展延前的原到期日（撤銷時還原用）
alter table member_tickets add column if not exists no_refund     boolean not null default false;

comment on column member_tickets.extended_from is '展延前的原到期日；有值即代表這張票已用掉「展延一次」的額度';
comment on column member_tickets.no_refund is '不得申請退費（展延過的課程、抽獎獎品）';
