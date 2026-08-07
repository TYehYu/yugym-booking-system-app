-- 2026-08-07　LINE 上課提醒對 55 位會員（綁定者的 40%）從來沒送出去過
--
-- 怎麼找到的：
--   今天上線的「⚠ 提醒送不到」標記在陳瀚竣身上亮起來，錯誤訊息不是預期的「沒加好友」，
--   而是 LINE 回 400：The property, 'to', in the request body is invalid。
--   查他的 members.line_user_id → **小寫 u 開頭**；LINE 的 userId 規格是 U + 32 位小寫十六進位。
--   全庫一數：135 位綁定者中 55 位是小寫 u ⇒ 這 55 位的每一則推播都被 LINE 拒收。
--
-- 根因：
--   兩支 RPC 都是從 Supabase Auth 的假 email 反推 uid（line_{uid}@line.yugym.local），
--   而 Auth 會把 email 正規化成**全小寫**，於是首字母 U 變成 u。
--   大寫的那 80 位是別的路徑（前端直接寫 id_token 的 sub）綁的，所以一直收得到 ——
--   這也是為什麼問題一直沒被發現：有一半的人是正常的。
--
-- 修法：
--   ① 新增 fn_line_uid_fix()：只把 '^u[0-9a-f]{32}$' 的首字母還原成 U，其餘原樣不動
--      （不做無差別 upper()，那會把 32 位 hex 也弄壞）。
--   ② members 55 筆、employees 0 筆 一次性修正。
--   ③ fn_review_member_link_request、fn_complete_member_registration 兩支反推之後一律過這支。
--
-- 已透過 Supabase migration `fix_line_uid_case` 與後續 CREATE OR REPLACE 套用到正式庫。
-- 驗證：修正後 members 綁定者 135 位全部符合 '^U[0-9a-f]{32}$'。
create or replace function public.fn_line_uid_fix(p text)
returns text language sql immutable as $$
  select case when p ~ '^u[0-9a-f]{32}$' then 'U' || substring(p from 2) else p end
$$;

update public.members   set line_user_id = fn_line_uid_fix(line_user_id) where line_user_id ~ '^u[0-9a-f]{32}$';
update public.employees set line_user_id = fn_line_uid_fix(line_user_id) where line_user_id ~ '^u[0-9a-f]{32}$';

-- 兩支 RPC 的差異只有這一行（完整內容見資料庫）：
--   - select substring(u.email from '^line_(.+)@line\.yugym\.local$') into v_line_uid
--   + select fn_line_uid_fix(substring(u.email from '^line_(.+)@line\.yugym\.local$')) into v_line_uid
