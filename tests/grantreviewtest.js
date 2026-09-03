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
  ok('★★ 進審核只有一種情況：電子合約（等會員簽回）',
     /if\(window\._grantSalesActive && window\._ctBody && window\._ctSignType==='remote'\)\{/.test(F)
     && !/P\.pendingFill/.test(src));
  ok('★★ 送審那條不建票券（建的是合約＋申請，然後 return）',
     /await dbPut\('ticket_grant_requests',\{id:uid\('GR'\),member_id,/.test(F)
     && /status:'pending',/.test(F));
  ok('★ 電子合約先記「待簽名」（signed_at 留空）；紙本＋待補填當場就簽了，直接給值',
     /ticket_id:null,staff_id:SESSION\.id,\s*\n\s*signed_at:\(_isRemote\?null:new Date\(\)\.toISOString\(\)\),/.test(F)
     && /紙本＋待補填：合約當場就簽在紙上了，所以 signed_at 直接給值/.test(F));
  ok('★★ 推播叫會員去簽（客戶端的簽約視窗靠這個觸發）',
     /await pushNotification\(member_id,'announce','合約待簽名',/.test(F));
  ok('★ Toast 明講「還沒發票券」與應收金額',
     /已送出審核：\$\{plan\.name\}　·　等會員簽回合約並確認收款後發放（應收 \$\$\{_amt\.toLocaleString\(\)\}）/.test(F));
  ok('★★ 紙本那條照舊，走到 _grantIssue 立刻發',
     /const t=await _grantIssue\(P\);/.test(F)
     && /const _remote=false;   \/\/ 走到這裡一定是紙本（電子那條在上面就 return 了）/.test(F));
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

console.log('\n③ 左上角的待審核提示');
ok('★★ 提示掛在頂欄左側（桌機畫面左上角）',
   /<span id="tb-review-pill" style="display:none;"><\/span>/.test(src)
   && /<span class="tb-role" id="tb-role">—<\/span>\n\s*<!-- 待審核發放提示（2026-08-08 使用者指示：「審核跳提示在桌機畫面左上角」）/.test(src));
{
  const F=grabFn('refreshGrantReviewPill');
  /* 2026-09-03：從「不是櫃檯就 return」改成「不是櫃檯就清空再 return」——
     那一格如果已經畫過（不重新整理就換帳號登入），教練會看到留在頂欄的待審核提示。
     清空成本是零，漏掉的代價是權限外洩。 */
  ok('★ 只有櫃檯／管理員看得到，而且非櫃檯時會把已經畫過的清掉',
     /if\(!isDeskLike\(\)\)\{ host\.innerHTML=''; host\.style\.display='none'; return; \}/.test(F)
     && !/if\(!isDeskLike\(\)\) return;/.test(F));
  ok('★ 沒有待審核就整顆不畫（不佔位置）',
     /if\(!list\.length\)\{ host\.innerHTML=''; host\.style\.display='none'; return; \}/.test(F));
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
   && /function grFillPreview\(\)\{/.test(src)
   && /這一塊改成\*\*跟著欄位即時重算\*\*，/.test(src));
ok('★★ 預覽與發放走同一支算式（不能另外寫一份「大概是這樣」）',
   /const p=grFillApply\(P, true\);/.test(src)
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
  ok('★★ 付款資訊區塊自己有一顆「儲存變更」（只改付款方式就按這顆），預設暗化',
     /<button type="button" class="btn btn-ghost btn-sm" id="gr-save" disabled\s*\n\s*style="opacity:\.45;cursor:not-allowed;color:var\(--t3\);"\s*\n\s*onclick="grantReqSaveFill\('\$\{r\.id\}'\)"\s*\n\s*title="把上面改過的收款資訊存起來，不發票券">儲存變更<\/button>/.test(src));
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
     /合約還沒簽回，<b>發不了票券<\/b> —— 等會員在手機上簽完再回這裡按發放。/.test(src)
     && /只是要改收款方式或金額的話，改完按上面的<b>「儲存變更」<\/b>就好。/.test(src));
  ok('　 為什麼原本不敢 disabled、現在敢了 —— 寫在原地',
     /原本不敢關掉互動，是怕櫃檯剛改好的\s*\n\s*金額與付款方式沒地方存；付款資訊區塊自己有一顆「儲存變更」之後就沒這個顧慮了。/.test(src));
  ok('★★ 也不用金（金是「可以做、但要知道」，這顆根本按不下去）—— 單純暗化',
     /也不用金：金是「可以做、但要知道」，而這顆現在根本按不下去。\s*\n\s*暗化＝單純的「還不到時候」，不佔任何色階。/.test(src));
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
     /發放後 <b>30 分鐘內<\/b>可在首頁「今日營收」名單整筆退回/.test(F));
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
     /if\(c\)\{ c\.ticket_id=t\.id; c\.expire_date=t\.expire_date\|\|null; await dbPut\('contracts',c\); \}/.test(F));
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
ok('★★ 步驟 4 的兩顆按鈕改名為「電子合約／紙本合約」',
   /電子合約\$\{_hasLine\?'':'（未綁定 LINE）'\}/.test(src) && />紙本合約<\/button>/.test(src));
ok('★★ 送出鈕跟著換字（紙本＝發票券、電子＝送審）',
   /if\(sb2\) sb2\.textContent=\(v==='remote'\) \? '送出審核（等簽回＋確認收款）' : '完成簽約並發放票券';/.test(src));
ok('★ 兩塊說明各自講清楚結果',
   /<b style="color:#b5372e;">此時還不會發放票券<\/b>/.test(src)
   && /<b style="color:#1f6f54;">按下去就直接發放票券<\/b>，不需要再經過審核。/.test(src));

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
  ok('★ 卡上有簽回狀態、送出時間與應收金額',
     /signed\?'✓ 合約已簽回':'⏳ 合約未簽回'/.test(R)
     && /送出 \$\{String\(r\.requested_at\|\|''\)\.slice\(5,16\)/.test(R)
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
     && /單筆 dbGet\('contracts', id\)＝select\('\*'\)，圖是拿得到的/.test(src));
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

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
