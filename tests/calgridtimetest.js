/* 桌機七日行事曆：整點虛線＋時間文字壓在線上（2026-08-22 使用者指示）
   「在每個整點畫出橫向的虛線 然後把時間文字放在虛線上 文字可以蓋過課卡 方便閱讀」
   ＋「本來時間是在格子內 要改成在格線上」 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('時間軸改成蓋在格線上的圖層');
ok('★ 時間軸欄從「左邊 42px 的欄位」改成「蓋住整片格線的透明圖層」',
   /\.cal-body\.cal-7d>\.cal-timecol\{position:absolute;left:0;right:0;top:0;width:auto;\s*\n\s*padding-top:56px;z-index:40;pointer-events:none;background:transparent;\}/.test(src));
ok('★ 整點畫橫向虛線（半點列不畫）',
   /\.cal-body\.cal-7d>\.cal-timecol \.tc-row:not\(\.half\)\{border-top:1px dashed rgba\(0,0,0,\.24\);\}/.test(src));
ok('★ 文字壓在線上（往上位移半個字高），底下墊半透明白底才讀得清楚',
   /\.cal-body\.cal-7d>\.cal-timecol \.tc-row span\{position:absolute;left:6px;top:0;\s*\n\s*transform:translateY\(-50%\);[\s\S]{0,120}?background:rgba\(255,255,255,\.86\);/.test(src));
ok('★★ pointer-events:none —— 文字蓋在課卡上，但點擊要照樣落在下面的格子／課卡',
   /pointer-events:none;background:transparent;\}/.test(src)
   && /點擊照樣落在下面的格子\/課卡上/.test(src));
ok('★★ 欄內原本的實線整點線要讓位，否則同一個 y 會有實線＋虛線兩條',
   /\.cal-body\.cal-7d \.cal-half\.hourline\{border-bottom-color:transparent;\}/.test(src)
   && /否則同一個 y 會有實線＋虛線兩條/.test(src));
ok('★★ 只套 7 日（含 5 日同 class）：它的欄寬是 flex:1 不會橫捲，圖層 left:0/right:0 才對得齊；'
   +'1 日／3 日可以橫捲，套上去線只會畫半截',
   /只套 7 日（含 5 日，同一個 class）/.test(src)
   && /1 日／3 日可以橫捲，套上去線會只畫半截/.test(src)
   && /@media\(min-width:601px\)\{\s*\n\s*\.cal-body\.cal-7d\{position:relative;\}/.test(src));
ok('　　手機那組 .cal-timecol 尺寸規則沒被動到（新規則整組包在 min-width:601px 裡）',
   /@media\(max-width:600px\),\(orientation:portrait\) and \(max-width:1024px\)\{[\s\S]{0,400}?\.cal-timecol\{width:38px;padding-top:56px;\}/.test(src));
ok('　　時間軸的 HTML 沒改（還是同一組 .cal-tc-wrap/.tc-row，只是換了樣式）',
   /timecol\+=`<div class="cal-tc-wrap"><div class="tc-row\$\{isHour\?'':' half'\}"><span>\$\{isHour\?minToTime\(mm\):''\}<\/span><\/div><\/div>`;/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
