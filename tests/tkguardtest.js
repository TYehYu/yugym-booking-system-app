/* 2026-08-06 票券規則稽核（docs/票券規則稽核-20260806.md）的前兩項修補：

   R1 團課的超約防線形同虛設 —— tkOverBooked 靠 tkBookedCountMap，而它只數
      bookings.ticket_id；團課預約沒有這個欄位，於是「能不能再約」只剩餘額>0 一道，
      而餘額正是最常被匯入批次校正、最容易脫節的欄位。
   R3 扣／退沒有護欄 —— deductTicket 不看餘額（可扣成負數）、
      refundTicket 不封頂（重複取消可讓餘額大於總堂數）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

(async()=>{
console.log('① 超約防線：團課也算得到（R1）');
{
  /* 團課預約沒有 ticket_id，扣課只在 ticket_logs；單人課有 ticket_id 走另一條，不能重複計。 */
  const BKS=[
    {id:'G9',status:'checked_in'},                       // 舊課，只有補連結（delta 0）
    {id:'G1',status:'checked_in'},                       // 團課：無 ticket_id
    {id:'G2',status:'booked'},
    {id:'G3',status:'cancelled'},                        // 取消＋退回 → 淨 0
    {id:'G4',status:'cancelled'},                        // 取消但扣課不退 → 仍佔一格
    {id:'P1',status:'booked',ticket_id:'T1'},            // 單人課：由 ticket_id 那條計
    {id:'P2',status:'cancelled',ticket_id:'T1'},         // 已取消 → 不計
  ];
  const LOGS=[
    /* delta 0 ＝「補連結」：只記歸屬、堂數當初就扣過了 → 不能算成佔用（2026-08-06） */
    {ticket_id:'T1',booking_id:'G9',action:'deduct',delta:0},
    {ticket_id:'T1',booking_id:'G1',action:'deduct'},
    {ticket_id:'T1',booking_id:'G2',action:'deduct'},
    {ticket_id:'T1',booking_id:'G3',action:'deduct'},
    {ticket_id:'T1',booking_id:'G3',action:'refund'},
    {ticket_id:'T1',booking_id:'G4',action:'deduct'},    // 扣課不退
    {ticket_id:'T1',booking_id:'P1',action:'deduct'},    // 已由 ticket_id 計過 → 不重複
    {ticket_id:'T1',booking_id:'P2',action:'deduct'},
  ];
  const fn=new Function('dbGetAll', grabFn('tkBookedCountMap')+'\nreturn tkBookedCountMap;')(
    async t=>(t==='bookings'?BKS:(t==='ticket_logs'?LOGS:[])));
  const map=await fn();
  eq('★ 團課 G1・G2 各一格＋G4（扣課不退）一格＋單人課 P1 一格＝4',map['T1'],4);
  ok('★★ 補連結（delta 0）不算佔用 —— 否則固化推算之後，有餘額的票會被防線誤擋',
     map['T1']===4 && /delta 為 0 的「補連結」本來就不進 _net/.test(src));

  /* ── 亂序也要算對（2026-08-29 使用者：「還是看不到許佳慈那張給媽媽的票」）──
     dbGetAll('ticket_logs') 的順序不保證按時間。原本逐筆 deduct +1 / refund −1，
     refund 那邊還夾了 Math.max(0,…)：只要 refund 先被處理就被吃掉、後面的 deduct
     照加，佔用就灌爆。許佳慈 TK-mte3oumslp83 累積 9 扣 6 退（真正還扣著 3 堂），
     不巧的順序會算成 9 → 4 堂的票被判「已排滿」→ 名單上整個人不見。 */
  {
    const B2=[]; for(let i=1;i<=9;i++) B2.push({id:'B'+i,status:'booked'});
    const L2=[];
    for(let i=1;i<=9;i++) L2.push({ticket_id:'TT',booking_id:'B'+i,action:'deduct',delta:-1});
    [1,4,6,7,8,9].forEach(i=>L2.push({ticket_id:'TT',booking_id:'B'+i,action:'refund',delta:1}));
    const mk=async(order)=>{
      const logs=order.slice();
      const fn2=new Function('dbGetAll', grabFn('tkBookedCountMap')+'\nreturn tkBookedCountMap;')(
        async t=>(t==='bookings'?B2:(t==='ticket_logs'?logs:[])));
      return (await fn2())['TT'];
    };
    eq('★★★ 照時間順序 → 3（9 扣 6 退，真正還扣著 3 堂）', await mk(L2), 3);
    eq('★★★ 退款排在前面（最壞的順序）→ 還是 3，不會變成 9',
       await mk(L2.slice().reverse()), 3);
    eq('★★ 完全打散也一樣',
       await mk(L2.slice().sort((a,b)=>String(a.booking_id+a.action).localeCompare(String(b.booking_id+b.action)))), 3);
    /* 同一堂扣兩格（一人兩個名額扣同一張票）要算成兩格，不是一格 */
    const B3=[{id:'X1',status:'booked'}];
    const L3=[{ticket_id:'TT',booking_id:'X1',action:'deduct',delta:-1},
              {ticket_id:'TT',booking_id:'X1',action:'deduct',delta:-1}];
    const fn3=new Function('dbGetAll', grabFn('tkBookedCountMap')+'\nreturn tkBookedCountMap;')(
      async t=>(t==='bookings'?B3:(t==='ticket_logs'?L3:[])));
    eq('★★ 同一堂扣兩格算兩格（團課一人多名額）', (await fn3())['TT'], 2);
  }

  const over=new Function(grabFn('tkOverBooked')+'\nreturn tkOverBooked;')();
  ok('★ 4 堂票已被佔滿 4 格 → 擋下（團課現在也擋得住）', over({id:'T1',sessions_total:4},map)===true);
  ok('　　5 堂票還有一格 → 放行', over({id:'T1',sessions_total:5},map)===false);
  ok('　　沒有總堂數的票不套用（維持原行為）', over({id:'T1',sessions_total:0},map)===false);
  ok('★ tkFitsBooking 仍把它列為必過的一關',
     /if\(tkOverBooked\(t,bkCntByTicket\)\) return false;   \/\/ 已排滿總堂數 → 不能再排（超約防線）/.test(src));
}

console.log('\n② 扣課護欄：餘額 0 就不再扣（R3）');
{
  const mk=(tk)=>{ const L=[],T=[];
    /* 2026-08-27：deductTicket 前面多了一道冪等檢查（同票同預約不重複扣），
       它會先問 tkNetDeductOn —— 沙箱給 0（＝這一堂還沒扣過），
       其餘行為與原本完全相同。冪等本身另由 tests/deductonce.js 驗。 */
    /* 2026-09-03：deductTicket 多一條「教練走 RPC」的分支（見 tests/coachdeducttest.js）。
       這支測的是餘額護欄，兩條路共用，沙箱固定站在櫃檯視角走直接寫入那條。 */
    const fn=new Function('logTicket','activateTicketIfNeeded','dbPut','showToast','tkNetDeductOn','isDeskLike',
      grabFn('deductTicket')+'\nreturn deductTicket;')(
      async(...a)=>{L.push(a);}, async()=>null, async(_,o)=>{T.push(JSON.parse(JSON.stringify(o)));}, m=>L.push(['toast',m]),
      async()=>0, ()=>true);
    return {fn,L,T}; };
  {
    const {fn,L,T}=mk();
    const tk={id:'T1',plan_name:'團體課',sessions_remaining:2,sessions_total:4};
    eq('★ 還有餘額 → 照扣，回傳 true', await fn(tk,'B1','u1'), true);
    eq('　　餘額減一', tk.sessions_remaining, 1);
    ok('　　寫的是 deduct −1', L.some(a=>a[1]==='deduct'&&a[2]===-1));
  }
  {
    const {fn,L,T}=mk();
    const tk={id:'T1',plan_name:'團體課',sessions_remaining:0,sessions_total:4};
    eq('★ 餘額 0 → 不扣，回傳 false', await fn(tk,'B1','u1'), false);
    eq('★ 餘額不會變成負數', tk.sessions_remaining, 0);
    ok('★ 留下警示紀錄（adjust 0，不是靜默）',
       L.some(a=>a[1]==='adjust'&&a[2]===0&&/已阻擋：餘額為 0/.test(String(a[5]))));
    ok('★ 當面提示櫃檯（不是只寫在資料庫裡）', L.some(a=>a[0]==='toast'&&/沒有扣到票/.test(String(a[1]))));
    ok('　　沒有動到票券（不寫 member_tickets）', T.length===0);
  }
  {
    const {fn}=mk();
    const tk={id:'T1',sessions_remaining:-2,sessions_total:4};
    eq('　　已經是負數的舊資料也擋（不再往下掉）', await fn(tk,'B1','u1'), false);
  }
}

console.log('\n③ 退課護欄：不退超過總堂數（R3）');
{
  const mk=(tk)=>{ const L=[],T=[];
    const fn=new Function('dbGet','dbPut','logTicket','showToast','CLOUD','sb',
      grabFn('refundTicket')+'\nreturn refundTicket;')(
      async()=>tk, async(_,o)=>{T.push(JSON.parse(JSON.stringify(o)));}, async(...a)=>{L.push(a);},
      m=>L.push(['toast',m]), false, null);
    return {fn,L,T}; };
  {
    const tk={id:'T1',plan_name:'團體課',sessions_remaining:1,sessions_total:4};
    const {fn,L}=mk(tk);
    eq('★ 還沒滿 → 照退，回傳 true', await fn('T1','B1','u1'), true);
    eq('　　餘額加一', tk.sessions_remaining, 2);
    ok('　　寫的是 refund +1', L.some(a=>a[1]==='refund'&&a[2]===1));
  }
  {
    const tk={id:'T1',plan_name:'團體課',sessions_remaining:4,sessions_total:4};
    const {fn,L,T}=mk(tk);
    eq('★ 已經滿了 → 不退，回傳 false', await fn('T1','B1','u1'), false);
    eq('★ 餘額不會超過總堂數', tk.sessions_remaining, 4);
    ok('★ 留下警示紀錄', L.some(a=>a[1]==='adjust'&&a[2]===0&&/已阻擋：餘額 4\/4 已滿/.test(String(a[5]))));
    ok('★ 當面提示櫃檯', L.some(a=>a[0]==='toast'&&/沒有再退回/.test(String(a[1]))));
    ok('　　沒有動到票券', T.length===0);
  }
  {
    const tk={id:'T1',sessions_remaining:2,sessions_total:0};
    const {fn}=mk(tk);
    eq('　　沒有總堂數的舊票不套用封頂（維持原行為）', await fn('T1','B1','u1'), true);
  }
}

/* 2026-08-24 劉雪珠 8/31 案例：原本只要「掛著票、沒取消」就算佔一格，不管那一堂的
   堂數是不是早就退回來了。教練請假新制（0814）正是這種形狀 —— 請假當下不退、票掛著，
   會員到場簽到才退 1 堂，但預約仍掛著同一張票（圓形卡的紅圈點靠它畫）。
   於是 4 堂的票掛 4 筆預約 → 判定滿了，會員明明還有 1 堂卻只給「儲值」不給「轉正」。 */
console.log('\n② 帳本淨值：已經退回來的那一堂不算佔位');
{
  const BKS=[
    {id:'b1',ticket_id:'T',status:'checked_in'},
    {id:'b2',ticket_id:'T',status:'checked_in'},
    {id:'b3',ticket_id:'T',status:'checked_in'},
    {id:'b4',ticket_id:'T',status:'checked_in'},   // 教練請假 → 到場簽到已退堂
    {id:'b5',ticket_id:'T',status:'cancelled'},
    {id:'old',ticket_id:'X',status:'booked'},      // 舊系統匯入：完全沒有帳本
  ];
  const LOGS=[
    {ticket_id:'T',booking_id:'b1',action:'deduct',delta:-1},
    {ticket_id:'T',booking_id:'b2',action:'deduct',delta:-1},
    {ticket_id:'T',booking_id:'b3',action:'deduct',delta:-1},
    {ticket_id:'T',booking_id:'b4',action:'deduct',delta:-1},
    {ticket_id:'T',booking_id:'b4',action:'refund',delta:1},
    {ticket_id:'T',booking_id:'b4',action:'deduct',delta:-1},
    {ticket_id:'T',booking_id:'b4',action:'refund',delta:1},
  ];
  const fn=new Function('dbGetAll', grabFn('tkBookedCountMap')+'\nreturn tkBookedCountMap;')(
    async t=>(t==='bookings'?BKS:(t==='ticket_logs'?LOGS:[])));
  const map=await fn();
  eq('★★ 退回來的那一堂不佔位（4 筆預約只算 3 格）', map['T'], 3);
  eq('★★ 完全沒有帳本的舊資料照舊算佔用（不能用「查不到帳」把防線拆掉）', map['X'], 1);
  ok('　　delta 缺值時看 action 推，不能當成 0（0 在這套帳本裡是「補連結」）',
     /Number\.isFinite\(Number\(l\.delta\)\) \? Number\(l\.delta\)/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
