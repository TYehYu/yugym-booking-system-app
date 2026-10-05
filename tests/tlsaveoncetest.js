/* 新增動作的〔儲存〕連點會存兩筆（2026-10-05 使用者：「我剛剛上課用課表　新增動作的頁面
   〔儲存〕按了兩次就會出現兩筆該動作　會按兩次是以為沒按出去」）。

   每按一次 tlSaveExercise 就 uid('TLOG') 生一個新 id，所以兩次＝兩列 training_logs。
   這組抽屜裡其他三條寫入路徑 0909–0924 都已經包了 onceAct，只有這一條漏掉。
   第二件事同樣重要：會按第二次是因為按了沒反應 —— 按鈕要立刻變成停用的「儲存中…」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 連點只會存一筆');
ok('★★★ tlSaveExercise 包進 onceAct，實作搬到 _tlSaveExercise',
   /async function tlSaveExercise\(\)\{ return onceAct\('tlsave', _tlSaveExercise\); \}/.test(src)
   && /async function _tlSaveExercise\(\)\{/.test(src));
/* ⚠ uid('TLOG') 全檔有三處（套用方案、套用歷史也各有一處），要從函式起點往後找 */
const _fnAt=src.indexOf('async function _tlSaveExercise(){');
ok('★★★ 產生 id 的那一行在 _tlSaveExercise 裡（＝被擋住的那一次不會再生一個 id）',
   _fnAt>0 && src.indexOf("id:uid('TLOG')", _fnAt) > _fnAt
   && src.indexOf("id:uid('TLOG')", _fnAt) < src.indexOf("await dbPut('training_logs',log);", _fnAt));
/* onceAct 的規格：同一個 key 還在跑就回同一個 promise，跑完再多留 400ms */
ok('★★ onceAct 本身沒被動到（同 key 共用同一個 promise、完成後延遲 400ms 放行）',
   /const p=\(async\(\)=>fn\(\)\)\(\);\s*\n\s*_actBusy\[key\]=p;/.test(src)
   && /setTimeout\(\(\)=>\{ delete _actBusy\[key\]; \}, 400\);/.test(src));

console.log('\n② 按了要看得出按到了');
ok('★★★ 儲存鈕有 id，按下去變成停用的「儲存中…」',
   /<button id="ae-save" class="btn btn-green"/.test(src)
   && /_btn\.disabled=true; _btn\.textContent='儲存中…';/.test(src));
ok('★★★ 失敗才還原按鈕（成功會關掉整張抽屜）',
   /_btn\.disabled=false; _btn\.textContent=_btnTx;[\s\S]{0,120}?showToast\('儲存失敗：'/.test(src));

console.log('\n②b 修改紀錄（tleSave）也有同樣的回饋');
/* ⚠ 這一支本身不會寫出兩筆（拿 E.id 去 dbPut ＝ 覆蓋同一列），但使用者一樣會
   因為「按了沒反應」而點第二次（2026-10-05 回報）。按鈕要立刻變成停用的「儲存中…」。 */
ok('★★★ 修改紀錄的儲存鈕有 id，按下去變成停用的「儲存中…」',
   /<button id="tle-save" class="btn btn-green" onclick="tleSave\(\)">儲存<\/button>/.test(src)
   && /_btn\.disabled=true; _btn\.textContent='儲存中…';[\s\S]{0,200}?await dbPut\('training_logs',l\);/.test(src));
ok('★★★ 修改紀錄是更新同一筆（id 不變），不會長出第二筆',
   /let l=null; try\{ l=await dbGet\('training_logs',E\.id\); \}catch\(_\)\{\}/.test(src)
   && /Object\.assign\(l,\{/.test(src));

console.log('\n③ 其他三條寫入路徑本來就有擋，不要為了這次改動它們');
ok('★★ 套用方案 tlPlanApply', /async function tlPlanApply\(pid,useLast\)\{ return onceAct\('tlplan:'\+pid,/.test(src));
ok('★★ 套用歷史 tlDoApplyHist', /async function tlDoApplyHist\(srcBid\)\{ return onceAct\('tlhist:'\+srcBid,/.test(src));
ok('★★ 修改紀錄 tleSave', /async function tleSave\(\)\{ return onceAct\('tlesave', _tleSave\); \}/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
