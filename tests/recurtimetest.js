/* 連續預約：一週多天可各排不同時間，上限 12 堂（2026-07-30 使用者指示）
   ・「一週兩天但要預約不同時間」→ 每個星期各給一個時間欄
   ・「預約最大次數是 12 次，因為我們的方案最多也只賣 12 堂」
   ・「一週預約兩堂的話，一週就會消耗 2 堂課」→ 數的是堂數不是週數（原本語意就對，補上說明） */
const fs=require('fs');
/* 2026-07-31：課種判斷抽成共用的 bkIsGroup／bkIsSelf／bkIsMassage（見 TK_POCKETS）——
   沙箱裡給等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('上限 12 堂');
ok('★ 常數集中一處', /const RECUR_MAX=12;/.test(src));
ok('★ 畫面上限＝min(可約堂數, 12)',
   /const _m=Number\(maxN\)>0 \? Math\.min\(Number\(maxN\), RECUR_MAX\) : RECUR_MAX;/.test(src)
   && /max="\$\{_m\}" step="1"/.test(src));
ok('★ 讀值時再夾一次（直接改 DOM 也繞不過）', /count=Math\.min\(count, RECUR_MAX\);                 \/\/ 方案最多 12 堂/.test(src));
ok('★ 引擎裡也夾（呼叫端傳大數字也擋住）',
   /const reqCount=Math\.min\(Math\.max\(1, o\.count\|\|1\), RECUR_MAX\);   \/\/ 方案最多 12 堂/.test(src));
ok('　　團課與待簽約卡位也套上限',
   (src.match(/Math\.min\(rc\.count,RECUR_MAX\)/g)||[]).length===2);
ok('　　文案講明數的是堂數不是週數', /數的是<b>堂數<\/b>不是週數 —— 一週勾兩天就是一週消耗 2 堂。/.test(src));
ok('　　超過上限的提示分兩種（票券上限／方案上限）',
   /最多只能排 \$\{cap\} 堂（可約堂數上限）/.test(src) && /最多只能排 \$\{RECUR_MAX\} 堂（方案上限）/.test(src));

console.log('\n各天不同時間');
ok('★ 每個星期一列，右邊一個時間欄',
   /<input type="time" class="\$\{prefix\}-dowt" data-dow="\$\{v\}" step="1800" disabled placeholder="同第一堂">/.test(src));
ok('★ 沒勾的星期時間欄不可填', /function recurDowToggle\(prefix,dow\)\{/.test(src)
   && /if\(tm\) tm\.disabled=!\(cb&&cb\.checked\);/.test(src));
ok('★ 打開連續預約時，起始日那天先帶入步驟 1 的時間',
   /if\(cb\.checked && !tm\.value && _bkWizard&&_bkWizard\.time\) tm\.value=String\(_bkWizard\.time\)\.slice\(0,5\);/.test(src));
ok('★ readRecur 帶回 times（只收有勾又有填的）',
   /if\(dows\.includes\(d\) && \/\^\\d\{2\}:\\d\{2\}\$\/\.test\(v\)\) times\[d\]=v;/.test(src));
ok('★ 新增 buildRecurringSlots：回傳「日期＋時間」',
   /function buildRecurringSlots\(startDate,startTime,dows,times,maxN,until\)\{/.test(src)
   && /return \{ date:d, time:\(dow!=null && T\[dow\]\) \? T\[dow\] : startTime \};/.test(src));
ok('　　沒設時間的那天退回起始時間', /沒設的那天就用 startTime/.test(src));
ok('★ 引擎逐筆用自己的時間（建立、驗證、RPC 都是）',
   /const ds=_slot\.date, ts=_slot\.time;/.test(src)
   && /date:ds, start_time:ts, duration:dur, status:'booked',/.test(src))
ok('　　衝堂驗證用那一筆的時間', /const verr=await validateBooking\(bk, ds, ts, dur\);/.test(src));
ok('　　RPC 也帶那一筆的時間', /const rr=await createBookingViaRpc\(o, tk, ds, ts\);/.test(src)
   && /p_date:ds, p_start_time:ts\|\|o\.time,/.test(src));
ok('★ 挑票也用那一筆的時間（友善課限平日 18:00 前，晚上那天不能挑到）',
   /const findTk = o\.findTicketFn \|\| \(async\(mid,ds,ts\)=>\{ const c=await listUsableTickets\(mid,o\.type_id,ds,ts\|\|o\.time\); return c\[0\]\|\|null; \}\);/.test(src)
   && /const bkFindTk=async\(mid,d,tsv\)=>\{/.test(src)
   && /&& tkTimeOk\(sel,d,tsv\|\|time\)\) return sel;/.test(src));
ok('　　團課各週也用那一筆的時間挑票', /listUsableTickets\(mid,type_id,dW,tW\)/.test(src)
   && /findUsableTicket\(mid,type_id,dW,tW\)/.test(src));
ok('　　待簽約卡位同樣逐筆帶時間', /const d=sl\.date, tv=sl\.time;/.test(src));
ok('　　跳過的清單標出時間（同一天兩個時段才分得出是哪一筆）',
   /skipped\.push\(`\$\{String\(d\)\.slice\(5\)\.replace\('-','\/'\)\} \$\{tv\}（\$\{verr\}）`\)/.test(src));

// 實跑
console.log('\n實跑 buildRecurringSlots');
{
  const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const code=g('function buildRecurringSlots(','\n}\n')+'\n'+g('function buildRecurringDates(','\n}\n');
  const env={ parseYmd:s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);},
              ymd:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') };
  const f=new Function(...Object.keys(env),code+'\nreturn buildRecurringSlots;')(...Object.values(env));
  // 2026-08-04 是週二。週二 10:00、週四 19:00，共 6 堂 → 3 週
  const r=f('2026-08-04','10:00',[2,4],{2:'10:00',4:'19:00'},6,'2026-12-31');
  eq('★ 週二 10:00＋週四 19:00 排 6 堂 → 兩種時間交錯、共 3 週',
     r, [{date:'2026-08-04',time:'10:00'},{date:'2026-08-06',time:'19:00'},
         {date:'2026-08-11',time:'10:00'},{date:'2026-08-13',time:'19:00'},
         {date:'2026-08-18',time:'10:00'},{date:'2026-08-20',time:'19:00'}]);
  eq('★ 一週兩天排 12 堂 → 剛好 6 週（一週消耗 2 堂）',
     f('2026-08-04','10:00',[2,4],{2:'10:00',4:'19:00'},12,'2026-12-31').length, 12);
  eq('　　最後一堂落在第 6 週的週四',
     f('2026-08-04','10:00',[2,4],{2:'10:00',4:'19:00'},12,'2026-12-31').slice(-1),
     [{date:'2026-09-10',time:'19:00'}]);
  eq('　　只設一天的時間、另一天留空 → 留空那天用起始時間',
     f('2026-08-04','10:00',[2,4],{4:'19:00'},4,'2026-12-31'),
     [{date:'2026-08-04',time:'10:00'},{date:'2026-08-06',time:'19:00'},
      {date:'2026-08-11',time:'10:00'},{date:'2026-08-13',time:'19:00'}]);
  eq('　　完全沒設 times → 全部用起始時間',
     f('2026-08-04','10:00',[2],null,3,'2026-12-31'),
     [{date:'2026-08-04',time:'10:00'},{date:'2026-08-11',time:'10:00'},{date:'2026-08-18',time:'10:00'}]);
  eq('　　一週三天排 12 堂 → 4 週',
     f('2026-08-03','09:00',[1,3,5],{},12,'2026-12-31').length, 12);
  eq('　　結束日期會截斷（排不滿就少建）',
     f('2026-08-04','10:00',[2,4],{},12,'2026-08-13').length, 4);
}

console.log('\n自主訓練改期：不會被「自己另一筆」卡住（2026-07-30 使用者提問）');
ok('★ 前端驗證帶原預約 id → 不會跟自己那一筆衝突',
   /const vbk=\{id:s\.resched\.id,member_id:SESSION\.id,coach_id:null,category:'自主訓練'/.test(src));
ok('★ 前端本來就放行自主訓練彼此重疊（多名額）',
   /const selfOK = bkIsSelf\(bk\) && bkIsSelf\(dup\);/.test(src));
ok('★ sameDay 排除自己那一筆', /const sameDay=all\.filter\(x=> x\.id!==bk\.id && x\.status!=='cancelled' && x\.date===date \);/.test(src));
ok('　　DB 端規則差異已記錄在 migration', (()=>{
  const fs2=require('fs');
  const f=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260730_reschedule_self_dup_rule.sql';
  if(!fs2.existsSync(f)) return false;
  const t=fs2.readFileSync(f,'utf8');
  return /and x\.category::text <> '自主訓練'/.test(t) && /這裡修的是「跟自己另一筆」/.test(t);
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
