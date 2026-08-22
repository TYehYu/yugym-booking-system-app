/* 快速預約時段面板：點時段只選取，要按「確認」才前進
   （2026-08-22 使用者回報：「時段不小心點到兩次就直接進入下一步了」） */
const fs=require('fs');
const s=fs.readFileSync(__dirname+'/../index.html','utf8');
let pass=0, fail=0;
const t=(name,ok)=>{ ok?pass++:fail++; console.log((ok?'  ok  ':'  FAIL')+'  '+name); };

const fn=s.slice(s.indexOf('async function chvQuickSlots('), s.indexOf('function chvQuickSel('));
t('時段按鈕不再直接呼叫 chvQuickPick', !/class="cag-slot" data-t="[^"]*" onclick="chvQuickPick/.test(fn)
  && /onclick="chvQuickSel\(/.test(fn));
t('時段按鈕帶 data-t 供選取態切換', /data-t="\$\{minToTime\(o\.mm\)\}"/.test(fn));
t('視窗底部有確認鈕且預設 disabled', /id="chvqs-ok" disabled onclick="chvQuickGo\(\)"/.test(fn));
t('沒有可約時段時不畫確認鈕', /slots\.length\?`<button class="btn btn-primary" id="chvqs-ok"/.test(fn));
t('開面板時清掉上一次的選取', /window\._chvQsPick='';/.test(fn));

const sel=s.slice(s.indexOf('function chvQuickSel('), s.indexOf('function chvQuickGo('));
t('再點同一格＝取消選取', /_chvQsPick===t\)\?'':t/.test(sel));
t('只有選到的那格加 cag-slot-on', /classList\.toggle\('cag-slot-on'/.test(sel));
t('確認鈕跟著選取狀態開關', /ok\.disabled=!window\._chvQsPick/.test(sel));
t('確認鈕顯示選到的時間', /確認 \$\{window\._chvQsPick\}/.test(sel));

const go=s.slice(s.indexOf('function chvQuickGo('), s.indexOf('function chvQuickGo(')+400);
t('沒選時段按確認不前進', /if\(!t\)\{ showToast\('請先選一個時段'\); return; \}/.test(go));
t('確認才走 chvQuickPick', /chvQuickPick\(t\);/.test(go));

t('選取態 CSS 在 :hover 之後（壓得過）',
  s.indexOf('.modal .cag-slots .cag-slot.cag-slot-on{') > s.indexOf('.modal .cag-slots .cag-slot:hover{'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
