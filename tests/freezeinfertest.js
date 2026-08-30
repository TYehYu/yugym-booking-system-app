/* 2026-08-06 使用者指示：「體驗票券卡上的 8/12 為什麼要用『推算』？
   問題就在於系統會推算票券使用日，才會導致有錯誤的票券植入一直發生，請導正過來。」

   ③ 先進先出推算是「每次重算」的猜測，不是存下來的事實 —— 任何新增／取消都可能
   讓一整批歷史戳記換到別張票上（修 A 壞 B 的根源）。
   導正分兩段：
     ① 切分日（已上線）：新資料一律要有事實可讀，猜不到就顯示需補票
     ② 固化（本支）：把目前猜出來的歸屬一次性寫成 ticket_logs 連結（delta=0，不動餘額），
        寫完之後推算就能退場，畫面不變但不再重算 */
const fs=require('fs');
require('./_bkenv.js');   // 教練請假退堂那條判準（0830 收斂成一支，見 _bkenv.js）
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i,src.indexOf('\n',i));};

const TODAY=new Date(2026,7,6);
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const attObj=b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};};
globalThis.attObj=attObj;
const FNS=['mids','bkHasMember','tkSharedIds','tkUsableBy','tkClass5','bkIsGroup','seatKeys','seatMid','seatNo',
  'bkEatenCancel','grpSeatAttCount','grpSeatLeaveCount','allocBookingsToTickets','grpTicketAlloc',
  'inferAllowed','buildWallet'];
const box=new Function('ymd','TODAY','parseYmd','attObj','bkPocketNow',
  /* 2026-08-06：inferAllowed 多了總開關與探針 → 沙箱補上（都關著＝照舊推算） */
  "let INFER_OFF=false; const window={};\n"+grabConst('INFER_CUTOFF_UTC')+'\n'+FNS.map(grabFn).join('\n')+'\nreturn {buildWallet};')(ymd,TODAY,parseYmd,attObj,()=>({}));

console.log('① 票券夾會說出「哪幾筆是猜的」');
{
  const ME='M-HTS', GT='tt-g';
  const TYPES={[GT]:{id:GT,name:'團體課',category:'小班肌力'}};
  const TKS=[
    /* 8/05 買的團課體驗 1 堂：8/12 那堂是 7/26 匯入時建立的，從來沒扣過 → 只能靠推算 */
    {id:'TK-EXP',member_id:ME,ticket_type_id:GT,plan_name:'團課體驗',source:'purchase',
     purchase_date:'2026-08-05',start_date:'2026-08-05',sessions_total:1,sessions_remaining:1,status:'usable'},
    /* 另一張有真扣課紀錄的票：它的那一堂不該被算成「猜的」 */
    {id:'TK-REAL',member_id:ME,ticket_type_id:GT,plan_name:'團體課',source:'purchase',
     purchase_date:'2026-06-01',start_date:'2026-06-01',sessions_total:1,sessions_remaining:0,status:'usable'},
  ];
  const G=(id,date,status,created)=>({id,date,start_time:'19:00',status,category:'小班肌力',
    ticket_type_id:GT,member_id:null,member_ids:[ME],attendance:{},duration:60,created_at:created});
  const BKS=[G('bReal','2026-06-10','checked_in','2026-06-01T00:00:00+00:00'),
             G('b0812','2026-08-12','booked','2026-07-26T08:46:05+00:00')];
  const LOGS=[{id:'l1',ticket_id:'TK-REAL',booking_id:'bReal',action:'deduct'}];
  const W=box.buildWallet(ME,{tickets:TKS,bookings:BKS,logs:LOGS,typeMap:TYPES});
  eq('★ 8/12 是推算來的 → 列進 inferred', (W.inferred||[]).map(x=>x.bid+'→'+x.tid), ['b0812→TK-EXP']);
  ok('　　有扣課紀錄的那一堂不算推算（它是事實）', !(W.inferred||[]).some(x=>x.bid==='bReal'));
  ok('　　畫面歸屬不變（推算仍照常蓋戳記）', (W.ticketOf('b0812')||{}).id==='TK-EXP');
}

console.log('\n①b 非團課也讀帳本（2026-08-06 比對發現 218 筆會變的成因）');
{
  /* 自主訓練／教練課的舊匯入預約沒有 bookings.ticket_id，歸屬只存在 ticket_logs，
     但原本只有團課會讀帳本 → 固化寫進去也沒人讀，關掉推算那些戳記就會消失。 */
  const ME='M-SELF', TT='tt-self';
  const TYPES={[TT]:{id:TT,name:'自主訓練',category:'自主訓練'}};
  const TKS=[{id:'TK-S',member_id:ME,ticket_type_id:TT,plan_name:'自主訓練點數',source:'purchase',
    purchase_date:'2026-06-01',start_date:'2026-06-01',sessions_total:2,sessions_remaining:0,status:'usable'}];
  const S=(id,date,o)=>Object.assign({id,date,start_time:'17:00',status:'checked_in',category:'自主訓練',
    ticket_type_id:TT,member_id:ME,member_ids:[],attendance:{},duration:60,
    created_at:'2026-06-01T00:00:00+00:00'},o||{});
  const BKS=[S('bA','2026-06-10'),S('bB','2026-06-17'),S('bC','2026-06-24')];
  const LOGS=[
    {id:'x1',ticket_id:'TK-S',booking_id:'bA',action:'deduct',delta:0},   // 固化寫的補連結
    {id:'x2',ticket_id:'TK-S',booking_id:'bB',action:'deduct',delta:-1},  // 真的扣過
    {id:'x3',ticket_id:'TK-S',booking_id:'bC',action:'deduct',delta:-1},  // 扣了又退 → 不算
    {id:'x4',ticket_id:'TK-S',booking_id:'bC',action:'refund',delta:1},
  ];
  const W=box.buildWallet(ME,{tickets:TKS,bookings:BKS,logs:LOGS,typeMap:TYPES});
  eq('★ 補連結（delta 0）也讀得到 → bA 掛在 TK-S', (W.ticketOf('bA')||{}).id, 'TK-S');
  eq('★ 真的扣過的照樣讀得到 → bB 掛在 TK-S', (W.ticketOf('bB')||{}).id, 'TK-S');
  ok('★ 扣了又退的不算（bC 不掛在這張票上，除非推算另外決定）',
     (W.inferred||[]).some(x=>x.bid==='bC') || (W.ticketOf('bC')||{}).id!=='TK-S');
  ok('★ 這兩堂不再需要推算（inferred 裡沒有它們）',
     !(W.inferred||[]).some(x=>x.bid==='bA'||x.bid==='bB'));
}

console.log('\n② 固化工具');
ok('★ 只有管理員能執行', /if\(SESSION\.role!=='admin'\)\{ showToast\('只有管理員可以執行'\); return; \}/.test(src));
ok('★ 寫的是「連結」不是扣款（delta 0，不動餘額）',
   /action:'deduct', delta:0,/.test(src)
   && /note:'補連結（固化先進先出推算的歸屬；不動餘額）'/.test(src));
ok('★ 已經有帳的不重複寫（同一堂同一票只寫一次）',
   /const key=x\.bid\+'\|'\+x\.tid;\n\s*if\(have\.has\(key\)\) return;/.test(src)
   && /\(ctx\.logs\|\|\[\]\)\.forEach\(l=>\{ if\(l&&l\.ticket_id&&l\.booking_id\) have\.add\(l\.booking_id\+'\|'\+l\.ticket_id\); \}\);/.test(src));
ok('★ 可重複執行（id 固定＋upsert）',
   /id:'LG-FRZ-'\+x\.bid\+'-'\+x\.tid/.test(src)
   && /upsert\(chunk,\{onConflict:'id'\}\)/.test(src));
ok('★ 可回復（全部 LG-FRZ- 開頭，說明寫在畫面上）',
   /這些連結的 id 都是 LG-FRZ- 開頭、delta 為 0/.test(src));
ok('★ 分批寫（一次 200 筆，失敗的下次再跑）',
   /for\(let i=0;i<rows\.length;i\+=200\)\{/.test(src)
   && /失敗 \$\{fail\} 筆（可再執行一次）/.test(src));
ok('★ 逐位會員算票券夾時用預約索引（不要每個人都掃全表）',
   /buildWallet\(m\.id, Object\.assign\(\{\}, ctx, \{bookingsOf:mid=>idx\[mid\]\|\|\[\]\}\)\)/.test(src));
ok('★ 沒有要固化的就明講',
   /✓ 沒有需要固化的推算歸屬（全部都已經有帳可查）。/.test(src));
/* 2026-08-08：固化已完成（8/06 跑完 532 筆）、推算 8/07 關閉 → 畫面上的按鈕收起來，
   函式保留給日後真的要重跑時從主控台叫。 */
ok('★ 畫面上的按鈕已收起（避免誤按），函式保留',
   !/onclick="freezeInferredLinks\(\)"/.test(src)
   && /async function freezeInferredLinks\(\)/.test(src));
ok('　　寫完清掉帳本快取（畫面立刻讀得到新連結）', /dbCacheClear\(\['ticket_logs'\]\);/.test(src));

console.log('\n③ 關掉推算前的比對（使用者指示：「先跑比對再關」）');
/* 2026-08-07：比對確認一致後已正式關閉 */
ok('★ 總開關已關閉（③ 推算退場）',
   /let INFER_OFF=true;/.test(src)
   && /if\(INFER_OFF \|\| window\._inferOffProbe\) return false;/.test(src));
ok('★ 比對工具對每位會員各算兩次（推算開／關）再比每一堂課掛在哪張票',
   /window\._inferOffProbe=false; A=buildWallet\(m\.id,c2\);/.test(src)
   && /window\._inferOffProbe=true;  B=buildWallet\(m\.id,c2\);/.test(src)
   && /Object\.keys\(ka\)\.forEach\(bid=>\{\n\s*if\(ka\[bid\]===kb\[bid\]\) return;/.test(src));
ok('　　探針一定會關回來（finally），不會影響營運',
   /finally\{ window\._inferOffProbe=false; \}/.test(src));
ok('★ 完全一致才敢關（畫面不會有任何一顆圓點改變）',
   /✓ 完全一致（比對 \$\{checked\} 位會員）。/.test(src)
   && /關掉推算不會讓任何一顆圓點改變或消失/.test(src));
ok('★ 有差異就逐筆列出來（會變成需補票的特別標紅）',
   /⚠ 有 \$\{diffs\.length\} 筆會變（比對 \$\{checked\} 位會員）—— 先處理完再關。/.test(src)
   && /會變成「需補票」（原本靠推算掛在/.test(src));
ok('　　比對工具同樣收起按鈕、保留函式',
   !/onclick="compareInferOff\(\)"/.test(src) && /async function compareInferOff\(\)/.test(src));
ok('★ 非團課的帳本歸屬有讀（①b）',
   /const tid=ks\.find\(x=>m\[x\]\.net>0\) \|\| ks\.find\(x=>m\[x\]\.link && m\[x\]\.net>=0\);/.test(src)
   && /if\(byBooking\[b\.id\] \|\| bkIsGroup\(b\)\) return;      \/\/ 團課逐名額，走 ②/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
