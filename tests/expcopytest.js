/* 2026-08-03 使用者指示：「7 月我已經輸入固定支出，這個固定支出應該 8 月也要沿用」

   8 月的 7 筆（$56,145）已直接在正式庫複製完成；前端加「一鍵沿用上月」——
   本月固定支出還是空的、上月有，才顯示按鈕。刻意不做全自動：水電這類金額
   每月會變，按一下複製、再逐筆改，比默默出現一批數字可控。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

ok('★ 本月固定支出為空＋上月有 → 顯示沿用列（含筆數與合計）',
   /if\(!fixed\.length\)\{/.test(src) && /onclick="finExpenseCopyPrev\(\)">⟳ 沿用到本月<\/button>/.test(src));
ok('★ 一鍵沿用：逐筆複製、日期改本月 1 號、可再編輯',
   /await dbPut\('expenses',\{id:uid\('EXP'\), ym:month, date:month\+'-01', category:e\.category,/.test(src));
ok('★ 重複防護：先重抓、本月已有固定支出就不再複製',
   /dbGetAll\('expenses',\{fresh:true\}\)/.test(src)
   && /if\(all\.some\(e=>e&&e\.ym===month&&e\.is_fixed\)\)\{ showToast\('本月已有固定支出，不重複沿用'\)/.test(src));
ok('★ 防連點', /async function finExpenseCopyPrev\(\)\{ return onceAct\('expcopy', _finExpenseCopyPrev\); \}/.test(src));
ok('★ 跨年正確（1 月的上月是去年 12 月）', (src.match(/m===1\?`\$\{y-1\}-12`/g)||[]).length===2);
ok('　　為什麼用按鈕不全自動，寫在程式裡', /水電這類金額\n\s*每月會變，複製過來後逐筆改比默默出現一批數字可控。/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
