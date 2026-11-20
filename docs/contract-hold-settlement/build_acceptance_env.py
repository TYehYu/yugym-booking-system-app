from pathlib import Path
import json
r=Path(__file__).resolve().parent;root=r.parents[1]
b=json.loads((r/'ACCEPTANCE_BEFORE.json').read_text())
guard="""do $guard$begin if (select system_identifier::text from pg_control_system()) <> '7662742571317219726' then raise exception 'TEST_DB_ONLY';end if;end $guard$;
"""
q='begin;\nset local lock_timeout=\'5s\';\n'+guard+"""do $pre$begin
 if to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)') is not null or to_regclass('public.booking_op_rev') is not null or to_regclass('public.ticket_deduct_ops') is not null or to_regprocedure('public.zz_hs_fingerprint()') is not null then raise exception 'TEST_BASELINE_CHANGED';end if;
 if (select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f') <> '"""+b['baseline']['functions']+"' then raise exception 'TEST_FUNCTIONS_CHANGED';end if;end $pre$;\n"
for f in ['20261118_tk_quota_guard.sql','20261118_fn_refund_ticket.sql','20261117_fn_desk_deduct_ticket.sql','20261120_renewal_hold_slots.sql']:q+=(root/'docs/migrations'/f).read_text()+'\n'
q+=(r/'current_net_dependency.sql').read_text()+'\n'+(r/'current_dependency_overrides.sql').read_text()+'\n'+(r/'candidate.sql').read_text()+"\nrevoke all on function public.fn_hold_settle_new_ticket(text,boolean,text,jsonb) from public,anon,service_role,authenticated;grant execute on function public.fn_hold_settle_new_ticket(text,boolean,text,jsonb) to authenticated;\nrevoke all on function public.fn_ticket_net_checked(text,text) from public,anon,authenticated,service_role;\n"+(r/'phase_observer.sql').read_text()+"\ncommit;\nselect md5(prosrc) body_md5,proacl::text from pg_proc where oid='public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)'::regprocedure;\n"
(r/'acceptance_install_test.sql').write_text(q)
q='begin;\nset local lock_timeout=\'5s\';\n'+guard+"""do $pre$begin
 if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)')) is distinct from '990f6dd850e5beb6a1e2360a2075174d' then raise exception 'BODY_CHANGED';end if;
 if exists(select 1 from bookings where id like 'CC-HS-%') or exists(select 1 from members where id like 'CC-HS-%') or exists(select 1 from contracts where id like 'CC-HS-%') or exists(select 1 from member_tickets where id like 'CC-HS-%') then raise exception 'FIXTURES_NOT_CLEANED';end if;
end $pre$;
drop function public.zz_hs_call(text,text,jsonb,int,int,int);
drop function public.zz_hs_fingerprint();
drop function public.fn_hold_settle_new_ticket(text,boolean,text,jsonb);
drop function public.fn_contract_adopt_holds(text,text[],boolean);
drop trigger trg_contract_window_ins on bookings;
drop trigger trg_contract_window_upd on bookings;
drop trigger trg_bookings_hold_state_guard on bookings;
drop function public.trg_contract_window_booking();
drop function public.fn_contract_window_check(text,boolean);
drop function public.fn_hold_state_guard();
drop trigger trg_booking_op_rev on bookings;
drop trigger trg_booking_op_rev_insdel on bookings;
drop function public.fn_desk_cancel_booking(text,text);
drop function public.fn_desk_deduct_ticket(text,text,text,text);
drop function public.fn_desk_op_begin(text,text,text,text);
drop function public.fn_desk_booking_rev(text);
drop function public.fn_booking_rev_of(text);
drop function public.trg_booking_op_rev();
drop table public.ticket_deduct_ops;
drop table public.booking_op_rev;
drop trigger trg_tk_quota_guard on member_tickets;
drop function public.fn_refund_ticket(text,text,text);
drop function public.trg_tk_quota_guard();
drop function public.fn_ticket_net_checked(text,text);
"""
q+='\n'.join(x['definition']+';' for x in b['original_defs'])
q+="\ndo $check$begin if (select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid::regprocedure::text)) from pg_proc where pronamespace='public'::regnamespace and prokind='f') <> '"+b['baseline']['functions']+"' then raise exception 'BASELINE_NOT_RESTORED';end if;end $check$;\nnotify pgrst,'reload schema';commit;"
(r/'acceptance_restore_test.sql').write_text(q)
