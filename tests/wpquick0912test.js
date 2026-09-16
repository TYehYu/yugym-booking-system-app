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
/* 2026-09-16 使用者：「常用動作四列分類 上肢推 上肢拉 下肢推 下肢拉 其他」，選「分類當頁籤」。
   ⚠ 資料庫存 null＝還沒分類，讀取端一律當「其他」（cxeCatOf）——
     不要把 '其他' 硬塞進資料庫，那會讓「刻意歸為其他」與「根本沒分過」分不出來。 */
ok('★★★ 五個分類與 null 的處理',
   /const CXE_CATS=\['上肢推','上肢拉','下肢推','下肢拉','其他'\];/.test(src)
   && /const cxeCatOf=e=>\{ const c=String\(\(e&&e\.category\)\|\|''\)\.trim\(\); return CXE_CATS\.indexOf\(c\)>=0\?c:'其他'; \};/.test(src));
ok('★★★ 頁籤只畫有動作的分類，並記住目前停在哪一類',
   /const cats=CXE_CATS\.filter\(c=>cnt\[c\]\);/.test(src)
   && /window\._cxeCat=cur;/.test(src)
   && /function cxeSetCat\(c\)\{ window\._cxeCat=String\(c\|\|''\); navTo\('coach_plans'\); \}/.test(src));
/* 2026-09-16 使用者附截圖：手機上「上肢推」被折成三列直書。
   ⚠ flex 子項預設會被壓縮，五顆三字中文塞不下時會被壓到最小寬度、中文逐字換行。
   ⚠⚠ 同一個坑 2026-08-20 在票券卡踩過（acctfortunetest 釘著 .pp-sheet-* 那兩條），
     當時只補在那個範圍內；訓練方案頁的頁籤落在範圍外又中一次。
     所以「不折字」這條通用防線放在共用規則上，逐處補一定會再漏。 */
ok('★★★ 按鈕本身不折字（通用防線放在 .tkf-btn，不逐處補）',
   /\.tkf-btn\{flex:0 0 auto;white-space:nowrap;/.test(src));
/* 使用者選了「橫向捲動」而不是換行：五顆排成一列可左右滑，永遠只佔一列高度。
   ⚠⚠ 只套訓練方案頁（.tkf-scroll），**基礎 .tkfilter 不可以動** ——
     票券卡共用那支而且沒出問題，改共用規則等於把範圍放大到沒被要求的地方。 */
ok('★★★ 橫向捲動只套這一頁，沒有動到票券卡共用的 .tkfilter',
   /\.tkfilter\.tkf-scroll\{flex-wrap:nowrap;overflow-x:auto;/.test(src)
   && /\.tkfilter\{display:flex;gap:8px;margin-bottom:14px;\}/.test(src));
ok('★★ 捲軸要藏起來（桌機會冒出橫軸，和圓角膠囊鈕放在一起很突兀）',
   /\.tkfilter\.tkf-scroll\{[^}]*scrollbar-width:none;/.test(src)
   && /\.tkfilter\.tkf-scroll::-webkit-scrollbar\{display:none;\}/.test(src));
ok('★★ 頁籤沿用票券卡那組 .tkfilter／.tkf-btn／.tkf-n（不另做一套）',
   /<div class="tkfilter tkf-scroll" style="margin:2px 0 12px;">/.test(src)
   && /class="tkf-btn\$\{c===cur\?' active':''\}" onclick="cxeSetCat\('\$\{c\}'\)">\$\{c\}<i class="tkf-n">\$\{cnt\[c\]\}<\/i>/.test(src));
/* 2026-09-16 使用者選的三項手機優化（都在「我的常用動作」這張卡）：
   ⚠⚠ 上面那張卡的「＋ 新方案」要維持 btn-green —— 它才是這一頁的主要動作。
     兩顆都降級或都不降，就回到「分不出主次」的原點。 */
ok('★★★ 常用動作的「＋ 新增」降成次要鈕，訓練方案的「＋ 新方案」仍是主要鈕',
   /<button class="btn btn-ghost btn-sm" onclick="cxeEdit\(''\)">＋ 新增<\/button>/.test(src)
   && /<button class="btn btn-green btn-sm" onclick="wpEdit\(''\)">＋ 新方案<\/button>/.test(src));
ok('★★ 副標收成一行（第二句講的是課表行為，不是這一頁的操作）',
   /<div class="wp-sub">上課按「＋ 新增動作」、方案挑動作，都照這個順序。<\/div>/.test(src));
ok('★★ 清單列的刪除鈕改小並淡化（平常灰，滑過或按下才轉紅）',
   /\.cxe-b\{width:26px;height:26px;/.test(src)
   && /\.cxe-b\.cxe-del\{color:var\(--t3\);\}/.test(src)
   && /\.cxe-b\.cxe-del:hover,\.cxe-b\.cxe-del:active\{color:var\(--danger\);/.test(src));
/* ⚠⚠ 這一條是分類做成頁籤之後最容易出事的地方：畫面上只有當前那一類，
   若把 ids 直接寫成 sort_order 1..n，會把其他類別佔用的順序整個蓋掉。 */
ok('★★★ 拖移排序只在「這一類原本佔據的全域位置」裡重排，不動其他類別',
   /const slots=\[\]; mine\.forEach\(\(e,i\)=>\{ if\(set\.has\(e\.id\)\) slots\.push\(i\); \}\);/.test(src)
   && /slots\.forEach\(\(pos,k\)=>\{ const e=mine\.find\(x=>x\.id===ids\[k\]\); if\(e\) next\[pos\]=e; \}\);/.test(src)
   && /for\(let k=0;k<next\.length;k\+\+\)\{/.test(src));
ok('★★ 新增時預設吃目前這一頁的分類（在下肢推那頁按新增，多半就是要加下肢推）',
   /category:\(window\._cxeCat\|\|''\)/.test(src));

console.log('\n③ 方案：從常用動作挑');
ok('★★★ ＋新增動作改成開挑選視窗（讀 coach_exercises，清單照教練排好的順序列出）',
   /async function wpAddItem\(\)\{[\s\S]{0,260}dbGetAll\('coach_exercises'\)[\s\S]{0,120}cxeSorted\(cxeMine\(all\)\)/.test(src));
const AP=new Function('window','showToast','wpRender','wpNewItem',
  fnBody('wpQuickApply')+'\nreturn wpQuickApply;');
{
  const W={_wp:{items:[]}, _wpQuick:{list:[{id:'e1',name:'深蹲',tool:'槓鈴'},{id:'e2',name:'划船'},{id:'e3',name:'棒式'}], on:['e3','e1']}};
  let painted=0;
  AP(W,()=>{},()=>{painted++;},()=>({name:'',tool:'',reps:12,sets:3,weight:'',unit:'kg',note:''}))();
  /* 2026-09-16 使用者：「請按照我點的順序排序」—— 這一條整個翻面了。
     ⚠ 先勾 e3 再勾 e1，就要得到「棒式、深蹲」；照清單順序的話會是「深蹲、棒式」。
     ⚠ Q.on 一直都是用 push 記錄勾選先後，順序資訊本來就在；
       原本那一行用 Q.list.filter 等於把它洗回清單順序，白白丟掉。
     ⚠ 清單順序仍然決定「列出來的排法」，只是不再決定加入的先後。 */
  eq('★★★ 照點選的先後加入（不是清單順序）',
     W._wp.items.map(x=>x.name), ['棒式','深蹲']);
  eq('★★ 工具一起帶過去（深蹲被排到第二個，它才是有工具的那一個）', W._wp.items[1].tool, '槓鈴');
  eq('★★ 加完回到方案畫面、暫存清掉', [painted, W._wpQuick], [1, null]);
}
{
  const W={_wp:{items:[]}, _wpQuick:{list:[{id:'e1',name:'深蹲'}], on:['e1','zz']}};
  AP(W,()=>{},()=>{},()=>({}))();
  eq('★★ 勾選裡有清單上找不到的 id 就跳過（挑選期間清單被別處重整過）',
     W._wp.items.map(x=>x.name), ['深蹲']);
}
/* ⚠⚠ 沒勾的那一列**不可以**回填清單位置（i+1）——兩種號碼混在同一欄會撞號。
   實跑驗過：清單 [a,b,c,d]，倒著點 d→b→a 時畫面同時出現兩個「3」
   （啟動推的勾選序 3、伏地挺身的清單位置 3）；取消中間那個之後還會並排兩個「2」。
   這條反面斷言就是擋這個回頭路的。 */
ok('★★★ 勾選了才顯示「第幾個被點到」，沒勾的留空（回填清單位置會撞號）',
   /<span class="cxe-no\$\{Q\.on\.indexOf\(e\.id\)>=0\?' cxe-no-pick':''\}">\$\{Q\.on\.indexOf\(e\.id\)>=0\?Q\.on\.indexOf\(e\.id\)\+1:''\}<\/span>/.test(src)
   && /\.cxe-no-pick\{color:#fff;background:var\(--green\);/.test(src));
/* 留空但不拿掉 span：.cxe-no 的 min-width 撐住位置，勾選時文字才不會左右跳。 */
ok('★★ .cxe-no 有 min-width 撐位（留空時不會讓整列位移）',
   /\.cxe-no\{[^}]*min-width:16px;\}/.test(src));
ok('★★ 文案講明是照點選順序', /照你點選的順序加進方案。/.test(src));
/* 2026-09-16 使用者：「我每次選一個項目就會跳回頁面最上方」——
   wpQuickTgl 走的是整張 showModal 重畫，DOM 換掉之後捲動位置歸零。
   ⚠ 不能改成「只更新被點的那一列」：勾選序號是連動的，取消中間某一個，
     後面每一個號碼都要往前遞補，整份清單本來就得重畫。
   ⚠ 兩個容器都要接：清單自己會捲（.cxe-pick 有 max-height），
     視窗本體在手機上也會捲（.modal 是 max-height:90vh;overflow-y:auto）。 */
ok('★★★ 重畫前後把捲動位置接回去（清單與視窗本體都要）',
   /const keep=\['\.cxe-pick','\.modal'\]\.map\(sel=>\{/.test(src)
   && /keep\.forEach\(\(\[sel,top\]\)=>\{ const el=document\.querySelector\(sel\); if\(el\) el\.scrollTop=top; \}\);/.test(src));
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
