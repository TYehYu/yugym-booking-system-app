/* 自主訓練的兩種點數（2026-07-30 使用者指示）：
   一般自主訓練（無限制）與友善自主訓練（限平日 18:00 前）視為同一池，
   依預約時段自動判斷哪一種可用；受限的優先用掉，免得白白過期。
   2026-08-08 使用者更正：「平日 17:30 也是不能預約友善教練課的時間」——
   限的是「18:00 之前的時段」，看的是下課時間，所以 tkTimeOk 多收一個時長（預設 60）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

// 取出 tkTimeOk（時段判定）
const i=src.indexOf('function tkTimeOk(t,bookDate,bookTime,dur){');
const j=src.indexOf('\n}', i)+2;
const TT=[{id:'self',time_restricted:false},{id:'fr',time_restricted:true}];
const t2m=t=>{const p=String(t).split(':');return (+p[0])*60+(+p[1]||0);};
const pymd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const tkTimeOk=new Function('window','timeToMin','parseYmd','TK_TIME_END_MIN',
  src.slice(i,j)+'\nreturn tkTimeOk;')({_ttCache:TT},t2m,pymd,1080);

const FR={ticket_type_id:'fr'}, GEN={ticket_type_id:'self'};
// 2026-07-30 是週四（平日）、2026-08-01 週六、2026-08-02 週日
console.log('友善點：限平日、18:00 前上完');
eq('★ 平日 10:00 → 可用', tkTimeOk(FR,'2026-07-30','10:00'), true);
eq('★★ 平日 17:00 → 可用（60 分鐘剛好 18:00 下課）', tkTimeOk(FR,'2026-07-30','17:00'), true);
eq('★★ 平日 17:30 → 不可用（會上到 18:30；2026-08-08 使用者更正）',
   tkTimeOk(FR,'2026-07-30','17:30'), false);
eq('★★ 120 分鐘的課 16:30 → 不可用（18:30 下課）', tkTimeOk(FR,'2026-07-30','16:30',120), false);
eq('　　120 分鐘的課 16:00 → 可用（剛好 18:00 下課）', tkTimeOk(FR,'2026-07-30','16:00',120), true);
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
   /if\(wantCat==='自主訓練'\) return ticketCategoryOf\(t\)==='自主訓練';/.test(src));
ok('★ 挑票時先篩掉時段不符的', /if\(!tkTimeOk\(t,bookDate,bookTime\)\) return false;/.test(src));
ok('★★ 界線寫成常數，不再散落 1080', /const TK_TIME_END_MIN=1080;   \/\/ 18:00/.test(src)
   && /timeToMin\(bookTime\)\+\(Number\(dur\)\|\|60\) > TK_TIME_END_MIN/.test(src));
ok('★ 受限的票優先用掉（否則最容易白白過期）',
   /const ra=tkIsTimeRestricted\(a\)\?0:1, rb=tkIsTimeRestricted\(b\)\?0:1;/.test(src)
   && /if\(ra!==rb\) return ra-rb;/.test(src));
ok('　　其餘仍依到期日先進先出，沒有效期的排最後（2026-07-30 修）',
   /String\(a\.expire_date\|\|'9999-12-31'\)\.localeCompare\(String\(b\.expire_date\|\|'9999-12-31'\)\)/.test(src));
ok('　　挑票函式一路把時間傳下去',
   /async function listUsableTickets\(member_id,type_id,bookDate,bookTime\)/.test(src)
   && /async function findUsableTicket\(member_id,type_id,bookDate,bookTime\)/.test(src));

console.log('\n會員自約也受限');
ok('★ 友善分頁：週末日期不可選', /if\(s\.type==='friendly'\)\{[\s\S]{0,120}if\(dow===0\|\|dow===6\) return false;/.test(src));
ok('★ 時段列表用該票種驗證（validateBooking 擋「18:00 之後才下課」的時段）',
   /if\(tt && tt\.time_restricted\)\{[\s\S]{0,400}此票券僅限平日 18:00 前上完/.test(src)
   && /ticket_type_id:probeTtid/.test(src));
ok('★ 前端也有對應的錯誤訊息（資料庫端擋下來時看得懂）',
   /'TICKET.TIME_RESTRICTED'/.test(src));
ok('★ 畫面明講原因，不讓會員以為系統壞了',
   /友善自主訓練點數僅限<b>平日、且要在 18:00 前上完<\/b>（60 分鐘的時段最晚 17:00 開始）/.test(src));

/* ── 步驟 2 的「這位會員有幾堂可用」必須跟挑票同一套 ──────────────
   2026-07-30 使用者回報：陳蘭馨明明還有友善自主訓練點數，櫃檯開自主訓練卻沒有票可選。
   真因是步驟 2 自己寫了一套（只用 bkTicketTypeOk 嚴格比對票種），友善點數比不上
   「自主訓練」票種 → 判定她 0 堂 → 整個人被 filter 掉 → 畫面變成「待簽約卡位」。 */
console.log('\n步驟 2 與挑票共用同一套判定');
// 2026-07-30：多帶一個 bkCntByTicket（超約防線），簽名與呼叫端一起更新
ok('★ 抽出共用判定 tkFitsBooking', /function tkFitsBooking\(t, member_id, type_id, bookDate, bookTime, bkCntByTicket\)\{/.test(src));
ok('★ listUsableTickets 改用它', /return all\.filter\(t=>tkFitsBooking\(t,member_id,type_id,bookDate,bookTime,cnt\)\)/.test(src));
ok('★ 步驟 2 一般課程改用它（不再自寫一套）',
   /const tks=allTkG\.filter\(tt=>tkFitsBooking\(tt,m\.id,type_id,date,time,_bkCntG\)\);/.test(src)
   && !/allTkG\.filter\(tt=>tkUsableBy\(tt,m\.id\) && bkTicketTypeOk/.test(src));
ok('★ 步驟 2 團體課也改用它',
   /const tks=allTk\.filter\(tt=>tkFitsBooking\(tt,m\.id,type_id,date,time,_bkCnt\)\)/.test(src));
ok('　　顯示的堂數用 tkUnlockedLeft（分期未開通的不能先算進去）',
   (src.match(/const sum=tks\.reduce\(\(s,tt\)=>s\+tkUnlockedLeft\(tt\),0\);/g)||[]).length===2);
ok('　　步驟 2 先確保票種快取（tkFitsBooking 要靠它判類別）',
   /票種表：tkFitsBooking 要靠它判類別與限時段，先確保有快取/.test(src));

{
  // 用陳蘭馨正式庫的真實票券跑一次
  const TT=[
    {id:'tt-mqdt55uosz5n',name:'自主訓練',category:'自主訓練',time_restricted:false},
    {id:'tt-mqdt5kbxusgt',name:'友善自主訓練',category:'自主訓練',time_restricted:true},
    {id:'tt-mqdt435bbizd',name:'教練課',category:'私人教練',time_restricted:false},
  ];
  const T=[
    {id:'新友善A',ticket_type_id:'tt-mqdt5kbxusgt',member_id:'M',status:'usable',sessions_remaining:1,sessions_total:2,expire_date:'2026-08-02'},
    {id:'新友善B',ticket_type_id:'tt-mqdt5kbxusgt',member_id:'M',status:'usable',sessions_remaining:2,sessions_total:2,expire_date:'2026-08-03'},
    {id:'一般點數用完',ticket_type_id:'tt-mqdt55uosz5n',member_id:'M',status:'usable',sessions_remaining:0,sessions_total:2,expire_date:'2026-08-02'},
    {id:'舊友善已過期',ticket_type_id:'tt-mqdt5kbxusgt',member_id:'M',status:'usable',sessions_remaining:2,sessions_total:2,expire_date:'2026-07-26'},
  ];
  const grab=m=>{const i=src.indexOf(m);return src.slice(i,src.indexOf('\n}',i)+2);};
  // 2026-07-30：tkFitsBooking 多了超約防線 tkOverBooked（不傳計數時不生效）
  const body=['function tkUsableBy','function ticketCategoryOf','function tkTimeOk','function tkUnlockedLeft',
              'function tkOverBooked','function tkFitsBooking']
    .map(grab).join('\n');
  const fits=new Function('window','timeToMin','parseYmd','categoryOfTypeId','tkSharedIds','bkTicketTypeOk','TK_TIME_END_MIN',
    body+'\nreturn tkFitsBooking;')(
      {_ttCache:TT}, t2m, pymd,
      id=>(TT.find(x=>x.id===id)||{}).category||null, ()=>[], (t,id)=>t.ticket_type_id===id, 1080);
  const cnt=(d,t)=>T.filter(x=>fits(x,'M','tt-mqdt55uosz5n',d,t)).length;
  eq('★ 平日 09:30 開自主訓練 → 兩張友善點數都算數', cnt('2026-07-30','09:30'), 2);
  eq('★ 舊的過期點數不算', T.filter(x=>fits(x,'M','tt-mqdt55uosz5n','2026-07-30','09:30')).some(x=>x.id==='舊友善已過期'), false);
  eq('　　剩 0 堂的一般點數不算', T.filter(x=>fits(x,'M','tt-mqdt55uosz5n','2026-07-30','09:30')).some(x=>x.id==='一般點數用完'), false);
  eq('★ 平日 19:00 → 友善點數不能用，判定 0 堂', cnt('2026-07-30','19:00'), 0);
  eq('★★ 平日 17:30 → 友善點數也不能用（60 分鐘會上到 18:30；2026-08-08 使用者更正）',
     cnt('2026-07-30','17:30'), 0);
  eq('　　平日 17:00 → 還可以用（18:00 剛好下課）', cnt('2026-07-30','17:00'), 2);
  eq('★ 週六 09:30 → 友善點數不能用，判定 0 堂', cnt('2026-08-01','09:30'), 0);
  eq('　　教練課類別不會誤撈到自主訓練點數',
     T.filter(x=>fits(x,'M','tt-mqdt435bbizd','2026-07-30','09:30')).length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
