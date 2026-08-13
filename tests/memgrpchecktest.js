/* 2026-08-05 使用者指示：「團課的學生也要能夠自己簽到」

   團課＝逐名額簽到、會員對 bookings 沒有寫入權 → fn_member_group_checkin RPC 代寫
   （守門：本人名額、今天的課、開課前 30 分鐘起至下課；每次簽一個名額；不發點）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

ok('★ 掃碼候選課含團課（本人名額還沒簽到/請假的）',
   /const _grpSelfLeft=b=>\{/.test(src)
   && /seatKeys\(b\)\.some\(k=>seatMid\(k\)===String\(SESSION\.id\)&&\['checked_in','leave'\]\.indexOf\(att\[k\]\|\|''\)<0\)/.test(src));
ok('★ 團課簽到走 RPC（不動前端 dbPut）',
   /sb\.rpc\('fn_member_group_checkin',\{p_booking_id:b\.id\}\)/.test(grabFn('memberGroupCheckin')));
ok('★ 單堂與多堂挑選兩條路都分流到團課簽到',
   /if\(bkIsGroup\(c0\)\)\{ await memberGroupCheckin\(c0\); return; \}/.test(src)
   && /if\(b&&bkIsGroup\(b\)\)\{ await memberGroupCheckin\(b\); return; \}/.test(src));
ok('★ 錯誤碼有人話（太早／已結束／已簽過／不在名單）',
   /尚未開放簽到（課程開始前 30 分鐘起）/.test(grabFn('memberGroupCheckin'))
   && /這堂課已結束，請洽櫃檯補簽/.test(grabFn('memberGroupCheckin'))
   && /這堂課已簽到過了/.test(grabFn('memberGroupCheckin')));
ok('　　第二個名額的訊息標名額序', /（第 \$\{data\.seat\} 個名額）/.test(src));
ok('　　簽完清快取（行事曆與名單立即反映）', /dbCacheClear\(\['bookings'\]\);/.test(grabFn('memberGroupCheckin')));
/* 2026-08-05 使用者補充：「目前會員統一都是點選課卡選簽到，就沒有掃碼了」——
   課卡按鈕也接上（原本被「團課由教練點名」擋住）。 */
ok('★ 課卡的簽到鈕也接團課（看自己名額，不看整堂 status）',
   /memGrpCardCheckin\('\$\{b\.id\}'\)">簽到</.test(src)
   && /const _left=_ks\.some\(k=>\['checked_in','leave'\]\.indexOf\(_att\[k\]\|\|''\)<0\);/.test(src)
   && !/團課由教練點名，會員不可整堂簽到/.test(src));
ok('★ 自己名額都簽了才標「已簽到」（別人先簽不誤標）',
   /if\(_ks\.length&&!_left\) actionBtn=`<span class="tag tag-ok"/.test(src));
ok('　　migration 留檔', fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_fn_member_group_checkin.sql'));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');


/* 2026-08-13 使用者指示：「會員端已移除掃碼，改在首頁圓形課卡簽到」——
   圓卡彈出的簽到鈕接上團課（同一支 RPC，回饋改 toast＋重繪）。 */
{
  const fs3=require('fs');
  const src3=fs3.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
  const okx=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
  console.log('\n圓形課卡自簽（2026-08-13）');
  okx('★★ 團課點簽到走 memGrpCheckin（RPC fn_member_group_checkin）',
     /memTaskClose\(\);memGrpCheckin\('\$\{b\.id\}'\)/.test(src3)
     && /async function _memGrpCheckin\(id\)\{/.test(src3)
     && /_memGrpCheckin[\s\S]{0,200}fn_member_group_checkin/.test(src3));
  okx('★★ 逐名額判斷：我的名額全簽完/請假＝完成、還有名額＝開窗內可簽',
     /const _mySeats=isGrp\?seatKeys\(b\)\.filter\(k=>seatMid\(k\)===String\(SESSION\.id\)\):\[\];/.test(src3)
     && /const _myLeft=isGrp\?_mySeats\.some\(k=>\['checked_in','leave'\]\.indexOf\(_att\[k\]\|\|''\)<0\):false;/.test(src3));
  okx('★ 全請假顯示「已請假」不誤標已簽到', /_myAllLeave\?'已請假':'已簽到'/.test(src3));
  okx('★ 「教練點名」提示退場（會員可自簽了）', !/團體課由教練點名/.test(src3));
  okx('　　防連點（onceAct）', /memGrpCheckin\(id\)\{ return onceAct\('grpck:'\+id/.test(src3));
}
console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗（含圓卡自簽追加）');
process.exit(fail?1:0);
