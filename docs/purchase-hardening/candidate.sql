-- Candidate only, TEST database only; not a production release script.
do $$begin if (select system_identifier::text from pg_control_system())<>'7662742571317219726' then raise exception 'TEST_DATABASE_ONLY';end if;end$$;
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
