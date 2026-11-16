-- 最終驗收：移除暫時安裝並還原（階段 06＋08＋觀測函式）。只對測試庫。之後比對基準（筆數、各表雜湊、函式／表／觸發器／權限）。
do $g$ begin if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then raise exception 'TESTDB.GUARD'; end if; end $g$;
drop function if exists public.zz_cc_overlap(text, text, text, text, text, int);
drop function if exists public.fn_desk_cancel_booking(text, text);
drop function if exists public.fn_desk_deduct_ticket(text, text, text, text);
drop function if exists public.fn_desk_op_begin(text, text, text, text);
drop function if exists public.fn_desk_booking_rev(text);
drop function if exists public.fn_booking_rev_of(text);
drop trigger if exists trg_booking_op_rev on public.bookings;
drop trigger if exists trg_booking_op_rev_insdel on public.bookings;
drop function if exists public.trg_booking_op_rev();
drop table if exists public.ticket_deduct_ops;
drop table if exists public.booking_op_rev;
drop trigger if exists trg_tk_quota_guard on public.member_tickets;
drop function if exists public.trg_tk_quota_guard();
drop function if exists public.fn_refund_ticket(text, text, text);
-- 還原 fn_tk_refund_once 為 P0-E 原版（06 版本是向下相容超集，要還原才能回到基準）
create or replace function public.fn_tk_refund_once(p_ticket text, p_booking text, p_note text) returns boolean
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare t member_tickets%rowtype; v_net integer;
begin
  select * into t from member_tickets where id = p_ticket for update;
  if not found then return false; end if;
  select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)
    into v_net from ticket_logs where ticket_id = p_ticket and booking_id = p_booking;
  if v_net <= 0 then return false; end if;
  if coalesce(t.sessions_total, 0) > 0 and coalesce(t.sessions_remaining, 0) >= t.sessions_total then
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values (public.gen_short_id('LG-'), p_ticket, 'adjust', 0, p_booking, 'system', '⚠ 已阻擋：餘額已滿，未再退課（效期屆滿自動取消）');
    return false;
  end if;
  update member_tickets
     set sessions_remaining = coalesce(sessions_remaining, 0) + 1,
         status = case when status::text = 'used_up' then 'usable' else status end
   where id = p_ticket;
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
  values (public.gen_short_id('LG-'), p_ticket, 'refund', 1, p_booking, 'system', coalesce(p_note, '取消返還原票'));
  return true;
end
$$;
notify pgrst, 'reload schema';
