/* 票券共享：從 index.html 抽出真正的 tkSharedIds / tkParticipants / tkUsableBy
   與 listUsableTickets / findRefundTargetTicket 的挑票條件，用舊系統真實案例驗證。 */
const fs=require('fs');
const h=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const grabFn=n=>{let i=h.indexOf('function '+n+'(');if(i<0)throw new Error('找不到 '+n);
  if(h.slice(i-6,i)==='async ')i-=6;let d=0;
  for(let k=h.indexOf('{',i);k<h.length;k++){if(h[k]==='{')d++;else if(h[k]==='}'){d--;if(!d)return h.slice(i,k+1);}}};

const COURSE_SHAPE={}, parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
globalThis.window={};
const api=new Function('COURSE_SHAPE','parseYmd',
  [grabFn('tkSharedIds'),grabFn('tkParticipants'),grabFn('tkUsableBy'),
   grabFn('ticketCategoryOf'),grabFn('ticketMatchesCategory'),grabFn('bkTicketTypeOk'),
   grabFn('categoryOfTypeId'),grabFn('findRefundTargetTicket'),grabFn('allocBookingsToTickets')].join('\n')
  +'; return {tkSharedIds,tkParticipants,tkUsableBy,findRefundTargetTicket,allocBookingsToTickets};')(COURSE_SHAPE,parseYmd);
const {tkSharedIds,tkParticipants,tkUsableBy,findRefundTargetTicket,allocBookingsToTickets}=api;

// listUsableTickets 的篩選條件（原始碼裡的那段 filter，逐字抽出來跑）
const lu=h.slice(h.indexOf('async function listUsableTickets('));
const filtSrc=lu.slice(lu.indexOf('return all.filter(t=>{'), lu.indexOf(".sort((a,b)=>(a.expire_date||'')"));
const mkUsable=new Function('all','member_id','type_id','bookDate','wantCat','groupMode',
  'ticketCategoryOf','bkTicketTypeOk','tkUsableBy',
  filtSrc+';');   // filtSrc 已含完整的 all.filter(...)，只補分號

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('共享欄位解析');
ok('null → 空陣列',        tkSharedIds({shared_with:null}).length===0);
ok('陣列直接用',            JSON.stringify(tkSharedIds({shared_with:['A','B']}))==='["A","B"]');
ok('字串 JSON 也吃',        JSON.stringify(tkSharedIds({shared_with:'["A"]'}))==='["A"]');
ok('壞字串不炸',            tkSharedIds({shared_with:'not json'}).length===0);
ok('過濾空值',              JSON.stringify(tkSharedIds({shared_with:['A',null,'']}))==='["A"]');
ok('參與者含持有人且排第一', JSON.stringify(tkParticipants({member_id:'O',shared_with:['S1','S2']}))==='["O","S1","S2"]');
ok('持有人重複列入會去掉',   JSON.stringify(tkParticipants({member_id:'O',shared_with:['O','S1']}))==='["O","S1"]');

console.log('可用者判定');
const T={id:'TK1',member_id:'O',shared_with:['S1']};
ok('持有人可用',   tkUsableBy(T,'O')===true);
ok('共享者可用',   tkUsableBy(T,'S1')===true);
ok('第三人不可用', tkUsableBy(T,'X')===false);
ok('沒共享時只有持有人', tkUsableBy({member_id:'O'},'S1')===false);
ok('空 member_id 不誤判', tkUsableBy(T,null)===false);

/* ── 舊系統真實案例：許朱同（持有人）買 限定教練課1V2 10 堂，
      共享者陳蘭馨實際使用全部 10 堂；持有人自己 0 筆預約。 ── */
console.log('真實案例：許朱同 → 陳蘭馨（限定教練課1V2 10 堂）');
const TT={'tt-pt':{id:'tt-pt',name:'教練課',category:'私人教練'}};
const SHARED={id:'TK-XU',member_id:'XU',shared_with:['LAN'],ticket_type_id:'tt-pt',format:'1V2',
  sessions_total:10,sessions_remaining:4,status:'usable',expire_date:'2026-07-26',start_date:'2026-05-18'};
const all=[SHARED];
const usableFor=(mid)=>mkUsable(all,mid,'tt-pt','2026-07-01','私人教練',false,
  ()=>'私人教練',(t,id)=>t.ticket_type_id===id,tkUsableBy);
ok('陳蘭馨預約時挑得到這張共享票', usableFor('LAN').length===1);
ok('許朱同本人也挑得到',            usableFor('XU').length===1);
ok('無關會員挑不到',                usableFor('OTHER').length===0);
ok('過期後誰都挑不到', mkUsable(all,'LAN','tt-pt','2026-07-27','私人教練',false,
    ()=>'私人教練',(t,id)=>t.ticket_type_id===id,tkUsableBy).length===0);
ok('堂數用完挑不到', mkUsable([Object.assign({},SHARED,{sessions_remaining:0})],'LAN','tt-pt','2026-07-01',
    '私人教練',false,()=>'私人教練',(t,id)=>t.ticket_type_id===id,tkUsableBy).length===0);

console.log('取消退堂也認共享');
ok('共享者取消 → 退回持有人那張票',
   (findRefundTargetTicket(all,'LAN','tt-pt','私人教練','1V2')||{}).id==='TK-XU');
ok('持有人取消 → 同一張',
   (findRefundTargetTicket(all,'XU','tt-pt','私人教練','1V2')||{}).id==='TK-XU');
ok('第三人取消 → 找不到（不會誤退別人的票）',
   findRefundTargetTicket(all,'X','tt-pt','私人教練','1V2')===null);

console.log('已用堂數：共享者的課要算進來');
const BK=(id,mid,d,st)=>({id,member_id:mid,date:d,start_time:'10:00',ticket_type_id:'tt-pt',format:'1V2',status:st});
const lanBks=[BK('b1','LAN','2026-05-18','completed'),BK('b2','LAN','2026-05-25','completed'),
              BK('b3','LAN','2026-06-01','completed'),BK('b4','LAN','2026-07-27','booked')];
const a=allocBookingsToTickets([SHARED],lanBks,TT);
ok('4 筆全部分配到這張共享票', (a.inferred['TK-XU']||[]).length===4);
ok('已上課 3 堂', (a.inferred['TK-XU']||[]).filter(x=>x.status==='completed').length===3);
ok('7/27 那堂仍屬這張票', a.byBooking['b4']==='TK-XU');
// 若只看持有人自己的預約（0 筆），已用堂數會是 0 —— 這正是修正前的錯誤
const aOwnerOnly=allocBookingsToTickets([SHARED],[],TT);
ok('只看持有人會算成 0 堂（故必須併入共享者的課）', (aOwnerOnly.inferred['TK-XU']||[]).length===0);

console.log('共享不影響一般票券');
const PLAIN={id:'TK-P',member_id:'M',ticket_type_id:'tt-pt',format:'1V2',sessions_total:2,
  sessions_remaining:2,status:'usable',expire_date:null};
ok('沒 shared_with 的票行為不變', tkUsableBy(PLAIN,'M')===true && tkUsableBy(PLAIN,'LAN')===false);
ok('參與者只有自己', JSON.stringify(tkParticipants(PLAIN))==='["M"]');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
