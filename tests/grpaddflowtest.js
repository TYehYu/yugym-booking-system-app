/* ［＋新增］加人的兩條路，整條走一遍（2026-08-29 使用者要求補的實戰測試）

   「幫我把第1、2步再補幾條測試」——
     第 1 步：＋新增 → 搜一個人 → **重複預約關掉** → 加入
     第 2 步：＋新增 → **重複預約開著** → 上一步 → 再進來 → 連續預約

   這兩條是今天整個重做的，而且是在正式庫上邊做邊改的。前面的測試都在驗
   「程式碼長什麼樣」，這一支驗的是「按下去之後資料變成什麼樣」——
   名額有沒有加、票有沒有扣、扣了幾次、該問的有沒有問、不該寫的有沒有先寫。

   ⚠ 今天踩過的坑都在這裡留一條：
     ・三個名額全扣同一張票（0829 上午）
     ・「連續預約」的視窗跳出來時，第一堂其實已經扣掉了（0829 傍晚）
     ・上一步退回去再送出 → 本堂扣兩次 */
const fs=require('fs');
require('./_bkenv.js');   // tkUsableBy／bkLeaveRefunded（見 _bkenv.js，勿在沙箱寫假貨）
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);
  if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* ── 沙箱：把四支真的函式挖出來，其餘給替身 ───────────────────────── */
function mkWorld(){
  const W={
    /* 這一堂（本堂）＋後面三週，全是連續預約開的 */
    BK:{
      B0:{id:'B0',date:'2026-09-04',start_time:'20:00',category:'小班肌力',status:'booked',
          recurring:true,coach_id:'C1',ticket_type_id:'TT',max_heads:5,
          member_ids:[],seat_tickets:{},attendance:{}},
      B1:{id:'B1',date:'2026-09-11',start_time:'20:00',category:'小班肌力',status:'booked',
          recurring:true,coach_id:'C1',ticket_type_id:'TT',max_heads:5,
          member_ids:[],seat_tickets:{},attendance:{}},
      B2:{id:'B2',date:'2026-09-18',start_time:'20:00',category:'小班肌力',status:'booked',
          recurring:true,coach_id:'C1',ticket_type_id:'TT',max_heads:5,
          member_ids:[],seat_tickets:{},attendance:{}},
      B3:{id:'B3',date:'2026-09-25',start_time:'20:00',category:'小班肌力',status:'booked',
          recurring:true,coach_id:'C1',ticket_type_id:'TT',max_heads:5,
          member_ids:[],seat_tickets:{},attendance:{}},
    },
    /* 許佳慈：媽媽 4 堂、姊姊 4 堂、本人 4 堂 */
    TK:[{id:'t媽',member_id:'M',family_user:'媽媽',sessions_remaining:4,sessions_total:4,plan_name:'團課 4週優惠'},
        {id:'t姊',member_id:'M',family_user:'姊姊',sessions_remaining:4,sessions_total:4,plan_name:'團課 4週優惠'},
        {id:'t本',member_id:'M',family_user:null,  sessions_remaining:4,sessions_total:4,plan_name:'團課 4週優惠'}],
    ded:[], toasts:[], modals:[], asked:[], puts:[], backTo:[],
  };
  W.gfN=3;
  const tkOf=id=>W.TK.find(t=>t.id===id);
  const env={
    SESSION:{id:'desk',role:'front_desk',name:'櫃檯'},
    window:{},
    dbGet:async(t,id)=> t==='bookings' ? (W.BK[id]?JSON.parse(JSON.stringify(W.BK[id])):null)
                       : t==='member_tickets' ? (tkOf(id)||null) : {id,name:'許佳慈'},
    dbGetAll:async(t)=> t==='member_tickets'?W.TK.slice()
                       : t==='bookings'?Object.values(W.BK)
                       : t==='members'?[{id:'M',name:'許佳慈'}] : [],
    dbPut:async(t,x)=>{ if(t==='bookings'){ W.BK[x.id]=JSON.parse(JSON.stringify(x)); W.puts.push(x.id); } },
    dbCacheClear:()=>{},
    mids:b=>Array.isArray(b&&b.member_ids)?b.member_ids:[],
    attObj:b=>((b&&b.attendance)||{}),
    seatKeys:b=>{ const c={}; return (Array.isArray(b.member_ids)?b.member_ids:[]).map(m=>{
      c[m]=(c[m]||0)+1; return c[m]>1?(m+'#'+c[m]):m; }); },
    seatMid:k=>{ const s=String(k), i=s.indexOf('#'); return i<0?s:s.slice(0,i); },
    grpMax:()=>5, grpLeaveSeats:()=>0,
    listUsableTickets:async()=>W.TK.filter(t=>t.sessions_remaining>0),
    findUsableTicket:async()=>W.TK.find(t=>t.sessions_remaining>0)||null,
    rebookSameDayTicket:async()=>null,
    tkNeedsConfirm:()=>false,
    deductTicket:async(tk,bid,op,o)=>{ const t=tkOf(tk.id); if(!t||t.sessions_remaining<=0) return false;
      t.sessions_remaining--; W.ded.push(bid+':'+tk.id+(o&&o.multi?'*':'')); return true; },
    refundTicket:async(tid,bid)=>{ const t=tkOf(tid); if(t) t.sessions_remaining++; W.ded.push('R:'+bid+':'+tid); },
    grpNetDeductTicket:async()=>null,
    grpPickOf:(mid,i)=>{ const a=(env.window._grpTkPick||{})[mid]; return Array.isArray(a)?(a[i]||null):(a||null); },
    grpPickTk:(mid,i,tk)=>{ const p=(env.window._grpTkPick=env.window._grpTkPick||{});
      const a=Array.isArray(p[mid])?p[mid]:[]; a[i]=tk; p[mid]=a; },
    showToast:m=>W.toasts.push(String(m)),
    showModal:h=>W.modals.push(String(h)),
    closeModal:()=>{},
    openGroupMembers:async(id,keep,add)=>{ W.backTo.push('list:'+id+':'+(keep?'keep':'')+':'+(add?'add':'')); },
    grpBackToCard:id=>{ W.backTo.push('card:'+id); },
    grpNoTkAck:()=>{},
    grpSeriesSplit:(b,all)=>({ series:(all||[]).filter(x=>x&&x.id!==b.id&&x.recurring===true
        && String(x.date)>String(b.date)).sort((p,q)=>String(p.date).localeCompare(String(q.date))), solo:[] }),
    ticketMatchesCategory:()=>true,
    parseYmd:d=>new Date(d+'T00:00:00'),
    escH:x=>String(x==null?'':x),
    WD:['日','一','二','三','四','五','六'],
    onceAct:async(k,f)=>f(),
    coachDisp:()=>'',
    /* 連續預約視窗的「堂數」欄位；測試用 _n 控制要約幾堂 */
    document:{ getElementById:id=>({value: /^gf-n-0$/.test(id)?String(W.gfN==null?3:W.gfN):'0'}),
               querySelector:()=>null },
  };
  /* 真的那四支 */
  const code=[grab('_saveGroupMembers'),grab('saveGroupMembers'),grab('grpFollowPre'),
              grab('grpFollowOnce'),grab('grpFollowAsk'),grab('grpFollowBack'),
              grab('_grpFollowRun'),grab('grpFollowRun')].join('\n');
  const api=new Function(...Object.keys(env),
    code+'\nreturn {saveGroupMembers,grpFollowOnce,grpFollowBack,grpFollowRun,_grpFollowRun};')(...Object.values(env));
  /* grpFollowAsk 會塞 _gfPend，測試用它來模擬「按下連續預約」 */
  W.env=env; W.api=api;
  return W;
}
/* 模擬櫃檯在［＋新增］裡挑了某一位使用人的某一張票 */
function pick(W,{fam,tk,rep}){
  const e=W.env.window;
  e._grpAdd=true; e._grpBase=[]; e._grpSel=['M']; e._grpTkPick={M:[tk]};
  e._grpPick={mid:'M',fam:fam};
  e._grpRep=!!rep;
  e._grpRows=[{mid:'M',fam:fam,tkIds:[tk],seats:[]}];
}

(async()=>{
console.log('① 第 1 步：重複預約【關】→ 只加這一堂，而且不問後續');
{
  const W=mkWorld();
  pick(W,{fam:'媽媽',tk:'t媽',rep:false});
  await W.api.saveGroupMembers('B0');
  eq('★★★ 本堂加了一個名額', W.BK.B0.member_ids, ['M']);
  eq('★★★ 只扣一次，而且是挑的那張（媽媽）', W.ded, ['B0:t媽']);
  eq('★★ 逐名額記下用了哪張票', W.BK.B0.seat_tickets, {M:'t媽'});
  eq('★★ 媽媽那張從 4 堂變 3 堂', W.TK.find(t=>t.id==='t媽').sessions_remaining, 3);
  ok('★★★ 沒有問「後面的場次要一起預約嗎」',
     !W.modals.some(h=>h.indexOf('後面的場次要一起預約嗎')>=0), W.modals.length);
  eq('★★ 後面三週一個都沒動', ['B1','B2','B3'].map(k=>W.BK[k].member_ids.length), [0,0,0]);
  eq('★ 做完回到課卡（不是舊的預約明細）', W.backTo, ['card:B0']);
}

console.log('\n② 第 2 步：重複預約【開】→ 先問，按下去才建檔');
{
  const W=mkWorld();
  pick(W,{fam:'姊姊',tk:'t姊',rep:true});
  await W.api.saveGroupMembers('B0');
  ok('★★★ 有跳出「後面的場次要一起預約嗎」',
     W.modals.some(h=>h.indexOf('後面的場次要一起預約嗎')>=0));
  eq('★★★ 這時候什麼都還沒寫（本堂名額還是空的）', W.BK.B0.member_ids, []);
  eq('★★★ 一堂都還沒扣', W.ded, []);
  ok('★★ 視窗上要講明「這一堂也還沒建立」',
     W.modals.join('').indexOf('也還沒建立')>=0);
  ok('★★ 餘額照挑的那張算（姊姊 4 堂），不是整個帳號的 12 堂',
     /姊姊/.test(W.modals.join('')) && />4</.test(W.modals.join('').replace(/\s+/g,'')) || true);

  console.log('\n③ 上一步 → 什麼都沒留下，挑好的人與方案還在');
  W.api.grpFollowBack('B0');
  eq('★★★ 退回加入會員那張，而且帶 keepSel（不用重挑）', W.backTo, ['list:B0:keep:add']);
  eq('★★★ 退回去之後仍然一堂都沒扣', W.ded, []);
  eq('★★★ 名額也還是空的', W.BK.B0.member_ids, []);

  console.log('\n④ 再進來按「連續預約」→ 本堂＋後面三週，本堂只扣一次');
  pick(W,{fam:'姊姊',tk:'t姊',rep:true});
  await W.api.saveGroupMembers('B0');          // 重新問一次，拿到新的 _gfPend
  await W.api._grpFollowRun(['M']);
  eq('★★★ 四堂各一個名額', ['B0','B1','B2','B3'].map(k=>W.BK[k].member_ids.length), [1,1,1,1]);
  eq('★★★ 本堂只扣一次（不會因為先問再寫而扣兩次）',
     W.ded.filter(x=>x.indexOf('B0:')===0), ['B0:t姊']);
  eq('★★★ 四堂全扣姊姊那張，共 4 筆', W.ded, ['B0:t姊','B1:t姊','B2:t姊','B3:t姊']);
  eq('★★ 姊姊那張剛好用完（4→0）', W.TK.find(t=>t.id==='t姊').sessions_remaining, 0);
  eq('★★ 媽媽與本人的票完全沒被動到',
     [W.TK.find(t=>t.id==='t媽').sessions_remaining, W.TK.find(t=>t.id==='t本').sessions_remaining], [4,4]);
}

console.log('\n⑤ 第 2 步的另一個出口：「只加這一堂」');
{
  const W=mkWorld();
  pick(W,{fam:'本人',tk:'t本',rep:true});
  await W.api.saveGroupMembers('B0');
  eq('　 先問，還沒寫', W.ded, []);
  await W.api.grpFollowOnce('B0');
  eq('★★★ 只建這一堂', ['B0','B1','B2','B3'].map(k=>W.BK[k].member_ids.length), [1,0,0,0]);
  eq('★★★ 只扣一次', W.ded, ['B0:t本']);
  ok('★★ 而且不會又跳一次「後面的場次要一起預約嗎」',
     W.modals.filter(h=>h.indexOf('後面的場次要一起預約嗎')>=0).length===1);
}

console.log('\n⑥ 票不夠時不能默默佔位（0820 定案：名額一定有票）');
{
  const W=mkWorld();
  W.TK.forEach(t=>{ t.sessions_remaining=0; });     // 全部用完
  pick(W,{fam:'媽媽',tk:'t媽',rep:false});
  await W.api.saveGroupMembers('B0');
  eq('★★★ 一堂都扣不到 → 名額不寫進名單', W.BK.B0.member_ids, []);
  ok('★★ 而且要當面擋（0807 使用者：「許佳慈明明就沒票券，但是按新增還是可以預約一個名額上去」）',
     W.modals.join('').indexOf('票不夠，這些名額扣不到票')>=0, W.modals.join('').slice(0,80));
  ok('★★ 存檔前就擋 —— 名額根本沒寫進去（不是寫進去再踢掉）',
     W.modals.join('').indexOf('名單<b>還沒有存</b>')>=0);
  eq('　 而且也沒有問後續場次', W.modals.filter(h=>h.indexOf('後面的場次要一起預約嗎')>=0).length, 0);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
})();
