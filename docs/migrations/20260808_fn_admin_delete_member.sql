-- 2026-08-08 使用者指示：「我要管理員有能力可以刪除註冊錯誤或輸入錯誤的會員，
-- 包含用 LINE 申請錯誤的」。
--
-- 「用 LINE 申請錯誤」是關鍵：光刪 members 那一列不夠 —— LINE 登入是靠
-- auth.users 裡的 line_{uid}@line.yugym.local 對上來的，Auth 帳號還在的話，
-- 那個人重新用 LINE 登入只會回到同一個空殼帳號，永遠申請不了新的。
-- 所以要一起刪掉 Auth 帳號，而那需要 service_role 等級的權限 → 用 security definer 函式。
--
-- ⚠ 只刪「乾淨的」會員：名下有票券／預約／收款／合約／購買申請／訓練紀錄的一律擋下並回報，
--   那種情況要走退費或改資料，不能靜靜刪掉歷史。
-- ⚠ 只有管理員可以叫（櫃檯不行 —— 刪錯人沒有回頭路）。
create or replace function public.fn_admin_delete_member(p_member_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  m           members%rowtype;
  n_bookings  int;
  n_tickets   int;
  n_purchases int;
  n_contracts int;
  n_apps      int;
  n_logs      int;
  v_auth      uuid;
begin
  if coalesce(current_staff_role(), '') <> 'admin' then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH.FORBIDDEN');
  end if;

  select * into m from members where id = p_member_id;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'MEMBER.NOT_FOUND');
  end if;

  select count(*) into n_bookings from bookings
   where member_id = p_member_id
      or member_ids @> to_jsonb(array[p_member_id]);
  select count(*) into n_tickets   from member_tickets        where member_id = p_member_id;
  select count(*) into n_purchases from purchases             where member_id = p_member_id;
  select count(*) into n_contracts from contracts             where member_id = p_member_id;
  select count(*) into n_apps      from purchase_applications where member_id = p_member_id;
  select count(*) into n_logs      from training_logs         where member_id = p_member_id;

  if (n_bookings + n_tickets + n_purchases + n_contracts + n_apps + n_logs) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'MEMBER.HAS_DATA',
      'bookings', n_bookings, 'tickets', n_tickets,
      'purchases', n_purchases, 'contracts', n_contracts,
      'applications', n_apps, 'training_logs', n_logs);
  end if;

  begin
    v_auth := nullif(m.auth_id, '')::uuid;
  exception when others then
    v_auth := null;   -- auth_id 不是合法 uuid（舊資料）就當作沒有
  end;

  -- 附屬品：跟著人一起走，不算歷史
  delete from notifications where recipient_type = 'member' and recipient_id = p_member_id;
  delete from member_link_requests
   where coalesce(matched_member_id,'') = p_member_id
      or (v_auth is not null and auth_id = v_auth::text);

  delete from members where id = p_member_id;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;

  return jsonb_build_object('ok', true, 'name', m.name, 'phone', m.phone,
    'auth_deleted', v_auth is not null);
end $$;

revoke all on function public.fn_admin_delete_member(text) from public;
grant execute on function public.fn_admin_delete_member(text) to authenticated;

comment on function public.fn_admin_delete_member(text) is
  '管理員刪除註冊／輸入錯誤的會員：連同 Auth 帳號一起刪（LINE 才申請得了新的）。名下有票券／預約／收款／合約一律擋下（2026-08-08）';
