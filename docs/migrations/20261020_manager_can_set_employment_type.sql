/* 主管也能調整員工的僱用別（2026-10-20 使用者指示：「新增這個功能進主管」）

   起因：Mango 11/1 轉合作教練，使用者人在國外，要請主管去按。
   但員工資料在資料庫層只放行 is_admin()（fn_employees_guard），
   而且〔員工〕整頁本來就只有管理員進得去 —— 主管連人都點不到。

   做法是**窄門**，不是把 employees 的寫入權限交出去。兩支：
     ① fn_set_employment_type(p_emp_id, p_type)  新增
     ② fn_employees_guard                        加一個旗標縫

   ⚠ 這份檔案是「已經跑過的內容備查」—— 正式庫在 2026-10-20 已依序套用
     （中間改過三版：pay_type 欄位不存在、enum 要轉型、desk_alert 是會員那套、
       以及最關鍵的「SECURITY DEFINER 仍然會踩到 trigger」）。

   實跑驗過（拋棄式測試員 EMP-TEST-ETYPE，跑完已刪）：
     主管改測試員      → ok，2026-09 凍結 full_time、2026-10 contractor、現值跟著變
     改自己            → EMP.SELF
     改管理員          → EMP.IS_ADMIN
     一般教練呼叫      → AUTH.NOT_MANAGER
     亂填身分          → TYPE.INVALID
     查無此人          → EMP.NOT_FOUND
     同身分再按        → ok + unchanged
     主管繞過 RPC 直接 update employees set base_salary=99999 → 仍被 EMP.GUARD 擋
     主管繞過 RPC 直接 update employees set is_manager=true   → 仍被 EMP.GUARD 擋

   取線上現行定義請用：
     select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('fn_set_employment_type','fn_employees_guard');
*/

-- ── ② guard 的窄縫 ────────────────────────────────────────────────────
-- RPC 雖然是 SECURITY DEFINER，但 trigger 看的是 auth.role() 與 is_admin()，
-- 主管呼叫時兩者都不成立 → 整包被擋成「EMP.GUARD: 欄位 … 僅管理員可修改」。
-- 用一個 local GUC（交易結束自動消失）放行**欄位清單**，不是整列：
-- 姓名、帳號、role、status、auth_id、leader_*、is_manager、is_supervisor 都不在清單內。
create or replace function public.fn_employees_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_changed text[];
  v_allowed text[] := array['name_en','email','birthday','must_setup','line_user_id','line_bind_token'];
  v_bad text[];
begin
  if coalesce(auth.role(),'') not in ('anon','authenticated') then return new; end if;
  if is_admin() then return new; end if;

  if coalesce(current_setting('app.emp_type_rpc', true),'') = '1' then
    v_allowed := v_allowed || array[
      'pay_rules','employment_type','need_duty','weekly_work_days','weekly_min_shift_days',
      'base_salary','duty_hourly','pt_mode','pt_rate','pay_rate','pt_tiers','group_rate',
      'pt_bonus_enabled','pt_bonus','custom_salary'];
  end if;

  select coalesce(array_agg(n.key),'{}') into v_changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value;

  if new.role='admin' and old.role is distinct from 'admin'
     and new.auth_id = auth.uid()
     and not exists (select 1 from employees e where e.role='admin' and e.status='active' and e.id<>new.id)
  then
    v_allowed := v_allowed || array['role','status'];
  end if;

  select coalesce(array_agg(k),'{}') into v_bad
  from unnest(v_changed) k where k <> all(v_allowed);
  if array_length(v_bad,1) > 0 then
    raise exception 'EMP.GUARD: 欄位 % 僅管理員可修改', array_to_string(v_bad,', ');
  end if;
  return new;
end $function$;

-- ── ① 窄門本體（第四版，線上就是這一份）─────────────────────────────
-- 月份快照的規矩與前端 saveHrSalary 完全一致：
--   ① 這個月以前都還沒有版本 → 先把「現在的樣子」凍結到上個月
--      （否則改了 11 月，沒有版本的 10 月會跟著讀到新條件，11/5 發的薪水就對不上）
--   ② 這個月已經有版本、而且身分就是要改成的那一種 → 原封不動用它
--      （管理員先設好的客製條件優先；Mango 的 2026-11 就是這種）
--      否則用該身分的薪資制度模板重建
--   ③ 現值欄位跟著這個月的版本走（班表、員工卡讀的是現值）
-- 線上現行原始碼請用上面那句 pg_get_functiondef 取回，這裡不重貼一次，
-- 以免兩份漂掉（見 memory「Edge Function 版控會漂」的同一個教訓）。
