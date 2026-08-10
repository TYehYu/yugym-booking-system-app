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
  ok('★★ 只有電子合約進審核（判斷條件就是 _ctSignType===\'remote\'）',
     /if\(window\._grantSalesActive && window\._ctBody && window\._ctSignType==='remote'\)\{/.test(F));
  ok('★★ 送審那條不建票券（建的是合約＋申請，然後 return）',
     /await dbPut\('ticket_grant_requests',\{id:uid\('GR'\),member_id,/.test(F)
     && /status:'pending',/.test(F));
  ok('★ 合約先記「待簽名」（signed_at 留空、還沒有票券可綁）',
     /ticket_id:null,staff_id:SESSION\.id,signed_at:null,/.test(F));
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
     /const P=\{/.test(F) && /total, unitPrice, listPrice, dealAmount, method, installCount, note,/.test(F)
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
  ok('★ 不再重算任何金額（一律吃 P）',
     /amount_paid:\(isInstall\?Math\.max\(0,P\.firstAmount-P\.voucherAmt\):P\.paidAmount\)/.test(F)
     && !/document\.getElementById/.test(F));
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
  ok('★ 只有櫃檯／管理員看得到', /if\(!isDeskLike\(\)\) return;/.test(F));
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
  ok('★★ 應收金額獨立一塊，最大最亮',
     /<span class="gr-amt-k">應收款項<\/span>/.test(F)
     && /<span class="gr-amt-v">\$\$\{amt\.toLocaleString\(\)\}<\/span>/.test(F)
     && /\.gr-amt-v\{font-family:var\(--num\),inherit;font-size:38px;font-weight:800;color:#b5372e;/.test(src));
  ok('★ 分期要講明「這是第 1 期」與總額（不會讓櫃檯照總額收）',
     /分 \$\{P\.installCount\} 期，這是<b>第 1 期<\/b>（總額 \$\$\{\(Number\(P\.dealAmount\)\|\|0\)\.toLocaleString\(\)\}）/.test(F));
  ok('★ 折抵券也標出來（實收才是要收的錢）',
     /已折抵券 ×\$\{P\.voucherN\}（−\$\$\{\(Number\(P\.voucherAmt\)\|\|0\)\.toLocaleString\(\)\}）/.test(F));
  ok('★★ 合約簽回沒簽回，兩種狀態分色',
     /<div class="gr-sign-box \$\{signed\?'ok':'wait'\}">/.test(F)
     && /\.gr-sign-box\.ok\{background:#eef5f1;/.test(src) && /\.gr-sign-box\.wait\{background:#f7efe0;/.test(src));
  ok('★ 沒簽回仍可發，但要明說是刻意為之',
     /⏳ <b>合約尚未簽回<\/b> —— 會員還沒在手機上完成簽名。仍可發放，但請確認是刻意為之。/.test(F));
  ok('★★ 按鈕上再寫一次金額（避免櫃檯看錯）',
     /已收到 \$\$\{amt\.toLocaleString\(\)\}・發放票券/.test(F));
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
  ok('★★ ppLoadCtx 帶入本會員 pending 的發放申請',
     /c\.myGR=\(await grantReqPending\(\)\)\.filter\(r=>r\.member_id===PP\.id\)/.test(L));
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
  ok('★ 「前往審核」開既有審核視窗，不另做一套',
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

console.log('\n⑧ 會員端：蓋版提醒只跳一次，之後在「我的票券」常駐（2026-08-10 使用者指示）');
/* 「會員端只要跳出一次提醒，之後在我的票券顯示就好。」 */
{
  const B=grabFn('memSignBannerCheck');
  ok('★★ 同一批待簽合約整個登入期間只蓋版一次（記過的 id 不再跳）',
     /window\._signRemindedIds=window\._signRemindedIds\|\|\{\}/.test(B)
     && /if\(cs\.every\(c=>window\._signRemindedIds\[c\.id\]\)\) return;/.test(B)
     && /cs\.forEach\(c=>\{ window\._signRemindedIds\[c\.id\]=1; \}\)/.test(B));
  ok('★ 有新的待簽合約（沒提醒過的 id）才會再跳 —— 判斷用 every 而不是旗標',
     !/_signBannerShown/.test(B));
  ok('　　蓋版上告訴會員之後去哪裡找',
     /之後可隨時在「我的票券」找到這份合約簽署/.test(B));
  const R=grabFn('renderMemTickets');
  ok('★★ 我的票券頁畫待簽／待開通合約卡（sign_type=remote 且還沒綁票券）',
     /const pendCt=\(window\._memContracts\|\|\[\]\)\.filter\(c=>c\.sign_type==='remote'&&!c\.ticket_id\)/.test(R));
  ok('★ 還沒簽的給「立即簽署」鈕（金色）、簽回的顯示等收款進度（綠色）',
     /onclick="memSignContract\('\$\{c\.id\}'\)">立即簽署<\/button>/.test(R)
     && /✓ 合約已簽署 —— 櫃檯確認收款後，票券就會出現在下方。/.test(R)
     && /這份合約還沒簽名 —— 完成簽署、櫃檯確認收款後才會發放票券。/.test(R));
  ok('★ 有待簽卡時不顯示「目前沒有票券」空狀態',
     /usable\.length===0&&inactive\.length===0&&pendCt\.length===0/.test(R));
  ok('　　卡插在等級卡與票券清單之間（pendCards 有進 innerHTML）',
     /renewHint\+\s*\n\s*pendCards\+/.test(R));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
