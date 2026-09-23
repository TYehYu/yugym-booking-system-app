/* 會員端訓練紀錄：日期列表 → 唯讀的訓練內容頁（2026-09-23）

   使用者（昨天從客戶手機上看到的畫面）：
     「這邊可以改成[日期]點日期在看當天訓練內容
       然後訓練內容頁面可以改成跟教練紀錄訓練頁面一樣　但不能修改紀錄」

   改版前：把所有動作攤平成一長串（一堂八個動作就八行），捲不完、也找不到某一天。
   改版後：① 日期列表 ② 點一天 → 跟教練端**同一份排版**的動作卡，但不可編輯。

   ⚠ 這支要守的兩件事：
     ① 兩邊真的共用同一支（tlLogCardHtml），不是各寫一份會漂移的複製品
     ② 會員端那一份**真的不能改** —— 沒有 onclick、沒有 ✕、沒有「點一下可修改」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const CARD=(src.match(/function tlLogCardHtml\(l, editable\)\{[\s\S]*?\n\}/)||[''])[0];
const PAGE=(src.match(/PAGES\.mem_training=async function\(\)\{[\s\S]*?\n\};/)||[''])[0];
/* ⚠ 驗「沒有某段程式」時要用這一份（剝掉註解）——原地註解常常就寫著那個關鍵字，
   直接驗會命中自己的說明。這是第六次踩（見記憶 yugym-assert-hits-comment）。 */
const PAGE_CODE=PAGE.replace(/\/\*[\s\S]*?\*\//g,'');

console.log('① 動作卡抽成共用（教練端與會員端同一份排版）');
{
  ok('★★★ tlLogCardHtml 存在', !!CARD);
  ok('★★★ 教練端傳 editable=true', /tlLogCardHtml\(l, true\)/.test(src));
  ok('★★★ 會員端傳 false', /tlLogCardHtml\(l,false\)/.test(PAGE));
  ok('★★ 全檔只有這一支產動作卡（沒有第二份複製品）',
     (src.match(/<div class="tlh-log\$\{editable/g)||[]).length===1
     && (src.match(/<div class="tlh-log"/g)||[]).length===0);
  ok('　 為什麼共用，寫在原地', /訓練內容頁面可以改成跟教練紀錄訓練頁面一樣/.test(src));
}

console.log('② 會員端那一份真的不能改');
{
  ok('★★★ 不可編輯時不掛 onclick',
     /\$\{editable\?` onclick="tlEditLog\('\$\{l\.id\}'\)"`:''\}/.test(CARD));
  ok('★★★ 不可編輯時不畫 ✕',
     /\$\{editable\?`<button class="tl-del"[\s\S]*?`:''\}/.test(CARD));
  ok('★★★ 唯讀卡帶 .tlh-log-ro（游標與按壓回饋都要收掉）',
     /<div class="tlh-log\$\{editable\?'':' tlh-log-ro'\}"/.test(CARD)
     && /\.tlh-log-ro\{cursor:default;padding-right:15px;\}/.test(src)
     && /\.tlh-log-ro:active\{background:var\(--card\);\}/.test(src));
  ok('★★ 會員端沒有「點一下可修改」那句（那是教練端的提示）',
     !/點一下可修改/.test(PAGE_CODE));
  ok('★★ 會員端整段沒有 tlEditLog／delTrainingLog',
     !/tlEditLog|delTrainingLog/.test(PAGE_CODE));
  ok('　 「會員不能改教練記的東西」寫在原地', /會員端（會員不能改教練記的東西）/.test(src));
}

console.log('③ 日期列表');
{
  ok('★★★ 一列一堂、點了才看內容', /onclick="mtOpenDay\('\$\{x\.bid\}'\)"/.test(PAGE));
  ok('★★★ 依 booking_id 分組，不是依日期',
     /logs\.forEach\(l=>\{ if\(l&&l\.booking_id\) \(byBk\[l\.booking_id\]=byBk\[l\.booking_id\]\|\|\[\]\)\.push\(l\); \}\);/.test(PAGE));
  ok('★★ 為什麼不用日期分組，寫在原地（同一天可能上兩堂）',
     /同一天可能上兩堂（早上教練課、晚上自主）/.test(PAGE));
  ok('★★ 新的排在最前面', /\.sort\(\(a,b\)=>String\(b\.t\)\.localeCompare\(String\(a\.t\)\)\)/.test(PAGE));
  ok('★★ 副標給「做了什麼」的線索，但只列三個（主角是日期）',
     /names\.slice\(0,3\)\.join\('、'\)/.test(PAGE));
  ok('★ 日期有星期', /'日一二三四五六'\[y\.getDay\(\)\]/.test(PAGE));
}

console.log('③-2 每週紀錄（2026-09-23 使用者：「可以看他這週練了幾次練了些什麼」）');
{
  /* ⚠ 原本頂部是「訓練堂數／動作總數／不同動作」三格累計，已整組換成本週卡。 */
  ok('★★★ 頂部換成本週卡（累計三格退場）',
     /<div class="mtw">/.test(PAGE) && !/不同動作/.test(PAGE_CODE));
  ok('★★★ 週一起算（台灣習慣，「本週／上週」要跟客人口語對得起來）',
     /const dow=\(x\.getDay\(\)\+6\)%7;/.test(PAGE));
  ok('★★★ 用台北時間切週（created_at 是 UTC，直接切會把週一早上算到上一週）',
     /用台北時間切週/.test(PAGE));
  /* 2026-09-23 二修（使用者：「除了本週　其他週都改成日期　例如上週改成9/14~9/20」）——
     「上週」「9/07 那週」往回捲三四週就要自己數，反而不好認。 */
  ok('★★★ 只有本週講「本週」，其餘寫日期區間',
     /if\(w===_thisWk\) return '本週';/.test(PAGE)
     && /return `\$\{_md\(w\)\} ~ \$\{_md\(ymd\(e\)\)\}`;/.test(PAGE)
     && /e\.setDate\(e\.getDate\(\)\+6\);/.test(PAGE));
  ok('★★ 「上週」「那週」這種相對說法已退場', !/上週|那週/.test(PAGE_CODE));
  ok('★★ 不補前導零（9/14 比 09/14 好讀）',
     /const _md=ds=>\{ const x=parseYmd\(ds\); return x\?`\$\{x\.getMonth\(\)\+1\}\/\$\{x\.getDate\(\)\}`:ds; \};/.test(PAGE));
  ok('★★ 週標題有畫出來', /_wkLabel\(g\.w\)\}<i>\$\{g\.items\.length\} 次<\/i><\/div>/.test(PAGE));
  /* 2026-09-23 三修（使用者：「我想讓本週跟其他週在閱讀上有點區分」，兩版比過選 B）——
     亮的＝本週、淡的＝過去。只改標題顏色（A 案）被否決：往下捲看到的是卡片不是標題。 */
  ok('★★★ 本週標題用品牌綠、卡片維持白底；其餘週的卡片淡化',
     /const _now=g\.w===_thisWk;/.test(PAGE)
     && /<div class="mtl-wk\$\{_now\?' mtl-wk-now':''\}">/.test(PAGE)
     && /class="mtl-day\$\{_now\?'':' mtl-past'\}"/.test(PAGE));
  ok('★★★ 淡化用既有的 card2，沒有新增顏色',
     /\.mtl-past\{background:var\(--card2\);border-color:transparent;\}/.test(src)
     && /\.mtl-wk-now\{color:var\(--green\);\}/.test(src));
  ok('　 為什麼不是只改標題顏色，寫在原地', /看到的是一整片卡片，不是標題/.test(src));
  ok('★★ 次數靠右（用 margin-left:auto，不是 space-between）',
     /\.mtl-wk i\{[^}]*margin-left:auto;\}/.test(src)
     && !/\.mtl-wk\{[^}]*justify-content:space-between/.test(src));
  ok('★★★ 一週 0 次時不要只寫 0，改講「上次是哪一天」',
     /本週<b>\$\{_wkSess\.length\?`練了 \$\{_wkSess\.length\} 次`:'還沒練'\}<\/b>/.test(PAGE)
     && /上次訓練 \$\{_lastDate\.replace/.test(PAGE));
  ok('★★ 七格是「這一週」不是「最近七天」', /x\.setDate\(x\.getDate\(\)\+i\); const ds=ymd\(x\);/.test(PAGE));
  ok('★★ 今天那一格永遠看得出來（就算沒練）',
     /const on=_wkDays\.has\(ds\), today=ds===_today;/.test(PAGE)
     && /\.mtw-d\.now\{box-shadow:0 0 0 2px var\(--gold\) inset;\}/.test(src));
  /* ⚠ 不可以改用 body_part：正式庫 143 筆只有 4 筆填了部位（2.8%），等於沒有。 */
  ok('★★★ 「練了些什麼」用動作名稱，不是部位',
     !/body_part/.test(PAGE_CODE) && /_wkNames\.slice\(0,3\)\.join\('、'\)/.test(PAGE));
  ok('　 為什麼不用部位，寫在原地', /只有 4 筆填了部位（2\.8%）/.test(PAGE));
}

console.log('③-3 動作順序＝教練記錄的先後（2026-09-23 使用者：「要按照教練紀錄的順序」）');
{
  /* 改版前這一頁吃外層那份**降冪**的 logs，每堂裡面是倒著看的
     —— 教練最後記的排在最上面，跟教練端正好相反。 */
  ok('★★★ 一堂之內照 created_at 升冪（與教練端 renderTrainingLogSheet 同一個方向）',
     /const _ls=ls\.slice\(\)\.sort\(\(a,b\)=>String\(a\.created_at\|\|''\)\.localeCompare\(String\(b\.created_at\|\|''\)\)\);/.test(PAGE));
  ok('★★★ 教練端也是升冪（兩邊同方向，這條反過來就代表又不一致了）',
     /const logs=allLogs\.filter\(l=>l\.booking_id===b\.id && \(!_is1v2 \|\| _slotOf\(l\)===_slot\)\)\s*\n\s*\.sort\(\(a,b\)=>\(a\.created_at\|\|''\)\.localeCompare\(b\.created_at\|\|''\)\);/.test(src));
  ok('★★ 這一堂的時間取排序後的第一筆（取排序前的會拿到最後記的那筆，跨午夜會標錯天）',
     /return \{ bid, ls:_ls, t:\(_ls\[0\]&&_ls\[0\]\.created_at\)\|\|'' \}; \}\)/.test(PAGE));
  ok('　 為什麼會倒過來，寫在原地', /教練最後記的那個動作排在最上面/.test(PAGE));
  /* 實跑：把排序照抄出來驗一次，不是只驗字串 */
  const mk=(t,n)=>({created_at:t, exercise_name:n});
  const raw=[mk('2026-09-23T11:50:13','硬舉'),mk('2026-09-23T11:22:11','懸吊抬腿'),
             mk('2026-09-23T11:35:16','股四分腿蹲'),mk('2026-09-23T11:22:22','史密斯胸推')];
  const sorted=raw.slice().sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')))
    .map(x=>x.exercise_name);
  ok('★★★ 實跑：亂序進去 → 照記錄先後出來',
     JSON.stringify(sorted)===JSON.stringify(['懸吊抬腿','史密斯胸推','股四分腿蹲','硬舉']), sorted);
}

console.log('④ 返回與狀態（不開新 PAGES）');
{
  ok('★★★ 用 window._mtDay 記現在看哪一天',
     /function mtOpenDay\(bid\)\{ window\._mtDay=bid; navTo\('mem_training'\); \}/.test(src)
     && /function mtBackToList\(\)\{ window\._mtDay=null; navTo\('mem_training'\); \}/.test(src));
  ok('★★★ 內容頁有返回鈕', /class="mtl-back" onclick="mtBackToList\(\)"/.test(PAGE));
  ok('★★★ 那一堂被刪掉時退回列表，不是畫一片空白',
     /if\(window\._mtDay && !_day\) window\._mtDay=null;/.test(PAGE));
  ok('★★ 沒有紀錄時也把旗標清掉（不然會卡在不存在的那一天）',
     /if\(!logs\.length\)\{\s*\n\s*window\._mtDay=null;/.test(PAGE));
  ok('★★ 進內容頁要捲到最上面', /window\.scrollTo\(0,0\)/.test(PAGE));
}

console.log('⑤ 1V2 的防線沒有被改動弄丟');
{
  ok('★★★ 會員端仍濾掉 slot=2（那是另一位的紀錄，只是借掛在這位身上）',
     /filter\(l=>l&&l\.member_id===SESSION\.id && Number\(l\.slot\)!==2\)/.test(PAGE));
}

console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
