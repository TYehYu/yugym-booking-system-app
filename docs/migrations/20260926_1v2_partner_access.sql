/* 1V2 同行會員：教練能設定 ＋ 同行那位看得到（2026-09-26 使用者指示）

   ══ 由來 ═══════════════════════════════════════════════════════════
   0924 上線的「同行會員」只做完櫃檯端。使用者回報兩個洞：
     「教練的桌機看不到同行的按鈕」
     「會員看不到會員B也沒得切換」
   這一次補的是資料庫這一側 —— 前端就算把按鈕畫出來，現在的 RLS 也不會讓它成功：
     ・member_tickets 只有 is_staff_desk() 能寫（mt_all_staff），教練是唯讀（mt_coach_read）
     ・member_tickets 的會員讀取（mt_select_member）只認持有人與共享者，**不認同行人**
     ・training_logs 的會員讀取只認 member_id＝自己，同行那位讀不到
     ・members 只給「自己」與「帶過這位會員的教練」，會員之間讀不到彼此的姓名
   bookings 那一側 0924 已經開好了（bookings_select_partner／_partner_booking），
   所以同行那位現在「看得到那幾堂課，其餘全被擋著」。

   ══ 使用者這次的決定 ═════════════════════════════════════════════════
   ① 教練「能設，走專用函式」—— 不放寬整張票券表的寫入權限。
      金額、堂數、效期、共享名單教練一律動不到，只能改「同行是誰」這一格。
   ② 同行那位（B）看得到：兩個人的訓練紀錄、對方姓名、
      **完整票券卡（含金額、付款、發票）**。
      ⚠ 使用者是在看過「A 花了多少錢 B 都看得到」這句提醒之後選的，不是漏看。

   ⚠ 範圍都綁在「同一張票的同行關係」上，不是「所有會員互看」：
     沒有被設成同行人的會員，可見範圍一格都沒有變。
   ⚠ 「同行」不等於「共享」：這幾條只開**讀**與「改同行是誰」。
     同行那位依然不能拿這張票約課、也不會扣到他的堂數（那條線在
     tkUsableBy／扣課流程，本來就沒把 partners 算進去，這次也不動）。 */

-- ═══ ① 設定同行會員（教練也能用，但只能改這一格）═══════════════════════
/* ⚠ SECURITY DEFINER：函式內部自己檢查身分，不靠呼叫者的 RLS。
   ⚠ 回傳新的 partners，前端拿去更新畫面就好，不必再讀一次票。 */
create or replace function public.fn_ticket_set_partner(
  p_ticket_id  text,
  p_who        text,            -- 幫「誰」設同行人（就是畫面上開著的那位會員）
  p_partner_id text,            -- 設成誰；null 或空字串＝移除
  p_operator   text default null -- 寫進帳本的操作者姓名
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  t         public.member_tickets%rowtype;
  _map      jsonb;
  _before   text;
  _pid      text := nullif(btrim(coalesce(p_partner_id,'')), '');
  _fmt_fix  boolean := false;
  _nm_who   text;
  _nm_old   text;
  _nm_new   text;
begin
  /* ⚠ 參數先擋 null：plpgsql 裡 null 的比較一律是 null（＝不成立），
     不擋的話後面每一道檢查都會「靜默通過」（0821 取消規則踩過同一個坑）。 */
  if p_ticket_id is null or btrim(p_ticket_id) = '' then raise exception '缺少票券'; end if;
  if p_who is null or btrim(p_who) = '' then raise exception '缺少會員'; end if;

  select * into t from public.member_tickets where id = p_ticket_id;
  if not found then raise exception '找不到票券'; end if;

  /* 權限：櫃檯／管理員／店長照舊；教練限「帶過這位會員」（can_coach_see_member
     ＝主責教練，或有一堂課的對象是他，含代課）。 */
  if not ( (select is_staff_desk())
           or ((select is_coach()) and can_coach_see_member(p_who)) ) then
    raise exception '沒有權限設定同行會員';
  end if;

  /* 設同行是「幫這張票的可用人（持有人或共享者）設」—— 扣的是他的堂數。 */
  if not ( t.member_id = p_who or jsonb_exists(coalesce(t.shared_with,'[]'::jsonb), p_who) ) then
    raise exception '這位會員不是這張票的使用者';
  end if;
  /* ⚠⚠ 同行人**不**檢查「是不是這張票的可用人」（2026-09-26 同日改過一次）——
     第一版照著 64975 那條註解寫了「必須是持有人或共享者」，但那句話描述的是
     0923 當時設想的候選範圍，實際的搜尋框從頭到尾就是全會員。
     正式庫既有的 4 組裡有一組正是「同行人不在票上」（TK-mseo3fkypm63，
     shared_with 為 null），檢查放著會把那張票鎖死、誰都改不動。
     定義上也該放行：同行只是「這堂課還有這一位一起上」，不扣他的課、
     他也不能拿這張票約課，所以他本來就不需要在票上。
   ⚠ p_who 那一道保留：他是上課那位，扣的是他的堂數。 */
  if _pid is not null then
    if _pid = p_who then raise exception '同行會員不能是本人'; end if;
    if not exists (select 1 from public.members m where m.id = _pid) then
      raise exception '找不到這位同行會員';
    end if;
  end if;

  _map    := coalesce(t.partners, '{}'::jsonb);
  _before := _map ->> p_who;
  if _pid is null then
    _map := _map - p_who;
  else
    _map := jsonb_set(_map, array[p_who], to_jsonb(_pid), true);
  end if;

  /* format 空白就順手補成 1V2（與前端 tkPtSave 同一套理由：自訂銷售 0923 以前
     把 format 寫死 null，那些票其實可能是 1V2）。
     ⚠ 只補空白的，不覆蓋已經寫了 1V1 的；移除同行者時不動 format。 */
  if _pid is not null and coalesce(btrim(t.format), '') = '' then
    _fmt_fix := true;
  end if;

  update public.member_tickets
     set partners = _map,
         format   = case when _fmt_fix then '1V2' else format end
   where id = t.id;

  /* 帳本留痕：誰在什麼時候把誰設成同行者。⚠ delta 0 —— 這不動堂數。 */
  select name into _nm_who from public.members where id = p_who;
  select name into _nm_old from public.members where id = _before;
  select name into _nm_new from public.members where id = _pid;
  insert into public.ticket_logs(id, ticket_id, action, delta, operator, note, created_at)
  values ('LG' || to_char(now(),'YYMMDDHH24MISS') || substr(md5(random()::text),1,6),
          t.id, 'adjust', 0,
          coalesce(nullif(btrim(coalesce(p_operator,'')),''), '教練'),
          '同行會員（' || coalesce(_nm_who, p_who) || '）：'
            || coalesce(_nm_old,'（無）') || ' → ' || coalesce(_nm_new,'（無）')
            || case when _fmt_fix then '｜授課類型補標 1V2' else '' end,
          now());

  return _map;
end;
$$;

revoke all on function public.fn_ticket_set_partner(text,text,text,text) from public;
grant execute on function public.fn_ticket_set_partner(text,text,text,text) to authenticated;
grant execute on function public.fn_ticket_set_partner(text,text,text,text) to service_role;

-- ═══ ② 同行那位看得到這張票（完整票券卡）═══════════════════════════════
/* partners 的形狀是 { 上課那位的 member_id : 他的同行人 member_id }，
   所以「我是同行人」＝我的 id 出現在**值**那一側。
   ⚠ member_tickets 自己沒有「上課那位」這個欄位可以當 key（bookings 有，
     所以 bookings_select_partner 能直接 ->> b.member_id），這裡只能逐格比對值。
   ⚠ partners is not null 放在最前面短路：絕大多數票沒有 partners，
     這條規則對它們就是一次 null 檢查，不會展開 jsonb。 */
drop policy if exists mt_select_partner on public.member_tickets;
create policy mt_select_partner on public.member_tickets
  for select using (
    partners is not null
    and exists (
      select 1 from jsonb_each_text(partners) kv
       where kv.value = (select current_member_id())
    )
  );

-- ═══ ③ 同行那位看得到這幾堂課的訓練紀錄（兩個人的都看得到）═══════════════
/* ⚠ 只限「有同行關係的那幾堂課」，不是 A 的全部紀錄：
     條件綁 booking —— 這一堂用的票上，這一堂的上課者（b.member_id）的同行人是我。
   ⚠ 一堂課的兩份紀錄（slot 1 與 slot 2）都在同一個 booking_id 底下，
     所以這一條同時讓 B 看到自己那份與 A 那份 —— 使用者要的「兩個人的訓練紀錄」。
   ⚠ 這是新增一條 SELECT policy，原本四條（tlog_select_scoped 等）完全不動：
     policy 之間是 OR，既有的可見範圍一格都沒有少。 */
drop policy if exists tlog_select_partner on public.training_logs;
create policy tlog_select_partner on public.training_logs
  for select using (
    booking_id is not null
    and exists (
      select 1
        from public.bookings b
        join public.member_tickets t on t.id = b.ticket_id
       where b.id = training_logs.booking_id
         and b.member_id is not null
         and (t.partners ->> b.member_id) = (select current_member_id())
    )
  );

-- ═══ ④ 互相看得到對方的姓名（只有姓名）═════════════════════════════════
/* 會員之間本來讀不到彼此的任何資料（members_select 只給自己與帶過他的教練）。
   課卡要寫得出「和 ○○○ 一起上」，就需要對方的姓名。
   ⚠ 用函式只回 id＋姓名，**不放寬 members 的 RLS** ——
     開 policy 等於把電話、生日、備註整列都給出去，使用者要的只有姓名。
   ⚠ 兩個方向都回：我是「上課那位」時回我的同行人，我是同行人時回上課那位。 */
create or replace function public.fn_partner_names()
returns table(id text, name text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with me as (select current_member_id() as mid),
  pairs as (
    select kv.key as who, kv.value as partner
      from public.member_tickets t,
           lateral jsonb_each_text(coalesce(t.partners,'{}'::jsonb)) kv
     where t.partners is not null
  ),
  ids as (
    select partner as id from pairs, me where pairs.who     = me.mid   -- 我的同行人
    union
    select who     as id from pairs, me where pairs.partner = me.mid   -- 把我設成同行人的那位
  )
  select m.id, m.name
    from public.members m
    join ids on ids.id = m.id
   where (select mid from me) is not null;
$$;

revoke all on function public.fn_partner_names() from public;
grant execute on function public.fn_partner_names() to authenticated;
grant execute on function public.fn_partner_names() to service_role;
