-- 2026-08-08 使用者更正：「平日 17:30 也是不能預約友善教練課的時間」。
--
-- 限時段票券（友善教練課、友善自主訓練點）的規則本來就是「18:00 之前的時段」，
-- 看的應該是下課時間 —— 原本比的是開始時間 < 18:00，
-- 於是 17:30 開始的 60 分鐘課排得進去，實際上到 18:30。
--
-- 前端 validateBooking（0b 段）與 tkTimeOk 已同步改成看下課時間，
-- 這裡把會員自助預約的 RPC 一起改（該 RPC 固定 60 分鐘）。
--
-- ⚠ 改之前查過正式庫：既有的友善課最晚就是 17:00 開始（18:00 下課，98 筆），
--   一筆 17:30 都沒有 —— 這個改動不會讓任何既有預約變成違規。
do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_member_self_book';
  if position('v_dow in (0,6) or v_ns >= 1080' in d) = 0 then
    raise exception 'fn_member_self_book 的限時段判斷已不是預期的樣子，請人工確認';
  end if;
  d := replace(d, 'v_dow in (0,6) or v_ns >= 1080', 'v_dow in (0,6) or v_ns + 60 > 1080');
  execute d;
end $do$;
