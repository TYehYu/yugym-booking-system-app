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

console.log('\n② 一組一列，姿勢與工具在上方（2026-09-16 改版）');
/* 使用者：「這邊應該要改成一列一列的　才可以單獨修改每一組的次數跟重量　然後站姿坐姿·工具
   可以設定按鈕在上方　所以就會是第一列動作　第二列姿勢按鈕　第三列工具按鈕
   再來是第一組次數x重量　下面[+]可以新增另外一組」
   ⚠ 級距鈕（.wpe-* 的 ±1／±5）隨「組數」欄位一起退場：現在每一組直接打數字。
     單位切換仍沿用 .wpe-unit 那組樣式。 */
const R=fn('tleRender');
ok('★★★ 版面順序：動作 → 姿勢 → 工具 → 逐組 → [+]',
   (()=>{ const i=[R.indexOf('id="tle-name"'), R.indexOf("optRow('posture'"), R.indexOf("optRow('tool'"),
          R.indexOf('class="ae-sets-head"'), R.indexOf('tleAddSet()')];
      return i.every(x=>x>0) && i.every((x,k)=>k===0||x>i[k-1]); })());
ok('★★★ 每一組都是輸入框（不是只有最後一組可改）',
   /id="tle-r-\$\{i\}"/.test(R) && /id="tle-w-\$\{i\}"/.test(R)
   && /sets\.map\(\(s,i\)=>`<div class="ae-set-cur">/.test(R));
ok('★★ 沿用逐組列那套四欄 grid 與 .ae-opt 白底卡（不另做一套樣式）',
   /class="ae-sets-head"/.test(R) && /class="ae-cur-fields"/.test(R)
   && /class="ae-opt\$\{E\[field\]===x\?' active':''\}"/.test(R)
   && /class="ae-grid ae-grid-\$\{cols\}"/.test(R));
ok('★★ 每一組可以單獨刪掉；刪到一組不剩補一組空的',
   /onclick="tleDelSet\(\$\{i\}\)"/.test(R)
   && /if\(!E\.sets\.length\) E\.sets\.push\(\{reps:'',weight:''\}\);/.test(src));
ok('★★★ 重畫前一定先把輸入框收回 state（否則剛打的數字會被洗掉）',
   /function tleReadSets\(\)\{/.test(src)
   && ['tleUnit','tleSetOpt','tleAddSet','tleDelSet'].every(f=>new RegExp('function '+f+'\\([^)]*\\)\\{\\s*\\n?\\s*tleReadSets\\(\\);').test(src)));

console.log('\n③ 存檔');
const S=fn('_tleSave');
ok('★★★ 一律寫 sets_detail（不再有「數字沒動就不碰」那條分支）',
   /sets_detail:JSON\.stringify\(valid\.map\(s=>\(\{reps:String/.test(S)
   && !/sets_detail:null/.test(S));
ok('★★★⚠ 彙總欄位要跟著同步 —— 三大項 PR 是從 l.weight 推導的，只寫逐組明細會讓 PR 停在舊數字',
   /weight:ws\.length\?Math\.max\.apply\(null,ws\):null,/.test(S)
   && /sets:valid\.length,/.test(S)
   && /reps:\(rf!=null&&isFinite\(rf\)\)\?rf:null,/.test(S));
ok('★★ 徒手（沒有任何重量）存 null，連單位也不留', /weight_unit:ws\.length\?_su:null,/.test(S));
ok('★★ 姿勢與工具也要存回去（原本視窗裡根本沒得改）',
   /posture:E\.posture\|\|null, tool:E\.tool\|\|null,/.test(S));
ok('★★ 一組都沒填就擋下', /if\(!valid\.length\)\{ showToast\('請至少記錄一組的次數或重量'\); return; \}/.test(S));
ok('★★ 名稱必填', /if\(!name\)\{ showToast\('請填動作名稱'\); return; \}/.test(S));
ok('★★ 防連點', /async function tleSave\(\)\{ return onceAct\('tlesave', _tleSave\); \}/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
