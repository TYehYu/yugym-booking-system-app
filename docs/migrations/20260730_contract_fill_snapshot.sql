-- 合約的「購買內容」快照（2026-07-30 使用者回報「會員端票券的合約內容太少了」）
-- 原本只存合約條文 body_snapshot，會員看不到自己買的方案／堂數／金額／分期各期。
alter table contracts add column if not exists fill_snapshot text;
comment on column contracts.fill_snapshot is '簽約當下的「購買內容」表格 HTML 快照（會員端檢視與列印共用）';
