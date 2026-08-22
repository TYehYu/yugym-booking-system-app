/* 底部導覽列必須真的黏在畫面底部
   （2026-08-22 使用者回報：「所有手機頁面的下方導覽列 只要畫面往下滑就飄到畫面中間」） */
const fs=require('fs');
const raw=fs.readFileSync(__dirname+'/../index.html','utf8');
/* 去掉 /* *\/ 註解再比對 —— 註解裡本來就寫著「不要用 backdrop-filter」，
   不先剝掉會把說明文字誤判成規則。 */
const s=raw.replace(/\/\*[\s\S]*?\*\//g,'');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };

const base=s.slice(s.indexOf('.bottom-nav{'), s.indexOf('\n', s.indexOf('.bottom-nav{')));
/* ★★ 真正的成因（2026-08-22 三次回報後找到）：<body> 只要有非 visible 的 overflow，
   iOS Safari 就把 position:fixed 的子元素當成相對「文件」定位 —— 導覽列被畫在文件座標上，
   捲多遠就往上偏多遠。Chrome 不吃這一套，所以本機完全重現不出來。
   水平裁切一律掛 <html>，body 必須保持 visible。 */
const bodyRule=s.slice(s.indexOf('\nbody{font-family:var(--font-zh)'), s.indexOf('}', s.indexOf('\nbody{font-family:var(--font-zh)')));
t('★★ <body> 沒有 overflow（否則 iOS 的 position:fixed 會退化成 absolute）',
  !/overflow/.test(bodyRule));
t('★★ <body> 也不要 max-width（同樣會讓 body 變成裁切容器）', !/max-width/.test(bodyRule));
t('★★ 水平裁切改掛 <html>', /\nhtml\{overflow-x:hidden;max-width:100vw;\}/.test(s));
t('底部導覽是 position:fixed 貼底', /position:fixed;left:0;right:0;bottom:0/.test(base));
t('★ 不使用 backdrop-filter（iOS 上 fixed＋backdrop-filter 捲動會停在舊位置）',
  !/backdrop-filter/.test(base));
/* 0822 三修：不要提升合成層 —— iOS 把它畫成一層之後就不再隨捲動更新，
   導覽列會停在 scrollY=0 的位置（捲多遠就偏多遠）。 */
t('★ 不提升合成層（沒有 transform、沒有 will-change）',
  !/transform:/.test(base) && !/will-change/.test(base));
/* 保險（四修）：不再猜成因，改成量測＋補償。正常瀏覽器量到的 off 永遠是 0，
   一行 style 都不會寫；被當成 absolute 排版時，差多少就補多少。 */
t('★ 保險是量測＋補償，不是盲目重繪',
  /function navStickInit\(\)\{/.test(s)
  && /const off=Math\.round\(window\.innerHeight - r\.bottom\);/.test(s)
  && /if\(Math\.abs\(off\)<1\) return;/.test(s));
t('★ 差值累加回去（transform 是疊加在目前位置上，一次收斂）',
  /const next=\(n\._navOff\|\|0\)\+off;/.test(s)
  && /n\.style\.transform=next\?\('translateY\('\+next\+'px\)'\):'';/.test(s));
t('　position 不是 fixed（或隱藏）時完全不動手', /cs\.position!=='fixed'/.test(s));
t('　scroll／touchmove 都掛，用 rAF 收斂成每幀最多一次',
  /window\.addEventListener\('scroll',kick/.test(s)
  && /window\.addEventListener\('touchmove',kick/.test(s)
  && /if\(!raf\) raf=requestAnimationFrame\(sync\)/.test(s));
t('　只在觸控裝置掛，桌機不多一個 scroll 監聽',
  /if\(!\('ontouchstart' in window\)\) return;/.test(s));
t('底色改成不透明（原本 rgba .96，模糊拿掉後不要留半透明）', /background:rgb\(244,240,232\)/.test(base));

const coach=s.slice(s.indexOf('.role-coach .bottom-nav{'), s.indexOf('}', s.indexOf('.role-coach .bottom-nav{')));
t('教練端那條也不用 backdrop-filter', !/backdrop-filter/.test(coach)
  && /background:rgb\(249,246,240\)/.test(coach));

/* 全檔掃：任何 .bottom-nav 的規則都不該再出現 backdrop-filter */
const navRules=[...s.matchAll(/[^\n{}]*\.bottom-nav[^\n{}]*\{[^}]*\}/g)].map(m=>m[0]);
t('★ 全檔沒有任何 .bottom-nav 規則帶 backdrop-filter',
  navRules.every(r=>!/backdrop-filter/.test(r)));
t('　（掃到的 .bottom-nav 規則數量合理）', navRules.length>=4);

/* 兩個 V2 外框只改顏色，不再各自處理合成層（全域已經做了） */
t('memh2-shell 只覆寫顏色', /body\.memh2-shell \.bottom-nav\{background:var\(--green\) !important;border-top-color:rgba\(255,255,255,\.14\);\}/.test(s));
t('chv2-shell 只覆寫顏色', /body\.chv2-shell \.bottom-nav\{background:var\(--green\) !important;border-top-color:rgba\(255,255,255,\.14\);\}/.test(s));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
