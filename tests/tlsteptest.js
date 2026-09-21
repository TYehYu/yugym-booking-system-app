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
  +'\n'+grab('tlStepList')+'\n'+grab('tlStepPick')
  +'\nreturn {tlStepSize,tlStepVal,tlStepFieldHTML,tlStepList,tlStepPick};')
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
  ok('★★★ 記錄訓練：當前那一組接上 tlStepCur',
     /dec:`tlStepCur\('reps',-\$\{_sr\}\)`/.test(R2)
     && /inc:`tlStepCur\('weight',\$\{_sw\}\)`/.test(R2), 'renderAddExerciseSheet');
  ok('★★★ 重量用的是表頭選的那個級距（次數固定 1）',
     /const _sr=1, _sw=_ws;/.test(R1) && /const _sr=1, _sw=_ws;/.test(R2));
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
  const A=grab('tleStep'), B=grab('tlStepCur');
  ok('★★★ 先收值再算（使用者可能先用鍵盤改了別組再按這一組的 ±）',
     A.indexOf('tleReadSets();')>=0 && A.indexOf('tleReadSets();')<A.indexOf('tlStepVal(')
     && B.indexOf('tlReadCur();')>=0 && B.indexOf('tlReadCur();')<B.indexOf('tlStepVal('));
  ok('★★★ 只改那一格的 value，不整張重畫（重畫會關掉鍵盤、連按會一直閃）',
     !/tleRender\(\)/.test(A) && !/renderAddExerciseSheet\(\)/.test(B)
     && /el\.value=v;/.test(A) && /el\.value=v;/.test(B));
  ok('★★★ state 與畫面一起更新（只改畫面的話，存檔會存到舊值）',
     /E\.sets\[i\]\[f\]=v;/.test(A) && /cur\[f\]=v;/.test(B));
  ok('★★ 不重畫的理由寫在原地', /重畫會關掉輸入法鍵盤、連按幾下會一直閃/.test(src));
}

console.log('\n⑥ 樣式');
ok('★★ ± 有自己的 class，沒有去改共用的 .ae-set-del／.wpe-b', /\.ae-set-pm\{/.test(src));
ok('★★ 按下去要有回饋（手機沒有 hover）', /\.ae-set-pm:active\{background:var\(--sage-bg\);\}/.test(src));
ok('★★★ 格子內距收到 0 1px，± 才貼得住兩邊',
   /\.ae-set-field\{display:flex;align-items:center;gap:0;background:#fff;border:1px solid var\(--bd\);border-radius:9px;padding:0 1px;flex:1;\}/.test(src));
ok('★★ 數字置中（兩邊各一顆鈕時靠左會看起來歪掉）', /\.ae-set-in\{[\s\S]{0,260}?text-align:center;/.test(src));
ok('★★ 關掉數字框原生上下箭頭（桌機會再吃掉寬度，而且與 ± 重複）',
   /\.ae-set-in::-webkit-outer-spin-button,\.ae-set-in::-webkit-inner-spin-button\{-webkit-appearance:none;margin:0;\}/.test(src));
ok('★ 寬度是量的不是算的，數字寫在原地',
   /＝ ± 兩顆各 26px ＋ 中間輸入框內寬 56px/.test(src));

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
ok('★★★ 四欄的欄寬與間距三行一起改（只改一行就回到 0915「沒有對齊」）',
   /\.ae-sets-head,\.ae-set-done,\.ae-set-cur\{\s*\n?\s*display:grid;grid-template-columns:20px 1fr 1fr 20px;gap:8px;align-items:center;\}/.test(src)
   && /\.ae-sets-head\{display:flex;align-items:center;gap:8px;/.test(src)
   && /\.ae-set-done\{display:flex;align-items:center;gap:8px;/.test(src)
   && /\.ae-set-cur\{display:flex;align-items:center;gap:8px;/.test(src)
   && /\.ae-sets-head>span:first-child\{width:20px;/.test(src));

/* 2026-09-21 使用者：「前面的編號改簡單一點　1. 2.就好」——
   原本是品牌綠實心圓。它只是列序號，用最重的視覺畫會跟旁邊真正要看的數字搶注意力。 */
ok('★★★ 組別編號是純文字「1.」，不是綠色實心圓',
   /\.ae-set-no\{width:20px;height:auto;flex:none;border-radius:0;background:none;/.test(src)
   && /<div class="ae-set-no">\$\{i\+1\}\.<\/div>/.test(src)
   && /<div class="ae-set-no">\$\{curNo\}\.<\/div>/.test(src)
   && /<div class="ae-set-no done">\$\{i\+1\}\.<\/div>/.test(src));
ok('★★ 已完成組的編號更淡（那是已經記好的，不需要再被看見）',
   /\.ae-set-no\.done\{background:none;color:var\(--t3\);\}/.test(src));
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

/* 2026-09-21 三修：「然後在重量上方新增按鈕［0.5］　快速加減的按鈕可以改成圓形鈕嗎」
   ⚠ 兩件事綁在一起：圓形鈕裝不下「−0.5」，所以級距一定要有地方顯示 → 就是這顆［0.5］。
   ⚠ 只放一顆不是偷懶：表頭那一格實測 112px，三顆 40px 的鈕就會折行（見 ⑧ 最後一條）。 */
console.log('\n⑧ 重量級距［0.5］切換（2026-09-21）');
eq('★★★ kg 的清單本來就有 0.5（0909 定案），不會變成三顆', JSON.stringify(F.tlStepList('kg')), '[1,0.5]');
eq('★★★ lb 補一顆 0.5（現場的片是 5 磅，但教練要按得到 0.5）', JSON.stringify(F.tlStepList('lb')), '[5,0.5]');
eq('★★ 沒選過＝主級距（kg 1）', F.tlStepPick('kg',undefined), 1);
eq('★★ 沒選過＝主級距（lb 5）', F.tlStepPick('lb',undefined), 5);
eq('★★★ 選了 0.5 之後切單位仍保留（兩個單位都有 0.5）', F.tlStepPick('lb',0.5), 0.5);
eq('★★★ 選了 ±1 之後切到 lb → 退回 5（lb 沒有 ±1，不能留著無效值）', F.tlStepPick('lb',1), 5);
eq('★★★ 選了 ±5 之後切回 kg → 退回 1', F.tlStepPick('kg',5), 1);
{
  const R1=grab('tleRender'), R2=grab('renderAddExerciseSheet');
  ok('★★★ 退回的值要寫回 state（不寫回去下次重畫又會跳一次）',
     /const _ws=tlStepPick\(u, E\.wstep\); E\.wstep=_ws;/.test(R1)
     && /const _ws=tlStepPick\(_u, st\.wstep\); st\.wstep=_ws;/.test(R2));
  ok('★★★ 兩支表頭都有那顆［0.5］，而且是切換（再按一次回到正常級距）',
     /onclick="tleWStep\(\$\{_ws===0\.5\?tlStepList\(u\)\[0\]:0\.5\}\)">0\.5<\/button>/.test(R1)
     && /onclick="tlWStepCur\(\$\{_ws===0\.5\?tlStepList\(_u\)\[0\]:0\.5\}\)">0\.5<\/button>/.test(R2));
  ok('★★ 選取＝品牌綠實心（與旁邊 kg／lb 同一組語彙）',
     /class="wpe-u\$\{_ws===0\.5\?' on':''\}"/.test(R1) && /class="wpe-u\$\{_ws===0\.5\?' on':''\}"/.test(R2));
  ok('★★ title 寫出目前每次加減多少', /title="每次加減 \$\{_ws\}"/.test(R1));
  ok('★★ 換級距要重畫（表頭才看得出選了哪顆），而且先收值',
     /function tleWStep\(v\)\{ tleReadSets\(\); [\s\S]{0,90}tleRender\(\); \}/.test(src)
     && /function tlWStepCur\(v\)\{ tlReadCur\(\); [\s\S]{0,110}renderAddExerciseSheet\(\); \}/.test(src));
}
ok('★★★ 圓形鈕：寬＝高，align-self 不能是 stretch（會被拉成膠囊）',
   /\.ae-set-pm\{flex:none;width:26px;height:26px;align-self:center;/.test(src)
   && /border-radius:50%;/.test(src));
ok('★★ 白格子裡的圓鈕要用米底，不然白對白看不見', /\.ae-set-pm\{[^}]*background:var\(--card2\);/.test(src));
ok('★★★ 表頭鈕要壓掉 .wpe-u 的 min-width:40px（三顆 40px 排不進 112px）',
   /\.ae-head-unit \.wpe-u\{padding:2px 7px;font-size:10\.5px;min-width:32px;\}/.test(src));
/* 2026-09-21 使用者附截圖：「擠在一起了　中間加一行吧」 */
ok('★★★ ［0.5］自己一行（四樣東西排同一行會互相壓到）',
   /\.ae-head-step\{flex:0 0 100%;justify-content:center;margin:0;\}/.test(src));
ok('★★★ 容器要 display:flex＋width:100%，inline-flex 的百分比算不出來',
   /\.ae-head-unit\{display:flex;width:100%;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;row-gap:5px;\}/.test(src));
ok('★★ inline-flex 為什麼不行，寫在原地',
   /inline-flex 的寬度是由內容撐出來的（shrink-to-fit），百分比算不出來/.test(src));
ok('★★ 實測數字寫在原地（表頭第一行 98px／格子 112px；數字餘 7px）',
   /實測第一行：「重量」22 ＋ kg 32 ＋ lb 32 ＋ 兩道 6px ＝ 98px，格子 112px，排得下/.test(src)
   && /最寬的「100\.5」是 49px，\*\*還剩 7px\*\*/.test(src));
ok('★★ 為什麼只放一顆，理由寫在原地（免得有人好心補成一對）',
   /四顆鈕會折成三行、表頭從 28px 變 77px/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
