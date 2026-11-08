-- ══ 2d-4 SQL Editor 部署用完整內容（2026-11-10準備，尚未執行）══
-- 來源：docs/migrations/_PREP_2d4_fn_group_save_members.sql 第206-439行
-- 核對SHA-256（原始內容，不含BEGIN/COMMIT）：4b7e8136ad697d118714e52cd75d501404c968a73b6dae812804e36218d099dd
-- 業務邏輯完全未修改，只在外層包BEGIN/COMMIT確保單次執行時的交易原子性。
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_group_save_members(p_booking_id text, p_max_heads integer DEFAULT NULL::integer, p_ticket_type_fix text DEFAULT NULL::text, p_adds jsonb DEFAULT '[]'::jsonb, p_removes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
/* 2d-1（新增名額）＋2d-2（移除名額/退票）＋2d-3（attendance 孤兒鍵清理）＋
   2d-4第四輪修正（v_leave改用目前roster即時計算，不再沿用凍結快照）。
   鎖同一列 bookings，與 fn_member_join_group 天然互斥（搶同一列鎖）。
   順序：先處理 p_removes 再處理 p_adds——這樣「換人」不會被容量檢查誤擋。 */
declare
  v_emp  text;
  v_desk boolean;
  v_b    bookings%rowtype;
  v_max  int;
  v_leave int;
  v_cnt  int;
  v_member_ids   jsonb;
  v_seat_tickets jsonb;
  v_attendance   jsonb;
  v_live_keys    jsonb;
  v_add   jsonb;
  v_rm    jsonb;
  v_mid   text;
  v_tkid  text;
  v_multi boolean;
  v_tk    record;
  v_net   int;
  v_seats int;
  v_key   text;
  v_idx   bigint;
  v_rm_key text;
  v_rtk   record;
  v_results jsonb := '[]'::jsonb;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF');
  end if;
  select is_staff_desk() into v_desk;

  select * into v_b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING');
  end if;

  if not coalesce(v_desk,false)
     and v_b.coach_id is distinct from v_emp
     and v_b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_YOUR_BOOKING');
  end if;

  if v_b.category::text <> '小班肌力' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_GROUP');
  end if;

  v_member_ids   := coalesce(v_b.member_ids,'[]'::jsonb);
  v_seat_tickets := coalesce(v_b.seat_tickets,'{}'::jsonb);
  v_attendance   := coalesce(v_b.attendance,'{}'::jsonb);
  v_max := coalesce(p_max_heads, v_b.max_heads, 5);

  -- ── Remove 路徑（2d-2）────────────────────────────────────────────
  for v_rm in select * from jsonb_array_elements(coalesce(p_removes,'[]'::jsonb))
  loop
    v_mid := case when jsonb_typeof(v_rm) = 'string' then v_rm#>>'{}' else v_rm->>'member_id' end;
    if v_mid is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',false,'error_code','BAD_INPUT'));
      continue;
    end if;

    select min(ord) into v_idx
      from jsonb_array_elements_text(v_member_ids) with ordinality as t(val,ord)
     where val = v_mid;
    if v_idx is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',false,'error_code','NOT_IN_ROSTER'));
      continue;
    end if;

    select mt.* into v_rtk
      from member_tickets mt
     where mt.member_id = v_mid
       and exists (
         select 1 from ticket_logs tl
          where tl.booking_id = p_booking_id and tl.ticket_id = mt.id
          group by tl.ticket_id
         having sum(case when tl.action='deduct' and coalesce(tl.delta,0)<>0 then 1
                          when tl.action='refund' then -1 else 0 end) > 0
       )
     order by (
       select max(tl2.created_at) from ticket_logs tl2
        where tl2.ticket_id = mt.id and tl2.booking_id = p_booking_id and tl2.action='deduct'
     ) desc nulls last
     limit 1
     for update;

    if found then
      if coalesce(v_rtk.sessions_total,0) > 0 and coalesce(v_rtk.sessions_remaining,0) >= v_rtk.sessions_total then
        insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
        values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_rtk.id, 'adjust', 0, p_booking_id, v_emp,
                '⚠ 已阻擋：餘額 '||coalesce(v_rtk.sessions_remaining,0)||'/'||v_rtk.sessions_total||' 已滿，未再退課', now());
        v_tkid := null;
      else
        update member_tickets
           set sessions_remaining = sessions_remaining + 1,
               status = case when status = 'used_up' and sessions_remaining + 1 > 0 then 'usable' else status end
         where id = v_rtk.id;
        insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
        values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_rtk.id, 'refund', 1, p_booking_id, v_emp, '取消退課', now());
        v_tkid := v_rtk.id;
      end if;
    else
      v_tkid := null;
    end if;

    select coalesce(jsonb_agg(val order by ord), '[]'::jsonb) into v_member_ids
      from jsonb_array_elements_text(v_member_ids) with ordinality as t(val,ord)
     where ord <> v_idx;

    select k into v_rm_key
      from jsonb_object_keys(v_seat_tickets) as k
     where k = v_mid or k like v_mid || '#%'
     order by case when k = v_mid then 1 else (split_part(k,'#',2))::int end desc
     limit 1;
    if v_rm_key is not null then
      v_seat_tickets := v_seat_tickets - v_rm_key;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',true,'refunded_ticket_id',v_tkid));
  end loop;

  -- ── Add 路徑（2d-1，原樣不動；v_leave計算改用即時roster，2d-4第四輪修正）──
  for v_add in select * from jsonb_array_elements(coalesce(p_adds,'[]'::jsonb))
  loop
    v_mid   := v_add->>'member_id';
    v_tkid  := v_add->>'ticket_id';
    v_multi := coalesce((v_add->>'multi')::boolean, false);

    if v_mid is null or v_tkid is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','BAD_INPUT'));
      continue;
    end if;

    v_leave := (select count(*)::int from jsonb_array_elements_text(v_member_ids) m(mid)
                 where coalesce(v_b.attendance->>m.mid,'') = 'leave');
    v_cnt   := jsonb_array_length(v_member_ids) - v_leave;
    if v_cnt >= v_max then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','FULL'));
      continue;
    end if;

    select mt.* into v_tk from member_tickets mt
      join ticket_types tt on tt.id = mt.ticket_type_id
     where mt.id = v_tkid and mt.member_id = v_mid and tt.category::text = '小班肌力'
       and (mt.expire_date is null or mt.expire_date >= v_b.date)
     for update;
    if not found then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','TICKET_INVALID'));
      continue;
    end if;

    select coalesce(sum(case when action='deduct' and coalesce(delta,0) <> 0 then 1
                             when action='refund' then -1 else 0 end), 0)
      into v_net from ticket_logs where ticket_id = v_tk.id and booking_id = p_booking_id;

    if not v_multi and v_net > 0 then
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_tk.id, 'adjust', 0, p_booking_id, v_emp,
              '⚠ 已阻擋：這一堂在這張票上已經扣過 '||v_net||' 堂，不重複扣', now());
    else
      if coalesce(v_tk.sessions_remaining,0) <= 0 then
        v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','NO_REMAINING'));
        continue;
      end if;
      update member_tickets
         set sessions_remaining = sessions_remaining - 1,
             status = case when sessions_remaining-1<=0 then 'used_up' else status end,
             start_date   = coalesce((v_add->>'start_date')::date, start_date),
             expire_date  = coalesce((v_add->>'expire_date')::date, expire_date),
             activated_at = coalesce((v_add->>'activated_at')::timestamptz, activated_at)
       where id = v_tk.id;
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_tk.id, 'deduct', -1, p_booking_id, v_emp,
              coalesce(nullif(v_add->>'note',''), '預約扣課'), now());
    end if;

    select count(*)::int into v_seats from jsonb_array_elements_text(v_member_ids) x where x = v_mid;
    v_key := case when v_seats > 0 then v_mid||'#'||(v_seats+1) else v_mid end;

    v_member_ids   := v_member_ids || to_jsonb(v_mid);
    v_seat_tickets := v_seat_tickets || jsonb_build_object(v_key, v_tk.id);

    v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',true,'ticket_id',v_tk.id));
  end loop;

  -- ── attendance 孤兒鍵清理（2d-3）───────────────────────────────────
  select coalesce(jsonb_object_agg(
           case when rn > 1 then val || '#' || rn else val end, true
         ), '{}'::jsonb)
    into v_live_keys
    from (
      select val, row_number() over (partition by val order by ord) as rn
      from jsonb_array_elements_text(v_member_ids) with ordinality as t(val, ord)
    ) s;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_attendance
    from jsonb_each(v_attendance) a(k, v)
   where v_live_keys ? k;

  update bookings
     set member_ids     = v_member_ids,
         seat_tickets   = v_seat_tickets,
         attendance     = v_attendance,
         max_heads      = v_max,
         ticket_type_id = coalesce(ticket_type_id, p_ticket_type_fix)
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'results', v_results, 'member_ids', v_member_ids);
exception when others then
  return jsonb_build_object('ok', false, 'error_code', SQLERRM);
end
$function$;

-- 2026-11-09第四輪：CREATE後、GRANT前先防禦性REVOKE，涵蓋PUBLIC/anon/service_role，
-- 讓最終權限狀態不依賴「猜對實際部署時CREATE FUNCTION是哪個角色執行」
-- （正式庫pg_default_acl顯示supabase_admin角色建立的新函式會自動對anon/service_role
--  開放EXECUTE，postgres角色建立的則不會——REVOKE一個從未被授予的權限是無害no-op）。
-- ⚠ 這幾行REVOKE撤的是PUBLIC/anon/service_role這三個「一般角色」的ACL權限，
--   不會、也不能撤銷函式擁有者（實際執行這段CREATE FUNCTION的角色，視部署管道
--   可能是postgres或supabase_admin）本身固有的權限——物件擁有者與superuser在
--   PostgreSQL裡本來就不受ACL檢查限制，REVOKE語句對他們沒有、也不該宣稱有效果。
revoke all on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) from public;
revoke all on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) from anon;
revoke all on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) from service_role;
grant execute on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) to authenticated;

COMMIT;
