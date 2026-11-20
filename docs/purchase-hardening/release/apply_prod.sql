-- REVIEW ONLY. Production execution requires separate explicit authorization.
-- No business-row updates/deletes; each statement runs in a single transaction.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin if (select system_identifier::text from pg_control_system())<>'7637215626725903220' then raise exception 'WRONG_PRODUCTION_CLUSTER';end if;end$$;
lock table contracts,member_tickets,purchases,ticket_logs,invoices in share row exclusive mode;
do $col$declare x record;begin for x in select * from jsonb_to_recordset('[{"table": "contracts", "column": "id", "udt": "text"}, {"table": "contracts", "column": "member_id", "udt": "text"}, {"table": "contracts", "column": "member_name", "udt": "text"}, {"table": "contracts", "column": "plan_name", "udt": "text"}, {"table": "contracts", "column": "sessions", "udt": "int4"}, {"table": "contracts", "column": "amount", "udt": "numeric"}, {"table": "contracts", "column": "expire_date", "udt": "date"}, {"table": "contracts", "column": "sign_type", "udt": "text"}, {"table": "contracts", "column": "signature", "udt": "text"}, {"table": "contracts", "column": "body_snapshot", "udt": "text"}, {"table": "contracts", "column": "ticket_id", "udt": "text"}, {"table": "contracts", "column": "purchase_id", "udt": "text"}, {"table": "contracts", "column": "staff_id", "udt": "text"}, {"table": "contracts", "column": "note", "udt": "text"}, {"table": "contracts", "column": "signed_at", "udt": "timestamptz"}, {"table": "contracts", "column": "created_at", "udt": "timestamptz"}, {"table": "contracts", "column": "fill_snapshot", "udt": "text"}, {"table": "contracts", "column": "installment_signs", "udt": "jsonb"}, {"table": "contracts", "column": "pending_sign_n", "udt": "int4"}, {"table": "contracts", "column": "pending_sign_at", "udt": "timestamptz"}, {"table": "contracts", "column": "ticket_type_id", "udt": "text"}, {"table": "invoices", "column": "id", "udt": "text"}, {"table": "invoices", "column": "merchant_order_no", "udt": "text"}, {"table": "invoices", "column": "purchase_id", "udt": "text"}, {"table": "invoices", "column": "member_id", "udt": "text"}, {"table": "invoices", "column": "category", "udt": "text"}, {"table": "invoices", "column": "buyer_name", "udt": "text"}, {"table": "invoices", "column": "buyer_ubn", "udt": "text"}, {"table": "invoices", "column": "carrier_type", "udt": "text"}, {"table": "invoices", "column": "carrier_num", "udt": "text"}, {"table": "invoices", "column": "love_code", "udt": "text"}, {"table": "invoices", "column": "print_flag", "udt": "text"}, {"table": "invoices", "column": "amt", "udt": "int4"}, {"table": "invoices", "column": "tax_amt", "udt": "int4"}, {"table": "invoices", "column": "total_amt", "udt": "int4"}, {"table": "invoices", "column": "items", "udt": "jsonb"}, {"table": "invoices", "column": "comment", "udt": "text"}, {"table": "invoices", "column": "status", "udt": "text"}, {"table": "invoices", "column": "invoice_number", "udt": "text"}, {"table": "invoices", "column": "random_num", "udt": "text"}, {"table": "invoices", "column": "invoice_trans_no", "udt": "text"}, {"table": "invoices", "column": "invoice_time", "udt": "timestamptz"}, {"table": "invoices", "column": "barcode", "udt": "text"}, {"table": "invoices", "column": "qrcode_l", "udt": "text"}, {"table": "invoices", "column": "qrcode_r", "udt": "text"}, {"table": "invoices", "column": "invalid_reason", "udt": "text"}, {"table": "invoices", "column": "invalid_at", "udt": "timestamptz"}, {"table": "invoices", "column": "env", "udt": "text"}, {"table": "invoices", "column": "raw_result", "udt": "jsonb"}, {"table": "invoices", "column": "created_by", "udt": "text"}, {"table": "invoices", "column": "created_at", "udt": "timestamptz"}, {"table": "invoices", "column": "buyer_email", "udt": "text"}, {"table": "invoices", "column": "allowance_no", "udt": "text"}, {"table": "invoices", "column": "allowance_amt", "udt": "int4"}, {"table": "invoices", "column": "allowance_at", "udt": "timestamptz"}, {"table": "invoices", "column": "allowance_raw", "udt": "jsonb"}, {"table": "member_tickets", "column": "id", "udt": "text"}, {"table": "member_tickets", "column": "member_id", "udt": "text"}, {"table": "member_tickets", "column": "ticket_type_id", "udt": "text"}, {"table": "member_tickets", "column": "source_plan_id", "udt": "text"}, {"table": "member_tickets", "column": "plan_name", "udt": "text"}, {"table": "member_tickets", "column": "format", "udt": "text"}, {"table": "member_tickets", "column": "source", "udt": "text"}, {"table": "member_tickets", "column": "purchase_date", "udt": "date"}, {"table": "member_tickets", "column": "start_date", "udt": "date"}, {"table": "member_tickets", "column": "expire_date", "udt": "date"}, {"table": "member_tickets", "column": "sessions_total", "udt": "int4"}, {"table": "member_tickets", "column": "sessions_remaining", "udt": "int4"}, {"table": "member_tickets", "column": "status", "udt": "ticket_status"}, {"table": "member_tickets", "column": "payment_status", "udt": "pay_status"}, {"table": "member_tickets", "column": "invoice_status", "udt": "invoice_status"}, {"table": "member_tickets", "column": "created_at", "udt": "timestamptz"}, {"table": "member_tickets", "column": "unit_price", "udt": "numeric"}, {"table": "member_tickets", "column": "amount_paid", "udt": "numeric"}, {"table": "member_tickets", "column": "makeup_for_booking", "udt": "text"}, {"table": "member_tickets", "column": "unlocked_sessions", "udt": "int4"}, {"table": "member_tickets", "column": "installment", "udt": "jsonb"}, {"table": "member_tickets", "column": "source_booking_id", "udt": "text"}, {"table": "member_tickets", "column": "invoice_number", "udt": "text"}, {"table": "member_tickets", "column": "activated_at", "udt": "timestamptz"}, {"table": "member_tickets", "column": "source_type", "udt": "text"}, {"table": "member_tickets", "column": "source_ref", "udt": "text"}, {"table": "member_tickets", "column": "valid_days", "udt": "int4"}, {"table": "member_tickets", "column": "shared_with", "udt": "jsonb"}, {"table": "member_tickets", "column": "sale_kind", "udt": "text"}, {"table": "member_tickets", "column": "sold_by", "udt": "text"}, {"table": "member_tickets", "column": "renew_status", "udt": "text"}, {"table": "member_tickets", "column": "renew_noted_at", "udt": "timestamptz"}, {"table": "member_tickets", "column": "renew_noted_by", "udt": "text"}, {"table": "member_tickets", "column": "note", "udt": "text"}, {"table": "member_tickets", "column": "extended_at", "udt": "timestamptz"}, {"table": "member_tickets", "column": "extended_by", "udt": "text"}, {"table": "member_tickets", "column": "extended_from", "udt": "date"}, {"table": "member_tickets", "column": "no_refund", "udt": "bool"}, {"table": "member_tickets", "column": "family_user", "udt": "text"}, {"table": "member_tickets", "column": "manual_uses", "udt": "jsonb"}, {"table": "member_tickets", "column": "void_mode", "udt": "text"}, {"table": "member_tickets", "column": "partner_id", "udt": "text"}, {"table": "member_tickets", "column": "partners", "udt": "jsonb"}, {"table": "member_tickets", "column": "activation_mode", "udt": "text"}, {"table": "purchases", "column": "id", "udt": "text"}, {"table": "purchases", "column": "member_id", "udt": "text"}, {"table": "purchases", "column": "plan_id", "udt": "text"}, {"table": "purchases", "column": "ticket_id", "udt": "text"}, {"table": "purchases", "column": "plan_name", "udt": "text"}, {"table": "purchases", "column": "list_price", "udt": "numeric"}, {"table": "purchases", "column": "deal_amount", "udt": "numeric"}, {"table": "purchases", "column": "payment_method", "udt": "text"}, {"table": "purchases", "column": "installment_count", "udt": "int4"}, {"table": "purchases", "column": "note", "udt": "text"}, {"table": "purchases", "column": "operator", "udt": "text"}, {"table": "purchases", "column": "source", "udt": "text"}, {"table": "purchases", "column": "created_at", "udt": "timestamptz"}, {"table": "purchases", "column": "ticket_type_id", "udt": "text"}, {"table": "purchases", "column": "original_price", "udt": "numeric"}, {"table": "purchases", "column": "discount_amount", "udt": "numeric"}, {"table": "purchases", "column": "payment_status", "udt": "text"}, {"table": "purchases", "column": "invoice_type", "udt": "text"}, {"table": "purchases", "column": "coach_id", "udt": "text"}, {"table": "purchases", "column": "pay_split", "udt": "jsonb"}, {"table": "purchases", "column": "credit_used", "udt": "numeric"}, {"table": "purchases", "column": "invoice_number", "udt": "text"}, {"table": "ticket_logs", "column": "id", "udt": "text"}, {"table": "ticket_logs", "column": "ticket_id", "udt": "text"}, {"table": "ticket_logs", "column": "action", "udt": "ticket_log_action"}, {"table": "ticket_logs", "column": "delta", "udt": "int4"}, {"table": "ticket_logs", "column": "booking_id", "udt": "text"}, {"table": "ticket_logs", "column": "operator", "udt": "text"}, {"table": "ticket_logs", "column": "note", "udt": "text"}, {"table": "ticket_logs", "column": "created_at", "udt": "timestamptz"}, {"table": "ticket_types", "column": "id", "udt": "text"}, {"table": "ticket_types", "column": "name", "udt": "text"}, {"table": "ticket_types", "column": "category", "udt": "ticket_category"}, {"table": "ticket_types", "column": "variant", "udt": "text"}, {"table": "ticket_types", "column": "color", "udt": "text"}, {"table": "ticket_types", "column": "time_restricted", "udt": "bool"}, {"table": "ticket_types", "column": "requires_coach", "udt": "bool"}, {"table": "ticket_types", "column": "member_bookable", "udt": "bool"}, {"table": "ticket_types", "column": "active", "udt": "bool"}, {"table": "ticket_types", "column": "code", "udt": "text"}, {"table": "ticket_types", "column": "category_id", "udt": "text"}, {"table": "ticket_types", "column": "validity_mode", "udt": "text"}, {"table": "ticket_types", "column": "validity_days", "udt": "int4"}, {"table": "ticket_types", "column": "sellable", "udt": "bool"}, {"table": "ticket_types", "column": "is_legacy", "udt": "bool"}, {"table": "ticket_types", "column": "sort_order", "udt": "int4"}, {"table": "ticket_types", "column": "benefit_type", "udt": "text"}]'::jsonb) as x("table" text,"column" text,udt text) loop if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=x."table" and c.column_name=x."column" and c.udt_name=x.udt) then raise exception 'COLUMN_MISMATCH: %.%',x."table",x."column";end if;end loop;end $col$;
do $pin$ declare x record;begin for x in select * from jsonb_each_text('{"current_employee_id()": "2fc6c9794046276e34edfd838a878d6f", "current_member_id()": "64b4cc94a492bd9ada5fa038eb29c227", "current_staff_role()": "b415c8b9ce2b59478b12b96e22a09eef", "fn_contract_cancel_holds(text,text,text)": "3cb2c8d99d8d70e2a3e188ac70e4be7f", "fn_contracts_delete_cascade()": "2538c38e14e2158afd030166a50ccf04", "fn_log_change()": "bb62d34e3fbf5fcc9305d0421ff3ede8", "fn_member_sign_installment(text,integer,text)": "8cc549573ff226306c138e85ad3f2950", "fn_tk_holding(text,text)": "9b7f69b681bab1c00970b75603f3e172", "fn_tk_is_unopened(member_tickets)": "29e5d64eb14b383ce183ecf493334608", "fn_tk_today()": "40c8662d82e8223f8442b69e29a92e86", "fn_tk_window_check(text)": "7be7c526a1e1908471ef255f128851f1", "is_any_staff()": "f2bf84a74a15a0ee806eca816891aa16", "is_staff_desk()": "4843a4de4f5b8e68d141c48215596234", "trg_tk_quota_guard()": "999c8ef061cf126c068f9ecd4405590d", "trg_tk_window_ledger()": "62fd4c6165e953750341283644f7fbf5"}'::jsonb) loop if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.'||x.key)) is distinct from x.value then raise exception 'FUNCTION_VERSION_MISMATCH: %',x.key;end if;end loop;end $pin$;
do $depacl$declare x record;begin for x in select * from jsonb_to_recordset('[{"signature": "current_employee_id()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": true, "anon_execute": true, "anon_delegate": false, "authenticated_execute": true, "authenticated_delegate": false, "service_role_execute": true, "service_role_delegate": false}, {"signature": "current_member_id()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": true, "anon_execute": true, "anon_delegate": false, "authenticated_execute": true, "authenticated_delegate": false, "service_role_execute": true, "service_role_delegate": false}, {"signature": "current_staff_role()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": true, "anon_execute": true, "anon_delegate": false, "authenticated_execute": true, "authenticated_delegate": false, "service_role_execute": true, "service_role_delegate": false}, {"signature": "fn_contract_cancel_holds(text,text,text)", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "fn_contracts_delete_cascade()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "fn_log_change()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "fn_member_sign_installment(text,integer,text)", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": true, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "fn_tk_holding(text,text)", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "fn_tk_is_unopened(member_tickets)", "config": ["search_path=public, pg_temp"], "security_definer": false, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "fn_tk_today()", "config": ["search_path=public, pg_temp"], "security_definer": false, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "fn_tk_window_check(text)", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "is_any_staff()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": true, "anon_execute": true, "anon_delegate": false, "authenticated_execute": true, "authenticated_delegate": false, "service_role_execute": true, "service_role_delegate": false}, {"signature": "is_staff_desk()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": true, "anon_execute": true, "anon_delegate": false, "authenticated_execute": true, "authenticated_delegate": false, "service_role_execute": true, "service_role_delegate": false}, {"signature": "trg_tk_quota_guard()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}, {"signature": "trg_tk_window_ledger()", "config": ["search_path=public, pg_temp"], "security_definer": true, "public_execute": false, "anon_execute": false, "anon_delegate": false, "authenticated_execute": false, "authenticated_delegate": false, "service_role_execute": false, "service_role_delegate": false}]'::jsonb) as x(signature text,config jsonb,security_definer boolean,public_execute boolean,anon_execute boolean,authenticated_execute boolean,service_role_execute boolean,anon_delegate boolean,authenticated_delegate boolean,service_role_delegate boolean) loop if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.'||x.signature) and (exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'))=x.public_execute and has_function_privilege('anon',p.oid,'execute')=x.anon_execute and has_function_privilege('anon',p.oid,'execute with grant option')=x.anon_delegate and has_function_privilege('authenticated',p.oid,'execute')=x.authenticated_execute and has_function_privilege('authenticated',p.oid,'execute with grant option')=x.authenticated_delegate and has_function_privilege('service_role',p.oid,'execute')=x.service_role_execute and has_function_privilege('service_role',p.oid,'execute with grant option')=x.service_role_delegate and to_jsonb(p.proconfig) is not distinct from x.config and p.prosecdef=x.security_definer and pg_get_userbyid(p.proowner)='postgres') then raise exception 'DEPENDENCY_ACL_CONFIG_CHANGED: %',x.signature;end if;end loop;end $depacl$;
do $trig$declare x record;begin for x in select * from jsonb_to_recordset('[{"name": "trg_change_log", "table": "contracts", "enabled": "O", "definition": "CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION fn_log_change()"}, {"name": "trg_contracts_delete_cascade", "table": "contracts", "enabled": "O", "definition": "CREATE TRIGGER trg_contracts_delete_cascade BEFORE DELETE ON public.contracts FOR EACH ROW EXECUTE FUNCTION fn_contracts_delete_cascade()"}, {"name": "trg_change_log", "table": "invoices", "enabled": "O", "definition": "CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION fn_log_change()"}, {"name": "trg_change_log", "table": "member_tickets", "enabled": "O", "definition": "CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.member_tickets FOR EACH ROW EXECUTE FUNCTION fn_log_change()"}, {"name": "trg_tk_quota_guard", "table": "member_tickets", "enabled": "O", "definition": "CREATE TRIGGER trg_tk_quota_guard BEFORE UPDATE OF sessions_remaining, sessions_total, unlocked_sessions ON public.member_tickets FOR EACH ROW EXECUTE FUNCTION trg_tk_quota_guard()"}, {"name": "trg_change_log", "table": "purchases", "enabled": "O", "definition": "CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION fn_log_change()"}, {"name": "trg_change_log", "table": "ticket_logs", "enabled": "O", "definition": "CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.ticket_logs FOR EACH ROW EXECUTE FUNCTION fn_log_change()"}, {"name": "trg_tk_window_ledger", "table": "ticket_logs", "enabled": "O", "definition": "CREATE TRIGGER trg_tk_window_ledger AFTER INSERT ON public.ticket_logs FOR EACH ROW WHEN (((new.action)::text = ''deduct''::text)) EXECUTE FUNCTION trg_tk_window_ledger()"}, {"name": "trg_change_log", "table": "ticket_types", "enabled": "O", "definition": "CREATE TRIGGER trg_change_log AFTER INSERT OR DELETE OR UPDATE ON public.ticket_types FOR EACH ROW EXECUTE FUNCTION fn_log_change()"}]'::jsonb) as x("table" text,name text,enabled text,definition text) loop if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname=x."table" and t.tgname=x.name and t.tgenabled::text=x.enabled and pg_get_triggerdef(t.oid)=x.definition) then raise exception 'TRIGGER_DEPENDENCY_CHANGED: %.%',x."table",x.name;end if;end loop;end $trig$;
do $new$declare s text;begin if to_regclass('public.installment_receipts') is not null then raise exception 'RECEIPTS_ALREADY_INSTALLED';end if;for s in select jsonb_array_elements_text('["fn_installment_signature_guard()", "fn_installment_collection_guard()", "fn_installment_request_v2(text,jsonb)", "fn_member_sign_installment_v2(text,text,text)", "fn_installment_terms(text,integer,numeric,text,integer)", "fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)"]'::jsonb) loop if to_regprocedure('public.'||s) is not null or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname=split_part(s,'(',1)) then raise exception 'NEW_FUNCTION_NAME_OCCUPIED: %',s;end if;end loop;if exists(select 1 from pg_trigger where not tgisinternal and tgname in ('trg_installment_collection_guard','trg_installment_signature_guard')) then raise exception 'NEW_TRIGGER_NAME_OCCUPIED';end if;end $new$;
create temp table ic_release_before on commit drop as select jsonb_build_object(
 'functions',(select md5(coalesce(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) order by p.oid::regprocedure::text)::text,'[]')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('fn_installment_signature_guard','fn_installment_collection_guard','fn_installment_request_v2','fn_member_sign_installment','fn_member_sign_installment_v2','fn_installment_terms','fn_installment_collect_v2')),
 'columns',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) order by c.relname,a.attnum)::text,'[]')) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and c.relname<>'installment_receipts' and a.attnum>0 and not a.attisdropped),
 'policies',(select md5(coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname)::text,'[]')) from pg_policies where schemaname='public' and tablename<>'installment_receipts'),
 'grants',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl::text) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') and c.relname<>'installment_receipts'),
 'triggers',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)::text,'[]')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and t.tgname not in ('trg_installment_collection_guard','trg_installment_signature_guard')),
 'constraints',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,x.conname,pg_get_constraintdef(x.oid)) order by c.relname,x.conname)::text,'[]')) from pg_constraint x join pg_class c on c.oid=x.conrelid where c.relnamespace='public'::regnamespace and c.relname<>'installment_receipts'),
 'indexes',(select md5(coalesce(jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) order by tablename,indexname)::text,'[]')) from pg_indexes where schemaname='public' and tablename<>'installment_receipts'),
 'views',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.reloptions,pg_get_viewdef(c.oid)) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m'))
) catalog,jsonb_build_object('contracts',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.contracts x),'member_tickets',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.member_tickets x),'purchases',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.purchases x),'ticket_logs',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.ticket_logs x),'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.invoices x)) data;
create table public.installment_receipts (
 id text primary key, ticket_id text not null, contract_id text not null,
 terms jsonb not null, signature_request_id text, invoice_choice jsonb, purchase_id text not null,
 operator text not null, paper_ack boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.installment_receipts enable row level security;
revoke all on public.installment_receipts from public,anon,authenticated,service_role;

create function public.fn_installment_terms(p_ticket_id text,p_sessions integer,p_amount numeric,p_method text,p_vouchers integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t member_tickets%rowtype; sg jsonb; cum integer:=0; fr integer; upto integer; k integer:=0; u integer;
begin
 select * into t from member_tickets where id=p_ticket_id;
 if not found or jsonb_typeof(t.installment) is distinct from 'object' or t.unlocked_sessions is null or coalesce(t.sessions_total,0)<=0 then raise exception 'INSTALLMENT.INVALID'; end if;
 u:=coalesce(t.unlocked_sessions,0);
 if p_sessions is null or p_sessions<1 or p_sessions>t.sessions_total-u or p_amount is null or p_amount<0 or (p_amount<>round(p_amount) or p_amount::text in ('NaN','Infinity','-Infinity')) or p_method not in ('cash','transfer') or p_method is null or p_vouchers is null or p_vouchers<0 then raise exception 'INSTALLMENT.INVALID_INPUT'; end if;
 if jsonb_typeof(t.installment->'segments') is distinct from 'array' then raise exception 'INSTALLMENT.INVALID'; end if;
 for sg in select value from jsonb_array_elements(t.installment->'segments') loop
  k:=k+1; if (sg#>>'{}')::integer<=0 then raise exception 'INSTALLMENT.INVALID'; end if;
  cum:=cum+(sg#>>'{}')::integer;
  if fr is null and cum>u then fr:=k; end if;
  if upto is null and cum>=u+p_sessions then upto:=k; end if;
 end loop;
 if k is distinct from (t.installment->>'count')::integer or jsonb_typeof(t.installment->'amounts') is distinct from 'array' or cum<>t.sessions_total or fr is null or upto is null then raise exception 'INSTALLMENT.INVALID'; end if;
 return jsonb_build_object('ticket_id',t.id,'member_id',t.member_id,'total',t.sessions_total,'unlocked_before',u,
  'amount_paid_before',coalesce(t.amount_paid,0),'sessions',p_sessions,'amount',p_amount,'method',p_method,'vouchers',p_vouchers,
  'period_from',fr,'period_to',upto,'segments',t.installment->'segments','amounts',t.installment->'amounts','install_count',t.installment->'count');
end $$;
revoke all on function public.fn_installment_terms(text,integer,numeric,text,integer) from public,anon,authenticated;

create function public.fn_installment_request_v2(p_ticket_id text,p_terms jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t member_tickets%rowtype; c contracts%rowtype; arr jsonb; hit jsonb; term jsonb; rid text; cnt integer;
begin
 if not coalesce(is_staff_desk(),false) or current_employee_id() is null then raise exception 'AUTH.NOT_DESK'; end if;
 select * into t from member_tickets where id=p_ticket_id for update;
 if not found then raise exception 'TICKET.NOT_FOUND'; end if;
 select count(*) into cnt from contracts where ticket_id=t.id;
 if cnt<>1 then raise exception 'CONTRACT.NOT_UNIQUE'; end if;
 select * into c from contracts where ticket_id=t.id for update;
 if c.member_id is distinct from t.member_id or c.signed_at is null or c.sign_type not in ('remote','paper') then raise exception 'CONTRACT.NOT_SIGNED'; end if;
 term:=fn_installment_terms(t.id,(p_terms->>'sessions')::integer,(p_terms->>'amount')::numeric,p_terms->>'method',(p_terms->>'vouchers')::integer);
 if term is distinct from p_terms then raise exception 'INSTALLMENT.PLAN_CHANGED'; end if;
 if c.sign_type='paper' then return jsonb_build_object('ok',true,'paper',true,'contract_id',c.id); end if;
 arr:=coalesce(c.installment_signs,'[]'::jsonb);
 select value into hit from jsonb_array_elements(arr) with ordinality a(value,ord) order by ord desc limit 1;
 if hit->'terms'=term and hit->>'request_id' is not null and not exists(select 1 from installment_receipts where terms=term and ticket_id=t.id) then
  return jsonb_build_object('ok',true,'request_id',hit->>'request_id','signed',coalesce(hit->>'signature','')<>'');
 end if;
 rid:=gen_random_uuid()::text;
 arr:=arr||jsonb_build_array(jsonb_build_object('n',term->'period_from','request_id',rid,'terms',term,'amount',term->'amount','sign_type','remote','requested_at',now(),'requested_by',current_employee_id(),'signature',null,'signed_at',null));
 update contracts set installment_signs=arr,pending_sign_n=(term->>'period_from')::integer,pending_sign_at=now() where id=c.id;
 return jsonb_build_object('ok',true,'request_id',rid,'signed',false);
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm); end $$;

create function public.fn_member_sign_installment_v2(p_contract_id text,p_request_id text,p_signature text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype; tid text; arr jsonb; hit jsonb; idx integer; term jsonb;
begin
 select ticket_id into tid from contracts where id=p_contract_id;
 perform 1 from member_tickets where id=tid for update;
 select * into c from contracts where id=p_contract_id for update;
 if not found or current_member_id() is null or c.member_id is distinct from current_member_id() then raise exception 'AUTH.FORBIDDEN'; end if;
 if c.sign_type<>'remote' or c.signed_at is null then raise exception 'CONTRACT.NOT_SIGNED'; end if;
 if p_signature is null or length(p_signature)<200 or p_signature not like 'data:image/png;base64,%' then raise exception 'SIGNATURE.INVALID'; end if;
 arr:=coalesce(c.installment_signs,'[]'::jsonb);
 select ord-1,value into idx,hit from jsonb_array_elements(arr) with ordinality a(value,ord) order by ord desc limit 1;
 if hit->>'request_id' is distinct from p_request_id or p_request_id is null then raise exception 'INSTALLMENT.PLAN_CHANGED'; end if;
 term:=hit->'terms';
 if term is distinct from fn_installment_terms(tid,(term->>'sessions')::integer,(term->>'amount')::numeric,term->>'method',(term->>'vouchers')::integer) then raise exception 'INSTALLMENT.PLAN_CHANGED'; end if;
 if coalesce(hit->>'signature','')<>'' then return jsonb_build_object('ok',true,'already',true); end if;
 arr:=jsonb_set(arr,array[idx::text],hit||jsonb_build_object('signature',p_signature,'signed_at',now()));
 perform set_config('app.ic_member_sign',p_request_id,true);
 update contracts set installment_signs=arr,pending_sign_n=null,pending_sign_at=null where id=c.id;
 perform set_config('app.ic_member_sign','',true);
 return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm); end $$;

-- Old pages cannot attach a signature to new terms they have never displayed.
-- Original legacy entries remain signable through the original RPC.
create or replace function public.fn_member_sign_installment(p_contract_id text, p_n integer, p_signature text)
 returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare c contracts%rowtype; arr jsonb; idx int; hit jsonb;
begin
  select * into c from contracts where id=p_contract_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','CONTRACT.NOT_FOUND'); end if;
  if current_member_id() is null or c.member_id <> current_member_id() then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
  end if;
  if p_signature is null or length(p_signature) < 200 then
    return jsonb_build_object('ok',false,'error_code','SIGNATURE.INVALID');
  end if;
  arr := coalesce(c.installment_signs,'[]'::jsonb);
  if exists(select 1 from jsonb_array_elements(arr) a where a->>'request_id' is not null and (a->>'n')::integer=p_n) then return jsonb_build_object('ok',false,'error_code','INSTALLMENT.REFRESH_REQUIRED'); end if;
  select i, e into idx, hit
    from jsonb_array_elements(arr) with ordinality t(e,ord), lateral (select ord-1) s(i)
   where (e->>'n')::int = p_n limit 1;
  if hit is null then return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_PENDING'); end if;
  if (hit->>'signature') is not null then return jsonb_build_object('ok',true,'already',true); end if;
  if coalesce(hit->>'sign_type','remote') <> 'remote' then
    return jsonb_build_object('ok',false,'error_code','INSTALLMENT.NOT_REMOTE');
  end if;
  arr := jsonb_set(arr, array[idx::text],
           hit || jsonb_build_object('signature',p_signature,'signed_at',to_jsonb(now())));
  update contracts
     set installment_signs=arr,
         pending_sign_n  = case when pending_sign_n = p_n then null else pending_sign_n end,
         pending_sign_at = case when pending_sign_n = p_n then null else pending_sign_at end
   where id=c.id;
  return jsonb_build_object('ok',true,'contract_id',c.id,'n',p_n);
exception when others then
  return jsonb_build_object('ok',false,'error_code',sqlerrm);
end $function$;


create function public.fn_installment_collect_v2(p_ticket_id text,p_receipt_id text,p_terms jsonb,p_paper_ack boolean,p_invoice jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t member_tickets%rowtype; c contracts%rowtype; r installment_receipts%rowtype; pur purchases%rowtype;
 term jsonb; hit jsonb; cnt integer; inst jsonb; paid jsonb:='[]'; sg jsonb; cum integer:=0; cur integer:=0; k integer:=0;
 vouchers integer; vt text; need integer; take integer; v member_tickets%rowtype; pid text; amount numeric; n integer;
begin
 if not coalesce(is_staff_desk(),false) or current_employee_id() is null then raise exception 'AUTH.NOT_DESK'; end if;
 if p_receipt_id is null or p_receipt_id !~ '^[a-zA-Z0-9_-]{8,100}$' then raise exception 'INSTALLMENT.INVALID_RECEIPT'; end if;
 select * into t from member_tickets where id=p_ticket_id for update;
 if not found then raise exception 'TICKET.NOT_FOUND'; end if;
 select * into r from installment_receipts where id=p_receipt_id;
 if found then
  if r.ticket_id is distinct from t.id or r.terms is distinct from p_terms or r.invoice_choice is distinct from p_invoice then raise exception 'INSTALLMENT.RECEIPT_CONFLICT'; end if;
  select * into pur from purchases where id=r.purchase_id;
  return jsonb_build_object('ok',true,'already',true,'purchase',to_jsonb(pur));
 end if;
 term:=fn_installment_terms(t.id,(p_terms->>'sessions')::integer,(p_terms->>'amount')::numeric,p_terms->>'method',(p_terms->>'vouchers')::integer);
 if term is distinct from p_terms or t.status is null or t.status not in ('usable','used_up') then raise exception 'INSTALLMENT.PLAN_CHANGED'; end if;
 select count(*) into cnt from contracts where ticket_id=t.id;
 if cnt<>1 then raise exception 'CONTRACT.NOT_UNIQUE'; end if;
 select * into c from contracts where ticket_id=t.id for update;
 if c.member_id is distinct from t.member_id or c.signed_at is null then raise exception 'CONTRACT.NOT_SIGNED'; end if;
 if c.sign_type='remote' then
  select value into hit from jsonb_array_elements(coalesce(c.installment_signs,'[]')) with ordinality a(value,ord) order by ord desc limit 1;
  if coalesce(hit->>'request_id','')='' or hit->'terms' is distinct from term or coalesce(hit->>'signature','')='' or hit->>'signed_at' is null then raise exception 'INSTALLMENT.SIGNATURE_REQUIRED'; end if;
 elsif c.sign_type='paper' then
  if not coalesce(p_paper_ack,false) then raise exception 'INSTALLMENT.PAPER_REQUIRED'; end if;
 else raise exception 'CONTRACT.SIGN_TYPE_UNKNOWN'; end if;
 if p_invoice is null or p_invoice->>'mode' not in ('none','carrier','ubn') or p_invoice->>'mode' is null then raise exception 'INVOICE.CHOICE_REQUIRED'; end if;
 n:=(term->>'sessions')::integer; amount:=(term->>'amount')::numeric; vouchers:=(term->>'vouchers')::integer;
 if amount>0 and p_invoice->>'mode'='carrier' and coalesce(p_invoice->>'carrierNum','')='' and coalesce(p_invoice->>'email','')='' then raise exception 'INVOICE.DELIVERY_REQUIRED'; end if;
 if amount>0 and p_invoice->>'mode'='ubn' and (coalesce(p_invoice->>'ubn','') !~ '^[0-9]{8}$' or coalesce(p_invoice->>'email','')='') then raise exception 'INVOICE.DELIVERY_REQUIRED'; end if;
 if vouchers>0 then
  select case category when '私人教練' then 'tt-discount-pt300' when '運動按摩' then 'tt-discount-ms300' end into vt from ticket_types where id=t.ticket_type_id;
  if vt is null then raise exception 'VOUCHER.NOT_ELIGIBLE'; end if;
  if vt='tt-discount-pt300' and vouchers>n/4 then raise exception 'VOUCHER.LIMIT'; end if;
  -- Lock eligible voucher rows in a stable order, then allocate earliest expiry first.
  perform 1 from member_tickets where member_id=t.member_id and ticket_type_id=vt order by id for update;
  need:=vouchers;
  for v in select * from member_tickets where member_id=t.member_id and ticket_type_id=vt and coalesce(status,'usable')='usable' and sessions_remaining>0 and (expire_date is null or expire_date >= (now() at time zone 'Asia/Taipei')::date) order by expire_date nulls last,id loop
   take:=least(need,v.sessions_remaining); if take<=0 then exit; end if;
   update member_tickets set sessions_remaining=sessions_remaining-take,status=case when sessions_remaining-take=0 then 'used_up' else status end where id=v.id;
   for k in 1..take loop insert into ticket_logs(id,ticket_id,action,delta,operator,note) values ('TL-'||gen_random_uuid(),v.id,'deduct',1,current_employee_id(),'折抵 $300（分期收款）'); end loop;
   need:=need-take; if need=0 then exit; end if;
  end loop;
  if need<>0 then raise exception 'VOUCHER.BALANCE_CHANGED'; end if;
 end if;
 inst:=t.installment; k:=0;
 for sg in select value from jsonb_array_elements(inst->'segments') loop
  k:=k+1; cum:=cum+(sg#>>'{}')::integer;
  paid:=paid||jsonb_build_array(cum<=t.unlocked_sessions+n);
  if cum<=t.unlocked_sessions+n then cur:=k; end if;
 end loop;
 inst:=inst||jsonb_build_object('paid',paid,'current',cur,'collection_receipt',p_receipt_id);
 pid:='PUR-INST-'||p_receipt_id;
 insert into installment_receipts(id,ticket_id,contract_id,terms,signature_request_id,invoice_choice,purchase_id,operator,paper_ack)
 values (p_receipt_id,t.id,c.id,term,case when c.sign_type='remote' then hit->>'request_id' end,p_invoice,pid,current_employee_id(),coalesce(p_paper_ack,false));
 update member_tickets set unlocked_sessions=t.unlocked_sessions+n,amount_paid=coalesce(t.amount_paid,0)+amount,installment=inst where id=t.id;
 if c.sign_type='paper' then
  update contracts set installment_signs=coalesce(installment_signs,'[]')||jsonb_build_array(jsonb_build_object('n',term->'period_from','terms',term,'sign_type','paper','receipt_id',p_receipt_id,'paper_ack',true,'recorded_at',now(),'by',current_employee_id())) where id=c.id;
 end if;
 insert into purchases(id,member_id,plan_id,ticket_id,plan_name,list_price,deal_amount,payment_method,coach_id,installment_count,note,operator,source)
 values(pid,t.member_id,t.source_plan_id,t.id,t.plan_name,amount+vouchers*300,amount,term->>'method',t.sold_by,(inst->>'count')::integer,
 '分期收款・開通 '||n||' 堂（第 '||(term->>'period_from')||'–'||(term->>'period_to')||' 期）'||case when vouchers>0 then '（折抵券×'||vouchers||' −$'||vouchers*300||'）' else '' end,current_employee_id(),'installment') returning * into pur;
 insert into ticket_logs(id,ticket_id,action,delta,operator,note) values ('TL-'||gen_random_uuid(),t.id,'adjust',0,current_employee_id(),'分期收款開通 '||n||' 堂，實收 $'||amount);
 return jsonb_build_object('ok',true,'already',false,'purchase',to_jsonb(pur));
exception when others then return jsonb_build_object('ok',false,'error_code',sqlerrm); end $$;

create function public.fn_installment_collection_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r installment_receipts%rowtype;
begin
 if jsonb_typeof(old.installment)='object' and coalesce(new.unlocked_sessions,0)>coalesce(old.unlocked_sessions,0) then
  select * into r from installment_receipts where id=new.installment->>'collection_receipt' and ticket_id=old.id;
  if not found or (r.terms->>'unlocked_before')::integer is distinct from coalesce(old.unlocked_sessions,0)
   or (r.terms->>'sessions')::integer is distinct from new.unlocked_sessions-coalesce(old.unlocked_sessions,0)
   or (r.terms->>'amount_paid_before')::numeric is distinct from coalesce(old.amount_paid,0)
   or (r.terms->>'amount')::numeric is distinct from coalesce(new.amount_paid,0)-coalesce(old.amount_paid,0)
  then raise exception 'INSTALLMENT.COLLECTION_REQUIRED'; end if;
 end if;
 return new;
end $$;
create trigger trg_installment_collection_guard before update on member_tickets for each row execute function fn_installment_collection_guard();
revoke all on function public.fn_installment_collection_guard() from public,anon,authenticated;
revoke all on function public.fn_installment_request_v2(text,jsonb), public.fn_member_sign_installment_v2(text,text,text), public.fn_installment_collect_v2(text,text,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.fn_installment_request_v2(text,jsonb), public.fn_member_sign_installment_v2(text,text,text), public.fn_installment_collect_v2(text,text,jsonb,boolean,jsonb) to authenticated;

-- Signed installment confirmations are append-only evidence; desk edits cannot rewrite them.
create function public.fn_installment_signature_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare oldentry jsonb; newentry jsonb;
begin
 for oldentry in select value from jsonb_array_elements(coalesce(old.installment_signs,'[]')) where coalesce(value->>'signature','')<>'' loop
  if not coalesce(new.installment_signs,'[]') @> jsonb_build_array(oldentry) then raise exception 'INSTALLMENT.SIGNED_IMMUTABLE'; end if;
 end loop;
 for newentry in select value from jsonb_array_elements(coalesce(new.installment_signs,'[]')) where value->>'request_id' is not null and coalesce(value->>'signature','')<>'' loop
  if coalesce(old.installment_signs,'[]') @> jsonb_build_array(newentry) then continue; end if;
  select value into oldentry from jsonb_array_elements(coalesce(old.installment_signs,'[]')) where value->>'request_id'=newentry->>'request_id';
  if oldentry is null or current_member_id() is distinct from old.member_id
   or current_setting('app.ic_member_sign',true) is distinct from newentry->>'request_id'
   or (oldentry - 'signature' - 'signed_at') is distinct from (newentry - 'signature' - 'signed_at')
  then raise exception 'INSTALLMENT.MEMBER_SIGNATURE_REQUIRED'; end if;
 end loop;
 return new;
end $$;
create trigger trg_installment_signature_guard before update on contracts for each row execute function fn_installment_signature_guard();
revoke all on function public.fn_installment_signature_guard() from public,anon,authenticated;

do $pin$ declare x record;begin for x in select * from jsonb_each_text('{"fn_installment_signature_guard()": "f58ed4dcd15059b321f8c7fd3531375b", "fn_installment_collection_guard()": "f9006eecee5cc6943661c080e46aa0f5", "fn_installment_request_v2(text,jsonb)": "f483f6a2b8b0ba52f6255c4c718163dd", "fn_member_sign_installment(text,integer,text)": "372f889a5647658f2b6a32a454cfe971", "fn_member_sign_installment_v2(text,text,text)": "c6b26028608a87f2dbf9c7118a025a84", "fn_installment_terms(text,integer,numeric,text,integer)": "bb7a75d11c0ce0634af87e03eda10e00", "fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)": "eb223c042b68f429a036040da4b9ba05"}'::jsonb) loop if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.'||x.key)) is distinct from x.value then raise exception 'FUNCTION_VERSION_MISMATCH: %',x.key;end if;end loop;end $pin$;
do $acl$declare s text;begin for s in select jsonb_array_elements_text('["fn_installment_request_v2(text,jsonb)", "fn_member_sign_installment_v2(text,text,text)", "fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)", "fn_member_sign_installment(text,integer,text)"]'::jsonb) loop if not has_function_privilege('authenticated',s,'execute') or has_function_privilege('anon',s,'execute') then raise exception 'API_ACL_MISMATCH: %',s;end if;end loop;for s in select jsonb_array_elements_text('["fn_installment_signature_guard()", "fn_installment_collection_guard()", "fn_installment_terms(text,integer,numeric,text,integer)"]'::jsonb) loop if has_function_privilege('authenticated',s,'execute') or has_function_privilege('anon',s,'execute') then raise exception 'INTERNAL_ACL_MISMATCH: %',s;end if;end loop;if not exists(select 1 from pg_class where oid='public.installment_receipts'::regclass and relrowsecurity) or exists(select 1 from pg_policies where schemaname='public' and tablename='installment_receipts') then raise exception 'PRIVATE_RECEIPTS_RLS_MISMATCH';end if;for s in select unnest(array['anon','authenticated','service_role']) loop if has_table_privilege(s,'public.installment_receipts','select,insert,update,delete,truncate,references,trigger') then raise exception 'RECEIPTS_ACL_MISMATCH: %',s;end if;end loop;if exists(select 1 from pg_proc where oid in (to_regprocedure('fn_installment_signature_guard()'),to_regprocedure('fn_installment_collection_guard()'),to_regprocedure('fn_installment_request_v2(text,jsonb)'),to_regprocedure('fn_member_sign_installment(text,integer,text)'),to_regprocedure('fn_member_sign_installment_v2(text,text,text)'),to_regprocedure('fn_installment_terms(text,integer,numeric,text,integer)'),to_regprocedure('fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)')) and (not prosecdef or not coalesce(proconfig @> array['search_path=public, pg_temp'],false))) then raise exception 'DEFINER_CONFIG_MISMATCH';end if;if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and t.tgenabled='O' and ((c.relname='contracts' and t.tgname='trg_installment_signature_guard' and t.tgfoid='fn_installment_signature_guard()'::regprocedure) or (c.relname='member_tickets' and t.tgname='trg_installment_collection_guard' and t.tgfoid='fn_installment_collection_guard()'::regprocedure)))<>2 then raise exception 'GUARD_TRIGGER_MISMATCH';end if;end $acl$;
do $same$begin if (select catalog from ic_release_before) is distinct from (select jsonb_build_object(
 'functions',(select md5(coalesce(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)) order by p.oid::regprocedure::text)::text,'[]')) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not in ('fn_installment_signature_guard','fn_installment_collection_guard','fn_installment_request_v2','fn_member_sign_installment','fn_member_sign_installment_v2','fn_installment_terms','fn_installment_collect_v2')),
 'columns',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) order by c.relname,a.attnum)::text,'[]')) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m') and c.relname<>'installment_receipts' and a.attnum>0 and not a.attisdropped),
 'policies',(select md5(coalesce(jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) order by schemaname,tablename,policyname)::text,'[]')) from pg_policies where schemaname='public' and tablename<>'installment_receipts'),
 'grants',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),c.relacl::text) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') and c.relname<>'installment_receipts'),
 'triggers',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)::text,'[]')) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal and t.tgname not in ('trg_installment_collection_guard','trg_installment_signature_guard')),
 'constraints',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,x.conname,pg_get_constraintdef(x.oid)) order by c.relname,x.conname)::text,'[]')) from pg_constraint x join pg_class c on c.oid=x.conrelid where c.relnamespace='public'::regnamespace and c.relname<>'installment_receipts'),
 'indexes',(select md5(coalesce(jsonb_agg(jsonb_build_array(tablename,indexname,indexdef) order by tablename,indexname)::text,'[]')) from pg_indexes where schemaname='public' and tablename<>'installment_receipts'),
 'views',(select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.reloptions,pg_get_viewdef(c.oid)) order by c.relname)::text,'[]')) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m'))
)) then raise exception 'UNRELATED_CATALOG_CHANGED';end if;if (select data from ic_release_before) is distinct from (select jsonb_build_object('contracts',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.contracts x),'member_tickets',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.member_tickets x),'purchases',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.purchases x),'ticket_logs',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.ticket_logs x),'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) from public.invoices x))) then raise exception 'BUSINESS_DATA_CHANGED';end if;end $same$;
notify pgrst,'reload schema';
commit;
