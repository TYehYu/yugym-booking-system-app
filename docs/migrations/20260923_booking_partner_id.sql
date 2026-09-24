-- ══ 1V2 這一堂的第二位學員（2026-09-23）══════════════════════════════════
--
-- ⚠⚠ 這個欄位目前**沒有任何 UI 在寫**，只有讀取端會優先吃它（課表）。
--   當天的討論走了一圈：先做成「逐堂挑人」，後來使用者把規則定死 ——
--     「1v2同行 我們一開始就該綁定兩個會員的姓名」
--     「本來就不該由第三位會員一起使用該張票券」
--   沒有輪流就沒有挑的必要，所以挑人選單整組收掉，第二位改回**票層級**
--   （member_tickets.partner_id）。
--   欄位留著不刪：讀取端已經接好（booking 優先、票當預設），
--   哪天真的要「某一堂換人」，補一個 UI 就好。
--
-- 原本的設計說明（保留脈絡）：
-- 使用者曾說：「該方案能夠使用的都可以成為同行人　只是上課只能選擇兩個名額寫課表」
--
-- 為什麼從「票層級」再往下做一層（member_tickets.partner_id 同日稍早才加）：
-- 使用者舉的反例 ——「有可能是兒子買給爸媽1v2使用的呢?」
--   持有人（兒子）根本不是學員；而且爸媽之外還可能有阿姨輪流上。
--   一張票只有一個位子撐不住「輪流」，所以第二位要能**逐堂**指定。
--
-- 模型（使用者的話翻成資料）：
--   ・誰**能**當學員 = 這張票的可用人（持有人 ＋ shared_with）
--   ・這一堂**是**哪兩位 = booking.member_id（A） ＋ booking.partner_id（B）
--   ・member_tickets.partner_id 留著當**預設**：固定兩人的案例設一次就好，
--     教練不用每堂選；輪流的那幾堂再自己改。
--
-- ⚠ 不扣第二位的課：1V2 本來就是一張 booking 扣一堂
--   （使用者確認的收費現況：「只有一位付錢、另一位跟著上」）。
--   這個欄位只回答「課表上的 B 是誰」，不進任何扣課／營收邏輯。
-- ⚠ 1V1 的共享票不受影響：「這堂誰上」本來就是 booking.member_id
--   （使用者：「共享票也是1v1有可能是Ａ上課或Ｂ上課」），只有一位、只有一個頁籤。
alter table bookings
  add column if not exists partner_id text;

comment on column bookings.partner_id is
  '1V2 這一堂的第二位學員（members.id）。A 是 member_id。'
  '⚠ 不扣他的課、不影響營收——只決定課表上「會員 B」顯示誰。'
  '未設時用 member_tickets.partner_id 當預設；再沒有就顯示「會員 B」。';

-- 同行者要看得到自己上的那幾堂：逐堂指定之後，票層級那條 policy 涵蓋不到
-- （他可能不在 shared_with 裡，例如只被指定了某一堂）。
create policy bookings_select_partner_booking on bookings
  for select
  using (partner_id is not null and partner_id = (select current_member_id()));
