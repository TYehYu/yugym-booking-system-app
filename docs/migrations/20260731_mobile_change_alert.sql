/* 手機端的任何變更都要在櫃檯／管理員桌機右下角跳通知（2026-07-31 使用者新增規則）

   原本只有會員自助的三支 RPC（fn_member_self_book / _reschedule / _cancel）
   會呼叫 desk_alert 寫 desk 通知。教練在手機上做的事（簽到、取消、改期、備註、
   打卡…）櫃檯完全看不到 —— 因為 notifications 的 RLS 只讓 is_staff_desk() 寫入，
   教練／會員自己 insert 會被擋。

   這支 security definer 讓「已登入的會員或員工」都能寫一則 desk 通知，
   名字由伺服器端查（不信任前端傳來的身分）。寫失敗一律吞掉 —— 通知不能拖垮
   使用者原本的操作。
   前端掛在 dbPut／dbDel 兩個唯一寫入口，見 index.html 的 mchgNotify()。 */
create or replace function public.fn_mobile_change_alert(
  p_type text, p_title text, p_body text
) returns void
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_who text;
begin
  if current_member_id() is not null then
    select name into v_who from members where id = current_member_id();
    v_who := coalesce(v_who,'會員');
  elsif current_employee_id() is not null then
    select name into v_who from employees where id = current_employee_id();
    v_who := coalesce(v_who,'員工');
  else
    return;   -- 認不出是誰就不寫，避免匿名灌訊息
  end if;
  insert into notifications (id, recipient_type, recipient_id, type, title, body, read, created_at)
  values (gen_short_id('NT-'), 'desk', 'desk',
          coalesce(nullif(p_type,''),'self_move'),
          v_who || coalesce(p_title,'從手機端做了變更'),
          left(coalesce(p_body,''), 300), false, now());
exception when others then
  null;
end $$;

revoke all on function public.fn_mobile_change_alert(text,text,text) from public;
grant execute on function public.fn_mobile_change_alert(text,text,text) to authenticated;
