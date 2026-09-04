/* 合約只能「櫃檯以上」建立（2026-09-04 使用者定案）

   使用者原本想讓教練先建合約（「會員來繳費的時候櫃檯只要打開會員資料就可以銜接
   後續作業」），查權限時發現一個落差，隨後定案：
     「合約只能櫃檯以上的帳號才能建立」「教練端不能建立合約」

   ⚠ 落差在哪：contracts 的 RLS 原本是 contracts_staff_all [ALL] is_any_staff()，
     而 is_any_staff() ＝ current_staff_role() is not null，**包含一般教練**。
     前端把入口藏起來了，但**藏按鈕不等於擋得住** —— API 打得到。
     （同一天 _savePunchEdit／_delPunchRec 也是一樣的毛病，見 punchedittest。）
   已改成：讀 is_any_staff()／寫 is_staff_desk()，
   見 docs/migrations/20260904_contracts_write_desk_only.sql。

   這一支守前端那一半：入口不能被放寬回去。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 教練看不到「發放票券／建立合約」的入口');
ok('★★★ 會員資料頁那顆鈕對教練不輸出',
   /\$\{isCoach\?'':`<button class="md-grant-fab" onclick="openGrantModalFor\('\$\{member_id\}'\)"/.test(src));

console.log('\n② 簽約流程本身仍是櫃檯以上');
/* 賣票／簽約的入口都在 g_member 群組，而 visibleGroups 對一般教練不給那一組；
   另外票券列表的「自訂／轉入」也明擋 isDeskLike。 */
ok('★★ 票券列表的自訂／轉入限櫃檯以上',
   /\$\{\(isDeskLike\(\)\)\?`<button class="btn btn-ghost btn-sm" style="margin-left:8px;" onclick="openLegacyImport\(\)"/.test(src));

console.log('\n③ 資料庫那一半的決定要留下紀錄');
{
  const mig=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260904_contracts_write_desk_only.sql','utf8');
  ok('★★★ migration 檔在，而且讀寫是拆開的',
     /create policy contracts_staff_read on contracts\s*\n\s*for select using \( \(select is_any_staff\(\)\) \);/.test(mig)
     && /create policy contracts_desk_write on contracts\s*\n\s*for all/.test(mig));
  ok('★★★ 為什麼 SELECT 不能一起收（教練要開會員資料）',
     /教練開會員資料（ppLoadCtx）要讀合約狀態，不能收/.test(mig));
  ok('★★★ 會員簽名不受影響的理由寫在原地',
     /fn_member_sign_contract 是 SECURITY DEFINER（已驗）/.test(mig));
  ok('★★ 「藏按鈕不等於擋得住」的教訓寫在這支測試',
     /藏按鈕不等於擋得住/.test(fs.readFileSync(__filename,'utf8')));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
