/* 2026-08-03 使用者指示：「蛋白粉的金額要調整，因為目前有三種金額，
   所以幫我改成可以自訂義金額的模式」

   卡片不再預填 $50 —— 單價欄留白必填（placeholder 提示），副標改「自訂金額」；
   留白就按確認會被擋下（避免 $0 收款進今日營收）。筋膜球 $200、
   測量身體組成 $150 維持預填（仍可改，行為不變）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

ok('★ 蛋白粉卡改自訂金額（defPrice=null）',
   /card\('#8a7a5c','蛋白粉','自訂金額（可散客）',"slGoMerch\('蛋白粉',null\)"\)/.test(src)
   && !/slGoMerch\('蛋白粉',50\)/.test(src));
ok('★ 單價欄：null → 留白＋「輸入金額」提示',
   /id="ms-price" value="\$\{defPrice!=null\?defPrice:''\}" min="0" placeholder="輸入金額"/.test(src));
ok('★ 自訂金額品項有一行說明（沒有固定價）',
   /\$\{defPrice==null\?`<div[^`]*這個品項沒有固定價，請依現場售價輸入單價。<\/div>`:''\}/.test(src));
ok('★ 留白送出被擋（防 $0 收款）',
   /const _pv=\(document\.getElementById\('ms-price'\)\.value\|\|''\)\.trim\(\);\n\s*if\(_pv===''\)\{ showToast\('請輸入單價'\); return; \}/.test(src));
ok('　　筋膜球與測量身體組成維持預填價',
   /slGoMerch\('筋膜球',200\)/.test(src) && /slGoMerch\('測量身體組成',150\)/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
