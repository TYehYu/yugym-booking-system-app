/* 2026-08-03 使用者指示：「首頁的今日營收，要顯示這一筆是現金還是匯款」

   票券本身不存付款方式 —— 在同日收款紀錄 purchases.payment_method 上，
   所以票券列用「當日＋同票券」的收款反查；場租/商品/重啟本來就是收款紀錄，直接帶。
   右欄名單與「看全部」彈窗同一份資料、同一顆標籤；現金綠、匯款金（要對帳，醒目一階）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 資料來源');
ok('★ 票券列：同日同票券的收款反查 payment_method',
   /const _payByTk=\{\}; \(purchases\|\|\[\]\)\.forEach\(p=>\{\n\s*if\(p\.ticket_id&&p\.payment_method&&puLocalDate\(p\)===date\) _payByTk\[p\.ticket_id\]=p\.payment_method; \}\);/.test(src));
ok('★ 票券列帶 pay 標籤', /att:t\.sold_by\|\|null, attKind:'tk', attRef:t\.id, pay:_payLb\(_payByTk\[t\.id\]\),/.test(src));
ok('★ 收款列直接帶 payment_method', /att:p\.coach_id\|\|null, attKind:'pur', attRef:p\.id, pay:_payLb\(p\.payment_method\),/.test(src));
ok('　　標籤字典含現金/匯款/刷卡/舊系統',
   /\(\{cash:'現金',transfer:'匯款',card:'刷卡',imported:'舊系統'\}\[m\]\|\|m\|\|''\)/.test(src));

console.log('\n② 兩個畫面同一顆標籤');
ok('★ 右欄名單列', /\$\{r\.pay\?`<span class="mc-rev-pay\$\{r\.pay==='匯款'\?' mc-rev-pay-tr':''\}">\$\{r\.pay\}<\/span>`:''\}/.test(src));
ok('★ 「看全部」彈窗', /\$\{r\.pay\?`<span class="mc-rev-pay\$\{r\.pay==='匯款'\?' mc-rev-pay-tr':''\}">\$\{esc\(r\.pay\)\}<\/span>`:''\}/.test(src));
ok('★ 樣式：現金綠、匯款金', /\.mc-rev-pay\{flex:none;font-size:10px;font-weight:600;padding:1px 7px;border-radius:9px;background:#eef4ee;color:#2f6b39;\}/.test(src)
   && /\.mc-rev-pay-tr\{background:#f7efe0;color:#8a5e28;\}/.test(src));
ok('　　沒有付款方式的（舊資料）不顯示空標籤', /pay:_payLb\(/.test(src) && /\$\{r\.pay\?`<span/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
