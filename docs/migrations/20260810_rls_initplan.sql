-- 2026-08-10 效能修正（已於當日套用正式庫）：RLS 權限輔助函式改包 (select ...) initPlan
--
-- 症狀：櫃檯開「會員管理」與「完成連動」讀取數秒像當機。
-- 量測（櫃檯身份 count(*)）：bookings 6,324 筆要 1,284ms、member_tickets 388ms、ticket_logs 501ms。
-- 成因:RLS 政策裡的 is_staff_desk()/is_any_staff()/is_admin()/is_coach()/
--       current_employee_id()/current_member_id()/current_staff_role() 都是「裸呼叫」——
--       Postgres 對這種寫法每一列重新執行一次（每列都查一遍 employees/members）。
--       8/9 的優化（f818db6）只把 auth.uid() 包了 (select ...)，外層輔助函式沒包。
-- 修法：全部 70 條政策的輔助函式呼叫包成 ( SELECT fn() ) → initPlan，一條查詢只算一次。
-- 效果：bookings 1,284ms → 11ms（117 倍）、tickets 388→2ms、logs 501→2ms、members 51→1ms。
-- 驗證：會員身份可見範圍不變（本人＋團課瀏覽＋共享票；他人非共享票券 0 張）。
-- 注意：can_coach_see_member(id) 吃列值、包了也是關聯子查詢，維持原樣。
--       之後新增 RLS 政策時，輔助函式一律寫 ( SELECT fn() )，別再裸呼叫。
do $$
declare r record; q text; wc text; fn text;
  fns text[] := array['is_staff_desk','is_any_staff','is_admin','is_coach',
                      'current_employee_id','current_member_id','current_staff_role'];
begin
  for r in
    select c.relname, p.polname,
      pg_get_expr(p.polqual,p.polrelid) as qual,
      pg_get_expr(p.polwithcheck,p.polrelid) as wcheck
    from pg_policy p
    join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and (coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
          ~ '(is_staff_desk|is_any_staff|is_admin|is_coach|current_employee_id|current_member_id|current_staff_role)\(\)'
  loop
    q := r.qual; wc := r.wcheck;
    foreach fn in array fns loop
      if q  is not null then q  := replace(q,  fn||'()', '( SELECT '||fn||'() )'); end if;
      if wc is not null then wc := replace(wc, fn||'()', '( SELECT '||fn||'() )'); end if;
    end loop;
    execute format('alter policy %I on public.%I %s %s',
      r.polname, r.relname,
      case when q  is not null then 'using ('||q||')' else '' end,
      case when wc is not null then 'with check ('||wc||')' else '' end);
  end loop;
end $$;
