-- 2026-09-04 使用者定案：「合約只能櫃檯以上的帳號才能建立」「教練端不能建立合約」
--
-- 起因：使用者原本想讓教練先建合約（會員來繳費時櫃檯銜接），查權限時發現
--   contracts 的政策是 contracts_staff_all [ALL] is_any_staff()，
--   而 is_any_staff() ＝ current_staff_role() is not null，**包含一般教練**。
--   前端把入口藏起來了（會員資料頁那顆鈕是 isCoach?'':...），但藏按鈕不等於擋得住。
--   使用者隨後定案「教練端不能建立合約」，於是把規則補到資料庫這一層。
--
-- 拆成兩條（原本一條 ALL 同時管讀寫）：
--   讀 → is_any_staff()   教練開會員資料（ppLoadCtx）要讀合約狀態，不能收
--   寫 → is_staff_desk()  ＝ admin / front_desk / 店長教練（＝「櫃檯以上」）
--
-- ⚠ 會員簽名不受影響：fn_member_sign_contract 是 SECURITY DEFINER（已驗），
--   不靠這裡的政策；會員讀自己的合約走 contracts_member_read（保留不動）。
-- ⚠ 同一天查到 attendance 也有類似落差（att_staff 是 is_staff_desk()，
--   使用者說「員工打卡只有管理員可以操作」），那一張還沒改，見 HANDOFF。

drop policy if exists contracts_staff_all on contracts;

create policy contracts_staff_read on contracts
  for select using ( (select is_any_staff()) );

create policy contracts_desk_write on contracts
  for all
  using      ( (select is_staff_desk()) )
  with check ( (select is_staff_desk()) );
