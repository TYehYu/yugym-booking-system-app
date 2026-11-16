-- 正式庫｜教練請假補償｜部署後驗證（唯讀 SELECT；尚未執行）。全部結果以「預期」欄為準；任何一項不符＝依該階段回復檔處理。
select p.proname, md5(p.prosrc)||':'||length(p.prosrc) as fp, p.proacl::text as acl from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname in ('fn_tk_leave_comp_weeks','fn_tk_leave_comp_days','fn_coach_leave_comp_week','fn_coach_leave_comp','fn_tk_activate','fn_tk_recalc') order by 1;
-- 預期：fn_coach_leave_comp acl＝{postgres=X/postgres,authenticated=X/postgres}；其餘 acl＝{postgres=X/postgres}；fn_tk_activate＝01bdaa33cbf4f91f51caa92fa66a2767:1535；fn_tk_recalc＝d59b56f3816c23243f23618914bdc9d9:1526
select public.fn_tk_leave_comp_days('NO-SUCH-TICKET') as zero_expected;
