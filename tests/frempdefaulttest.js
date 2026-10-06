/* 場租的「經手員工」被換成操作者（2026-10-06 使用者：「為什麼選了ANN 結果變RANDY」）。

   正式庫 BK-muwcl2bcfd2q（10/09 13:00「子安阿嬤」）：櫃檯在步驟 1 選了 Ann（曹子安），
   存進去的 coach_id 是 Randy（余東曄，當時登入的人）。
   成因：bkStep2Facility 重畫「經手員工」下拉時，一律把 SESSION.id 標成 selected，
   步驟 1 的選擇沒有被帶過來。

   ⚠ 這一欄不是備註：場租的 coach_id ＝ 誰的時段被佔用，選錯等於排到別人的班表上。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i));};
const FN=g('async function bkStep2Facility(pDate,pTime){','\nasync function frVenueTicketOpts');

console.log('① 預設帶出步驟 1 選的教練');
ok('★★★ 下拉的 selected 看 _defEmp，不再寫死 SESSION.id',
   /\$\{c\.id===_defEmp\?'selected':''\}/.test(FN)
   && !/\$\{c\.id===SESSION\.id\?'selected':''\}/.test(FN));
ok('★★★ _defEmp ＝ 步驟 1 的 bk-coach，沒有才落回自己',
   /const _defEmp=\(pDate \? '' : \(\(\(document\.getElementById\('bk-coach'\)\|\|\{\}\)\.value\)\|\|''\)\) \|\| SESSION\.id;/.test(FN));
/* ⚠ showModal 會把步驟 1 的 DOM 整個換掉，所以一定要在它之前讀 */
ok('★★★ 在 showModal 之前就讀好（之後步驟 1 的 DOM 已經不在）',
   FN.indexOf('const _defEmp=') < FN.indexOf('showModal(`<div class="modal-title">場地租借'));
/* 從銷售視窗進來沒有步驟 1（pDate 有值），維持預設自己 */
ok('★★ 銷售視窗那條路（有 pDate）維持預設自己', /pDate \? '' :/.test(FN));

console.log('\n② 送出時仍以畫面上選的為準');
ok('★★★ 送出讀 fr-emp 的當下值（可以當場改別人）',
   /const emp=document\.getElementById\('fr-emp'\)\.value\|\|SESSION\.id;/.test(src));
ok('★★★ coach_id 寫的就是這一欄（＝誰的時段被佔用）',
   /coach_id:emp,ticket_id:frTkId/.test(src));
ok('★★ created_by 仍是操作的人（兩者是不同的事）',
   /created_by:SESSION\.id,created_at:new Date\(\)\.toISOString\(\)\};/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
