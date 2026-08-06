/* 2026-08-06 使用者定案（李曉娟 8/8 請假 → 8/15 補課）：

   「團課的請假，對會員來說算一堂簽到，所以圓形卡要填滿用紅色標示，另外再給一堂補課，
     只是這堂請假不能算該堂教練的人次。然後客人再次用補課券補課就只要顯示補課的這一張就好。」

   在此之前：
   ・buildWallet 的 isAtt 只認 checked_in → 請假那一格掉回「待上」，票明明扣滿了，
     四堂票卻只算 3 堂已用 → 第 4 格空著，補課那堂被畫進去（使用者看到的「8/15 用了第 4 格」）。
   ・團課名單的「含補課券」標籤是看「這位會員手上有沒有補課券」，不是看這一格用的是哪一張。
   ・教練人次直接數 member_ids 長度，請假的人也算進教練成績。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const TODAY=new Date(2026,7,6);            // 2026-08-06（週四）
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const attObj=b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};};
globalThis.attObj=attObj;

const FNS=['mids','bkHasMember','tkSharedIds','tkUsableBy','tkClass5','bkIsGroup','seatKeys','seatMid','seatNo',
  'bkEatenCancel','grpSeatAttCount','grpSeatLeaveCount','grpHeadsNoLeave','allocBookingsToTickets','grpTicketAlloc','buildWallet'];
/* bkIsGroup 會問「這個口袋是不是共用預約」（bkPocketNow）—— 測試資料都是舊制課別，替身回空 */
const box=new Function('ymd','TODAY','parseYmd','attObj','bkPocketNow',
  FNS.map(grabFn).join('\n')+'\nreturn {buildWallet,grpHeadsNoLeave,grpSeatLeaveCount,bkEatenCancel};')(ymd,TODAY,parseYmd,attObj,()=>({}));

const ME='M-LXJ';
const TYPES={'tt-g':{id:'tt-g',name:'團體課',category:'小班肌力'}};
/* 李曉娟的實況：6/27 買的 4 堂團體課票（已扣滿），7/18・7/27・8/02 已上，8/08 請假；
   8/08 請假當下發一張補課券，8/15 用那張補課券補課（扣課紀錄綁在補課券上）。 */
const TK4={id:'T4',member_id:ME,ticket_type_id:'tt-g',plan_name:'團體課',source:'purchase',
  purchase_date:'2026-06-27',start_date:'2026-06-27',expire_date:'2026-08-08',
  sessions_total:4,sessions_remaining:0,status:'usable'};
const MK={id:'TMK',member_id:ME,ticket_type_id:'tt-g',plan_name:'團體課・補課券',source:'makeup',
  purchase_date:'2026-08-06',start_date:'2026-08-06',expire_date:'2026-08-22',
  sessions_total:1,sessions_remaining:0,status:'usable',makeup_for_booking:'B0808'};
const G=(id,date,att)=>({id,date,start_time:'11:00',status:'checked_in',category:'小班肌力',
  ticket_type_id:'tt-g',member_id:null,member_ids:[ME,'M-OTHER'],attendance:att});
const BKS=[
  G('B0718','2026-07-18',{[ME]:'checked_in','M-OTHER':'checked_in'}),
  G('B0727','2026-07-27',{[ME]:'checked_in','M-OTHER':'checked_in'}),
  G('B0802','2026-08-02',{[ME]:'checked_in','M-OTHER':'checked_in'}),
  Object.assign(G('B0808','2026-08-08',{[ME]:'leave'}),{status:'booked'}),
  Object.assign(G('B0815','2026-08-15',{}),{status:'booked'}),
];
const dd=(tid,bid)=>({id:'L'+bid+tid,ticket_id:tid,booking_id:bid,action:'deduct'});
const LOGS=[dd('T4','B0718'),dd('T4','B0727'),dd('T4','B0802'),dd('T4','B0808'),dd('TMK','B0815')];
const W=box.buildWallet(ME,{tickets:[TK4,MK],bookings:BKS,logs:LOGS,typeMap:TYPES});
const of=id=>W.slots.find(s=>s.id===id);

console.log('① 請假算一堂已使用（票就用畢了，補課那堂不會佔原票的格子）');
{
  const t4=of('T4');
  eq('★ 4 堂票：已用 4（含 8/08 請假）、待上 0', [t4.used,t4.pending], [4,0]);
  eq('★ 戳記就是那四堂（8/15 不在裡面）', t4.stamps.map(b=>b.date),
     ['2026-07-18','2026-07-27','2026-08-02','2026-08-08']);
  eq('★ 8/15 掛在補課券上', (W.seatOf('B0815',1)||{}).id, 'TMK');
  eq('　　8/08 掛在原票券上', (W.seatOf('B0808',1)||{}).id, 'T4');
  eq('★ 沒有「沒票可蓋」的紅虛線（不會再出現奇怪的超約）', W.leftover.map(b=>b.id), []);
  ok('★ 票券還沒進歷史（最後一堂 8/08 還沒到，櫃檯仍看得到）', t4.state==='active', t4.state);
}

console.log('\n② 圓形卡：請假那一格填滿、紅色');
{
  const deps={
    tkVisual:()=>({accent:'#1f6f54'}), bkIsSelf:()=>false, bkIsGroup:b=>b.category==='小班肌力',
    parseYmd, bkSelfBooked:()=>false, selfVenueLabel:()=>'', attObj,
    seatKeys:b=>{const c={};return (b.member_ids||[]).map(id=>{c[id]=(c[id]||0)+1;return c[id]>1?id+'#'+c[id]:id;});},
    seatMid:k=>{const s=String(k),i=s.indexOf('#');return i<0?s:s.slice(0,i);},
    grpSeatAttCount:box.buildWallet && ((b,mid)=>{const a=attObj(b);return (b.member_ids||[]).filter((x,i)=>String(x)===String(mid)&&a[x]==='checked_in').length;}),
    grpSeatLeaveCount:box.grpSeatLeaveCount, bkEatenCancel:box.bkEatenCancel,
  };
  const TT=new Function(...Object.keys(deps),'return '+grabFn('ticketTokens'))(...Object.values(deps));
  const t4=of('T4');
  const h=TT(TK4, t4.stamps, TYPES, t4.used, 'B0808', ME, null);
  eq('★ 四格全滿（沒有空心、沒有超約圈）',
     [(h.match(/mtk-used/g)||[]).length,(h.match(/mtk-free/g)||[]).length,(h.match(/mtk-over/g)||[]).length], [4,0,0]);
  eq('★ 只有請假那一格是紅的', (h.match(/mtk-leave/g)||[]).length, 1);
  /* 2026-08-06 使用者回報：「這種先請假的票券是故意放在第一顆嗎」——
     先請假的課可能在未來（8/22 請假、8/8 還沒上），原本「已用排前面」會把它推到第一顆。
     改成整串照上課日期排。 */
  eq('★ 圓點照日期排（請假那顆在它自己的位置，不會被推到第一顆）',
     (h.match(/>(\d+\/\d+)</g)||[]).map(x=>x.slice(1,-1)),
     ['7/18','7/27','8/2','8/8']);
  ok('★ 紅的那一格是 8/8，滑鼠提示講清楚照扣＋補課券',
     /mtk-used mtk-leave[^>]*title="請假（本堂照扣，另發補課券） 2026-08-08/.test(h) && /8\/8/.test(h));
  /* 使用者截圖的實況：8/22 先請假（已用 1/4），8/8・8/15・8/29 都還沒上 */
  {
    const G2=(id,date,att)=>({id,date,start_time:'11:00',status:att?'booked':'booked',category:'小班肌力',
      ticket_type_id:'tt-g',member_id:null,member_ids:[ME],attendance:att?{[ME]:att}:{}});
    const st=[G2('x1','2026-08-08'),G2('x2','2026-08-15'),G2('x3','2026-08-22','leave'),G2('x4','2026-08-29')];
    const h2=TT({id:'T-4W',member_id:ME,ticket_type_id:'tt-g',plan_name:'團課 4週優惠',sessions_total:4},
      st, TYPES, 1, null, ME, null);
    const seq=(h2.match(/>(\d+\/\d+)</g)||[]).map(x=>x.slice(1,-1));
    eq('★★ 4 週票：8/22 請假、其餘未上 → 圓點仍是 8/8 8/15 8/22 8/29', seq, ['8/8','8/15','8/22','8/29']);
    ok('★★ 紅的那顆排在第 3 顆（不是被推到第一顆）',
       /8\/15<\/span><span class="mtk mtk-used mtk-leave/.test(h2.replace(/\s+/g,' ')), h2.slice(0,400));
  }
  ok('　　CSS 有把它畫成實心紅（與「取消未退」共用同一條）',
     /\.mtk-used\.mtk-leave,\.mtk-used\.mtk-eaten\{background:var\(--danger,#b5372e\);color:#fff;\}/.test(src));
}

console.log('\n③ 教練人次：請假不算');
{
  const f=box.grpHeadsNoLeave;
  eq('★ 兩個名額、一個請假 → 算 1',
     f({member_ids:['A','B'],attendance:{A:'checked_in',B:'leave'}}), 1);
  eq('★ 全部請假 → 0（這堂不算教練成績）',
     f({member_ids:['A','B'],attendance:{A:'leave',B:'leave'}}), 0);
  eq('　　沒人請假 → 照舊算滿', f({member_ids:['A','B'],attendance:{}}), 2);
  eq('　　同一人兩個名額、只請假一個 → 算 1',
     f({member_ids:['A','A'],attendance:{A:'checked_in','A#2':'leave'}}), 1);
  eq('　　舊匯入（沒有名單、學員在 member_id）→ 維持 1', f({member_ids:[],member_id:'A',attendance:{}}), 1);
  ok('★ 月報表、營運分析、教練排行、首頁成績卡都改吃這一支',
     (src.match(/grpHeadsNoLeave\(b\)/g)||[]).length>=4
     && /if\(bkIsGroup\(b\)\) c\.grp\+=grpHeadsNoLeave\(b\);/.test(src));
  ok('　　薪資本來就只算已簽到（grpAttendHeads），不受影響',
     /function grpAttendHeads\(b\)\{[\s\S]*?att\[k\]==='checked_in'/.test(src));
  ok('　　銷課金額仍含請假那堂（票照扣、錢實現了，只是不算人次）',
     /人次不含請假（2026-08-06 使用者定案），但銷課金額含/.test(src));
}

console.log('\n④ 補課券只標在真的用到它的那一格');
{
  ok('★ 標籤看這一格的票券來源，不是「這個人有沒有補課券」',
     /\$\{\(_sl\.t&&_sl\.t\.source==='makeup'\)\?'<span class="tag"[^>]*>補課券<\/span>':''\}/.test(src)
     && !/makeup: W\.active\('group'\)\.some/.test(src));
  ok('★ 猜不到歸屬時的退路不挑補課券',
     /const _fbPick=arr=>\(arr\|\|\[\]\)\.find\(x=>x&&x\.t&&x\.t\.source!=='makeup'\)\|\|\(arr\|\|\[\]\)\[0\];/.test(src));
}

console.log('\n⑤ 整堂取消時收回這堂發過的補課券（李曉娟當天多出一張沒人管的券）');
/* 櫃檯先在 8/8 標請假（發券），再把整筆預約取消、改建一筆新的又標一次請假 →
   同一堂課手上兩張補課券。取消＝這堂不成立，請假的前提也沒了。 */
ok('★ 取消流程會收回這堂的補課券（含第 2 個以後的名額鍵 id#N）',
   /async function revokeMakeupOnCancel\(booking\)\{/.test(src)
   && /String\(t\.makeup_for_booking\)===pre \|\| String\(t\.makeup_for_booking\)\.indexOf\(pre\+'#'\)===0/.test(src)
   && /const _mkRv=await revokeMakeupOnCancel\(b\);/.test(src));
ok('★ 用過的不收（與贈點回收同一套保守原則）',
   /if\(\(t\.sessions_total\|\|0\)-\(t\.sessions_remaining\|\|0\)>0\) continue;   \/\/ 已用過→保留\n\s*await dbDel\('member_tickets',t\.id\);\n\s*try\{ await logTicket\(t\.id,'revoke',0,booking\.id,SESSION\.id,'整堂取消，收回未使用的補課券'\)/.test(src));
ok('　　收了幾張會寫進 Toast（櫃檯看得到）', /const _mkt=_mkRv\?`，並收回未使用的補課券 \$\{_mkRv\} 張`:'';/.test(src));

console.log('\n⑥ 取消但「扣課不退」的那一堂要看得到（2026-08-06 黃品華案例）');
/* 使用者：「這一個勾是今天 8/6 請假取消的，教練最後選到扣課，所以才出現的」——
   票被吃掉了但預約已取消 → 原本不進戳記，圓形卡就多出一顆沒有日期的「✓」。 */
{
  const ME2='M-HPH';
  const T8={id:'T8',member_id:ME2,ticket_type_id:'tt-g',plan_name:'私人教練課 1V1',source:'purchase',
    purchase_date:'2026-06-18',start_date:'2026-06-18',sessions_total:8,sessions_remaining:0,status:'usable'};
  const P=(id,date,status,o)=>Object.assign({id,date,start_time:'15:00',status,category:'私人教練',
    ticket_type_id:'tt-g',member_id:ME2,member_ids:[],attendance:{},ticket_id:'T8'},o||{});
  const bks=[P('a','2026-06-18','completed'),P('b','2026-06-25','completed'),
    P('c','2026-07-16','checked_in'),
    P('d','2026-07-23','cancelled',{ticket_id:null,refund_waived:true}),   // 事後補退：不算用掉
    P('e','2026-07-30','checked_in'),
    P('f','2026-08-06','cancelled',{refund_waived:true}),                   // 取消時選了扣課不退
    P('g','2026-08-13','booked'),P('h','2026-08-20','booked'),P('i','2026-08-27','booked')];
  const lg=[{id:'x1',ticket_id:'T8',booking_id:'d',action:'refund'},
    {id:'x2',ticket_id:'T8',booking_id:'e',action:'deduct'},{id:'x3',ticket_id:'T8',booking_id:'f',action:'deduct'},
    {id:'x4',ticket_id:'T8',booking_id:'g',action:'deduct'},{id:'x5',ticket_id:'T8',booking_id:'h',action:'deduct'},
    {id:'x6',ticket_id:'T8',booking_id:'i',action:'deduct'}];
  const W2=box.buildWallet(ME2,{tickets:[T8],bookings:bks,logs:lg,typeMap:TYPES});
  const s8=W2.slots.find(x=>x.id==='T8');
  eq('★ 8 堂票：已用 5（含 8/6 取消未退）、待上 3', [s8.used,s8.pending], [5,3]);
  ok('★ 8/6 那一堂有戳記（不再是沒有日期的 ✓）', s8.stamps.some(b=>b.date==='2026-08-06'));
  ok('★ 7/23 事後被補退的不算用掉（refund_waived 旗標還在，但帳本已退）',
     !s8.stamps.some(b=>b.date==='2026-07-23'));
  ok('★ 判定看帳本淨扣，不只看旗標',
     /const _eaten=b=>bkEatenCancel\(b\) && \(_netChg\[b\.id\]\|\|0\)>0;/.test(src));
  ok('★ 圓形卡把它畫成紅色（與請假同一個語彙）',
     /const lvc=\(b&&b\._leave\)\?' mtk-leave':\(\(b&&b\._eaten\)\?' mtk-eaten':''\);/.test(src)
     && /\.mtk-used\.mtk-leave,\.mtk-used\.mtk-eaten\{background:var\(--danger,#b5372e\);color:#fff;\}/.test(src));
  ok('　　滑鼠提示說得出原因', /取消未退（取消時選了扣課不退）/.test(src));
  ok('　　會員列表的預約索引也收進來（否則列表頁的圓點又會少一顆）',
     /if\(!b \|\| \(b\.status==='cancelled' && !bkEatenCancel\(b\)\)\) return;/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
