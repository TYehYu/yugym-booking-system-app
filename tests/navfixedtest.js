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
t('★ 捲動停下來後強制重新定位（iOS 保險）',
  /function navStickInit\(\)\{/.test(s)
  && /window\.addEventListener\('scroll'/.test(s));
t('★ 保險寫的是會真的改變的值（translateZ(0)↔translate3d(0,0,0) 是同一個矩陣、不會重繪）',
  /n\.style\.bottom=flip\?'0\.01px':'0px';/.test(s)
  && !/n\.style\.transform='translate3d\(0,0,0\)'/.test(s));
t('　放開手指也補一次（慣性捲動結束）', /window\.addEventListener\('touchend'/.test(s));
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
