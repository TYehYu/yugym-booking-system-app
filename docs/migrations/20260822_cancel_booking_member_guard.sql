-- 2026-08-22　fn_cancel_booking：會員的身分把關對 NULL 靜默失效
--
-- 使用者定案：「會員在團課的部分 只能取消自己的課卡，不能影響後台開課的團課」。
-- 前端從來沒有那個入口，但 fn_cancel_booking 的 EXECUTE 是給 authenticated 的，
-- 直接打 API 就繞得過畫面。
--
-- 【成因】
--   else
--     v_actor := 'member';
--     if current_member_id() is null or current_member_id() <> b.member_id then
--       return AUTH.FORBIDDEN;
--     end if;
--
--   團課的 bookings.member_id 一律是 NULL（學員在 member_ids 裡）。
--   `current_member_id() <> NULL` 得到的是 NULL，不是 true；
--   `false or NULL` 還是 NULL；`if NULL then` 不成立 —— 整條把關被靜默跳過。
--   （與 0821 那次「plpgsql NULL 讓規則失效」同一類問題。）
--
--   接著只剩下一道：
--     v_legacy_group := (category='小班肌力') and (member_ids 長度 = 0);
--     if v_actor='member' and not v_self_training and not v_legacy_group then DESK_ONLY;
--   v_legacy_group 原意是「舊資料：一列一人的團課」，但寫成「名單是空的」，
--   於是「後台已開課、還沒人報名」的班剛好符合 → 穿過 DESK_ONLY，再過 24 小時檢查，
--   就把整堂課 status 改成 cancelled。
--
-- 【影響範圍】任何登入的會員，可取消所有「空名單、24 小時以後」的團課。
--   套用當下正式庫有 57 堂符合。已報名的班不受影響（v_legacy_group 為 false，會被 DESK_ONLY 擋下）。
--
-- 【修法】身分那一行改成 NULL-safe：member_id 是 NULL 就直接 FORBIDDEN。
--   團課一律 member_id IS NULL → 會員永遠進不去這支，只能走 fn_member_leave_group
--   （那支只從 member_ids 移掉自己的一個名額、退自己一堂，完全不碰 status／date／
--    start_time／coach_id／max_heads）。
--   舊資料那種「member_id 有值的一列一人團課」照舊放行 —— 那正是 v_legacy_group 的原意，
--   身分那道本來就過得了，行為不變。
--
-- 【作法】用 pg_get_functiondef + replace 就地換那一行，不手抄整支函式，避免打錯其他地方；
--   字串沒對上就 raise，不會靜靜地什麼都沒改。

do $mig$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_cancel_booking';

  newsrc := replace(src,
    'if current_member_id() is null or current_member_id() <> b.member_id then',
    'if current_member_id() is null or b.member_id is null or current_member_id() is distinct from b.member_id then');

  if newsrc = src then
    raise exception '把關字串沒對上，未做任何修改（請人工確認 fn_cancel_booking）';
  end if;
  execute newsrc;
end $mig$;

-- 複查（套用後應為新版）
-- select substring(pg_get_functiondef('public.fn_cancel_booking'::regproc)
--        from position('v_actor := ''member''' in pg_get_functiondef('public.fn_cancel_booking'::regproc)) for 200);
