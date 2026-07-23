-- 會員自助申辦：新會員與舊會員綁定「統一進櫃台審核佇列」
-- 2026-07-23 使用者定案：
--   ① 掃 QR → 填姓名＋手機（＋Email／生日）→ 設密碼建立 Auth 帳號 → 呼叫 RPC 送申請
--   ② 手機命中既有會員 → kind='link'（核准後把 auth_id 綁到該會員，接上舊票券/預約）
--   ③ 手機查無      → kind='new' （核准後才建立 members 資料）—— 不再直接建檔，
--      避免匿名入口被灌水，也讓櫃台當面確認身分（本館現場模式，比簡訊 OTP 快）
--   ④ 核准前會員登得進來但看不到任何資料（members 無對應 auth_id）
--
-- 前置：20260719_02（member_link_requests 與兩支 RPC）。本檔為其增修版，可重複執行。
-- ── 1) 佇列表：加 kind（link/new）──
alter table public.member_link_requests
  add column if not exists kind text not null default 'link';
do $$
begin
  if not exists (select 1 from pg_constraint where conname='member_link_requests_kind_chk') then
    alter table public.member_link_requests
      add constraint member_link_requests_kind_chk check (kind in ('link','new'));
  end if;
end $$;

-- ── 2) 申請 RPC：新會員也只建申請、不建會員 ──
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
  v_kind text := 'new';
  v_matched text := null;
  v_request_id text;
begin
  if v_auth is null then return jsonb_build_object('ok',false,'error_code','AUTH.REQUIRED'); end if;
  if nullif(btrim(p_name),'') is null then return jsonb_build_object('ok',false,'error_code','NAME.REQUIRED'); end if;
  if v_phone !~ '^09[0-9]{8}$' then return jsonb_build_object('ok',false,'error_code','PHONE.INVALID'); end if;

  -- 已經是綁定好的會員 → 直接回報，不重複送件
  select * into v_member from members where auth_id = v_auth;
  if found then return jsonb_build_object('ok',true,'result','already_linked','member_id',v_member.id); end if;

  select * into v_member from members where phone = v_phone;
  if found then
    if v_member.auth_id is not null then
      -- 該手機已被別的帳號綁走 → 不透露會員資訊，請本人洽櫃台
      return jsonb_build_object('ok',false,'error_code','PHONE.ALREADY_LINKED');
    end if;
    v_kind := 'link'; v_matched := v_member.id;
  end if;

  v_request_id := gen_short_id('MLR-');
  insert into member_link_requests
    (id,auth_id,claimed_phone,claimed_name,claimed_email,claimed_birthday,matched_member_id,kind)
  values
    (v_request_id,v_auth,v_phone,btrim(p_name),nullif(btrim(p_email),''),p_birthday,v_matched,v_kind)
  on conflict (auth_id) do update set
    claimed_phone=excluded.claimed_phone, claimed_name=excluded.claimed_name,
    claimed_email=excluded.claimed_email, claimed_birthday=excluded.claimed_birthday,
    matched_member_id=excluded.matched_member_id, kind=excluded.kind, status='pending',
    reviewed_by=null, reviewed_at=null, review_note=null
  returning id into v_request_id;

  -- 回傳 kind 供前端顯示不同文案（命中＝請櫃台確認；新客＝已送出待建檔）
  return jsonb_build_object('ok',true,'result','pending_review','kind',v_kind,'request_id',v_request_id);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error_code','REGISTRATION.CONFLICT');
end
$function$;

-- ── 3) 審核 RPC：核准時 link→綁定既有會員、new→建立會員 ──
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
  v_member_id text;
  v_dup text;
begin
  if not is_staff_desk() or v_staff is null then
    return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN');
  end if;
  select * into v_req from member_link_requests where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','REQUEST.NOT_FOUND'); end if;
  if v_req.status <> 'pending' then return jsonb_build_object('ok',false,'error_code','REQUEST.ALREADY_REVIEWED'); end if;

  if not p_approve then
    update member_link_requests set status='rejected',reviewed_by=v_staff,reviewed_at=now(),review_note=p_note
     where id=p_request_id;
    return jsonb_build_object('ok',true,'result','rejected');
  end if;

  if v_req.kind='link' then
    update members set auth_id=v_req.auth_id
     where id=v_req.matched_member_id and auth_id is null;
    if not found then return jsonb_build_object('ok',false,'error_code','MEMBER.ALREADY_LINKED'); end if;
    v_member_id := v_req.matched_member_id;
  else
    -- 送件後才有人用同手機建了會員 → 改綁那一筆，避免重複建檔
    select id into v_dup from members where phone=v_req.claimed_phone limit 1;
    if v_dup is not null then
      update members set auth_id=v_req.auth_id where id=v_dup and auth_id is null;
      if not found then return jsonb_build_object('ok',false,'error_code','MEMBER.ALREADY_LINKED'); end if;
      v_member_id := v_dup;
    else
      v_member_id := gen_short_id('m');
      insert into members (id,auth_id,name,phone,email,birthday,status,level,created_at)
      values (v_member_id,v_req.auth_id,v_req.claimed_name,v_req.claimed_phone,
              v_req.claimed_email,v_req.claimed_birthday,'active','regular',now());
    end if;
  end if;

  update member_link_requests set status='approved',reviewed_by=v_staff,reviewed_at=now(),review_note=p_note
   where id=p_request_id;
  return jsonb_build_object('ok',true,'result','approved','member_id',v_member_id,'kind',v_req.kind);
end
$function$;

-- ── 4) 授權：只有登入者可送件；審核由員工呼叫（函式內再檢查 is_staff_desk）──
revoke execute on function public.fn_complete_member_registration(text,text,text,date) from public, anon;
grant  execute on function public.fn_complete_member_registration(text,text,text,date) to authenticated;
revoke execute on function public.fn_review_member_link_request(text,boolean,text) from public, anon;
grant  execute on function public.fn_review_member_link_request(text,boolean,text) to authenticated;

-- ── 5) 關掉「任何人都能寫入 members」的舊政策，同時確保櫃台仍可建會員 ──
--    （正式庫至今仍留著 public_self_signup_members：INSERT / anon+authenticated / check true。
--      移除時務必一併補 staff insert，否則重演 2026-07-21「櫃台建不了會員」的 RLS 事故。）
drop policy if exists public_self_signup_members on public.members;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='members' and policyname='members_insert_staff') then
    create policy members_insert_staff on public.members
      for insert to authenticated with check (is_staff_desk());
  end if;
end $$;

-- 回退：
--   drop policy if exists members_insert_staff on public.members;
--   create policy public_self_signup_members on public.members for insert to anon,authenticated with check (true);
--   alter table public.member_link_requests drop constraint if exists member_link_requests_kind_chk;
--   alter table public.member_link_requests drop column if exists kind;
--   （兩支函式回退為 20260719_02 版本）
