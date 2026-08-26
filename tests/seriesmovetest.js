/* 整串改期（2026-08-26 使用者回報）
   「剛剛教練 zoe 反應　他在調整客人黃柏桓的課程　無法全部一起調整
     是沒有跳出視窗提示　還是沒有給這個功能呢？」

   查出來是「功能有、但幾乎問不到」：bkOfferSeriesMove 是 0818 做的，
   而 confirmCalMove 呼叫它的條件寫死成 `od===nd && ot!==nt`
   ── 只有「同一天、只改時間」才問。日期一動就完全不問，
   而「整串往後挪一週」「整串從週四改成週二」正是最常見的兩種需求。

   同一天回報的另一支：桌機拖曳課卡改時間畫面不即時更新。
   真因是 window._calDataCache（renderCalendar 上一次渲染留的翻頁快照）
   與 _dbCache 是兩份，寫入只更新了後者。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabLine=sig=>{const i=src.indexOf(sig);return src.slice(i,src.indexOf('\n',i));};

/* ── 沙箱 ───────────────────────────────────────────────────────────
   黃柏桓的真實課表是「週四 19:00 連續 12 堂（待簽約）」，這裡縮成 5 堂。
   ⚠ 呼叫端（confirmCalMove 的 _calYes）是**先把這一堂寫進資料庫、再問後續**，
     所以每個情境都要先 moveAnchor()，否則後面那幾堂會撞到還坐在原位的錨點，
     測出來的行為跟線上不一樣。 */
const BASE=[
  {id:'B1',member_id:'M1',coach_id:'C1',category:'私人教練',date:'2026-10-15',start_time:'19:00',status:'booked',duration:60},
  {id:'B2',member_id:'M1',coach_id:'C1',category:'私人教練',date:'2026-10-22',start_time:'19:00',status:'booked',duration:60},
  {id:'B3',member_id:'M1',coach_id:'C1',category:'私人教練',date:'2026-10-29',start_time:'19:00',status:'booked',duration:60},
  {id:'B4',member_id:'M1',coach_id:'C1',category:'私人教練',date:'2026-11-05',start_time:'19:00',status:'booked',duration:60},
  {id:'B5',member_id:'M1',coach_id:'C1',category:'私人教練',date:'2026-11-12',start_time:'19:00',status:'booked',duration:60},
  /* 同一人但週二 20:00 —— 不同系列，不可以被掃進來 */
  {id:'X1',member_id:'M1',coach_id:'C1',category:'私人教練',date:'2026-11-03',start_time:'20:00',status:'booked',duration:60},
  /* 同時段但別的會員、別的教練（同教練會變成整串的衝堂來源，那是另一件事） */
  {id:'Y1',member_id:'M9',coach_id:'C9',category:'私人教練',date:'2026-10-22',start_time:'19:00',status:'booked',duration:60},
  /* 同一人同時段但已取消 */
  {id:'Z1',member_id:'M1',coach_id:'C1',category:'私人教練',date:'2026-11-19',start_time:'19:00',status:'cancelled',duration:60},
];
let DB, modal, toasts, VERR;
const boot=()=>{ DB=JSON.parse(JSON.stringify(BASE)); modal=''; toasts=[]; VERR=()=>''; };
/* 教練同時段只能一堂 —— 線上 validateBooking 的其中一條，用來驗「整串自己撞自己」 */
const CLASH=(x,d,t)=>DB.some(o=>o.id!==x.id&&o.status==='booked'&&o.coach_id===x.coach_id
  &&o.date===d&&String(o.start_time).slice(0,5)===String(t).slice(0,5))?'教練同時段已有課':'';

function mkEnv(today){
  const W={};
  const env={
    window:W, TODAY:today,
    dbGetAll:async()=>DB.map(x=>Object.assign({},x)),
    dbGet:async(_s,id)=>{ const r=DB.find(x=>x.id===id); return r?Object.assign({},r):null; },
    dbPut:async(_s,o)=>{ const i=DB.findIndex(x=>x.id===o.id); if(i>=0) DB[i]=Object.assign({},o); return o; },
    validateBooking:async(x,d,t)=>VERR(x,d,t),
    showModal:h=>{ modal=h; }, showToast:t=>{ toasts.push(t); },
    occCacheClear:()=>{}, navTo:()=>{}, onceAct:(_k,f)=>f(),
    escH:t=>String(t==null?'':t), CUR_PAGE:'calendar', CUR_GROUP:null,
  };
  const SRC=[grabFn('ymd'),grabFn('parseYmd'),grabFn('addDays'),grabFn('timeToMin'),
    grabFn('calMoveDiff'),grabLine('const SM_WDN='),
    grabFn('bkOfferSeriesMove'),grabFn('_bkDoSeriesMove')].join('\n');
  const o=new Function(...Object.keys(env),
    SRC+'\nreturn {bkOfferSeriesMove,_bkDoSeriesMove};')(...Object.values(env));
  o.W=W; return o;
}
const E=mkEnv(new Date(2026,7,26));                 // 今天＝2026-08-26
const anchor=()=>Object.assign({},BASE[0]);
/* 呼叫端已經寫過的那一步 */
const moveAnchor=(nd,nt)=>{ const b=DB.find(x=>x.id==='B1'); b.date=nd; b.start_time=nt; };
const dates=()=>['B1','B2','B3','B4','B5'].map(id=>{const x=DB.find(y=>y.id===id);return x.date+' '+x.start_time;});
/* 情境一次跑完：boot → 錨點先落地 → 問 → 一起改 */
async function run(nd,nt,{od='2026-10-15',ot='19:00',ask=true}={}){
  moveAnchor(nd,nt);
  await E.bkOfferSeriesMove(anchor(),od,ot,nd,nt);
  if(ask) await E._bkDoSeriesMove();
}

(async()=>{

console.log('① 什麼時候會問（原本只有「同一天改時間」才問）');
{
  boot(); moveAnchor('2026-10-15','14:00');
  await E.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-15','14:00');
  ok('★ 同一天只改時間 → 照舊會問（0818 的行為不能弄壞）', /後續課程要一起改嗎/.test(modal));

  boot(); moveAnchor('2026-10-13','19:00');
  await E.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-13','19:00');
  ok('★★ 週四改成週二（日期動了）→ 現在也會問　←　zoe 卡住的就是這一種',
     /後續課程要一起改嗎/.test(modal) && /每週二 19:00/.test(modal));

  boot(); moveAnchor('2026-10-22','19:00');
  await E.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-22','19:00');
  ok('★★ 整串往後挪一週（星期沒變、日期變）→ 也會問',
     /後續課程要一起改嗎/.test(modal) && /每週四 19:00/.test(modal) && /往後 1 週/.test(modal));

  boot();
  await E.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-15','19:00');
  ok('　 什麼都沒動 → 不問', modal==='');

  boot();
  await E.bkOfferSeriesMove(Object.assign(anchor(),{member_id:null}),'2026-10-15','19:00','2026-10-13','19:00');
  ok('　 無主的卡（純體驗未留檔）不處理', modal==='');

  ok('★ 呼叫端的條件已放寬（不再是 od===nd && ot!==nt）',
     /if\(od!==nd \|\| ot!==nt\)\{ try\{ await bkOfferSeriesMove\(b, od, ot, nd, nt\); \}/.test(src)
     && !/if\(od===nd && ot!==nt\)/.test(src));
  ok('　 原因與使用者原話寫在原地',
     /教練 zoe 反應　他在調整客人黃柏桓的課程/.test(src)
     && /\*\*只要日期動了\s*\n\s*就完全不問\*\*/.test(src));
}

console.log('\n② 挑出來的是哪幾堂');
{
  boot(); moveAnchor('2026-10-13','19:00');
  await E.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-13','19:00');
  eq('★★ 只掃同會員／同教練／同課種／同星期／同原時間、且在這堂之後的 booked',
     E.W._smSeries.ids, ['B2','B3','B4','B5']);
  ok('　 別的星期／別的會員／已取消的都沒有被掃進來',
     !E.W._smSeries.ids.some(id=>['X1','Y1','Z1'].includes(id)));
  ok('★★ 比對用的是「原本的位置」od，不是已經被改掉的 b.date',
     /&&memKey\(x\)===memKey\(b\)&&x\.date>od/.test(src)
     && /呼叫端已經先把這一堂\s*\n\s*寫進資料庫了，b\.date 已經是新日期/.test(src));
  ok('　 錨點自己不會被掃進來', !E.W._smSeries.ids.includes('B1'));
}

console.log('\n③ 視窗要看得到「原本 → 改成」');
{
  boot(); moveAnchor('2026-10-13','19:00');
  await E.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-13','19:00');
  ok('★★ 逐堂寫出位移後的日期（整串挪日期最容易挪錯）',
     /10\/22 → <b>10\/20<\/b>/.test(modal) && /11\/12 → <b>11\/10<\/b>/.test(modal));
  ok('★ 新的星期與時間寫在按鈕上方，不必自己推',
     /要一起改成 <b>每週二 19:00<\/b>/.test(modal));
  ok('★ 跳過的條件先講清楚', /衝堂、場地已滿或會挪到過去的那幾堂會自動跳過並列出來/.test(modal));
  ok('　 兩顆鈕：只改這一堂／後續 N 堂一起改',
     /只改這一堂<\/button>/.test(modal) && /後續 4 堂一起改<\/button>/.test(modal));

  /* 黃柏桓的真實量級（12 堂待簽約）不能把視窗撐爆 */
  boot();
  for(let i=0;i<12;i++) DB.push({id:'L'+i,member_id:'M1',coach_id:'C1',category:'私人教練',
    date:ymdOf(2026,11,19+i*7),start_time:'19:00',status:'booked',duration:60});
  moveAnchor('2026-10-13','19:00');
  await E.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-13','19:00');
  ok('★ 16 堂只列前 8 堂並收尾', /…等 16 堂/.test(modal)
     && (modal.match(/→ <b>/g)||[]).length===8, (modal.match(/→ <b>/g)||[]).length);
}

console.log('\n④ 真的改下去');
{
  boot(); await run('2026-10-13','19:00');
  eq('★★ 整串往前 2 天（週四→週二）、時間不變',
     dates(), ['2026-10-13 19:00','2026-10-20 19:00','2026-10-27 19:00','2026-11-03 19:00','2026-11-10 19:00']);

  boot(); await run('2026-10-15','14:00');
  eq('★ 只改時間時日期原封不動',
     dates(), ['2026-10-15 14:00','2026-10-22 14:00','2026-10-29 14:00','2026-11-05 14:00','2026-11-12 14:00']);

  boot(); await run('2026-10-13','19:00');
  eq('　 別的系列與別人的課完全沒被碰到',
     ['X1','Y1','Z1'].map(id=>DB.find(x=>x.id===id).date), ['2026-11-03','2026-10-22','2026-11-19']);
}

console.log('\n⑤ 整串自己撞自己：往後挪要倒著改');
{
  /* 每週同一時段，往後 7 天正好是下一堂現在的位置。
     這一串中間有一堂取消了，所以錨點挪得過去（線上 validateBooking 會先擋不過去的）；
     剩下的 10/29→11/05、11/05→11/12 就會層層相撞。
     照順序改：10/29 撞到還坐在 11/05 的那一堂 → 只有最後一堂成功。 */
  boot(); VERR=CLASH;
  DB.find(x=>x.id==='B2').status='cancelled';
  await run('2026-10-22','19:00');
  eq('★★ 往後挪一週：三堂全部成功（倒著改）',
     ['B1','B3','B4','B5'].map(id=>DB.find(x=>x.id===id).date),
     ['2026-10-22','2026-11-05','2026-11-12','2026-11-19']);
  ok('　 toast 說改了 3 堂、沒有失敗', /^已改 3 堂（整串平移）到 19:00$/.test(toasts.pop()), toasts);

  boot(); VERR=CLASH;
  await run('2026-10-08','19:00');
  eq('★★ 往前挪一週：四堂全部成功（照順序改）',
     dates(), ['2026-10-08 19:00','2026-10-15 19:00','2026-10-22 19:00','2026-10-29 19:00','2026-11-05 19:00']);
  ok('★ 順序的理由寫在原地', /往後挪要從最後一堂開始改/.test(src)
     && /整串只成功最後一堂/.test(src));
}

console.log('\n⑥ 排不進去的要跳過並講原因（不整批失敗）');
{
  boot(); VERR=(x,d)=>d==='2026-10-27'?'場地已滿':'';
  await run('2026-10-13','19:00');
  eq('★★ 排不進的那一堂原地不動，其他照改',
     dates(), ['2026-10-13 19:00','2026-10-20 19:00','2026-10-29 19:00','2026-11-03 19:00','2026-11-10 19:00']);
  ok('★★ toast 列出未改的日期與原因',
     /^已改 3 堂（整串平移）到 19:00；1 堂未改：10\/29（場地已滿）$/.test(toasts.pop()));

  /* 會挪到過去的先自己擋下來（另開一個「今天」比較晚的沙箱才碰得到：
     錨點本身不能改到過去，所以線上只有錨點在今天附近時才可能發生） */
  boot();
  const E2=mkEnv(new Date(2026,9,25));           // 今天＝2026-10-25
  moveAnchor('2026-10-14','19:00');
  await E2.bkOfferSeriesMove(anchor(),'2026-10-15','19:00','2026-10-14','19:00');
  await E2._bkDoSeriesMove();
  ok('★★ 會挪到今天之前的那一堂 → 明講「會挪到過去」並跳過',
     /1 堂未改：10\/22（會挪到過去）/.test(toasts[toasts.length-1]), toasts[toasts.length-1]);
  ok('　 沒有任何一堂被寫成過去的日期', dates().every(s=>s.slice(0,10)>='2026-10-14'), dates());
}

console.log('\n⑦ 桌機拖曳課卡：畫面要即時更新');
{
  /* 使用者原話：「在桌機行事曆拉動課卡改時間的時候　畫面不會即時更新　都要按重整才會看到」
     真因：_calDataCache 是 renderCalendar 上一次渲染另外留的一份陣列
     （dbGetAll 回的是 hit.data.slice()），dbCacheApply 只換掉 _dbCache 裡的那一顆。 */
  const SNAP=grabLine('const CALSNAP_FIELD=')+'\n'+grabFn('calSnapApply')+'\nreturn calSnapApply;';
  const W2={_calDataCache:{bookings:[{id:'B1',date:'2026-10-15'},{id:'B2',date:'2026-10-22'}],
    allTickets:[{id:'T1',sessions_remaining:3}], members:[], coaches:[], types:[], _t:1}};
  const fn=new Function('window', SNAP)(W2);
  fn('bookings',{id:'B1',date:'2026-10-20'});
  eq('★★ 改到的那一列就地換掉（拖曳後卡片才會畫在新位置）',
     W2._calDataCache.bookings.find(x=>x.id==='B1').date, '2026-10-20');
  fn('bookings',{id:'B9',date:'2026-12-01'});
  eq('★ 新建的會補進去', W2._calDataCache.bookings.length, 3);
  fn('bookings',{id:'B9'},true);
  eq('★ 刪掉的會拿掉', W2._calDataCache.bookings.length, 2);
  fn('member_tickets',{id:'T1',sessions_remaining:2});
  eq('★ 票券對到 allTickets（快照的欄位名跟表名不同）',
     W2._calDataCache.allTickets[0].sessions_remaining, 2);
  const before=JSON.stringify(W2._calDataCache);
  fn('purchases',{id:'P1'}); fn('bookings',null); fn('bookings',{});
  eq('　 沒對應欄位／沒有 id 的一律不動', JSON.stringify(W2._calDataCache), before);
  new Function('window', SNAP)({})('bookings',{id:'B1'});
  ok('　 還沒渲染過（沒有快照）也不能爆', true);

  ok('★★ 補在 dbCacheApply 裡（每一次寫入都會經過），十幾個呼叫端一個都不必改',
     /try\{ calSnapApply\(key,row,del\); \}catch\(_\)\{\}\s+\/\/ 見上：翻頁快照與 _dbCache 是兩份/.test(src));
  ok('★ 兩份快取為什麼會不同步寫在原地',
     /dbGetAll 回的是 `hit\.data\.slice\(\)`（陣列淺拷貝）/.test(src)
     && /是把元素\*\*換成新物件\*\*，舊陣列裡指的還是改動前那一顆/.test(src));
  ok('　 使用者原話與症狀寫在原地',
     /在桌機行事曆拉動課卡改時間的時候　畫面不會即時更新　都要按重整才會看到/.test(src)
     && /卡片畫回原位，看起來像沒存到，非得重整/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });

function ymdOf(y,m,d){ const x=new Date(y,m-1,d);
  return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
