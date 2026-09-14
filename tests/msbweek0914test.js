/* 會員端預約面板：一週七格攤開＋米底白框（2026-09-14）
   使用者兩則回饋：
   ①「現在一頁就可以點選日期快速查看時間　如果改成兩頁要查看就要一直返回」→ 維持一頁，只換日期列
   ②「這個頁面用綠色底會不會很奇怪　其他都是用米色底白色框？」→ 深綠底不是當初指定的，改米底
   ③「日期列不要再踩到之前的bug　點了後面的日期會跳回左邊」→ 沒有橫捲就沒有 scrollLeft 可歸零 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),{得到:a,預期:e});
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };
const SHEET=fnBody('msbRenderSheet');

console.log('① 日期列：固定七格、不再橫捲');
ok('★★★ 一次畫七格（原本是往後掃 14 天、能約的才畫）', /for\(let i=0;i<7;i\+\+\)\{/.test(SHEET)
   && !/for\(let i=0;i<14;i\+\+\)\{/.test(SHEET));
ok('★★★ 不能約的日子照樣畫、淡化不可點（格子數不會忽多忽少）',
   /: `<div class="msb-date msb-no">/.test(SHEET) && !/if\(!msbDateOk\(ds\)\) continue;/.test(SHEET));
ok('★★★ 判準仍是 msbDateOk，規則一個字沒動', /const okd=msbDateOk\(ds\);/.test(SHEET));
ok('★★★ 版型改 grid、不橫捲（病根：重繪後 scrollLeft 歸零）',
   /#msb-sheet \.msb-dates\{display:grid;grid-template-columns:repeat\(7,1fr\);gap:5px;overflow:visible;/.test(src));
ok('★★ 週的起點用現成的 heroWeekMonday，不自己算', /const mon=heroWeekMonday\(s\.wk\|\|s\.date\|\|ymd\(TODAY\)\);/.test(SHEET));
/* ⚠ 兩句都在 msbRenderSheet 的主體裡；msbWeekShift 那段說明寫在函式**上方註解**，
   fnBody 是從 function 那個字開始切的，抓不到（今天第二次踩到同一個坑）。 */
ok('★★ 那個 bug 的來歷寫在原地',
   /點了後面的日期會跳回左邊/.test(SHEET) && /scrollLeft 歸零的病根就沒了/.test(SHEET));

console.log('\n② 換週');
const WS=fnBody('msbWeekShift');
ok('★★★ 不能翻到本週之前（過去的日子本來就不能約）',
   /const thisMon=heroWeekMonday\(ymd\(TODAY\)\);/.test(WS) && /if\(d<thisMon\) return;/.test(WS));
ok('★★★ 上一週在本週時是 disabled（畫面也要看得出來）',
   /const _atStart=ymd\(heroWeekMonday\(today\)\)===ymd\(mon\);/.test(SHEET)
   && /onclick="msbWeekShift\(-1\)"\$\{_atStart\?' disabled':''\}/.test(SHEET));
ok('★★★ 點日期要清掉週錨點，否則選了別週的日子、下次開又跳回那一週',
   /function msbPickDate\(ds\)\{ const s=window\._msb; if\(!s\)return; s\.date=ds; s\.wk=null;/.test(src));
ok('★★ 週次列放在 .msb-dates 外面（包進去會變成第八格，七格被擠窄）',
   /\$\{_wkNav\}\$\{_dateBtns\?`<div class="msb-dates">/.test(src)
   && /包進去就變成第八格/.test(SHEET));
ok('★ _wkNav 有宣告（不是隱含全域）', /let _dateBtns='', _wkNav='';/.test(src));

console.log('\n③ 米底白框：只覆寫 #msb-sheet，不動共用件');
ok('★★★ 面板與時段格都改米底白底，且一律加 #msb-sheet 前綴',
   /#msb-sheet \.msb-panel\{background:var\(--bg\);/.test(src)
   && /#msb-sheet \.cag-slot\{background:var\(--card\);border:1px solid #cfe4d8;color:var\(--course-pt-accent,#1F6F54\);/.test(src));
ok('★★★ 共用件的原宣告沒被動到（行事曆的深色時段表照舊）',
   /^\.cag-slot\{border:none;border-radius:12px;padding:9px 0;font-size:13\.5px;/m.test(src)
   && /^\.msb-date\{flex:0 0 auto;/m.test(src)
   && /^\.msb-panel|^#msb-sheet \.msb-panel\{position:fixed/m.test(src));
ok('★★★ 時段字放大到 17px', /#msb-sheet \.cag-slot\{[^}]*font-size:17px;padding:15px 0;/.test(src));
ok('★★ 為綠底寫的淺色字整組換掉（sub／hint／empty／types／head／關閉鈕）',
   ['\\.msb-sub\\{color:var\\(--t2\\)','\\.msb-hint\\{color:var\\(--t3\\)','\\.msb-empty\\{color:var\\(--text\\)',
    '\\.msb-types button\\{background:var\\(--card\\)','\\.cag-slotsheet-head\\{color:var\\(--text\\)',
    '\\.cag-slotsheet-x\\{background:var\\(--card\\)']
   .every(p=>new RegExp('#msb-sheet '+p).test(src)));
ok('★★ 換底色的理由與 12074 那條教訓寫在原地',
   /深綠底不是你要求的/.test(src) && /近白字配米底，看不見/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
