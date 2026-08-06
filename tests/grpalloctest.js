/* 團課待上堂數改讀扣課紀錄（2026-07-31 使用者回報）

   「陳暐濰 7/30 的團體課票券還沒銷課，不應該放進歷史紀錄」／「王雅雯 也是這種情況」

   團課預約的 member_id 是 null、學員放在 member_ids，而且不綁 ticket_id，後台只好猜
   「待上的團課都算在最近買的那張團課票身上」。一位會員手上同時有兩張團課票就會猜錯：
     ・陳暐濰 7/31 拿到一張補課券（比 7/30 的四週票新，而且當天就作廢）
     ・王雅雯 7/30 有一張同日重複建立、已作廢的四週票
   四堂待上全跑到那張票頭上 → 四週票待上 0、帳面餘額也 0（預約即扣）→ 標成「已用畢」收進歷史。

   改讀 ticket_logs：預約當下扣哪張票就記哪張票（deduct 帶 booking_id，取消寫 refund 加回）。 */
/* 2026-08-06：取消但「扣課不退」的那一堂仍算用掉（黃品華案例）—— 沙箱補上替身 */
globalThis.bkEatenCancel=b=>!!(b&&b.status==='cancelled'&&b.refund_waived);
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

const TODAY=new Date(2026,6,31);
const api=new Function('ymd','TODAY','mids','attObj',
  g('function grpTicketAlloc(myTk, myBk, logs, memberId, isGrpTk){','\n}\n')+'\n'
  +g('function grpMergeAlloc(base, ga){','\n}\n')
  +'\nreturn {grpTicketAlloc,grpMergeAlloc};')(
    d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());},
    TODAY,
    b=>(b&&Array.isArray(b.member_ids))?b.member_ids:[],
    b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};});

const ME='MEM-1';
const isGrp=t=>String(t.plan_name||'').indexOf('團')>=0;
const TK=(id,o)=>Object.assign({id,plan_name:'團課 4週優惠',sessions_total:4,sessions_remaining:0,
  purchase_date:'2026-07-30',status:'usable'},o||{});
const BK=(id,date,o)=>Object.assign({id,date,start_time:'14:00',category:'小班肌力',status:'booked',
  member_ids:[ME,'MEM-9'],attendance:{}},o||{});
const D=(tid,bid)=>({ticket_id:tid,booking_id:bid,action:'deduct'});
const R=(tid,bid)=>({ticket_id:tid,booking_id:bid,action:'refund'});

console.log('陳暐濰：四週票 + 比它新的補課券');
{
  const tks=[TK('TK-4W'), TK('TK-MK',{plan_name:'團體課・補課券',sessions_total:1,purchase_date:'2026-07-31',status:'refunded'})];
  const bks=['2026-08-06','2026-08-13','2026-08-20','2026-08-27'].map((d,i)=>BK('BK-'+i,d));
  const logs=bks.map(b=>D('TK-4W',b.id));
  const r=api.grpTicketAlloc(tks,bks,logs,ME,isGrp);
  eq('★ 四堂待上全記在四週票上', r.pend['TK-4W'], 4);
  eq('★ 補課券身上一堂都沒有', r.pend['TK-MK'], undefined);
  eq('★ 圓點也是四堂（日期看得到）', (r.byTicket['TK-4W']||[]).map(b=>b.date),
     ['2026-08-06','2026-08-13','2026-08-20','2026-08-27']);
  /* 帳面已用＝總 − 餘額 − 待上 = 4-0-4 = 0 → 沒用畢、不進歷史 */
  eq('★ 帳面已用堂數＝0（不會被標成已用畢）', Math.max(0,4-0-(r.pend['TK-4W']||0)), 0);
}

console.log('\n王雅雯：同日重複建立、已作廢的那張搶走待上堂數');
{
  const tks=[TK('TK-LIVE',{purchase_date:'2026-07-30'}), TK('TK-VOID',{purchase_date:'2026-07-30',status:'refunded'})];
  const bks=['2026-08-06','2026-08-13','2026-08-20','2026-08-27'].map((d,i)=>BK('BK-'+i,d));
  const logs=bks.map(b=>D('TK-LIVE',b.id));
  const r=api.grpTicketAlloc(tks,bks,logs,ME,isGrp);
  eq('★ 待上算在還沒作廢的那張', r.pend['TK-LIVE'], 4);
  eq('★ 作廢票沒有待上堂數', r.pend['TK-VOID'], undefined);
  /* 同日購買時排序是平手，舊寫法會挑到陣列先出現的那張（有可能是作廢的） */
  const r2=api.grpTicketAlloc(tks,bks,[],ME,isGrp);
  eq('　　連扣課紀錄都沒有時，後備猜法也不會挑到作廢票', r2.pend['TK-LIVE'], 4);
}

console.log('\n扣課紀錄的細節');
{
  const tks=[TK('TK-A'), TK('TK-B',{purchase_date:'2026-07-20'})];
  const bks=[BK('BK-1','2026-08-06'), BK('BK-2','2026-08-13')];
  const r=api.grpTicketAlloc(tks,bks,[D('TK-B','BK-1'),D('TK-A','BK-2')],ME,isGrp);
  eq('★ 各堂各自歸屬（不是整批算同一張）', [r.pend['TK-A'],r.pend['TK-B']], [1,1]);
}
{
  const bks=[BK('BK-1','2026-08-06')];
  const r=api.grpTicketAlloc([TK('TK-A')],bks,[D('TK-A','BK-1'),R('TK-A','BK-1'),D('TK-A','BK-1')],ME,isGrp);
  eq('★ 取消退課會抵銷（deduct−refund 取淨值）', r.pend['TK-A'], 1);
}
{
  const bks=[BK('BK-1','2026-08-06',{member_ids:[ME,ME,'MEM-9']})];
  const r=api.grpTicketAlloc([TK('TK-A')],bks,[D('TK-A','BK-1'),D('TK-A','BK-1')],ME,isGrp);
  eq('★ 同一人兩個名額＝兩堂', r.pend['TK-A'], 2);
  const r2=api.grpTicketAlloc([TK('TK-A')],
    [BK('BK-1','2026-08-06',{member_ids:[ME,ME],attendance:{[ME]:'checked_in'}})],
    [D('TK-A','BK-1'),D('TK-A','BK-1')],ME,isGrp);
  eq('★ 只到一個名額時另一個仍是待上', r2.pend['TK-A'], 1);
}
{
  const r=api.grpTicketAlloc([TK('TK-A')],
    [BK('BK-1','2026-08-06',{attendance:{[ME]:'checked_in'}})],[D('TK-A','BK-1')],ME,isGrp);
  eq('★ 已簽到＝真的用掉了，不算待上', r.pend['TK-A'], undefined);
  eq('　　但圓點還是要看得到這堂', (r.byTicket['TK-A']||[]).length, 1);
}
{
  const r=api.grpTicketAlloc([TK('TK-A')],[BK('BK-1','2026-08-06',{status:'cancelled'})],[D('TK-A','BK-1')],ME,isGrp);
  eq('★ 取消的預約不算', r.pend['TK-A'], undefined);
}
{
  const r=api.grpTicketAlloc([TK('TK-A')],[BK('BK-1','2026-08-06',{member_ids:['MEM-9']})],[D('TK-A','BK-1')],ME,isGrp);
  eq('　　別人的名額不算', r.pend['TK-A'], undefined);
}
{
  const r=api.grpTicketAlloc([TK('TK-A')],[BK('BK-1','2026-08-06',{category:'私人教練'})],[D('TK-A','BK-1')],ME,isGrp);
  eq('　　只管團課（教練課本來就有 ticket_id 直連）', r.pend['TK-A'], undefined);
}
{
  const r=api.grpTicketAlloc([TK('TK-A')],[BK('BK-1','2026-08-06')],[{ticket_id:'TK-OTHER',booking_id:'BK-1',action:'deduct'}],ME,isGrp);
  eq('　　別人票券的扣課紀錄不撿（logs 是整張表）', r.pend['TK-OTHER'], undefined);
  eq('　　撿不到就退回後備猜法', r.pend['TK-A'], 1);
}
{
  const r=api.grpTicketAlloc([TK('TK-A')],[BK('BK-1','2026-08-06'),BK('BK-2','2026-08-13')],
    [D('TK-A','BK-1'),{ticket_id:'TK-A',booking_id:'BK-2',action:'grant'}],ME,isGrp);
  eq('　　只認 deduct／refund，grant 不算扣課', (r.byTicket['TK-A']||[]).map(b=>b.id), ['BK-1']);
}

console.log('\n舊系統匯入的預約');
{
  /* 匯入的舊預約當初沒扣過票，餘額裡本來就沒算它 —— 扣了會重複扣 */
  const r=api.grpTicketAlloc([TK('TK-A')],[BK('IMPB-1','2026-07-20')],[],ME,isGrp);
  eq('★ 過去的匯入預約不算待上', r.pend['TK-A'], undefined);
  /* 2026-07-30 Jackie：8/01 的匯入預約一定還沒上，要算 */
  const r2=api.grpTicketAlloc([TK('TK-A')],[BK('IMPB-1','2026-08-01')],[],ME,isGrp);
  eq('★ 未來的匯入預約仍要算（Jackie 案例）', r2.pend['TK-A'], 1);
  const r3=api.grpTicketAlloc([TK('TK-A')],[BK('BK-1','2026-07-20')],[D('TK-A','BK-1')],ME,isGrp);
  eq('★ 過去的新制預約沒簽到仍算待上（當初有扣票）', r3.pend['TK-A'], 1);
}
{
  const r=api.grpTicketAlloc([TK('TK-A')],[BK('IMPB-1','2026-08-01')],[],ME,isGrp);
  eq('★ 猜出來的不畫圓點（否則匯入的整批課會全掛到最近那張票）', (r.byTicket['TK-A']||[]).length, 0);
}
{
  const r=api.grpTicketAlloc([TK('TK-A',{plan_name:'私人教練'})],[BK('BK-1','2026-08-06')],[],ME,isGrp);
  eq('　　沒有任何團課票時不會亂塞', Object.keys(r.pend).length, 0);
}

console.log('\n圓點合併 grpMergeAlloc');
{
  const b1={id:'BK-1',date:'2026-08-06',start_time:'14:00'}, b2={id:'BK-2',date:'2026-08-13',start_time:'14:00'};
  const base={'TK-A':[b1,b2],'TK-B':[]};
  const f=api.grpMergeAlloc(base,{byTicket:{'TK-B':[b1]}});
  eq('★ 有扣課紀錄的以紀錄為準（同一堂不會同時出現在兩張票）', f('TK-A').map(b=>b.id), ['BK-2']);
  eq('★ 紀錄指到哪張就畫在哪張', f('TK-B').map(b=>b.id), ['BK-1']);
  const f2=api.grpMergeAlloc(base,{byTicket:{}});
  eq('　　沒有紀錄時維持原本的先進先出結果', f2('TK-A').map(b=>b.id), ['BK-1','BK-2']);
  const f3=api.grpMergeAlloc(base,{byTicket:{'TK-A':[{id:'BK-3',date:'2026-08-01',start_time:'14:00'}]}});
  eq('　　合併後依日期排序', f3('TK-A').map(b=>b.id), ['BK-3','BK-1','BK-2']);
  eq('　　沒有的票回空陣列', api.grpMergeAlloc(null,{})('TK-X'), []);
}

console.log('\n三個後台畫面都改吃同一支');
/* 2026-07-31 二修：這一頁改從票券夾拿（buildWallet 內部就是呼叫 grpTicketAlloc） */
ok('★ 會員個人資料頁（櫃檯／管理員）',
   /const WAL=buildWallet\(PP\.id,\{tickets:c\.myTk\|\|\[\], bookings:c\.myBk\|\|\[\], logs:c\.myLogs\|\|\[\], typeMap\}\);/.test(src)
   && /const ga=grpTicketAlloc\(mine, live, c\.logs\|\|\[\], memberId, \(\)=>true\);/.test(src));
/* 2026-07-31 二修：教練名片也改從票券夾拿（票券夾內部就是呼叫 grpTicketAlloc） */
ok('★ 教練的簡易名片（openMemberDetail）',
   /const WAL=buildWallet\(member_id,\{tickets, bookingsOf:\(\)=>sharedBookings, logs:tkLogs\|\|\[\], typeMap\}\);/.test(src)
   && /const tkUsedCount=\(t\)=>\(\(WAL\.of\(t\.id\)\|\|\{\}\)\.used\)\|\|0;/.test(src));
/* 2026-08-01：預約明細（團課名單與單人課票券卡）不再自己撈四張表，改呼叫 walletCtx()，
   所以「各畫面都載入 ticket_logs」的檢查改成「都走票券夾」。 */
ok('★ 各畫面都從票券夾取（walletCtx 一次撈齊四張表）',
   /票券夾要用扣課紀錄（2026-07-31，見 buildWallet）/.test(src)
   && (src.match(/await walletCtx\(\)/g)||[]).length>=3);
ok('★ 「已用堂數」與「是否收進歷史」用同一個數字（圓點不會跟卡片矛盾）',
   /else if\(total>0 && used<total\) state='active';/.test(src)
   && /return \(\(WAL\.of\(t\.id\)\|\|\{\}\)\.state\)==='history';/.test(src));
/* 2026-08-01 使用者回報（附截圖）：「為什麼明細這邊又跟會員票券不一樣了」
   「會員票券那邊正確了，我們不是從會員票券這邊拉圓形卡過來用的嗎」——
   簽到名單原本自己跑一套（own 篩選→grpTicketAlloc→allocBookingsToTickets→grpMergeAlloc→
   自己數已簽到），與票券頁改用 buildWallet 之後分岔。整段換成直接問票券夾。 */
ok('★ 團課簽到名單的圓點直接問票券夾（不再自己算一套）',
   /const W=buildWallet\(mid,_wctx\);/.test(src)
   && /ticketTokens\(_sl\.t,_sl\.stamps,st\.typeMap,_sl\.used,b\.id,mid,_sl\.selfBk,_ord\)/.test(src));
/* 2026-08-01 使用者指示：「預約明細應該要去對應票券編號，而不是快進快出
   （這個出錯率太高了）」—— 逐名額各自對到扣課紀錄裡的那張票，並標出 #N。 */
ok('★ 簽到名單逐名額對到票（票券夾的 seatOf，來源是扣課紀錄）',
   /slotAt:n=>W\.seatOf\(b\.id,n\) \|\| W\.ticketOf\(b\.id\) \|\| fb,/.test(src)
   && /seatOf:\(bid,n\)=>byId\[\(seatTk\[bid\]\|\|\[\]\)\[Math\.max\(0,\(Number\(n\)\|\|1\)-1\)\]\]\|\|null,/.test(src));
ok('★ 每一列標出票券夾裡的第幾套（#N）＋方案名，能直接跟票券頁對照',
   /<div class="gr-tkname">\$\{tkNoTag\(_sl\.no\)\}\$\{_sl\.t\.plan_name\|\|'票券'\}/.test(src));
ok('　　補課券不參與先進先出推算（它一定有扣課紀錄；被「發它的那一堂」吃掉會顯示已用畢）',
   /const proxy=mine\.filter\(t=>t\.source!=='makeup'\)\.map\(/.test(src));
/* 2026-08-06：退路加一層 —— 同類別裡優先挑「不是補課券」的那張，
   否則沒關係的名額會被標成補課券（使用者：「補課就只要顯示補課的這一張」）。 */
ok('　　票券夾也蓋不到（舊系統匯入）才退回持有中／已過期／歷史，且退路不挑補課券',
   /const fb=_fbPick\(W\.active\('group'\)\) \|\| _fbPick\(W\.expired\('group'\)\) \|\| _fbPick\(W\.history\('group'\)\) \|\| null;/.test(src)
   && /const _fbPick=arr=>\(arr\|\|\[\]\)\.find\(x=>x&&x\.t&&x\.t\.source!=='makeup'\)/.test(src));
ok('　　單人課的票券卡也一起改（原本另有一套「以本堂為中心取 total 堂」的視窗推估）',
   /_wSlotD = W\.ticketOf\(b\.id\) \|\| \(b\.ticket_id\?W\.of\(b\.ticket_id\):null\);/.test(src)
   && !/以本堂為中心取 total 堂的視窗推估\n/.test(src));
ok('★ 圓點也改吃合併結果（票券夾的戳記；2026-08-04 起最新一張加畫無帳預約的紅圈）',
   /const bks=_shMark\(\(t\.id===_loTid\)\?sl\.stamps\.concat\(_lo\):sl\.stamps\);/.test(src)   /* 2026-08-04 共享票標註誰約的 */
   && /const circles=ticketTokens\(t,WAL\.stampsOf\(t\.id\),typeMap,usedCount,null,member_id,WAL\.selfBk\);/.test(src));
ok('　　舊的「最近那張團課票」猜法已經拿掉',
   !/_grpNewestP/.test(src) && !/_grpTkNewest/.test(src));
/* 2026-07-31 二修：會員端「我的票券」那份反查邏輯搬進票券夾，全系統共用同一份 */
ok('　　會員端「我的票券」也改吃票券夾',
   /const WAL=buildWallet\(SESSION\.id,\{tickets,bookings:_pool,logs,typeMap\}\);/.test(src)   /* 2026-08-04 共享池戳記標享 */
   && /原本這裡就是全系統唯一算對的一份（直連＋扣課紀錄反查），現在那份邏輯住在票券夾裡/.test(src));
ok('　　為什麼改，寫在程式裡',
   /續約、補課券、同日買兩張都是常態，這個猜法遲早會錯/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
