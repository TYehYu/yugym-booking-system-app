/* 2026-08-03 使用者回報：「剛剛在會員明細這邊按了＋儲值，加了票券，
   但視窗沒有即時更新，以為沒有儲進去」

   會員明細（Person Profile）是蓋在頁面上的覆層。儲值完成走的是
   closeModal + navTo(CUR_PAGE) —— navTo 只重畫「底下那一頁」，覆層不會動，
   新票要等關掉明細重開才看得到，看起來就像沒存進去（櫃檯很可能再儲一次，
   那就是巫雅雯那種重複儲值）。

   修法沿用既有模式（打卡補登、核對記號都這樣做）：完成後先試 ppRefreshIfOpen ——
   明細開著就就地重載資料並重畫，沒開才退回 navTo。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 儲值完成後就地重畫會員明細');
ok('★ submitGrant 完成後先試 ppRefreshIfOpen，明細沒開才 navTo',
   /else if\(!\(await ppRefreshIfOpen\(member_id\)\)\) navTo\(CUR_PAGE\);\n\}/.test(src));
ok('　　原因寫在程式裡（覆層不會被 navTo 重畫）',
   /明細是蓋在頁面上的覆層，navTo 只重畫底下那頁，覆層不會動；/.test(src));
ok('　　舊的「會員詳情」路徑保留（_grantFromDetail 那條）',
   /if\(_grantFromDetail\)\{_grantFromDetail=false;openMemberDetail\(member_id\);\}/.test(src));

console.log('\n② 同一條動線的其他寫入也要一致');
ok('★ 舊系統票券轉入也就地重畫',
   /showToast\('已轉入票券：'\+plan_name\);\n\s*if\(!\(await ppRefreshIfOpen\(member_id\)\)\) navTo\(CUR_PAGE\);/.test(src));
ok('　　票券作廢本來就會就地重畫（不退化）',
   /if\(typeof PP!=='undefined'&&PP\.id===tk\.member_id\)\{ await ppLoadCtx\(\); ppRenderBody\(\); \}/.test(src));
ok('　　補登打卡與核對記號沿用同一支 ppRefreshIfOpen（模式一致）',
   (src.match(/await ppRefreshIfOpen\(/g)||[]).length>=4);

console.log('\n③ ppRefreshIfOpen 本身的行為');
ok('★ 只在「開著的就是這位會員」時接手（別人的明細不亂動）',
   /if\(!PP\.id \|\| PP\.id!==id\) return false;/.test(src));
ok('★ 會重載資料再重畫（dbPut 寫入時已清快取，重載拿到的是新票）',
   /await ppLoadCtx\(\);[\s\S]{0,400}ppRenderBody\(\);\n\s*return true;/.test(src)
   && /dbCacheApply\(store, data\|\|obj\);/.test(src));   // 2026-08-05 改寫入直改快取，重載拿到的一樣是新票

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
