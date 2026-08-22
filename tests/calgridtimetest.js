/* 手機七日行事曆：整點虛線＋時間文字壓在線上（2026-08-22 使用者指示）
   「在每個整點畫出橫向的虛線 然後把時間文字放在虛線上 文字可以蓋過課卡 方便閱讀」
   ＋「本來時間是在格子內 要改成在格線上」
   ⚠ 使用者一開始回答「桌機七日」，隨後更正為手機七日、桌機恢復原狀 —— 本檔守住這個範圍。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('手機七日：時間從格子中央移到格線上');
ok('★ 標籤的 y 從 top+HH/2（格子正中央）改成 top（整點那條線）',
   /hrLabels\+=`<div class="cag-gline-label" style="top:\$\{top\}px;">\$\{String\(h\)\.padStart\(2,'0'\)\}:00<\/div>`;/.test(src)
   && !/<div class="cag-gline-label" style="top:\$\{top\+HH\/2\}px;">/.test(src));
ok('★ 每個整點畫一條貫穿七欄的虛線',
   /bg\+=`<div class="cag-hourbg" style="top:\$\{top\+2\}px;height:\$\{HH-4\}px;"><\/div>`\s*\n\s*\+`<div class="amcv-gline" style="top:\$\{top\}px;"><\/div>`;/.test(src)
   && /\.amcv-gline\{position:absolute;left:0;right:0;border-top:1px dashed rgba\(0,0,0,\.2\);\}/.test(src));
ok('★★ 標籤要另開一層蓋在課卡之上 —— 背景層是 z-index:0、欄位是 1，留在背景層會被課卡蓋掉',
   /<div class="amcv-toplayer" style="top:0;height:\$\{GH\}px;">\$\{hrLabels\}<\/div>/.test(src)
   && /\.amcv-toplayer\{position:absolute;left:0;right:0;pointer-events:none;z-index:5;\}/.test(src)
   && /標籤留在背景層會被課卡蓋掉，看不到的就是最需要讀的那個時間/.test(src));
ok('★ pointer-events:none：文字蓋在課卡上，點擊照樣落在下面的格子／課卡',
   /\.amcv-toplayer\{[^}]*pointer-events:none/.test(src)
   && /點擊照樣落在下面的格子／課卡上/.test(src));
ok('★★ 線上的文字不能有底色（使用者：「週四有安排的課程都會被白色遮住」）——'
   +'標籤釘在整條線正中央，剛好落在第四欄上，有底色就是一塊擋板；改用白色描邊撐可讀性',
   /\.amcv-toplayer \.cag-gline-label\{opacity:1;background:transparent;padding:0;/.test(src)
   && /text-shadow:0 0 3px #fff,0 0 3px #fff,1px 1px 0 #fff/.test(src)
   && /但不佔任何面積，\s*\n?\s*底下的課卡照樣看得到/.test(src));

console.log('\n桌機七日維持原狀（使用者更正：「桌機幫我恢復」）');
ok('★★ 桌機那一版整組退場：.cal-timecol 仍是左邊 42px 的 sticky 欄位',
   /\.cal-timecol\{flex-shrink:0;width:42px;padding-top:56px;position:sticky;left:0;z-index:25;background:var\(--bg\);\}/.test(src)   /* 底色 2026-08-23 隨整片行事曆改米色；這裡守的是「還是左邊 42px 的 sticky 欄位」 */
   && !/\.cal-body\.cal-7d>\.cal-timecol\{position:absolute/.test(src));
ok('　　桌機欄內的實線整點線也沒被藏起來',
   !/\.cal-body\.cal-7d \.cal-half\.hourline\{border-bottom-color:transparent;\}/.test(src)
   && /\.cal-half\.hourline\{border-bottom:1px solid rgba\(0,0,0,0\.18\);\}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
