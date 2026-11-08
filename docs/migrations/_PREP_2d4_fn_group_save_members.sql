/* ══ 2d-4 部署準備（2026-11-09）══════════════════════════════════════════
   來源：測試庫 kucvxpjatptfckhlxptj 最終驗證版本（2d-1+2d-2+2d-3 累積，
   migration 鏈：create_fn_group_save_members_add_path_2d1 →
   add_remove_path_fn_group_save_members_2d2 →
   add_attendance_orphan_cleanup_fn_group_save_members_2d3 →
   fix_fn_group_save_members_vleave_and_grants_2d4（2026-11-09第四輪，見下方）。
   本檔案為下方CREATE FUNCTION實際部署的目標版本，**尚未在正式庫
   rlpiomzplckzqnqrvrwc執行**——v_leave修正與REVOKE/GRANT已實際套用並在
   測試庫kucvxpjatptfckhlxptj驗證通過（見本檔案最後「第四輪執行與測試結果」），
   這裡只是把已驗證版本的文字原樣整理成正式庫的部署腳本。

   ── 函式規格 ──────────────────────────────────────────────────────────
   參數：p_booking_id text, p_max_heads integer DEFAULT NULL,
         p_ticket_type_fix text DEFAULT NULL,
         p_adds jsonb DEFAULT '[]', p_removes jsonb DEFAULT '[]'
   回傳：jsonb
   LANGUAGE plpgsql / SECURITY DEFINER / SET search_path TO 'public','pg_temp'
   擁有者（測試庫）：postgres
   權限（測試庫）：anon/authenticated/service_role 皆 EXECUTE=true

   ⚠ 2026-11-09第二輪審查發現並修正：上面這行「同一慣例」的描述是錯的。
   唯讀核對正式庫 rlpiomzplckzqnqrvrwc 實際結果：
     fn_deduct_ticket      → anon=false, authenticated=true, service_role=false
     fn_member_join_group  → anon=false, authenticated=true, service_role=false
   兩支參考函式在正式庫都**只有authenticated**，不是文件原先宣稱的三個角色皆有
   （測試庫當初設三個角色可能是另一輪工作沿用的寬鬆設定，不能直接當正式庫的
   部署依據）。現有已知呼叫端（前端`_saveGroupMembers`，2d-3接線後）一律是
   登入後的`authenticated` session，沒有anon或service_role呼叫這支RPC的
   已知需求。已將下方GRANT改為**只給authenticated**，對齊實際正式庫慣例、
   不過度授權（符合CLAUDE.md「anon預設不給」的一般原則）。若日後真的有
   service_role（例如某個Edge Function）需要呼叫，屆時再個別補GRANT並記錄理由。

   ── 相依物件（已於 2026-11-09 唯讀核對正式庫，全部存在，無缺口）──────────
   - 表／欄位：bookings(member_ids jsonb, seat_tickets jsonb, attendance jsonb,
     max_heads int, ticket_type_id, coach_id, substitute_coach_id, category)
   - 函式：current_employee_id()、is_staff_desk()
   - 表：member_tickets、ticket_types、ticket_logs

   ── 鎖定方式 ──────────────────────────────────────────────────────────
   SELECT * FROM bookings WHERE id=$1 FOR UPDATE —— 與 fn_member_join_group
   搶同一列鎖，天然互斥，不需要另外的跨函式協調。

   ── 部署前必要條件 ────────────────────────────────────────────────────
   1. 純新增，正式庫目前完全沒有同名函式（已確認 pg_proc 查無 fn_group_save_members）。
   2. 必須先於前端 _saveGroupMembers／refundTicketDateRevertOnly 部署
      （前端目前完全沒有呼叫這支函式，RPC 先上線不影響任何現有行為）。

   ── 部署後唯讀驗證 ────────────────────────────────────────────────────
   select proname, pg_get_function_identity_arguments(oid)
     from pg_proc where proname='fn_group_save_members';
   -- 預期：恰好 1 列，5參數 (text, integer, text, jsonb, jsonb)。
   select pg_get_functiondef(oid) ilike '%for update%' as has_lock
     from pg_proc where proname='fn_group_save_members';
   -- 預期：true。
   select has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_ok,
          has_function_privilege('anon', oid, 'EXECUTE') as anon_should_be_false,
          has_function_privilege('service_role', oid, 'EXECUTE') as service_role_should_be_false
     from pg_proc where proname='fn_group_save_members';
   -- 預期：authenticated_ok=true，另外兩個=false（2026-11-09修正後的範圍）。
   -- 不建立任何測試預約，純結構核對。

   ── 停止條件 ──────────────────────────────────────────────────────────
   以上三組驗證任一項不符預期（簽章不是5參數、缺FOR UPDATE、或GRANT範圍
   跟預期不同）→ 立即停止，不得讓前端2d-3接線部署指向這支函式。

   ── 回復方式（精確程序）─────────────────────────────────────────────────
   1. 先確認沒有其他同名函式版本混入（避免DROP到錯的簽章）：
      select pg_get_function_identity_arguments(oid) from pg_proc
        where proname='fn_group_save_members'; -- 應恰好1列、5參數
   2. 確認前端尚未接線呼叫（或已revert前端commit）。
   3. DROP FUNCTION public.fn_group_save_members(text, integer, text, jsonb, jsonb);
   純新增函式，刪除不影響任何其他物件。

   ── ✅ 2026-11-09第三輪發現、第四輪已修正並在測試庫驗證通過：v_leave
      容量計算bug（逐步數值trace，非理論推測；繼承自2d-1/2d-2/2d-3測試庫
      版本，非本輪新增的程式碼）──────────────────────────────────────────

   【結論】確認存在：同一次呼叫「移除1位leave狀態成員＋新增2位以上成員」
   會讓roster超過max_heads。根因是第241行`v_leave`永遠讀`v_b.attendance`
   （函式開頭鎖進來、之後絕不重新賦值的原始快照），而不是「目前還在
   roster上的人裡面誰是leave」。

   【具體數值trace】前提：booking X，max_heads=5（v_b.max_heads=5）。
     v_b.member_ids（呼叫前）＝["M1","M2","M3","M4","A"]（5人）
     v_b.attendance（呼叫前，全程式凍結不變）＝
       {"M1":"checked_in","M2":"checked_in","M3":"checked_in","M4":"checked_in","A":"leave"}
     呼叫：p_removes=["A"]、p_adds=[{member_id:"B",ticket_id:"T6"},{member_id:"C",ticket_id:"T7"}]

   第140行 select v_b for update → v_b凍結如上，之後不再變。
   第158行 v_max := coalesce(null, 5, 5) = 5。

   Remove迴圈（161-227行）處理"A"：
     第169行 v_idx＝5（A在原陣列第5位）→ 第213行移除後
       v_member_ids ＝ ["M1","M2","M3","M4"]（長度4）。
     （注意：v_attendance此時完全沒被這個迴圈碰到，但下面bug的根源其實是
      第241行讀的是`v_b.attendance`不是`v_attendance`，所以就算remove迴圈
      有同步清理v_attendance也救不了這個bug——必須改的是241行的計算依據。）

   Add迴圈（230-290行）第1輪處理B（第241行執行）：
     v_leave := count(v_b.attendance中value='leave') = 1（仍算到"A"，
       即使A已經在上面被移出member_ids了）。
     第242行 v_cnt := jsonb_array_length(["M1","M2","M3","M4"])[=4] - v_leave[=1] = 3。
     第243行 3 >= 5？否 → 不擋，B通過驗票／扣票，第286行
       v_member_ids ＝ ["M1","M2","M3","M4","B"]（長度5）。

   Add迴圈第2輪處理C：
     v_leave 重算一次，仍是1（v_b.attendance沒變過）。
     v_cnt := jsonb_array_length(["M1","M2","M3","M4","B"])[=5] - 1 = 4。
     4 >= 5？否 → **不擋，C也通過，扣了C的票**，
       v_member_ids ＝ ["M1","M2","M3","M4","B","C"]（長度6）。

   第306-312行 UPDATE bookings：最終寫回 member_ids長度6、max_heads仍是5
   ──**6人塞進5人上限的團課，B與C兩張票都已經真的扣款**，而且是整個函式
   唯一一次UPDATE（無額外保護網），問題會直接寫進資料庫。

   【最小修正方案（僅提案，本輪未套用、未測試、未部署，等待授權）】
   只需改第241行這一句（其餘59行程式碼完全不動）：
     修正前：
       v_leave := (select count(*)::int from jsonb_each_text(coalesce(v_b.attendance,'{}'::jsonb)) t where t.value='leave');
     修正後：
       v_leave := (select count(*)::int from jsonb_array_elements_text(v_member_ids) m(mid)
                    where coalesce(v_b.attendance->>m.mid,'') = 'leave');
   原理：把「請假人數」改成只算「目前還在v_member_ids（已反映本次remove）
   裡、且原始狀態是leave」的人，而不是不分青紅皂白數整個原始attendance
   物件。用同一組數值重新trace驗證（修正後）：
     B：v_leave=count(["M1","M2","M3","M4"]中原始status='leave')=0（都是
        checked_in）→ v_cnt=4-0=4，4>=5否→B成功，roster=5。
     C：v_leave=count(["M1","M2","M3","M4","B"]中原始status='leave')=0
        → v_cnt=5-0=5，5>=5是→**C正確回傳FULL**，roster停在5，不超賣。
   並驗證修正不破壞原本「leave讓出名額」的設計意圖：若A沒被移除、只是維持
   leave掛在roster上，新人D要加入時 v_member_ids=["M1","M2","M3","M4","A"]，
   v_leave=count(這5人中原始leave)=1（A本來就在roster且是leave）→
   v_cnt=5-1=4，4>=5否→D可以加入——跟修正前行為一致，沒有改變這個既有
   設計的語意，只修了「被整個移除的leave成員還繼續佔用扣除額度」這一點。

   【已執行測試（2026-11-09第四輪，測試庫kucvxpjatptfckhlxptj，真連線）】
   新增`/Users/tungyeh/Projects/yugym-race-test/grpsave-2d4-fix-test.js`
   （場景A，與上面提案一致：max_heads=5、5人滿、1人leave，同一次呼叫
   remove該leave者＋add 2個新成員）。結果：remove成功、第1個add成功、
   第2個add正確回FULL、最終member_ids長度=5、只有第1張新票被扣款
   （sessions_remaining 5→4）、第2張票完全沒被動（維持5）。**PASS**。
   另外一併測了B（正常替換一人）／C（容量內新增）／D（超額拒絕）／
   E（同一次呼叫內第2筆型別轉換出錯，驗證整次呼叫完全回滾，含第1筆
   原本會成功的扣票也一併復原）／F（重複請求，驗證只真的扣1次）／
   G（真並發搶最後1個名額，驗證FOR UPDATE序列化不超賣）——**全部7項
   PASS**，測試前後bookings/member_tickets/ticket_logs筆數完全一致
   （已精準刪除本次建立的合成資料）。
   另外重跑既有`grpsave-2d1-test.js`／`grpsave-2d2-test.js`回歸：
   兩支測試裡`fn_group_save_members`自己的斷言全部正確；僅各有1項
   斷言失敗（T7、R2），追查後是測試固定寫死的情境日期（2026-11-04）
   相對於今天（2026-11-09）已經過去，導致**另一支沒有被這次改動碰到
   的函式**`fn_member_join_group`回傳`BOOKING.PAST_DATE`——與本次
   v_leave修正無關，不是迴歸，是既有測試腳本的日期資料過期（此事實
   已記錄，未修改那兩支既有測試檔案，超出本輪授權範圍）。

   ⚠ 這個bug**不影響2d-4本身要不要部署**（函式目前無任何呼叫端，CREATE
   後不會被觸發）——只跟「之後2d-3前端接線上線後，這個排列組合會不會
   在真實團課超賣」有關；修正本身已套用並驗證，是否連同本次2d-4一起
   部署到正式庫留給使用者與ChatGPT決定。

   ── ✅ Task3發現、已修正並在測試庫驗證：函式建立者角色決定PUBLIC/anon
      是否「自動」拿到權限（唯讀查pg_default_acl，非假設）──────────────
   Postgres對函式的預設行為是「建立時自動GRANT EXECUTE給PUBLIC」，跟表
   不同（表預設不給PUBLIC）。唯讀查正式庫`pg_default_acl`結果：
     defaclrole=supabase_admin：{postgres=X,anon=X,authenticated=X,service_role=X}
       （by supabase_admin建立的新函式，不經任何GRANT語句就自動對
        postgres/anon/authenticated/service_role四者開放EXECUTE，
        且這個設定本身已經覆蓋掉Postgres原生的「給PUBLIC」預設，
        改成給這四個具名角色）
     defaclrole=postgres：{postgres=X}
       （by postgres角色建立的新函式，只有postgres自己拿到，其餘
        任何角色都要靠explicit GRANT才有，和目前`_PREP_2d4`腳本的
        設計假設一致）
   風險點：**這支CREATE FUNCTION實際部署時是哪個角色執行，決定了
   anon/service_role會不會「不靠腳本裡任何一行GRANT」就自動被授權**。
   已知`fn_member_join_group`／`fn_deduct_ticket`（上一輪查得anon=false,
   service_role=false）證實它們是用postgres角色路徑建立的；但沒有證據
   保證這次2d-4的實際部署管道（Supabase MCP migration工具／SQL
   Editor／CLI）一定走同一條路——若剛好走了supabase_admin那條路，
   即使腳本只寫了`grant...to authenticated`，實際建出來的函式還是會
   被default ACL自動塞進anon與service_role的EXECUTE權限，腳本本身
   看不出任何異狀（SELECT驗證那三行如果沒做，不會發現）。

   【已套用（2026-11-09第四輪）】CREATE FUNCTION之後、GRANT之前加了三行
   防禦性REVOKE（見下方腳本），讓最終狀態不管哪個角色執行都收斂到同一個
   結果（REVOKE一個從未被授予的權限是無害的no-op，不會報錯）：撤public/
   anon/service_role，再GRANT authenticated。
   ⚠ 用詞澄清（避免誤解）：這三行REVOKE撤的是PUBLIC/anon/service_role
   這三個「一般角色」透過ACL取得的權限，**不是、也不可能撤銷函式擁有者
   的固有權限**——PostgreSQL裡物件擁有者（這段CREATE FUNCTION實際是
   哪個角色執行，該角色就是擁有者）與superuser本來就不受ACL/REVOKE
   檢查限制，這是PostgreSQL的權限模型本身如此，REVOKE語句對他們沒有、
   也不該被宣稱有效果。
   【已在測試庫驗證】套用後唯讀查pg_proc confirm：
     authenticated: EXECUTE=true；anon: EXECUTE=false；service_role: EXECUTE=false。
   三者皆符合預期（完整查詢見下方「部署後唯讀驗證」區塊，本輪實際對
   測試庫執行過同一組查詢並得到這個結果）。

   SECURITY DEFINER／search_path核對（程式碼直接核對，非資料庫查詢）：
   第97-98行`SECURITY DEFINER` + `SET search_path TO 'public','pg_temp'`
   已經是正確、安全的寫法（釘死search_path，防止SECURITY DEFINER函式
   被search_path劫持攻擊），與`fn_create_booking`／`fn_deduct_ticket`
   既有慣例一致，本輪未發現異狀。
   ══════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.fn_group_save_members(p_booking_id text, p_max_heads integer DEFAULT NULL::integer, p_ticket_type_fix text DEFAULT NULL::text, p_adds jsonb DEFAULT '[]'::jsonb, p_removes jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
/* 2d-1（新增名額）＋2d-2（移除名額/退票）＋2d-3（attendance 孤兒鍵清理）＋
   2d-4第四輪修正（v_leave改用目前roster即時計算，不再沿用凍結快照）。
   鎖同一列 bookings，與 fn_member_join_group 天然互斥（搶同一列鎖）。
   順序：先處理 p_removes 再處理 p_adds——這樣「換人」不會被容量檢查誤擋。 */
declare
  v_emp  text;
  v_desk boolean;
  v_b    bookings%rowtype;
  v_max  int;
  v_leave int;
  v_cnt  int;
  v_member_ids   jsonb;
  v_seat_tickets jsonb;
  v_attendance   jsonb;
  v_live_keys    jsonb;
  v_add   jsonb;
  v_rm    jsonb;
  v_mid   text;
  v_tkid  text;
  v_multi boolean;
  v_tk    record;
  v_net   int;
  v_seats int;
  v_key   text;
  v_idx   bigint;
  v_rm_key text;
  v_rtk   record;
  v_results jsonb := '[]'::jsonb;
begin
  select current_employee_id() into v_emp;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_STAFF');
  end if;
  select is_staff_desk() into v_desk;

  select * into v_b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_BOOKING');
  end if;

  if not coalesce(v_desk,false)
     and v_b.coach_id is distinct from v_emp
     and v_b.substitute_coach_id is distinct from v_emp then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_YOUR_BOOKING');
  end if;

  if v_b.category::text <> '小班肌力' then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_GROUP');
  end if;

  v_member_ids   := coalesce(v_b.member_ids,'[]'::jsonb);
  v_seat_tickets := coalesce(v_b.seat_tickets,'{}'::jsonb);
  v_attendance   := coalesce(v_b.attendance,'{}'::jsonb);
  v_max := coalesce(p_max_heads, v_b.max_heads, 5);

  -- ── Remove 路徑（2d-2）────────────────────────────────────────────
  for v_rm in select * from jsonb_array_elements(coalesce(p_removes,'[]'::jsonb))
  loop
    v_mid := case when jsonb_typeof(v_rm) = 'string' then v_rm#>>'{}' else v_rm->>'member_id' end;
    if v_mid is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',false,'error_code','BAD_INPUT'));
      continue;
    end if;

    select min(ord) into v_idx
      from jsonb_array_elements_text(v_member_ids) with ordinality as t(val,ord)
     where val = v_mid;
    if v_idx is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',false,'error_code','NOT_IN_ROSTER'));
      continue;
    end if;

    select mt.* into v_rtk
      from member_tickets mt
     where mt.member_id = v_mid
       and exists (
         select 1 from ticket_logs tl
          where tl.booking_id = p_booking_id and tl.ticket_id = mt.id
          group by tl.ticket_id
         having sum(case when tl.action='deduct' and coalesce(tl.delta,0)<>0 then 1
                          when tl.action='refund' then -1 else 0 end) > 0
       )
     order by (
       select max(tl2.created_at) from ticket_logs tl2
        where tl2.ticket_id = mt.id and tl2.booking_id = p_booking_id and tl2.action='deduct'
     ) desc nulls last
     limit 1
     for update;

    if found then
      if coalesce(v_rtk.sessions_total,0) > 0 and coalesce(v_rtk.sessions_remaining,0) >= v_rtk.sessions_total then
        insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
        values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_rtk.id, 'adjust', 0, p_booking_id, v_emp,
                '⚠ 已阻擋：餘額 '||coalesce(v_rtk.sessions_remaining,0)||'/'||v_rtk.sessions_total||' 已滿，未再退課', now());
        v_tkid := null;
      else
        update member_tickets
           set sessions_remaining = sessions_remaining + 1,
               status = case when status = 'used_up' and sessions_remaining + 1 > 0 then 'usable' else status end
         where id = v_rtk.id;
        insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
        values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_rtk.id, 'refund', 1, p_booking_id, v_emp, '取消退課', now());
        v_tkid := v_rtk.id;
      end if;
    else
      v_tkid := null;
    end if;

    select coalesce(jsonb_agg(val order by ord), '[]'::jsonb) into v_member_ids
      from jsonb_array_elements_text(v_member_ids) with ordinality as t(val,ord)
     where ord <> v_idx;

    select k into v_rm_key
      from jsonb_object_keys(v_seat_tickets) as k
     where k = v_mid or k like v_mid || '#%'
     order by case when k = v_mid then 1 else (split_part(k,'#',2))::int end desc
     limit 1;
    if v_rm_key is not null then
      v_seat_tickets := v_seat_tickets - v_rm_key;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object('op','remove','member_id',v_mid,'ok',true,'refunded_ticket_id',v_tkid));
  end loop;

  -- ── Add 路徑（2d-1，原樣不動；v_leave計算改用即時roster，2d-4第四輪修正）──
  for v_add in select * from jsonb_array_elements(coalesce(p_adds,'[]'::jsonb))
  loop
    v_mid   := v_add->>'member_id';
    v_tkid  := v_add->>'ticket_id';
    v_multi := coalesce((v_add->>'multi')::boolean, false);

    if v_mid is null or v_tkid is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','BAD_INPUT'));
      continue;
    end if;

    v_leave := (select count(*)::int from jsonb_array_elements_text(v_member_ids) m(mid)
                 where coalesce(v_b.attendance->>m.mid,'') = 'leave');
    v_cnt   := jsonb_array_length(v_member_ids) - v_leave;
    if v_cnt >= v_max then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','FULL'));
      continue;
    end if;

    select mt.* into v_tk from member_tickets mt
      join ticket_types tt on tt.id = mt.ticket_type_id
     where mt.id = v_tkid and mt.member_id = v_mid and tt.category::text = '小班肌力'
       and (mt.expire_date is null or mt.expire_date >= v_b.date)
     for update;
    if not found then
      v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','TICKET_INVALID'));
      continue;
    end if;

    select coalesce(sum(case when action='deduct' and coalesce(delta,0) <> 0 then 1
                             when action='refund' then -1 else 0 end), 0)
      into v_net from ticket_logs where ticket_id = v_tk.id and booking_id = p_booking_id;

    if not v_multi and v_net > 0 then
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_tk.id, 'adjust', 0, p_booking_id, v_emp,
              '⚠ 已阻擋：這一堂在這張票上已經扣過 '||v_net||' 堂，不重複扣', now());
    else
      if coalesce(v_tk.sessions_remaining,0) <= 0 then
        v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',false,'error_code','NO_REMAINING'));
        continue;
      end if;
      update member_tickets
         set sessions_remaining = sessions_remaining - 1,
             status = case when sessions_remaining-1<=0 then 'used_up' else status end,
             start_date   = coalesce((v_add->>'start_date')::date, start_date),
             expire_date  = coalesce((v_add->>'expire_date')::date, expire_date),
             activated_at = coalesce((v_add->>'activated_at')::timestamptz, activated_at)
       where id = v_tk.id;
      insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note, created_at)
      values ('LG-'||replace(gen_random_uuid()::text,'-',''), v_tk.id, 'deduct', -1, p_booking_id, v_emp,
              coalesce(nullif(v_add->>'note',''), '預約扣課'), now());
    end if;

    select count(*)::int into v_seats from jsonb_array_elements_text(v_member_ids) x where x = v_mid;
    v_key := case when v_seats > 0 then v_mid||'#'||(v_seats+1) else v_mid end;

    v_member_ids   := v_member_ids || to_jsonb(v_mid);
    v_seat_tickets := v_seat_tickets || jsonb_build_object(v_key, v_tk.id);

    v_results := v_results || jsonb_build_array(jsonb_build_object('op','add','member_id',v_mid,'ok',true,'ticket_id',v_tk.id));
  end loop;

  -- ── attendance 孤兒鍵清理（2d-3）───────────────────────────────────
  select coalesce(jsonb_object_agg(
           case when rn > 1 then val || '#' || rn else val end, true
         ), '{}'::jsonb)
    into v_live_keys
    from (
      select val, row_number() over (partition by val order by ord) as rn
      from jsonb_array_elements_text(v_member_ids) with ordinality as t(val, ord)
    ) s;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_attendance
    from jsonb_each(v_attendance) a(k, v)
   where v_live_keys ? k;

  update bookings
     set member_ids     = v_member_ids,
         seat_tickets   = v_seat_tickets,
         attendance     = v_attendance,
         max_heads      = v_max,
         ticket_type_id = coalesce(ticket_type_id, p_ticket_type_fix)
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'results', v_results, 'member_ids', v_member_ids);
exception when others then
  return jsonb_build_object('ok', false, 'error_code', SQLERRM);
end
$function$;

-- 2026-11-09第四輪：CREATE後、GRANT前先防禦性REVOKE，涵蓋PUBLIC/anon/service_role，
-- 讓最終權限狀態不依賴「猜對實際部署時CREATE FUNCTION是哪個角色執行」
-- （正式庫pg_default_acl顯示supabase_admin角色建立的新函式會自動對anon/service_role
--  開放EXECUTE，postgres角色建立的則不會——REVOKE一個從未被授予的權限是無害no-op）。
-- ⚠ 這幾行REVOKE撤的是PUBLIC/anon/service_role這三個「一般角色」的ACL權限，
--   不會、也不能撤銷函式擁有者（實際執行這段CREATE FUNCTION的角色，視部署管道
--   可能是postgres或supabase_admin）本身固有的權限——物件擁有者與superuser在
--   PostgreSQL裡本來就不受ACL檢查限制，REVOKE語句對他們沒有、也不該宣稱有效果。
revoke all on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) from public;
revoke all on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) from anon;
revoke all on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) from service_role;
grant execute on function public.fn_group_save_members(text, integer, text, jsonb, jsonb) to authenticated;
