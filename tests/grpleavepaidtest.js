/* 補課券只發給「有扣課」的名額（2026-08-20 林婉華案例）：
   誤按取消（退堂）→ 加回名單漏扣 → 再按請假 ＝「退 1 堂＋又拿補課券」雙重補償。
   守門：請假前先查這格的扣課（seatTicketOf）；查不到就只標請假、不發券並跳說明視窗。
   例外：舊系統匯入、整堂完全沒有扣課帳的課照舊發。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

const i0=src.indexOf('async function _groupToggleLeave');
const fn=src.slice(i0, src.indexOf('\n}\n', i0));

ok('★ 請假前查這格有沒有扣課（_paidOk 以 seatTicketOf 起手）', /let _paidOk=!!_seatTk;/.test(fn));
ok('★ 舊匯入無帳的課放行（整堂沒有 deduct 且沒有 seat_tickets）',
   /if\(!_hasAny && !\(b\.seat_tickets&&Object\.keys\(b\.seat_tickets\)\.length\)\) _paidOk=true;/.test(fn));
ok('★ 有扣課才發補課券', /if\(_paidOk\)\{\s*\n\s*const tk=await grantMakeupTicket\(b,mid,sk\);/.test(fn));
ok('★ 沒扣課＝只標請假＋說明視窗（不發券）', fn.includes('已標請假，但沒有發補課券'));
ok('　　請假標記本身照常寫入（發不發券都標）', /att\[sk\]='leave';/.test(fn) && fn.indexOf("att[sk]='leave';")<fn.indexOf('if(_paidOk){'));
ok('　　補課券的課不能再請假的舊防線仍在', fn.includes('這一格是用補課券補的課，不能再請假'));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
