-- 2026-08-04 使用者指示：「會員票券也新增一項家庭成員，該票券預設由該成員使用，方便預約」
--（已套用於正式庫）
--
-- 票券指定預設使用人（members.family_members 裡的稱呼，如「爸爸」）。
-- 預約扣到這張票時，若沒有另外指定使用人，trial_name 自動帶入 ——
-- 課卡直接顯示「王小明（爸爸）」（bkName 的家庭成員顯示，同日上線）。
-- 設定入口：會員資料 → 票券卡「使用人」（櫃檯以上、該會員有家庭成員時顯示）。
alter table public.member_tickets add column if not exists family_user text;
