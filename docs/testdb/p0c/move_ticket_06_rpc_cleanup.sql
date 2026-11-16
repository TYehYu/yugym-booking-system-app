-- ═══════════════════════════════════════════════════════════════════════
-- 真實 RPC 測試的清理（尚未執行；⚠ 只能對測試庫 kucvxpjatptfckhlxptj）。刪除 = 寫入，需授權。
-- 只針對測試夾具：所有條件都綁 'MVR-' 前綴或 'MVR測試' 姓名前綴；沒有任何無條件刪除、沒有 TRUNCATE。
-- 執行前把 <RUN_START_ISO> 換成夾具建立前記下的時間（如 2026-11-15T10:00:00+08:00）；沒換會因轉型失敗而中止。
-- notifications 精準限定（不只憑姓名前綴）：一筆通知要被刪，必須「同時」符合——
--   ① recipient_type='desk' 且 id 以 'NT-' 開頭   ② created_at >= RUN_START   ③ title 以 'MVR測試會員-<RUNID>-' 開頭（RUNID 為本次唯一 8 碼）
--   ④ id 在 <NOTIF_IDS> 清單內（先用 07 號唯讀檔列出候選，人工核對後才填入；沒有通知就填空字串 ''）
--   並且「符合 ①②③ 的集合」必須與「④ 清單」完全相同，多一筆或少一筆都中止。
-- 需替換的佔位：<RUN_START_ISO>、<RUNID>、<NOTIF_IDS>（例如 'NT-abc,NT-def'，無則 ''）。
-- 流程：先看「清理前盤點」→ 刪除 → 自我核對全部歸零，否則整個交易回滾（刪除不生效）。
-- 之後還要由 Auth Admin API 刪除 5 個測試帳號（見 02 文件），並用最後的唯讀查詢確認 auth.users 沒有殘留。
-- ═══════════════════════════════════════════════════════════════════════
begin;
-- ── 庫識別守門（fail-closed）：不是測試庫就中止，不靠註解或表名 ──
-- 依據：2026-11-14 唯讀取得測試庫（kucvxpjatptfckhlxptj，專案名 yugym-sprint3-test）叢集 system_identifier = 7662742571317219726，
--       且測試庫沒有 public.change_log 表與 fn_table_sigs（正式庫有）。任何一項不符、或 pg_control_system() 取不到 → 一律中止。
do $guard$
begin
  if (select system_identifier::text from pg_control_system()) is distinct from '7662742571317219726' then
    raise exception 'TESTDB.GUARD: 叢集識別與測試庫不符，停止執行';
  end if;
  if to_regclass('public.change_log') is not null or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fn_table_sigs') then
    raise exception 'TESTDB.GUARD: 看起來像正式庫（有 change_log／fn_table_sigs），停止執行';
  end if;
end
$guard$;

-- 清理前盤點（只讀；結果請保存）
create temp table mvr_before on commit drop as
select 'members' as t, count(*) as n from members where id like 'MVR-M-%'
union all select 'member_tickets', count(*) from member_tickets where id like 'MVR-TK-%' or member_id like 'MVR-M-%'
union all select 'bookings', count(*) from bookings where id like 'MVR-%' or member_id like 'MVR-M-%' or sibling_of like 'MVR-%'
union all select 'ticket_logs', count(*) from ticket_logs where ticket_id like 'MVR-TK-%' or booking_id like 'MVR-%'
union all select 'notifications', count(*) from notifications where recipient_type::text = 'desk' and id like 'NT-%' and created_at >= '<RUN_START_ISO>'::timestamptz and title like 'MVR測試會員-<RUNID>-%'
union all select 'employees', count(*) from employees where id like 'MVR-E-%'
union all select 'ticket_types', count(*) from ticket_types where id like 'MVR-T-%';

-- notifications：條件集合必須與人工核對過的 id 清單完全一致
do $nt$
declare v_ids text[] := string_to_array(nullif('<NOTIF_IDS>', ''), ',');
        v_hit text[];
begin
  select coalesce(array_agg(id order by id), '{}') into v_hit from notifications
   where recipient_type::text = 'desk' and id like 'NT-%' and created_at >= '<RUN_START_ISO>'::timestamptz
     and title like 'MVR測試會員-<RUNID>-%';
  if v_hit is distinct from coalesce((select array_agg(x order by x) from unnest(coalesce(v_ids,'{}')) x), '{}') then
    raise exception 'MVR.NOTIF_SET_MISMATCH: 條件命中的通知與核對清單不一致，中止（不刪任何東西）';
  end if;
  if coalesce(array_length(v_hit,1),0) > 40 then raise exception 'MVR.NOTIF_TOO_MANY'; end if;
end
$nt$;

-- 保險：測試期間新增、但不帶 MVR 前綴的資料必須為 0（不為 0 代表有非夾具資料被動到 → 中止，絕不替它刪除）
do $stray$
declare s timestamptz := '<RUN_START_ISO>'::timestamptz;
begin
  if (select count(*) from bookings where created_at >= s and id not like 'MVR-%' and coalesce(member_id,'') not like 'MVR-M-%') > 0
     or (select count(*) from ticket_logs where created_at >= s and coalesce(ticket_id,'') not like 'MVR-TK-%' and coalesce(booking_id,'') not like 'MVR-%') > 0
     or (select count(*) from member_tickets where created_at >= s and id not like 'MVR-TK-%' and coalesce(member_id,'') not like 'MVR-M-%') > 0
     or (select count(*) from notifications where created_at >= s and title not like 'MVR測試會員-<RUNID>-%') > 0 then
    raise exception 'MVR.STRAY_ROWS: 測試期間出現非夾具的新增資料，請人工檢視後再清理';
  end if;
end
$stray$;

-- 刪除（由子到父）
delete from notifications  where id = any(string_to_array(nullif('<NOTIF_IDS>', ''), ','))
   and recipient_type::text = 'desk' and id like 'NT-%' and created_at >= '<RUN_START_ISO>'::timestamptz and title like 'MVR測試會員-<RUNID>-%';
delete from ticket_logs    where ticket_id like 'MVR-TK-%' or booking_id like 'MVR-%';
delete from bookings       where id like 'MVR-%' or member_id like 'MVR-M-%' or sibling_of like 'MVR-%';
delete from member_tickets where id like 'MVR-TK-%' or member_id like 'MVR-M-%';
delete from members        where id like 'MVR-M-%';
delete from employees      where id like 'MVR-E-%';
delete from ticket_types   where id like 'MVR-T-%';

-- 自我核對：全部歸零，否則整個交易回滾
do $after$
begin
  if (select count(*) from members where id like 'MVR-M-%') <> 0
     or (select count(*) from member_tickets where id like 'MVR-TK-%' or member_id like 'MVR-M-%') <> 0
     or (select count(*) from bookings where id like 'MVR-%' or member_id like 'MVR-M-%' or sibling_of like 'MVR-%') <> 0
     or (select count(*) from ticket_logs where ticket_id like 'MVR-TK-%' or booking_id like 'MVR-%') <> 0
     or (select count(*) from notifications where title like 'MVR測試會員-<RUNID>-%') <> 0
     or (select count(*) from employees where id like 'MVR-E-%') <> 0
     or (select count(*) from ticket_types where id like 'MVR-T-%') <> 0 then
    raise exception 'MVR.CLEANUP_NOT_ZERO: 仍有殘留，已整體回滾';
  end if;
end
$after$;
select * from mvr_before order by t;   -- 回報：刪除前各表的夾具筆數
commit;

-- 最後（另一次唯讀查詢）：確認 Auth 帳號也清乾淨，預期 0 列
-- select id, email from auth.users where email like 'mvr-%@%' limit 20;
