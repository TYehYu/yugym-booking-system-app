-- 2026-08-23　員工也要有 LINE 通知開關
--
-- 使用者指示：「手機端的帳戶資訊這邊，第一列是通知設定，管理員應該也要有。
--   這個通知設定移除點選後跳視窗的模式，直接把開關設計在這個頁面就好。」
--
-- 【現況是壞的】
--   前端「通知設定」對教練開著，但那個視窗讀寫的是 members.line_notify：
--     openNotifSettings → sb.from('members').select('line_notify').eq('id', SESSION.id)
--     saveNotifSettings → sb.rpc('fn_set_line_notify')
--   employees 根本沒有 line_notify 這一欄，而 fn_set_line_notify 第一行就是
--     v_mid := current_member_id();  if v_mid is null then return AUTH.NOT_MEMBER;
--   所以教練按「儲存」一定失敗（畫面顯示「儲存失敗：AUTH.NOT_MEMBER」），
--   從來沒有人能關掉自己的 LINE 通知。
--
-- 【這一份做兩件事】
--   ① employees 補 line_notify（預設 true ＝ opt-out，與 members 同一套語意）
--   ② fn_set_line_notify 同時認員工與會員：員工身分先比對，其次才是會員
--
-- 【誰會讀它】（Edge Function 另外部署，見 docs/edge/）
--   ・line-push-daily　v12：教練的「會員繳費／續約」提醒
--   ・line-daily-report v6：每日 22:00 的戰報與教練當日課堂數
--   兩支都改成「line_notify === false 就跳過」，與會員端同一條規則。
--   ⚠ 沒有做成「分項開關」（戰報一項、收款提醒一項）—— 前端只有一顆開關，
--     做成分項而畫面上關不到，會變成另一種說謊。

-- ════════════════════════════════════════════════════════════════════════
-- ① 欄位
-- ════════════════════════════════════════════════════════════════════════
alter table public.employees
  add column if not exists line_notify boolean not null default true;

comment on column public.employees.line_notify is
  'LINE 通知總開關（opt-out，預設開）。false＝不推播戰報與繳費提醒。2026-08-23';

-- ════════════════════════════════════════════════════════════════════════
-- ② fn_set_line_notify：員工與會員共用
--    ⚠ 一定要「員工先判斷」：管理員預覽會員視角時 current_member_id() 仍是 null，
--      順序反過來只是多繞一圈，但若日後有人同時是員工與會員（實務上有，
--      教練自己也買課），員工身分才是他登入用的那一個。
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.fn_set_line_notify(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_on  boolean := coalesce(p_on, true);
  v_eid text := current_employee_id();
  v_mid text := current_member_id();
begin
  if v_eid is not null then
    update employees set line_notify = v_on where id = v_eid;
    return jsonb_build_object('ok', true, 'line_notify', v_on, 'who', 'employee');
  end if;
  if v_mid is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH.NOT_MEMBER');
  end if;
  update members set line_notify = v_on where id = v_mid;
  return jsonb_build_object('ok', true, 'line_notify', v_on, 'who', 'member');
end $function$;

-- ── 套用後的驗證 ──
-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema='public' and table_name='employees' and column_name='line_notify';
--   → boolean / true / NO
-- select count(*) filter (where line_notify) as 開著, count(*) as 全部 from employees;
--   → 兩個數字應該相等（預設全開）
