/* 2026-08-12 使用者需求：「有一筆帳 14400，分兩種方式付款 7200 匯款 7200 現金，
   有辦法在付款的地方設定嗎」——
   拆帳付款：payment_method='split'，拆分記在 purchases.pay_split（{cash,transfer}）。
   ① 銷售表單付款方式多「現金＋匯款」＋現金輸入列（其餘記匯款）
   ② 首頁營收名單的付款方式可點開改成拆帳（openRevPaySplit）
   ③ 統計（首頁現金/匯款 KPI、財務報表付款方式）把 split 展開成兩段 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 共用 helper：split 展開成兩段，其他方式原樣一段');
{
  const F=grabFn('purPayParts');
  ok('★★ split → [[cash,金額],[transfer,金額]]（金額以 pay_split 為準）',
     /p\.payment_method==='split' && p\.pay_split/.test(F)
     && /\[\['cash',Number\(p\.pay_split\.cash\)\|\|0\],\['transfer',Number\(p\.pay_split\.transfer\)\|\|0\]\]/.test(F));
  ok('★ 其他方式回一段（deal_amount）', /return \[\[\(p&&p\.payment_method\)\|\|'', Number\(p&&p\.deal_amount\)\|\|0\]\];/.test(F));
  // 實跑
  const fn=new Function('return '+F.replace(/^function purPayParts/,'function'))();
  const sp=fn({payment_method:'split',deal_amount:14400,pay_split:{cash:7200,transfer:7200}});
  ok('★★ 實跑：14400 拆 7200/7200', JSON.stringify(sp)==='[["cash",7200],["transfer",7200]]');
  const one=fn({payment_method:'cash',deal_amount:500});
  ok('　　實跑：現金 500 一段', JSON.stringify(one)==='[["cash",500]]');
}

console.log('\n② 銷售表單');
ok('★★ 付款方式多「現金＋匯款」，選了才出現現金輸入列',
   /<option value="split">現金＋匯款<\/option>/.test(src)
   && /id="gt-splitcash-wrap" style="display:none;"/.test(src)
   && /gt-splitcash-wrap'\);if\(w\)w\.style\.display=this\.value==='split'\?'':'none';/.test(src));
ok('★★ 現金必填且不可超過成交金額', /if\(method==='split' && \(!Number\.isFinite\(splitCash\)\|\|splitCash<0\|\|splitCash>dealAmount\)\)\{\s*\n\s*showToast\('請輸入拆帳的現金金額（0 ～ 成交金額之間）'\); return; \}/.test(src));
ok('★★ 購買紀錄寫入 pay_split（現金夾 0～實收、匯款＝實收−現金）',
   /const _paySplit=\(P\.method==='split'\)\?\{cash:Math\.max\(0,Math\.min\(Number\(P\.splitCash\)\|\|0,_dealRec\)\),/.test(src)
   && /payment_method:P\.method,pay_split:_paySplit,installment_count:P\.installCount,/.test(src));
ok('★ P 包住 splitCash（電子合約延後發券也帶得到）', /dealAmount, method, splitCash, installCount, note,/.test(src));
ok('　　pay_split 進 dbPutPurchaseSafe 的選配欄位清單（沒套 migration 也不會漏記收款）',
   /const opt=\['invoice_type','coach_id','pay_split'\]/.test(src));

console.log('\n③ 修正付款方式（首頁營收名單）');
{
  const F=grabFn('openRevPayPick');
  ok('★★ 多一顆「現金+匯款」鈕 → 開拆帳輸入', /openRevPaySplit\('\$\{pid\}'\)/.test(F));
  ok('★ 已拆帳的顯示目前拆分', /目前拆帳：現金 \$/.test(F));
  const G=grabFn('_setRevPaySplit');
  ok('★★ 拆帳寫回：split＋pay_split，金額驗證 0～總額',
     /if\(!Number\.isFinite\(cash\)\|\|cash<0\|\|cash>total\)/.test(G)
     && /p\.payment_method='split'; p\.pay_split=\{cash:cash, transfer:total-cash\};/.test(G));
  const H=grabFn('_setRevPay');
  ok('★ 改回單一方式會清掉 pay_split', /p\.payment_method=m; p\.pay_split=null;/.test(H));
}

console.log('\n④ 統計把 split 展開');
ok('★★ 首頁現金/匯款 KPI：票券那筆與其他收款都經 purPayParts 展開',
   /if\(pu&&pu\.payment_method==='split'\) purPayParts\(pu\)\.forEach\(\(\[m,a\]\)=>_bump\(m,a\)\);/.test(src)
   && /_dayPur\.forEach\(p=>purPayParts\(p\)\.forEach\(\(\[m,a\]\)=>_bump\(m,a\)\)\);/.test(src));
ok('★★ 財務報表（今日／本月）付款方式統計展開',
   (src.match(/purPayParts\(p\)\.forEach\(\(\[m,amt\]\)=>\{ const k=m\|\|'其他'; byMethod\[k\]=\(byMethod\[k\]\|\|0\)\+amt; \}\)/g)||[]).length===2);
ok('★ 標籤各處補上 split=現金+匯款（列表/報表/確認頁）',
   (src.match(/split:'現金\+匯款'/g)||[]).length>=6);
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
