-- 階段 08 唯讀驗證
select p.proname, p.prosecdef as security_definer, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec, has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
       has_function_privilege('service_role', p.oid, 'execute') as service_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('fn_desk_booking_rev','fn_desk_op_begin','fn_desk_deduct_ticket','fn_desk_cancel_booking') order by 1;
-- 預期：4 列；security_definer 全 t；anon_exec 全 f；auth_exec、service_exec 全 t。
select has_function_privilege('authenticated','public.fn_booking_rev_of(text)','execute') as internal_rev_exec_to_authenticated;   -- 預期 f
select pg_get_constraintdef(oid) as pk from pg_constraint where conrelid='public.ticket_deduct_ops'::regclass and contype='p';   -- 預期 PRIMARY KEY (booking_id, ticket_id, slot, epoch)
select relrowsecurity as rls_on, (select count(*) from pg_policies where tablename='ticket_deduct_ops') as policy_count from pg_class where oid='public.ticket_deduct_ops'::regclass;
-- 預期：rls_on=t、policy_count=0（只由函式讀寫）。
select position('from bookings where id = p_booking_id for update' in pg_get_functiondef('public.fn_desk_deduct_ticket(text,text,text,text)'::regprocedure)) as bk_lock_pos,
       position('from member_tickets where id = p_ticket_id for update' in pg_get_functiondef('public.fn_desk_deduct_ticket(text,text,text,text)'::regprocedure)) as tk_lock_pos;
-- 預期：bk_lock_pos > 0 且 < tk_lock_pos（先鎖預約再鎖票券）。
-- 既有函式不變（與安裝前記錄比對）：
select p.proname, md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fn_deduct_ticket','fn_cancel_booking','fn_refund_ticket','fn_tk_refund_once') order by 1;
select (select count(*) from pg_trigger where tgname='trg_booking_op_rev' and tgrelid='public.bookings'::regclass and not tgisinternal) as rev_trigger, (select relrowsecurity from pg_class where oid='public.booking_op_rev'::regclass) as rev_table_rls, (select count(*) from pg_policies where tablename in ('booking_op_rev','ticket_deduct_ops')) as policies;
-- 預期：rev_trigger=1、rev_table_rls=t、policies=0。
