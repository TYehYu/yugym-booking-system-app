/* 2026-09-21 使用者：「修改紀錄次數跟重量可以有+-符號　快速調整嗎」

   ⚠ 兩支一起加：「修改紀錄」（tleRender）與「記錄訓練」（renderAddExerciseSheet）
     的逐組列本來就是同一組 .ae-set-*，只加一邊會讓同一個手勢在兩個畫面不一樣。
   ⚠ 級距沿用 0909 訓練方案的 WP_STEPS（kg [1,0.5]、lb [5]），不另訂一套 ——
     那是照現場的槓片規格訂的。一格每邊只放得下一顆鈕，所以只取主級距（第一個）。
   ⚠ 這支把級距與夾邊**真的跑起來**，不是比對字串：浮點數收尾、空白起算、
     不得為負這三件事只有實跑才看得準。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,String(a)===String(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 沙箱：這三支只用到 WP_STEPS 與 wpUnitOf。
   ⚠ 在 index.html 幫它們加新依賴時記得回來補，少餵一個就 ReferenceError。 */
const F=new Function('WP_STEPS','wpUnitOf',
  grab('tlStepSize')+'\n'+grab('tlStepVal')+'\n'+grab('tlStepFieldHTML')
  +'\nreturn {tlStepSize,tlStepVal,tlStepFieldHTML};')
  ({kg:[1,0.5],lb:[5]}, x=>x==='lb'?'lb':'kg');

console.log('① 級距（沿用 0909 的 WP_STEPS，不另訂一套）');
eq('★★ 次數永遠 ±1（不管重量單位是什麼）', F.tlStepSize('reps','lb'), 1);
eq('★★★ kg 取主級距 1（±0.5 是細調，直接打字）', F.tlStepSize('weight','kg'), 1);
eq('★★★ lb 取主級距 5（現場的片就是 5 磅一跳）', F.tlStepSize('weight','lb'), 5);
ok('★★★ 真的讀 WP_STEPS，不是自己寫死數字',
   /return \(\(WP_STEPS\[wpUnitOf\(unit\)\]\|\|\[1\]\)\[0\]\)\|\|1;/.test(grab('tlStepSize')));
ok('★ 0909 的來源寫在原地（下次有人想在這裡另訂級距時看得到）',
   /級距沿用 0909 為訓練方案定下的 WP_STEPS/.test(src));

console.log('\n② 加減之後的值');
eq('★ 一般情況', F.tlStepVal('10',1), '11');
eq('★★★ 徒手（空白）按＋＝一個級距，不是 NaN', F.tlStepVal('',5), '5');
eq('★★★ 空白按−夾在 0（不會變成 -5）', F.tlStepVal('',-5), '0');
eq('★★★ 1 減 5 夾在 0，不得為負', F.tlStepVal('1',-5), '0');
eq('★★ null 也當空白處理', F.tlStepVal(null,1), '1');
eq('★★★⚠ 浮點數要收尾（0.5 的片連按會跑出 22.499999999999996）',
   F.tlStepVal(F.tlStepVal(F.tlStepVal('22.5',-0.5),-0.5),-0.5), '21');
eq('★★ 小數不會被無故取整', F.tlStepVal('22.5',-1), '21.5');
ok('★★ 收尾到小數兩位（不是 toFixed，否則整數會變成 "11.00"）',
   /Math\.round\(\(n\+d\)\*100\)\/100/.test(grab('tlStepVal')) && !/toFixed/.test(grab('tlStepVal')));

console.log('\n③ 鈕長什麼樣');
{
  const h=F.tlStepFieldHTML({id:'x',step:5,mode:'decimal',ph:'徒手',val:'25',dec:'D()',inc:'I()'});
  /* 2026-09-21 二修（使用者：「快速加減的按鈕可以改成圓形鈕嗎」）——
     圓形鈕的內接寬度就是直徑，「−0.5」四個字元要 24px、圓得 34px 才裝得下，
     而一格只有 113px：兩顆 34px 的圓會把數字壓到 39px，「100.5」要 49px 又被切掉。
     所以級距上移到表頭那顆［0.5］，鈕上只留符號。 */
  ok('★★★ 鈕上只留符號（級距在表頭，見 ⑧）', />−</.test(h) && />＋</.test(h)
     && !/−5/.test(h) && !/＋5/.test(h), h);
  ok('★★★ 只有符號時，級距要寫進 aria-label（不然讀螢幕的人不知道加多少）',
     /aria-label="減 5"/.test(h) && /aria-label="加 5"/.test(h), h);
  ok('★★ 減在左、加在右，中間還是那個可以打字的輸入框',
     h.indexOf('>−<')<h.indexOf('<input') && h.indexOf('<input')<h.indexOf('>＋<'));
  ok('★★ type="button"（不加的話在 form 裡會變成送出）', (h.match(/type="button"/g)||[]).length===2);
  ok('★★ tabindex="-1"：鍵盤 Tab 要直接跳到下一個數字，不要卡在兩顆鈕上',
     (h.match(/tabindex="-1"/g)||[]).length===2);
  ok('★ 輸入框留著（kg 的 0.5、或直接改成 37 都還要能打）', /<input type="number"/.test(h));
}

console.log('\n④ 兩支都要有（同一個手勢不能只做一半）');
{
  const R1=grab('tleRender'), R2=grab('renderAddExerciseSheet');
  ok('★★★ 修改紀錄：每一組兩格都接上 tleStep',
     /dec:`tleStep\(\$\{i\},'reps',-\$\{_sr\}\)`/.test(R1)
     && /inc:`tleStep\(\$\{i\},'weight',\$\{_sw\}\)`/.test(R1), 'tleRender');
  /* ⚠ 2026-09-24：「記錄訓練」與「修改紀錄」統一版面之後，這一頁**每一組**都可編輯
     （原本只有最後一組是輸入框），所以 tlStepCur 換成逐組的 tlStepSet(i,…)。 */
  ok('★★★ 記錄訓練：每一組兩格都接上 tlStepSet',
     /dec:`tlStepSet\(\$\{i\},'reps',-\$\{_sr\}\)`/.test(R2)
     && /inc:`tlStepSet\(\$\{i\},'weight',\$\{_sw\}\)`/.test(R2), 'renderAddExerciseSheet');
  ok('★★★ 次數固定 ±1，重量吃這個單位的主級距（見 ⑧）',
     /const _sr=1, _sw=tlStepSize\('weight',u\);/.test(R1)
     && /const _sr=1, _sw=tlStepSize\('weight',_u\);/.test(R2));
  ok('★★★ 兩支都用同一個版型函式（不各畫一套）',
     /tlStepFieldHTML\(\{/.test(R1) && /tlStepFieldHTML\(\{/.test(R2));
  ok('★★ 單位字從格子裡拿掉了（表頭已經寫著，重複只會擠掉 ± 的位置）',
     !/class="ae-set-in"[^>]*><span>次<\/span>/.test(src)
     && !/\.ae-set-field span\{/.test(src));
  ok('★ 為什麼拿得掉，理由寫在原地',
     /表頭本來就寫著「次數」「重量 kg」/.test(src));
}

console.log('\n⑤ 按下去之後的行為');
{
  const A=grab('tleStep'), B=grab('tlStepSet');
  ok('★★★ 先收值再算（使用者可能先用鍵盤改了別組再按這一組的 ±）',
     A.indexOf('tleReadSets();')>=0 && A.indexOf('tleReadSets();')<A.indexOf('tlStepVal(')
     && B.indexOf('tlReadCur();')>=0 && B.indexOf('tlReadCur();')<B.indexOf('tlStepVal('));
  ok('★★★ 只改那一格的 value，不整張重畫（重畫會關掉鍵盤、連按會一直閃）',
     !/tleRender\(\)/.test(A) && !/renderAddExerciseSheet\(\)/.test(B)
     && /el\.value=v;/.test(A) && /el\.value=v;/.test(B));
  ok('★★★ state 與畫面一起更新（只改畫面的話，存檔會存到舊值）',
     /E\.sets\[i\]\[f\]=v;/.test(A) && /st\.sets\[i\]\[f\]=v;/.test(B));
  ok('★★ 不重畫的理由寫在原地', /重畫會關掉輸入法鍵盤、連按幾下會一直閃/.test(src));
}

console.log('\n⑥ 樣式');
ok('★★ ± 有自己的 class，沒有去改共用的 .ae-set-del／.wpe-b', /\.ae-set-pm\{/.test(src));
ok('★★ 按下去要有回饋（手機沒有 hover）', /\.ae-set-pm:active\{background:var\(--sage-bg\);\}/.test(src));
ok('★★★ 格子內距收到 0 1px，± 才貼得住兩邊',
   /\.ae-set-field\{display:flex;align-items:center;gap:0;background:#fff;border:1px solid var\(--bd\);border-radius:9px;padding:0 1px;flex:1 1 0;\}/.test(src));
ok('★★ 數字置中（兩邊各一顆鈕時靠左會看起來歪掉）', /\.ae-set-in\{[\s\S]{0,260}?text-align:center;/.test(src));
ok('★★ 關掉數字框原生上下箭頭（桌機會再吃掉寬度，而且與 ± 重複）',
   /\.ae-set-in::-webkit-outer-spin-button,\.ae-set-in::-webkit-inner-spin-button\{-webkit-appearance:none;margin:0;\}/.test(src));
ok('★ 寬度是量的不是算的，數字寫在原地',
   /± 兩顆各 24px；次數內寬 34px、重量內寬 58px（「100\.5」49px，\*\*餘 9px\*\*）/.test(src));

/* 2026-09-21 二修（使用者附截圖：「畫面擠在一起了」，數字 10 被切成「1(」）——
   根因是 .modal:has(.ash-sheetmk) input 這條 !important 規則：
   它給視窗內每一個 input 塞 padding:12px 13px ＋ 白底圓角陰影，
   套到 113px 寬的逐組格子上光內距就吃掉 26px。
   ⚠ 「記錄訓練」沒有 .ash-sheetmk，所以同一組元件只有「修改紀錄」壞掉 ——
     下次遇到「同一個元件只有一張視窗長得不一樣」先查這條。 */
console.log('\n⑦ 逐組格子要從跳視窗那條 !important 豁免出來');
ok('★★★ 有豁免規則，而且 padding／陰影／白底都蓋回去',
   /\.modal:has\(\.ash-sheetmk\) \.ae-set-field \.ae-set-in\{\s*\n?\s*padding:12px 2px !important;border-radius:0 !important;\s*\n?\s*border:none !important;box-shadow:none !important;background:transparent !important;\}/.test(src));
ok('★★★ 選擇器要寫滿四段才壓得過來源那條（0,2,1＋!important）',
   /只寫 \.ae-set-in 或 \.modal \.ae-set-in 都會輸/.test(src));
ok('★★ 只豁免逐組格子，同一張視窗的「動作」「備註」仍是大白框',
   /只豁免 \.ae-set-in 一個：同一張視窗的「動作」「備註」仍要維持那個大白框的樣子/.test(src)
   && /\.modal:has\(\.ash-sheetmk\) input,\.modal:has\(\.ash-sheetmk\) select\{/.test(src));
ok('★★★ 欄寬與間距三行一起改（只改一行就回到 0915「沒有對齊」）',
   /\.ae-sets-head,\.ae-set-done,\.ae-set-cur\{\s*\n?\s*display:grid;grid-template-columns:20px 0\.78fr 1fr 28px 20px;gap:6px;align-items:center;\}/.test(src)
   && /\.ae-sets-head\{display:flex;align-items:center;gap:6px;/.test(src)
   && /\.ae-set-done\{display:flex;align-items:center;gap:6px;/.test(src)
   && /\.ae-set-cur\{display:flex;align-items:center;gap:6px;/.test(src)
   && /\.ae-sets-head>span:first-child\{width:20px;/.test(src));

/* 2026-09-21 使用者：「前面的編號改簡單一點　1. 2.就好」——
   原本是品牌綠實心圓。它只是列序號，用最重的視覺畫會跟旁邊真正要看的數字搶注意力。 */
/* ⚠ 2026-09-24：「記錄訓練」不再有「已完成組唯讀摘要」那種列
   （與「修改紀錄」統一之後，每一組都是輸入框），所以 .done 那一款沒有用武之地。
   樣式留著不刪 —— 它是 .ae-set-no 的一個修飾類，刪了也省不了什麼，
   而唯讀列將來若再出現（例如會員端只讀版）還會用到。 */
ok('★★★ 組別編號是純文字「1.」，不是綠色實心圓',
   /\.ae-set-no\{width:20px;height:auto;flex:none;border-radius:0;background:none;/.test(src)
   && (src.match(/<div class="ae-set-no">\$\{i\+1\}\.<\/div>/g)||[]).length===2);
/* ⚠⚠ 2026-09-21 最難找的那一個：表頭的欄位規則沒有「>」，
   會把**巢狀**的 span 也當成欄位 —— .ae-head-unit 裡的 kg／lb 那組 .wpe-unit
   被 `span:first-child{width:20px}` 壓成 20px，裡面 32px 的鈕整個溢出去疊在旁邊
   （使用者截圖：lb 跟 0.5 疊在一起）。表頭以前只放文字所以沒事，
   現在放了兩組鈕就出事。 */
ok('★★★ 表頭欄位規則只吃直接子層（沒有「>」會壓到巢狀的鈕）',
   /\.ae-sets-head>span:first-child\{/.test(src)
   && /\.ae-sets-head>span:nth-child\(2\),\.ae-sets-head>span:nth-child\(3\)\{flex:1;text-align:center;\}/.test(src)
   && !/\.ae-sets-head span:first-child\{/.test(src)
   && !/\.ae-sets-head span:nth-child/.test(src));
ok('★★ 這個坑的成因寫在原地', /會把\*\*巢狀的\*\* span 也當成「組」欄/.test(src));
ok('★★ 三行一起改的理由寫在原地', /表頭／已完成組／輸入組三行\*\*一定要一起改\*\*/.test(src));

/* ══ 2026-09-21 四修：〔+0.5〕的位置 ══
   先做成表頭的「級距切換」，使用者看到實機後指正：
     「0.5 要放在每一組的重量上面　應該不是跟著標題吧?　他是拿來幫每一組重量
       快速增加 0.5 用的」
   使用者在兩種做法之間選了「按一下就 +0.5（直接加）」，所以：
   ・表頭那套級距切換整組收掉（tlStepList／tlStepPick／tleWStep／tlWStepCur）
   ・每一列的重量右邊多一顆〔+0.5〕**動作鈕**，按一下就是那一組 +0.5
   ・± 維持這個單位的正常級距（kg 1、lb 5）
   ⚠ 這支守的是「不要兩個地方都能改級距」—— 表頭那套復活的話這裡會擋下來。 */
console.log('\n⑧〔+0.5〕在每一列，不在表頭（2026-09-21 四修）');
{
  const codeOnly=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
  ok('★★★ 表頭那套級距切換整組收掉，不留死碼',
     !/tlStepList/.test(codeOnly) && !/tlStepPick/.test(codeOnly)
     && !/tleWStep/.test(codeOnly) && !/tlWStepCur/.test(codeOnly)
     && !/ae-head-step/.test(codeOnly) && !/wstep/.test(codeOnly));
  ok('★★ 收掉的理由與使用者原話留在註解裡（免得有人再做一次）',
     /0\.5 要放在每一組的重量上面/.test(src) && /〔已移除〕表頭的級距切換/.test(src));

  const R1=grab('tleRender'), R2=grab('renderAddExerciseSheet');
  ok('★★★ 修改紀錄：每一列都有一顆〔+0.5〕，打的是那一列的重量',
     /class="ae-set-half"[\s\S]{0,160}?onclick="tleStep\(\$\{i\},'weight',0\.5\)">\+0\.5<\/button>/.test(R1));
  ok('★★★ 記錄訓練：每一組也有',
     /class="ae-set-half"[\s\S]{0,160}?onclick="tlStepSet\(\$\{i\},'weight',0\.5\)">\+0\.5<\/button>/.test(R2));
  ok('★★★ 是動作不是模式：按一下直接 +0.5，沒有「先切換」那一步',
     /aria-label="這一組重量加 0\.5"/.test(R1));
  ok('★★ 次數沒有 0.5（次數不會有半下）',
     !/ae-set-half[\s\S]{0,160}?'reps'/.test(R1) && !/ae-set-half[\s\S]{0,160}?'reps'/.test(R2));
  ok('★★★ ± 回到這個單位的正常級距（kg 1、lb 5）',
     /const _sr=1, _sw=tlStepSize\('weight',u\);/.test(R1)
     && /const _sr=1, _sw=tlStepSize\('weight',_u\);/.test(R2));
  /* 2026-09-24：兩支的表頭統一成同一句（單位切換就掛在「重量」後面）。 */
  ok('★★ 兩支的表頭長得一樣（重量 ＋ kg／lb 切換）',
     (src.match(/<span class="ae-head-unit">重量<span class="wpe-unit">/g)||[]).length===2);
  ok('★★ 佔位格的樣式留著（將來若再有唯讀列還會用到）',
     /\.ae-set-pad\{flex:none;width:28px;\}/.test(src));
}
ok('★★★ 圓形鈕：寬＝高，align-self 不能是 stretch（會被拉成膠囊）',
   /\.ae-set-pm\{flex:none;width:24px;height:24px;align-self:center;/.test(src)
   && /border-radius:50%;/.test(src));
ok('★★ 白格子裡的圓鈕要用米底，不然白對白看不見', /\.ae-set-pm\{[^}]*background:var\(--card2\);/.test(src));
ok('★★〔+0.5〕長得跟 ± 不一樣（方角，不是圓）—— 它不是同一種東西',
   /\.ae-set-half\{flex:none;width:28px;[\s\S]{0,240}?border-radius:8px;/.test(src)
   && !/\.ae-set-half\{[^}]*border-radius:50%/.test(src));
ok('★★★⚠ 兩欄不等寬（0.78:1）—— 等寬的話重量一定被切掉',
   /grid-template-columns:20px 0\.78fr 1fr 28px 20px;gap:6px;/.test(src)
   && /\.ae-cur-fields \.ae-set-field:first-child\{flex:0\.78 1 0;\}/.test(src));
ok('★★ 不等寬的理由與實測數字寫在原地',
   /重量會出現「100\.5」這種四五個字元的值（49px），次數幾乎只有兩位數（「12」22px）/.test(src)
   && /次數內寬 34px（「100」32\.9px）、重量內寬 58px（「100\.5」49px，餘 9px）/.test(src));
ok('★★ 表頭欄位規則只吃直接子層（沒有「>」會壓到巢狀的鈕）',
   /\.ae-sets-head>span:first-child\{/.test(src)
   && !/\.ae-sets-head span:first-child\{/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
