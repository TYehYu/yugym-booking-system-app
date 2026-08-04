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
ok('　　migration 留檔', fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260805_fn_member_group_checkin.sql'));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
