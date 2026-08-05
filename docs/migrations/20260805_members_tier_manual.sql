-- 2026-08-05 使用者指示：管理員帳號可調整會員等級（已套用）
-- members.tier_manual：手動鎖定等級（'regular'|'loyal'|'vip'，null＝自動判定）。
-- effTier 以此凌駕自動升降制；恢復自動時前端會一併清掉舊制的 level='vip'。
-- fn_members_guard 白名單沒有此欄位 → 會員本人改不了；櫃檯以上可寫（UI 上僅管理員開放全部選項）。
alter table public.members add column if not exists tier_manual text;
