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
t('底部導覽是 position:fixed 貼底', /position:fixed;left:0;right:0;bottom:0/.test(base));
t('★ 不使用 backdrop-filter（iOS 上 fixed＋backdrop-filter 捲動會停在舊位置）',
  !/backdrop-filter/.test(base));
/* will-change 拿掉了：iOS 上對 position:fixed 反而更容易把舊圖層釘住（0822 二修） */
t('★ 自成合成層（translateZ(0)），但不掛 will-change',
  /transform:translateZ\(0\);\}/.test(base) && !/will-change/.test(base));
t('★ 捲動停下來後強制重繪那一層（iOS 保險）',
  /function navStickInit\(\)\{/.test(s)
  && /n\.style\.transform='translate3d\(0,0,0\)';/.test(s)
  && /window\.addEventListener\('scroll'/.test(s));
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
