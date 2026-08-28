/* 合約先建立、收款資訊留給櫃檯補（2026-08-28 使用者指示）

   「這邊可以先建立合約嗎? 付款方式等客戶付款再填寫 付款方式跟分期
     因為教練一堂堂的上課 有時候沒時間處理會員的合約 就可以先把合約打好
     後續交給櫃檯處理」

   使用者定案（同日問答）：
     ・票券**等櫃檯收完款才發**（不是先發票後補錢）
     ・可以先不填的三個欄位：總金額、付款方式、分期方式

   為什麼一定要延後發票券：這三欄決定「這次開通幾堂」（分期）與「營收算現金還是匯款」。
   先發票就等於先記了一筆算不出來的帳。

   這一支最重要的一條在 ③：**櫃檯補填後的重算，必須與賣票當下那一段算出同樣的數字**。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 教練端：一個開關，三個欄位一起交出去');
{
  ok('★★ 步驟 2 有這個開關，而且講明「票券等櫃檯收到款項才發」',
     /<label class="gt-later"><input type="checkbox" id="gt-later" onchange="gtLaterSync\(\)">/.test(src)
     && /合約先成立、時段先留著；<b>票券等櫃檯收到款項才發<\/b>。/.test(src));
  ok('★★ 三個欄位（含拆帳、折抵券）整組鎖起來，付款狀態強制未付款',
     /\['gt-amount','gt-method','gt-splitcash','gt-install','gt-voucher'\]\.forEach\(id=>\{/.test(src)
     && /if\(pay\)\{ if\(on\)\{ pay\.value='unpaid'; \} pay\.disabled=on;/.test(src));
  ok('★★ 只鎖不清值 —— 取消勾選要能原樣回來', /只鎖不清值 —— 取消勾選要能原樣回來/.test(src));
  ok('★★ 送出時三個欄位放安全的預設值，並標記 pendingFill',
     /const dealAmount=_later\?0:\(Number\(document\.getElementById\('gt-amount'\)\.value\)\|\|listPrice\);/.test(src)
     && /const method=_later\?'':document\.getElementById\('gt-method'\)\.value;/.test(src)
     && /const installCount=\(_later\|\|!plan\.installment\)\?1:\(Number\(document\.getElementById\('gt-install'\)\.value\)\|\|1\);/.test(src)
     && /const voucherN = _later \? 0 : Math\.max\(0, Math\.min\(/.test(src)
     && /pendingFill:_later\|\|false,/.test(src));
  ok('★★ 理由寫在原地（為什麼一定要延後發票券）',
     /為什麼一定要延後發票：這三個欄位決定開通堂數（分期）與營收分類\s*\n\s*（現金／匯款），先發票就等於先記了一筆算不出來的帳。/.test(src));
}

console.log('\n② 票券不當場發，改進「待收款」佇列');
{
  ok('★★ 待補填與電子合約共用同一條「先建合約、送待審核」的路',
     /if\(window\._grantSalesActive && window\._ctBody && \(window\._ctSignType==='remote' \|\| P\.pendingFill\)\)\{/.test(src));
  ok('★★ 紙本＋待補填：signed_at 直接給值，否則「合約尚未簽回」會把櫃檯永遠擋在外面',
     /signed_at:\(_isRemote\?null:new Date\(\)\.toISOString\(\)\),/.test(src)
     && /否則審核那關的「合約尚未簽回」會把櫃檯永遠擋在外面。/.test(src));
  ok('★★ 應收金額待補填時不要算出一個假的數字',
     /const _amt=P\.pendingFill\?0:\(isInstall\?Math\.max\(0,firstAmount-voucherAmt\):paidAmount\);/.test(src));
  ok('★★ 待審核清單顯示「收款時填」，不是 $0',
     /\$\{\(r\.payload&&r\.payload\.pendingFill\)\s*\n\s*\? '<span>應收<\/span><b class="gr-item-fill">收款時填<\/b>'/.test(src));
  ok('★ 只有電子合約才推播叫會員去簽（紙本已經簽在紙上了）',
     /if\(_isRemote\)\{ try\{ await pushNotification\(member_id,'announce','合約待簽名',/.test(src));
  ok('★ 教練看到的吐司要講清楚下一步在櫃檯',
     /合約已建立：\$\{plan\.name\}　·　已進「待收款」名單，櫃檯收款時補上金額與付款方式才會發票券/.test(src));
}

console.log('\n③ 櫃檯補填：重算要與賣票當下一模一樣');
{
  const A=src.slice(src.indexOf('async function openGrantApprove(id){'), src.indexOf('function grFillApply(P, quiet){'));
  /* 2026-08-28 二修（使用者：「維持正常開合約 只是櫃檯再收款的時候保留付款調整的彈性」）——
     欄位改成**一律**可編輯：教練填了預帶他填的、沒填就空著等櫃檯填。
     _fill 只剩「上方那句說明要講哪一種」。 */
  ok('★★ 收款這一步一律可編輯（總金額／付款方式／拆帳／分期）',
     /const _fill=!!P\.pendingFill;/.test(A)
     && /\$\{`<div class="gr-fill">/.test(A)
     && /收款這一步一律可編輯，不再只有「待補填」那種才給。/.test(src)
     && /<input type="number" id="gr-amt"/.test(A)
     && /<select id="gr-method"/.test(A)
     && /<input type="number" id="gr-splitcash"/.test(A)
     && /<select id="gr-install" onchange="grFillPreview\(\)">/.test(A));
  ok('★★ 標題與按鈕都換掉（這一步不是核對，是填寫）',
     /\$\{_fill\?'填寫收款資訊・發放票券':'確認收款・發放票券'\}/.test(A)
     && /\$\{_fill\?'填好了・發放票券':'確認收款・發放票券'\}/.test(A));
  ok('★ 分期會改變開通堂數與約別，視窗上就講明白',
     /分期會改變<b>這次開通幾堂<\/b>與約別，發放前一定要確定。/.test(A));

  /* 實跑：把「賣票當下」與「櫃檯補填」兩段算式餵同一組輸入，結果必須相同 */
  const F=src.slice(src.indexOf('function grFillApply(P, quiet){'), src.indexOf('async function grantReqApprove(id){'));
  const splitSessions=(t,n)=>{ const b=Math.floor(t/n), r=t%n;
    return Array.from({length:n},(_,i)=>b+(i<r?1:0)); };
  const splitAmount=(t,n)=>{ const b=Math.floor(t/n), r=t%n;
    return Array.from({length:n},(_,i)=>b+(i<r?1:0)); };
  const mkDoc=v=>({getElementById:id=>(id in v)?{value:v[id]}:null});
  const run=(P,v)=>new Function('document','showToast','splitSessions','splitAmount','Object','Math',
      F+'\nreturn grFillApply;')(mkDoc(v), ()=>{}, splitSessions, splitAmount, Object, Math)(P);

  const P={total:12, listPrice:14400, sale_kind:'renewal'};
  const r1=run(P,{'gr-amt':'14400','gr-method':'cash','gr-install':'1'});
  eq('★★ 不分期：開通全部堂數、第 1 期＝全額',
     [r1.dealAmount, r1.isInstall, r1.unlocked, r1.firstAmount, r1.installment], [14400,false,12,14400,null]);
  eq('★★ 不分期不動約別（教練選的續約要留著）', r1.sale_kind, 'renewal');

  const r3=run(P,{'gr-amt':'14400','gr-method':'transfer','gr-install':'3'});
  eq('★★ 分 3 期：堂數與金額都照 splitSessions／splitAmount 切',
     [r3.installCount, r3.unlocked, r3.firstAmount, r3.installment.segments, r3.installment.amounts],
     [3, 4, 4800, [4,4,4], [4800,4800,4800]]);
  eq('★★ 只有第 1 期算已付、目前開通到第 1 段',
     [r3.installment.paid, r3.installment.current], [[true,false,false], 1]);
  eq('★★ 分期一律把約別改成「分期」（與步驟 2 的自動判定同一條規則）', r3.sale_kind, 'installment');

  const rOdd=run({total:10, listPrice:9990},{'gr-amt':'9990','gr-method':'cash','gr-install':'3'});
  eq('★ 除不盡時前面幾期各多 1（與賣票當下同一支函式，不另寫一份）',
     [rOdd.installment.segments, rOdd.installment.amounts], [[4,3,3],[3330,3330,3330]]);

  const rSplit=run(P,{'gr-amt':'14400','gr-method':'split','gr-splitcash':'7200','gr-install':'1'});
  eq('★★ 拆帳：現金金額存得下來', [rSplit.method, rSplit.splitCash], ['split', 7200]);
  eq('★★ 拆帳超過總額要擋下（回 null，呼叫端不往下做）',
     run(P,{'gr-amt':'14400','gr-method':'split','gr-splitcash':'99999','gr-install':'1'}), null);
  /* ⚠ Number('')===0 且 isFinite(0)===true —— 只靠 Number 過濾會靜靜發出一張 $0 的票 */
  eq('★★ 沒填金額要擋下（不是變成 $0）', run(P,{'gr-amt':'','gr-method':'cash','gr-install':'1'}), null);
  eq('　 只有空白也要擋下', run(P,{'gr-amt':'   ','gr-method':'cash','gr-install':'1'}), null);
  eq('★ 明確打 0 是合法的（全額加贈）',
     (run(P,{'gr-amt':'0','gr-method':'cash','gr-install':'1'})||{}).dealAmount, 0);

  ok('★★ 待補填那條折抵券一律 0（教練沒挑、櫃檯這一步也不開放）',
     [r1.voucherN, r1.voucherAmt].join()==='0,0' && JSON.stringify(r1.voucherTkIds)==='[]'
     && /要用券就走一般流程/.test(src));
  /* 2026-08-28 二修：教練已經挑過券的正常合約，櫃檯在這裡改收款方式不該把券洗掉 */
  {
    const PV={total:12, listPrice:14400, pendingFill:false, voucherN:2, voucherAmt:600,
              voucherTkIds:['V1','V2'], sale_kind:'new'};
    const rv=run(PV,{'gr-amt':'14400','gr-method':'cash','gr-install':'1'});
    eq('★★ 正常合約：折抵券原封不動留著，實收＝金額−折抵',
       [rv.voucherN, rv.voucherAmt, rv.voucherTkIds, rv.paidAmount], [2, 600, ['V1','V2'], 13800]);
    const rvi=run(PV,{'gr-amt':'14400','gr-method':'cash','gr-install':'3'});
    eq('★★ 櫃檯改成分期時張數要夾成 1（0729 定案：分期每期限用 1 張）',
       [rvi.voucherN, rvi.voucherAmt, rvi.voucherTkIds], [1, 300, ['V1']]);
  }
  eq('★★ 補填完 payment_status 轉成已付款、pendingFill 收掉',
     [r1.payment_status, r1.pendingFill], ['paid', false]);
  ok('★★ 警語寫在原地（兩條路的算法必須一致）',
     /這裡的算法必須與賣票當下那一段\*\*一模一樣\*\*（splitSessions／splitAmount／/.test(src));
}

console.log('\n④ 發放：先重算再發，而且留下是誰填的');
{
  ok('★★ 發放前一律先過 grFillApply（不只待補填），失敗就中止',
     /const _p=grFillApply\(r\.payload\);\s*\n\s*if\(!_p\)\{ done\(\); return; \}/.test(src)
     && /一律重算（2026-08-28 二修）：收款這一步永遠可編輯，所以不論教練有沒有填，/.test(src));
  ok('★★ 重算後的 payload 與應收金額寫回待審核那一筆（之後查帳看得到）',
     /r\.payload=_p;\s*\n\s*r\.amount=Number\(_p\.isInstall\?Math\.max\(0,_p\.firstAmount-_p\.voucherAmt\):_p\.paidAmount\)\|\|0;\s*\n\s*r\.filled_by=SESSION\.id; r\.filled_at=new Date\(\)\.toISOString\(\);/.test(src));
  ok('★★ 發放仍走同一支 _grantIssue（沒有第二套發票邏輯）',
     /const t=await _grantIssue\(r\.payload\);/.test(src)
     && (src.match(/_grantIssue\(r\.payload\)/g)||[]).length===1);
  ok('★★ 未簽回照樣完全擋住（0813 定案沒有被這次改動放寬）',
     /if\(r\.contract_id && !signed\)\{ showToast\('合約尚未簽回/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
