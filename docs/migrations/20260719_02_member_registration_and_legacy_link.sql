-- 安全會員申辦／舊會員連結：前端不得依手機直接讀 members 或自行改 auth_id。
begin;

create type public.member_link_request_status as enum ('pending','approved','rejected','cancelled');

create table public.member_link_requests (
  id text primary key,
  auth_id uuid not null references auth.users(id) on delete cascade,
  claimed_phone text not null,
  claimed_name text not null,
  claimed_email text,
  claimed_birthday date,
  matched_member_id text references public.members(id) on delete set null,
  status public.member_link_request_status not null default 'pending',
  reviewed_by text references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (auth_id)
);

alter table public.member_link_requests enable row level security;
grant select on public.member_link_requests to authenticated;
create policy member_link_request_self_read on public.member_link_requests
  for select to authenticated using ((select auth.uid()) = auth_id);
create policy member_link_request_staff_read on public.member_link_requests
  for select to authenticated using (is_staff_desk());

-- 申辦已全部收斂到受控 RPC，移除原本任何人都能直接 INSERT members 的政策。
drop policy if exists public_self_signup_members on public.members;

create or replace function public.fn_complete_member_registration(
  p_name text, p_phone text, p_email text default null, p_birthday date default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_auth uuid := auth.uid();
  v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  v_member members%rowtype;
  v_member_id text;
  v_request_id text;
begin
  if v_auth is null then return jsonb_build_object('ok',false,'error_code','AUTH.REQUIRED'); end if;
  if nullif(btrim(p_name),'') is null then return jsonb_build_object('ok',false,'error_code','NAME.REQUIRED'); end if;
  if v_phone !~ '^09[0-9]{8}$' then return jsonb_build_object('ok',false,'error_code','PHONE.INVALID'); end if;

  select * into v_member from members where auth_id = v_auth for update;
  if found then return jsonb_build_object('ok',true,'result','already_linked','member_id',v_member.id); end if;

  select * into v_member from members where phone = v_phone for update;
  if found then
    if v_member.auth_id is not null then
      return jsonb_build_object('ok',false,'error_code','PHONE.ALREADY_LINKED');
    end if;
    v_request_id := gen_short_id('MLR-');
    insert into member_link_requests
      (id,auth_id,claimed_phone,claimed_name,claimed_email,claimed_birthday,matched_member_id)
    values
      (v_request_id,v_auth,v_phone,btrim(p_name),nullif(btrim(p_email),''),p_birthday,v_member.id)
    on conflict (auth_id) do update set
      claimed_phone=excluded.claimed_phone, claimed_name=excluded.claimed_name,
      claimed_email=excluded.claimed_email, claimed_birthday=excluded.claimed_birthday,
      matched_member_id=excluded.matched_member_id, status='pending',
      reviewed_by=null, reviewed_at=null, review_note=null
    returning id into v_request_id;
    return jsonb_build_object('ok',true,'result','pending_review','request_id',v_request_id);
  end if;

  v_member_id := gen_short_id('m');
  insert into members (id,auth_id,name,phone,email,birthday,status,level,created_at)
  values (v_member_id,v_auth,btrim(p_name),v_phone,nullif(btrim(p_email),''),p_birthday,'active','regular',now());
  return jsonb_build_object('ok',true,'result','created','member_id',v_member_id);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error_code','REGISTRATION.CONFLICT');
end
$function$;

create or replace function public.fn_review_member_link_request(
  p_request_id text, p_approve boolean, p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_req member_link_requests%rowtype;
  v_staff text := current_employee_id();
begin
  if not is_staff_desk() or v_staff is null then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
  end if;
  select * into v_req from member_link_requests where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','REQUEST.NOT_FOUND'); end if;
  if v_req.status <> 'pending' then return jsonb_build_object('ok',false,'error_code','REQUEST.ALREADY_REVIEWED'); end if;

  if p_approve then
    update members set auth_id=v_req.auth_id
    where id=v_req.matched_member_id and auth_id is null;
    if not found then return jsonb_build_object('ok',false,'error_code','MEMBER.ALREADY_LINKED'); end if;
    update member_link_requests set status='approved',reviewed_by=v_staff,reviewed_at=now(),review_note=p_note where id=p_request_id;
  else
    update member_link_requests set status='rejected',reviewed_by=v_staff,reviewed_at=now(),review_note=p_note where id=p_request_id;
  end if;
  return jsonb_build_object('ok',true,'result',case when p_approve then 'approved' else 'rejected' end,'member_id',v_req.matched_member_id);
end
$function$;

revoke execute on function public.fn_complete_member_registration(text,text,text,date) from public, anon;
grant execute on function public.fn_complete_member_registration(text,text,text,date) to authenticated;
revoke execute on function public.fn_review_member_link_request(text,boolean,text) from public, anon;
grant execute on function public.fn_review_member_link_request(text,boolean,text) to authenticated;
commit;
