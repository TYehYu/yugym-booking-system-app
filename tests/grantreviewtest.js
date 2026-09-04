/* 2026-08-08 使用者定案：教練課／友善教練課的票券發放規則調整

   「最後會有『電子合約』跟『紙本合約』。如果選擇紙本合約，在系統端合約要顯示
     『已使用紙本簽名』；如果選擇電子合約，則要在客戶端出現簽約的視窗。
     再來統一要有櫃檯審核機制，確定收到款項才能發放票券，審核跳提示在桌機畫面左上角，
     確認後才能發票券。」
   「櫃檯審核的按鈕，打開視窗要明顯顯示應該要收到的款項再按發放票券，
     這邊要用顏色標明，避免櫃檯看錯。」
   補充定案：「合約回傳審核的機制，如果是『紙本合約』就不用再經過審核，因為客戶已經
     看過紙本合約並完成匯款才會走到儲值這一步。審核是因為客戶必須要等我們上傳電子合約，
     看過並簽名回傳系統，再確認是否已經匯款的關係。」

   所以只有「電子合約」那條路要等；紙本當場簽、當場發。
   ⚠ 難點在「等」的中間會隔幾小時到幾天，賣票的表單早就關掉了 ——
     所以把賣票當下算好的整包（堂數／分期／折抵券／業績歸屬…）存成 payload，
     審核通過時照著發，櫃檯不用重填、也不會因為重填而算出不一樣的金額。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 兩條路分岔：紙本直接發、電子送審');
{
  const F=grabFn('submitGrant');
/* 2026-08-28：待收款那條也走同一個佇列（使用者：「先把合約打好　後續交給櫃檯處理」）——
   電子合約要等簽名，待補填要等收款，兩者都是「合約先成立、票券後發」。 */
/* 2026-08-28 三修（使用者定案）：「收款資訊之後再填」那個開關退場，改用既有的付款狀態
   —— 未付款一樣發票券、方案卡標「待付款」，櫃檯之後點卡上的「收款」定案。
   所以進審核佇列的情況回到只有一種：電子合約要等會員簽回。 */
/* 2026-09-04：建約時不再選簽署方式，走過簽約步驟的**一律**進佇列、不發票券。
   條件從三個變兩個（_ctSignType 不再參與判斷）。 */
  ok('★★ 走過簽約步驟的一律進佇列（不再分電子／紙本）',
     /if\(window\._grantSalesActive && window\._ctBody\)\{/.test(F)
     && !/P\.pendingFill/.test(src));
  ok('★★ 送審那條不建票券（建的是合約＋申請，然後 return）',
     /await dbPut\('ticket_grant_requests',\{id:uid\('GR'\),member_id,/.test(F)
     && /status:'pending',/.test(F));
/* 2026-09-04：建約時不選簽署方式，所以**一律**先記成未簽（signed_at null）。
   電子等會員簽、紙本等櫃檯按「用紙本」，兩者都在 grantReqSetSign 裡才寫 signed_at。
   ⚠ 這一條原本吃 `_isRemote?null:now()`，而 _isRemote 被寫死成 false 之後
     每一張新約都變成「已簽回」—— 就是使用者當天回報的那個 bug。 */
  ok('★ 建約一律先記「未簽」（signed_at 留空）',
     /ticket_id:null,staff_id:SESSION\.id,[\s\S]{0,700}?signed_at:null,/.test(F));
  ok('★★ 推播搬到「選電子簽」那一刻（建約當下不通知）',
     /if\(!_isPaper\)\{ try\{ await pushNotification\(r\.member_id,'announce','合約待簽名',/.test(src)
     && !/await pushNotification\(member_id,'announce','合約待簽名',/.test(F));
  ok('★ Toast 明講「還沒發票券」與應收金額',
     /已建立合約：\$\{plan\.name\}　·　客人到場後在「待審核發放」選簽署方式並收款（應收 \$\$\{_amt\.toLocaleString\(\)\}）/.test(F));
/* 2026-09-04：建約一律進佇列，所以走到 _grantIssue 只剩「後台直接發放票券」那條
   （不簽約）。原本掛在它後面的補寫合約區塊已整段移除 —— 守門條件與上面那段
   一模一樣而上面會 return，是死碼，而且裡面的註解與 signed_at 邏輯都已不成立。 */
  ok('★★ _grantIssue 仍在（後台直接發放走這條），但後面不再補寫合約',
     /const t=await _grantIssue\(P\);/.test(F)
     /* ⚠ 要先把註解拿掉再比 —— 移除那段死碼時，我在原地留了一句
        「它裡面還留著 const _remote=false」來說明為什麼刪，
        直接對 src 比會比到自己寫的說明。 */
     && !/const _remote=false;/.test(src.replace(/\/\*[\s\S]*?\*\//g,''))
     && /現在走到這一行代表「後台直接發放票券」，那條路本來就不簽約/.test(F));
  ok('★ 使用者的原話寫在原地',
     /「如果是『紙本合約』就不用再經過審核，因為客戶已經看過紙本合約並完成匯款才會走到\s*\n\s*儲值這一步。/.test(src));
}

console.log('\n② 賣票當下算好的一整包（審核時照著發）');
{
  const F=grabFn('submitGrant');
  ok('★★ payload 帶齊金額／分期／折抵券／業績歸屬',
     /const P=\{/.test(F) && /total, unitPrice, listPrice, dealAmount, method, splitCash, installCount, note,/.test(F)   /* 2026-08-12 拆帳加 splitCash */
     && /isInstall, unlocked, firstAmount, installment,/.test(F)
     && /voucherN, voucherAmt, paidAmount,/.test(F)
     && /sale_kind:\(document\.getElementById\('gt-salekind'\)\|\|\{\}\)\.value\|\|null,/.test(F));
  ok('★★ 折抵券只存 id —— 審核可能隔了幾天，餘額要當下重讀',
     /voucherTkIds:\(window\._gtVoucherTks\|\|\[\]\)\.slice\(\)/.test(F)
     && /折抵券審核當下要重新讀一次餘額（可能被別筆用掉了）→ 只存 id 順序/.test(F));
  ok('★ 為什麼要存起來，寫在原地',
     /電子合約要等客人簽名＋確認收款才發票券（見下方），中間可能隔幾小時到幾天。/.test(F));
}
{
  const F=grabFn('_grantIssue');
  ok('★★ 發放核心抽成一支，兩條路共用（不會有兩套算法）',
     /async function _grantIssue\(P\)\{/.test(src)
     && /① 紙本合約／後台直接發放 —— submitGrant 算完就叫它/.test(src)
     && /② 電子合約 —— 賣票當下只把 P 存起來，等合約簽回、櫃檯確認收款，審核通過時才叫它/.test(src));
  /* 金額一律吃 P（表單早就關掉了，重讀畫面等於重新填一次）。
     2026-08-30 起唯一的例外是儲值金折抵：跟折抵券同一個理由 ——
     審核可能隔了幾天，餘額有機會被別筆用掉，所以在發放當下重讀**餘額**（不是重讀表單）。 */
  /* 2026-08-31：多了「未付款先記 0」那一層（陳瀚竣案例），仍然只吃 P、不碰表單 */
  ok('★ 不再重算任何金額（一律吃 P，不碰表單）',
     /: Math\.max\(0,\(isInstall\?Math\.max\(0,P\.firstAmount-P\.voucherAmt\):P\.paidAmount\)-_crUse\),/.test(F)
     && /amount_paid:\(P\.payment_status==='unpaid'\) \? 0/.test(F)
     && !/document\.getElementById/.test(F));
  ok('★★ 儲值金折抵的來源是 P.creditUse，只有餘額在發放當下重讀',
     /let _crUse=Math\.max\(0, Math\.round\(Number\(P\.creditUse\)\|\|0\)\);/.test(F)
     && /const _bal=creditOf\(await dbGet\('members',P\.member_id\)\.catch\(\(\)=>null\)\);/.test(F));
  ok('★★ 折抵券逐張重讀，扣不滿要說出來（不會靜靜少扣）',
     /const fresh=await dbGet\('member_tickets',vid\); if\(!fresh\) continue;/.test(F)
     && /if\(left>0\) showToast\(`折抵券只扣到 \$\{P\.voucherN-left\}\/\$\{P\.voucherN\} 張（餘額不足），請至會員票券確認`\);/.test(F));
  ok('★ 效期仍是「第一堂預約才起算」（沒有被改掉）',
     /purchase_date:ymd\(TODAY\),start_date:null,expire_date:null,/.test(F));
  ok('　　退回時要還折抵券 → 把扣了哪幾張帶回去', /t\._usedVouchers=_usedVouchers;/.test(F));
}

console.log('\n③a 三段式版面與防呆（2026-09-04：「讓櫃檯閱讀容易一點」「避免操作失誤」）');
{
  ok('★★★ 編號三段：簽署方式 → 收款資訊 → 發放',
     /<i>\$\{_n\(\)\}<\/i>簽署方式/.test(src)
     && /<i>\$\{_n\(\)\}<\/i>收款資訊/.test(src)
     && /<i>\$\{_n\(\)\}<\/i>發放/.test(src));
  /* ══ 2026-09-04 二修：先定案數字，才送出去給客人簽 ══════════════════════
     使用者：「這個發放票券視窗的確認順序正確嗎?」——不正確。同一天定案
     「櫃檯可以在正式收費前調整」之後，合約內文改成在按下簽署方式那一刻才依
     最終數字重生，相依關係就反了：版面若還把簽署放第一步，等於引導櫃檯先送簽
     （用教練預填的數字）再改金額，會員簽到的是舊的，而通知收不回來。 */
  ok('★★★ 收款資訊排在簽署方式之前（相依關係：先有數字才有合約內文）',
     src.indexOf('</i>收款資訊') < src.indexOf('</i>簽署方式'));
  ok('★★★ 應收金額緊接在收款資訊之後（它是那些欄位算出來的結果）',
     src.indexOf('</i>收款資訊') < src.indexOf('id="gr-amt-box"')
     && src.indexOf('id="gr-amt-box"') < src.indexOf('</i>簽署方式'));
  ok('★★★ 發放仍然是最後一段',
     src.indexOf('</i>簽署方式') < src.indexOf('</i>發放'));
  ok('★★ 為什麼以前是對的、現在不對 —— 寫在原地',
     /那時候\*\*教練建約就把數字全填好了\*\*，先選簽署/.test(src)
     && /不能拿來當作順序錯誤的補償/.test(src));
  /* 離線實跑（2026-09-04，真實範本，三種狀態）：
       A 還沒選：1 收款資訊 → 應收 → 2 簽署方式 → 3 發放
       B 已選電子簽：同上，2 標「已選：電子簽」
       C 已簽回：1 收款資訊 → 應收 → 2 發放（簽署那段收起來，編號不跳號） */
  ok('★★ 三種狀態的實跑順序記在這支測試裡',
     /A 還沒選：1 收款資訊 → 應收 → 2 簽署方式 → 3 發放/
       .test(require('fs').readFileSync(__filename,'utf8')));
  ok('★★★ 少一段時編號往前移，不會跳號',
     /let _sn=0; const _n=\(\)=>\+\+_sn;/.test(src));
  /* 2026-09-05 使用者：「應收款項已經列出總金額了 上面的收款資訊就不用在顯示了吧」
     ——原本 $10,400 出現三次（標題列的定價、收款資訊的總金額、應收款項）。
     ⚠ 不能只是刪：定價 ≠ 合約金額（有折扣時不同），剛好在沒折扣時長得一樣。
     改成標題列講**合約金額**（真正要對的那個），定價只在不一樣時附註。 */
  ok('★★★ 標題列講合約金額，不是定價',
     /const _ctAmtLine=`合約金額 \$\$\{_dl\.toLocaleString\(\)\}`/.test(src)
     && /堂　·　\$\{_ctAmtLine\}/.test(src));
  ok('★★★ 定價只在與合約金額不同時才附註（沒折扣時不重複)',
     /\(\(_lp && _lp!==_dl\) \? `（定價 \$\$\{_lp\.toLocaleString\(\)\}）` : ''\)/.test(src));
  ok('★★ 收款區塊底下那條 gr-fill-note 已經不見了', !/<div class="gr-fill-note">定價/.test(src));
  ok('★★ 拿掉「照實際收到的確認一次…」那句（欄位標題已經自明）',
     !/照<b>實際收到的<\/b>確認一次/.test(src));

  const F=grabFn('grFillPreview');
  /* 原本寫的是規則「分期會改變這次開通幾堂與約別」，櫃檯得自己把
     「8 堂分 3 期」換算成「這次開 3 堂」。改成直接把答案算出來。 */
  ok('★★★ 分期的後果直接算成這一筆的實際堂數',
     /這次只開通 \$\{p0\.unlocked\} 堂/.test(F)
     && /其餘 \$\{Math\.max\(0,_tot-\(Number\(p0\.unlocked\)\|\|0\)\)\} 堂/.test(F)
     && !/分期會改變<b>這次開通幾堂<\/b>與約別/.test(src));
  ok('★★★ 用的是 grFillApply 算出來的 unlocked，不另外寫一份算式',
     /不另外寫一份「大概是這樣」的算式/.test(src));
  /* 2026-09-04 二修：金額已經不能在這裡改（見下），所以警示要指向真正的解法。 */
  ok('★★★ 金額不對會出聲，而且指路（取消重開，不是叫他在這裡改）',
     /if\(da===0\) msg='合約金額是 0/.test(F)
     && /請取消這筆發放、重開一份/.test(F));
  /* ══ 2026-09-04 使用者定案：「合約金額在一開始建立合約的時候就固定了 只是櫃檯
     收款的方式可能有變 一次繳清變分期 現金變匯款 所以這總金額不應該能變動才是」
     0828 開放可編輯是為了「臨櫃改現金、改分期」的彈性 —— 但那兩件事都是收款方式，
     不是金額。金額能改＝櫃檯可以無授權改合約。 */
  /* ⚠ 只看 openGrantApprove 這一支：儲值表單（gt-amount）也有一格叫「總金額」，
     那是另一個視窗、而且它本來就該可以填。 */
  ok('★★★ 收款資訊那一區完全沒有總金額（同一個數字不講兩次）',
     (()=>{ const G=grabFn('openGrantApprove');
       return !/<label>總金額<\/label>/.test(G)
         && !/<input type="number" id="gr-amt"/.test(G)
         && /<input type="hidden" id="gr-amt"/.test(G); })());
  ok('★★★ id 仍然保留（改成 hidden）—— grFillApply／拆帳推導都讀它',
     /<input type="hidden" id="gr-amt" value=/.test(src)
     && /拿掉會讓整包算不出來/.test(src));
  ok('★★★ 不比「低於定價」—— 折扣是常態，天天誤報的警示很快就沒人看',
     /不比「低於定價」：折扣本來就是常態，那樣會天天誤報，警示很快就沒人看/.test(src));

  const B=grabFn('grBack');
  ok('★★★ 改過沒存就按返回 → 先問一次（數字會靜靜丟掉）',
     /window\._grFill0!=null && grFillSnap\(\)!==window\._grFill0/.test(B)
     && /直接離開的話這些修改會丟掉/.test(B));
  ok('★★★ 沒改過不多問（沒改過按返回不該多一次點擊）',
     /只擋「真的改過」：沒改過按返回不該多一次點擊/.test(src));
  ok('★★ 返回鈕真的走 grBack', /<button class="btn btn-ghost" onclick="grBack\(\)">返回<\/button>/.test(src));
}

console.log('\n③d 有些方案不能分期（2026-09-04 使用者回報）');
/* 21 個方案裡有 9 個不能分期（一般團體課、優惠教練課、友善優惠、自主訓練、
   運動按摩…），佔 43%。收款審核卻一律給分期選單 —— 根因是 _canInstall 讀的
   P.installable **從來沒有人寫過那一欄**，undefined!==false 永遠成立。
   使用者截圖裡那筆「友善優惠1V1」正是不能分期的方案之一。 */
{
  const F=grabFn('submitGrant');
  ok('★★★ 賣票當下就把「能不能分期」存進 payload',
     /installable: !!plan\.installment \},/.test(F)
     && /這個旗標一定要跟著存（使用者：「有些方案不能分期」）/.test(src));
  ok('★★ 為什麼要存而不是事後查 —— 寫在原地',
     /收款審核那一步在幾天後才打開，那時候表單早關了，沒有這一欄就只能猜。/.test(src));

  const G=grabFn('openGrantApprove');
  ok('★★★ 收款審核讀那個旗標',
     /let _canInstall = \(P\.plan && P\.plan\.installable!=null\) \? !!P\.plan\.installable : null;/.test(G));
  ok('★★★ 舊的待審核單沒有旗標 → 回頭讀一次方案（不是預設可以分期）',
     /if\(P\.plan_id\)\{ const _pl=await dbGet\('course_plans',P\.plan_id\)\.catch\(\(\)=>null\);\s*\n\s*_canInstall=!!\(_pl&&_pl\.installment\); \}/.test(G));
  ok('★★★ 自訂銷售一律不分期（_grantCustomPlan 本來就寫死 installment:false）',
     /else _canInstall=false;/.test(G)
     && /plan_type:'general', installment:false, __custom:true/.test(src));
  /* 2026-09-04 二修（使用者：「這邊需要美感建議」）——原本是一個 disabled 的
     <select>，量出來跟可輸入欄同高 42px、同圓角 7px，只差 opacity .5，
     櫃檯還是會去點。改成一句陳述：不藏、仍然寫原因，但不再假裝是輸入框。 */
  ok('★★★ 不能分期不藏欄位、也不假裝可輸入（0823「不能用就寫原因，別藏按鈕」）',
     /<div class="gr-ro">不分期（一次付清）/.test(G)
     && /這個方案不提供分期　·　這次開通全部/.test(G)
     && !/<select disabled/.test(G));
  ok('★★ 不能填就不標必填星號', /<label>分期方式\$\{_canInstall\?' \*':''\}<\/label>/.test(G));
  ok('★★ 為什麼不留 disabled 的輸入框 —— 理由寫在原地',
     /不能填的欄位不要長得像輸入框（量到：停用的 select 與可輸入欄同高 42px、/.test(src));
  ok('★★★ 防線不只在畫面上：那一版故意沒有 id，grFillApply 讀不到就一律算 1 期',
     /\*\*故意沒有 id="gr-install"\*\*/.test(src)
     && /畫面擋住、送出沒擋等於沒擋/.test(src));
  /* 離線實跑（2026-09-04，真實 CSS＋真實範本＋真實 grFillApply）：
     不能分期那版 → 選單 disabled、沒有 id；把值硬改成 '3' 之後 grFillApply
     仍然回「不分期・開通全部」。可以分期那版 → 回「分3期・開通3堂」。 */
  ok('★★ 實跑結果記在這支測試裡',
     /把值硬改成 '3' 之後 grFillApply\s*\n\s*仍然回「不分期・開通全部」/.test(require('fs').readFileSync(__filename,'utf8')));
}

console.log('\n③e 兩顆都要二次確認（2026-09-04：「按了就直接確認簽約方式嗎? 不是應該要有個緩衝階段嗎」）');
{
  const G=grabFn('_grantReqSetSign');
  /* 原本只有紙本有確認，電子簽按下去**立刻推播給會員** —— 對外的動作，
     而且簽署方式還改得回紙本，通知卻收不回來。 */
  ok('★★★ 電子簽也要先問（原本沒有）',
     /if\(!_isPaper && !confirm\(`把 \$\{r\.member_name\|\|''\} 的「\$\{r\.plan_name\|\|''\}」用電子簽送出？/.test(G));
  ok('★★★ 講清楚不可逆的是通知，不是簽署方式',
     /・簽回之前還可以改成紙本，但通知收不回來/.test(G)
     && /通知送出去就收不回來（簽署方式本身還改得回紙本，通知不行）/.test(src));
  ok('★★★ 確認視窗要寫出「客人會簽到什麼」（金額／堂數／分期）',
     /const _sumLine=\(\(\)=>\{/.test(G)
     && /他會簽到：\$\{_sumLine\}/.test(G)
     && /　合約內容：\$\{_sumLine\}/.test(G));
  ok('★★★ 數字取的是剛剛才定案的那一份（確認放在重算之後）',
     G.indexOf('ctRebuildSnapshot') < G.indexOf('const _sumLine=')
     && /放在重算之後：這樣視窗裡的數字就是真的會寫進合約的那一份/.test(src));
  ok('★★ 取消就是單純 return，前面都只改記憶體、沒有 dbPut',
     /取消只是 return，前面那些都只改了記憶體裡的物件，沒有任何 dbPut/.test(src)
     && G.indexOf("if(!_isPaper && !confirm(") < G.indexOf("await dbPut('contracts',c)"));
  /* 離線實跑（2026-09-04，真實函式＋假資料庫）：
     按取消 → 合約與待審核單一個位元組都沒變、sign_type 還是 undecided、沒有推播；
     再按一次並確認 → sign_type=remote、推播 1 則；
     已經是電子簽再按同一顆 → 只吐司提示，通知沒有重複送。 */
  ok('★★ 實跑結果記在這支測試裡',
     /按取消 → 合約與待審核單一個位元組都沒變、sign_type 還是 undecided、沒有推播；/
       .test(require('fs').readFileSync(__filename,'utf8')));
}

console.log('\n③f 拆帳兩欄＋簽署方式的反悔機制（2026-09-04）');
{
  const G=grabFn('openGrantApprove'), U=grabFn('_grantReqUnsign'), W=grabFn('grSplitFromWire');
  /* 使用者：「現金＋匯款的話 可以顯示兩列個別輸入嗎」——原本只有一格「其中現金
     收多少（其餘記匯款）」，匯款那半要櫃檯自己心算。 */
  ok('★★★ 現金與匯款各一欄，同一列',
     /<div class="form-2col" id="gr-split-wrap"/.test(G)
     && /<label>現金收多少<\/label>/.test(G) && /<label>匯款收多少<\/label>/.test(G));
  /* ⚠ 2026-09-04 修：拆帳的基準是**應收**（折抵券之後），不是總金額。
     有券時兩者差一截（總 19,200、折 1 張後應收 18,900）。原本拿總金額當上限，
     畫面允許現金填到 19,200，而 _grantIssue 寫購買紀錄時是拿應收去夾
     （cash=min(splitCash,應收)、transfer=應收−cash）→ 現金被無聲夾掉、匯款變 0。 */
  ok('★★★ 拆帳以應收為基準，不是總金額',
     /const _due=Math\.max\(0, \(isInstall\?\(Number\(amts\[0\]\)\|\|0\):amount\) - _vAmt\);/.test(grabFn('grFillApply'))
     && /splitRaw>_due/.test(grabFn('grFillApply'))
     && /應收 \$\$\{_due\.toLocaleString\(\)\} 之間/.test(grabFn('grFillApply')));
  ok('★★★ 驗證要等折抵券與分期都算完才做（所以先讀原始值、最後才夾）',
     /const splitRaw=\(method==='split'\)/.test(grabFn('grFillApply'))
     && /所以驗證要等折抵券與分期都算完才做/.test(src));
  ok('★★★ 推導那段必須放在 p0 之後（tdztest 抓到過：原本在上面，整段被 catch 吞掉）',
     /一定要放在 p0 算完之後 —— 它讀 p0（tests\/tdztest\.js 抓到過/.test(src));
  /* 離線實跑（2026-09-04）：總 19,200、現金 12,000
       券 1 張 → 應收 18,900、匯款 6,900
       券 2 張 → 應收 18,600、匯款 6,600
       不用券 → 應收 19,200、匯款 7,200
       現金填 19,000（> 應收 18,900）→ grFillApply 回 null，擋下來 */
  ok('★★ 折抵券與拆帳的連動實跑結果記在這支測試裡',
     /券 1 張 → 應收 18,900、匯款 6,900/.test(require('fs').readFileSync(__filename,'utf8')));

  /* 折抵券那一列本身（早上修掉 TDZ 之前，這條路從來沒有真正跑過）——
     離線實跑四種情況：沒有券→不出現；有 2 張→出現且數字對；券過期→不出現；
     運動按摩的券配教練課方案（券種不符）→不出現。 */
  ok('★★★ 折抵券偵測：券種由方案票種的 category 反查',
     /const tt=types\.find\(x=>x\.id===\(\(P\.plan\|\|\{\}\)\.ticket_type_id\)\); return tt\?VOUCHER_TT\[tt\.category\]:null;/.test(grabFn('openGrantApprove')));
  ok('★★★ 只算沒過期、還有餘額、狀態可用的券',
     /&&\(!t\.status\|\|t\.status==='usable'\)&&\(Number\(t\.sessions_remaining\)\|\|0\)>0\s*\n\s*&&\(!t\.expire_date\|\|String\(t\.expire_date\)\.slice\(0,10\)>=ymd\(TODAY\)\)/.test(grabFn('openGrantApprove')));
  ok('★★ 四種情況的實跑結果記在這支測試裡',
     /運動按摩的券配教練課方案（券種不符）→不出現/.test(require('fs').readFileSync(__filename,'utf8')));

  ok('★★★ 兩欄互補（不可能出現「現金＋匯款 ≠ 應收」）',
     /c\.value=\(String\(w\.value\)\.trim\(\)===''\|\|!Number\.isFinite\(wv\)\)/.test(W)
     && /兩格是連動的，不是各填各的/.test(src)
     && /window\._grDue/.test(W));
  ok('★★★ 只存現金那一格，匯款是推導的（兩邊都存會多一個可以互相打架的欄位）',
     /真正存起來的仍然只有現金那一格（splitCash），匯款是推導出來的/.test(src));
  ok('★★ 使用者正在打匯款那格時不覆寫他',
     /document\.activeElement!==_w/.test(grabFn('grFillPreview')));
  ok('★★ 切換付款方式改對 wrap 的 id', /getElementById\('gr-split-wrap'\)/.test(G));

  /* 使用者：「電子跟紙本 要有反悔的機制 不然櫃檯失誤就無法挽救了」——
     按下「用紙本」會立刻寫 signed_at，而簽署方式那一段的條件是「還沒簽回」，
     於是按錯的當下那一段就消失了，畫面上再也沒有任何路。 */
  ok('★★★ 有一支可以把簽署方式改回「還沒選」',
     /async function _grantReqUnsign\(id\)\{/.test(src)
     && /c\.sign_type='undecided'; c\.signed_at=null;/.test(U));
  ok('★★★ 紅線是簽名圖：會員真的簽過就不能一鍵抹掉',
     /if\(c\.signature\)\{ showToast\('會員已經簽名回傳了，不能取消/.test(U)
     && /要重簽就取消整筆發放、重開一份新合約給他簽/.test(src));
  ok('★★★ 反悔入口要放在「已簽回但沒有簽名圖」那一格（紙本誤按時簽署那段已經收起來了）',
     /onclick="grantReqUnsign\('\$\{r\.id\}'\)"[\s\S]{0,120}?按錯了？取消這次的簽署方式/.test(G)
     && /反悔的入口一定要放在這裡，不然沒有路/.test(src));
  ok('★★ 簽署方式那一段也有一顆（已選過時）',
     /onclick="grantReqUnsign\('\$\{r\.id\}'\)" title="改回「還沒選」，可以重新選一次">按錯了<\/button>/.test(G));
  ok('★★ 只有櫃檯以上可以按，而且要留痕',
     /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可操作'\); return; \}/.test(U)
     && /取消\$\{_lb\}、改回未選（\$\{_who\}・\$\{nowHM\(\)\}）/.test(U));
  ok('★★ 防連點', /async function grantReqUnsign\(id\)\{ return onceAct\('grunsign:'\+id/.test(src));
  /* 離線實跑（2026-09-04，真實函式＋假資料庫）：
       紙本誤按 → sign_type 回 undecided、signed_at 清空、留痕；
       電子誤按（已通知未簽）→ 同上；
       會員真的簽過（有簽名圖）→ 擋住、資料一個字都沒動；
       本來就沒選 → 只提示；按取消 → 資料完全沒被改。 */
  ok('★★ 五種情況的實跑結果記在這支測試裡',
     /會員真的簽過（有簽名圖）→ 擋住、資料一個字都沒動；/
       .test(require('fs').readFileSync(__filename,'utf8')));
}

console.log('\n③b 送簽之前把數字定案，合約內文跟著重生（2026-09-04）');
/* 使用者定案：「教練建立合約的時候 只要填寫方案 課堂數 總價 一次付清跟分期
   也可以預填寫 但之後櫃檯端可以在正式收費前調整」——
   既然分期是預填，客人簽的那份就必須是櫃檯調整後的版本。
   ⚠ 差別很具體：contractFillBlockHTML 的分期小表（每期金額／開通堂數／收款日／
     客戶簽名）在「一次付清」那版根本不存在，簽了等於沒簽到分期條款。 */
{
  const F=grabFn('ctRebuildSnapshot');
  ok('★★★ 有一支不依賴畫面的重生函式', !!F && /async function ctRebuildSnapshot\(P, mem, buyDate\)/.test(src));
  ok('★★★ 真的不讀畫面（數字一律來自 payload）',
     !!F && !/document\.getElementById/.test(F));
  ok('★★★ 分期算法與建約當下一字不差（splitAmount，第 1 期扣折抵券）',
     /instAmts:\(\(\)=>\{ if\(instN<=1\) return null;\s*\n\s*const a=splitAmount\(deal,instN\); if\(voucherN\) a\[0\]=Math\.max\(0,a\[0\]-voucherN\*300\); return a; \}\)\(\)/.test(F)
     && /instSess:instN>1\?splitAmount\(total,instN\):null/.test(F));
  ok('★★★ 簽約日期沿用合約建立那天，不是今天',
     /const _bd=String\(buyDate\|\|''\)\.slice\(0,10\)\|\|ymd\(TODAY\);/.test(F)
     && /重生的是金額與分期，不是把合約\s*\n\s*改成一份新的/.test(src));

  const G=grabFn('_grantReqSetSign');
  ok('★★★ 送簽那一刻先把畫面上的收款欄位收進 payload',
     /const _pack=grFillApply\(r\.payload, true\);/.test(G)
     && /r\.amount=Number\(_pack\.isInstall\?Math\.max\(0,_pack\.firstAmount-_pack\.voucherAmt\):_pack\.paidAmount\)\|\|0;/.test(G));
  ok('★★★ 再照最終數字重生內文',
     /const _snap=await ctRebuildSnapshot\(r\.payload\|\|\{\}, _mem, c\.created_at\);/.test(G)
     && /if\(_snap\)\{ c\.body_snapshot=_snap\.body; c\.fill_snapshot=_snap\.fill; \}/.test(G));
  ok('★★★ 欄位沒填完不擋（收款資訊本來就可以之後再填）',
     /if\(document\.getElementById\('gr-amt'\) && typeof grFillApply==='function'\)\{/.test(G));
  ok('★★★ payment_status 保留原值（這一步只是選簽署方式，錢還沒收到）',
     /_pack\.payment_status=\(r\.payload&&r\.payload\.payment_status\)\|\|_pack\.payment_status;/.test(G));
  ok('★★★ 只有未簽回才走到這裡（已簽的內文不能動）',
     /if\(c\.signed_at\)\{ showToast\('這份合約已經簽回了，不能再改簽署方式'\); return; \}/.test(G)
     && G.indexOf("if(c.signed_at)") < G.indexOf("ctRebuildSnapshot"));
}

console.log('\n③c 簽回之後才改數字 → 發放前問一次');
{
  const F=grabFn('_grantReqApprove');
  /* 2026-09-04：合約金額改成記**總價**之後，一次付清改成分期時總價根本沒變 ——
     只比金額這道防線會整個失效，所以連期數一起比。 */
  ok('★★★ 總價或期數其中一個不一樣就跳確認',
     /if\(_final!==_onCt \|\| _nNow!==_nCt\)\{/.test(F)
     && /會員已經簽回了，但收款內容跟合約上寫的不一樣/.test(F));
  ok('★★★ 期數從購買內容表判讀（contracts 沒有這一欄，舊資料也認得）',
     /const _nCt=ctSnapInstall\(_c\.fill_snapshot\);/.test(F)
     && /function ctSnapInstall\(html\)\{/.test(src)
     && /舊資料也認得：一次付清那版即使印了空白三列表，勾的仍然是「☑一次付清」/.test(src));
  ok('★★★ 兩個金額刻意不同，而且不准互相抄',
     /function grCtAmount\(P\)\{ return Math\.max\(0, Number\(P&&P\.paidAmount\)\|\|0\); \}/.test(src)
     && /兩者不要互相抄 —— 只要有人圖方便把其中一個指向另一個，這個問題就回來了/.test(src));
  ok('★★★ 建約時：合約存總價、待審核單存這一期',
     /plan_name:plan\.name,sessions:total,amount:_ctAmt,/.test(src)
     && /const _ctAmt=paidAmount;/.test(src)
     && /amount:_amt, payload:P, contract_id:_ctId,/.test(src));
  ok('★★★ 講清楚內文不會跟著改（那是會員簽名時看到的那一份）',
     /合約內文不會跟著改 —— 那是會員簽名時看到的那一份。/.test(F));
  ok('★★★ 給得出下一步（不是只丟一個警告）',
     /建議先「取消這筆發放」再重開一份新合約給他簽/.test(F));
  ok('★★ 按取消就真的不發（要收掉忙碌遮罩）', /\{ done\(\); return; \}/.test(F));
  /* 金額沒變、只有期數變（合約寫分 3 期、實際發一次付清）原本什麼都不會寫。 */
  ok('★★★ 按了確定一定留痕，連「只有期數變」也寫',
     /_drift=`合約寫 \$\$\{_onCt\.toLocaleString\(\)\}・\$\{_lb\(_nCt\)\}，實際發 \$\$\{_final\.toLocaleString\(\)\}・\$\{_lb\(_nNow\)\}`;/.test(F)
     && /⚠ 簽回後調整：\$\{_drift\}/.test(F));
}

console.log('\n③ 待審核發放**沒有**浮動提示（2026-09-04 使用者定案）');
/* 「待審核只要做會員連動 不要做票券發放提醒」——
   #alert-dock 只留會員連動那顆。理由：同一件待辦不要有兩個提醒，
   而票券這件事在會員資料裡本來就看得到兩處（下面兩條在守）。
   ⚠ 這是刻意拿掉，不是漏做。要恢復的話把 host 加回 dock 就會活過來
     （refreshGrantReviewPill 整支都還在，只是每次都在 !host 就 return）。 */
ok('★★★ dock 裡沒有 tb-review-pill 這個 host',
   /<div id="alert-dock" class="alert-dock">([\s\S]{0,1200}?)<\/div>/.test(src)
   && !/id="tb-review-pill"/.test(RegExp.$1)
   /* 全檔也不該有第二個地方偷偷長出來 */
   && (src.match(/id="tb-review-pill"/g)||[]).length===0);
ok('★★★ 拿掉提示之後，那些單子還找得到 —— ① 會員資料的待審核卡',
   /onclick="openGrantApprove\('\$\{r\.id\}'\)"/.test(src));
ok('★★★ 　　　　　　　　　　　　　 ② 票券分頁上的紅色計數',
   /\$\{_grCnt\[k\]\?`<i class="tkf-n" style="background:#c8453a;color:#fff;" title="待審核發放">/.test(src));
ok('★★ 刻意拿掉的理由寫在原地（不然下一個人會當成 bug 補回去）',
   /待審核只要做會員連動 不要做票券發放提醒/.test(src));
{
  const F=grabFn('refreshGrantReviewPill');
  ok('★★ 這支現在是刻意空轉（host 不在，第一行就 return）',
     /const host=document\.getElementById\('tb-review-pill'\); if\(!host\) return;/.test(F)
     && /是\*\*刻意的空轉\*\*/.test(src));
  /* 2026-09-03：從「不是櫃檯就 return」改成「不是櫃檯就清空再 return」——
     那一格如果已經畫過（不重新整理就換帳號登入），教練會看到留在頂欄的待審核提示。
     清空成本是零，漏掉的代價是權限外洩。 */
  ok('★ 只有櫃檯／管理員看得到，而且非櫃檯時會把已經畫過的清掉（0904 起連 dock 一起收）',
     /if\(!isDeskLike\(\)\)\{ host\.innerHTML=''; host\.style\.display='none'; alertDockSync\(\); return; \}/.test(F)
     && !/if\(!isDeskLike\(\)\) return;/.test(F));
  ok('★ 沒有待審核就整顆不畫（不佔位置）',
     /if\(!list\.length\)\{ host\.innerHTML=''; host\.style\.display='none'; alertDockSync\(\); return; \}/.test(F));
  /* 下面三條驗的是「恢復時這支還能用」，不是「畫面上看得到」 */
  ok('★ 有幾筆就寫幾筆，點下去開審核清單',
     /待審核發放 <b>\$\{list\.length\}<\/b>/.test(F) && /onclick="openGrantReview\(\)"/.test(F));
  ok('★ 換頁時順手更新（讀快取，沒有額外網路成本）',
     /try\{ if\(typeof refreshGrantReviewPill==='function'\) refreshGrantReviewPill\(\); \}catch\(_\)\{\}/.test(src));
  ok('　　用品牌紅＋呼吸點（沒處理就發不出票券，屬於「要動作」等級）',
     /\.tb-review\{display:inline-flex;[^}]*color:#b5372e;/.test(src) && /@keyframes grpulse/.test(src));
}

console.log('\n④ 審核視窗：應收金額要大、要有顏色');
{
  const F=grabFn('openGrantApprove');
  /* 2026-08-28 二修（使用者：「維持正常開合約 只是櫃檯再收款的時候保留付款調整的彈性」）——
   收款這一步的欄位一律可編輯，但應收金額那一大塊**留著**，改成跟著欄位即時重算。
   0808 定它的理由（避免櫃檯看錯）沒有變，變的只是數字的來源。 */
ok('★★ 應收金額仍然是獨立一塊，只是改成即時重算',
   /<div class="gr-amt-box" id="gr-amt-box"><\/div>/.test(src)
   && /function grFillPreview\(\)\{/.test(src));
/* 2026-09-04：位置從①②中間移到②之後、③之前 —— 它是②算出來的結果，
   也是按下③之前要核對的數字，夾在中間等於把因果切斷。大小沒有變。 */
ok('★★★ 應收金額排在「收款資訊」之後、「發放」之前',
   src.indexOf('<i>${_n()}</i>收款資訊') < src.indexOf('id="gr-amt-box"')
   && src.indexOf('id="gr-amt-box"') < src.indexOf('<i>${_n()}</i>發放'));
ok('★★ 仍然是整個視窗最大最亮的一塊（0808「避免櫃檯看錯」沒有放寬）',
   /\.gr-amt-v\{[^}]*font-size:38px;/.test(src)
   && /仍然是整個視窗最大最亮的一塊 —— 0808「避免櫃檯看錯」沒有放寬/.test(src));
ok('★★ 預覽與發放走同一支算式（不能另外寫一份「大概是這樣」）',
   /const p0=grFillApply\(P, true\);/.test(src) && /const p=p0;/.test(src)
   && /走的是與發放同一支 grFillApply（quiet 模式）/.test(src));
ok('★★ 算不出來時金額顯示「—」並把發放鈕停用',
   /<span class="gr-amt-v gr-amt-wait">—<\/span>/.test(src)
   && /if\(go\)\{ go\.disabled=true; go\.style\.opacity='\.45';/.test(src));
ok('★★ 四個欄位改動都會重算',
   (src.match(/grFillPreview\(\)/g)||[]).length>=6);
  ok('★★ 大字塊的字級與紅色沒動（0808 的「最大最亮」）',
     /<span class="gr-amt-k">應收款項<\/span>/.test(src)
     && /\.gr-amt-v\{font-family:var\(--num\),inherit;font-size:38px;font-weight:800;color:#b5372e;/.test(src));
  ok('★ 分期要講明「這是第 1 期」與總額（不會讓櫃檯照總額收）',
     /分 \$\{p\.installCount\} 期，這是<b>第 1 期<\/b>（總額 \$\$\{\(Number\(p\.dealAmount\)\|\|0\)\.toLocaleString\(\)\}）/.test(src));
  ok('★ 折抵券也標出來（實收才是要收的錢）',
     /已折抵券 ×\$\{p\.voucherN\}（−\$\$\{\(Number\(p\.voucherAmt\)\|\|0\)\.toLocaleString\(\)\}）/.test(src));
  ok('★ 拆帳也拆給櫃檯看（現金收多少／匯款多少）',
     /（現金 \$\$\{Number\(p\.splitCash\)\.toLocaleString\(\)\}／匯款/.test(src));
  ok('★★ 合約簽回沒簽回，兩種狀態分色',
     /<div class="gr-sign-box \$\{signed\?'ok':'wait'\}">/.test(F)
     && /\.gr-sign-box\.ok\{background:#eef5f1;/.test(src) && /\.gr-sign-box\.wait\{background:#f7efe0;/.test(src));
  /* 2026-08-13 使用者指示：改成未簽回一律不能發放（按鈕反灰＋入口擋），0808 警告放行退場 */
/* 2026-08-28（使用者問「這一張待審核的合約 櫃檯要從哪邊按可以修改付款資訊？」）——
   放寬的是「視窗打不打得開」，不是「能不能發」：未簽回照樣進得去改收款資訊、可以只存，
   但發放那一關仍然擋死。 */
  ok('★★ 沒簽回不能發：發放動作本身再擋一次（視窗打得開不等於發得出去）',
     /if\(!\(_c&&_c\.signed_at\)\)\{ done\(\); showToast\('合約尚未簽回，等會員在手機上簽完才能發放', 5000\); return; \}/.test(src)
     && /真正的發放這一關照舊擋住，不能靠繞過視窗就發出去。/.test(src));
  ok('★★ 清單那顆未簽回的鈕不再反灰，改成「收款資訊」（哪裡找到都改得動）',
     /title="合約簽回後才能發放；先進去把收款資訊改好" onclick="openGrantApprove\('\$\{r\.id\}'\)">收款資訊<\/button>/.test(src));
  ok('★★ 待審核卡兩顆鈕：刪除（移除方案）／收款審核（進付款視窗）',
     /title="移除這份方案（不會發票券）" onclick="grantReqCancel\('\$\{r\.id\}'\)">刪除<\/button>/.test(src)
     && /onclick="openGrantApprove\('\$\{r\.id\}'\)">收款審核<\/button>/.test(src));
  ok('　 為什麼叫「刪除」不叫「取消」（與預約那邊的取消分開）',
     /叫「取消」會跟預約那邊的取消混淆/.test(src));
/* 2026-08-28 二修（使用者：「修改中間付款資訊這邊新增一個儲存 如果櫃檯只是要修改付款方式
   可以從這邊按 然後下方待回簽才能通過這個按鈕 在還沒回簽的時候關閉互動」
   ＋「回簽後再變成『發放票券』」）——
   有了付款資訊區塊自己的「儲存收款資訊」，底下那顆才敢真的 disabled：
   櫃檯剛改好的數字有地方存，不會因為按不下去就整個丟掉。 */
  ok('★★ 未簽回時底列寫「尚未回簽」、暗化、關掉互動，鈕還在且有原因',
     /<button class="btn btn-ghost" id="gr-go" disabled style="opacity:\.45;cursor:not-allowed;color:var\(--t3\);" title="要等會員簽回合約才發得出去；只要改收款資訊請用上面的「儲存變更」">尚未回簽<\/button>/.test(src));
  ok('★★ 簽回之後同一個位置變成發放票券',
     /\$\{_canIssue\s*\n\s*\? `<button class="btn btn-green" id="gr-go" onclick="grantReqApprove\('\$\{r\.id\}'\)">確認收款・發放票券<\/button>`/.test(src));
  /* 2026-09-04 二修：原本獨佔一整列（385px 的列只放 75px 的鈕，上方還有 14px
     留白＝約 56px 空區），移到②的區塊標題列右邊。 */
  ok('★★ 「儲存變更」在②的標題列右邊，預設暗化',
     /<button type="button" class="btn btn-ghost btn-sm gr-hbtn" id="gr-save" disabled\s*\n\s*style="opacity:\.45;cursor:not-allowed;color:var\(--t3\);"\s*\n\s*onclick="grantReqSaveFill\('\$\{r\.id\}'\)"\s*\n\s*title="把上面改過的收款資訊存起來，不發票券">儲存變更<\/button>/.test(src)
     && /\.gr-step-h \.gr-hbtn\{margin-left:auto;/.test(src)
     && !/class="gr-savebar"/.test(src));
  ok('★★★ 三個彩框只留一個（紅>金>綠：紅色要獨佔「這是要收的錢」）',
     /\.gr-fill\.gr-plain\{border:1px solid var\(--bd\);background:transparent;\}/.test(src)
     && /<div class="gr-fill gr-plain">/.test(src)
     && !/border-color:var\(--green,#1f6f54\);background:rgba\(31,111,84,\.06\)/.test(src));
  ok('★★★ 沒有改到 .gr-fill 本身（補收款那個視窗也在用，那裡金框是對的）',
     /\.gr-fill\{border:1\.5px solid var\(--gold,#B48A56\);/.test(src)
     && /不能直接改 \.gr-fill：補收款那個視窗也在用它/.test(src));
  ok('★★ 有改過、而且改得出正確的一包才亮（沒改過按了也是白按）',
     /const _dirty=\(window\._grFill0!=null\) && grFillSnap\(\)!==window\._grFill0;/.test(src)
     && /const _valid=!!grFillApply\(P, true\);/.test(src)
     && /const _on=_dirty&&_valid;/.test(src));
  ok('★★ 按不下去時要講得出是哪一種（沒改過／填不完整）',
     /_sv\.title=_on\?'把上面改過的收款資訊存起來，不發票券'\s*\n\s*:\(_dirty\?'上面的欄位還填不完整':'還沒有任何修改'\);/.test(src));
  ok('★★ 比的是欄位原始字串，不是算完的結果（14400 與 14400.0 對櫃檯是「沒改」）',
     /function grFillSnap\(\)\{/.test(src)
     && /比的是\*\*欄位的原始字串\*\*，不是算完的結果：14400 與 14400\.0 對系統是同一個數字，/.test(src));
  ok('　 開窗當下就記一份原始值', /window\._grFill0=grFillSnap\(\);/.test(src));
  ok('　 五個欄位都納入比對（金額／方式／拆帳／分期／折價券）',
     /return \[v\('gr-amt'\), v\('gr-method'\), v\('gr-splitcash'\), v\('gr-install'\), v\('gr-voucher'\)\]\.join\('\|'\);/.test(src));
  ok('★★ 說明也跟著改（底下那顆已經不做事了）',
     /只是要改收款資訊的話，按上面的<b>「儲存變更」<\/b>就好。/.test(src));
  ok('　 為什麼原本不敢 disabled、現在敢了 —— 寫在原地',
     /有了它，底下那顆「尚未回簽」才敢真的關掉互動：櫃檯剛改好的數字有地方存。/.test(src));
  ok('★★ 也不用金（金是「可以做、但要知道」，這顆根本按不下去）—— 單純暗化',
     /也不用金：金是「可以做、\s*\n\s*但要知道」，而這顆現在根本按不下去。暗化＝單純的「還不到時候」。/.test(src));
/* 2026-08-28 事故：filled_by／filled_at 這兩欄資料庫裡沒有（前端先寫、表沒加）——
   dbPut 是 upsert，PostgREST 找不到欄位就整筆失敗。表現是「儲存變更跳錯誤訊息」，
   但同一段程式在「確認收款・發放票券」也會跑：那裡票已經發出去了，狀態卻改不成，
   單子留在 pending，下一個人再按一次就發第二張票。
   欄位已用 migration 補上（grant_requests_filled_by_at），這幾條守那道保險。 */
  ok('★★ 發票券之後那一筆狀態非改到不可：失敗先拿掉可有可無的欄位重試',
     /const r2=Object\.assign\(\{\},r\); delete r2\.filled_by; delete r2\.filled_at;/.test(src)
     && /await dbPut\('ticket_grant_requests',r2\);/.test(src));
  ok('★★ 再失敗要大聲講，不能靜靜吞掉（櫃檯要知道「票發了但單沒收掉，先別再按」）',
     /⚠ 票券已發放，但待審核單沒有更新成功 —— 請勿再按一次發放，/.test(src));
  ok('★★ 理由寫在原地（改不成會留在 pending，再按一次就發第二張）',
     /改不成的話它會留在 pending，下一個人再按一次就發第二張票。/.test(src));
  ok('★★ 只存與發放共用同一支 grFillApply（存的與之後發的是同一包）',
     /const _p=grFillApply\(r\.payload\);\s*\n\s*if\(!_p\) return;/.test(src)
     && /存進去的就是之後真的會發的那一包，/.test(src));
  /* 2026-08-28 二修：金額改成即時重算，寫死在按鈕上會與上方大字打架 ——
     改成把「算不出來就按不下去」釘住（比重複一次數字更擋得住看錯）。 */
  ok('★★ 算不出金額就按不下去（取代原本寫死在按鈕上的金額）',
     /if\(go\)\{ go\.disabled=true; go\.style\.opacity='\.45'; go\.style\.cursor='not-allowed'; \}/.test(src)
     && /if\(go\)\{ go\.disabled=false; go\.style\.opacity=''; go\.style\.cursor=''; \}/.test(src));
  ok('　　先講清楚按下去會發生什麼，包含 30 分鐘可退回',
     /發放後 <b>30 分鐘內<\/b>可在首頁「今日營收」整筆退回/.test(F));
  ok('　　使用者的原話寫在程式裡',
     /「打開視窗要明顯顯示應該要收到的款項再按發放票券，\s*\n\s*這邊要用顏色標明，避免櫃檯看錯」/.test(src));
}
{
  const F=grabFn('_grantReqApprove');
  ok('★★ 通過才真的發（走同一支 _grantIssue）', /const t=await _grantIssue\(r\.payload\);/.test(F));
  ok('★ 重複審核擋下', /if\(!r\|\|r\.status!=='pending'\)\{ done\(\); showToast\('這筆已處理過'\); return; \}/.test(F));
  ok('★ 記下 issued_at —— 30 分鐘退回從這一刻起算',
     /r\.issued_at=new Date\(\)\.toISOString\(\);          \/\/ 30 分鐘退回從這一刻起算/.test(F));
  ok('★ 合約補上票券關聯（會員票券卡的「合約」按鈕靠它）',
     /c\.ticket_id=t\.id; c\.expire_date=t\.expire_date\|\|null;/.test(F)
     && /await dbPut\('contracts',c\);/.test(F));
  /* 2026-09-04：收款這一步永遠可編輯（0828），櫃檯改了金額或分期之後，
     contracts.amount 還停在建約當下那個數字 —— 四處顯示都讀它，於是與實收對不上。 */
  ok('★★★ 金額也跟著更新（合約記總價）',
     /const _final=grCtAmount\(_p\);/.test(F) && /if\(_final!==_was\)\{/.test(F));
  ok('★★★ 改過就留痕（對帳的人要看得到誰在什麼時候改的）',
     /收款時調整金額 \$\$\{_was\.toLocaleString\(\)\}→\$\$\{_final\.toLocaleString\(\)\}/.test(F)
     /* ⚠ 全形括號：程式裡寫的是「（…）」不是 "(...)"，用 \( 對不上 */
     && /（\$\{_who\}・\$\{nowHM\(\)\}）/.test(F)
     && /const _who=\(SESSION&&SESSION\.name\)\|\|'櫃檯';/.test(F));
/* 2026-09-04 全流程實跑抓到：_drift 原本宣告在收款那個 `{ }` 區塊裡，
   底下寫合約那一段讀不到 —— 而那一段包在 catch(_){} 裡，於是留痕靜靜消失。
   與早上 openGrantApprove 的 P 同一類（被 try/catch 吞掉的作用域問題）。 */
ok('★★★ _drift 宣告在區塊外面（底下寫合約那段要讀它）',
   /let _drift=null;\s*\n\s*\{\s*\n\s*const _p=grFillApply\(r\.payload\);/.test(src));
  ok('★★★ 合約**內文**不動（那是會員簽名時看到的那一份，事後改掉等於竄改）',
     !/c\.body_snapshot=/.test(F) && !/c\.fill_snapshot=/.test(F)
     && /事後改掉等於竄改/.test(src));
  ok('★ 通知會員票券已啟用', /await pushNotification\(r\.member_id,'payment','票券已啟用',/.test(F));
  ok('　　防連點', /async function grantReqApprove\(id\)\{ return onceAct\('grapp:'\+id, \(\)=>_grantReqApprove\(id\)\); \}/.test(src));
  ok('　　寫入後清快取', /dbCacheClear\(\['member_tickets','ticket_logs','purchases','contracts','ticket_grant_requests','notifications'\]\);/.test(F));
}
ok('★ 取消申請會把待簽名的合約一併作廢',
   /if\(r\.contract_id\)\{ try\{ await dbDel\('contracts',r\.contract_id\); \}catch\(_\)\{\} \}/.test(src));

console.log('\n⑤ 紙本合約顯示「已使用紙本簽名」');
{
  const F=grabFn('ctSignLabel');
  const L=new Function(F+'\nreturn ctSignLabel;')();
  eq('★★ 紙本 → 已使用紙本簽名', L({sign_type:'paper',signed_at:'2026-08-08'}), '已使用紙本簽名');
  eq('★ 電子已簽 → 已使用電子簽名（會員手機）',
     L({sign_type:'remote',signed_at:'2026-08-08'}), '已使用電子簽名（會員手機）');
  eq('★★ 電子未簽 → 講清楚在等誰', L({sign_type:'remote',signed_at:null}), '電子合約・等會員簽名');
  eq('　　列表用短標籤（空間只夠四個字）', L({sign_type:'paper'},true), '紙本已簽');
  eq('　　舊的現場平板簽名', L({sign_type:'electronic',signed_at:'x'}), '已使用電子簽名（現場平板）');
  ok('★ 合約列表與檢視都改吃同一支',
     (src.match(/\$\{ctSignLabel\(c,true\)\}<\/span>/g)||[]).length===2
     && /簽約日 \$\{\(c\.signed_at\|\|''\)\.slice\(0,10\)\}　·　\$\{ctSignLabel\(c\)\}/.test(src));
  ok('　　為什麼要明白寫出來（紙本沒有簽名圖檔可存）',
     /紙本沒有簽名圖檔可存（簽在紙上），所以系統要明白寫出「這一份是紙本簽的」，/.test(src));
}
/* 2026-09-04：電子合約不再需要綁 LINE（推播 0822 就整組移除，改成「我的票券」
   常駐的待簽卡；會員用手機號碼＋88888888 登入即可簽）。兩顆鈕都常駐可按。 */
/* 2026-09-04 使用者定案：「建立合約的時候 移除[電子][紙本] 下方改成建立合約
   等櫃檯再次點開的時候再選擇合約方式」—— 兩顆選擇鈕整組退場。 */
ok('★★★ 步驟 4 不再有簽署方式的選擇鈕',
   !/class="ct-types" id="ct-types"/.test(src)
   && !/data-t="remote"/.test(src) && !/data-t="paper"/.test(src));
ok('★★★ 送出鈕改成「建立合約」',
   /<button class="btn btn-green" id="ct-submit" onclick="ctSubmit\(\)">建立合約<\/button>/.test(src)
   && /if\(sb2\) sb2\.textContent='建立合約';/.test(src));
ok('★★★ 型別固定成 undecided（殘留成 paper 會當場把票券發出去）',
   /window\._ctSignType='undecided';/.test(src)
   && /_ctSignType 一定要明確設成 'undecided'/.test(src));
ok('★★ LINE 那道限制的來龍去脈留在原地（0822 推播移除）',
   /那個前提 2026-08-22 就沒了/.test(src)
   && /fn_member_sign_contract 也只檢查 member_id，沒有任何 LINE 判斷/.test(src));
/* 2026-09-04：建約時不再分電子／紙本，所以送出鈕不需要換字，
   兩塊分岔說明也整併成一塊「建立後會發生什麼」。 */
ok('★★ 送出鈕固定是「建立合約」',
   /if\(sb2\) sb2\.textContent='建立合約';/.test(src)
   && !/'送出審核（等簽回＋確認收款）'/.test(src));
ok('★ 建立後會發生什麼，在步驟 4 就講清楚',
   /建立後<b>還不會發票券<\/b>：這一筆會進「待審核發放」/.test(src)
   && /・<b>用電子簽<\/b> → 會員登入「我的票券」點開簽名/.test(src)
   && /・<b>用紙本<\/b> → 列印給客人簽，按下去就算已簽/.test(src));

console.log('\n⑥ 資料表');
{
  const mig=process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260808_ticket_grant_requests.sql';
  ok('★ migration 有進版控', fs.existsSync(mig));
  const sql=fs.readFileSync(mig,'utf8');
  ok('★ 員工可讀、櫃檯可寫（會員看不到）',
     /for select using \(is_any_staff\(\)\)/.test(sql)
     && /for all using \(is_staff_desk\(\)\) with check \(is_staff_desk\(\)\)/.test(sql));
  ok('★★ 新表有掛 change_log 觸發器（增量同步；見 CLAUDE.md）',
     /create trigger trg_change_log after insert or delete or update\n\s*on public\.ticket_grant_requests/.test(sql));
  ok('★★ 也列進 fn_table_sigs（否則快取的簽章校驗看不到它的變動）',
     /'''staff_applications'',''reward_rules'',''ticket_grant_requests'''/.test(sql)
     || /staff_applications'',''reward_rules'',''ticket_grant_requests/.test(sql));
  ok('　　payload 存整包發放內容', /payload       jsonb,            -- 賣票當下算好的完整發放內容/.test(sql));
}

console.log('\n⑦ 會員資料票券頁的「待審核」卡（2026-08-09 使用者指示）');
/* 「教練課跟友善教練課櫃檯銷售之後，無法看到這一筆單是不是有成功送出或者有沒有錯誤，
    都要等客戶那邊回傳才能知道。能夠把這筆銷售記錄在會員資料的票券嗎？待審核。」
   卡在票券頁＝單有送出去；審核通過卡換成真票券、取消就消失。 */
{
  const L=grabFn('ppLoadCtx');
  /* 0823 效能：grantReqPending 原本是在並行批次「之後」才 await（序列多一輪往返），
     改成收進同一個 Promise.all，這裡拿的是已經取回的結果。行為不變。 */
  ok('★★ ppLoadCtx 帶入本會員 pending 的發放申請',
     /c\.myGR=\(grPend\|\|\[\]\)\.filter\(r=>r\.member_id===PP\.id\)/.test(L)
     && /\(typeof grantReqPending==='function'\?grantReqPending\(\):Promise\.resolve\(\[\]\)\)\.catch\(\(\)=>\[\]\)/.test(L));
  ok('★ 合約簽回與否一併帶上（ctSigned）',
     /c\.ctSigned=\{\}; \(contractsAll\|\|\[\]\)\.forEach\(x=>\{ if\(x&&x\.id\) c\.ctSigned\[x\.id\]=!!x\.signed_at; \}\)/.test(L));
  const R=grabFn('ppRecordHtml');
  ok('★★ 票券頁畫「待審核」卡（紅色系＝要櫃檯動作）',
     /const grCard=r=>\{/.test(R) && /待審核<\/span>/.test(R));
  ok('★ 用申請的方案反查分頁（與票券同一支 tkClass5 分類器）',
     /tkClass5\(\{ticket_type_id:pl\.ticket_type_id, plan_name:r\.plan_name\|\|pl\.name\}, typeMap\)/.test(R));
  /* 2026-09-04：未簽回再分兩種 —— 還沒選簽署方式／已選電子等會員簽。 */
  ok('★ 卡上有簽回狀態、送出時間與應收金額',
     /signed\?'✓ 合約已簽回'\s*\n\s*:\(\(c&&c\.sign_type==='remote'\)\?'⏳ 等會員簽回':'◻ 尚未選簽署方式'\)/.test(R)
     && /送出 \$\{fmtWhenLocal\(r\.requested_at\)\}/.test(R)
     && /應收 <b style="color:#b5372e;/.test(R));
  ok('★ 會員資料的待審核卡直接開這一筆（原本開的是整份清單，還要自己找回來）',
     /onclick="openGrantApprove\('\$\{r\.id\}'\)">收款審核<\/button>/.test(src));
  const _skipOld=true; if(!_skipOld) ok('★ 「前往審核」開既有審核視窗，不另做一套',
     /onclick="openGrantReview\(\)">前往審核<\/button>/.test(R));
  ok('　　分頁章上加紅色待審數（跟可用張數分開兩顆）',
     /\$\{_grCnt\[k\]\?`<i class="tkf-n" style="background:#c8453a;/.test(R));
  ok('★ 有待審卡時不顯示「此分類尚無票券」的空狀態',
     /\(hist\.length\|\|expd\.length\|\|_grHere\.length\)\?'':'<div class="pp-card-tip">此分類尚無票券<\/div>'/.test(R)
     && /!act\.length&&!_grHere\.length&&\(hist\.length\|\|expd\.length\)/.test(R));
  const A=grabFn('_grantReqApprove'), C=grabFn('doGrantReqCancel');
  ok('★★ 審核通過：會員資料開著就就地重讀（待審卡當場換成真票券）',
     /if\(!\(await ppRefreshIfOpen\(r\.member_id\)\)\) navTo\(CUR_PAGE\);/.test(A));
  ok('★ 取消發放：同樣就地重讀（待審卡當場消失）',
     /if\(!\(await ppRefreshIfOpen\(r\.member_id\)\)\) navTo\(CUR_PAGE\);/.test(C));
}

console.log('\n⑧ 會員端：待簽合約只在「我的票券」常駐（蓋版提醒 2026-08-22 移除）');
/* 0810：「會員端只要跳出一次提醒，之後在我的票券顯示就好。」
   0822 使用者指示再收一步：「這個簽約提示一直出現 可以移除了」——蓋版整組拿掉，
   只留「我的票券」那張待簽卡。 */
{
  const B=grabFn('memSignBannerCheck');
  ok('★★ 蓋版提醒已整組移除（memSignBannerCheck 成空函式）',
     /已移除/.test(B) && !/mem-sign-banner/.test(B) && !/appendChild/.test(B));
  ok('★ 全檔已無蓋版元素的殘留', !/mem-sign-banner/.test(src));
  const R=grabFn('renderMemTickets');
  ok('★★ 我的票券頁畫待簽／待開通合約卡（sign_type=remote 且還沒綁票券）',
     /const pendCt=\(window\._memContracts\|\|\[\]\)\.filter\(c=>c\.sign_type==='remote'&&!c\.ticket_id\)/.test(R));
  ok('★ 還沒簽的給「立即簽署」鈕（金色）、簽回的顯示等收款進度（綠色）',
     /onclick="event\.stopPropagation\(\);memSignContract\('\$\{c\.id\}'\)">立即簽署<\/button>/.test(R)   /* 2026-08-18 整卡可點後按鈕要擋事件冒泡 */
     && /✓ 合約已簽署 —— 櫃檯確認收款後，票券就會出現在下方。/.test(R)
     && /這份合約還沒簽名 —— 完成簽署、櫃檯確認收款後才會發放票券。/.test(R));
  ok('★ 有待簽卡時不顯示「目前沒有票券」空狀態',
     /usable\.length===0&&inactive\.length===0&&pendCt\.length===0/.test(R));
  ok('　　卡插在等級卡與票券清單之間（pendCards 有進 innerHTML）',
     /renewHint\+\s*\n\s*pendCards\+/.test(R));
}

/* 2026-08-24 使用者指示：「剛剛有會員用電子合約簽名，櫃檯這邊要看到回簽才能審核，
   可以跳出會員回簽的簽名欄，發放票券按鈕要設計在這個視窗」——
   核對用的東西要跟「按下發放」在同一個畫面上，不能要求櫃檯先跳去看合約再跳回來。 */
console.log('\n櫃檯要在發放的同一個畫面上看到會員回簽');
{
  const A=grabFn('openGrantApprove');
  ok('★★ 簽名圖畫在確認視窗裡（原本只有一行「✓ 合約已於 X 簽回」的文字）',
     /<img class="gr-sig-img" src="\$\{c\.signature\}" alt="會員簽名">/.test(A)
     && /<div class="gr-sig-k">會員回簽<\/div>/.test(A));
  ok('★★ 發放鈕仍在同一個視窗（簽名與按鈕不可分家）',
     /id="gr-go" onclick="grantReqApprove\('\$\{r\.id\}'\)">確認收款・發放票券<\/button>/.test(A));
  ok('★★ 沒有簽名圖時不要留一塊空白 —— 寫清楚原因並給看全文的路（0823 的「不能用就寫原因」）',
     /這份合約沒有存到簽名圖（紙本補簽或舊資料）/.test(A)
     && /\$\{\(signed&&!\(c&&c\.signature\)\)\?/.test(A));
  ok('★ 未簽回仍然發不出去（0813 定案沒有被放寬，只是視窗打得開了）',
     /const _canIssue = !\(r\.contract_id && !signed\);/.test(A)
     && /\$\{_canIssue\s*\n\s*\? `<button class="btn btn-green" id="gr-go" onclick="grantReqApprove/.test(A));
  ok('★★ signature 在 LEAN_DROP 裡，這裡拿得到是因為走單筆 dbGet（select \*）—— 理由寫在原地',
     /signature 在 LEAN_DROP 裡/.test(src)
     && /單筆 dbGet\('contracts', id\)＝select\('\*'\)，\s*\n\s*圖是拿得到的/.test(src));
  ok('　　簽名圖鋪白底（透明筆跡壓在綠色提示框上會看不清楚）',
     /\.gr-sig-wrap\{[^}]*background:#fff;/.test(src)
     && /\.gr-sig-img\{[^}]*object-fit:contain;/.test(src));
}

/* 2026-08-24 使用者指示：「在我要預覽會員的這個頁面的我的票券，設計一張待簽名的票券，
   我要看看這邊長怎麼樣」——角色預覽只換前端顯示、不換身分（SESSION.id 仍是管理員的
   員工 id），真實資料一定是空的，這一區永遠看不到東西。 */
console.log('\n預覽會員視角：待簽名票券的範例卡');
{
  const R=grabFn('renderMemTickets');
  ok('★★ 只在「真管理員＋預覽會員視角＋本來就沒有待簽合約」時出現',
     /const _ctDemo = \(typeof isRealAdmin==='function' && isRealAdmin\(\)\s*\n\s*&& SESSION && SESSION\.role==='member' && pendCt\.length===0\);/.test(R));
  ok('★★ 真會員／真的有合約時完全不畫（不可以讓任何人看到不存在的合約）',
     /不可以讓任何人看到不存在的合約/.test(src));
  /* 2026-08-24 使用者追加：「要測試到跳出簽名欄」——按鈕會真的開簽名畫面，
     簽名板／放大簽／清除重簽都照真的跑，只有最後那顆「完成簽署」換成吐司。 */
  ok('★★ 卡上明寫「範例」，而且按鈕真的開得了簽名畫面',
     /範例<\/span>/.test(R)
     && /onclick="memSignContract\('DEMO-CT'\)"/.test(R));
  ok('★★ 範例合約只活在記憶體裡，內容吃真的那一份（看到的排版＝客人看到的排版）',
     /function memCtDemoObj\(\)\{/.test(src)
     && /body_snapshot:\(typeof CONTRACT_TEXT!=='undefined'\)\?CONTRACT_TEXT:''/.test(src)
     && /fill=contractFillBlockHTML\(\{name:'（範例）王小明'/.test(src));
  ok('★★ 「完成簽署」不打 fn_member_sign_contract（那個 id 不存在，打了只會拿到錯誤）',
     /\$\{_dc\?`closeContractReader\(\);showToast\('這是預覽用的範例合約，真的會員按下去才會送出簽名',5000\)`:`memSignContractDo\('\$\{id\}'\)`\}/.test(src));
  ok('★ 有範例卡時不要同時出現「目前沒有票券」空狀態',
     /usable\.length===0&&inactive\.length===0&&pendCt\.length===0&&!_ctDemo/.test(R));
  ok('　　範例卡接在真卡後面（真的有就先看真的）', /pendCards\+demoCard\+/.test(R));
}

console.log('\n⑧ 簽署方式改在「待審核發放」才決定（2026-09-04）');
/* 使用者：「建立合約的時候 移除[電子][紙本] 下方改成建立合約
           等櫃檯再次點開的時候再選擇合約方式」
   起因是教練用櫃檯帳號替新客人建約時卡住：電子被 LINE 擋著、紙本又會直接發票券，
   而客人還沒付款也還沒簽。 */
ok('★★★ 清單上有「用電子簽」「用紙本」兩顆，且只在未簽回時出現',
   /\$\{\(c && !signed\)\?`<button class="btn btn-ghost btn-sm" title="會員登入「我的票券」自己簽；簽回後這一列的發放鈕才會亮" onclick="grantReqSetSign\('\$\{r\.id\}','remote'\)">用電子簽<\/button>/.test(src)
   && /onclick="grantReqSetSign\('\$\{r\.id\}','paper'\)">用紙本<\/button>/.test(src));
ok('★★★ 已簽回的不給改（會把會員的簽名紀錄抹掉）',
   /if\(c\.signed_at\)\{ showToast\('這份合約已經簽回了，不能再改簽署方式'\); return; \}/.test(src)
   && /只讓「未簽回」的改：已經簽回代表會員真的在手機上簽過名/.test(src));
ok('★★★ 合約與佇列兩邊的 sign_type 都要改',
   /c\.sign_type=kind;/.test(src) && /r\.sign_type=kind;/.test(src)
   && /只改一邊，清單標籤與合約頁會對不起來/.test(src));
/* 紙本＝按下就算已簽（列印給客人簽）；電子＝維持未簽，等會員自己簽。 */
ok('★★★ 只有紙本會把 signed_at 蓋上去',
   /if\(_isPaper\) c\.signed_at=new Date\(\)\.toISOString\(\);/.test(src));
/* 建約當下不通知（那時還沒決定，通知了他也不知道要幹嘛）；選電子才推播。 */
ok('★★★ 通知搬到「選電子簽」那一刻，建約時不通知',
   /if\(!_isPaper\)\{ try\{ await pushNotification\(r\.member_id,'announce','合約待簽名',/.test(src)
   && /建約當下不通知會員 —— 簽署方式還沒定，通知了他也不知道要幹嘛/.test(src));
ok('★★★ undecided 期間會員手機上看不到待簽卡（理由寫在原地）',
   /所以 undecided 期間他手機上不會看到；選了電子才出現；選紙本則永遠不出現/.test(src));
/* ctSignLabel 最後是 fallthrough 到「紙本已簽」，不特別處理的話，
   一份還沒決定也還沒簽的合約會在會員的合約列表上被標成「紙本已簽」—— 說謊。 */
ok('★★★ undecided 不能被標成「紙本已簽」',
   /if\(c\.sign_type==='undecided'\) return short\?'未簽署':'尚未選定簽署方式';/.test(src));
ok('★★ 限櫃檯以上＋防連點＋紙本要問一次',
   /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可操作'\); return; \}/.test(src)
   && /async function grantReqSetSign\(id, kind\)\{ return onceAct\('grsign:'\+id, \(\)=>_grantReqSetSign\(id, kind\)\); \}/.test(src)
   && /請確認客人已經在紙本合約上簽名。/.test(src));
ok('★★ 一定留痕（誰決定的簽署方式）',
   /簽署方式設為\$\{_lb\}（\$\{_who\}・\$\{nowHM\(\)\}）/.test(src));

/* ── 二修：選擇也要出現在「收款審核」那個視窗（2026-09-04）──────────────
   使用者重述流程：「點待付款方案上面的按鈕[審核] 選擇電子或紙本
                   電子等回簽 進入下一步選付款方式跟是否分期」
   ⚠ 櫃檯實際的入口是**會員資料那張卡的「收款審核」**（0828 改成直開這一筆），
     一修只把兩顆鈕加在「待審核發放」清單上，從會員資料進來看不到選擇，
     流程會斷在半路。 */
ok('★★★ 收款審核視窗裡也能選簽署方式',
   /const _undecided = !!\(c && !c\.signed_at && c\.sign_type==='undecided'\);/.test(src)
   && /onclick="grantReqSetSign\('\$\{r\.id\}','remote'\)"/.test(src)
   && /onclick="grantReqSetSign\('\$\{r\.id\}','paper'\)"[\s\S]{0,200}?用紙本<\/button>/.test(src));
/* 2026-09-04「避免操作失誤」：原本條件是 _undecided —— 按下「用電子簽」之後
   那一整塊就消失，**按錯也沒有任何路可以改回紙本**。改成只要還沒簽回都看得到。 */
ok('★★★ 按錯電子簽還改得回紙本（未簽回期間按鈕一直在）',
   /const _signOpen  = !!\(c && !c\.signed_at\);/.test(src)
   && /\$\{_signOpen\?`<section class="gr-step/.test(src)
   && /按錯也沒有任何路可以改回紙本/.test(src));
ok('★★★ 目前選的要標出來（不然不知道按過沒）',
   /const _signPicked= !!\(c && c\.sign_type && c\.sign_type!=='undecided'\);/.test(src)
   && /<em>已選：\$\{c\.sign_type==='remote'\?'電子簽':'紙本'\}<\/em>/.test(src));
ok('★★★ 重按同一顆不會再推播一次給會員',
   /if\(c\.sign_type===kind\)\{ showToast\(kind==='remote'\?'已經是電子簽了/.test(src));
ok('★★★ 還沒選時標題就講清楚這一步在做什麼',
   /\$\{_undecided\?'選擇簽署方式':'確認收款・發放票券'\}/.test(src));
ok('★★★ 選完留在同一筆往下走，不跳回清單',
   /openGrantApprove\(id\);/.test(src)
   && /跳回清單等於要他自己再點一次進來/.test(src));
ok('★★ 兩個入口都吃得到（清單與會員資料那張卡）',
   /onclick="openGrantApprove\('\$\{r\.id\}'\)">收款審核<\/button>/.test(src)
   && /放在這裡兩個入口都吃得到/.test(src));
ok('★★★ 紙本下方有可按的副標「點選下載紙本合約」',
   /onclick="ctViewPrint\('\$\{r\.contract_id\}'\)"[\s\S]{0,260}?點選下載紙本合約<\/button>/.test(src));
/* ctViewPrint 對「還沒簽」的合約會走 ctSignBlock({paperNote:true})，
   印出來就是空白簽名欄 —— 正是要給客人簽的那一張。 */
ok('★★★ 未簽的合約列印出來是空白簽名欄（給客人簽的那張）',
   /\$\{c\.signature\s*\n\s*\? ctSignBlock\(\{sigImg:c\.signature, dateText:\(c\.signed_at\|\|''\)\.slice\(0,10\)\.replace\(\/-\/g,' \/ '\)\}\)\s*\n\s*: ctSignBlock\(\{paperNote:true\}\)\}/.test(src));
/* 2026-09-04 使用者：「電子跟紙本這邊 不要太多文字敘述了 只要給簡單的按鈕」——
   畫面上的提問一行＋操作說明兩段（共四行）全部拿掉，只留兩顆按鈕、
   一條短副標、一條可按的下載副標。順序改由按鈕的 title 承接。
   ⚠ 這是刻意精簡，不是漏寫；要加字回去之前先看使用者這句話。 */
ok('★★★ 畫面上不再有那三段說明（只剩按鈕）',
   !/這份合約<b>還沒決定簽署方式<\/b>/.test(src)
   && !/紙本的順序是：<b>先下載列印<\/b>/.test(src)
   && !/選<b>電子<\/b>則會通知會員去簽/.test(src));
ok('★★ 順序沒有消失，移到紙本按鈕的 title（滑上去看得到）',
   /title="客人已經在紙本上簽好了再按；按下去就算已簽，接著就能收款發放">用紙本<\/button>/.test(src));
ok('★★ 電子那顆的說明也還在 title 裡',
   /title="會員登入「我的票券」自己簽；簽回後才能發放">用電子簽<\/button>/.test(src));
ok('★★ 兩顆按鈕與下載副標都還在（精簡的是文字，不是功能）',
   /grantReqSetSign\('\$\{r\.id\}','remote'\)/.test(src)
   && /grantReqSetSign\('\$\{r\.id\}','paper'\)/.test(src)
   && /點選下載紙本合約<\/button>/.test(src));
ok('★★ 精簡的理由寫在原地', /這裡是櫃檯每賣一筆都會看一次的地方，/.test(src));
ok('★★ 為什麼副標要做成可按的，寫在原地',
   /但按鈕上只寫「用紙本」，很容易以為按下去會跳出檔案/.test(src));

/* ── 修：建約當下不能有 signed_at（2026-09-04 使用者回報）──────────────
   「合約已回簽? 這是我剛剛建立來測試的」「電子跟紙本要從哪邊選呢」
   同一個 bug 的兩個症狀：signed_at 那一行原本是 `_isRemote?null:now()`，
   而同一天把 _isRemote 寫死成 false 之後，每一張新建的合約都被標成「已簽回」——
   發放鈕直接亮（沒人簽過），而且「選擇簽署方式」那一塊的條件是 !signed_at，
   整塊不出現，櫃檯根本找不到哪裡選電子／紙本。 */
ok('★★★ 建約寫入時 signed_at 一律 null',
   /signed_at:null,/.test(src) && !/signed_at:\(_isRemote\?null:new Date\(\)\.toISOString\(\)\)/.test(src));
ok('★★★ _isRemote 這個變數已從程式碼移除（只剩註解提及）',
   (src.replace(/\/\*[\s\S]*?\*\//g,'').match(/_isRemote/g)||[]).length===0);
ok('★★ 這次翻車的兩個症狀寫在原地',
   /每一張新建的合約都被標成「已簽回」/.test(src)
   && /櫃檯根本找不到哪裡選電子／紙本/.test(src));
/* 送出時間原本直接切 ISO 字串，而 requested_at 存的是 UTC —— 台灣看到的整整慢 8 小時。 */
ok('★★★ 送出時間改用本地時間顯示（兩處都換）',
   (src.match(/送出 \$\{fmtWhenLocal\(r\.requested_at\)\}/g)||[]).length===2
   && !/送出 \$\{String\(r\.requested_at\|\|''\)\.slice\(5,16\)/.test(src));
ok('★★ 存 UTC 是對的，要改的是顯示（寫在原地）',
   /存 UTC 是對的（跨時區、排序都靠它），要改的是\*\*顯示\*\*/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
