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
  'grpSeatAttCount','grpSeatLeaveCount','grpHeadsNoLeave','allocBookingsToTickets','grpTicketAlloc','buildWallet'];
const box=new Function('ymd','TODAY','parseYmd','attObj',
  FNS.map(grabFn).join('\n')+'\nreturn {buildWallet,grpHeadsNoLeave,grpSeatLeaveCount};')(ymd,TODAY,parseYmd,attObj);

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
    grpSeatLeaveCount:box.grpSeatLeaveCount,
  };
  const TT=new Function(...Object.keys(deps),'return '+grabFn('ticketTokens'))(...Object.values(deps));
  const t4=of('T4');
  const h=TT(TK4, t4.stamps, TYPES, t4.used, 'B0808', ME, null);
  eq('★ 四格全滿（沒有空心、沒有超約圈）',
     [(h.match(/mtk-used/g)||[]).length,(h.match(/mtk-free/g)||[]).length,(h.match(/mtk-over/g)||[]).length], [4,0,0]);
  eq('★ 只有請假那一格是紅的', (h.match(/mtk-leave/g)||[]).length, 1);
  ok('★ 紅的那一格是 8/8，滑鼠提示講清楚照扣＋補課券',
     /mtk-used mtk-leave[^>]*title="請假（本堂照扣，另發補課券） 2026-08-08/.test(h) && /8\/8/.test(h));
  ok('　　CSS 有把它畫成實心紅', /\.mtk-used\.mtk-leave\{background:var\(--danger,#b5372e\);color:#fff;\}/.test(src));
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

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
