-- ═══════════════════════════════════════════════════════════════════════
-- 提案（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc，且需使用者明確授權後才可跑「第二段」）
-- 目的：補正「已有實際簽到、效期卻仍是未開通」的票券（2026-11-15 陳玟勳「團課 4 週優惠」案例的同類）。
-- 規則（沿用 P0-E 規則 2）：起算日＝最早一次實際簽到的上課日；到期日＝起算日 + valid_days − 1；
--   不改堂數、不碰其他票；每張票寫一筆 adjust／delta 0 的痕跡帳。通用條件，不針對任何單一會員。
-- 為什麼要一次性補正：P0-E 的觸發器只在「簽到事件」啟用，不會回溯歷史（規則 8：歷史資料不批次修改）；
--   這些票是 P0-E 之前，會員自行報名（fn_member_join_group 不寫效期）等不經前端的路徑造成的。
-- 前置：先完成 P0-E（member_tickets.activation_mode 欄位存在）。第一段是唯讀乾跑，可以隨時跑。
-- ═══════════════════════════════════════════════════════════════════════

-- ── 第一段：唯讀乾跑（2026-11-15 實跑：只命中 3 張；1 張仍在使用、2 張已用完；0 張有歧義）──
with net as (
  select l.ticket_id, l.booking_id from ticket_logs l group by 1,2
  having sum(case l.action::text when 'deduct' then 1 when 'refund' then -1 else 0 end) > 0
), att as (
  select b.ticket_id as tk, b.date as d, b.checked_in_at as at, b.id as bk from bookings b
   where b.ticket_id is not null and b.category::text <> '小班肌力' and b.status::text in ('checked_in','completed')
  union all
  select n.ticket_id, b.date, b.checked_in_at, b.id from net n join bookings b on b.id = n.booking_id join member_tickets t on t.id = n.ticket_id
   where b.category::text = '小班肌力'
     and exists (select 1 from jsonb_each_text(coalesce(b.attendance,'{}'::jsonb)) a where a.value = 'checked_in' and (a.key = t.member_id or a.key like t.member_id || '#%'))
), multi as (
  select n.booking_id, t.member_id from net n join member_tickets t on t.id = n.ticket_id group by 1,2 having count(*) > 1
)
select t.id, t.plan_name, t.status::text as st, t.valid_days, t.sessions_total as tot, t.sessions_remaining as rem,
       min(a.d) as first_attended, (min(a.d) + (t.valid_days - 1)) as proposed_expire, count(distinct a.bk) as n_attended,
       bool_or(exists (select 1 from multi m where m.booking_id = a.bk and m.member_id = t.member_id)) as ambiguous
  from member_tickets t join att a on a.tk = t.id
 where t.activated_at is null and t.start_date is null and t.expire_date is null and coalesce(t.valid_days,0) > 0
 group by t.id, t.plan_name, t.status, t.valid_days, t.sessions_total, t.sessions_remaining
 order by min(a.d) desc;

-- ── 第二段：補正（需授權；整段註解保護，授權後由人逐條確認再取消註解）──
-- 建議只處理 st='usable' 且 ambiguous=false、且有剩餘堂數的票；已用完的票只是顯示「未開通」，可選擇性處理。
-- begin;
--   -- 庫識別守門（正式庫）：叢集識別 7637215626725903220、有 change_log
--   do $g$ begin
--     if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then raise exception 'PROD.GUARD'; end if;
--   end $g$;
--   -- 目標清單請手動貼上第一段確認過的票券 id（不要用條件自動帶入）：
--   -- update member_tickets t set start_date = x.first_d, expire_date = x.first_d + (t.valid_days - 1),
--   --        activated_at = coalesce(x.first_at, x.first_d::timestamptz), activation_mode = 'checkin'
--   --   from (select ticket_id, min(d) first_d, min(at) first_at from <第一段的 att> where ticket_id in ('<TK-…>') group by 1) x
--   --  where t.id = x.ticket_id and t.activated_at is null and t.start_date is null and t.expire_date is null;
--   -- insert into ticket_logs(id, ticket_id, action, delta, operator, note)
--   --   select gen_short_id('LG-'), id, 'adjust', 0, 'system', '補正：已有簽到但效期未開通，依最早簽到課程日起算（P0-E 規則 2）' from member_tickets where id in ('<TK-…>');
-- commit;
