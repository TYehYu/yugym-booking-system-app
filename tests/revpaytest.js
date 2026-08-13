/* 2026-08-03 使用者兩連指示：
   「首頁的今日營收，要顯示這一筆是現金還是匯款」
   「本日營收的地方出現了『發票』，把發票移除，然後付款方式改成可以修正」

   付款方式：票券本身不存 —— 用「當日＋同票券」的收款紀錄反查（連 purchase id
   一起帶，修正時寫回那一筆）；場租/商品/重啟本來就是收款紀錄。
   發票欄位還沒串（銷售端已先移除發票區），名單上不再出現發票標籤。
   櫃檯點付款方式標籤 → 三選一（現金/匯款/刷卡）寫回 purchases.payment_method。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 資料來源');
/* 2026-08-12 拆帳改版：_payByTk 多存 sp（pay_split），拆帳列標籤要各帶金額 */
ok('★ 票券列：同日同票券的收款反查（含 purchase id＋pay_split，修正／拆帳顯示要用）',
   /if\(p\.ticket_id&&puLocalDate\(p\)===date\) _payByTk\[p\.ticket_id\]=\{m:p\.payment_method\|\|'',pid:p\.id,sp:p\.pay_split\|\|null\};/.test(src));
/* 2026-08-12 拆帳改版：列資料多帶 paySp，revPayChip 靠它畫兩顆金額標籤 */
ok('★ 票券列帶 pay＋paySp＋payRef', /pay:_payLb\(\(_payByTk\[t\.id\]\|\|\{\}\)\.m\), paySp:\(_payByTk\[t\.id\]\|\|\{\}\)\.sp\|\|null, payRef:\(_payByTk\[t\.id\]\|\|\{\}\)\.pid\|\|null,/.test(src));
ok('★ 收款列直接帶（含 paySp）', /pay:_payLb\(p\.payment_method\), paySp:p\.pay_split\|\|null, payRef:p\.id,/.test(src));

console.log('\n② 標籤（實跑 revPayChip）');
{
  const mk=desk=>new Function('isDeskLike','return '+grabFn('revPayChip'))(()=>desk);
  const f=mk(true), g=mk(false);
  ok('★ 櫃檯看到的是可點的按鈕（點開修正）',
     /openRevPayPick\('P1'\)/.test(f({pay:'現金',payRef:'P1'})) && /<button/.test(f({pay:'現金',payRef:'P1'})));
  ok('★ 匯款用金色（要對帳，醒目一階）', /mc-rev-pay-tr/.test(f({pay:'匯款',payRef:'P1'})));
  ok('★ 有收款但沒標付款方式 → 櫃檯看到「—」可補標', f({pay:'',payRef:'P1'}).includes('—'));
  ok('★ 教練／會員看得到但點不動', !/onclick/.test(g({pay:'現金',payRef:'P1'})) && /現金/.test(g({pay:'現金',payRef:'P1'})));
  ok('　　沒有收款紀錄可寫的（舊資料）非櫃檯不顯示', g({pay:'',payRef:null})==='');
}

console.log('\n③ 發票標籤移除＋修正流程');
ok('★ 兩個畫面都不再出現發票標籤（列上）', !/mc-rev-inv">發票/.test(src));
ok('★ 兩個畫面共用 revPayChip', (src.match(/\$\{revPayChip\(r\)\}/g)||[]).length===2);
/* 2026-08-08：同一格前面多了「30 分鐘退回」鈕（revUndoChip），順序是 退回 → 付款方式 → 金額。
   2026-08-13：付款標籤已帶金額時隱藏重複粗體金額（revAmtDup 條件包住 mc-rev-amt）；
   首頁那格最前面再多一顆發票鈕 revInvChip（invEnabled 才畫），順序 發票 → 退回 → 付款 → 金額 */
ok('★ 付款方式疊在金額上方（2026-08-03 使用者指示：並排會把品項擠掉）',
   /<span class="mc-rev-r">\$\{revInvChip\(r\)\}\$\{revUndoChip\(r\)\}\$\{revPayChip\(r\)\}\$\{revAmtDup\(r\)\?'':`<span class="mc-rev-amt">/.test(src)
   && /<span class="mc-rev-r">\$\{revUndoChip\(r\)\}\$\{revPayChip\(r\)\}\$\{revAmtDup\(r\)\?'':`<span class="mc-rev-amt">/.test(src)
   && /\.mc-rev-r\{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px;\}/.test(src));
/* 2026-08-03 使用者指示：「不要列出刷卡，我們沒提供刷卡功能」。
   2026-08-12 拆帳改版：第三顆改成「現金+匯款」拆帳入口（openRevPaySplit），刷卡仍不列 */
ok('★ 修正視窗：現金／匯款＋拆帳入口（不列刷卡）、講清楚影響財務報表',
   /改的是這一筆收款的付款方式，財務報表會跟著更新。/.test(src)
   && /\$\{btn\('cash'\)\}\$\{btn\('transfer'\)\}/.test(src)
   && /onclick="openRevPaySplit\('\$\{pid\}'\)">現金\+匯款<\/button><\/div>/.test(src)
   && !/\$\{btn\('card'\)\}/.test(src));
ok('★ 只有櫃檯／管理員能開', /async function openRevPayPick\(pid\)\{\n\s*if\(!isDeskLike\(\)\) return;/.test(src));
ok('★ 防連點', /async function setRevPay\(pid, m\)\{ return onceAct\('revpay:'\+pid, \(\)=>_setRevPay\(pid,m\)\); \}/.test(src));
ok('　　為什麼移除發票，寫在程式裡', /發票欄位還沒串（銷售端已先移除），\n\s*名單上不再出現/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
