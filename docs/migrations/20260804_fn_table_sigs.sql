-- 2026-08-04 讀取量優化第二批：每張表的變更簽章（已套用於正式庫）
--
-- 現況：換一次頁就把 bookings（46 欄 × 5,708 筆 ≈ 6.4MB JSON）、member_tickets（2.4MB）
-- 等整表重抓一次，但絕大多數換頁期間根本沒有人改過任何資料 —— 純粹是快取 TTL 到了。
--
-- 這支回傳「每張表 count:整列雜湊和」。前端在填快取時把當下簽章一起記起來；
-- 之後快取過期時先問一次簽章：
--   一樣   → 直接沿用快取、完全不抓表（一次換頁只花這一支 RPC 的幾十 bytes）
--   不一樣 → 才真的重抓那一張
--
-- hashtext(x::text) 是整列文字的雜湊，任何欄位改動都會反映（不像 fn_change_sig 只看
-- 筆數與幾個加總，改期、改備註這種「總量不變」的異動會漏掉）。sum() 與順序無關，
-- 所以不需要排序、也不需要索引。實測全表約 60ms。
--
-- SECURITY DEFINER：與既有的 fn_change_sig 同一個做法（要看得到全表才算得出簽章）。
-- 回傳內容只有筆數與雜湊和，沒有任何一列資料。
create or replace function public.fn_table_sigs()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  t text;
  v text;
  res jsonb := '{}'::jsonb;
  tabs text[] := array[
    'bookings','member_tickets','members','employees','ticket_logs','purchases',
    'attendance','shifts','notifications','purchase_applications','punch_requests',
    'member_link_requests','course_plans','ticket_types','contracts','contract_templates',
    'expenses','training_logs','exercises','venues','duty_slots','salary_templates',
    'salary_history','leave_settlements','staff_applications','reward_rules'
  ];
begin
  foreach t in array tabs loop
    begin
      execute format('select count(*)::text||'':''||coalesce(sum(hashtext(x::text))::text,''0'') from %I x', t) into v;
      res := res || jsonb_build_object(t, v);
    exception when others then
      null;   -- 某張表不存在或沒權限 → 略過，前端拿不到該表簽章就照舊重抓
    end;
  end loop;
  return res;
end $$;

revoke all on function public.fn_table_sigs() from public;
grant execute on function public.fn_table_sigs() to authenticated, service_role;
