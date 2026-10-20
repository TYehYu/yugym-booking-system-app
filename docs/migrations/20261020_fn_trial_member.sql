/* 教練排體驗課時「用手機找人，沒有就建一個」（2026-10-20 使用者指示：選「開，走專用通道」）

   使用者附截圖：Barry（鄭百益，一般教練）排 10/22 19:00 的體驗課、填了手機，
   跳「建立會員失敗：權限不足」，而且**整堂體驗課都沒建起來**
   （前端那一步是 return，不是 continue）。

   兩個原因疊在一起，只修一個沒有用：
     ① members 的 INSERT policy 只給 is_staff_desk()（管理員／櫃檯／主管），一般教練沒有。
     ② 就算開了 INSERT，教練的 SELECT 只看得到自己的學員 —— 填到**現有客人**的手機時
        前端查不到、會去新建，然後撞上 members_phone_key（手機唯一）→ 跳一個更難懂的錯。

   所以不是放寬 policy（那只解得掉①），而是一支 SECURITY DEFINER 的窄門：
     ・繞過 RLS 用手機查一次 ← 這是整件事的關鍵
     ・查到就回那一位的 id，查不到才建
     ・只回 id 與姓名 —— 不回電話、生日、票券，教練照樣看不到別人的會員資料
     ・只建最小欄位，不能拿來改任何既有會員

   實跑驗過（以 Barry 的身分）：
     0975893791（截圖那位）→ ok，找到既有的張育瑄，created:false
     沒填姓名   → NAME.REQUIRED
     手機 12345 → PHONE.INVALID
     別人的手機 → ok，回那一位（黃姸元），不會建出第二筆

   ⚠ members 的 policy 一個字都沒改 —— 教練仍然不能直接 insert/update members。
   ⚠ grpCompNew（當場建一位再招待）是 admin 限定，刻意不動。

   線上現行原始碼請用：
     select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='fn_trial_member';
*/
create or replace function public.fn_trial_member(p_name text, p_phone text, p_coach_id text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_me   text := current_employee_id();
  v_ok   boolean;
  v_id   text;
  v_nm   text;
  v_ph   text := nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), '');
  v_name text := btrim(coalesce(p_name,''));
begin
  if v_me is null then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;
  select (status::text <> 'inactive') into v_ok from employees where id = v_me;
  if not coalesce(v_ok,false) then return jsonb_build_object('ok',false,'error_code','AUTH.FORBIDDEN'); end if;

  if v_name = '' then return jsonb_build_object('ok',false,'error_code','NAME.REQUIRED'); end if;
  -- 前端擋過一次，但前端是畫面不是防線
  if v_ph is null or v_ph !~ '^09[0-9]{8}$' then
    return jsonb_build_object('ok',false,'error_code','PHONE.INVALID'); end if;

  -- 繞過 RLS 查一次：這是教練自己做不到的那一步
  select id, name into v_id, v_nm from members where phone = v_ph limit 1;
  if v_id is not null then
    return jsonb_build_object('ok',true,'created',false,'id',v_id,'name',v_nm);
  end if;

  v_id := gen_short_id('m-');
  insert into members (id,name,phone,status,level,must_setup,tier_epoch,default_coach_id,created_at)
  values (v_id, v_name, v_ph, 'active', 'regular', true, false, nullif(p_coach_id,''), now());
  return jsonb_build_object('ok',true,'created',true,'id',v_id,'name',v_name);
exception
  when unique_violation then
    -- 極少見的競態：剛剛同時有人用同一支手機建了
    select id, name into v_id, v_nm from members where phone = v_ph limit 1;
    if v_id is not null then
      return jsonb_build_object('ok',true,'created',false,'id',v_id,'name',v_nm); end if;
    return jsonb_build_object('ok',false,'error_code','PHONE.DUPLICATE');
  when others then
    return jsonb_build_object('ok',false,'error_code',SQLERRM);
end $function$;

revoke all on function public.fn_trial_member(text,text,text) from public;
grant execute on function public.fn_trial_member(text,text,text) to authenticated;
