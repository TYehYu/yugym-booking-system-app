-- ═══════════════════════════════════════════════════════════════════════
-- P0-E SQL 交易測試（尚未執行）。⚠ 只能對測試庫 kucvxpjatptfckhlxptj；需先套用 p0e_02_apply_testdb.sql。
-- 整份只有一個 DO 語句：暫時表、暫時函式與所有夾具都建在裡面，結尾（含提早離開）必定 raise exception → 全部回滾，
--   不留任何資料；結果 JSON 放在錯誤訊息 P0E_TESTS_RESULT: 之後。庫識別守門在最前面。
-- 以資料庫擁有者連線（觸發器為 SECURITY DEFINER，不需模擬 JWT）；這是邏輯／不變量測試，不是角色驗證。
-- 併發測試無法在單一交易內做，見 p0e_06_concurrency_manual.md。
-- 沒有 coach_leave／partner_id 欄位的庫（P0-C 同步前的測試庫）：相關案例記成 SKIP，不算通過。
-- ═══════════════════════════════════════════════════════════════════════
do $pe$
declare
  v_has_cl boolean; v_has_partner boolean;
  v_r record; v_n integer; v_d date := (now() at time zone 'Asia/Taipei')::date; v_msg text;
  v_alerts0 integer; v_alerts1 integer;
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫，停止執行';
  end if;
  if to_regprocedure('public.fn_tk_activate(text,date,text)') is null then
    raise exception 'P0E.PRECONDITION: 尚未套用 P0-E migration';
  end if;

  create temp table pe_res(n serial primary key, name text, ok boolean, detail text) on commit drop;
  create function pg_temp.pe_rec(p_name text, p_ok boolean, p_detail text default '') returns void language sql as
    $f$ insert into pe_res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 300)) $f$;
  create function pg_temp.pe_skip(p_name text, p_why text) returns void language sql as
    $f$ insert into pe_res(name, ok, detail) values ('SKIP ' || p_name, null, p_why) $f$;
  -- 精簡輸出（工具只保留錯誤訊息頭尾各約 5,000 字元；只列 FAIL 與 SKIP、FAIL 優先、≤ 8000 字元、被截斷不會判為通過；與 P0-C 的 mv_summary 相同邏輯）
  create function pg_temp.pe_summary() returns text language plpgsql as $f$
  declare
    v_pass integer; v_fail integer; v_skip integer; v_total integer;
    v_items jsonb := '[]'::jsonb; v_item jsonb; v_len integer; v_budget constant integer := 8000;
    v_full boolean := false; v_om_fail integer := 0; v_om_skip integer := 0;
    v_verdict text; v_out text; v_last jsonb;
    r record;
  begin
    select count(*) filter (where ok is true), count(*) filter (where ok is false), count(*) filter (where ok is null), count(*)
      into v_pass, v_fail, v_skip, v_total from pe_res;
    v_verdict := case when v_total = 0 then 'NO_TESTS' when v_fail > 0 then 'FAIL' when v_skip > 0 then 'INCOMPLETE_SKIPS' else 'PASS' end;
    v_len := 700;                                                       -- 標頭（計數、verdict、omitted、說明）預留
    for r in select n, name, ok, detail from pe_res where ok is not true order by (ok is null), n loop
      v_item := jsonb_build_object('n', r.n, 'r', case when r.ok is null then 'SKIP' else 'FAIL' end,
                                   'name', left(r.name, 160), 'detail', left(coalesce(r.detail, ''), 160));
      if v_full or v_len + length(v_item::text) + 1 > v_budget then
        v_full := true;                                                 -- 一旦放不下就停止，維持 FAIL 優先、不讓後面的 SKIP 插隊
        if r.ok is null then v_om_skip := v_om_skip + 1; else v_om_fail := v_om_fail + 1; end if;
      else
        v_items := v_items || v_item; v_len := v_len + length(v_item::text) + 1;
      end if;
    end loop;
    loop                                                                -- 最後保險：真實長度超過上限就從尾端再拿掉，並計入 omitted
      v_out := jsonb_build_object('verdict', v_verdict, 'pass', v_pass, 'fail', v_fail, 'skip', v_skip, 'total', v_total,
                 'listed', jsonb_array_length(v_items), 'omitted_fail', v_om_fail, 'omitted_skip', v_om_skip,
                 'note', 'pass 不含 skip；只列 FAIL 與 SKIP（FAIL 優先）；omitted_* > 0 代表還有未列出的項目，不得視為全部通過',
                 'items', v_items)::text;
      exit when length(v_out) <= v_budget or jsonb_array_length(v_items) = 0;
      v_last := v_items -> (jsonb_array_length(v_items) - 1);
      if v_last->>'r' = 'SKIP' then v_om_skip := v_om_skip + 1; else v_om_fail := v_om_fail + 1; end if;
      v_items := v_items - (jsonb_array_length(v_items) - 1);
    end loop;
    return v_out;
  end $f$;

  create function pg_temp.pe_today() returns date language sql as $f$ select (now() at time zone 'Asia/Taipei')::date $f$;
  create function pg_temp.pe_ticket(p_id text, p_vd integer, p_start date default null, p_exp date default null,
                                    p_act timestamptz default null, p_mode text default null, p_member text default null,
                                    p_total integer default 8, p_rem integer default 6) returns void language plpgsql as $f$
  begin
    insert into members(id, name) values (coalesce(p_member, 'PE-M-' || p_id), 'PE測試會員') on conflict (id) do nothing;
    insert into member_tickets(id, member_id, ticket_type_id, plan_name, sessions_total, sessions_remaining, status,
                               valid_days, start_date, expire_date, activated_at, activation_mode)
    values (p_id, coalesce(p_member, 'PE-M-' || p_id), 'PE-T-PT', 'PE方案', p_total, p_rem, 'usable',
            p_vd, p_start, p_exp, p_act, p_mode);
  end $f$;
  -- 單人預約＋一筆 deduct 帳（日期＝今天＋偏移）
  create function pg_temp.pe_bk(p_id text, p_ticket text, p_off integer, p_status text default 'booked',
                                p_cat text default '私人教練') returns void language plpgsql as $f$
  begin
    insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance)
    values (p_id, (select member_id from member_tickets where id = p_ticket), p_cat::ticket_category, 'PE-T-PT',
            pg_temp.pe_today() + p_off, '10:00', 60, p_status::booking_status, false, p_ticket, '[]'::jsonb, '{}'::jsonb);
    insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note)
    values ('PE-LG-' || md5(random()::text || clock_timestamp()::text), p_ticket, 'deduct', -1, p_id, 'petest', 'pe fixture');
  end $f$;
  create function pg_temp.pe_checkin(p_id text) returns void language sql as
    $f$ update bookings set status = 'checked_in', checked_in_at = now() where id = p_id $f$;
  create function pg_temp.pe_undo(p_id text) returns void language sql as
    $f$ update bookings set status = 'booked', checked_in_at = null where id = p_id $f$;
  create function pg_temp.pe_net(p_tk text, p_bk text) returns integer language sql as
    $f$ select coalesce(sum(case when action::text = 'deduct' then 1 when action::text = 'refund' then -1 else 0 end), 0)::int
          from ticket_logs where ticket_id = p_tk and booking_id = p_bk $f$;
  create function pg_temp.pe_tk(p_id text) returns member_tickets language sql as $f$ select * from member_tickets where id = p_id $f$;

  v_has_cl := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'coach_leave');
  v_has_partner := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'partner_id');

  -- 測試庫的列舉 notify_recipient 只有 member／coach（缺 desk），desk_alert 內部會吞錯、實際寫不進 notifications。
  --   這裡在「本測試交易內」暫時以攔截版取代 public.desk_alert（只記錄呼叫的 type／title／body 到暫存表），
  --   用來驗證 P0-E 有在該警示的時候呼叫它、內容對；交易結尾一律 raise exception 回滾，函式定義隨之復原（測後會核對指紋）。
  create temp table pe_alerts(n serial primary key, member text, typ text, title text, body text) on commit drop;
  create or replace function public.desk_alert(p_member_id text, p_type text, p_title text, p_body text) returns void language sql as
    $f$ insert into pe_alerts(member, typ, title, body) values (p_member_id, p_type, p_title, p_body) $f$;

  insert into ticket_types(id, name, category) values ('PE-T-PT', 'PE 教練課', '私人教練'), ('PE-T-GRP', 'PE 團課', '小班肌力');

  -- ═══ 規則 3：預約與扣堂不啟用 ═══
  perform pg_temp.pe_ticket('PE-A1', 28);
  perform pg_temp.pe_bk('PE-A1-b1', 'PE-A1', 3);
  perform pg_temp.pe_bk('PE-A1-b2', 'PE-A1', 10);
  perform pg_temp.pe_rec('A1 預約扣堂後三欄仍為空（規則 3）',
    (select start_date is null and expire_date is null and activated_at is null and activation_mode is null from member_tickets where id = 'PE-A1'), '');

  -- ═══ 規則 1、2：首次簽到啟用、起算日＝實際上課日 ═══
  perform pg_temp.pe_checkin('PE-A1-b2');   -- 先簽到「較晚」的一堂
  perform pg_temp.pe_rec('A2 首次簽到啟用：起算＝該堂日期、到期＝+27 天、模式 checkin',
    (select start_date = v_d + 10 and expire_date = v_d + 10 + 27 and activated_at is not null and activation_mode = 'checkin' from member_tickets where id = 'PE-A1'),
    (select start_date::text || '/' || expire_date::text from member_tickets where id = 'PE-A1'));
  perform pg_temp.pe_rec('A2 痕跡帳為 adjust／delta 0 且帶預約 id',
    (select count(*) from ticket_logs where ticket_id = 'PE-A1' and action::text = 'adjust' and delta = 0 and booking_id = 'PE-A1-b2' and note like '首次簽到開通%') = 1, '');
  perform pg_temp.pe_rec('A2 餘額不變（6）', (select sessions_remaining from member_tickets where id = 'PE-A1') = 6, '');
  -- 冪等：第二堂簽到不重算
  perform pg_temp.pe_checkin('PE-A1-b1');
  perform pg_temp.pe_rec('A3 第二次簽到不改日期、不重複寫開通痕跡',
    (select start_date = v_d + 10 from member_tickets where id = 'PE-A1')
    and (select count(*) from ticket_logs where ticket_id = 'PE-A1' and note like '首次簽到開通%') = 1, '');

  -- ═══ 規則 6、7：撤銷 ═══
  -- 撤銷「非最早」的一筆（b2 較晚，b1 較早；此時已簽到的有 b1(d+3) 與 b2(d+10)，但 start 是 d+10）→ 撤銷 b2 後應依最早剩餘簽到 b1 重算
  perform pg_temp.pe_undo('PE-A1-b2');
  perform pg_temp.pe_rec('R1 仍有其他簽到 → 依最早簽到課程日重算（d+3，到期 d+30）',
    (select start_date = v_d + 3 and expire_date = v_d + 3 + 27 and activation_mode = 'checkin' from member_tickets where id = 'PE-A1'),
    (select start_date::text || '/' || expire_date::text from member_tickets where id = 'PE-A1'));
  perform pg_temp.pe_undo('PE-A1-b1');
  perform pg_temp.pe_rec('R2 撤銷最後一筆有效簽到 → 恢復未啟用（三欄＋模式皆空）',
    (select start_date is null and expire_date is null and activated_at is null and activation_mode is null from member_tickets where id = 'PE-A1'), '');
  perform pg_temp.pe_rec('R2 恢復痕跡帳 delta 0', (select count(*) from ticket_logs where ticket_id = 'PE-A1' and note like '撤銷簽到：已無有效簽到%' and delta = 0) = 1, '');
  perform pg_temp.pe_checkin('PE-A1-b1');
  perform pg_temp.pe_rec('R3 撤銷後再簽到可再次啟用', (select start_date = v_d + 3 and activation_mode = 'checkin' from member_tickets where id = 'PE-A1'), '');
  perform pg_temp.pe_rec('R3 全程餘額不變（6）', (select sessions_remaining from member_tickets where id = 'PE-A1') = 6, '');

  -- ═══ 規則 8：舊制／固定日期／無 valid_days 的票不受影響 ═══
  perform pg_temp.pe_ticket('PE-L1', 28, v_d - 5, v_d + 23, now() - interval '5 days', null);           -- 舊制已開通（mode 空）
  perform pg_temp.pe_bk('PE-L1-b', 'PE-L1', 2);
  perform pg_temp.pe_checkin('PE-L1-b');
  perform pg_temp.pe_rec('L1 舊制已開通票簽到：日期與模式不變',
    (select start_date = v_d - 5 and expire_date = v_d + 23 and activation_mode is null from member_tickets where id = 'PE-L1'), '');
  perform pg_temp.pe_undo('PE-L1-b');
  perform pg_temp.pe_rec('L1 舊制票撤銷簽到：不被清除', (select start_date = v_d - 5 and activated_at is not null from member_tickets where id = 'PE-L1'), '');
  perform pg_temp.pe_ticket('PE-L2', 7, v_d - 1, v_d + 6, null, null);                                   -- 固定日期票（有日期、無 activated_at）
  perform pg_temp.pe_bk('PE-L2-b', 'PE-L2', 2);
  perform pg_temp.pe_checkin('PE-L2-b');
  perform pg_temp.pe_rec('L2 固定日期票簽到：日期不變、不啟用', (select start_date = v_d - 1 and expire_date = v_d + 6 and activated_at is null and activation_mode is null from member_tickets where id = 'PE-L2'), '');
  perform pg_temp.pe_ticket('PE-L3', null);                                                              -- 無 valid_days
  perform pg_temp.pe_bk('PE-L3-b', 'PE-L3', 2);
  perform pg_temp.pe_checkin('PE-L3-b');
  perform pg_temp.pe_rec('L3 無 valid_days 的票簽到：不變', (select start_date is null and expire_date is null and activated_at is null from member_tickets where id = 'PE-L3'), '');

  -- ═══ 規則 4：預約窗口（資料庫端）═══
  perform pg_temp.pe_ticket('PE-W1', 7);
  perform pg_temp.pe_bk('PE-W1-b1', 'PE-W1', 3);
  perform pg_temp.pe_bk('PE-W1-b2', 'PE-W1', 9);                                                          -- 跨度 6 = 7-1 → 通過
  perform pg_temp.pe_rec('W1 跨度 = valid_days-1 → 通過', (select count(*) from bookings where id in ('PE-W1-b1','PE-W1-b2')) = 2, '');
  begin
    perform pg_temp.pe_bk('PE-W1-b3', 'PE-W1', 10);                                                      -- 跨度 7 → 拒絕
    perform pg_temp.pe_rec('W2 跨度 ≥ valid_days → 應被擋', false, '沒有拋錯');
  exception when others then
    perform pg_temp.pe_rec('W2 跨度 ≥ valid_days → TKWIN.OUT_OF_WINDOW', sqlerrm like 'TKWIN.OUT_OF_WINDOW:%', sqlerrm);
  end;
  perform pg_temp.pe_rec('W2 被擋後沒有殘留預約或帳', (select count(*) from bookings where id = 'PE-W1-b3') = 0 and pg_temp.pe_net('PE-W1', 'PE-W1-b3') = 0, '');
  begin
    update bookings set date = v_d + 20 where id = 'PE-W1-b2';                                          -- 改期超出窗口
    perform pg_temp.pe_rec('W3 改期超出窗口 → 應被擋', false, '沒有拋錯');
  exception when others then
    perform pg_temp.pe_rec('W3 改期超出窗口 → 被擋', sqlerrm like 'TKWIN.OUT_OF_WINDOW:%', sqlerrm);
  end;
  update bookings set status = 'cancelled' where id = 'PE-W1-b1';                                        -- 取消最早一堂：窗口跟著後移，取消本身不被擋
  perform pg_temp.pe_bk('PE-W1-b4', 'PE-W1', 14);                                                         -- 最早變 b2(d+9)，d+14 在窗口內
  perform pg_temp.pe_rec('W4 取消最早一堂不被擋；窗口以剩餘最早預約為準', (select count(*) from bookings where id = 'PE-W1-b4') = 1, '');
  perform pg_temp.pe_ticket('PE-W2', 7, v_d, v_d + 6, null, null);                                        -- 固定日期票不套窗口
  perform pg_temp.pe_bk('PE-W2-b1', 'PE-W2', 1);
  perform pg_temp.pe_bk('PE-W2-b2', 'PE-W2', 40);
  perform pg_temp.pe_rec('W5 固定日期票不套窗口', (select count(*) from bookings where id in ('PE-W2-b1','PE-W2-b2')) = 2, '');
  perform pg_temp.pe_ticket('PE-W3', 7, v_d - 3, v_d + 3, now(), null);                                   -- 舊制已開通票不套窗口
  perform pg_temp.pe_bk('PE-W3-b1', 'PE-W3', 1);
  perform pg_temp.pe_bk('PE-W3-b2', 'PE-W3', 50);
  perform pg_temp.pe_rec('W6 舊制已開通票不套窗口', (select count(*) from bookings where id in ('PE-W3-b1','PE-W3-b2')) = 2, '');

  -- ═══ 規則 5：超期取消（用「窗口觸發器暫停」建出歷史殘留）═══
  alter table public.ticket_logs disable trigger trg_tk_window_ledger;
  alter table public.bookings disable trigger trg_tk_window_booking_ins;
  alter table public.bookings disable trigger trg_tk_window_booking_upd;
  perform pg_temp.pe_ticket('PE-O1', 7);
  perform pg_temp.pe_bk('PE-O1-b0', 'PE-O1', 2);          -- 首堂
  perform pg_temp.pe_bk('PE-O1-b1', 'PE-O1', 5);          -- 窗口內，保留
  perform pg_temp.pe_bk('PE-O1-b2', 'PE-O1', 12);         -- 超期 → 取消＋退堂
  perform pg_temp.pe_bk('PE-O1-b3', 'PE-O1', 20);         -- 超期 → 取消＋退堂（有影子卡）
  insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, sibling_of, member_ids, attendance)
    values ('PE-O1-b3s', 'PE-M-PE-O1', '私人教練', 'PE-T-PT', v_d + 20, '10:00', 60, 'booked', false, 'PE-O1-b3', '[]'::jsonb, '{}'::jsonb);
  perform pg_temp.pe_bk('PE-O1-b4', 'PE-O1', 25, 'booked', '小班肌力');   -- 團課類別 → 不自動取消，只警示
  select count(*) into v_alerts0 from notifications where title like '%預約%' and created_at >= now() - interval '1 minute';
  update member_tickets set sessions_remaining = 3 where id = 'PE-O1';  -- 4 筆預約扣了 4 堂（總 8 剩 3 比較貼近 5 筆扣課；此值僅作退堂前後比較）
  perform pg_temp.pe_checkin('PE-O1-b0');
  perform pg_temp.pe_rec('O1 簽到啟用：起算＝首堂、到期＝+6', (select start_date = v_d + 2 and expire_date = v_d + 8 and activation_mode = 'checkin' from member_tickets where id = 'PE-O1'), '');
  perform pg_temp.pe_rec('O1 超期預約已取消，取消人 system，有原因',
    (select status::text = 'cancelled' and cancelled_by = 'system' and cancel_reason like '效期屆滿自動取消%' from bookings where id = 'PE-O1-b2'), '');
  perform pg_temp.pe_rec('O1 超期預約退堂恰好 1 次（淨額 0）', pg_temp.pe_net('PE-O1', 'PE-O1-b2') = 0 and pg_temp.pe_net('PE-O1', 'PE-O1-b3') = 0, '');
  perform pg_temp.pe_rec('O1 餘額 +2（兩筆超期各退 1 堂）', (select sessions_remaining from member_tickets where id = 'PE-O1') = 5, (select sessions_remaining::text from member_tickets where id = 'PE-O1'));
  perform pg_temp.pe_rec('O1 影子卡跟著母卡取消', (select status::text = 'cancelled' from bookings where id = 'PE-O1-b3s'), '');
  perform pg_temp.pe_rec('O1 窗口內的預約不動', (select status::text = 'booked' from bookings where id = 'PE-O1-b1'), '');
  perform pg_temp.pe_rec('O1 團課類別的超期預約不自動取消、淨額仍為 1', (select status::text = 'booked' from bookings where id = 'PE-O1-b4') and pg_temp.pe_net('PE-O1', 'PE-O1-b4') = 1, '');
  perform pg_temp.pe_rec('O1 已發出櫃檯警示：自動取消 2 筆（tk_expiry_cancel）＋人工處理至少 1 筆（團課類別，tk_expiry_manual）',
    (select count(*) from pe_alerts where typ = 'tk_expiry_cancel') = 2 and (select count(*) from pe_alerts where typ = 'tk_expiry_manual') >= 1,
    (select string_agg(typ || '×' || c, ',') from (select typ, count(*) c from pe_alerts group by typ) x));
  -- 冪等：重跑不會再退
  select public.fn_tk_cancel_overdue('PE-O1', v_d + 8, null) into v_n;
  perform pg_temp.pe_rec('O2 重跑超期取消：0 筆、餘額不再增加', v_n = 0 and (select sessions_remaining from member_tickets where id = 'PE-O1') = 5, v_n::text);

  -- 1V2（partner_id）不自動取消
  if v_has_partner then
    perform pg_temp.pe_ticket('PE-O3', 7);
    perform pg_temp.pe_bk('PE-O3-b0', 'PE-O3', 2);
    perform pg_temp.pe_bk('PE-O3-b1', 'PE-O3', 15);
    execute 'update bookings set partner_id = ''PE-PARTNER'' where id = ''PE-O3-b1''';
    perform pg_temp.pe_checkin('PE-O3-b0');
    perform pg_temp.pe_rec('O3 1V2（有 partner_id）超期預約不自動取消、不退堂', (select status::text = 'booked' from bookings where id = 'PE-O3-b1') and pg_temp.pe_net('PE-O3', 'PE-O3-b1') = 1, '');
  else perform pg_temp.pe_skip('O3 1V2', '此庫沒有 bookings.partner_id'); end if;

  -- 原子性：自動取消中途出錯 → 該筆退堂與取消一起回滾，簽到與啟用仍成功
  perform pg_temp.pe_ticket('PE-O4', 7);
  perform pg_temp.pe_bk('PE-O4-b0', 'PE-O4', 2);
  perform pg_temp.pe_bk('PE-O4-b1', 'PE-O4', 15);
  create function pg_temp.pe_boom() returns trigger language plpgsql as $f$ begin raise exception 'boom_pe'; end $f$;
  create trigger pe_boom_trg before update on bookings for each row when (new.id = 'PE-O4-b1' and new.status::text = 'cancelled') execute function pg_temp.pe_boom();
  update member_tickets set sessions_remaining = 4 where id = 'PE-O4';
  perform pg_temp.pe_checkin('PE-O4-b0');
  drop trigger pe_boom_trg on bookings;
  perform pg_temp.pe_rec('O4 簽到與啟用成功', (select activation_mode = 'checkin' from member_tickets where id = 'PE-O4'), '');
  perform pg_temp.pe_rec('O4 自動取消失敗 → 預約仍 booked、沒有退堂（子交易整筆回滾）',
    (select status::text = 'booked' from bookings where id = 'PE-O4-b1') and pg_temp.pe_net('PE-O4', 'PE-O4-b1') = 1
    and (select sessions_remaining from member_tickets where id = 'PE-O4') = 4, '');
  perform pg_temp.pe_rec('O4 失敗已發出櫃檯警示（含失敗原因，不吞掉）', (select count(*) from pe_alerts where typ = 'tk_expiry_manual' and title like '%自動取消失敗%' and body like '%boom_pe%') >= 1, (select string_agg(left(title, 20) || '/' || left(body, 30), ' ; ') from pe_alerts where title like '%自動取消失敗%'));

  -- 補簽很久以前的課：到期日已過 → 啟用但不取消任何預約，只警示（第二筆在到期日之後，若守則失效就會被誤取消）
  perform pg_temp.pe_ticket('PE-P1', 28);
  perform pg_temp.pe_bk('PE-P1-old', 'PE-P1', -60);
  perform pg_temp.pe_bk('PE-P1-fut', 'PE-P1', -20);
  perform pg_temp.pe_checkin('PE-P1-old');
  perform pg_temp.pe_rec('P1 補簽過去的課：啟用（到期日已過）', (select activation_mode = 'checkin' and expire_date < v_d from member_tickets where id = 'PE-P1'), '');
  perform pg_temp.pe_rec('P1 到期日已過 → 不自動取消其他預約', (select status::text = 'booked' from bookings where id = 'PE-P1-fut') and pg_temp.pe_net('PE-P1', 'PE-P1-fut') = 1, '');

  alter table public.ticket_logs enable trigger trg_tk_window_ledger;
  alter table public.bookings enable trigger trg_tk_window_booking_ins;
  alter table public.bookings enable trigger trg_tk_window_booking_upd;

  -- 非實際上課的狀態不啟用
  perform pg_temp.pe_ticket('PE-N1', 28);
  perform pg_temp.pe_bk('PE-N1-b', 'PE-N1', 2);
  update bookings set status = 'no_show' where id = 'PE-N1-b';
  perform pg_temp.pe_rec('N1 no_show 不啟用', (select activated_at is null from member_tickets where id = 'PE-N1'), '');
  update bookings set status = 'checked_in' where id = 'PE-N1-b';   -- 沒有 checked_in_at
  perform pg_temp.pe_rec('N2 只改 status、沒有簽到時間 → 不啟用', (select activated_at is null from member_tickets where id = 'PE-N1'), '');
  if v_has_cl then
    perform pg_temp.pe_ticket('PE-N3', 28);
    perform pg_temp.pe_bk('PE-N3-b', 'PE-N3', 2);
    execute 'update bookings set coach_leave = true where id = ''PE-N3-b''';
    perform pg_temp.pe_checkin('PE-N3-b');
    perform pg_temp.pe_rec('N3 教練請假補償堂簽到不啟用', (select activated_at is null from member_tickets where id = 'PE-N3'), '');
  else perform pg_temp.pe_skip('N3 教練請假', '此庫沒有 bookings.coach_leave'); end if;

  -- ═══ 團課：座位簽到啟用／撤銷；歧義不猜 ═══
  insert into ticket_types(id, name, category) values ('PE-T-GRP2', 'PE 團課二', '小班肌力') on conflict (id) do nothing;
  perform pg_temp.pe_ticket('PE-G1', 28, null, null, null, null, 'PE-M-G1');
  insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, member_ids, attendance)
    values ('PE-G1-b', null, '小班肌力', 'PE-T-GRP', v_d + 4, '19:00', 60, 'booked', false, '["PE-M-G1"]'::jsonb, '{"PE-M-G1":"booked"}'::jsonb);
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values ('PE-LG-G1', 'PE-G1', 'deduct', -1, 'PE-G1-b', 'petest', 'pe fixture');
  update bookings set attendance = '{"PE-M-G1":"checked_in"}'::jsonb where id = 'PE-G1-b';
  perform pg_temp.pe_rec('G1 團課座位簽到 → 該會員唯一持有的票啟用', (select start_date = v_d + 4 and activation_mode = 'checkin' from member_tickets where id = 'PE-G1'), '');
  update bookings set attendance = '{"PE-M-G1":"booked"}'::jsonb where id = 'PE-G1-b';
  perform pg_temp.pe_rec('G2 團課撤銷座位簽到 → 恢復未啟用', (select activated_at is null and activation_mode is null from member_tickets where id = 'PE-G1'), '');
  perform pg_temp.pe_ticket('PE-G2a', 28, null, null, null, null, 'PE-M-G2');
  perform pg_temp.pe_ticket('PE-G2b', 28, null, null, null, null, 'PE-M-G2');
  insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, member_ids, attendance)
    values ('PE-G2-b', null, '小班肌力', 'PE-T-GRP', v_d + 4, '19:00', 60, 'booked', false, '["PE-M-G2"]'::jsonb, '{"PE-M-G2":"booked"}'::jsonb);
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values ('PE-LG-G2a', 'PE-G2a', 'deduct', -1, 'PE-G2-b', 'petest', 'x'), ('PE-LG-G2b', 'PE-G2b', 'deduct', -1, 'PE-G2-b', 'petest', 'x');
  update bookings set attendance = '{"PE-M-G2":"checked_in"}'::jsonb where id = 'PE-G2-b';
  perform pg_temp.pe_rec('G3 同一堂對應到多張票 → 不猜、不啟用，只警示', (select count(*) from member_tickets where id in ('PE-G2a','PE-G2b') and activated_at is not null) = 0, '');
  -- 同堂另一位會員簽到：只啟用他自己唯一持有的票，不影響別人
  perform pg_temp.pe_ticket('PE-G3', 28, null, null, null, null, 'PE-M-G3');
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values ('PE-LG-G3', 'PE-G3', 'deduct', -1, 'PE-G2-b', 'petest', 'x');
  update bookings set member_ids = '["PE-M-G2","PE-M-G3"]'::jsonb, attendance = '{"PE-M-G2":"booked","PE-M-G3":"checked_in"}'::jsonb where id = 'PE-G2-b';
  perform pg_temp.pe_rec('G4 另一位會員簽到 → 只啟用他自己的票', (select activation_mode = 'checkin' from member_tickets where id = 'PE-G3')
    and (select count(*) from member_tickets where id in ('PE-G2a','PE-G2b') and activated_at is not null) = 0, '');

  -- ═══ Phase 3 補強案例（對應 T02／T09／T12／T13／T16／T20）═══
  -- T02 預約後取消 → 仍未啟用
  perform pg_temp.pe_ticket('PE-T2', 28);
  perform pg_temp.pe_bk('PE-T2-b', 'PE-T2', 3);
  update bookings set status = 'cancelled' where id = 'PE-T2-b';
  perform pg_temp.pe_rec('T02 預約後取消 → 三欄與模式仍為空', (select start_date is null and expire_date is null and activated_at is null and activation_mode is null from member_tickets where id = 'PE-T2'), '');

  -- T09 退款失敗 → 該筆整筆回滾（用 ticket_logs 的 refund 寫入失敗模擬），簽到與啟用仍成功
  alter table public.ticket_logs disable trigger trg_tk_window_ledger;
  alter table public.bookings disable trigger trg_tk_window_booking_ins;
  alter table public.bookings disable trigger trg_tk_window_booking_upd;
  perform pg_temp.pe_ticket('PE-T9', 7);
  perform pg_temp.pe_bk('PE-T9-b0', 'PE-T9', 2);
  perform pg_temp.pe_bk('PE-T9-b1', 'PE-T9', 15);
  update member_tickets set sessions_remaining = 4 where id = 'PE-T9';
  create function pg_temp.pe_boom2() returns trigger language plpgsql as $f$ begin raise exception 'boom_refund'; end $f$;
  create trigger pe_boom2_trg before insert on ticket_logs for each row when (new.action::text = 'refund' and new.booking_id = 'PE-T9-b1') execute function pg_temp.pe_boom2();
  perform pg_temp.pe_checkin('PE-T9-b0');
  drop trigger pe_boom2_trg on ticket_logs;
  perform pg_temp.pe_rec('T09 退款失敗：簽到與啟用成功', (select activation_mode = 'checkin' from member_tickets where id = 'PE-T9'), '');
  perform pg_temp.pe_rec('T09 退款失敗 → 預約仍 booked、餘額不變、淨額仍 1、沒有 refund 帳（整筆回滾）',
    (select status::text = 'booked' and cancelled_by is null from bookings where id = 'PE-T9-b1')
    and (select sessions_remaining from member_tickets where id = 'PE-T9') = 4
    and pg_temp.pe_net('PE-T9', 'PE-T9-b1') = 1
    and (select count(*) from ticket_logs where ticket_id = 'PE-T9' and booking_id = 'PE-T9-b1' and action::text = 'refund') = 0, '');
  alter table public.ticket_logs enable trigger trg_tk_window_ledger;
  alter table public.bookings enable trigger trg_tk_window_booking_ins;
  alter table public.bookings enable trigger trg_tk_window_booking_upd;

  -- T12 補簽：起算日＝實際課程日（不是簽到當下的日期）
  perform pg_temp.pe_ticket('PE-T12', 28);
  perform pg_temp.pe_bk('PE-T12-b', 'PE-T12', -10);
  perform pg_temp.pe_checkin('PE-T12-b');
  perform pg_temp.pe_rec('T12 補簽：起算＝課程日（d-10）、到期＝d+17，不是今天起算',
    (select start_date = v_d - 10 and expire_date = v_d + 17 and activated_at::date >= v_d - 1 from member_tickets where id = 'PE-T12'),
    (select start_date::text || '/' || expire_date::text from member_tickets where id = 'PE-T12'));

  -- T13 共享票：共享者簽到啟用一次，持有人再簽另一堂不改日期
  perform pg_temp.pe_ticket('PE-T13', 28, null, null, null, null, 'PE-M-T13OWN');
  insert into members(id, name) values ('PE-M-T13SH', 'PE共享者') on conflict (id) do nothing;
  update member_tickets set shared_with = '["PE-M-T13SH"]'::jsonb where id = 'PE-T13';
  insert into bookings(id, member_id, category, ticket_type_id, date, start_time, duration, status, pending_contract, ticket_id, member_ids, attendance)
    values ('PE-T13-b1', 'PE-M-T13SH', '私人教練', 'PE-T-PT', v_d + 4, '10:00', 60, 'booked', false, 'PE-T13', '[]'::jsonb, '{}'::jsonb);
  insert into ticket_logs(id, ticket_id, action, delta, booking_id, operator, note) values ('PE-LG-T13a', 'PE-T13', 'deduct', -1, 'PE-T13-b1', 'petest', 'x');
  perform pg_temp.pe_bk('PE-T13-b2', 'PE-T13', 6);
  perform pg_temp.pe_checkin('PE-T13-b1');
  perform pg_temp.pe_checkin('PE-T13-b2');
  perform pg_temp.pe_rec('T13 共享票：共享者簽到啟用、持有人再簽不改、開通痕跡只 1 筆',
    (select start_date = v_d + 4 and activation_mode = 'checkin' from member_tickets where id = 'PE-T13')
    and (select count(*) from ticket_logs where ticket_id = 'PE-T13' and note like '首次簽到開通%') = 1, '');

  -- T16 分期與自主訓練不受影響
  perform pg_temp.pe_ticket('PE-T16', 28);
  update member_tickets set installment = '{"plan":"x"}'::jsonb, unlocked_sessions = 4 where id = 'PE-T16';
  perform pg_temp.pe_bk('PE-T16-b', 'PE-T16', 3);
  perform pg_temp.pe_checkin('PE-T16-b');
  perform pg_temp.pe_rec('T16 分期票：照常啟用，unlocked_sessions 與餘額不變',
    (select activation_mode = 'checkin' and unlocked_sessions = 4 and sessions_remaining = 6 from member_tickets where id = 'PE-T16'), '');
  perform pg_temp.pe_ticket('PE-T16s', null);
  perform pg_temp.pe_bk('PE-T16s-b', 'PE-T16s', 3, 'booked', '自主訓練');
  perform pg_temp.pe_checkin('PE-T16s-b');
  perform pg_temp.pe_rec('T16 自主訓練（無 valid_days）簽到：票券欄位完全不變',
    (select start_date is null and expire_date is null and activated_at is null and activation_mode is null and sessions_remaining = 6 from member_tickets where id = 'PE-T16s'), '');

  -- T20 連續多筆預約不得突破窗口（序列版；併發版見 p0e_06 C1）
  perform pg_temp.pe_ticket('PE-T20', 7);
  v_n := 0;
  for v_r in select o from generate_series(1, 12, 2) o loop      -- d+1, d+3, d+5, d+7, d+9, d+11
    begin
      perform pg_temp.pe_bk('PE-T20-' || v_r.o, 'PE-T20', v_r.o);
      v_n := v_n + 1;
    exception when others then null;
    end;
  end loop;
  perform pg_temp.pe_rec('T20 連續預約只接受窗口內的 4 筆（d+1、d+3、d+5、d+7；跨度 6）',
    v_n = 4 and (select max(date) - min(date) from bookings where ticket_id = 'PE-T20') <= 6, v_n::text);

  -- ═══ 權限（catalog 層級）═══
  perform pg_temp.pe_rec('X1 fn_tk_* 不開放 anon／authenticated／service_role',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and ((p.proname like 'fn_tk_%' and p.proname <> 'fn_tk_shared_has') or p.proname like 'trg_tk_%' or p.proname = 'fn_bk_attended')
                   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        or has_function_privilege('service_role', p.oid, 'EXECUTE'))), '');
  perform pg_temp.pe_skip('X4 desk_alert 實際寫入 notifications', '測試庫列舉 notify_recipient 只有 member／coach（缺 desk），desk_alert 會吞錯；警示內容已改以攔截呼叫驗證（O1、O4）。需在補齊 desk 的環境才能驗證實寫');
  perform pg_temp.pe_rec('X2 四個觸發器存在且啟用',
    (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
        and tgname in ('trg_tk_window_ledger','trg_tk_window_booking_ins','trg_tk_window_booking_upd','trg_tk_checkin_activate')) = 4, '');
  -- 跳過旗標只影響預約端檢查
  perform pg_temp.pe_ticket('PE-S1', 7);
  perform pg_temp.pe_bk('PE-S1-b1', 'PE-S1', 2);
  perform pg_temp.pe_bk('PE-S1-b2', 'PE-S1', 6);
  perform set_config('app.tkwin_skip_booking', 'on', true);
  update bookings set date = v_d + 30 where id = 'PE-S1-b2';
  perform set_config('app.tkwin_skip_booking', '', true);
  perform pg_temp.pe_rec('X3 skip 旗標只略過預約端檢查（旗標開著時改期不被預約觸發器擋）', (select date = v_d + 30 from bookings where id = 'PE-S1-b2'), '');
  begin
    perform pg_temp.pe_bk('PE-S1-b3', 'PE-S1', 4);   -- 旗標關閉後，帳端仍會檢查 → 現在跨度 28 > 6
    perform pg_temp.pe_rec('X3 旗標關閉後仍被擋', false, '沒有拋錯');
  exception when others then
    perform pg_temp.pe_rec('X3 旗標關閉後仍被擋', sqlerrm like 'TKWIN.OUT_OF_WINDOW:%', sqlerrm);
  end;

  raise exception 'P0E_TESTS_RESULT: %', pg_temp.pe_summary();
end
$pe$;
