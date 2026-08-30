/* 儲值金（2026-08-30 使用者定案）

   「[更換方案] 保留這筆營收　只是客人把部分付款要轉去其他方案」
   「不能退現　所以[作廢]要有退款跟轉儲值金的選項
     退款要有[全額][扣除20％手續費]的選項」
   「儲值金列在上方頁面＋儲值左邊」

   這一支盯的是**同一筆錢不能被算兩次、也不能憑空消失**：
     ・作廢→轉儲值金：營收保留（票券標 void_mode='credit'，_dayTk 放行）
     ・作廢→退款全額：營收沖掉（＝0728 以來的舊行為，不能被改壞）
     ・作廢→扣 20%：只留手續費那一段
     ・用儲值金買方案：折抵那一段不記營收，餘額同步扣掉 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* ── 共用沙盒：把真的函式挖出來跑 ───────────────────────────── */
function slice(from,to,label){
  const i=src.indexOf(from); const j=src.indexOf(to,i);
  if(i<0||j<0) throw new Error('切不到：'+label);
  return src.slice(i,j);
}
function sandbox(db, sessionId){
  const W={};
  const store=JSON.parse(JSON.stringify(db));
  const env={
    dbGet:async(t,id)=>{ const r=(store[t]||[]).find(x=>String(x.id)===String(id)); return r?JSON.parse(JSON.stringify(r)):null; },
    dbGetAll:async t=>JSON.parse(JSON.stringify(store[t]||[])),
    dbPut:async(t,rec)=>{ store[t]=store[t]||[];
      const i=store[t].findIndex(x=>String(x.id)===String(rec.id));
      if(i>=0) store[t][i]=JSON.parse(JSON.stringify(rec)); else store[t].push(JSON.parse(JSON.stringify(rec)));
      return rec; },
    dbCacheClear:()=>{},
    uid:p=>p+'-'+(env._n=(env._n||0)+1),
    SESSION:{id:sessionId||'S1',role:'front_desk'},
    isDeskLike:()=>true,
    showToast:m=>{ (env.toasts=env.toasts||[]).push(String(m)); },
    escH:x=>String(x==null?'':x),
    closeModal:()=>{}, navTo:()=>{}, CUR_PAGE:'members', PP:{id:null},
    onceAct:(k,fn)=>fn(),
    console,
    document:{ getElementById:id=>W._dom&&W._dom[id]||null, querySelectorAll:()=>[] },
    window:W, store,
  };
  return env;
}
function build(env, code, exportNames){
  const keys=Object.keys(env);
  const fn=new Function(...keys, code+'\nreturn {'+exportNames.map(n=>n+':typeof '+n+'!=="undefined"?'+n+':undefined').join(',')+'};');
  return fn(...keys.map(k=>env[k]));
}

/* creditMove ＋ 作廢那一整段（含 CREDIT_FEE_PCT） */
const CREDIT_SRC=slice('const CREDIT_FEE_PCT=20;','const CREDIT_SRC_LB=','儲值金核心');
const VOID_SRC=slice('async function voidTicketAsk(id){','/* 特例補退（2026-07-28','作廢');

console.log('① 規則寫在原地（改壞了要看得出來）');
{
  ok('★★★ 轉儲值金的作廢票不沖今日營收（_dayTk 放行 void_mode==="credit"）',
     /&&\(t\.status!=='refunded' \|\| t\.void_mode==='credit'\)/.test(src));
  ok('★★★ 「同一筆錢只會被認一次」寫在原地',
     /同一筆錢只會被認一次/.test(src));
  ok('★★ 手續費比例是常數，不是散在各處的 0\\.2',
     /const CREDIT_FEE_PCT=20;/.test(src) && src.split('CREDIT_FEE_PCT').length>6);
  ok('★★★ 儲值金不能退現，寫在畫面上（櫃檯會被客人問）',
     /不能退現/.test(src));
  ok('★★ 沒選出場方式不讓按（動錢的操作不給預設值）',
     /id="vd-go"\$\{amt>0\?' disabled/.test(src));
  ok('★★ 作廢有防連點（onceAct）',
     /async function voidTicketDo\(id\)\{ return onceAct\('voidtk:'\+id, \(\)=>_voidTicketDo\(id\)\); \}/.test(src));
  ok('★★★ 儲值金不與分期併用（期款分不出來）',
     /if\(isInstall && creditUse>0\)\{/.test(src));
  ok('★★ 續約獎金**沒有**為了儲值金開洞（作廢票仍不算續約，新票才算 → 一筆成交算一次）',
     /if\(t\.status==='refunded'\) return false;\s+\/\/ 2026-08-05/.test(src)
     && !/void_mode==='credit'[^\n]*sale_kind/.test(src));
  ok('★ 「更換方案」按鈕已移除，但函式留著（舊分頁按下去不會白畫面）',
     !/onclick="openSwapTicket\(/.test(src) && /async function openSwapTicket\(id\)\{/.test(src));
  ok('★★ 儲值金籤在「＋ 儲值」左邊',
     src.indexOf('class="pp-credit"') < src.indexOf(`onclick="ppTopUp('\${PP.id}')"`));
}

console.log('\n② 實跑：作廢的三種出場');
async function runVoid(mode, amt, opts){
  opts=opts||{};
  const db={
    members:[{id:'M1',name:'測試會員',credit_balance:opts.bal||0}],
    member_tickets:[{id:'TK1',member_id:'M1',plan_name:'私人教練課',status:'usable',
      sessions_total:10,sessions_remaining:10,amount_paid:amt}],
    bookings:[],
    purchases:amt?[{id:'PUR1',ticket_id:'TK1',member_id:'M1',deal_amount:amt,note:''}]:[],
    ticket_logs:[], member_credits:[],
  };
  const env=sandbox(db);
  env.window._dom={ 'void-reason':{value:opts.reason||''} };
  const api=build(env, CREDIT_SRC+'\n'+VOID_SRC,
    ['creditMove','creditOf','_voidTicketDo','voidTicketDo','CREDIT_FEE_PCT']);
  env.window._voidMode=mode; env.window._voidAmt=amt;
  await api._voidTicketDo('TK1');
  const tk=env.store.member_tickets[0];
  const pu=env.store.purchases[0]||null;
  return { status:tk.status, void_mode:tk.void_mode, amount_paid:tk.amount_paid,
    deal:pu?pu.deal_amount:null, bal:env.store.members[0].credit_balance,
    ledger:env.store.member_credits.map(r=>[r.source,r.delta]),
    logNote:(env.store.ticket_logs[0]||{}).note };
}

(async()=>{
  eq('★★★ 轉儲值金：營收保留（票券金額不動、收款不歸零），$12,000 進儲值金',
     await runVoid('credit',12000),
     { status:'refunded', void_mode:'credit', amount_paid:12000, deal:12000, bal:12000,
       ledger:[['void',12000]], logNote:'作廢・轉儲值金' });

  eq('★★★ 全額退款：與 0728 起的舊行為一致（票券與收款都歸零、不進儲值金）',
     await runVoid('refund_full',12000),
     { status:'refunded', void_mode:'refund_full', amount_paid:0, deal:0, bal:0,
       ledger:[], logNote:'作廢・全額退款' });

  eq('★★★ 扣 20％：退 $9,600、店裡留 $2,400 手續費（那 $2,400 仍算營收）',
     await runVoid('refund_fee',12000),
     { status:'refunded', void_mode:'refund_fee', amount_paid:2400, deal:2400, bal:0,
       ledger:[], logNote:'作廢・退款（扣 20％ 手續費）' });

  {
    const r=await runVoid('credit',12000,{bal:3000});
    eq('★★ 已經有餘額的人是**累加**，不是覆蓋', [r.bal, r.ledger], [15000,[['void',12000]]]);
  }
  {
    const r=await runVoid('credit',0);
    eq('★★ $0 的票（贈點之類）沒得選，走原本的退款路，不會憑空生出 $0 儲值紀錄',
       [r.void_mode, r.bal, r.ledger], ['refund_full',0,[]]);
  }
  {
    const r=await runVoid('refund_fee',9999);
    eq('★ 手續費四捨五入到元（不留小數，收銀機沒有角）', [r.amount_paid, 9999-r.amount_paid], [2000,7999]);
  }

  console.log('\n③ 實跑：儲值金的加減');
  {
    const env=sandbox({members:[{id:'M1',name:'A',credit_balance:5000}],member_credits:[]});
    const api=build(env, CREDIT_SRC, ['creditMove','creditOf','CREDIT_FEE_PCT']);
    eq('★★ creditOf 讀不到就是 0（不是 NaN）', [api.creditOf(null), api.creditOf({}), api.creditOf({credit_balance:'80'})], [0,0,80]);

    await api.creditMove('M1',-2000,'spend','TK9','購買折抵：團課');
    eq('★★★ 扣抵後餘額與帳本同步', [env.store.members[0].credit_balance,
       env.store.member_credits.map(r=>[r.source,r.delta,r.balance_after,r.ticket_id])],
       [3000, [['spend',-2000,3000,'TK9']]]);

    let threw='';
    try{ await api.creditMove('M1',-9999,'spend','TK9',''); }catch(e){ threw=String(e.message||e); }
    ok('★★★ 扣超過餘額要擋下來，不能扣成負的', /儲值金不足/.test(threw) && env.store.members[0].credit_balance===3000, threw);

    await api.creditMove('M1',0,'spend','TK9','');
    eq('　 扣 0 元不寫帳本（不要製造雜訊）', env.store.member_credits.length, 1);
  }

  console.log('\n④ 用儲值金買方案：折抵那一段不記營收');
  {
    /* _grantIssue 太長且相依太多，這裡只驗金額公式那三行的算法 */
    const m=src.match(/amount_paid:Math\.max\(0,\(isInstall\?Math\.max\(0,P\.firstAmount-P\.voucherAmt\):P\.paidAmount\)-_crUse\)/);
    ok('★★★ 票券的 amount_paid 扣掉儲值金折抵', !!m);
    ok('★★★ 收款紀錄的 deal_amount 也扣掉（否則首頁營收與票券兩邊會打架）',
       /const _dealRec=Math\.max\(0,\(isInstall\?Math\.max\(0,P\.firstAmount-P\.voucherAmt\):P\.paidAmount\)-_crUse\);/.test(src));
    ok('★★ 折抵金額另外存一欄（報表要分得出「收現多少、折抵多少」）',
       /credit_used:\(_crUse\|\|null\)/.test(src));
    ok('★★★ 發放當下重讀餘額 —— 電子合約可能隔幾天才審核，中間可能被別筆用掉',
       /if\(_crUse>_bal\)\{ showToast\(`儲值金只剩/.test(src));
    ok('★★★ 扣抵失敗要把票券金額改回全額收現，不能留下一張沒付到錢的票',
       /儲值金扣抵失敗，這筆先當成全額收現/.test(src)
       && /t\.amount_paid=\(isInstall\?Math\.max\(0,P\.firstAmount-P\.voucherAmt\):P\.paidAmount\);/.test(src));
    ok('★★ 折抵欄夾在「餘額」與「總金額」之間（不會做出負數收款）',
       /const use=Math\.max\(0,Math\.min\(raw,bal,amt\)\);/.test(src));
    ok('★★ 「確認已經收到錢了嗎？」的應收也扣掉折抵（不然櫃檯會多收）',
       /const _due=Math\.max\(0,\(isInstall\?Math\.max\(0,firstAmount-voucherAmt\):paidAmount\)-creditUse\);/.test(src));
  }

  console.log(`\n${pass} 通過 / ${fail} 失敗`);
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
