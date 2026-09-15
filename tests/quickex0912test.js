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
/* ⚠ 2026-09-15 反轉（使用者：「重量只有kg可以設定 沒有lb」）——
   原本磅刻意不帶重量，理由是「第二頁的輸入框寫死 kg，帶進去會把 100lb 記成 100kg」。
   第二頁現在可以切 kg／lb 了，那個前提消滅，所以磅要照樣帶回來；
   安全鎖改由 tlPickQuick 負責：把上次那筆的單位一起帶回 st.unit，數字與單位成對。 */
eq('★★★ 磅照樣帶重量（第二頁已可切單位，不再需要丟掉數字）',
   tlSetsFromLog({sets:1,reps:10,weight:100,weight_unit:'lb'}), [{reps:'10',weight:'100'}]);
eq('★★ 徒手（沒重量）照樣帶組數次數', tlSetsFromLog({sets:2,reps:12}), [{reps:'12',weight:''},{reps:'12',weight:''}]);
eq('★ 沒有上次 → 空陣列（呼叫端才會給一組空白）', tlSetsFromLog(null), []);

console.log('\n①-2 重量單位 kg／lb（2026-09-15 使用者：「重量只有kg可以設定 沒有lb」）');
/* 系統本來就支援 lb（WP_UNITS／WP_STEPS／TL_LB2KG／wpUnitOf、資料庫也有 lb 紀錄），
   缺的只有「新增動作」第二頁這一條路 —— 四處寫死 kg：已完成組摘要、當前輸入框、
   備註字串、存檔的 weight_unit。 */
{
  const S=src;
  ok('★★★ 第二頁有單位切換鈕（沿用 .wpe-unit／.wpe-u，不另做一套）',
     /<div class="ae-unit-row">/.test(S)
     && /onclick="tlUnit\('\$\{x\}'\)"/.test(S)
     && /function tlUnit\(u\)\{/.test(S));
  ok('★★★ 四處不再寫死 kg：摘要／輸入框／備註／存檔',
     /\$\{s\.weight\|\|'-'\} \$\{_u\}<\/div>/.test(S)          /* 已完成組摘要 */
     && /value="\$\{cur\.weight\}"><span>\$\{_u\}<\/span>/.test(S)  /* 當前輸入框 */
     && /'×'\+s\.weight\+_su/.test(S)                          /* 備註字串 */
     && /return w\.length\?_su:null;/.test(S));                /* 存檔的 weight_unit */
  ok('★★ 表單狀態帶 unit，預設 kg', /unit:'kg', sets:\[\{reps:'',weight:''\}\]\}/.test(S));
  ok('★★★ 切單位前先收回當前輸入（否則重繪會洗掉還沒存的那一組）',
     /function tlUnit\(u\)\{[\s\S]{0,200}?tlReadCur\(\);[\s\S]{0,120}?st\.unit=wpUnitOf\(u\);/.test(S));
  ok('★★ 只換單位不換算數字（教練照器材刻度記；比較訓練量時才用 TL_LB2KG 換算）',
     /只換單位、不換算數字/.test(S));
  /* ⚠ sets_detail 的 JSON 結構刻意不動：tlLogNums 有一條「舊資料沒有單位欄，
     一律當 kg」的退路，加了 unit 欄位會把它破壞掉。單位只存在 weight_unit。 */
  ok('★★★ sets_detail 結構沒被動（單位只存 weight_unit 欄位）',
     /sets_detail:JSON\.stringify\(valid\)/.test(S)
     && !/weight:s\.weight,\s*unit:/.test(S));
}

console.log('\n①-3 帶入上次紀錄時，數字與單位要成對');
{
  const W={_tlState:{page:1,exercise_name:'',tool:null,posture:null,unit:'kg',sets:[{reps:'',weight:''}]},
    _tlQuickEx:[{name:'臥推',tool:'槓鈴',posture:'臥姿'}],
    _tlLastByEx:{'臥推':{sets:2,reps:10,weight:100,weight_unit:'lb',created_at:'2026-09-11T10:00:00.000Z'}}};
  /* ⚠ wpUnitOf 內部要用 WP_UNITS 這個常數，抽函式進沙盒時要把它一起餵進來，
     否則是 ReferenceError（第一版就漏了）。 */
  const pick=new Function('window','renderAddExerciseSheet','WP_UNITS',
    fnBody('wpUnitOf')+'\n'+fnBody('tlSetsFromLog')+'\n'+fnBody('tlPickQuick')+'\nreturn tlPickQuick;')(W,()=>{},['kg','lb']);
  pick('臥推');
  eq('★★★ 上次用 lb → 重量與單位一起帶回（不會把 100lb 當成 100kg）',
     [W._tlState.sets[0].weight, W._tlState.unit], ['100','lb']);
  /* 沒有上次紀錄時不要硬改回 kg —— 教練可能剛切到 lb 正要輸入 */
  W._tlState.unit='lb';
  pick('沒做過的動作');
  eq('★★ 沒有上次紀錄 → 維持目前選的單位', W._tlState.unit, 'lb');
}

console.log('\n② 點常用動作：帶名稱、工具姿勢、上次的數字，直接進記錄頁');
/* ⚠ 2026-09-15：tlPickQuick 多了一個依賴 —— 它現在會呼叫 wpUnitOf 把上次那筆的單位
   帶回 st.unit（數字與單位要成對）。抽它進沙盒的地方都要一起餵 wpUnitOf 與 WP_UNITS，
   否則 ReferenceError。全專案只有這裡與 ①-3 兩處抽它。 */
const env=(w,paint)=>new Function('window','renderAddExerciseSheet','WP_UNITS',
  fnBody('wpUnitOf')+'\n'+fnBody('tlSetsFromLog')+'\n'+fnBody('tlPickQuick')+'\nreturn tlPickQuick;')(w,paint,['kg','lb']);
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
