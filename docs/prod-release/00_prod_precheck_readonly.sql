-- 正式庫｜部署前唯讀檢查（只有 SELECT；尚未執行）。結果與 2026-11-15 盤點相比，任何一項不同都先停下來重新評估。
select (select system_identifier::text from pg_control_system()) = '7637215626725903220' as sysid_is_prod,
       (to_regclass('public.change_log') is not null) as has_change_log;
-- 預期：以下新物件全部不存在（0 列）
select proname from pg_proc where pronamespace='public'::regnamespace and (proname in ('fn_move_booking_ticket','fn_bk_attended','fn_coach_leave_comp','fn_refund_ticket','trg_tk_quota_guard') or (proname like 'fn_tk_%' and proname <> 'fn_tk_shared_has') or proname like 'trg_tk_%');
select column_name from information_schema.columns where table_schema='public' and table_name='member_tickets' and column_name='activation_mode';
-- 預期：依賴齊全（4 列）、notify_recipient 含 desk
select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('desk_alert','gen_short_id','fn_tk_shared_has','is_staff_desk') order by 1;
select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='notify_recipient' order by e.enumsortorder;
-- 部署前基準（記錄下來，之後各階段驗證用）：票券數與歷史雜湊、各表筆數
select count(*) as n_tickets, md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) as hist_md5 from member_tickets;
select (select count(*) from bookings) as bookings, (select count(*) from ticket_logs) as ticket_logs;
-- 已知待處理資料（P0-C 之前調課留下，不是本次部署造成；部署前後不應改變）：未來預約綁票但無淨扣課
select b.id, b.ticket_id from bookings b where b.ticket_id is not null and b.date >= (now() at time zone 'Asia/Taipei')::date and b.status::text not in ('cancelled','no_show','coach_leave')
   and coalesce((select sum(case l.action::text when 'deduct' then 1 when 'refund' then -1 else 0 end) from ticket_logs l where l.ticket_id=b.ticket_id and l.booking_id=b.id),0) <= 0;
