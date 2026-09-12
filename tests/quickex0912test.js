/* 課表的常用動作＋套用這位會員上次的數字
   2026-09-12 使用者：「我想要教練可以自己設計預設動作 在上課的時後可以快速取用
                       然後再同一個客人取用相同動作的時候 要套用這個客人之前的紀錄」
   三個選擇：另做一份課表專用的清單、數字直接帶入可改、依「我最常用」排序。 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
const sql=fs.readFileSync(root+'docs/migrations/20260912_coach_exercises.sql','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),{得到:a,預期:e});
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };

console.log('① 上次那一筆怎麼攤成組');
const tlSetsFromLog=new Function(fnBody('tlSetsFromLog')+'\nreturn tlSetsFromLog;')();
eq('★★★ 逐組明細照抄（三組不同重量）',
   tlSetsFromLog({sets_detail:JSON.stringify([{reps:10,weight:60},{reps:8,weight:65},{reps:6,weight:70}])}),
   [{reps:'10',weight:'60'},{reps:'8',weight:'65'},{reps:'6',weight:'70'}]);
eq('★★★ 只有「組×次×重量」的（套方案來的）展開成同樣幾組',
   tlSetsFromLog({sets:3,reps:10,weight:60,weight_unit:'kg'}),
   [{reps:'10',weight:'60'},{reps:'10',weight:'60'},{reps:'10',weight:'60'}]);
eq('★★★ 磅不帶重量（第二頁的輸入框寫死 kg，帶進去會把 100lb 記成 100kg）',
   tlSetsFromLog({sets:1,reps:10,weight:100,weight_unit:'lb'}), [{reps:'10',weight:''}]);
eq('★★ 徒手（沒重量）照樣帶組數次數', tlSetsFromLog({sets:2,reps:12}), [{reps:'12',weight:''},{reps:'12',weight:''}]);
eq('★ 沒有上次 → 空陣列（呼叫端才會給一組空白）', tlSetsFromLog(null), []);

console.log('\n② 點常用動作：帶名稱、工具姿勢、上次的數字，直接進記錄頁');
const env=new Function('window','renderAddExerciseSheet', fnBody('tlSetsFromLog')+'\n'+fnBody('tlPickQuick')+'\nreturn tlPickQuick;');
const W={_tlState:{page:1,exercise_name:'',tool:null,posture:null,sets:[{reps:'',weight:''}]},
  _tlQuickEx:[{name:'保加利亞分腿蹲',tool:'啞鈴',posture:'站姿'}],
  _tlLastByEx:{'保加利亞分腿蹲':{sets:3,reps:10,weight:20,weight_unit:'kg',created_at:'2026-09-04T10:00:00.000Z'}}};
let painted=0;
env(W,()=>{painted++;})('保加利亞分腿蹲');
eq('★★★ 數字直接帶入（使用者選「直接帶入，可以改」）', W._tlState.sets,
   [{reps:'10',weight:'20'},{reps:'10',weight:'20'},{reps:'10',weight:'20'}]);
eq('★★ 工具姿勢一起帶', [W._tlState.tool,W._tlState.posture], ['啞鈴','站姿']);
eq('★★ 直接跳到記錄頁，不用再按一次', [W._tlState.page,painted], [2,1]);
eq('★★ 記得數字是哪一天帶來的（畫面要講一句）', W._tlState._lastDate, '09/04');
ok('★★ 畫面真的有講', /已帶入上次（\$\{st\._lastDate\}）的數字/.test(src));
const W2={_tlState:{page:1,sets:[]}, _tlQuickEx:[{name:'深蹲'}], _tlLastByEx:{}};
env(W2,()=>{})('深蹲');
eq('★★ 沒做過的動作 → 一組空白，不是空陣列', W2._tlState.sets, [{reps:'',weight:''}]);

console.log('\n③ 清單來源與排序');
const L=fnBody('tlLoadQuickEx');
ok('★★★ 讀 coach_exercises（不是訓練方案的動作庫 exercises）',
   /dbGetAll\('coach_exercises'\)/.test(L) && !/dbGetAll\('exercises'\)/.test(L));
/* 0912 二修：清單與排序抽成 cxeMine／cxeSorted（訓練方案那邊也吃同一支） */
ok('★★★ 只看自己的、啟用中的', /return \(list\|\|\[\]\)\.filter\(e=>e&&e\.active!==false&&String\(e\.coach_id\|\|''\)===me\);/.test(src));
ok('★★★ 順序是教練自己排的（sort_order），不再照「我最常用」自動排',
   /window\._tlQuickEx=cxeSorted\(cxeMine\(pre\)\);/.test(L) && !/useN/.test(src));
ok('★★ 上次的數字不分教練（會員的歷史就是會員的）',
   /l\.member_id===b\.member_id&&l\.booking_id!==b\.id/.test(L) && !/coach_id/.test(L.split('const last={}')[1]||''));
ok('★★ 打字只重畫清單那一塊（整頁重畫會失焦、中文選字被打斷）',
   /oninput="window\._tlState\.exercise_name=this\.value;tlQuickFilter\(\);"/.test(src)
   && /function tlQuickFilter\(\)\{ const box=document\.getElementById\('ae-pre-box'\);/.test(src));
ok('★ 清單還在載入時不畫空狀態（免得閃一下「還沒有常用動作」）', /if\(!window\._tlQuickEx\) return '';/.test(src));

console.log('\n④ 設定清單的地方（訓練方案頁）');
ok('★★★ 訓練方案頁多一張「我的常用動作」卡', /function cxeCardHtml\(list\)\{/.test(src) && /\$\{cxeCardHtml\(quickEx\)\}/.test(src)
   && /dbGetAll\('coach_exercises'\)\.catch\(\(\)=>\[\]\)\]\);/.test(src));
ok('★★ 存的是名稱與工具姿勢，不存數字（數字以會員上次的為準）',
   /await dbPut\('coach_exercises',\{ id:e\.id\|\|uid\('CXE'\), coach_id:SESSION\.id, name,\s*\n\s*tool:e\.tool\|\|null, posture:e\.posture\|\|null, active:true,/.test(src)
   && !/coach_exercises',\{[^}]*reps:/.test(src));
ok('★★ 同名擋下來（清單是給人點的，重覆兩列只會挑錯）', /已經在常用清單裡了/.test(src));
ok('★ 刪除要再問一次，並講明不影響已記錄的訓練', /function cxeDelAsk\(\)\{/.test(src) && /已經記錄的訓練不受影響/.test(src));

console.log('\n⑤ 資料表（docs/migrations/20260912_coach_exercises.sql）');
ok('★★★ RLS：自己的＋管理員', /alter table public\.coach_exercises enable row level security;/.test(sql)
   && /coach_id=\(select current_employee_id\(\)\)/.test(sql) && /\(select is_admin\(\)\)/.test(sql));
ok('★★★ 新表要有 change_log 觸發器（否則只會整表重抓）', /create trigger trg_change_log after insert or delete or update on public\.coach_exercises/.test(sql));
ok('★★ 前端快取比照設定表拉長', /coach_exercises:300000/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
