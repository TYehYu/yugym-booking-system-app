-- ═══════════════════════════════════════════════════════════════════════
-- 正式庫 3/4 階段｜P0-C×P0-E 預約窗口銜接修補｜套用（尚未執行；⚠ 只能對正式庫 rlpiomzplckzqnqrvrwc）
-- ⚠ 需使用者「逐階段」明確授權後才可執行；前一階段必須已部署且驗證通過；整檔單一交易，任何一項檢查失敗整段回滾。
-- ⚠ 若失敗原因是「套用期間有人正在改票券（雜湊不符）」：整段已回滾、沒有影響，請在低流量時段重跑。
-- 守門：叢集識別 7637215626725903220＋有 change_log／fn_table_sigs；測試庫識別會在守門直接中止。
-- ═══════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7637215626725903220' then
    raise exception 'PROD.GUARD: 叢集識別與正式庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is null or not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'PROD.GUARD: 缺少正式庫標記（change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;

do $pre$
declare v_oid oid := to_regprocedure('public.fn_move_booking_ticket(text,text,text)');
begin
  if v_oid is null then raise exception 'TKWINPATCH.ABORT: 找不到 fn_move_booking_ticket（P0-C 尚未部署）'; end if;
  if to_regprocedure('public.fn_tk_window_check(text)') is null or not exists (select 1 from pg_trigger where tgname = 'trg_tk_window_booking_upd') then
    raise exception 'TKWINPATCH.ABORT: P0-E 尚未部署（缺 fn_tk_window_check／預約窗口觸發器）'; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') <> 1 then
    raise exception 'TKWINPATCH.ABORT: fn_move_booking_ticket 有多個簽章'; end if;
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = v_oid) <> '411549f649f4858215e6e03429bb7ce7:13276' then
    raise exception 'TKWINPATCH.ABORT: 目前的 RPC 本體不是審查過的 P0-C 版本，請先重新審查'; end if;
  if coalesce((select proacl::text from pg_proc where oid = v_oid), '') <> '{postgres=X/postgres,authenticated=X/postgres}' then
    raise exception 'TKWINPATCH.ABORT: RPC 的 ACL 與預期不同'; end if;
end
$pre$;

-- ═══════════════════════════════════════════════════════════════════════
-- P0-E × P0-C 銜接修補：fn_move_booking_ticket 加入 TKWIN 透傳與預約窗口跳過旗標（2026-11-16 準備，尚未執行）
-- 這是「獨立的修補 migration」：只用 create or replace 取代 P0-C 已建立的 RPC，不修改 P0-C 工作區的任何檔案。
-- 基底：P0-C 的 20261115_fn_move_booking_ticket.sql 函式本體（md5 411549f649f4858215e6e03429bb7ce7、13276 字元；與測試庫已部署的版本相同）。
-- 與基底的差異恰好 3 處（其餘逐字相同）：
--   ① 第一個 UPDATE 之前：perform set_config('app.tkwin_skip_booking', 'on', true);      跳過預約端窗口檢查（只對本交易有效）
--   ② 成功回傳之前：    perform set_config('app.tkwin_skip_booking', '', true);          還原旗標（失敗隨交易／子交易回滾自動還原）
--   ③ 例外處理：        放行清單加入 sqlerrm like 'TKWIN.%'                              P0-E 窗口錯誤原樣透傳（否則會被轉成 MOVE.INTERNAL_ERROR）
-- 窗口檢查仍由 ticket_logs 的 deduct 觸發器在最終狀態做一次（refund 帳先於 deduct 帳寫入），所以調課後仍會擋下超出窗口的結果。
-- ACL 不變：create or replace 保留既有授權（只有擁有者與 authenticated）；套用檔會核對。
-- 與 P0-E 主 migration（20261116_p0e_checkin_activation.sql）互相獨立：沒套 P0-E 時旗標沒有效果、TKWIN 也不會出現；兩者順序不拘，建議兩者都套完再跑 T19。
-- 回復：docs/testdb/p0e/p0e_09_tkwin_patch_rollback.sql（還原成 P0-C 原版本體）。
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_move_booking_ticket(
  p_from_booking text, p_to_booking text, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_emp       employees%rowtype;
  v_desk      boolean;
  v_f         bookings%rowtype;
  v_t         bookings%rowtype;
  v_tk        member_tickets%rowtype;
  v_now       timestamp := (now() at time zone 'Asia/Taipei');
  v_type      text;
  v_want_cat  text;
  v_tk_cat    text;
  v_nm        text;
  v_sel       ticket_types%rowtype;
  v_tty       ticket_types%rowtype;
  v_sel_ok    boolean := false;
  v_tty_ok    boolean := false;
  v_type_ok   boolean := false;
  v_start_min integer;
  v_d integer; v_r integer; v_dsum integer; v_bad integer; v_rows integer;
  v_n integer;
  v_op text;
begin
  perform set_config('lock_timeout', '3000', true);

  if p_mode is null or p_mode not in ('hold','cancel') then
    return jsonb_build_object('ok',false,'error_code','MOVE.BAD_MODE'); end if;
  if p_from_booking is null or p_to_booking is null or p_from_booking = p_to_booking then
    return jsonb_build_object('ok',false,'error_code','MOVE.BAD_ARGS'); end if;

  -- 0) 身分（取鎖之前）：只有啟用中的員工
  if v_uid is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select * into v_emp from employees where auth_id = v_uid limit 1;
  if not found or coalesce(v_emp.status::text, '') = 'inactive' then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  v_desk := coalesce(is_staff_desk(), false);        -- 正式庫版本含啟用中的店長教練
  v_op := coalesce(v_emp.id, 'system');

  -- 1) 鎖：兩筆預約依 id 排序，再鎖票券
  perform 1 from bookings where id in (p_from_booking, p_to_booking) order by id for update;
  select * into v_f from bookings where id = p_from_booking;
  if not found then return jsonb_build_object('ok',false,'error_code','MOVE.NOT_FOUND'); end if;
  select * into v_t from bookings where id = p_to_booking;
  if not found then return jsonb_build_object('ok',false,'error_code','MOVE.NOT_FOUND'); end if;

  -- 2) 非櫃檯層級：只能調自己的課（主責或代課）；所有布林判斷一律用 is not true，避免 NULL 放行
  if not v_desk then
    if (coalesce(v_emp.role::text, '') = 'coach'
        and (v_f.coach_id = v_emp.id or v_f.substitute_coach_id = v_emp.id)
        and (v_t.coach_id = v_emp.id or v_t.substitute_coach_id = v_emp.id)) is not true then
      return jsonb_build_object('ok',false,'error_code','MOVE.FORBIDDEN'); end if;
  end if;

  -- 3) 預約前置條件
  if v_f.member_id is null or v_f.member_id is distinct from v_t.member_id then
    return jsonb_build_object('ok',false,'error_code','MOVE.NOT_SAME_MEMBER'); end if;
  if v_f.date is null or v_f.start_time is null or v_t.date is null or v_t.start_time is null then
    return jsonb_build_object('ok',false,'error_code','MOVE.BAD_TIME'); end if;
  if coalesce(v_f.category::text, '') = '小班肌力' or coalesce(v_t.category::text, '') = '小班肌力' then
    return jsonb_build_object('ok',false,'error_code','MOVE.GROUP_UNSUPPORTED'); end if;
  if v_f.sibling_of is not null or v_t.sibling_of is not null
     or exists (select 1 from bookings x where x.sibling_of in (p_from_booking, p_to_booking)
                  and x.status::text is distinct from 'cancelled') then
    return jsonb_build_object('ok',false,'error_code','MOVE.SHADOW_CARD'); end if;
  if v_f.contract_id is not null or v_t.contract_id is not null then
    return jsonb_build_object('ok',false,'error_code','MOVE.CONTRACT_HOLD'); end if;
  if v_f.status::text is distinct from 'booked' or coalesce(v_f.pending_contract,false) or v_f.ticket_id is null
     or v_f.checked_in_at is not null or coalesce(v_f.no_show,false) or coalesce(v_f.coach_leave,false) then
    return jsonb_build_object('ok',false,'error_code','MOVE.FROM_STATE'); end if;
  if v_t.status::text is distinct from 'booked' or not coalesce(v_t.pending_contract,false) or v_t.ticket_id is not null
     or v_t.checked_in_at is not null or coalesce(v_t.no_show,false) or coalesce(v_t.coach_leave,false) then
    return jsonb_build_object('ok',false,'error_code','MOVE.TO_STATE'); end if;
  if ((v_t.date::text || ' ' || v_t.start_time)::timestamp) < v_now then
    return jsonb_build_object('ok',false,'error_code','MOVE.TARGET_PAST'); end if;
  if ((v_f.date::text || ' ' || v_f.start_time)::timestamp) <= ((v_t.date::text || ' ' || v_t.start_time)::timestamp) then
    return jsonb_build_object('ok',false,'error_code','MOVE.ORDER'); end if;
  if v_t.partner_id is not null and v_t.partner_id is distinct from v_f.partner_id then
    return jsonb_build_object('ok',false,'error_code','MOVE.PARTNER_CONFLICT'); end if;

  -- 4) 鎖票券並驗證（等價於前端 tkOkForSlot）
  select * into v_tk from member_tickets where id = v_f.ticket_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_STATE'); end if;
  if v_tk.status::text is distinct from 'usable'
     or (v_tk.member_id = v_f.member_id
         or coalesce(public.fn_tk_shared_has(to_jsonb(v_tk.shared_with), v_f.member_id), false)) is not true then
    return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_STATE'); end if;
  if v_tk.expire_date is not null and v_tk.expire_date < v_t.date then
    return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_EXPIRED'); end if;
  if v_tk.start_date is not null and v_tk.start_date > v_t.date and v_tk.activated_at is null then
    return jsonb_build_object('ok',false,'error_code','MOVE.TICKET_NOT_STARTED'); end if;

  -- 4a) 限時段票（tkTimeOk）：週末不可；下課超過 18:00（TK_TIME_END_MIN=1080）不可
  if exists (select 1 from ticket_types tt where tt.id = v_tk.ticket_type_id and coalesce(tt.time_restricted,false)) then
    v_start_min := split_part(v_t.start_time,':',1)::int * 60 + split_part(v_t.start_time,':',2)::int;
    if extract(isodow from v_t.date) in (6,7)
       or v_start_min + coalesce(nullif(v_t.duration,0),60) > 1080 then
      return jsonb_build_object('ok',false,'error_code','MOVE.TIME_RESTRICTED'); end if;
  end if;

  -- 4b) 票種相容（逐條對應 bkTypeIdOf／categoryOfTypeId／ticketCategoryOf／tkTypeOkFor／bkTicketTypeOk）
  --     新預約維持自己的 ticket_type_id；票券維持自己的票種（相容票種時兩者本來就可以不同）。
  v_type := coalesce(v_t.ticket_type_id, case when v_t.category::text = '場租' then 'tt-venue-rental' end);
  if v_type is null then return jsonb_build_object('ok',false,'error_code','MOVE.TYPE_UNKNOWN'); end if;

  select category::text into v_want_cat from ticket_types where id = v_type;
  if v_want_cat is null then
    v_want_cat := case v_type when 'pt' then '私人教練' when 'pt_friendly' then '私人教練'
                  when 'group' then '小班肌力' when 'self_training' then '自主訓練'
                  when 'self_friendly' then '自主訓練' when 'trial' then '體驗' else null end;
  end if;

  select category::text into v_tk_cat from ticket_types where id = v_tk.ticket_type_id;
  if v_tk_cat is null then
    v_tk_cat := case v_tk.ticket_type_id when 'pt' then '私人教練' when 'pt_friendly' then '私人教練'
                when 'group' then '小班肌力' when 'self_training' then '自主訓練'
                when 'self_friendly' then '自主訓練' when 'trial' then '體驗' else null end;
    if v_tk_cat is null then
      v_nm := coalesce(v_tk.plan_name,'') || coalesce((select name from ticket_types where id = v_tk.ticket_type_id),'');
      v_tk_cat := case when v_nm like '%團體%' or v_nm like '%小班%' or v_nm like '%團課%' then '小班肌力'
                       when v_nm like '%自主%' then '自主訓練'
                       when v_nm like '%體驗%' then '體驗'
                       when v_nm like '%教練%' then '私人教練' else null end;
    end if;
  end if;

  -- ⚠ 以下每一個賦值都用 coalesce(...,false)：比對對象為 NULL 時結果是 NULL，
  --   而 `if not NULL` 不會進入拒絕分支 —— 最後一律用 `v_type_ok is not true` 才放行。
  if v_want_cat = '小班肌力' then
    v_type_ok := coalesce(v_tk_cat = '小班肌力', false);
  elsif v_want_cat = '自主訓練' then
    v_type_ok := coalesce(v_tk_cat = '自主訓練', false);
  elsif v_tk.ticket_type_id is not distinct from v_type then
    v_type_ok := true;
  else
    select * into v_sel from ticket_types where id = v_type;              v_sel_ok := found;
    select * into v_tty from ticket_types where id = v_tk.ticket_type_id; v_tty_ok := found;
    -- 規則 2：一般教練課（私人教練、名稱不含「友善」、非 VIP／限定）可接受 VIP／限定票
    if v_sel_ok and v_tty_ok
       and coalesce(v_sel.category::text, '') = '私人教練'
       and coalesce(v_sel.name,'') !~ '友善' and coalesce(v_sel.name,'') !~ 'VIP|限定'
       and coalesce(v_tty.category::text, '') = '私人教練' and coalesce(v_tty.name,'') ~ 'VIP|限定' then
      v_type_ok := true;
    end if;
    -- 規則 3：友善教練課可用一般教練課票（非折抵券；單向）
    if v_type_ok is not true and v_sel_ok and v_tty_ok
       and coalesce(v_sel.category::text, '') = '私人教練' and coalesce(v_sel.name,'') ~ '友善'
       and coalesce(v_tty.category::text, '') = '私人教練' and coalesce(v_tty.name,'') !~ '友善'
       and not (v_tty.id like 'tt-discount-%' or coalesce(v_tty.name,'') ~ '折抵') then
      v_type_ok := true;
    end if;
  end if;
  if v_type_ok is not true then return jsonb_build_object('ok',false,'error_code','MOVE.TYPE_MISMATCH'); end if;

  -- 5) 帳本驗證（對齊 benefit_refund：以 action 算淨額；另外要求 delta 淨額一致、沒有異常紀錄）
  select count(*) filter (where action = 'deduct'),
         count(*) filter (where action = 'refund'),
         coalesce(sum(delta) filter (where action in ('deduct','refund')), 0),
         count(*) filter (where (action = 'deduct' and delta is distinct from -1)
                             or (action = 'refund' and delta is distinct from 1)
                             or (action = 'adjust' and coalesce(delta,0) <> 0)
                             or action::text in ('grant','expire')),
         count(*)
    into v_d, v_r, v_dsum, v_bad, v_rows
    from ticket_logs where ticket_id = v_tk.id and booking_id = p_from_booking;
  if v_rows = 0 then return jsonb_build_object('ok',false,'error_code','MOVE.LEDGER_MISSING'); end if;
  if (v_d - v_r) <> 1 or v_dsum <> -1 or v_bad > 0 then
    return jsonb_build_object('ok',false,'error_code','MOVE.LEDGER_UNSUPPORTED'); end if;

  select count(*) filter (where action = 'deduct'),
         count(*) filter (where action = 'refund'),
         coalesce(sum(delta) filter (where action in ('deduct','refund')), 0),
         count(*) filter (where (action = 'deduct' and delta is distinct from -1)
                             or (action = 'refund' and delta is distinct from 1)
                             or (action = 'adjust' and coalesce(delta,0) <> 0)
                             or action::text in ('grant','expire'))
    into v_d, v_r, v_dsum, v_bad
    from ticket_logs where ticket_id = v_tk.id and booking_id = p_to_booking;
  if (v_d - v_r) <> 0 or v_dsum <> 0 or v_bad > 0 then
    return jsonb_build_object('ok',false,'error_code','MOVE.TO_LEDGER_DIRTY'); end if;

  -- 6) 寫入（不更新 member_tickets）
  -- P0-E 銜接：本函式在同一交易內先改兩筆預約的 ticket_id、再成對寫帳，中間狀態會暫時同時算到新舊兩筆；
  --   先開「跳過預約端窗口檢查」旗標（只對本交易有效、只影響 trg_tk_window_booking），
  --   最後由 ticket_logs 的 deduct 觸發器（refund 已先寫、帳與預約皆為最終狀態）做唯一一次檢查。成功回傳前會還原；失敗隨回滾自動還原。
  perform set_config('app.tkwin_skip_booking', 'on', true);
  update bookings
     set ticket_id = v_tk.id,
         ticket_type_id = coalesce(ticket_type_id, v_f.ticket_type_id, v_tk.ticket_type_id),
         pending_contract = false,
         partner_id = v_f.partner_id
   where id = p_to_booking;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'MOVE.WRITE_CONFLICT' using errcode = 'P0001'; end if;

  if p_mode = 'hold' then
    update bookings set ticket_id = null, pending_contract = true, partner_id = null where id = p_from_booking;
  else
    update bookings set ticket_id = null, status = 'cancelled', cancelled_at = now(), partner_id = null
     where id = p_from_booking;
  end if;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'MOVE.WRITE_CONFLICT' using errcode = 'P0001'; end if;

  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-') || 'a', v_tk.id, 'refund', 1, p_from_booking, v_op,
          '調課帳本搬移：票券移至 ' || p_to_booking);
  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-') || 'b', v_tk.id, 'deduct', -1, p_to_booking, v_op,
          '調課帳本搬移：票券自 ' || p_from_booking || ' 移入');
  insert into ticket_logs (id, ticket_id, action, delta, booking_id, operator, note)
  values (gen_short_id('LG-') || 'c', v_tk.id, 'adjust', 0, p_to_booking, v_op,
          '調課：' || v_f.date::text || ' ' || left(v_f.start_time,5) || ' → ' || v_t.date::text || ' ' || left(v_t.start_time,5)
          || case when p_mode = 'cancel' then '（原課取消）' else '（原課改為待簽約）' end);

  -- 7) 影子卡競態的最後防線（不是完整防護：bookings 沒有 sibling_of 外鍵，另一個連線仍可能在這一行之後、
  --    本交易提交之前插入同行卡；那種情況只會留下一張顯示用的孤兒卡，不影響票券、帳本與預約綁定，
  --    由 docs/testdb/move_ticket_shadow_orphan_scan.sql 偵測）
  if exists (select 1 from bookings x where x.sibling_of in (p_from_booking, p_to_booking)
               and x.status::text is distinct from 'cancelled') then
    raise exception 'MOVE.SHADOW_CARD' using errcode = 'P0001';
  end if;

  perform set_config('app.tkwin_skip_booking', '', true);
  return jsonb_build_object('ok', true, 'mode', p_mode, 'ticket_id', v_tk.id,
                            'from_id', p_from_booking, 'to_id', p_to_booking);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'MOVE.BUSY');
  when others then
    -- 已知的業務錯誤（本函式自己的代碼、月份上限、合約檢查）原樣回傳；其餘一律不外洩內部訊息
    if sqlerrm like 'MOVE.%' or sqlerrm like 'HOLD.MONTH_LIMIT:%' or sqlerrm like 'CONTRACT.%' or sqlerrm like 'TKWIN.%' then
      return jsonb_build_object('ok', false, 'error_code', sqlerrm);
    end if;
    raise warning 'fn_move_booking_ticket internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'MOVE.INTERNAL_ERROR');
end
$fn$;

comment on function public.fn_move_booking_ticket(text, text, text) is
  '調課原子化（P0-C）：同交易搬 ticket_id／partner_id 並成對搬扣退堂帳本；不改 member_tickets。P0-E 銜接：TKWIN 透傳、預約窗口跳過旗標。規則複本的防漂移雜湊見 P0-C migration 檔頭。';

do $post$
declare v_oid oid := to_regprocedure('public.fn_move_booking_ticket(text,text,text)'); v_src text;
begin
  if v_oid is null then raise exception 'TKWINPATCH.POSTCHECK_FAILED: 找不到函式'; end if;
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) || ':' || length(v_src) <> '1f78f02623ce16484004b3cf4aec9934:13628' then raise exception 'TKWINPATCH.POSTCHECK_FAILED: 本體與修補版不符'; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_move_booking_ticket') <> 1 then
    raise exception 'TKWINPATCH.POSTCHECK_FAILED: 出現多個簽章'; end if;
  if coalesce((select proacl::text from pg_proc where oid = v_oid), '') <> '{postgres=X/postgres,authenticated=X/postgres}' then
    raise exception 'TKWINPATCH.POSTCHECK_FAILED: ACL 被改變'; end if;
  if position('app.tkwin_skip_booking' in v_src) = 0 or position('TKWIN.%' in v_src) = 0 then
    raise exception 'TKWINPATCH.POSTCHECK_FAILED: 缺少銜接標記'; end if;
end
$post$;
commit;
