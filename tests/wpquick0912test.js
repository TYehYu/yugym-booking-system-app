/* 方案統一改由「我的常用動作」設計（2026-09-12 使用者：「把目前訓練方案移除 統一改由訓練動作去設計
   例如打開新方案 動作可以套用教練自己預設動作跟順序」）
   三選一的答案：①方案留著、動作改從常用動作挑（現有 4 份清掉）②順序教練自己排（上下移動）
   ③動作資料庫停用，統一用常用動作。 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
const sql=fs.readFileSync(root+'docs/migrations/20260912_coach_exercises.sql','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),{得到:a,預期:e});
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };

console.log('① 動作資料庫退場');
ok('★★★ 管理頁、exVisible、對 exercises 的讀取都不在了',
   !/PAGES\.exercise_db=/.test(src) && !/function exVisible\(/.test(src) && !/dbGetAll\('exercises'\)/.test(src)
   && !/dbPut\('exercises'/.test(src));
ok('★★★ 導覽列兩處入口都拿掉', !/label:'動作資料庫'/.test(src) && !/page:'exercise_db'/.test(src) && !/key:'exercise_db'/.test(src));
ok('★★ 留了墓碑註解說明去哪了（不然下次看程式的人會以為漏掉）', /〔已移除〕動作資料庫（exercise_db 管理頁）2026-09-12/.test(src));
ok('★★ exercises 資料表不刪（訓練紀錄存的是名稱字串，留著萬一要回頭看）', /exercises 資料表\*\*沒有刪\*\*/.test(src));

console.log('\n② 常用動作的順序：教練自己排');
const cxeSorted=new Function(fnBody('cxeSorted')+'\nreturn cxeSorted;')();
eq('★★★ 照 sort_order 排', cxeSorted([{id:'c',sort_order:3},{id:'a',sort_order:1},{id:'b',sort_order:2}]).map(x=>x.id), ['a','b','c']);
eq('★★★ 還沒排過的（sort_order 空）接在後面，彼此照建立時間',
   cxeSorted([{id:'x',created_at:'2026-09-02'},{id:'a',sort_order:1},{id:'w',created_at:'2026-09-01'}]).map(x=>x.id), ['a','w','x']);
ok('★★ 不動到原陣列（清單在好幾個地方共用）', /return \(list\|\|\[\]\)\.slice\(\)\.sort/.test(fnBody('cxeSorted')));
const MV=fnBody('_cxeMove');
ok('★★★ 上下移動會把整份正規化成 1..n（否則兩筆「還沒排過」互換等於沒動）',
   /order\.splice\(j,0,order\.splice\(i,1\)\[0\]\);/.test(MV) && /sort_order:k\+1/.test(MV));
ok('★★ 沒變的那幾筆不寫回', /if\(!e \|\| Number\(e\.sort_order\)===k\+1\) continue;/.test(MV));
ok('★★ 卡片上是上下兩顆鍵，頭尾各自 disabled',
   /onclick="cxeMove\('\$\{e\.id\}',-1\)">↑/.test(src) && /onclick="cxeMove\('\$\{e\.id\}',1\)">↓/.test(src)
   && /\$\{i===0\?' disabled':''\}/.test(src) && /\$\{i===mine\.length-1\?' disabled':''\}/.test(src));
ok('★ 上課的快速清單吃同一個順序', /window\._tlQuickEx=cxeSorted\(cxeMine\(pre\)\);/.test(src));

console.log('\n③ 方案：從常用動作挑');
ok('★★★ ＋新增動作改成開挑選視窗（讀 coach_exercises、照清單順序）',
   /async function wpAddItem\(\)\{[\s\S]{0,260}dbGetAll\('coach_exercises'\)[\s\S]{0,120}cxeSorted\(cxeMine\(all\)\)/.test(src));
const AP=new Function('window','showToast','wpRender','wpNewItem',
  fnBody('wpQuickApply')+'\nreturn wpQuickApply;');
{
  const W={_wp:{items:[]}, _wpQuick:{list:[{id:'e1',name:'深蹲',tool:'槓鈴'},{id:'e2',name:'划船'},{id:'e3',name:'棒式'}], on:['e3','e1']}};
  let painted=0;
  AP(W,()=>{},()=>{painted++;},()=>({name:'',tool:'',reps:12,sets:3,weight:'',unit:'kg',note:''}))();
  eq('★★★ 照清單順序加入，不是勾選的先後（清單順序＝教練排好的上課順序）',
     W._wp.items.map(x=>x.name), ['深蹲','棒式']);
  eq('★★ 工具一起帶過去', W._wp.items[0].tool, '槓鈴');
  eq('★★ 加完回到方案畫面、暫存清掉', [painted, W._wpQuick], [1, null]);
}
{
  const W={_wp:{items:[]}, _wpQuick:{list:[{id:'e1',name:'深蹲'}], on:[]}};
  let toast='';
  AP(W,(t)=>{toast=t;},()=>{},()=>({}))();
  eq('★★ 一個都沒勾就按 → 擋下來', [W._wp.items.length, toast], [0, '先勾幾個動作']);
}
ok('★★ 已經在方案裡的標「已加入」，但不擋（同一個動作做兩輪很常見）',
   /have\.has\(String\(e\.name\|\|''\)\)\?'<span class="cxe-s">已加入<\/span>':''/.test(src)
   && /同一個動作做兩輪是常見的/.test(src));
ok('★★★ 「自己打一個」留著（現場想到的新動作照樣加得進來）',
   /function wpAddBlank\(\)\{/.test(src) && /onclick="wpAddBlank\(\)">自己打一個/.test(src));
ok('★★ 還沒有常用動作時，告訴他去哪裡建', /你還沒有常用動作/.test(src) && /順序也在那裡排/.test(src));
ok('★★ 單一動作視窗的挑選清單也改讀常用動作',
   /exs=cxeSorted\(cxeMine\(await dbGetAll\('coach_exercises'\)\)\)/.test(src)
   && /常用動作裡沒有「\$\{escH\(q\)\}」/.test(src));

console.log('\n④ 資料與遷移');
ok('★★★ sort_order 欄位', /alter table public\.coach_exercises add column if not exists sort_order integer;/.test(sql));
ok('★★ 舊動作庫 43 個已匯進當時在用的那位教練', /insert into public\.coach_exercises[\s\S]{0,400}from exercises x/.test(sql)
   && /not exists \(select 1 from coach_exercises c where c\.coach_id='c-mqjjpdszw1ze' and c\.name=x\.name\)/.test(sql));
ok('★★ 現有 4 份方案清掉這件事有寫下來', /delete from workout_plans;   ← 已執行/.test(sql));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
