-- ═══════════════════════════════════════════════════════════════════════
-- 備份核對（唯讀 SELECT；測試庫 kucvxpjatptfckhlxptj）。同步前、回復後各跑一次。
-- 比對：測試庫現況 md5／長度／ACL 是否等於 ..._00_backup_originals_DEFS.sql 的清單。
-- 同步前預期：5 列，且每列 exists_by_sig／md5_match／len_match／acl_match／sysid_ok／no_prod_marks 全為 true、overloads = 1；同步後（S2 套用）預期 md5 變成正式庫版本，all_match = false 屬正常。
-- 另外回傳庫識別（sysid_ok、no_prod_marks）；兩者必須為 true 才可繼續任何後續步驟。
-- ═══════════════════════════════════════════════════════════════════════
select e.sig,
       (p.oid is not null) as exists_by_sig,
       (select count(*) from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = split_part(e.sig, '(', 1)) as overloads,
       (md5(pg_get_functiondef(p.oid)) = e.md5) as md5_match,
       (length(pg_get_functiondef(p.oid)) = e.len) as len_match,
       (coalesce(p.proacl::text, '') = e.acl) as acl_match,
       ((select system_identifier::text from pg_control_system()) = '7662742571317219726') as sysid_ok,
       (to_regclass('public.change_log') is null and not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs')) as no_prod_marks
  from (values
    ('is_staff_desk()','bb43212eea2a8b0f0cd4d8bdebd71884',226,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_limit_end(date)','a532478157a385c984e5f874ff71676d',565,'{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_check(text,text,text,text)','5b20a677bc7f1e9c0b89cb517717b25c',1411,'{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_contract_hold_guard()','7fda39ead32176116ee06a1a54136ee1',1413,'{postgres=X/postgres,service_role=X/postgres}'),
    ('fn_hold_month_guard()','66dc9a52f65414f3a8dc2106cac5f424',3169,'{postgres=X/postgres,service_role=X/postgres}')
  ) as e(sig, md5, len, acl)
  left join pg_proc p on p.oid = to_regprocedure('public.' || e.sig)
 order by e.sig
 limit 10;
