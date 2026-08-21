/* 2026-08-06 使用者回報（胡珺涵票券卡）：「這邊又顯示不對了」＋「為什麼一直在票券的地方有犯錯」

   查證（正式庫）：她 8/01 排了 8/13、8/20、8/27 三堂團課，當時手上沒有可用票券，
   系統當場有警告但沒有人處理 → 那三堂完全沒有扣課紀錄。
   今天她買了「團課 4週優惠」（4 堂），只有 8/20（會員自己報名時指定）與 9/10 被扣，
   8/13、8/27 仍是沒付費的課；票券卡因此只有 2 個真實戳記，另外兩格靠先進先出推算補上去
   —— 畫面看起來對、帳其實不對。

   修法：賣完票就問「這位會員有幾堂已排好、但當初沒扣到票的課，要用這張票補扣嗎」。
   不自動扣：有些名額本來就是教練負責的免費名額，交給櫃檯決定。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const ME='M-HJH';
const TODAY=new Date(2026,7,6);
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
/* 她的實況：8/13・8/20・8/27 是 8/01 排的（沒扣到票），9/10 是今天排的（有扣），
   另外有一堂教練課（不同課別）與一堂已過去的課，都不該被列進來。 */
const BKS=[
  {id:'b0813',date:'2026-08-13',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:[ME]},
  {id:'b0820',date:'2026-08-20',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:[ME]},
  {id:'b0827',date:'2026-08-27',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:[ME]},
  {id:'b0910',date:'2026-09-10',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:[ME]},
  {id:'bPast',date:'2026-07-30',start_time:'19:30',status:'checked_in',category:'小班肌力',member_ids:[ME]},
  {id:'bPT',  date:'2026-08-15',start_time:'11:00',status:'booked',category:'私人教練',member_id:ME},
  /* 分期待繳費保留：靠 note 的標記分辨（不是只看 pending_contract）——那套由開通下一期接手 */
  {id:'bHold',date:'2026-08-16',start_time:'11:00',status:'booked',category:'小班肌力',member_id:ME,member_ids:[ME],
   pending_contract:true,note:'分期待繳費保留（收款後自動補扣）'},
  /* 待簽約卡位（2026-08-21 楊慧淳 8/25 案例）：買了票就該問要不要補扣，原本被整批排除 */
  {id:'bPend',date:'2026-08-22',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:[ME],pending_contract:true},
  /* 0820 空堂（待安排）＝待簽約＋沒會員＋沒姓名：不屬於任何人，不能掃進來 */
  {id:'bOpen',date:'2026-08-23',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:[],pending_contract:true},
  {id:'bOther',date:'2026-08-18',start_time:'19:30',status:'booked',category:'小班肌力',member_ids:['M-OTHER']},
  /* 跑步機第二台：一點約兩台，第二台是影子預約、本來就不扣點（2026-08-06 黃麗琴案例） */
  {id:'bTm1',date:'2026-08-19',start_time:'17:00',status:'booked',category:'自主訓練',member_id:ME},
  {id:'bTm2',date:'2026-08-19',start_time:'17:00',status:'booked',category:'自主訓練',member_id:ME,sibling_of:'bTm1'},
];
const LOGS=[
  {id:'l1',ticket_id:'TK-4W',booking_id:'b0820',action:'deduct'},
  {id:'l2',ticket_id:'TK-4W',booking_id:'b0910',action:'deduct'},
  {id:'l3',ticket_id:'TK-4W',booking_id:'bX',   action:'deduct'},
  {id:'l4',ticket_id:'TK-4W',booking_id:'bX',   action:'refund'},   // 扣又退＝仍算沒付
];
const TKS=[{id:'TK-4W',member_id:ME,ticket_type_id:'tt-g',sessions_total:4,sessions_remaining:2}];
const env={
  dbGetAll:async t=>(t==='bookings'?BKS:(t==='ticket_logs'?LOGS:(t==='member_tickets'?TKS:[]))),
  bkHasMember:(b,mid)=>String(b.member_id||'')===String(mid)||(b.member_ids||[]).some(x=>String(x)===String(mid)),
  bkIsInstHold:b=>!!(b && b.pending_contract && b.member_id && !b.ticket_id
    && String(b.note||'').indexOf('分期待繳費保留')>=0),
  ymd, TODAY,
  ticketCategoryOf:()=> '小班肌力',
  categoryOfTypeId:()=> null,
};
const fn=new Function(...Object.keys(env), grabFn('unpaidFutureBookings')+'\nreturn unpaidFutureBookings;')(...Object.values(env));

(async()=>{
console.log('① 找出「已排好、但當初沒扣到票」的未來課');
{
  const r=await fn(ME,{id:'TK-4W'});
  eq('★ 只列 8/13、8/27、8/22 待簽約（8/20、9/10 已經有扣課紀錄）', r.map(b=>b.id), ['b0813','bPend','b0827']);
  ok('★★ 待簽約卡位也要列（2026-08-21 楊慧淳 8/25）—— 原本 !b.pending_contract 把它整批排除，'
     +'她續約時系統不會問，那堂就永遠沒付', r.some(b=>b.id==='bPend'));
  ok('★★ 但 0820 的空堂（待安排：沒綁會員）不能列', !r.some(b=>b.id==='bOpen'));
  ok('　　已經上過的不列（只補未來的）', !r.some(b=>b.id==='bPast'));
  ok('　　別的課別不列（教練課不能用團課票補扣）', !r.some(b=>b.id==='bPT'));
  ok('　　分期待繳費保留的不列（那是另一套流程，開通下一期由 bindHeldBookings 補綁；'
     +'這裡若插手會扣兩次）', !r.some(b=>b.id==='bHold'));
  ok('　　別人的課不列', !r.some(b=>b.id==='bOther'));
  ok('★ 依日期排（先補最近的一堂）', r[0].date < r[1].date);
}
{
  /* 同一支函式換成自主訓練票來問：主預約要列、第二台的影子預約不能列 */
  const env2=Object.assign({},env,{ticketCategoryOf:()=> '自主訓練'});
  const fn2=new Function(...Object.keys(env2), grabFn('unpaidFutureBookings')+'\nreturn unpaidFutureBookings;')(...Object.values(env2));
  const r=await fn2(ME,{id:'TK-SELF'});
  eq('★★ 跑步機第二台（影子預約）不算漏帳 —— 只列主預約',
     r.map(b=>b.id), ['bTm1']);
}

console.log('\n② 接線');
ok('★ 賣完票就問（不是靜默補扣）',
   /try\{ await askChargeUnpaid\(member_id, t\.id\); \}catch\(e\)\{ console\.error\('補扣未付款預約失敗',e\); \}/.test(src)
   && /async function askChargeUnpaid\(memberId, ticketId\)\{/.test(src));
ok('★ 只問到「這張票剩幾堂」為止（不會列出超過票能付的數量）',
   /const list=\(await unpaidFutureBookings\(memberId,tk\)\)\.slice\(0,left\);/.test(src));
ok('★ 沒有要補的就完全不打擾', /if\(!list\.length\) return;/.test(src));
ok('★ 視窗講清楚可以不補（教練負責的免費名額）',
   /教練負責的免費名額請選「先不補扣」。/.test(src)
   && />先不補扣<\/button>/.test(src));
ok('★ 補扣鈕是紅底（會扣票券，與全站顏色語彙一致）',
   /<button class="btn btn-red" onclick="doChargeUnpaid\(\)">確認補扣/.test(src));
ok('★ 逐堂重讀票券、扣不到就停（沿用餘額護欄）',
   /const tk=await dbGet\('member_tickets',p\.tid\);\n\s*if\(!tk \|\| !\(Number\(tk\.sessions_remaining\)>0\)\) break;/.test(src)
   && /if\(!\(await deductTicket\(tk,bid,SESSION\.id\)\)\) break;/.test(src));
ok('　　單人課要把票綁上去，團課只留帳（沒有 ticket_id 欄位）',
   /if\(!bkIsGroup\(b\) && !b\.ticket_id\)\{ b\.ticket_id=tk\.id;/.test(src));
ok('★★ 補扣完要清掉「待簽約」標記（同 0814 林韋綺：票綁回來卻留著標記，課卡會一直紅框寫待簽約）',
   /if\(b\.pending_contract\)\{ b\.pending_contract=false; _dirty=true; \}/.test(src)
   && /if\(_dirty\) await dbPut\('bookings',b\);/.test(src));
ok('　　補完就地重畫會員明細', /await ppLoadCtx\(\); ppRenderBody\(\);/.test(src));
ok('★ 影子預約不列（跑步機第二台不扣點）',
   /&& !b\.sibling_of                                   \/\/ 跑步機第二台的影子預約不扣點/.test(src)
   && /if\(b\.sibling_of\) return;/.test(src));
ok('★ 體驗／場租不列（本來就不扣票）',
   /&& b\.category!=='體驗' && b\.category!=='場租'      \/\/ 這兩種本來就不扣票/.test(src));
ok('★ 票券對帳巡檢也看得到全庫的這一類（第 ⑤ 段）',
   /⑤ 未來已排、但沒扣到票<\/div>/.test(src)
   && /if\(b\.category==='體驗' \|\| b\.category==='場租'\) return;/.test(src)
   && /if\(cnt\[mid\]>paid\) unpaidRows\.push\(/.test(src));
ok('　　放在畫面收尾之後（不會打斷原本的關窗/重畫）',
   /if\(_grantFromDetail\)\{_grantFromDetail=false;openMemberDetail\(member_id\);\}\n\s*else if\(!\(await ppRefreshIfOpen\(member_id\)\)\) navTo\(CUR_PAGE\);\n[\s\S]{0,400}await askChargeUnpaid/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
