/* 首頁任務面板改成「一位教練一欄」（2026-09-02 使用者指示，附截圖）

   「中間欄下方的任務視窗　從一列改成一欄　第一列是教練名稱
     在教練下面排他當天的課卡　這樣在查閱比較方便
     左右翻頁的按鈕設計在教練這一列左右」

   ⚠ 卡片產生器不能複製第二份：直欄版與橫排版共用同一批 _cardsArr，只是換容器。
     這個版面在半個月內被改過五次（橫排 → 一日行事曆 → 橫排 → 直欄），
     每一次複製一份卡片程式，就多一處會各自長歪的地方。
   ⚠ 翻頁鈕要釘在「教練那一列」的高度，不是整欄的中間 ——
     欄一長，中間那個位置會落在課卡上，看起來像卡片自己長了按鈕。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 版面：一位教練一欄');
ok('★★★ 桌機面板排 colHtml，外面包捲動容器＋左右翻頁鈕',
   /<div class="tcol-wrap">\s*\n\s*<button type="button" class="tcol-pg tcol-pg-l" onclick="tcolPage\(event,-1\)"[\s\S]{0,80}?<div class="tcol-scroll">\$\{rows\.map\(r=>r\.colHtml\)\.join\(''\)\}<\/div>\s*\n\s*<button type="button" class="tcol-pg tcol-pg-r" onclick="tcolPage\(event,1\)"/.test(src));
ok('★★★ 一欄＝教練球在最上、課卡在底下直排',
   /<div class="tcol\$\{inClass\?' tcol-live':''\}">\s*\n\s*<div class="tcol-head">[\s\S]{0,600}?<\/div>\s*\n\s*<div class="tcol-cards">\$\{cards\}\$\{emptyC\}<\/div>/.test(src));
ok('★★ 教練球沿用原本那顆（名字在上、n/n 在下、吃教練色）',
   /<span class="tcard-cball" style="background:\$\{_cc\.bg\};color:\$\{_cc\.fg\};"[\s\S]{0,400}?<span class="tcard-cbt\$\{\(total>0&&done>=total\)\?' done':''\}">\$\{done\}\/\$\{total\}<\/span>/.test(src));
ok('★★★ 卡片沒有被複製第二份（橫排版與直欄版共用 _cardsArr）',
   (src.match(/const cards=_cardsArr\.join\(''\);/g)||[]).length===2
   && (src.match(/const _cardsArr=_bkSorted\.map/g)||[]).length===1);
ok('★ 沒課的那一欄照舊出「今日無課／請假／值班中」',
   (src.match(/請假（全天）':\(hasDuty\?'值班中 · 今日無課':'今日無課'\)/g)||[]).length===2);

console.log('\n② 翻頁');
{
  const F=src.slice(src.indexOf('function tcolPage(e,dir){'), src.indexOf('/* 需不需要翻頁鈕'));
  ok('★★★ 一次捲整數欄，不是固定像素（捲一半會把教練球切一半）',
     /const w=col\?\(col\.getBoundingClientRect\(\)\.width\+gap\):/.test(F)
     && /const n=Math\.max\(1, Math\.floor\(sc\.clientWidth\/Math\.max\(1,w\)\)\);/.test(F)
     && /sc\.scrollBy\(\{left:dir\*w\*n, behavior:'smooth'\}\);/.test(F));
  ok('★ 欄寬從實際的第一欄量（含 gap），版面改寬度不用回來改這裡',
     /const gap=parseFloat\(getComputedStyle\(sc\)\.columnGap\|\|getComputedStyle\(sc\)\.gap\|\|'0'\)\|\|0;/.test(F));
  const S=src.slice(src.indexOf('function tcolPagerSync(){'), src.indexOf('/* 哪幾列需要翻頁鈕'));
  ok('★★ 放不下才出現、到頭就淡化',
     /wrap\.classList\.toggle\('has-pg', sc\.scrollWidth > sc\.clientWidth\+2\);/.test(S)
     && /wrap\.classList\.toggle\('pg-atstart', sc\.scrollLeft<=1\);/.test(S)
     && /wrap\.classList\.toggle\('pg-atend', sc\.scrollLeft\+sc\.clientWidth >= sc\.scrollWidth-1\);/.test(S));
  ok('★ 捲動時重算一次（只綁一次，不重複掛監聽）',
     /if\(!sc\._pgBound\)\{ sc\._pgBound=1; sc\.addEventListener\('scroll',\(\)=>tcolPagerSync\(\),\{passive:true\}\); \}/.test(S));
  ok('★★ 畫完之後才算得到寬度 → 呼叫點在 innerHTML 之後（跟 tcardPagerSync 同一處）',
     /try\{ tcardPagerSync\(\); \}catch\(_\)\{\}[\s\S]{0,120}?try\{ tcolPagerSync\(\); \}catch\(_\)\{\}/.test(src));
}

console.log('\n③ 樣式');
/* 2026-09-02 二修（使用者：「第一列教練名稱上下空白太多　可以收斂一點」）——
   高度 80→46，寫成 --tcolhead 讓翻頁鈕的位置跟著走。 */
ok('★★★ 翻頁鈕釘在教練那一列的中線，高度用同一個變數（不會脫鉤）',
   /\.tcol-wrap\{--tcolhead:46px;\}/.test(src)
   && /\.tcol-head\{[\s\S]{0,120}?height:var\(--tcolhead\);/.test(src)
   && /\.tcol-pg\{position:absolute;top:calc\(var\(--tcolhead,46px\) \/ 2\);/.test(src)
   && /欄一長，中間那個位置會落在課卡上/.test(src));
ok('★★★ 空白的來源記在原地（Ink 把色塊改成純文字，height:72px 卻留著）',
   /Ink 主題把它改成純文字（背景透明、寬度自動），高度卻還留著 72px/.test(src)
   && /\.tcol \.tcol-head \.tcard-cball\{width:100%;height:auto;/.test(src));
/* 2026-09-02 三修（使用者：「教練任務區凍結教練列　下方預約課卡要可以上下滑動查看」） */
ok('★★★ 教練列釘住、課卡上下捲；同一個容器吃兩個方向',
   /\.tcol-head\{[\s\S]{0,200}?position:sticky;top:0;z-index:9;background:var\(--card\);/.test(src)
   && /\.tcol-scroll\{display:flex;align-items:stretch;[\s\S]{0,120}?flex:1;min-height:0;overflow:auto;/.test(src)
   && /\.tcol-wrap\{position:relative;min-width:0;flex:1;min-height:0;display:flex;flex-direction:column;\}/.test(src));
/* 2026-09-02 使用者回報：「往上滑動的時候會看到卡片在教練列後方　不小心點到
   就會蓋過教練列」—— 上課中／逾時未簽的課卡是 z-index:5（為了不被左側 sticky
   教練欄切掉才提上去的），比原本的 3 高，於是壓在教練列上面。 */
ok('★★★ 教練列的 z-index 要高過課卡的 5',
   /\.tcard-std\.tcard-live,\.tcard-std\.tcard-miss\{z-index:5;\}/.test(src)
   && /\.tcol-head\{[\s\S]{0,200}?z-index:9;/.test(src)
   && /比原本的 3 高，\s*\n?\s*於是卡片直接壓在教練列上面/.test(src));
ok('★★ 底色要補到欄的邊緣（只寫 background 的話左右內距是透的，卡片從縫裡透出來）',
   /\.tcol-head\{[\s\S]{0,240}?margin:0 -4px;padding:0 4px;/.test(src));
/* 2026-09-02 使用者：「首頁的課卡區背景加一個米色底」 */
ok('★★ 課卡區米色底，釘住的教練列維持白底（分得出哪一列是凍結的）',
   /\.tcol-scroll\{background:var\(--card2,#F4F0E8\);border-radius:12px;\}/.test(src)
   && /\.tcol-head\{[\s\S]{0,200}?background:var\(--card\);/.test(src));
ok('★★★ .tcol 要 stretch —— 欄高各自長的話，課少的那欄捲到底教練列會被推走',
   /align-items:stretch/.test(src)
   && /課少的那一欄捲到底之後它的教練列就會跟著被推走/.test(src));
ok('★★ 兩欄的垂直位置要一起捲（分兩層容器就對不起同一個時段）',
   /分成兩層容器的話，\s*\n?\s*兩欄的垂直位置會各捲各的，跨教練比對同一個時段就對不起來了/.test(src));
ok('★★ 欄寬吃得下課卡（.tcard.tcard-std 是 165px）',
   /\.tcol\{flex:0 0 auto;width:173px;/.test(src)
   && /\.tcard\.tcard-std\{width:165px;/.test(src));
ok('★★ 捲動但不出現捲軸（兩個方向都是）',
   /\.tcol-scroll\{[\s\S]{0,200}?scrollbar-width:none;-ms-overflow-style:none;/.test(src)
   && /\.tcol-scroll::-webkit-scrollbar\{display:none;\}/.test(src));
ok('★ 沒課那一格在直欄裡不能絕對定位（橫排版是 absolute，會飛出去）',
   /\.tcol-cards \.tcard-empty\{position:static;left:auto;top:auto;text-align:center;\}/.test(src));
ok('★ 上課中的那一欄有底色（橫排版是整列，這裡改成整欄由上往下淡出）',
   /\.tcol-live\{background:linear-gradient\(180deg,rgba\(31,111,84,\.05\),transparent\);/.test(src));

console.log('\n④ 舊的橫排版留著（好退）');
ok('★★ cardHtml 與 .tcard-row 那一套沒有被刪',
   /cardHtml: \(function\(\)\{/.test(src) && /\.tcard-row\{display:flex;/.test(src)
   && /function tcardPage\(e,dir\)\{/.test(src));
ok('　　為什麼留著，寫在原地', /版面在這半個月被來回改過五次，留著比較好退/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
