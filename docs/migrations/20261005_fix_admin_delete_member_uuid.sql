-- 2026-10-05：fn_admin_delete_member 的兩處型別錯誤
--
-- 症狀（使用者刪不掉重複建立的會員「洪桂真」）：
--   刪除失敗：operator does not exist: uuid = text
--
-- 兩個錯都來自「以為 auth_id 是 text」：
--   ① members.auth_id 本來就是 uuid，原本寫 nullif(m.auth_id,'')::uuid
--      → uuid 跟 '' 比較，執行時爆 22P02，被 exception 吞掉 → v_auth 永遠是 null
--      ⚠ 後果：「連登入帳號一起刪，他才能重新用 LINE 申請」這條從 2026-08-08 起
--        **一次都沒生效過** —— auth.users 的那一列一直留著。
--   ② member_link_requests.auth_id 也是 uuid，原本寫 auth_id = v_auth::text
--      → uuid = text，plpgsql 準備這句 SQL 時就報 42883，整支函式失敗。
--      ⚠ 這一句擋在「資料檢查通過之後」，所以名下有票券／預約的人會正常看到
--        「這位會員刪不掉」，只有**真的刪得掉的人**才會撞到，難怪一直沒被發現。
--
-- 只改型別，刪除條件、權限檢查與「有資料就擋」的清單一個字都沒動。
create or replace function public.fn_admin_delete_member(p_member_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
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
  select count(*) into n_tickets   from member_tickets       where member_id = p_member_id;
  select count(*) into n_purchases from purchases            where member_id = p_member_id;
  select count(*) into n_contracts from contracts            where member_id = p_member_id;
  select count(*) into n_apps      from purchase_applications where member_id = p_member_id;
  select count(*) into n_logs      from training_logs        where member_id = p_member_id;

  if (n_bookings + n_tickets + n_purchases + n_contracts + n_apps + n_logs) > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'MEMBER.HAS_DATA',
      'bookings', n_bookings, 'tickets', n_tickets,
      'purchases', n_purchases, 'contracts', n_contracts,
      'applications', n_apps, 'training_logs', n_logs);
  end if;

  -- auth_id 已經是 uuid：直接用，不要再 nullif('')／::text（2026-10-05 修）
  v_auth := m.auth_id;

  -- 附屬品：跟著人一起走，不算歷史
  delete from notifications where recipient_type = 'member' and recipient_id = p_member_id;
  delete from member_link_requests
   where coalesce(matched_member_id,'') = p_member_id
      or (v_auth is not null and auth_id = v_auth);

  delete from members where id = p_member_id;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;

  return jsonb_build_object('ok', true, 'name', m.name, 'phone', m.phone,
    'auth_deleted', v_auth is not null);
end $function$;
