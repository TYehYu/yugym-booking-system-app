/* 2026-08-02 使用者指示：「銷售的地方先移除發票區，目前還沒串聯」

   發票系統還沒接：欄位留著只是讓櫃檯每次多選一次，而且選了也沒有下文 ——
   選「雲端發票」不會真的開出任何東西。欄位拿掉、值一律記 'none'。
   資料欄位（invoice_status / invoice_type）保留，之後接上金流時把選單加回來就好，
   舊資料也還讀得到。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 四個銷售入口都不再問發票');
eq('★ 沒有任何發票下拉留在銷售流程裡',
   [...src.matchAll(/id="(fr-invoice|fv-invoice|ms-invoice|gt-invoice)"/g)].map(m=>m[1]), []);
ok('　　賣票（票券／方案）', !/gt-invoice/.test(src));
ok('　　場地租借（預約流程內收款）', !/fr-invoice/.test(src));
ok('　　場地租借（銷售頁）', !/fv-invoice/.test(src));
ok('　　商品銷售', !/ms-invoice/.test(src));

console.log('\n② 值一律記「免發票」，欄位保留');
ok('★ 賣票寫入 none', /invoice_status:'none',   \/\/ 發票區已移除（2026-08-02，還沒串聯）/.test(src)
   && /invoice_type:'none',/.test(src));
eq('★ 其餘也是 none（不是 undefined，免得存進去變空值；商品購物車改 inline invoice_type:none）',
   (src.match(/const inv='none';/g)||[]).length + (src.match(/invoice_type:'none',installment_count:1,note,operator/g)||[]).length, 3);
ok('　　為什麼拿掉、什麼時候加回來，寫在程式裡',
   /發票系統還沒接，欄位留著只是讓櫃檯每次多選一次、而且選了也沒有下文。/.test(src)
   && /欄位保留，之後接上金流時把選單加回來就好。/.test(src));

console.log('\n③ 首頁 KPI 不要留下「有發票 $0」這種死行');
ok('★ 桌機版：沒有發票金額就不列那一行',
   /\$\{_revInv>0\?`<div class="mc-kpi-rev-sub">有發票 \$\$\{_fm\(_revInv\)\} · 無發票 \$\$\{_fm\(_revNoInv\)\}<\/div>`:''\}/.test(src));
ok('★ 手機版同樣處理', /_revInv>0\?`有發票 \$\$\{_fm\(_revInv\)\} · 無發票 \$\$\{_fm\(_revNoInv\)\}`:''\]\]/.test(src));
ok('　　舊資料還有發票時仍看得到（不是整段砍掉）', /_revInv>0\?/.test(src));
/* 2026-08-03 使用者指示：發票標籤整個移除（付款方式取代其位置，見 revpaytest.js） */
ok('　　營收名單上不再出現「發票」標籤', !/mc-rev-inv">發票/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
