-- ═══════════════════════════════════════════════════════════════════════
-- 回復「教練請假補償」（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj；需明確授權，含 DROP）。
-- 把 fn_tk_activate、fn_tk_recalc 還原成審查過的 P0-E 版本（逐字），並移除 4 個補償函式；不碰任何資料列。
-- ⚠ 回復後「已核准補償」不再被重算保護（帳本紀錄仍留著，不會刪）；已有補償紀錄的票若在回復後被重算，補償天數會消失。
-- 前置條件：兩支重算函式目前必須是修補版，否則中止。整檔單一交易。
-- ═══════════════════════════════════════════════════════════════════════
begin;
-- ── 庫識別守門（fail-closed）：不是測試庫就中止，不靠註解或表名 ──
-- 依據：2026-11-14 唯讀取得測試庫（kucvxpjatptfckhlxptj，專案名 yugym-sprint3-test）叢集 system_identifier = 7662742571317219726，
--       且測試庫沒有 public.change_log 表與 fn_table_sigs（正式庫有）。任何一項不符、或 pg_control_system() 取不到 → 一律中止。
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫（有 change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;

do $pre$
begin
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_tk_activate') is distinct from '01bdaa33cbf4f91f51caa92fa66a2767:1535'
     or (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_tk_recalc') is distinct from 'd59b56f3816c23243f23618914bdc9d9:1526' then
    raise exception 'LEAVECOMP.ROLLBACK_ABORT: 兩支重算函式目前不是修補版，不覆蓋'; end if;
end
$pre$;

create or replace function public.fn_tk_activate(p_ticket text, p_date date, p_booking text) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_exp date; v_n integer;
begin
  if p_ticket is null or p_date is null then return; end if;
  select * into t from member_tickets where id = p_ticket for update;
  if not found or not public.fn_tk_is_unopened(t) then return; end if;
  v_exp := p_date + (t.valid_days - 1);                                  -- 含起算當天（同前端 termExpire）
  update member_tickets
     set start_date = p_date, expire_date = v_exp, activated_at = now(), activation_mode = 'checkin'
   where id = p_ticket and activated_at is null and start_date is null and expire_date is null and coalesce(valid_days, 0) > 0;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system',
          '首次簽到開通：起算 ' || to_char(p_date, 'YYYY-MM-DD') || '，效期至 ' || to_char(v_exp, 'YYYY-MM-DD'));
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
declare t member_tickets%rowtype; v_first date; v_exp date;
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
    v_exp := v_first + (t.valid_days - 1);
    if t.start_date is distinct from v_first or t.expire_date is distinct from v_exp then
      update member_tickets set start_date = v_first, expire_date = v_exp
       where id = p_ticket and activation_mode = 'checkin';
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
      values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system',
              '撤銷簽到：效期依最早簽到課程日重算，起算 ' || to_char(v_first, 'YYYY-MM-DD') || '，效期至 ' || to_char(v_exp, 'YYYY-MM-DD'));
    end if;
  end if;
end
$$;

drop function if exists public.fn_coach_leave_comp(text, text[]);
drop function if exists public.fn_coach_leave_comp_week(text, date, text, date, text);
drop function if exists public.fn_tk_leave_comp_days(text);
drop function if exists public.fn_tk_leave_comp_weeks(text);

do $post$
begin
  if (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_tk_activate') <> 'a6fd429ea9de3e517d5ce761a543c99f:1321'
     or (select md5(prosrc) || ':' || length(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_tk_recalc') <> '42e3b72121a71692ff498f9ad763c724:1321' then
    raise exception 'LEAVECOMP.ROLLBACK_POSTCHECK_FAILED: 重算函式未還原成原版'; end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('fn_tk_leave_comp_weeks','fn_tk_leave_comp_days','fn_coach_leave_comp_week','fn_coach_leave_comp')) then
    raise exception 'LEAVECOMP.ROLLBACK_POSTCHECK_FAILED: 補償函式仍有殘留'; end if;
  if coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.fn_tk_activate(text,date,text)')), '') <> '{postgres=X/postgres}' then
    raise exception 'LEAVECOMP.ROLLBACK_POSTCHECK_FAILED: fn_tk_activate 的 ACL 被改變'; end if;
end
$post$;
commit;
