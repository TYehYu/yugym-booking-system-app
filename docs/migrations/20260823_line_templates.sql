-- 2026-08-23　LINE 自動通知的文字範本（管理員可自行調整內容）
--
-- 使用者指示：「可以把 line 發通知設定這個設計在桌機管理員導覽列裡面嗎？我可以自行調整內容」
--
-- 【在這之前】四種自動通知的文字全部寫死在 Edge Function 裡：
--   line-push-daily  → 上課提醒（發給會員）、收款提醒（發給教練）
--   line-daily-report→ 今日戰報（店長／管理員）、今日課堂（當天有上課的教練）
-- 想改一個字都要重新部署 Edge Function。
--
-- 【作法】沿用「合約範本」那一套（contract_templates／CT-DEFAULT）：
--   一張表、固定 id、body 用 {{變數}} 佔位，送出前替換。
--   ・enabled=false → 那一種通知整組不發（不是發一封空的）
--   ・讀不到範本（表被刪、查詢失敗）→ Edge Function 退回內建文字，通知不會因此中斷
--   ・抬頭【有肌訓練 自動訊息】與第二行的通知種類由 kind_label 決定，body 只放內容
--
-- 【變數】各通知種類可用的變數見前端「通知範本」頁的標籤列（點一下插入）。
--   替換規則與合約範本的 fillContract 相同：純字串取代，找不到的變數留原樣。

create table if not exists public.line_templates (
  id          text primary key,
  name        text not null,            -- 這一種通知的說明（畫面上的卡片標題）
  kind_label  text not null default '', -- 訊息第二行「這是什麼通知」
  body        text not null default '',
  enabled     boolean not null default true,
  updated_at  timestamptz,
  updated_by  text
);
alter table public.line_templates enable row level security;

-- 只有管理員能改；其他員工可讀（教練端日後若要預覽自己會收到什麼）
drop policy if exists line_templates_admin on public.line_templates;
create policy line_templates_admin on public.line_templates
  for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists line_templates_read on public.line_templates;
create policy line_templates_read on public.line_templates
  for select using ((select is_any_staff()));

comment on table public.line_templates is
  'LINE 自動通知的文字範本（2026-08-23）。id＝通知種類；body 用 {{變數}} 佔位，Edge Function 送出前替換。停用＝那一種通知不發。';

-- 種子＝現行的文字，所以套用當下行為完全不變，等到有人真的去改才會變
-- 變數名稱用中文（2026-08-23 使用者：「這些標籤變數 可以用中文顯示嗎」）——
-- 與合約範本的 CONTRACT_VARS 同一套慣例。Edge Function 兩種鍵都吃，
-- 萬一有人已經用英文變數存過範本，照樣替換得到。
insert into public.line_templates (id,name,kind_label,body,enabled) values
('LT-CLASS','上課提醒（發給會員）','上課提醒',
E'📅 {{日期}} {{時間}}\n{{課程}}{{場地}}{{續約提醒}}\n\n如需請假或調整，請盡早告知教練 🙏\n期待見到您！', true),
('LT-PAY','收款提醒（發給教練）','收款提醒',
E'明天這堂該跟會員收款囉 💰\n📅 {{日期}} {{時間}}\n👤 {{會員}}{{第幾堂}}\n💳 {{收款事由}}\n\n請在課後協助完成收款或轉告櫃檯。', true),
('LT-REPORT','今日戰報（發給店長／管理員）','今日戰報',
E'{{營收明細}}\n\n🏋️ 教練課 {{教練課堂數}} 堂\n👥 團課 {{團課堂數}} 堂（{{團課人次}} 人次）', true),
('LT-COACHDAY','今日課堂（發給當天有上課的教練）','今日課堂',
E'今天辛苦了！你今天完成：\n{{我的堂數}}', true),
-- 共同抬頭（2026-08-23 二修，使用者：「有肌訓練 自動訊息 改成貼心提醒」）——
-- 這一行字半個月內改了三次（0813 YUGYM→有肌訓練、0821 加「自動訊息」、0823 改「貼心提醒」），
-- 每次都要重新部署兩支 Edge Function，所以也搬進範本表。
-- ⚠ 它不是一種通知，是每則訊息的第一行；前端的「通知範本」頁把它獨立成一張卡。
('LT-HEAD','共同抬頭（每則訊息的第一行）','', '【有肌訓練 貼心提醒】', true)
on conflict (id) do nothing;

-- 增量同步：新表一律要掛 change_log 觸發器（見 CLAUDE.md）
drop trigger if exists trg_change_log on public.line_templates;
create trigger trg_change_log after insert or delete or update
  on public.line_templates for each row execute function fn_log_change();

-- 新表要一併列進 fn_table_sigs，否則前端快取的簽章校驗看不到它的變動（見 CLAUDE.md）
do $do$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_table_sigs';
  if position('''ticket_grant_requests''' in d) = 0 then
    raise exception 'fn_table_sigs 的表清單已不是預期的樣子，請人工確認';
  end if;
  if position('''line_templates''' in d) > 0 then return; end if;
  d := replace(d, '''ticket_grant_requests''', '''ticket_grant_requests'',''line_templates''');
  execute d;
end $do$;

-- ⚠ 光有 RLS policy 不夠，還要 grant（0812 service_role 權限破洞的教訓）
grant select on public.line_templates to anon, authenticated;
grant insert, update, delete on public.line_templates to authenticated;
grant all on public.line_templates to service_role;

-- ── 套用後的驗證（2026-08-23 實跑都是 true）──
-- select has_table_privilege('service_role','public.line_templates','SELECT'),
--        has_table_privilege('authenticated','public.line_templates','UPDATE'),
--        position('line_templates' in pg_get_functiondef('public.fn_table_sigs'::regproc))>0;
