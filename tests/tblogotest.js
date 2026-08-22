/* 頂欄字標＝登入頁那組（草寫 Training 壓在 YUGYM 上方；2026-08-22 使用者指示） */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(n,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+n); };

t('頂欄改用 Training／YUGYM／有肌訓練 三段結構',
  /<span class="tb-mark"><span class="tb-lgm"><span class="tb-lgm-script">Training<\/span><span class="tb-lgm-en">YUGYM<\/span><\/span><span class="tb-lgm-zh">有肌訓練<\/span><\/span>/.test(s));
t('舊的行內色碼版本已移除', !/<span style="color:var\(--gold\);">YUGYM<\/span>/.test(s));
t('草寫用與登入頁同一組字體（Yellowtail 優先）',
  /\.topbar \.tb-lgm-script\{[^}]*"Yellowtail","Snell Roundhand","Apple Chancery","Brush Script MT",cursive/.test(s.replace(/\n\s*/g,'')));
t('Training 靠右對齊、壓在 YUGYM 上方（負下邊距）',
  /\.topbar \.tb-lgm-script\{display:block;text-align:right;margin:0 \.08em -\.30em 0;/.test(s));
t('尺寸用 em，跟著 .tb-mark 走（桌機 24／手機 19／17 不必各寫一份）',
  /font-size:\.56em/.test(s) && /\.topbar \.tb-lgm-en\{display:block;font-size:1em/.test(s));
t('.tb-mark 改 inline-flex 靠底對齊', /\.topbar \.tb-mark\{display:inline-flex;align-items:flex-end/.test(s));
t('手機那條也從 baseline 改 flex-end（否則有肌訓練會被拉到最上面）',
  /\.topbar \.tb-mark\{display:flex;align-items:flex-end;gap:7px;white-space:nowrap;\}/.test(s));
t('★ 既有的 :last-child 規則改成直接子代（否則 YUGYM 會被當成副標縮小／變色）',
  !/\.tb-mark span:last-child/.test(s) && (s.match(/\.tb-mark>span:last-child/g)||[]).length===6);

/* 靜態 HTML 區不可以用 JS 模板字串的註解（0822 踩過：整串被印在畫面上） */
const html=s.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<!--[\s\S]*?-->/g,'');
t('★ 靜態 HTML 沒有殘留 ${...}', !/\$\{/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
