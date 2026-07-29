/* 自主訓練的兩種點數（2026-07-30 使用者指示）：
   一般自主訓練（無限制）與友善自主訓練（限平日 18:00 前）視為同一池，
   依預約時段自動判斷哪一種可用；受限的優先用掉，免得白白過期。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

// 取出 tkTimeOk（時段判定）
const i=src.indexOf('function tkTimeOk(t,bookDate,bookTime){');
const j=src.indexOf('\n}', i)+2;
const TT=[{id:'self',time_restricted:false},{id:'fr',time_restricted:true}];
const t2m=t=>{const p=String(t).split(':');return (+p[0])*60+(+p[1]||0);};
const pymd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const tkTimeOk=new Function('window','timeToMin','parseYmd',
  src.slice(i,j)+'\nreturn tkTimeOk;')({_ttCache:TT},t2m,pymd);

const FR={ticket_type_id:'fr'}, GEN={ticket_type_id:'self'};
// 2026-07-30 是週四（平日）、2026-08-01 週六、2026-08-02 週日
console.log('友善點：限平日 18:00 前');
eq('★ 平日 10:00 → 可用', tkTimeOk(FR,'2026-07-30','10:00'), true);
eq('★ 平日 17:30 → 可用（18:00 前）', tkTimeOk(FR,'2026-07-30','17:30'), true);
eq('★ 平日 18:00 → 不可用（含 18:00）', tkTimeOk(FR,'2026-07-30','18:00'), false);
eq('★ 平日 20:00 → 不可用', tkTimeOk(FR,'2026-07-30','20:00'), false);
eq('★ 週六 10:00 → 不可用', tkTimeOk(FR,'2026-08-01','10:00'), false);
eq('★ 週日 10:00 → 不可用', tkTimeOk(FR,'2026-08-02','10:00'), false);
eq('　　沒帶時間時只擋星期（時段留給 validateBooking 把關）',
   tkTimeOk(FR,'2026-07-30'), true);
eq('　　沒帶日期就不擋', tkTimeOk(FR), true);

console.log('\n一般點：不受限');
eq('平日晚間 20:00 → 可用', tkTimeOk(GEN,'2026-07-30','20:00'), true);
eq('週日 10:00 → 可用', tkTimeOk(GEN,'2026-08-02','10:00'), true);

console.log('\n兩種點數同池');
ok('★ 自主訓練改為同類別即可用（友善點也扣得到）',
   /const selfMode = wantCat==='自主訓練';/.test(src)
   && /if\(selfMode\)  return ticketCategoryOf\(t\)==='自主訓練';/.test(src));
ok('★ 挑票時先篩掉時段不符的', /if\(!tkTimeOk\(t,bookDate,bookTime\)\) return false;/.test(src));
ok('★ 受限的票優先用掉（否則最容易白白過期）',
   /const ra=tkIsTimeRestricted\(a\)\?0:1, rb=tkIsTimeRestricted\(b\)\?0:1;/.test(src)
   && /if\(ra!==rb\) return ra-rb;/.test(src));
ok('　　其餘仍依到期日先進先出',
   /return \(a\.expire_date\|\|''\)\.localeCompare\(b\.expire_date\|\|''\);/.test(src));
ok('　　挑票函式一路把時間傳下去',
   /async function listUsableTickets\(member_id,type_id,bookDate,bookTime\)/.test(src)
   && /async function findUsableTicket\(member_id,type_id,bookDate,bookTime\)/.test(src));

console.log('\n會員自約也受限');
ok('★ 友善分頁：週末日期不可選', /if\(s\.type==='friendly'\)\{[\s\S]{0,120}if\(dow===0\|\|dow===6\) return false;/.test(src));
ok('★ 時段列表用該票種驗證（validateBooking 擋 18:00 後）',
   /if\(tt && tt\.time_restricted\)\{[\s\S]{0,300}此票券僅限平日 18:00 前使用/.test(src)
   && /ticket_type_id:probeTtid/.test(src));
ok('★ 前端也有對應的錯誤訊息（資料庫端擋下來時看得懂）',
   /'TICKET.TIME_RESTRICTED'/.test(src));
ok('★ 畫面明講原因，不讓會員以為系統壞了',
   /友善自主訓練點數僅限<b>平日 18:00 前<\/b>使用/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
