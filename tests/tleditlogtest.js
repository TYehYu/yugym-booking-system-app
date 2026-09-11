/* 今日紀錄可以修改（2026-09-11 使用者附截圖：「套用方案沒辦法修改內容」）
   套用方案的視窗寫著「套進來之後每一項都還可以改」，但今日紀錄只有 ✕ 能刪。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const fn=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name); let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };

console.log('① 入口');
ok('★★★ 點今日紀錄那一列就是修改', /<div class="tlh-log" onclick="tlEditLog\('\$\{l\.id\}'\)">/.test(src));
ok('★★★ ✕ 擋住冒泡（刪之前不會先跳出修改視窗）', /<button class="tl-del" onclick="event\.stopPropagation\(\);delTrainingLog\('\$\{l\.id\}'\)">✕<\/button>/.test(src));
ok('★★ 看得出點得下去：標題旁一句提示（有紀錄才畫）＋按壓回饋',
   /今日訓練紀錄\$\{logs\.length\?'<span class="tlh-hint">點一下可修改<\/span>':''\}/.test(src) && /\.tlh-log:active\{background:#e3efe9;\}/.test(src));

console.log('\n② 跟訓練方案編輯器同一套（樣式與級距）');
const R=fn('tleRender');
ok('★★★ 用 .wpe-* 與 WP_STEPS（kg ±1／±0.5、lb ±5 —— 0909 定案，不另寫一份）',
   /class="wpe-row"/.test(R) && /WP_STEPS\[u\]/.test(R) && /WP_UNITS\.map/.test(R));
ok('★★ 名稱、次數、組數、重量、單位、備註都能改', ['tle-name','tle-${field}','tle-note','tleUnit'].every(k=>R.indexOf(k)>=0)
   && /stepRow\('reps'/.test(R) && /stepRow\('sets'/.test(R) && /stepRow\('weight'/.test(R));
{
  const W={_tle:{reps:10,sets:3,weight:40.2,unit:'kg'}};
  const step=new Function('window','document', fn('tleStep')+'return tleStep;')(W,{getElementById:()=>null});
  step('weight',0.1); eq('★★ 小數四捨五入到一位（不會跑出 40.300000000000004）', W._tle.weight, 40.3);
  W._tle.weight=0.5; step('weight',-0.5); eq('★★ 重量減到 0 以下＝徒手（留空）', W._tle.weight, '');
  W._tle.reps=1; step('reps',-1); eq('★★ 次數最少 1', W._tle.reps, 1);
  step('sets',1); eq('　　組數 +1', W._tle.sets, 4);
}

console.log('\n③ 存檔');
const S=fn('_tleSave');
ok('★★★ 數字沒動 → 逐組明細原封不動；動了才改成統一的次數×組數×重量',
   /if\(JSON\.stringify\(\[E\.reps,E\.sets,E\.weight,E\.unit\]\)!==E\.orig\)\{/.test(S) && /sets_detail:null/.test(S));
ok('★★ 重量留空存 null（0 會被讀成空槓，0909 規則）', /weight:\(w!=null&&w>0\)\?w:null/.test(S));
ok('★★ 名稱必填', /if\(!name\)\{ showToast\('請填動作名稱'\); return; \}/.test(S));
ok('★★ 防連點', /async function tleSave\(\)\{ return onceAct\('tlesave', _tleSave\); \}/.test(src));
ok('★ 逐組本來就不一樣的，視窗上先講一句', /原本每組數字不同；改了數字會變成統一的組數 × 次數 × 重量/.test(R));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
