-- 階段 12 完整移除（只刪 fn_hold_settle_new_ticket）。⚠ 尚未在正式庫執行。
-- ⚠ 前端已發布後，完整移除必須**另行取得使用者明確授權**——設定 app.hs_frontend_reverted／app.hs_removal_authorization 只是防誤操作的「閘」，
--   **不能代替授權，也不能證明新版頁面已經沒人在用**（仍開著新版頁面的人會呼叫它；刪掉＝轉正與新票發放後的整理一律失敗）。
-- 預設做法：只退前端（git revert），保留這支函式（舊前端不呼叫、留著無害）。
-- 執行前（同一個交易、同一個連線）必須先設定：
--   set local app.hs_frontend_reverted = 'yes';                    -- 你確認前端已退版
--   set local app.hs_removal_authorization = '<授權紀錄／日期>';    -- 使用者明確授權的出處，不可為空
-- 以下任何一項不符都停止、什麼都不刪：叢集識別＝正式庫、精確簽名存在且只有一支、本體指紋＝安裝版、security definer＋固定 search_path、權限正好 postgres＋authenticated、沒有其他函式引用它、上述兩個設定。
begin;
do $g$
declare v_oid oid := to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)');
begin
  if not ((select system_identifier::text from pg_control_system()) = '7662742571317219726') then raise exception 'HS.RB: 不是正式庫，停止'; end if;
  if v_oid is null then raise exception 'HS.RB: 找不到精確簽名 fn_hold_settle_new_ticket(text,boolean,text,jsonb)，停止（沒有刪任何東西）'; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='fn_hold_settle_new_ticket') <> 1 then raise exception 'HS.RB: 同名函式不只一支，停止'; end if;
  if (select md5(prosrc) from pg_proc where oid = v_oid) <> '550c28a816b6e46f636287d7fa33405a' then raise exception 'HS.RB: 安裝的本體不是審查版（可能被改過），停止，不刪除'; end if;
  if not (select prosecdef and coalesce(array_to_string(proconfig, ','), '') = 'search_path=public, pg_temp' and proacl::text = '{postgres=X/postgres,authenticated=X/postgres}' from pg_proc where oid = v_oid) then raise exception 'HS.RB: security definer／search_path／權限與安裝版不符，停止'; end if;
  if coalesce(current_setting('app.hs_frontend_reverted', true), '') <> 'yes' then raise exception 'HS.RB: 未宣告前端已退版，停止'; end if;
  if length(coalesce(current_setting('app.hs_removal_authorization', true), '')) < 8 then raise exception 'HS.RB: 缺少使用者授權紀錄（app.hs_removal_authorization），停止'; end if;
  if exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname <> 'fn_hold_settle_new_ticket' and p.prosrc ~ 'fn_hold_settle_new_ticket') then raise exception 'HS.RB: 有其他函式引用它，停止'; end if;
end $g$;
drop function public.fn_hold_settle_new_ticket(text, boolean, text, jsonb);
do $post$ begin
  if to_regprocedure('public.fn_hold_settle_new_ticket(text,boolean,text,jsonb)') is not null then raise exception 'HS.RB.POST: 函式還在，回滾'; end if;
end $post$;
commit;
