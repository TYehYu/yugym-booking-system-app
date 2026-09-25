/* 套用上次課表時單位掉了（2026-09-25 使用者回報）

   「教練反應　他的客戶套用上次的訓練的紀錄時　單位都會變成kg不會仿照上次訓練的」

   tlDoApplyHist 複製了 sets_detail（逐組的次數與重量**數字**），
   卻沒有複製 weight_unit —— 顯示端 wpWeightHtml(weight, l.weight_unit)
   拿到 null 就 fallback 成 kg。所以症狀是「數字對、單位錯」。

   ⚠ weight 欄位也漏了，那是會滾下去的：
     那一欄是「最重的那一組」，「沿用上次的數字」兩條路都讀它
     → 這次套用出來的紀錄，下次就帶不出數字。

   ⚠ 另外兩條複製路徑本來就有帶單位，只有這一支漏：
     ・套用訓練方案      weight_unit:(...)?unit:null
     ・常用動作帶入上次   st.unit=wpUnitOf(L.weight_unit) */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 套用上次課表：單位與重量都要複製');
{
  const F=grab('tlDoApplyHist');
  ok('★★★ 帶 weight_unit（這就是使用者回報的那一個）', /weight_unit:s\.weight_unit,/.test(F));
  ok('★★★ 也帶 weight（不帶的話，下次「沿用上次的數字」就讀不到，會滾下去）',
     /weight:s\.weight, weight_unit:s\.weight_unit,/.test(F));
  /* 這一路本來就有的欄位，不能因為這次修改而掉東西 */
  ['exercise_name','body_part','posture','tool','reps','sets','sets_detail','slot','seq']
    .forEach(k=>ok('　　仍然帶 '+k, new RegExp('\\b'+k+':').test(F)));
}

console.log('\n② 另外兩條複製路徑本來就對（別只修一邊）');
{
  ok('★★★ 套用訓練方案：帶單位',
     /weight_unit:\(weight!=null&&isFinite\(weight\)&&weight>0\)\?unit:null,/.test(src));
  ok('★★★ 常用動作帶入上次：帶單位',
     /if\(L\) st\.unit=wpUnitOf\(L\.weight_unit\);/.test(src));
  ok('★★ 三條路都在，缺一就會有一種「單位跑掉」的情境',
     (src.match(/weight_unit/g)||[]).length>=5);
}

console.log('\n③ 成因寫在原地');
{
  ok('★★★ 講清楚是「單位沒被複製」而不是顯示端壞掉',
     /卻漏了 weight_unit，\s*\n\s*顯示端 wpWeightHtml\(s\.weight, l\.weight_unit\) 拿到 null 就 fallback 成 kg/.test(src));
  ok('★★ 講清楚 weight 為什麼也要帶（會滾下去）',
     /不帶的話，這次套用的紀錄下次就帶不出數字，是會滾下去的/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
