-- 陳玟勳單張票補正｜唯讀驗證（只有 SELECT；補正前後各跑一次）
select id, member_id, plan_name, status::text, sessions_total, sessions_remaining, valid_days, start_date, expire_date, activated_at, to_jsonb(t) ->> 'activation_mode' as activation_mode
  from member_tickets t where id = 'TK-mvp2vrdxd4h8';
select action::text, delta, booking_id, left(note, 80) as note, created_at from ticket_logs where ticket_id = 'TK-mvp2vrdxd4h8' order by created_at;
-- 其他票券快照（補正前後必須相同；與 00 的雜湊不同，這裡排除了這一張）
select count(*) as n_other_tickets, md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), '')) as other_hist_md5
  from member_tickets where id <> 'TK-mvp2vrdxd4h8';
-- 預期（補正後）：start_date 2026-11-02、expire_date 2026-11-29、activated_at 2026-11-02 00:00+08、sessions 1／4、activation_mode 空、帳本 5 筆（多 1 筆 adjust／delta 0「補正（BACKFILL-05B）…」）
