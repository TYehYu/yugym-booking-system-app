/* 票券夾（2026-07-31 使用者定案）

   「每個會員都有一個票券夾，可以放很多種類；每一種票券拿出來在課卡戳記使用；
     每個頁面都從票券夾裡面找票券資料。」「不要多重存放紀錄。」

   在此之前，「這位會員有哪些票、每張票蓋了哪些課卡、還剩幾堂」被八個畫面各自重算，
   每一套推法都不一樣 → 同一個事實有八種答案。這支把它收成一份。

   戳記的紀錄不另存，依可信度取用既有的三個來源：
     ① bookings.ticket_id（單人課直連，帳本事實）
     ② ticket_logs 扣課紀錄（團課；一堂多人、各扣各的票）
     ③ 先進先出推算（舊系統匯入的預約①②都沒有） */
/* 2026-08-01：buildWallet 的推算改為「團課依名額展開」，用到共用的 bkIsGroup／mids —— 沙箱補上替身 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.mids=b=>(b&&Array.isArray(b.member_ids))?b.member_ids:[];
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const TODAY=new Date(2026,6,31);
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const attObj=b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};};

const buildWallet=new Function('ymd','TODAY','parseYmd','attObj',
  [grabFn('mids'),grabFn('bkHasMember'),grabFn('tkSharedIds'),grabFn('tkUsableBy'),grabFn('tkClass5'),
   grabFn('allocBookingsToTickets'),grabFn('grpTicketAlloc'),grabFn('buildWallet')].join('\n')
  +'\nreturn buildWallet;')(ymd,TODAY,parseYmd,attObj);

const ME='MEM-1';
const TYPES={ 'tt-pt':{id:'tt-pt',name:'教練課',category:'私人教練'},
              'tt-g':{id:'tt-g',name:'團體課',category:'小班肌力'},
              'tt-s':{id:'tt-s',name:'自主訓練',category:'自主訓練'} };
const TK=(id,o)=>Object.assign({id,member_id:ME,ticket_type_id:'tt-pt',plan_name:'教練課 10 堂',
  sessions_total:10,sessions_remaining:10,purchase_date:'2026-06-01',status:'usable'},o||{});
const BK=(id,date,o)=>Object.assign({id,date,start_time:'11:00',status:'booked',
  category:'私人教練',ticket_type_id:'tt-pt',member_id:ME},o||{});
const GBK=(id,date,o)=>Object.assign({id,date,start_time:'14:00',status:'booked',category:'小班肌力',
  ticket_type_id:'tt-g',member_id:null,member_ids:[ME,'MEM-9'],attendance:{}},o||{});
const W=(tickets,bookings,logs)=>buildWallet(ME,{tickets,bookings,logs:logs||[],typeMap:TYPES});

console.log('票券夾裝什麼');
{
  const w=W([TK('T1'),TK('T2',{ticket_type_id:'tt-g',plan_name:'團體課'}),
             TK('T3',{ticket_type_id:'tt-s',plan_name:'自主訓練'}),
             TK('T9',{member_id:'MEM-OTHER'})],[]);
  eq('★ 只裝這位會員能用的票（含共享，別人的不裝）', w.tickets.map(t=>t.id), ['T1','T2','T3']);
  eq('★ 票券依課別分類（教練課／團體課／自主訓練／運動按摩／折抵券）',
     w.slots.map(s=>s.cls), ['pt','group','self']);
  eq('　　可以只問某一個課別', w.inClass('group').map(s=>s.id), ['T2']);
}

console.log('\n① 單人課：預約直接綁票');
{
  const w=W([TK('T1',{sessions_total:4,sessions_remaining:2})],
    [BK('B1','2026-07-01',{status:'checked_in',ticket_id:'T1'}),
     BK('B2','2026-07-08',{status:'completed',ticket_id:'T1'}),
     BK('B3','2026-08-05',{ticket_id:'T1'}),
     BK('B4','2026-07-05',{status:'cancelled',ticket_id:'T1'})]);
  const s=w.of('T1');
  eq('★ 蓋在票上的課卡（取消的不算）', s.stamps.map(b=>b.id), ['B1','B2','B3']);
  eq('★ 已上 2 堂', s.used, 2);
  eq('★ 待上 1 堂（已預約還沒簽到）', s.pending, 1);
  eq('★ 還剩 1 堂', s.left, 1);
  eq('★ 這張課卡蓋在哪張票', w.ticketOf('B3').id, 'T1');
  eq('　　票券夾裡沒有這張課卡就回 null', w.ticketOf('B-NONE'), null);
}

console.log('\n② 團課：一堂多人、各扣各的票（不綁 ticket_id）');
{
  const tks=[TK('T4W',{ticket_type_id:'tt-g',plan_name:'團課 4週優惠',sessions_total:4,sessions_remaining:0,
    purchase_date:'2026-07-30',start_date:'2026-08-06',expire_date:'2026-09-03'}),
    TK('TMK',{ticket_type_id:'tt-g',plan_name:'團體課・補課券',sessions_total:1,sessions_remaining:0,
      purchase_date:'2026-07-31',status:'refunded'})];
  const bks=['2026-08-06','2026-08-13','2026-08-20','2026-08-27'].map((d,i)=>GBK('G'+i,d));
  const w=W(tks,bks,bks.map(b=>({ticket_id:'T4W',booking_id:b.id,action:'deduct'})));
  const s=w.of('T4W');
  eq('★ 四堂全蓋在四週票上', s.stamps.map(b=>b.date),
     ['2026-08-06','2026-08-13','2026-08-20','2026-08-27']);
  eq('★ 一堂都還沒簽到 → 已上 0', s.used, 0);
  eq('★ 待上 4 堂', s.pending, 4);
  eq('★ 還在持有中，不是歷史（陳暐濰案例）', s.state, 'active');
  eq('★ 補課券身上一堂都沒有', w.of('TMK').stamps.length, 0);
}
{
  /* 王雅雯：同日重複建立、已作廢的那張不該搶走待上堂數 */
  const tks=[TK('TLIVE',{ticket_type_id:'tt-g',plan_name:'團課',sessions_total:4,sessions_remaining:0,purchase_date:'2026-07-30'}),
             TK('TVOID',{ticket_type_id:'tt-g',plan_name:'團課',sessions_total:4,sessions_remaining:0,purchase_date:'2026-07-30',status:'refunded'})];
  const bks=['2026-08-06','2026-08-13','2026-08-20','2026-08-27'].map((d,i)=>GBK('G'+i,d));
  const w=W(tks,bks,bks.map(b=>({ticket_id:'TLIVE',booking_id:b.id,action:'deduct'})));
  eq('★ 待上算在還沒作廢的那張', w.of('TLIVE').pending, 4);
  eq('★ 作廢的那張是歷史', w.of('TVOID').state, 'history');
}

console.log('\n③ 舊系統匯入：兩者都沒有，只能推算');
{
  const w=W([TK('T1',{sessions_total:2,sessions_remaining:0,start_date:'2026-05-01'}),
             TK('T2',{sessions_total:2,sessions_remaining:0,start_date:'2026-07-01'})],
    ['2026-05-09','2026-05-17','2026-07-17','2026-07-25']
      .map((d,i)=>BK('H'+i,d,{status:'checked_in',ticket_id:null})));
  eq('★ 依起始日分配，5 月的課歸 5 月那張', w.stampsOf('T1').map(b=>b.date), ['2026-05-09','2026-05-17']);
  eq('★ 7 月的課歸 7 月那張', w.stampsOf('T2').map(b=>b.date), ['2026-07-17','2026-07-25']);
  eq('　　兩張都用完了 → 歷史', [w.of('T1').state,w.of('T2').state], ['history','history']);
}
{
  /* 帳本事實優先於推算：直連與扣課紀錄先蓋，剩下的才推 */
  const w=W([TK('T1',{sessions_total:2,sessions_remaining:0,start_date:'2026-05-01'})],
    [BK('B1','2026-06-01',{status:'checked_in',ticket_id:'T1'}),
     BK('B2','2026-05-09',{status:'checked_in',ticket_id:null})]);
  eq('★ 同一堂課只會蓋在一張票上（不重複計）', Object.keys(w.byBooking).length, 2);
  eq('★ 容量已被帳本事實佔走時，推算不會超蓋', w.stampsOf('T1').length, 2);
}
{
  const w=W([TK('T1',{sessions_total:1,sessions_remaining:0,start_date:'2026-05-01'})],
    [BK('B1','2026-06-01',{status:'checked_in',ticket_id:'T1'}),
     BK('B2','2026-08-05',{ticket_id:null})]);
  eq('★ 沒票可蓋的未來預約 → 需補票（游晴雅案例）', w.leftover.map(b=>b.id), ['B2']);
  eq('　　可以只問某個課別的補票清單', w.leftoverIn('pt').map(b=>b.id), ['B2']);
  eq('　　過去沒蓋到的不算補票（已經上完了，補不回來）',
     W([TK('T1',{sessions_total:1,sessions_remaining:0})],
       [BK('B1','2026-06-01',{status:'checked_in',ticket_id:'T1'}),BK('B2','2026-06-05')]).leftover.length, 0);
}

console.log('\n票券狀態：持有中／已過期／歷史');
{
  const st=o=>W([TK('T1',o)],[]).of('T1').state;
  eq('★ 已退費 → 歷史', st({status:'refunded'}), 'history');
  eq('★ 有效期且已過 → 已過期（不看還剩不剩堂數，2026-07-31）',
     st({expire_date:'2026-07-01',sessions_remaining:3}), 'expired');
  eq('　　用完了但過期 → 仍歸已過期（限定方案才找得到）',
     st({expire_date:'2026-07-01',sessions_remaining:0}), 'expired');
  eq('★ 還沒上完 → 持有中', st({sessions_total:4,sessions_remaining:4}), 'active');
  eq('★ 帳面用完且沒有待上 → 歷史', st({sessions_total:4,sessions_remaining:0}), 'history');
  eq('　　效期未到不算過期', st({expire_date:'2026-08-31'}), 'active');
}
{
  const w=W([TK('A',{sessions_total:4,sessions_remaining:4}),
             TK('B',{sessions_total:4,sessions_remaining:0}),
             TK('C',{expire_date:'2026-07-01'})],[]);
  eq('★ 三區分開拿', [w.active().map(s=>s.id),w.expired().map(s=>s.id),w.history().map(s=>s.id)],
     [['A'],['C'],['B']]);
  eq('★ 可用堂數只算持有中的票', w.sessionsLeft(), 4);
}

console.log('\n邊界');
{
  eq('　　沒有票也不會爆', W([],[]).slots.length, 0);
  eq('　　沒有票時可用堂數是 0', W([],[]).sessionsLeft(), 0);
  eq('　　餘額不明（舊資料 null）時用逐筆數',
     W([TK('T1',{sessions_total:4,sessions_remaining:null})],
       [BK('B1','2026-06-01',{status:'checked_in',ticket_id:'T1'})]).of('T1').used, 1);
  eq('　　已上堂數不會超過總堂數',
     W([TK('T1',{sessions_total:2,sessions_remaining:-3})],[]).of('T1').used, 2);
  const many=[...Array(3)].map((_,i)=>TK('T'+i,{sessions_total:1,sessions_remaining:0,start_date:'2026-0'+(5+i)+'-01'}));
  eq('　　清單頁可以傳現成的預約索引進來（不逐人掃全表）',
     buildWallet(ME,{tickets:many,bookingsOf:()=>[BK('B1','2026-05-02',{status:'checked_in'})],
       logs:[],typeMap:TYPES}).stampsOf('T0').length, 1);
}

console.log('\n每套票卡一個編號（2026-07-31 使用者定案）');
{
  const w=W([TK('B',{purchase_date:'2026-06-10'}),TK('A',{purchase_date:'2026-05-01'}),
             TK('C',{purchase_date:'2026-07-20'})],[]);
  eq('★ 依購買順序編號，不看陣列順序', [w.noOf('A'),w.noOf('B'),w.noOf('C')], [1,2,3]);
  eq('★ 卡片上拿得到編號', w.of('B').no, 2);
  /* 又買一張不會把既有的號碼往前推 —— 櫃檯跟會員講「第 2 套」指的是同一張 */
  const w2=W([TK('B',{purchase_date:'2026-06-10'}),TK('A',{purchase_date:'2026-05-01'}),
              TK('C',{purchase_date:'2026-07-20'}),TK('D',{purchase_date:'2026-07-31'})],[]);
  eq('★ 再買一張，既有票的號碼不變', [w2.noOf('A'),w2.noOf('B'),w2.noOf('C'),w2.noOf('D')], [1,2,3,4]);
  eq('　　用完／過期／作廢的票也佔一個號（號碼不會被回收）',
     W([TK('X',{purchase_date:'2026-05-01',status:'refunded'}),TK('Y',{purchase_date:'2026-06-01'})],[]).noOf('Y'), 2);
  eq('　　同一天買兩張也分得出來（依建立時間）',
     (()=>{const w3=W([TK('P',{purchase_date:'2026-06-01',created_at:'2026-06-01T02:00:00Z'}),
                       TK('Q',{purchase_date:'2026-06-01',created_at:'2026-06-01T01:00:00Z'})],[]);
           return [w3.noOf('Q'),w3.noOf('P')];})(), [1,2]);
  eq('　　不在票券夾裡的票沒有號碼', w.noOf('ZZ'), 0);
}
ok('★ 卡片與下拉用同一個號碼樣式（#N）',
   /function tkNoTag\(no\)\{/.test(src) && /<span class="tk-no" title="這是票券夾裡的第 \$\{no\} 套票卡">#\$\{no\}<\/span>/.test(src));
ok('★ 五個票券畫面都標編號',
   /\$\{tkNoTag\(sl\.no\)\}\$\{t\.plan_name\|\|'票券'\}/.test(src)              // 後台票券分頁
   && /\$\{tkNoTag\(WAL\.noOf\(t\.id\)\)\}\$\{t\.plan_name\|\|'票券'\}/.test(src)  // 歷史卡
   && /<div class="md-tk-name">\$\{tkNoTag\(WAL\.noOf\(t\.id\)\)\}/.test(src)      // 教練名片
   && /<div class="mwtk-name">\$\{tkNoTag\(WAL\.noOf\(t\.id\)\)\}/.test(src)      // 管理員票券頁
   && /<div class="mck-name">\$\{tkNoTag\(_sl\.no\)\}\$\{name\}\$\{fmt\}<\/div>/.test(src));  // 會員端我的票券

console.log('\n會員可選擇用哪一套，預設快過期的先用');
ok('★ 自主訓練：多套就出下拉，預設最快到期',
   /<select id="msb-tk-sel" onchange="window\._msb\.pickTk=this\.value"/.test(src)
   && /有多套票卡可用，預設扣最快到期的那一套，可自行改選。/.test(src)
   && /return String\(a\.expire_date\|\|'9999-12-31'\)\.localeCompare\(String\(b\.expire_date\|\|'9999-12-31'\)\);/.test(src));
/* 2026-08-03：listUsableTickets 的排序改成「30 天內到期的先、其餘照購買順序」
   （李約儒 #1/#4 案例，見 tkordertest.js），註解裡那句 DB 口徑的字樣移掉了 */
ok('★ 團體課：同樣可選（DB 端 fn_member_join_group 仍為 expire_date asc nulls last）',
   /<select id="grp-join-tk" onchange="window\._grpJoinTk=this\.value"/.test(src));
ok('★ 限時段的票（友善點）排在最前面 —— 它最容易白白過期',
   /const ra=tkIsTimeRestricted\(a\)\?0:1, rb=tkIsTimeRestricted\(b\)\?0:1;/.test(src));
ok('★ 選了哪一套就扣哪一套（沒帶就退回自動挑）',
   /const tk=_cand\.find\(x=>x\.id===_sel\)\|\|_cand\[0\]\|\|null;/.test(src)
   && /p_ticket_id:tk\.id/.test(src));
ok('　　下拉裡也看得到編號', /\$\{msbNo\(t\.id\)\}\$\{nm\(t\)\}/.test(src)
   && /function msbNo\(id\)\{/.test(src));
ok('　　編號一律問票券夾，預約表單不另編一套',
   /一律問票券夾，不在這裡另編一套/.test(src));

console.log('\n只回答「已經蓋了什麼」');
ok('★ 「新的預約該扣哪張票」不歸票券夾管（tkFitsBooking）',
   /⚠ 這一層只回答「已經蓋了什麼」。「新的預約該扣哪張票」是另一件事（tkFitsBooking）。/.test(src));
ok('★ 不另存對照表，戳記的紀錄只有一份',
   /戳記的紀錄只有一份，不另存對照表；依可信度取用既有的三個來源/.test(src));
ok('★ 三個來源依序覆蓋，同一堂只會蓋在一張票上',
   /①②是事實、③是推算；依序覆蓋，同一堂課只會蓋在一張票上。/.test(src));
ok('★ 資料來源一次撈齊，清單頁共用（walletCtx）',
   /async function walletCtx\(\)\{/.test(src) && /async function memberWallet\(memberId, ctx\)\{/.test(src));
ok('　　為什麼要有這一層，寫在程式裡',
   /同一個事實有八種答案，於是每隔幾天就有一個畫面對、另一個畫面錯/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
