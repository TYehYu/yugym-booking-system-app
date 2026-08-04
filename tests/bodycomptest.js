/* 2026-08-03 使用者指示：「銷售新增一個『測量身體組成150』」

   單次服務收費 —— 走商品收款的殼（openMerchSale：可散客、數量/單價可調、
   選付款方式、進 purchases 當日營收），不發票券。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 2026-08-04 購物車模式：卡片副標改「點卡加入」，slGoMerch＝加入購物車 */
ok('★ 其他收費區有「測量身體組成」卡，帶 $150 預設價',
   /card\('#8a7a5c','測量身體組成','\$150 · 點卡加入',"slGoMerch\('測量身體組成',150\)"\)/.test(src));
ok('★ 走商品收款的殼（slGoMerch 加入購物車 → openMerchSale 結帳）',
   /function slGoMerch\(name,price\)\{/.test(src) && /async function openMerchSale\(name,defPrice,cart\)\{/.test(src));
/* 2026-08-03 蛋白粉改自訂金額後，單價欄支援留白（defPrice=null），見 merchpricetest.js */
/* 2026-08-04 改購物車模式：預設價由 MS_PRESETS 帶進該列的單價欄，仍可改 */
ok('★ 單價帶 150 但仍可改（購物車列的單價欄吃預設價）',
   /\{n:'測量身體組成',p:150\}/.test(src)
   && /r\.price=\(pre&&pre\.p!=null\)\?pre\.p:'';/.test(src));
ok('　　商品收款不發票券（purchases source:merchandise，不建 member_tickets）',
   /source:'merchandise',created_at/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
