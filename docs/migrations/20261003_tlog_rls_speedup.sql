/* 訓練課表讀取逾時（2026-10-02 事故，教練鄭百益回報）

   症狀：教練在課表按「新增動作」→ 儲存 → **畫面上不出現**；再按一次還是不出現。
     同一位教練同一堂課連打了 7 次「旋轉」，7 筆全部確實寫進資料庫。
     使用者同日另一句「我開課表也很難開」是同一件事的另一面。

   真正的成因 ——**不是寫不進去，是讀不回來**：
     存檔後 `renderTrainingLogSheet` 會重讀整張 training_logs，
     而 training_logs 的讀取政策 tlog_select_scoped 裡有一段
     「或者：這筆紀錄的會員，是我帶過課的會員」，寫成了對每一筆紀錄
     重新掃一次 bookings 的相關子查詢。
     1,096 筆紀錄 × 9,504 筆預約 ＝ 一千萬次比對（實測 444 次 bookings 全表掃描）。
     熱快取 1.3 秒、冷快取遠超過 8 秒的 statement_timeout → 查詢被資料庫砍掉。

   ⚠⚠ 而前端那一行是 `try{ allLogs=await dbGetAll('training_logs'); }catch(_){}` ——
     **錯誤被吞掉，allLogs 變成空陣列**。於是：
       ・今日紀錄一筆都不畫（看起來像「沒存進去」）
       ・tlNextSeq 從空陣列算，每次都回 1（這才是「seq 每次都是 1」的真相）
     靜默吞錯讓這個洞查了兩天，一度誤判成「分頁漏列」與「壞快取」。

   為什麼現在才爆：training_logs 10/01 前後才突破 1,000 筆，
     而 bookings 一直在長。兩者相乘跨過 8 秒那條線就一次爆開。

   修法：把「這位教練帶過哪些會員」算成**一次**，不要每一筆紀錄重算一次。

   ⚠⚠ 寫法有陷阱，第一次就踩進去了：
     寫成 `member_id = any(coach_taught_member_ids())` **更慢**，20 秒還跑不完。
     STABLE 只保證「同一句話裡結果不變」，**不保證 Postgres 只算一次**；
     直接把函式寫在條件裡，它就是一列呼叫一次。
     要讓它只算一次，必須寫成子查詢的形式：
       `member_id in (select unnest(coach_taught_member_ids()))`
     查詢計畫裡會看到 `hashed SubPlan`，而且 loops=1 —— 這是驗收的憑據。
     （同理，`is_admin()` 那幾支也都包成 `(select is_admin())`。）

   實測（鄭百益）：逾時被砍 → 408 毫秒，**回傳的 660 筆一模一樣**；
     會員端同時驗過：只看得到自己那 55 筆，沒有多也沒有少。
   ⚠ 這支 migration 只改「怎麼算」，不改「誰看得到什麼」——
     集合的條件逐字對齊原政策：未取消的課、原教練或代課、單人 member_id
     或團課 member_ids 裡有他。

   〔還沒做、可以再快〕tlog_select_partner（同行會員那條）對教練來說一定不成立，
     但現在仍會對每一筆跑一次 bookings＋member_tickets 的巢狀查詢（實測 436 次）。
     在最前面加一句 `(select current_member_id()) is not null` 就能整段跳過。 */

create or replace function public.coach_taught_member_ids()
returns text[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(array_agg(distinct m), '{}'::text[]) from (
    /* 單人課：這一堂掛在誰名下 */
    select b.member_id as m
      from bookings b
     where b.status is distinct from 'cancelled'
       and (b.coach_id = current_employee_id() or b.substitute_coach_id = current_employee_id())
       and b.member_id is not null
    union
    /* 團課：名單在 member_ids（jsonb 陣列）
       ⚠ jsonb_typeof 一定要擋：member_ids 有可能是 null 或不是陣列，
         直接展開會整句報錯，而 RLS 裡報錯＝那個人什麼都讀不到。 */
    select jsonb_array_elements_text(b.member_ids)
      from bookings b
     where b.status is distinct from 'cancelled'
       and (b.coach_id = current_employee_id() or b.substitute_coach_id = current_employee_id())
       and jsonb_typeof(b.member_ids) = 'array'
  ) s;
$function$;

comment on function public.coach_taught_member_ids() is
  '這位登入教練帶過（未取消的課，含代課、含團課名單）的會員 id 陣列。無參數且 STABLE，讓查詢計畫只算一次 —— 原本寫成相關子查詢時，1096 筆訓練紀錄會讓 bookings 被掃 444 次、整句 1.3 秒起跳並經常逾時。2026-10-02 事故修正。';

revoke all on function public.coach_taught_member_ids() from public;
grant execute on function public.coach_taught_member_ids() to authenticated;
grant execute on function public.coach_taught_member_ids() to service_role;

/* 政策本體：四個條件與原本**完全相同**，只有第四條換了算法。
   ⚠ 第四條一定要是 `in (select unnest(...))`，不可以寫成 `= any(函式())`（見開頭說明）。 */
drop policy if exists tlog_select_scoped on public.training_logs;
create policy tlog_select_scoped on public.training_logs
for select
using (
  (select is_admin())
  or coach_id = (select current_employee_id())
  or member_id = (select current_member_id())
  or member_id in (select unnest(coach_taught_member_ids()))
);
