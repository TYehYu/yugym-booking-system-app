/* 2026-08-07 使用者回報（張家華 8/03 團課）：

   「張家華這一堂請假的圓形卡 應該要是紅色」

   8/03 那堂他佔兩個名額：第 1 個名額已簽到、第 2 個名額請假，兩個名額扣在不同張票上
   （#15 與 #16）。請假要畫成紅色實心（2026-08-06 定案：本堂照扣、另發補課券），
   但 #16 那張的 8/03 圓點畫成一般的「已完成」。

   原因：圓點是一張票一張票畫的，判斷只有「這位會員在這堂課簽到幾個、請假幾個」，
   畫到第二張票時計數又從頭來一次（已簽到的先發），於是兩張票都拿到「已簽到」。
   修法：戳記蓋上名額鍵（grpTicketAlloc），圓點直接讀那個名額自己的出缺席。 */
const fs=require('fs');
require('./_bkenv.js');   // 教練請假退堂那條判準（0830 收斂成一支，見 _bkenv.js）
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const TODAY=new Date(2026,7,7);            // 2026-08-07
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const attObj=b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};};

/* 2026-08-08：逐名額的判定抽成 grpSeatMark（見 seatmarktest），沙箱要一起帶進來 */
const FNS=['mids','seatKeys','seatMid','bkIsGroup','bkEatenCancel','grpSeatMark','grpSeatAttCount','grpSeatLeaveCount',
  'grpTicketAlloc','ticketTokens'];
const box=new Function('ymd','TODAY','parseYmd','attObj','bkPocketNow','bkIsSelf','bkSelfBooked','selfVenueLabel','tkVisual',
  FNS.map(grabFn).join('\n')+'\nreturn {ticketTokens,grpTicketAlloc};')(
  ymd,TODAY,parseYmd,attObj,()=>({}),()=>false,()=>false,()=>'',()=>({accent:'#9a5a1e'}));

const ME='M-ZJH';
const TYPES={'tt-g':{id:'tt-g',name:'團體課',category:'小班肌力'}};
/* 兩張「團課 4 週優惠」：第 1 個名額扣 #15、第 2 個名額扣 #16（課卡上逐名額記著） */
const T15={id:'T15',member_id:ME,ticket_type_id:'tt-g',plan_name:'團課 4週優惠',
  purchase_date:'2026-07-27',sessions_total:4,sessions_remaining:3,status:'usable'};
const T16={id:'T16',member_id:ME,ticket_type_id:'tt-g',plan_name:'團課 4週優惠',
  purchase_date:'2026-07-27',sessions_total:4,sessions_remaining:3,status:'usable'};
const B0803={id:'B0803',date:'2026-08-03',start_time:'19:00',status:'checked_in',category:'小班肌力',
  ticket_type_id:'tt-g',member_id:null,member_ids:['M-LFJ',ME,ME],
  attendance:{'M-LFJ':'checked_in',[ME]:'checked_in',[ME+'#2']:'leave'},
  seat_tickets:{[ME]:'T15',[ME+'#2']:'T16'}};
const dd=(tid)=>({id:'L'+tid,ticket_id:tid,booking_id:'B0803',action:'deduct'});
const LOGS=[dd('T15'),dd('T16')];

console.log('① 戳記帶著名額鍵（哪一顆圓點是哪一個名額）');
const ga=box.grpTicketAlloc([T15,T16],[B0803],LOGS,ME,()=>true);
{
  eq('★ #15 蓋的是第 1 個名額', (ga.byTicket['T15']||[]).map(b=>b._seat), [ME]);
  eq('★ #16 蓋的是第 2 個名額', (ga.byTicket['T16']||[]).map(b=>b._seat), [ME+'#2']);
  eq('　　戳記是副本，沒有動到原本的課卡', B0803._seat, undefined);
}

console.log('\n② 請假那一顆是紅色（mtk-leave）');
{
  const dots=t=>box.ticketTokens(t,(ga.byTicket[t.id]||[]),TYPES,1,null,ME,null);
  const d15=dots(T15), d16=dots(T16);
  ok('★ #15（已簽到）→ 實心、不是紅的', /mtk mtk-used/.test(d15) && !/mtk-leave/.test(d15));
  ok('★★ #16（請假）→ mtk-used mtk-leave（填滿紅色）', /mtk mtk-used mtk-leave/.test(d16));
  ok('　　滑過去看得到原因', /請假（本堂照扣，另發補課券）/.test(d16));
  ok('　　兩張都畫著 8/3 的日期', /8\/3/.test(d15) && /8\/3/.test(d16));
  ok('　　請假那一格算「已使用」，不是待上（不會變成空心已預約）', !/mtk-booked/.test(d16));
}

console.log('\n③ 不影響其他情況');
{
  /* 完全沒標出缺席的舊匯入團課：看整筆狀態（陳麗娟案例，別回頭壞掉） */
  const OLD={id:'BOLD',date:'2026-06-01',start_time:'11:00',status:'checked_in',category:'小班肌力',
    ticket_type_id:'tt-g',member_id:null,member_ids:[ME],attendance:{}};
  const ga2=box.grpTicketAlloc([T15],[OLD],[{id:'L9',ticket_id:'T15',booking_id:'BOLD',action:'deduct'}],ME,()=>true);
  const d=box.ticketTokens(T15,(ga2.byTicket['T15']||[]),TYPES,1,null,ME,null);
  ok('★ 沒標出缺席、整筆已簽到 → 仍畫成實心已完成', /mtk mtk-used/.test(d) && !/mtk-leave/.test(d));

  /* 只有一個名額、請假：原本就對，維持 */
  const ONE={id:'B1',date:'2026-08-10',start_time:'11:00',status:'booked',category:'小班肌力',
    ticket_type_id:'tt-g',member_id:null,member_ids:[ME],attendance:{[ME]:'leave'}};
  const ga3=box.grpTicketAlloc([T16],[ONE],[{id:'L8',ticket_id:'T16',booking_id:'B1',action:'deduct'}],ME,()=>true);
  const d3=box.ticketTokens(T16,(ga3.byTicket['T16']||[]),TYPES,1,null,ME,null);
  ok('★ 單名額請假照樣紅色', /mtk mtk-used mtk-leave/.test(d3));

  /* 沒有名額鍵的戳記（①直連、③推算那兩條路傳進來的是原始課卡）→ 回到原本的算法 */
  const raw=[Object.assign({},B0803)]; delete raw[0]._seat;
  const d4=box.ticketTokens(T15,raw,TYPES,1,null,ME,null);
  ok('★ 沒有名額鍵時維持原本的「已簽到的先發」', /mtk mtk-used/.test(d4) && !/mtk-leave/.test(d4));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
