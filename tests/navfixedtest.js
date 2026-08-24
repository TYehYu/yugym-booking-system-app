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
/* 2026-08-24：同一條上面多掛了 text-size-adjust（字級鎖定，見 bodyFontGuard）。 */
t('★★ 水平裁切改掛 <html>', /\nhtml\{overflow-x:hidden;max-width:100vw;/.test(s));
t('★★ 字級鎖定：關掉瀏覽器的「自動放大內文」（html 與 body 都要，iOS 只看 body 的）',
  /html\{overflow-x:hidden;max-width:100vw;-webkit-text-size-adjust:100%;text-size-adjust:100%;\}/.test(s)
  && /body\{font-family:var\(--font-zh\);[^}]*-webkit-text-size-adjust:100%;text-size-adjust:100%;\}/.test(s));
/* ⚠ 這幾條要比對 raw（未剝註解的原始碼）—— s 已經把 /* *\/ 註解拿掉了，
     而「為什麼不動 zoom」正是寫在註解裡的決定。 */
t('★★ 使用者自己調的文字縮放關不掉（那是無障礙設定）——量出來、讓版面退讓，不要動 zoom',
  /function bodyFontGuard\(\)\{/.test(s)
  && /root\.setAttribute\('data-fz','xl'\)/.test(s)
  && /\*\*不動 zoom\*\*：zoom 會連 vh／position:fixed 一起歪掉/.test(raw));
t('　　改了字級切回來要重量一次（pageshow／resize），不必重開 app',
  /window\.addEventListener\('pageshow', bodyFontGuard\)/.test(s));
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

// ── 會員端 V2：App 外殼（2026-08-22 四修）──
/* 使用者：「用力上下滑動的時候下方的導覽列會脫離」。只要整份文件在捲，iOS 的橡皮筋
   回彈那幾幀就會把 position:fixed 帶著跑 —— 那是平台行為，改成浮動膠囊也一樣。
   根治：外殼固定滿版、只有內容區捲，導覽列在正常流程裡排在底部。 */
t('★★ 外殼固定滿版、整頁不捲', /body\.memh2-shell\{height:100dvh;overflow:hidden;\}/.test(s)
  && /body\.memh2-shell #app-screen\{height:100dvh;min-height:0;display:flex;flex-direction:column;overflow:hidden;\}/.test(s));
t('★★ .content 不是 #app-screen 的直接子層 —— 中間的 .layout 也要撐滿',
  /body\.memh2-shell #app-screen>\.layout\{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;\}/.test(s));
t('★★ 只有內容區可以捲', /body\.memh2-shell \.content\{flex:1 1 auto;min-height:0;overflow-y:auto/.test(s));
t('★★ 導覽列改成正常流程排在外殼底部（不再是 fixed）',
  /body\.memh2-shell #bottom-nav\{position:static;flex:0 0 auto/.test(s));
t('　只套會員端兩頁，管理員／教練維持整頁捲動', !/body\.chv2-shell\{height:100dvh/.test(s));
/* 連帶要處理三處吃「整頁捲動」的程式 */
t('★ 雙欄高度改量內容區（window.scrollY 在外殼模式永遠 0）',
  /const _sc=document\.body\.classList\.contains\('memh2-shell'\)\?document\.querySelector\('\.content'\):null;/.test(s)
  && /_sc\.clientHeight-top-16/.test(s));
t('★ 下拉更新的起手判斷改看內容區的 scrollTop',
  /const atTop=\(\)=>\{[\s\S]{0,260}sc\.scrollTop<=0;/.test(s));
t('★ 重繪同一頁時還原的是內容區的捲動位置',
  /_shellSc \? _shellSc\.scrollTop/.test(s)
  && /if\(sc\) sc\.scrollTop=_scrollY; else window\.scrollTo\(\{top:_scrollY\}\);/.test(s));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
