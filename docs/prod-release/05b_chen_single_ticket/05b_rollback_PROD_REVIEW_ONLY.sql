-- ═══════════════════════════════════════════════════════════════════════
-- 陳玟勳單張票效期補正｜回復（只在票券仍是補正後的樣子才還原）
-- ⚠ 只供審查；**尚未在任何正式庫執行**；執行需使用者一次明確批准這一張票（Codex 審查之後）。測試庫已用隔離夾具驗證（見 test 檔）。
-- 對象：只有 TK-mvp2vrdxd4h8（陳玟勳，團課 4週優惠）。依已確認原則：首次實際簽到日 2026-11-02 起算、2026-11-29 到期（28 天含起算日）、不改堂數、保留完整補正紀錄。
-- 前提不成立（身分、狀態、效期欄位、帳本、最早簽到日、歧義、其他票雜湊）任何一項就整段中止、回滾，沒有任何寫入。
-- 相容性（程式碼證據見 05b 說明）：P0-E 前後都能跑；刻意不寫 activation_mode（＝「舊制已開通」）——P0-E 的 fn_tk_activate 對已開通票不動作、fn_tk_recalc 只處理 activation_mode='checkin'，所以日後撤銷簽到也不會把這張票的效期重算位移。
-- ═══════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then raise exception 'PROD.GUARD: 叢集識別不是正式庫，停止'; end if;
  if to_regclass('public.change_log') is null then raise exception 'PROD.GUARD: 沒有 change_log，不像正式庫，停止'; end if;
end
$guard$;
do $rbk$
declare
  c_ticket   constant text := 'TK-mvp2vrdxd4h8';
  c_member   constant text := 'm1a1779dd9cefb3b';
  c_plan     constant text := '團課 4週優惠';
  c_type     constant text := 'tt-mqdt4ubv8e5i';
  c_first    constant date := date '2026-11-02';
  c_expire   constant date := date '2026-11-29';
  c_valid    constant integer := 28;
  c_total    constant integer := 4;
  c_rem      constant integer := 1;
  c_sig      constant text := 'BACKFILL-05B';
  c_b1       constant text := 'BK-mt9upc8jeyp3';   -- 11/02 已簽到
  c_b2       constant text := 'BK-mt9upcchql3q';   -- 11/09 已簽到
  c_b3       constant text := 'BK-mt9upcgf0vqo';   -- 11/16 已報名未到
  t member_tickets%rowtype; v_n integer; v_g integer; v_d integer; v_dd integer; v_adj integer; v_all integer; v_sum bigint; v_exp_act timestamptz := (c_first::timestamp at time zone 'Asia/Taipei'); v_hash_before text; v_hash_after text;
begin
  select * into t from member_tickets where id = c_ticket for update;
  if not found then raise exception 'BACKFILL.ROLLBACK_ABORT: 找不到票券'; end if;
  -- 只在「仍然是補正後的樣子」才還原；之後被人改過（展延、手動調整、撤銷簽到重算…）就中止，不蓋掉
  if t.start_date is distinct from c_first or t.expire_date is distinct from c_expire or t.activated_at is distinct from v_exp_act
     or (to_jsonb(t) ->> 'activation_mode') is not null or t.member_id is distinct from c_member or t.status::text <> 'usable'
     or (to_jsonb(t) ->> 'extended_at') is not null or (to_jsonb(t) ->> 'extended_from') is not null then
    raise exception 'BACKFILL.ROLLBACK_ABORT: 票券已不是補正後的樣子（start=% expire=% activated_at=% status=%），不還原', t.start_date, t.expire_date, t.activated_at, t.status; end if;
  -- 任何寫入之前，完整核對票種／方案／效期天數／堂數／狀態與帳本（補正後有新增使用、退款或其他調整就拒絕，改走重新審查）
  if t.ticket_type_id is distinct from c_type or t.plan_name is distinct from c_plan or t.valid_days is distinct from c_valid
     or t.sessions_total is distinct from c_total or t.sessions_remaining is distinct from c_rem then
    raise exception 'BACKFILL.ROLLBACK_ABORT: 票種／方案／效期天數／堂數與補正當時不同（type=% plan=% valid_days=% total=% rem=%），不還原', t.ticket_type_id, t.plan_name, t.valid_days, t.sessions_total, t.sessions_remaining; end if;
  select count(*), count(*) filter (where action::text = 'grant' and delta = 4 and booking_id is null),
         count(*) filter (where action::text = 'deduct' and delta = -1 and booking_id in (c_b1, c_b2, c_b3)),
         count(distinct booking_id) filter (where action::text = 'deduct' and delta = -1 and booking_id in (c_b1, c_b2, c_b3)),
         count(*) filter (where action::text = 'adjust' and delta = 0 and booking_id is null and note like '補正（' || c_sig || '）%'),
         coalesce(sum(delta), 0)
    into v_all, v_g, v_d, v_dd, v_adj, v_sum from ticket_logs where ticket_id = c_ticket;
  if v_all <> 5 or v_g <> 1 or v_d <> 3 or v_dd <> 3 or v_adj <> 1 or v_sum <> c_rem then
    raise exception 'BACKFILL.ROLLBACK_ABORT: 帳本已不是「補正後」的樣子（共 % 筆；grant % deduct % 補正帳 % delta 總和 %）——補正之後有使用、退款或其他調整，或已還原過，不還原，請重新審查', v_all, v_g, v_d, v_adj, v_sum; end if;
  select md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_hash_before from member_tickets where id <> c_ticket;
  update member_tickets set start_date = null, expire_date = null, activated_at = null
   where id = c_ticket and start_date = c_first and expire_date = c_expire and activated_at = v_exp_act;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'BACKFILL.ROLLBACK_ABORT: 條件式更新影響 % 列（應為 1）', v_n; end if;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-'), c_ticket, 'adjust', 0, null, 'system', '補正還原（' || c_sig || '）：效期恢復未啟用；原補正紀錄帳保留作稽核');
  select * into t from member_tickets where id = c_ticket;
  if t.start_date is not null or t.expire_date is not null or t.activated_at is not null or t.sessions_remaining <> c_rem or t.sessions_total <> c_total then
    raise exception 'BACKFILL.ROLLBACK_POSTCHECK_FAILED'; end if;
  select md5(coalesce(string_agg(id || '|' || coalesce(activated_at::text,'') || '|' || coalesce(start_date::text,'') || '|' || coalesce(expire_date::text,'') || '|' || coalesce(sessions_remaining::text,'') || '|' || coalesce(status::text,''), ',' order by id), ''))
    into v_hash_after from member_tickets where id <> c_ticket;
  if v_hash_after is distinct from v_hash_before then raise exception 'BACKFILL.ROLLBACK_POSTCHECK_FAILED: 其他票券被改動'; end if;
end
$rbk$;
commit;
