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
/* 2026-08-04 使用者指示改購物車模式（可加多品項、自訂品名），自訂價行為保留 */
ok('★ 單價欄：無固定價 → 留白（蛋白粉/搖搖杯/自訂 p:null）',
   /\{n:'蛋白粉',p:null\}/.test(src) && /\{n:'搖搖杯',p:null\}/.test(src)
   && /placeholder="單價" oninput="msCartSet\(\$\{i\},'price',this\.value\)"/.test(src));
ok('★ 沒有固定價的說明仍在', /蛋白粉／搖搖杯／自訂品項沒有固定價，請依現場售價輸入單價。/.test(src));
ok('★ 留白送出被擋（防 $0 收款，逐列驗證）',
   /if\(String\(r\.price\)\.trim\(\)===''\)\{ showToast\(`請輸入「\$\{nm\}」的單價`\); return; \}/.test(src));
ok('★ 購物車：可加品項、自訂品名、一列一筆收款紀錄',
   /function msCartAdd\(\)\{/.test(src) && /自訂品項請填品名/.test(src)
   && /一列一筆收款紀錄/.test(src));
ok('　　筋膜球與測量身體組成維持預填價',
   /slGoMerch\('筋膜球',200\)/.test(src) && /slGoMerch\('測量身體組成',150\)/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
