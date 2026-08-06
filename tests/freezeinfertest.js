/* 2026-08-06 使用者指示：「體驗票券卡上的 8/12 為什麼要用『推算』？
   問題就在於系統會推算票券使用日，才會導致有錯誤的票券植入一直發生，請導正過來。」

   ③ 先進先出推算是「每次重算」的猜測，不是存下來的事實 —— 任何新增／取消都可能
   讓一整批歷史戳記換到別張票上（修 A 壞 B 的根源）。
   導正分兩段：
     ① 切分日（已上線）：新資料一律要有事實可讀，猜不到就顯示需補票
     ② 固化（本支）：把目前猜出來的歸屬一次性寫成 ticket_logs 連結（delta=0，不動餘額），
        寫完之後推算就能退場，畫面不變但不再重算 */
const fs=require('fs');
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
  grabConst('INFER_CUTOFF_UTC')+'\n'+FNS.map(grabFn).join('\n')+'\nreturn {buildWallet};')(ymd,TODAY,parseYmd,attObj,()=>({}));

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
ok('★ 入口在票券管理頁、只給管理員看',
   /SESSION\.role==='admin'\?`<button class="btn btn-ghost btn-sm" onclick="freezeInferredLinks\(\)"/.test(src));
ok('　　寫完清掉帳本快取（畫面立刻讀得到新連結）', /dbCacheClear\(\['ticket_logs'\]\);/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
