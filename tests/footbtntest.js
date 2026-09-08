/* 視窗底列的按鈕改成浮動鈕（2026-09-08 使用者指示）：
   「下面上一步跟下一步　移除背景列　兩個按鈕像浮動按鈕　滑鼠移過去的時候加入動畫　微微放大」
   「所有視窗都幫我掃描一下　有這種按鈕的是不是可以統一改成這個形式」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 一次改到全部視窗，不逐個改');
ok('★★★ 掛在共用的 .modal-foot .btn 上（全站底列都是這個 class）',
   /\.modal-foot \.btn\{box-shadow:0 3px 14px rgba\(29,24,19,0\.16\);/.test(src));
ok('★★★ 全站真的都在用同一個 class（掃描結果）',
   (src.match(/class="modal-foot/g)||[]).length>200,
   (src.match(/class="modal-foot/g)||[]).length);
ok('★★ 手機版早就是這個做法，桌機是補上（不是新發明一套）',
   /底部按鈕浮動：漸層淡出，內容可透出/.test(src)
   && /這裡是把桌機補上，兩邊終於同一套/.test(src));

console.log('\n② 滑過微微放大');
ok('★★★ hover 放大＋陰影變深', /\.modal-foot \.btn:hover\{transform:scale\(1\.035\);box-shadow:0 6px 20px/.test(src));
ok('★★★ 按下去的狀態要覆寫掉 —— .btn:active 原本是 translateY，同一個 transform 會把放大整個吃掉',
   /\.modal-foot \.btn:active\{transform:scale\(\.985\)/.test(src)
   && /\.btn:active\{transform:translateY\(1px\);\}/.test(src)
   && /scale 與 translate 都寫在 transform 上/.test(src));
ok('★★ 停用的按鈕不浮也不動（那顆按不下去，會動就是在騙人）',
   /\.modal-foot \.btn:disabled,\.modal-foot \.btn\[disabled\]\{box-shadow:none;\}/.test(src)
   && /\.modal-foot \.btn:disabled:hover,\.modal-foot \.btn\[disabled\]:hover\{transform:none;box-shadow:none;\}/.test(src));
ok('★★★ 尊重系統的「減少動態」設定（那不是裝飾）',
   /@media \(prefers-reduced-motion: reduce\)\{\s*\n\s*\.modal-foot \.btn\{transition:box-shadow/.test(src)
   && /\.modal-foot \.btn:hover,\.modal-foot \.btn:active\{transform:none;\}/.test(src));

console.log('\n③ 簽約／發放視窗：背景列拿掉，凍結留著');
ok('★★★ 背景、上框線、陰影都拿掉',
   /background:transparent;border-top:none;box-shadow:none;pointer-events:none;\}/.test(src)
   && !/\.modal-wide \.gt-step>\.modal-foot\{[\s\S]{0,300}background:var\(--surface-3\);\s*\n\s*border-top:1px solid var\(--bd\);/.test(src));
ok('★★★ 凍結的行為留著（0907 使用者要的：「下方返回跟確認凍結顯示在視窗下方」）',
   /\.modal-wide \.gt-step>\.modal-foot\{\s*\n\s*position:sticky;bottom:0;z-index:3;/.test(src));
ok('★★★ 完全透明會讓文字頂到按鈕下緣 → 用底部漸層淡出（顏色跟 .modal 的底一致）',
   /background:linear-gradient\(to bottom, rgba\(0,0,0,0\) 0%, var\(--surface-3\) 55%\);/.test(src)
   && /\.modal\{--mpad:26px;background:var\(--surface-3\)/.test(src));
ok('★★★ 漸層與底列本身不能吃掉點擊，按鈕要收回來',
   /\.modal-wide \.gt-step>\.modal-foot>\*\{pointer-events:auto;\}/.test(src)
   && /::before\{content:'';position:absolute;inset:0;pointer-events:none;z-index:-1;/.test(src));
ok('★★ 0908 那條「捲到底留呼吸空間」的 margin-top 沒有被蓋掉',
   /\.modal-wide \.gt-step>\.modal-foot\{margin-top:26px;\}/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
