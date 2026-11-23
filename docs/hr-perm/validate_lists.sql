-- 上線前名單檢查（唯讀 SELECT，可對正式庫跑；先用測試庫彩排）。
-- 用法：把你填好的名單貼進下面兩個 values（格式見 PREPROD_LISTS.md），整段執行；每一列的 problem 欄必須都是空的才算通過。
with
scope_in(manager_id, employee_id) as (values
  ('E-MGR-001','E-COACH-101'),('E-MGR-001','E-COACH-102'),('E-MGR-002','E-COACH-103')),   -- ← 換成真實名單
grants_in(employee_id, duty) as (values
  ('E-HR-001','pay_view'),('E-HR-001','pay_adjust'),('E-HR-002','insure'))                  -- ← 換成真實名單
select 'manager_scope' as list, s.manager_id as a, s.employee_id as b,
  concat_ws('；',
    case when m.id is null then '主管 id 不存在' end,
    case when m.id is not null and not coalesce(m.is_manager,false) then '這個人不是主管（employees.is_manager 不是 true）' end,
    case when m.id is not null and m.status::text <> 'active' then '主管不是在職' end,
    case when e.id is null then '員工 id 不存在' end,
    case when e.id is not null and e.status::text <> 'active' then '員工不是在職（確認是否仍要列入）' end,
    case when s.manager_id = s.employee_id then '主管不能管自己' end) as problem
from scope_in s left join employees m on m.id = s.manager_id left join employees e on e.id = s.employee_id
union all
select 'hr_grants', g.employee_id, g.duty,
  concat_ws('；',
    case when e.id is null then '員工 id 不存在' end,
    case when e.id is not null and e.status::text <> 'active' then '員工不是在職' end,
    case when g.duty not in ('pay_view','pay_adjust','pay_publish','insure','employment','leave_settle') then 'duty 不合法' end,
    case when e.role::text = 'admin' then '提醒：系統管理員要在 admin_implicit_hr 改成 false 之後才需要這筆' end)
from grants_in g left join employees e on e.id = g.employee_id
order by 1, 2, 3;

-- 參考：目前有哪些人可以被填進去（主管候選＝employees.is_manager；其餘看 role）
-- select id, name, role, status, is_manager from employees where status::text = 'active' order by role, is_manager desc, name;
