-- 2026-08-22　團體課的「建立」與「整堂取消／刪除」收回櫃檯以上（補 API 層）
--
-- 使用者定案：團課只有櫃檯／店長／管理員能新增與刪除；教練只能動自己的課卡，
-- 要處理自己來不了的團課請用「教練請假」（退課＋發補課券＋留紀錄）。
-- 前端當天已經收好，這一份補的是「直接打 API 就繞過畫面」那條路。
--
-- ════════════════════════════════════════════════════════════════════════
-- ① fn_cancel_booking：教練分支排除團課
--    原本教練只要通過 `b.coach_id = 自己` 就能取消任何一筆 —— 包含整堂團課
--    （一按等於整班解散、名單上每個名額都退課）。
-- ════════════════════════════════════════════════════════════════════════
do $mig$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_cancel_booking';

  newsrc := replace(src,
$old$    if v_emp is null or b.coach_id is distinct from v_emp then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;$old$,
$new$    if v_emp is null or b.coach_id is distinct from v_emp then
      return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
    end if;
    if b.category::text = '小班肌力' then
      return jsonb_build_object('ok',false,'error_code','GROUP.DESK_ONLY','actor','coach');
    end if;$new$);

  if newsrc = src then raise exception '① 字串沒對上，未修改（請人工確認 fn_cancel_booking）'; end if;
  execute newsrc;
end $mig$;

-- ════════════════════════════════════════════════════════════════════════
-- ② 觸發器：教練不能「建立」或「刪除」團課
--
--    ⚠ 為什麼不改 RLS：bk_coach_write 是 FOR ALL，若在 qual／with_check 加上
--      `category <> '小班肌力'`，教練連「更新自己的團課」都會被擋 ——
--      那正好把要留給他的「教練請假」也一起拿掉（請假是 UPDATE，新列仍是小班肌力）。
--      所以改用觸發器，只管 INSERT 與 DELETE，UPDATE 完全不碰。
--
--    放行順序（與既有的 fn_members_guard 同一套寫法）：
--      1. service_role／後端排程（auth.role() 不是 anon/authenticated）→ 放行
--      2. 櫃檯以上（is_staff_desk()，含店長與管理員）→ 放行
--      3. 其餘只要是員工身分（current_staff_role() 不為 null）＋團課 → 擋下
--         會員本來就沒有 bookings 的寫入權限（RLS 只有 SELECT），不受這條影響。
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.fn_bookings_group_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_cat text;
begin
  if coalesce(auth.role(),'') not in ('anon','authenticated') then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  if coalesce(is_staff_desk(), false) then
    return case when TG_OP='DELETE' then old else new end;
  end if;
  v_cat := case when TG_OP='DELETE' then old.category::text else new.category::text end;
  if v_cat = '小班肌力' and current_staff_role() is not null then
    raise exception 'BK.GUARD: 團體課的建立與刪除只有櫃檯以上可以做（教練請改用「教練請假」）';
  end if;
  return case when TG_OP='DELETE' then old else new end;
end $fn$;

drop trigger if exists trg_bookings_group_guard on public.bookings;
create trigger trg_bookings_group_guard
before insert or delete on public.bookings
for each row execute function public.fn_bookings_group_guard();

-- ── 套用後的驗證 ──
-- 冒煙測試（後端身分應該照樣寫得進去，整段 raise 掉不留資料）：
--   do $t$ begin
--     insert into bookings(id,category,date,start_time,duration,status,max_heads,member_ids)
--     values ('BK-TRGTEST-DELETEME','小班肌力',current_date+30,'10:00',60,'booked',5,'[]'::jsonb);
--     delete from bookings where id='BK-TRGTEST-DELETEME';
--     raise exception 'SMOKE_OK';
--   end $t$;
-- 2026-08-22 實跑：SMOKE_OK，且 leftover = 0。
