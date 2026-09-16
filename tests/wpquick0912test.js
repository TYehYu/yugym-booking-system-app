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
/* 2026-09-16 使用者：「下方動作目前看不到刪除的按鈕 然後不用排序了」——
   卡片上的 ↑↓ 兩顆鍵拿掉，改成一顆刪除。
   ⚠ 排序的底層（cxeSorted／_cxeMove）**保留不動**：清單仍照 sort_order 排，
     上課的快速清單也吃同一個順序（下一條）；只是不再提供手動調整的入口。 */
ok('★★ 卡片上不再有上下移動，改成一顆刪除',
   !/onclick="cxeMove\(/.test(src)
   && /onclick="event\.stopPropagation\(\);cxeDelRow\('\$\{e\.id\}'\)"/.test(src));
/* 2026-09-16 使用者：「常用動作的卡片 可以用滑鼠拖移順序」——
   收掉 ↑↓ 之後改成長按拖移，整套照方案編輯器的 wpLpStart 搬（那三道防線是 0909
   在手機上試出來的：pointerdown 就關 touch-action、non-passive touchmove preventDefault、
   長按成立後不理 pointercancel）。 */
ok('★★★ 長按拖移：三道防線都照搬，不是自己重寫一套',
   /function cxeLpStart\(e,id\)\{/.test(src)
   && /try\{ el\.style\.touchAction='none'; \}catch\(_\)\{\}/.test(src)
   && /window\.addEventListener\('touchmove',tmove,\{passive:false\}\);/.test(src)
   && /const onCancel=\(\)=>\{ if\(!armed\) finish\(false\); \};/.test(src));
ok('★★★ 放開後把整份新順序寫回 sort_order（只寫有變的那幾筆）',
   /cxeSaveOrder\(rowsNow\(\)\.map\(r=>r\.dataset\.id\)\.filter\(Boolean\)\)/.test(src)
   && /async function cxeSaveOrder\(ids\)\{/.test(src)
   && /if\(!e \|\| Number\(e\.sort_order\)===k\+1\) continue;/.test(src));
ok('★★ ✕ 不進拖移（否則按刪除會先浮起一張卡）',
   /if\(e\.target && e\.target\.closest && e\.target\.closest\('\.cxe-b'\)\) return;/.test(src));
/* 2026-09-16 桌機優化：清單從單欄改成自動多欄（auto-fill minmax(280px,1fr)）。
   ⚠⚠ 多欄之後拖移的落點判斷**不能再只比垂直中線** —— 同一列有好幾個項目時，
     光比 y 會把卡片丟到同列最左邊。改成「找中心點離游標最近的那張，
     再依游標相對它的位置決定插前面或後面」；同列比 x、跨列比 y。 */
ok('★★★ 清單自動多欄，且落點判斷同時看 x 與 y',
   /\.cxe-list\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(280px,1fr\)\);/.test(src)
   && /const moveTo=\(x,y\)=>\{/.test(src)
   && /const d=\(x-cx\)\*\(x-cx\)\+\(y-cy\)\*\(y-cy\);/.test(src)
   && /after=\(Math\.abs\(y-cy\) > b2\.height\/2\) \? \(y>cy\) : \(x>cx\);/.test(src));
ok('★★★ 多欄用到的 startX／offX 有宣告（漏掉會 ReferenceError，拖移一啟動就炸）',
   /const startX=e\.clientX, startY=e\.clientY;/.test(src)
   && /let armed=false, ghost=null, offX=0, offY=0, ended=false;/.test(src)
   && /offX=startX-r\.left; offY=startY-r\.top;/.test(src));
/* ⚠ 方案編輯器（wpLpStart）是這套拖移的原型，兩支有多段一字不差的程式碼。
   它的清單仍是單欄，落點判斷維持只比垂直中線 —— 這一條守著它沒有被順手改到。 */
ok('★★ 方案編輯器那支沒被波及（仍是單欄版的 moveTo=(y)）',
   /const moveTo=\(y\)=>\{/.test(src)
   && /const box=document\.getElementById\('wp-items'\); if\(!box\) return;/.test(src));
/* 2026-09-16 使用者回報：「我用手機拖拉常用動作卡片　卡片雖然也可以正確移動
   但是會有選字的拖曳」—— body.cxe-dragging-on 的 user-select:none 是長按 400ms
   成立後才加，而系統長按選字 300～500ms 就觸發，來不及。整列永久關掉才擋得住。 */
ok('★★★ 整列永久不可選字（不能只靠拖移成立後才關，那時已經在選字了）',
   /\.cxe-row\{[^}]*-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;\}/.test(src)
   && /el\.style\.touchAction='none'; el\.style\.webkitUserSelect='none'; el\.style\.userSelect='none';/.test(src));
/* 2026-09-16 使用者附截圖：「卡片按鈕不是白框」——視窗底是米色，選項也用米色就沒有邊界。
   ⚠ 選中（.active 淡綠）與「自己打一個」（.ae-add 白底虛線）兩種狀態不能被一起改掉，
     三態要分得開。 */
ok('★★ 工具／姿勢的選項是白底卡（米底白卡，不是米底米塊）',
   /\.ae-opt\{background:var\(--card\);border:1px solid var\(--bd\);/.test(src)
   && /\.ae-opt\.active\{background:#e3efe9;border-color:var\(--green\);/.test(src)
   && /\.ae-opt\.ae-add\{background:#fff;border-style:dashed;/.test(src));
/* 2026-09-16：訓練方案那張卡先被要求移除（沒方案時用一整屏講解，把常用動作擠掉），
   隨後使用者要「教練方便新增」，改成窄條入口 —— 標題列與「＋ 新方案」永遠在，
   方案清單只有真的有方案才列。
   ⚠ 入口不能整個拿掉：課表視窗那顆「套用方案」的來源就是這裡建的方案。 */
ok('★★★ 訓練方案入口還在（窄條：標題＋新方案鈕，有方案才列清單）',
   /<button class="btn btn-green btn-sm" onclick="wpEdit\(''\)">＋ 新方案<\/button>/.test(src)
   && /\$\{mine\.length\?`<div class="wp-list" style="margin-top:10px;">\$\{mine\.map\(p=>card\(p,true\)\)\.join\(''\)\}<\/div>`:''\}/.test(src)
   /* ⚠ 反面斷言一定要先剝掉註解再比對：「還沒有方案」這幾個字現在只剩在上面那段
      說明裡（講「原本那張卡在還沒有方案時會佔一整屏」），直接掃全檔會命中自己寫的註解。
      2026-09-16 當天第四次踩同一個坑，見 tests 裡其他幾支的同款警告。 */
   && !/還沒有方案/.test(src.replace(/\/\*[\s\S]*?\*\//g,'')));
/* 2026-09-16 使用者：「手機版點常用動作的卡片會進入一個視窗 但是桌機的有時候點不進去」——
   原本可點的只有中段那顆 .cxe-main 按鈕，列的內距與右側空白都是死角。 */
ok('★★★ 整列可點（不再只有中間那塊），且拖移後的那一次點擊不開編輯',
   /<div class="cxe-row" data-id="\$\{e\.id\}"/.test(src)
   && /onclick="cxeRowTap\('\$\{e\.id\}'\)" onpointerdown="cxeLpStart\(event,'\$\{e\.id\}'\)"/.test(src)
   && /function cxeRowTap\(id\)\{\s*\n\s*if\(window\._cxeDragged\)\{ window\._cxeDragged=0; return; \}/.test(src));
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
