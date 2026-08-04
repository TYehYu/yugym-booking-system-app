/* 2026-07-30 使用者指示三件：
   ① 會員的搜尋框與下拉合併成一個欄位（銷售等六處都有這個設計）
   ② 課程銷售的商品卡改成像行事曆課卡的直式卡，主資訊放大
   ③ 首頁右邊「今日未打卡名單」併進左邊「今日值班」：顯示完整名單，未打卡＝空心
      （收款提醒與降級名單維持獨立，那兩份之後可能很長） */
const fs=require('fs');
/* 2026-07-31：課種判斷抽成共用的 bkIsGroup／bkIsSelf／bkIsMassage（見 TK_POCKETS）——
   沙箱裡給等價替身，測資只有 category 可判。 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkIsSelf=b=>!!(b&&b.category==='自主訓練');
globalThis.bkIsMassage=b=>!!(b&&b.category==='運動按摩');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* ── ① 會員選擇器合併 ─────────────────────────────── */
console.log('會員搜尋框＋下拉合併成一個');
ok('★ 六處「輸入框＋下拉」都會被升級（統一掃 .mem-pick-row）',
   /function mpkScan\(\)\{ try\{ document\.querySelectorAll\('\.mem-pick-row'\)\.forEach\(mpkUpgrade\); \}catch\(_\)\{\} \}/.test(src));
{
  const n=(src.match(/<div class="mem-pick-row">/g)||[]).length
        + (src.match(/<div class="mem-pick-row"><input id="fam-name"/g)||[]).length;
  ok('　　畫面上確實有六處以上（含家庭成員那個不含 select，會自動略過）', n>=6, n);
}
ok('★ 保留原本的 <select> 當資料來源，只是隱藏 → 既有 .value 與 onchange 不用改',
   /保留原本的 <select>（隱藏但仍在 DOM）/.test(src)
   && /\.mem-pick-row\.mpk-on select\{position:absolute;width:1px;height:1px;opacity:0;/.test(src));
ok('★ 只升級「輸入框＋下拉」的組合，缺一就跳過',
   /if\(!sel\|\|!inp\) return;\s*\/\/ 只升級「輸入框＋下拉」這種組合/.test(src));
/* 2026-08-04 使用者建議：「點選後統一跳出視窗，輸入姓名或電話產生下拉選單」——
   打字從欄位移進視窗；「打到一半的字消失」「IME 組字」這些行內輸入的問題整類消失。 */
ok('★ 打字沿用各處原本的篩選函式（視窗代填回原欄位觸發 oninput）',
   /if\(hasOwn\)\{ inp\.value=q; inp\.dispatchEvent\(new Event\('input',\{bubbles:true\}\)\); \}/.test(src));
ok('★ 欄位是入口（readOnly），點選／聚焦／鍵盤都能開視窗',
   /inp\.readOnly=true;/.test(src)
   && /inp\.addEventListener\('focus',\(\)=>mpkSheetOpen\(row\)\);/.test(src)
   && /if\(e\.key==='Enter'\|\|e\.key===' '\|\|e\.key==='ArrowDown'\)\{ e\.preventDefault\(\); mpkSheetOpen\(row\); \}/.test(src));
ok('　　搜不到人時第一個選項直接講「查無符合的會員」',
   /\$\{\(qq&&!list\.length\)\?'查無符合的會員':'— 請先選擇會員 —'\}/.test(src));
ok('★ 點選項目會設回 select 並發 change（沿用既有 onchange）',
   /sel\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\);/.test(src));
/* 2026-08-04 使用者回報（林孟玉案例）：步驟 1 選了人，選教練後步驟 2 變「尚未選擇會員」——
   選定後欄位放的是標籤，重建會員下拉時被當成搜尋字、比對不到任何人。 */
ok('★ 重建下拉時「標籤不當搜尋字」（等於選定者標籤就視為空查詢）',
   /if\(sel && q && typeof mpkLabel==='function' && q===mpkLabel\(sel\)\) q='';/.test(src));
ok('　　清單點選用 mousedown（一致的舊習慣，選定即關窗）',
   /row\._mpkMenu\.addEventListener\('mousedown'/.test(src));
ok('　　鍵盤可用：上下選、Enter 確定、Esc 關閉',
   /e\.key==='ArrowDown'\|\|e\.key==='ArrowUp'/.test(src) && /if\(e\.key==='Enter'\)\{/.test(src)
   && /if\(e\.key==='Escape'\)\{ mpkSheetClose\(\); return; \}/.test(src));
/* 2026-08-04 使用者回報：「Mac Safari 在預約 1/2 的會員姓名輸入中文按 Enter 會直接關閉」——
   那個 Enter 是輸入法在選字。 */
ok('★ IME 組字中的按鍵不攔（選字的 Enter 不會被當成確定）',
   /if\(e\.isComposing \|\| e\.keyCode===229\) return;/.test(src));
ok('★ Enter 跳過佔位列，選第一個有值的項目',
   /items\.find\(x=>\{ const o=sel\.options\[Number\(x\.getAttribute\('data-i'\)\)\]; return o&&o\.value; \}\)/.test(src));
ok('　　沒選人時欄位留空，讓 placeholder 露出來',
   /if\(!sel \|\| !sel\.value\) return '';/.test(src));
ok('　　清單空的時候講「查無符合的會員」', /查無符合的會員/.test(src));
ok('★ 視窗與換頁後都會自動升級', /if\(typeof mpkScan==='function'\) mpkScan\(\);/.test(src)
   && (src.match(/if\(typeof mpkScan==='function'\) mpkScan\(\);/g)||[]).length===2);
ok('　　重複掃描不會重覆升級', /if\(!row \|\| row\.classList\.contains\('mpk-on'\)\) return;/.test(src));

/* ── ② 銷售直式卡 ─────────────────────────────────── */
console.log('\n課程銷售卡改直式大卡');
ok('★ 上緣課程色帶（跟行事曆課卡同語彙）',
   /<span class="sl-card-band"><\/span>/.test(src)
   && /\.sl-card-band\{display:block;height:8px;flex:0 0 8px;background:var\(--pc,#1f6f54\);\}/.test(src));
ok('★ 名稱放大成主資訊（19px 粗體）', /\.sl-card-name\{font-size:19px;font-weight:800;/.test(src));
ok('★ 直式：色帶在上、內容在下', /\.sl-card\{[\s\S]{0,120}flex-direction:column;/.test(src));
ok('　　說明縮小放在名稱下面', /\.sl-card-sub\{font-size:12px;color:var\(--t2\);/.test(src));
/* 2026-08-03 排序定版：課程銷售改 sl-cards-3（一列三張），其他收費維持 sl-cards */
ok('★ 課程銷售與其他收費都換成新的卡片容器',
   (src.match(/<div class="sl-cards sl-cards-3">/g)||[]).length===1
   && (src.match(/<div class="sl-cards" style="flex:1\.4;min-width:260px;">/g)||[]).length===1   /* 2026-08-04 其他收費卡片列與購物車並排 */
   && !/openSalesModal[\s\S]{0,1200}<div class="bk-cards">/.test(src));
ok('　　視窗加寬，直式卡才排得開', /直式卡要寬一點才排得開/.test(src));
ok('　　手機退成兩欄', /@media\(max-width:560px\)\{ \.sl-cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\}/.test(src));
ok('　　hover 有回饋、鍵盤有焦點框', /\.sl-card:hover\{border-color:var\(--pc/.test(src)
   && /\.sl-card:focus-visible\{outline:2px solid var\(--pc/.test(src));
ok('　　沒有動到別處在用的 gt-card2（票券發放still用它）', /<div class="gt-c2-name">\$\{p\.name\}<\/div>/.test(src));

/* ── ③ 未打卡併進今日值班 ─────────────────────────── */
console.log('\n今日未打卡併進今日值班');
ok('★ 今日值班改列完整名單：有打卡的 ＋ 今天有排班但還沒打卡的',
   /\.filter\(x=>\(x\.att&&x\.att\.clock_in\) \|\| x\.sh\)/.test(src)
   && /顯示完整名單 —— 有打卡的 ＋ 今天有排班但還沒打卡的（空心圈）/.test(src));
ok('★ 未打卡畫成空心未注水的圈', /if\(!att \|\| !att\.clock_in\)\{/.test(src)
   && /class="duty-ring dr-cup dr-empty/.test(src)
   && /\.dr-empty \.dr-cup-rim\{stroke:rgba\(0,61,50,\.22\);\}/.test(src));
ok('★ 已過上班時間仍未打卡 → 紅色虛線圈＋驚嘆號',
   /const late=!!\(isToday && shift && shift\.start_time && nowMinV>=timeToMin\(shift\.start_time\)\);/.test(src)
   && /\.dr-late \.dr-cup-rim\{stroke:var\(--danger,#b5372e\);stroke-dasharray:4 3;\}/.test(src));
ok('　　排序：已打卡的照上班時間，未打卡的排後面照班表',
   /const pa=\(a\.att&&a\.att\.clock_in\)\?0:1, pb=\(b\.att&&b\.att\.clock_in\)\?0:1;/.test(src));
ok('　　離職／停用的員工不列', /\.filter\(c=>c\.status!=='inactive'&&c\.status!=='resigned'\)\s*\n\s*\.map\(c=>\(\{c, att:attMap/.test(src));
ok('　　請假的班不算（沿用 leave_type 過濾）',
   /dayShifts\.find\(s=>s\.emp_id===id&&s\.start_time&&s\.end_time&&!s\.leave_type\)/.test(src));
ok('★ 首頁不再單獨列「今日未打卡名單」那一行',
   !/_todoRow\(OPS_TODO_IC\.check,'今日未打卡名單'/.test(src));
ok('★ 收款提醒與降級名單維持獨立（使用者：那兩份之後可能很長）',
   /_todoRow\(OPS_TODO_IC\.money,'今日收款提醒'/.test(src)
   && /_todoRow\(OPS_TODO_IC\.ticket,'本月即將降級名單'/.test(src));
ok('　　_noPunchList 仍保留給狀態卡的「未打卡 N 位」用', /const _noPunchList=\[\];/.test(src)
   && /nopunch:\{title:'今日未打卡名單'/.test(src));


/* ── ④ 會員列表的票券欄看不到團課（2026-07-30 游晴雅）── */
console.log('\n會員列表的票券欄要看得到團課');
/* 2026-07-31：票券欄從「一格袋子」改成「五個課別各一格」（tkCatCell），
   tkCell 整支移除；下面兩項改驗新的位置。 */
ok('★ 餘額 0 但還有待上的課 → 票券燈號不判成紅燈',
   /if\(!s\|\|!s\.anyUsable\) return _memPendingIdx\[mid\] \? 'yellow' : 'red';/.test(src));
/* 2026-07-31 二修：改成把索引交給票券夾（buildWallet 的 bookingsOf），一樣不逐人掃全表 */
ok('★ 組預約清單改用索引，含團課（學員在 member_ids、member_id 是 null）',
   /bookingsOf:m=>_memBkIdx\[m\]\|\|\[\]/.test(src)
   && /const myBk=c\.bookingsOf \? \(c\.bookingsOf\(memberId\)\|\|\[\]\)/.test(src)
   && !/const myBk=allBk\.filter\(b=>b\.member_id===m\.id&&b\.status!=='cancelled'\);/.test(src));
ok('★ 兩個索引各建一次，不是每位會員掃一次上萬筆',
   /const _memBkIdx=\{\};/.test(src) && /const _memPendingIdx=\{\};/.test(src)
   && /\(allBk\|\|\[\]\)\.forEach\(b=>\{/.test(src));
ok('　　同一人佔多個名額就算多筆（團課圓點要出現多次）',
   /ids\.forEach\(mid=>\{\s*\n\s*\(_memBkIdx\[mid\]=_memBkIdx\[mid\]\|\|\[\]\)\.push\(b\);/.test(src));
ok('　　只有「今天以後、已預約未簽到」才算待上',
   /if\(b\.status==='booked' && String\(b\.date\|\|''\)\.slice\(0,10\)>=today\) _memPendingIdx\[mid\]=true;/.test(src));
ok('　　已取消的不算', /if\(!b \|\| b\.status==='cancelled'\) return;/.test(src));
ok('★ 原因寫在程式裡（兩個成因都記下來）',
   /她今天還有一堂團課，會員列表的票券欄卻是空的/.test(src)
   && /團課的 member_id 是 null（學員在 member_ids）/.test(src));
{
  // 游晴雅的真實情境
  const today='2026-07-30';
  const T=[{id:'TK',status:'usable',sessions_total:10,sessions_remaining:0,purchase_date:'2026-06-25'}];
  const B=[{id:'b1',date:'2026-07-30',status:'booked',category:'小班肌力',member_id:null,member_ids:['M','M']},
           {id:'b2',date:'2026-07-23',status:'checked_in',category:'小班肌力',member_id:null,member_ids:['M','M']}];
  const memBk={}, memPending={};
  B.forEach(b=>{ if(b.status==='cancelled')return;
    const ids=(Array.isArray(b.member_ids)&&b.member_ids.length)?b.member_ids:(b.member_id?[b.member_id]:[]);
    ids.forEach(mid=>{ (memBk[mid]=memBk[mid]||[]).push(b);
      if(b.status==='booked' && String(b.date||'').slice(0,10)>=today) memPending[mid]=true; }); });
  ok('★ 游晴雅：團課票剩 0（舊判斷會說「無有效票券」）',
     !T.some(t=>t.status==='usable'&&t.sessions_remaining>0));
  ok('★ 但她今天還有課 → 新判斷會繼續畫圓形卡', memPending['M']===true);
  ok('　　她的團課預約撈得到（2 個名額算 2 筆）', (memBk['M']||[]).length===4);
}


/* ── ⑤ 施佳靜：教練課全排完（餘額 0、還有 5 堂沒上）卻標「無有效票券」── */
console.log('\n餘額 0 但課還沒上完 ≠ 無票');
ok('★ 票券燈號：沒餘額但還有未上的課 → 黃燈，不是紅燈',
   /if\(!s\|\|!s\.anyUsable\) return _memPendingIdx\[mid\] \? 'yellow' : 'red';/.test(src));
ok('★ 原因寫在程式裡（施佳靜 8 堂全排完：已上 3、已約 5）',
   /她 7\/09 買的 8 堂 1V2 全排完了（已上 3、已約 5）/.test(src));
ok('★ 索引建在 PAGES.members 裡（tkLevel 與票券欄共用）',
   /PAGES\.members=async function\(\)\{[\s\S]{0,1200}const _memBkIdx=\{\};/.test(src));
ok('★ 沒有誤植到別的函式（refreshCoachNotifBadge 不該有它）',
   !/async function refreshCoachNotifBadge\(\)\{[\s\S]{0,600}_memBkIdx/.test(src));
{
  const today='2026-07-30';
  const B=[{id:'a',date:'2026-07-09',status:'completed',member_id:'M'},
           {id:'b',date:'2026-07-30',status:'booked',member_id:'M'},
           {id:'c',date:'2026-08-27',status:'booked',member_id:'M'}];
  const pend={};
  B.forEach(b=>{ if(b.status==='cancelled')return;
    const ids=b.member_ids&&b.member_ids.length?b.member_ids:(b.member_id?[b.member_id]:[]);
    ids.forEach(mid=>{ if(b.status==='booked'&&String(b.date).slice(0,10)>=today) pend[mid]=true; }); });
  ok('★ 施佳靜：餘額 0 但 7/30 之後還有 5 堂 → 判定為「還有未上的課」', pend['M']===true);
  const pend2={};
  [{id:'x',date:'2026-07-09',status:'completed',member_id:'N'}].forEach(b=>{
    const ids=[b.member_id]; ids.forEach(mid=>{ if(b.status==='booked'&&String(b.date).slice(0,10)>=today) pend2[mid]=true; }); });
  ok('　　全部上完、也沒有未來預約 → 才是真的紅燈', !pend2['N']);
}


/* ── ⑥ 兩邊規則要一致：預約明細有日期、會員列表卻整排 ✓（2026-07-30 游晴雅）── */
console.log('\n團課圓點：兩個畫面要同一套規則');
ok('★ 配對 key 不再把 format 算進團課（票券空白 vs 預約寫「團體」永遠對不上）',
   /const key=x=>\{ const c=tyCat\(x\.ticket_type_id\);\s*\n\s*return \[tyName\(x\.ticket_type_id\), \(c==='小班肌力'\?'':\(x\.format\|\|''\)\)\]\.join\('\|'\); \};/.test(src));
ok('★ 原因寫在程式裡（配不到又不會落到第二輪，整批被丟掉）',
   /那些課配不到票也不會落到第二輪（它們有 ticket_type_id），整批被丟掉/.test(src));
ok('★ 會員列表也把「沒有票可扣的已預約未上」帶上，跟名單一樣看得到（見下方票券袋子）',
   /let dots=ticketTokens\(tk,sl\.stamps\.concat\(extra\|\|\[\]\),typeMapFull,used,null,mid\|\|tk\.member_id,sl\.selfBk\);/.test(src));
ok('　　已經配到票的不重複列（同一堂只會蓋在一張票上）',
   /put=\(tid,b\)=>\{ if\(!tid\|\|byBooking\[b\.id\]\) return;/.test(src));
ok('　　只帶今天以後、且依課別歸戶（2026-07-31 起用票券五分類歸戶）',
   /const leftover=live\.filter\(b=>!byBooking\[b\.id\] && b\.status==='booked'/.test(src)
   && /leftoverIn:k=>leftover\.filter\(b=>tkClass5\(\{ticket_type_id:b\.ticket_type_id,plan_name:b\.category\},typeMap\)===k\)/.test(src));
{
  const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
  const alloc=new Function(g('function allocBookingsToTickets(','\n}\n')+'\nreturn allocBookingsToTickets;')();
  /* 2026-08-01：圓點多了「會員自行預約」的金點標記，沙箱一併注入判斷函式 */
  const tokens=new Function('tkVisual','parseYmd','bkSelfBooked',g('function ticketTokens(','\n}\n')+'\nreturn ticketTokens;')
    (()=>({accent:'#9a5a1e'}), x=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;}, ()=>false);
  const TM={'tt-g':{name:'團體課',category:'小班肌力'}};
  const top={id:'TK',ticket_type_id:'tt-g',format:null,sessions_total:10,sessions_remaining:0,
    start_date:'2026-06-25',purchase_date:'2026-06-25',member_id:'M',plan_name:'團體課'};
  const raw=[['2026-06-25',2,'completed'],['2026-06-29',1,'completed'],['2026-07-02',2,'completed'],
             ['2026-07-09',2,'completed'],['2026-07-16',2,'checked_in'],['2026-07-23',2,'checked_in'],
             ['2026-07-30',2,'booked']];
  const myBk=[]; raw.forEach(([d,n,st],k)=>{for(let x=0;x<n;x++) myBk.push({id:'b'+k,date:d,start_time:'19:30',
    status:st,category:'小班肌力',ticket_type_id:'tt-g',format:'團體'});});
  const bks=alloc([top],myBk,TM).byTicket['TK']||[];
  ok('★ 游晴雅：10 堂全部配得到（修好前是 0 堂 → 整排只有 ✓）', bks.length===10, bks.length);
  const today='2026-07-30';
  const seen=new Map(); bks.forEach(b=>seen.set(b.id,(seen.get(b.id)||0)+1));
  const extra=[]; myBk.forEach(b=>{ if(b.status!=='booked'||b.date<today) return;
    if(b.category!=='小班肌力') return; const c=seen.get(b.id)||0; if(c>0){seen.set(b.id,c-1);return;} extra.push(b); });
  const html=tokens(top,bks.concat(extra),TM,10,null);
  const dates=[...html.matchAll(/>(\d+\/\d+)</g)].map(m=>m[1]).join(' ');
  ok('★ 每一顆都有戳記日期（不再是空白的 ✓）', dates==='6/25 6/25 6/29 7/2 7/2 7/9 7/9 7/16 7/16 7/23 7/30 7/30', dates);
  ok('★ 一次佔兩個名額就畫兩顆同日期', (dates.match(/6\/25/g)||[]).length===2);
  ok('★ 今天那堂（票已用完）用紅虛線圈接在後面，與名單一致',
     (html.match(/mtk-over/g)||[]).length===2 && (html.match(/mtk-used/g)||[]).length===10);
}


/* ── ⑦ 票券袋子：一組票券一列，預設 2 組其餘收合（2026-07-30 使用者定案）── */
/* 2026-07-31：票券欄從「一格袋子」改成「五個課別各一格」（tkCatCell），
   袋子（tkbag／isMain／展開收合）整組退場。以下改驗新版面保住了哪些事。 */
console.log('\n票券欄改成五個課別各一格');
ok('★ 每位會員只算一次（一人一個票券夾，快取起來）',
   /const _mCache=\{\};/.test(src)
   && /const _mTk=\(mid\)=>_mCache\[mid\]\|\|\(_mCache\[mid\]=buildWallet\(mid,/.test(src));
ok('★ 整袋一起配一次（同一堂不會在多張票上重複冒出來）',
   /const w=_mTk\(m\.id\);/.test(src));
ok('★ 沒被任何票吸收的已預約未上 → 仍畫紅虛線圈，依課別歸戶',
   /const leftover=live\.filter\(b=>!byBooking\[b\.id\] && b\.status==='booked'/.test(src)
   && /tkRowHtml\(sl, w\.leftoverIn\(k\), m\.id\)/.test(src));
ok('　　只帶今天以後的', /&& String\(b\.date\|\|''\)\.slice\(0,10\)>=today\);/.test(src));
ok('★ 同課別還有幾張在用會標「＋N」', /＋\$\{n-1\}<\/span>/.test(src));

console.log('\n沒有票券的人要講對');
ok('★ 五格全空看起來像沒載入 → 第一格掛提示',
   /if\(!w\.tickets\.length\) return k==='pt' \? tkNoneChip\(m\) : '';/.test(src));
ok('★ 完全沒票但已排課 → 講出最近那一堂的課別與日期',
   /尚未儲值・\$\{nx\.category\|\|'已排課'\} \$\{String\(nx\.date\|\|''\)\.slice\(5\)\.replace\('-','\/'\)\}/.test(src));
ok('★ 什麼都沒有 → 無有效票券', /無有效票券<\/span>';/.test(src));
ok('　　這段改版時一度掉了，補回來的紀錄留在程式裡',
   /2026-07-31 改版時這段一度隨舊的票券袋子被移除，補回來/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
