-- ═══════════════════════════════════════════════════════════════════════
-- P0-E：教練請假補償（2026-11-17 準備，尚未執行；只建檔，不執行 migration）
--
-- 規則（業務已定案，沿用 2026-08-30 的每週上限）：
--   ・同一會員、同一張方案票券、同一個「週一～週日」自然週，教練請假補償最多延長 7 天；
--     週的歸屬看「上課那一天」；同一週不論請假 1 天、7 天或多次，一律只延 7 天。
--   ・不同週可以累加：2 週 +14 天、3 週 +21 天；不依請假堂數累加；不增加票券堂數。
--   ・同週撤銷再請假不得重複補償；同週「全部」有效請假都撤銷後，撤回該週的 7 天；只撤銷其中一堂、同週還有別堂有效請假 → 不撤回。
--   ・P0-E 的效期重算（fn_tk_recalc、fn_tk_activate）不得清除已核准的補償天數。
--   ・補償紀錄可追溯、可去重：以現有 ticket_logs 為基礎，不新增資料表、不新增欄位（沿用 8/30 的帳本格式）。
--
-- 補償紀錄（ticket_logs；adjust／delta 0／booking_id＝觸發這次動作的請假預約）：
--   展延：note ＝ 'YYYY-MM-DD 教練請假展延 7 天（舊到期日 → 新到期日）'   （日期是上課日，用來決定是哪一週）
--   收回：note ＝ 'YYYY-MM-DD 教練請假展延已收回 7 天（舊 → 新）'
--   某票某週「已核准補償」＝ 該週的展延筆數 − 收回筆數 > 0（校正／被標記收回的 0830 舊紀錄不算）。
--
-- 原子操作：fn_coach_leave_comp(預約, 票券清單)
--   鎖票券列 → 數「這一週這張票還有幾堂有效請假」→ 對照帳本淨額 → 才決定延長／撤回／不動。
--   狀態由資料決定、可重複呼叫、同時呼叫也不會重複延長（第二個進來時帳本已經是已補償）。
--   有效請假 ＝ 預約屬於這張票（bookings.ticket_id 或帳本上有這張票對這堂的紀錄），且 status='coach_leave' 或 coach_leave 旗標為真。
--   沒有到期日的票（尚未簽到啟用、永久有效）不補償（沿用 8/30 規則）。
-- 授權：RPC 只授權 authenticated（函式內驗證是啟用中的員工：櫃檯層級，或該堂的主責／代課教練）；其餘函式不開放任何 API 角色。
--
-- 需要的資料庫變更：新增 3 個函式（fn_tk_leave_comp_weeks、fn_tk_leave_comp_days、fn_coach_leave_comp_week 內部用）＋
--   RPC fn_coach_leave_comp；以 create or replace 取代 P0-E 的 fn_tk_activate、fn_tk_recalc。沒有新欄位、沒有資料回填、不改任何既有資料列。
-- 套用：docs/testdb/p0e/p0e_10_apply_leave_comp_testdb.sql（守門＋前置條件＋後置檢查）；回復：p0e_10_leave_comp_rollback.sql。
-- ═══════════════════════════════════════════════════════════════════════

-- 1) 某票「已核准補償」的自然週清單（帳本淨額 > 0 的週一）
create or replace function public.fn_tk_leave_comp_weeks(p_ticket text) returns setof date
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare r record; v_wk date; v_net jsonb := '{}'::jsonb; v_key text; k text; v text;
begin
  for r in select l.note from ticket_logs l
            where l.ticket_id = p_ticket and l.action::text = 'adjust'
              and l.note ~ '^\d{4}-\d{2}-\d{2} 教練請假展延'
              and (l.note ~ '^\d{4}-\d{2}-\d{2} 教練請假展延已收回' or (l.note !~ '收回' and l.note !~ '校正'))
            order by l.created_at, l.id loop
    begin
      v_wk := date_trunc('week', (substring(r.note from '^(\d{4}-\d{2}-\d{2})'))::date::timestamp)::date;
    exception when others then continue;                                   -- 日期壞掉的紀錄略過，不讓重算失敗
    end;
    v_key := v_wk::text;
    v_net := jsonb_set(v_net, array[v_key], to_jsonb(coalesce((v_net->>v_key)::integer, 0)
                       + case when r.note ~ '^\d{4}-\d{2}-\d{2} 教練請假展延已收回' then -1 else 1 end));
  end loop;
  for k, v in select key, value from jsonb_each_text(v_net) loop
    if v::integer > 0 then return next k::date; end if;
  end loop;
  return;
end
$$;

-- 2) 已核准補償天數（每週 7 天）
create or replace function public.fn_tk_leave_comp_days(p_ticket text) returns integer
language sql stable security definer set search_path to 'public','pg_temp'
as $$ select 7 * count(*)::integer from public.fn_tk_leave_comp_weeks(p_ticket) $$;

-- 3) 單張票、單一自然週的補償同步（內部用；呼叫端要先處理授權）
create or replace function public.fn_coach_leave_comp_week(p_ticket text, p_week date, p_booking text, p_class_date date, p_op text)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_valid integer; v_comp boolean; v_from date; v_to date; v_line text; v_st date;
begin
  select * into t from member_tickets where id = p_ticket for update;       -- 同一張票的並行呼叫在這裡排隊
  if not found then return jsonb_build_object('ticket_id', p_ticket, 'action', 'none', 'reason', 'noticket'); end if;
  select count(*) into v_valid from bookings x
   where date_trunc('week', x.date::timestamp)::date = p_week
     and ( x.ticket_id = p_ticket
           or exists (select 1 from ticket_logs l where l.ticket_id = p_ticket and l.booking_id = x.id) )
     and ( x.status::text = 'coach_leave' or coalesce(to_jsonb(x)->>'coach_leave', 'false') = 'true' );
  v_comp := exists (select 1 from public.fn_tk_leave_comp_weeks(p_ticket) w where w = p_week);

  if v_valid > 0 and not v_comp then                                         -- 這週有有效請假、還沒補償 → 延 7 天
    if t.expire_date is null then
      return jsonb_build_object('ticket_id', p_ticket, 'action', 'none', 'reason', 'noexp');
    end if;
    v_from := t.expire_date; v_to := v_from + 7;
    -- 動效期之前先把方案天數固定下來（沿用 8/30：只在原本是空的時候寫，不覆蓋賣票時談好的天數）
    if coalesce(t.valid_days, 0) <= 0 then
      v_st := coalesce(t.start_date, t.purchase_date);
      if v_st is not null and (v_from - v_st) > 0 then t.valid_days := (v_from - v_st); end if;
    end if;
    v_line := to_char(p_class_date, 'YYYY-MM-DD') || ' 教練請假展延 7 天（' || to_char(v_from, 'YYYY/MM/DD') || ' → ' || to_char(v_to, 'YYYY/MM/DD') || '）';
    update member_tickets
       set expire_date = v_to, valid_days = t.valid_days,
           note = case when coalesce(btrim(note), '') <> '' then btrim(note) || E'\n' || v_line else v_line end
     where id = p_ticket;
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, coalesce(p_op, 'system'), v_line);
    return jsonb_build_object('ticket_id', p_ticket, 'action', 'grant', 'week', p_week, 'from', v_from, 'to', v_to);

  elsif v_valid = 0 and v_comp then                                          -- 這週已經沒有任何有效請假、但還留著補償 → 撤回 7 天
    v_from := t.expire_date; v_to := case when t.expire_date is null then null else t.expire_date - 7 end;
    v_line := to_char(p_class_date, 'YYYY-MM-DD') || ' 教練請假展延已收回 7 天（'
              || coalesce(to_char(v_from, 'YYYY/MM/DD'), '無到期日') || ' → ' || coalesce(to_char(v_to, 'YYYY/MM/DD'), '無到期日') || '）';
    update member_tickets
       set expire_date = v_to,
           note = case when coalesce(btrim(note), '') <> '' then btrim(note) || E'\n' || v_line else v_line end
     where id = p_ticket;
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, coalesce(p_op, 'system'), v_line);
    return jsonb_build_object('ticket_id', p_ticket, 'action', 'revoke', 'week', p_week, 'from', v_from, 'to', v_to);
  end if;
  return jsonb_build_object('ticket_id', p_ticket, 'action', 'none', 'week', p_week,
                            'reason', case when v_valid > 0 then 'week_done' else 'no_leave' end);
end
$$;

-- 4) 對外 RPC：對「這堂請假預約」涉及的票券，依它所在的自然週同步補償
create or replace function public.fn_coach_leave_comp(p_booking_id text, p_tickets text[] default null) returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := auth.uid(); v_emp employees%rowtype; v_desk boolean; b bookings%rowtype;
  v_wk date; v_tid text; v_res jsonb := '[]'::jsonb; v_list text[];
begin
  perform set_config('lock_timeout', '3000', true);
  if p_booking_id is null then return jsonb_build_object('ok', false, 'error_code', 'COMP.BAD_ARGS'); end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  select * into v_emp from employees where auth_id = v_uid limit 1;
  if not found or coalesce(v_emp.status::text, '') = 'inactive' then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN'); end if;
  v_desk := coalesce(is_staff_desk(), false);
  select * into b from bookings where id = p_booking_id;
  if not found then return jsonb_build_object('ok', false, 'error_code', 'COMP.NOT_FOUND'); end if;
  if not v_desk then
    if (coalesce(v_emp.role::text, '') = 'coach' and (b.coach_id = v_emp.id or b.substitute_coach_id = v_emp.id)) is not true then
      return jsonb_build_object('ok', false, 'error_code', 'COMP.FORBIDDEN'); end if;
  end if;
  if b.date is null then return jsonb_build_object('ok', false, 'error_code', 'COMP.BAD_ARGS'); end if;
  v_wk := date_trunc('week', b.date::timestamp)::date;
  -- 涉及的票：呼叫端指定（團課：這次退到哪幾張就延哪幾張）；沒指定就用這堂預約綁的那張
  v_list := case when p_tickets is not null then p_tickets
                 when b.ticket_id is not null then array[b.ticket_id] else '{}'::text[] end;
  for v_tid in select distinct x from unnest(v_list) x where x is not null order by x loop   -- 依 id 排序取鎖，避免死結
    v_res := v_res || public.fn_coach_leave_comp_week(v_tid, v_wk, p_booking_id, b.date, v_emp.id);
  end loop;
  return jsonb_build_object('ok', true, 'week', v_wk, 'results', v_res);
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    return jsonb_build_object('ok', false, 'error_code', 'COMP.BUSY');
  when others then
    raise warning 'fn_coach_leave_comp internal error: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'COMP.INTERNAL_ERROR');
end
$$;

-- 5) P0-E 效期重算帶入已核准補償（取代 fn_tk_activate、fn_tk_recalc；其餘邏輯與原版逐字相同）
create or replace function public.fn_tk_activate(p_ticket text, p_date date, p_booking text) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_exp date; v_n integer; v_comp integer;
begin
  if p_ticket is null or p_date is null then return; end if;
  select * into t from member_tickets where id = p_ticket for update;
  if not found or not public.fn_tk_is_unopened(t) then return; end if;
  v_comp := public.fn_tk_leave_comp_days(p_ticket);                      -- 已核准的教練請假補償（以票券＋自然週為單位的帳本淨額）
  v_exp := p_date + (t.valid_days - 1) + v_comp;                         -- 含起算當天（同前端 termExpire）；補償天數不會因重算消失
  update member_tickets
     set start_date = p_date, expire_date = v_exp, activated_at = now(), activation_mode = 'checkin'
   where id = p_ticket and activated_at is null and start_date is null and expire_date is null and coalesce(valid_days, 0) > 0;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system',
          '首次簽到開通：起算 ' || to_char(p_date, 'YYYY-MM-DD') || '，效期至 ' || to_char(v_exp, 'YYYY-MM-DD')
          || case when v_comp > 0 then '（含教練請假補償 ' || v_comp || ' 天）' else '' end);
  if v_exp < public.fn_tk_today() then
    -- 補簽很久以前的課：到期日已過，不自動取消任何預約，交給櫃檯判斷
    perform public.desk_alert(t.member_id, 'tk_expiry_manual', '　票券因補簽過去的課而開通，效期已屆滿',
      '起算 ' || to_char(p_date, 'YYYY/MM/DD') || '，效期至 ' || to_char(v_exp, 'YYYY/MM/DD') || '；未自動取消任何預約，請人工確認');
  else
    perform public.fn_tk_cancel_overdue(p_ticket, v_exp, p_booking);
  end if;
end
$$;

create or replace function public.fn_tk_recalc(p_ticket text, p_booking text) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_first date; v_exp date; v_comp integer;
begin
  if p_ticket is null then return; end if;
  select * into t from member_tickets where id = p_ticket for update;
  if not found or t.activation_mode is distinct from 'checkin' then return; end if;
  select min(d) into v_first from public.fn_tk_attended_dates(p_ticket) d;
  if v_first is null then
    update member_tickets set start_date = null, expire_date = null, activated_at = null, activation_mode = null
     where id = p_ticket and activation_mode = 'checkin';
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system', '撤銷簽到：已無有效簽到，效期恢復未啟用');
  else
    v_comp := public.fn_tk_leave_comp_days(p_ticket);                    -- 已核准的教練請假補償不得被重算清掉
    v_exp := v_first + (t.valid_days - 1) + v_comp;
    if t.start_date is distinct from v_first or t.expire_date is distinct from v_exp then
      update member_tickets set start_date = v_first, expire_date = v_exp
       where id = p_ticket and activation_mode = 'checkin';
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system',
              '撤銷簽到：效期依最早簽到課程日重算，起算 ' || to_char(v_first, 'YYYY-MM-DD') || '，效期至 ' || to_char(v_exp, 'YYYY-MM-DD')
              || case when v_comp > 0 then '（含教練請假補償 ' || v_comp || ' 天）' else '' end);
    end if;
  end if;
end
$$;

-- 6) 權限：內部函式不開放任何 API 角色；RPC 只給 authenticated
revoke all on function public.fn_tk_leave_comp_weeks(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_tk_leave_comp_days(text) from public, anon, authenticated, service_role;
revoke all on function public.fn_coach_leave_comp_week(text, date, text, date, text) from public, anon, authenticated, service_role;
revoke all on function public.fn_coach_leave_comp(text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.fn_coach_leave_comp(text, text[]) to authenticated;
