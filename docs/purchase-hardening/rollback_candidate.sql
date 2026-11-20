-- TEST-only rollback fragment. Caller must wrap BEGIN/COMMIT; never use on production.
-- Refuses removal after any receipt exists: preserve financial evidence.
do $guard$
declare kv record; actual text;
begin
 if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_DATABASE_ONLY';end if;
 if exists(select 1 from installment_receipts) then raise exception 'INSTALLMENT.RECEIPTS_EXIST_KEEP_OBJECTS';end if;
 for kv in select * from jsonb_each_text('{"fn_installment_signature_guard()":"f58ed4dcd15059b321f8c7fd3531375b","fn_installment_collection_guard()":"f9006eecee5cc6943661c080e46aa0f5","fn_installment_request_v2(text,jsonb)":"f483f6a2b8b0ba52f6255c4c718163dd","fn_member_sign_installment(text,integer,text)":"372f889a5647658f2b6a32a454cfe971","fn_member_sign_installment_v2(text,text,text)":"c6b26028608a87f2dbf9c7118a025a84","fn_installment_terms(text,integer,numeric,text,integer)":"bb7a75d11c0ce0634af87e03eda10e00","fn_installment_collect_v2(text,text,jsonb,boolean,jsonb)":"eb223c042b68f429a036040da4b9ba05"}'::jsonb) loop
  select md5(prosrc) into actual from pg_proc where oid=to_regprocedure('public.'||kv.key);
  if actual is distinct from kv.value then raise exception 'ROLLBACK.VERSION_MISMATCH: %',kv.key;end if;
 end loop;
 if not exists(select 1 from pg_class where oid='installment_receipts'::regclass and relrowsecurity) or has_table_privilege('authenticated','installment_receipts','insert') then raise exception 'ROLLBACK.PERMISSIONS_CHANGED';end if;
end $guard$;
drop trigger trg_installment_collection_guard on member_tickets;
drop trigger trg_installment_signature_guard on contracts;
drop function fn_installment_signature_guard();
drop function fn_installment_collection_guard();
drop function fn_installment_collect_v2(text,text,jsonb,boolean,jsonb);
drop function fn_member_sign_installment_v2(text,text,text);
drop function fn_installment_request_v2(text,jsonb);
drop function fn_installment_terms(text,integer,numeric,text,integer);
drop table installment_receipts;
CREATE OR REPLACE FUNCTION public.fn_member_sign_installment(p_contract_id text, p_n integer, p_signature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c contracts%rowtype;
  arr jsonb;
  idx int;
  hit jsonb;
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
  select i, e into idx, hit
    from jsonb_array_elements(arr) with ordinality t(e,ord), lateral (select ord-1) s(i)
   where (e->>'n')::int = p_n
   limit 1;

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
revoke all on function public.fn_member_sign_installment(text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.fn_member_sign_installment(text,integer,text) to authenticated;
