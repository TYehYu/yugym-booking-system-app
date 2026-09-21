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
  ok('★★★ 鈕上寫出級距（手機沒有 hover，寫在 title 等於沒寫）',
     />−5</.test(h) && />＋5</.test(h), h);
  ok('★★ 減在左、加在右，中間還是那個可以打字的輸入框',
     h.indexOf('−5')<h.indexOf('<input') && h.indexOf('<input')<h.indexOf('＋5'));
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
ok('★★★ 格子內距收到 0 2px，± 才貼得住兩邊',
   /\.ae-set-field\{display:flex;align-items:center;gap:0;background:#fff;border:1px solid var\(--bd\);border-radius:9px;padding:0 2px;flex:1;\}/.test(src));
ok('★★ 數字置中（兩邊各一顆鈕時靠左會看起來歪掉）', /\.ae-set-in\{[\s\S]{0,260}?text-align:center;/.test(src));
ok('★★ 關掉數字框原生上下箭頭（桌機會再吃掉寬度，而且與 ± 重複）',
   /\.ae-set-in::-webkit-outer-spin-button,\.ae-set-in::-webkit-inner-spin-button\{-webkit-appearance:none;margin:0;\}/.test(src));
ok('★ 寬度算過並寫在原地（375px 實算：每格 118px＝兩顆 29px ＋ 中間 54px）',
   /每格 118px＝兩顆 29px ＋ 中間 54px 的輸入框/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
