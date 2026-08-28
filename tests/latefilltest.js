/* 未付款的合約：票券照發、方案卡標「待付款」，櫃檯之後補收款（2026-08-28 使用者定案）

   這個需求改過三版，最後一版才是定案 —— 前兩版留在這裡當紀錄，因為它們各自
   踩到一個真的限制：

     一修「收款資訊之後再填」勾選框：三個欄位整組鎖起來、票券延後發。
       退場原因：使用者「還是就維持正常開合約 只是櫃檯再收款的時候保留付款調整的彈性」。
     二修「依角色自動判斷」（教練開的一律待收款）：
       退場原因：使用者澄清「教練的權限本來就不能建立合約 所以教練要建立合約
       必須要來公司操作用櫃檯帳號」—— 帳號一律是櫃檯，角色判斷根本判不出東西。
     三修（定案）：「只要付款狀態選未付款 就會先出現在會員方案顯示待付款」
       ＋「如果選擇『已付款』要有警告提示視窗」。

   所以最後的規則只有兩條：
     ・已付款 → 直接發票券並記營收，但按下去之前先跳確認（按錯＝錢沒收到卻記了帳）
     ・未付款 → 票券照發（客人可以先上課），方案卡標「待付款」，櫃檯點「收款」定案 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 前兩版都退乾淨了');
{
  ok('★★ 勾選框與 gtLaterSync／gtLaterOn 一個都不剩',
     !/id="gt-later"/.test(src) && !/gtLaterSync/.test(src) && !/gtLaterOn/.test(src));
  ok('★★ payload 的 pendingFill 旗標也拿掉了（不再有第二套發票路徑）',
     !/pendingFill/.test(src));
  ok('★★ 進審核佇列回到只有電子合約那一種',
     /if\(window\._grantSalesActive && window\._ctBody && window\._ctSignType==='remote'\)\{/.test(src));
  ok('★★ 三版的來龍去脈寫在原地（含「教練沒有建約權限」這條）',
     /勾選框與「依角色自動判斷」兩版都退場，改用\*\*既有的付款狀態\*\*/.test(src));
  ok('★★ 付款狀態回到直接讀欄位（沒有任何覆寫）',
     /payment_status:\(document\.getElementById\('gt-pay'\)\|\|\{\}\)\.value\|\|'paid',/.test(src));
}

console.log('\n② 選「已付款」要先確認（按錯＝錢沒收到卻記了帳）');
{
  const C=src.slice(src.indexOf("  if(P.payment_status==='paid'){"),
                    src.indexOf("  if(window._grantSalesActive && window._ctBody && window._ctSignType==='remote'){"));
  ok('★★ 只在 payment_status==="paid" 時擋（未付款按錯救得回來，不必攔）',
     /if\(P\.payment_status==='paid'\)\{/.test(C)
     && /「未付款」按錯還救得回來（方案卡會標待付款，櫃檯再收款就好）；/.test(src));
  ok('★★ 視窗上把應收金額做成最大那一塊（沿用 gr-amt-box，與櫃檯收款同一個語彙）',
     /<div class="gr-amt-box" style="margin:2px 0 12px;">/.test(C)
     && /<span class="gr-amt-v">\$\$\{_due\.toLocaleString\(\)\}<\/span>/.test(C));
  ok('★★ 分期要講明「這是第 1 期」與總額（不會讓人照總額收）',
     /分 \$\{installCount\} 期，這是<b>第 1 期<\/b>（總額 \$\$\{dealAmount\.toLocaleString\(\)\}）/.test(C));
  ok('★★ 折抵券也標出來', /已折抵券 ×\$\{voucherN\}（−\$\$\{voucherAmt\.toLocaleString\(\)\}）/.test(C));
  ok('★★ 講清楚按下去會發生什麼，並指出「還沒收到就改未付款」那條路',
     /按下去會<b>立刻發放票券<\/b>並記進今日營收。/.test(C)
     && /票券一樣會發、方案卡會標「待付款」，櫃檯收到再補上金額與付款方式。/.test(C));
  ok('★★ 兩顆鈕的字要能單獨讀懂', /'確認收到，發放票券', '返回修改'/.test(C));
  ok('★★ ⚠ 用 bkAskOverlay 不用 showModal —— 這一支是從儲值表單那張彈窗裡跑起來的',
     /await bkAskOverlay\(/.test(C)
     && /showModal 會把表單整個拆掉（0828 08:00 事故的同一個坑）/.test(src));
  ok('★★ 取消就整個不做（return，不會偷偷往下發票）', /\)\)\) return;/.test(C));
}

console.log('\n②-b 預設就是「未付款」（安全的那一邊）');
{
  ok('★★ gt-pay 的第一個選項是未付款、而且帶 selected',
     /<select id="gt-pay"><option value="unpaid" selected>未付款<\/option><option value="paid">已付款<\/option><\/select>/.test(src));
  ok('★★ 理由寫在原地', /預設「未付款」（2026-08-28 使用者指示）—— 安全的那一邊：/.test(src));
}

console.log('\n②-c 業績歸屬那一步：底列＝上一步／確認，沒選教練不給按');
{
  ok('★★ 底列與步驟 1／2 同一個形狀（左上一步、右確認）',
     /<div class="modal-foot"><button class="btn btn-ghost" onclick="grantGoStep\(2\)">上一步<\/button>\s*\n\s*<button class="btn btn-green" id="gt-attrib-go" disabled style="opacity:\.4;cursor:not-allowed;" onclick="attribConfirm\(\)">確認<\/button><\/div>/.test(src));
  ok('★★ 主責教練只標 ★，不預選（預選會讓人沒注意就按下去）',
     /<button type="button" class="bk-card" data-attrib="\$\{c\.id\}"/.test(src)
     && /主責教練只標 ★，\*\*不預選\*\*/.test(src));
  ok('★★ 選了才亮，而且按鈕上寫出選到誰（兩步防呆的第二步不能盲按）',
     /function attribSyncGo\(\)\{/.test(src)
     && /go\.disabled=!p;/.test(src)
     && /go\.textContent=p\?`確認：\$\{p\.name\}`:'確認';/.test(src));
  ok('★★ 舊的那條浮出確認列整條退場',
     !/gt-attrib-confirm'\); if\(bar\)/.test(src) && !/確認，繼續 →/.test(src));
  ok('★★ 0728 的防選錯沒有被放寬（仍是兩步：點卡 → 按確認）',
     /防選錯仍然是兩步（點卡 → 按確認），只是換了位置。/.test(src)
     && /async function attribConfirm\(\)\{\s*\n\s*const p=window\._attribPending; if\(!p\) return;/.test(src));
}

console.log('\n②-d 收款審核要提醒折價券（有才出現）');
{
  const A=src.slice(src.indexOf('async function openGrantApprove(id){'), src.indexOf('function grFillApply(P, quiet){'));
  ok('★★ 開窗時**現在**讀一次餘額，不是拿 payload 裡存的那份',
     /window\._grVouchers=\[\]; window\._grVoucherMax=0;/.test(A)
     && /現在讀一次餘額，不是拿 payload 裡存的那份：審核可能隔了幾天，券有機會被別筆用掉。/.test(src));
  ok('★★ 判準與賣票那一步同一份（VOUCHER_TT＋usable＋有餘額＋沒過期）',
     /VOUCHER_TT\[/.test(A)
     && /\(!t\.status\|\|t\.status==='usable'\)&&\(Number\(t\.sessions_remaining\)\|\|0\)>0/.test(A)
     && /\(!t\.expire_date\|\|String\(t\.expire_date\)\.slice\(0,10\)>=ymd\(TODAY\)\)/.test(A));
  ok('★★ 一張都沒有就整塊不畫（使用者：「如果有再出現」）',
     /\$\{_vHeld\?`<div class="form-row gr-vrow">/.test(A)
     && /一張沒有就整塊不畫（使用者：「如果有再出現」）/.test(src));
  ok('★★ 講出手上有幾張，而且改了會即時重算金額',
     /這位會員手上有 <b>\$\{_vHeld\}<\/b> 張/.test(A)
     && /id="gr-voucher" min="0" max="\$\{_vHeld\}" oninput="grFillPreview\(\)"/.test(A));
  ok('★ 效期近的先用（與訂位挑票同一個順序）',
     /\.sort\(\(a,b\)=>String\(a\.expire_date\|\|'9999'\)\.localeCompare\(String\(b\.expire_date\|\|'9999'\)\)\)/.test(A));

  /* 實跑：張數要夾三層，而且券的 id 要用重讀的那份 */
  const F=src.slice(src.indexOf('function grFillApply(P, quiet){'), src.indexOf('async function grantReqSaveFill(id){'));
  const splitSessions=(t,n)=>{const b=Math.floor(t/n),r=t%n;return Array.from({length:n},(_,i)=>b+(i<r?1:0));};
  const run=(P,v,held,ids)=>new Function('document','showToast','splitSessions','splitAmount','Object','Math','window',
      F+'\nreturn grFillApply;')(
        {getElementById:id=>(id in v)?{value:v[id]}:null}, ()=>{}, splitSessions, splitSessions, Object, Math,
        {_grVoucherMax:held, _grVouchers:(ids||[]).map(id=>({id}))})(P);
  const P={total:12, listPrice:14400, voucherN:0, voucherTkIds:[]};
  const r2=run(P,{'gr-amt':'14400','gr-method':'cash','gr-install':'1','gr-voucher':'2'},3,['V1','V2','V3']);
  eq('★★ 填 2 張 → 折 $600、實收 13800、用掉最先到期的兩張',
     [r2.voucherN, r2.voucherAmt, r2.paidAmount, r2.voucherTkIds], [2, 600, 13800, ['V1','V2']]);
  const r3=run(P,{'gr-amt':'14400','gr-method':'cash','gr-install':'1','gr-voucher':'9'},3,['V1','V2','V3']);
  eq('★★ 填超過持有量要夾回持有量', [r3.voucherN, r3.voucherTkIds], [3, ['V1','V2','V3']]);
  const r4=run(P,{'gr-amt':'14400','gr-method':'cash','gr-install':'3','gr-voucher':'3'},3,['V1','V2','V3']);
  eq('★★ 分期每期只能用 1 張（0729 定案）', [r4.voucherN, r4.voucherAmt, r4.voucherTkIds], [1, 300, ['V1']]);
  const r5=run(P,{'gr-amt':'14400','gr-method':'cash','gr-install':'1','gr-voucher':'-5'},3,['V1']);
  eq('　 負數夾回 0', r5.voucherN, 0);
  const r6=run({total:12,listPrice:14400,voucherN:2,voucherAmt:600,voucherTkIds:['OLD1','OLD2']},
               {'gr-amt':'14400','gr-method':'cash','gr-install':'1'},0,[]);
  eq('★★ 沒有券欄位（這一筆沒券可挑）時沿用 payload 裡那份',
     [r6.voucherN, r6.voucherTkIds], [2, ['OLD1','OLD2']]);
}

console.log('\n③ 未付款：方案卡標「待付款」＋一顆「收款」');
{
  ok('★★ 待付款章接在原本的狀態章後面（判定本身沒動）',
     /const stTag=tkStBadgeUsed\(t, used, total\)\s*\n[\s\S]{0,120}?\+\(t\.payment_status==='unpaid'/.test(src)
     && /<span class="tk-unpaid"/.test(src));
  ok('★★ 章上寫得出「錢還沒收到，但客人可以先上課」',
     /錢還沒收到 —— 票券已發、客人可以先上課；櫃檯收到後按卡上的「收款」/.test(src));
  ok('★★ 收款鈕只給櫃檯以上，而且只有 unpaid 的票才畫',
     /\$\{\(isDeskLike\(\)&&t\.payment_status==='unpaid'\)\?`<button class="btn btn-green btn-sm"[^`]*onclick="tkPayOpen\('\$\{t\.id\}'\)">收款<\/button>`:''\}/.test(src));
  ok('　 理由寫在原地（這一步會寫進營收，所以限櫃檯以上）',
     /只給櫃檯以上：這一步會寫進營收。/.test(src));
}

console.log('\n④ 收款視窗');
{
  const F=src.slice(src.indexOf('async function tkPayOpen(tkId){'), src.indexOf('async function grantReqPending(){'));
  ok('★★ 入口自己再擋一次權限與狀態（畫面藏起來不等於做不到）',
     /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可收款'\); return; \}/.test(F)
     && /if\(t\.payment_status!=='unpaid'\)\{ showToast\('這張票不是待付款'\); return; \}/.test(F));
  ok('★★ 只收「實收金額／付款方式／拆帳」——分期不給改',
     /<input type="number" id="tkp-amt"/.test(F) && /<select id="tkp-method"/.test(F)
     && /<input type="number" id="tkp-split"/.test(F)
     && !/id="tkp-install"/.test(F));
  ok('★★ 為什麼分期不能在這裡改，寫在原地',
     /分期方式\*\*不在這裡改\*\*：它決定發票當下開通幾堂，票已經發出去、堂數也已經開通，/.test(src)
     && /分期方式不在這裡改 —— 它決定發票當下開通幾堂，票已經發出去了才改會對不上。/.test(F));
  ok('★★ 實收金額即時預覽，算不出來就把確認鈕停用',
     /function tkPayPreview\(\)\{/.test(F)
     && /<span class="gr-amt-v gr-amt-wait">—<\/span>/.test(F)
     && /if\(go\)\{ go\.disabled=true; go\.style\.opacity='\.45'; go\.style\.cursor='not-allowed'; \} return; \}/.test(F));

  /* 實跑輸入驗證：與發放那一支同一組毛病（Number('')===0） */
  const R=src.slice(src.indexOf('function tkPayRead(){'), src.indexOf('function tkPayPreview(){'));
  const run=v=>new Function('document','Number',
    R+'\nreturn tkPayRead;')({getElementById:id=>(id in v)?{value:v[id]}:null}, Number)();
  eq('★★ 正常填', run({'tkp-amt':'14400','tkp-method':'cash'}), {amt:14400,method:'cash',split:null});
  eq('★★ 沒填金額 → null（不是變成 $0）', run({'tkp-amt':'','tkp-method':'cash'}), null);
  eq('　 只有空白也要擋', run({'tkp-amt':'  ','tkp-method':'cash'}), null);
  eq('★★ 拆帳超過總額 → null',
     run({'tkp-amt':'14400','tkp-method':'split','tkp-split':'99999'}), null);
  eq('★ 拆帳正常', run({'tkp-amt':'14400','tkp-method':'split','tkp-split':'7200'}),
     {amt:14400,method:'split',split:7200});
  eq('★ 明確打 0 合法（全額加贈）', run({'tkp-amt':'0','tkp-method':'cash'}), {amt:0,method:'cash',split:null});
}

console.log('\n⑤ 寫入：營收記在收款這一天');
{
  const G=src.slice(src.indexOf('async function _tkPayGo(){'), src.indexOf('async function grantReqPending(){'));
  ok('★★ 補寫一筆 purchases，不去改建約那天那一筆',
     /await dbPutPurchaseSafe\(\{id:uid\('PUR'\), member_id:t\.member_id/.test(G)
     && /note:`待付款補收（票券 \$\{t\.id\}）`/.test(G));
  ok('★★ 理由寫在原地（錢什麼時候到，帳就記在哪一天）',
     /營收記在\*\*收款這一天\*\*，不是建約那天 —— 錢什麼時候到，帳就記在哪一天。/.test(src));
  ok('★★ 票券標成已付款、實收累加（不是覆蓋）',
     /t\.payment_status='paid';/.test(G)
     && /t\.amount_paid=\(Number\(t\.amount_paid\)\|\|0\)\+v\.amt;/.test(G));
  ok('★★ 帳本留痕（adjust／0，不動堂數）',
     /await logTicket\(t\.id,'adjust',0,null,SESSION\.id,/.test(G)
     && /補收款 \$\$\{v\.amt\.toLocaleString\(\)\}/.test(G));
  ok('★★ 收款紀錄寫失敗要出聲，不能靜靜吞掉（票已經標成已付款了）',
     /showToast\('收款紀錄寫入失敗（票券已標為已付款，請補開）：'\+dbFriendlyError\(e\), 8000\); \}/.test(G));
  ok('★★ 重入防護：防連點＋再驗一次狀態',
     /return onceAct\('tkpay:'\+\(\(window\._tkPay\|\|\{\}\)\.id\|\|''\), _tkPayGo\)/.test(src)
     && /if\(t\.payment_status!=='unpaid'\)\{ showToast\('這張票已經收過款了'\); return; \}/.test(G));
  ok('★ 做完清快取並就地重畫會員資料',
     /dbCacheClear\(\['member_tickets','ticket_logs','purchases'\]\);/.test(G)
     && /if\(!\(await ppRefreshIfOpen\(t\.member_id\)\)\) navTo\(CUR_PAGE\);/.test(G));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
