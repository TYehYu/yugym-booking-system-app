/* 2026-08-03 使用者指示：「蛋白粉的金額要調整，因為目前有三種金額，
   所以幫我改成可以自訂義金額的模式」

   卡片不再預填 $50 —— 單價欄留白必填（placeholder 提示），副標改「自訂金額」；
   留白就按確認會被擋下（避免 $0 收款進今日營收）。筋膜球 $200、
   測量身體組成 $150 維持預填（仍可改，行為不變）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

ok('★ 蛋白粉預設 $75、搖搖杯 $200（2026-08-04 使用者指示），仍可改',
   /card\('#8a7a5c','蛋白粉','\$75 · 點卡加入',"slGoMerch\('蛋白粉',75\)"\)/.test(src)
   && /\{n:'蛋白粉',p:75\}/.test(src) && /\{n:'搖搖杯',p:200\}/.test(src));
/* 2026-08-04 使用者指示：「金額跟數量調整改成＋−」——原生上下箭頭退場，改明確步進鈕 */
ok('★ 單價＋−鈕一格 5 元、數量一格 1（面板與結帳兩處）',
   (src.match(/'price',-5\)">−<\/button>/g)||[]).length===2
   && (src.match(/'qty',-1\)">−<\/button>/g)||[]).length===2
   && /function slCartStep\(i,k,d\)\{/.test(src) && /function msCartStep\(i,k,d\)\{/.test(src));
/* 2026-08-04 使用者指示改購物車模式（可加多品項、自訂品名），自訂價行為保留 */
ok('★ 自訂品項仍留白必填', /\{n:'自訂',p:null\}/.test(src)
   && /placeholder="單價" oninput="msCartSet\(\$\{i\},'price',this\.value\)" style="width:64px;text-align:center;"/.test(src));
ok('★ 留白送出被擋（防 $0 收款，逐列驗證）',
   /if\(String\(r\.price\)\.trim\(\)===''\)\{ showToast\(`請輸入「\$\{nm\}」的單價`\); return; \}/.test(src));
/* 2026-08-04 再進一步（使用者指示：「左邊選好商品點加入，右邊視窗出現商品，再一併結帳」）——
   銷售頁右側常駐購物車：點卡＝加入（同品項數量+1）、結帳把整車帶進收款視窗。 */
ok('★ 銷售頁右側購物車：點卡加入、同品項合併、結帳帶整車',
   /function slCartRender\(\)\{/.test(src)
   && /if\(hit\) hit\.qty=Math\.max\(1,Number\(hit\.qty\)\|\|1\)\+1;/.test(src)
   && /openMerchSale\(null,null,cart\.map\(/.test(src));
ok('★ 開新銷售視窗清空、從結帳返回保留、結帳成功清空',
   /if\(window\._slKeepCart\)\{ window\._slKeepCart=0; \} else \{ window\._slCart=\[\]; \}/.test(src)
   && /window\._slKeepCart=1;openSalesModal\(\)/.test(src)
   && /window\._slCart=\[\];   \/\/ 結帳完成，清空購物車/.test(src));
ok('★ 購物車：可加品項、自訂品名、一列一筆收款紀錄',
   /function msCartAdd\(\)\{/.test(src) && /自訂品項請填品名/.test(src)
   && /一列一筆收款紀錄/.test(src));
ok('　　筋膜球與測量身體組成維持預填價',
   /slGoMerch\('筋膜球',200\)/.test(src) && /slGoMerch\('測量身體組成',150\)/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
