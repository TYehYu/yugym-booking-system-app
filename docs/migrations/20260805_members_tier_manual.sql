-- 2026-08-05 使用者指示：管理員帳號可調整會員等級（已套用）
-- 同日二修：「只是這個月升級，但升降級制度還是要」——
-- tier_manual regular/loyal＝調整「起點」（配 tier_manual_at 設定日），
-- 自動判定從設定當月起以該等級照規則繼續重播；vip＝鎖定不受升降影響。
-- 恢復自動時前端會一併清掉 tier_manual_at 與舊制的 level='vip'。
-- fn_members_guard 白名單沒有這兩欄 → 會員本人改不了；櫃檯以上可寫（UI 上僅管理員開放全部選項）。
alter table public.members add column if not exists tier_manual text;
alter table public.members add column if not exists tier_manual_at date;
