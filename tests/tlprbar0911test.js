/* 課表抽屜：置中、會員資料凍結、三大項兩列（2026-09-11 使用者附截圖）
   「視窗置中　視窗上方的會員資料凍結列　硬舉 深蹲 臥推 歷史紀錄放在會員資料跟訓練動作中間
     用兩列表示紀錄　第一列深蹲 第二列3x10x60」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const fn=name=>{ const i=src.indexOf('function '+name+'('); let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };
const S=fn('renderTrainingLogSheet');

console.log('① 視窗置中');
ok('★★★ 手機直式：左右留邊、上下置中、四角圓',
   /@media \(max-width:600px\),\(max-width:1024px\) and \(orientation:portrait\)\{\s*\n\s*#tl-sheet \.ms-panel\.tls-panel\{left:12px;right:12px;top:50%;bottom:auto;transform:translateY\(-50%\);/.test(src)
   && /border-radius:16px;max-height:calc\(100% - 24px\);padding-top:0;\}/.test(src));
ok('★★ 橫向平板／桌機那條 .ms-panel 置中規則沒動', /\.ms-panel\{left:50%;right:auto;bottom:auto;top:50%;transform:translate\(-50%,-50%\);width:440px;/.test(src));

console.log('\n② 會員資料凍結、三大項在會員資料與訓練動作中間');
{
  /* 2026-09-16：三大項那一列換成課表張數頁籤，位置不變（凍結區、會員資料下方）。 */
  const iHead=S.indexOf('<div class="ms-head">'), iTabs=S.indexOf('<div class="tl-sheets">'), iScroll=S.indexOf('<div class="tl-scroll">'), iToday=S.indexOf('<div class="tlh-label">今日訓練紀錄');   /* 找畫面標籤，不找字（函式開頭的註解也有這四個字） */
  ok('★★★ 順序：會員資料 → 課表頁籤 → 捲動區（今日訓練紀錄在捲動區裡）', iHead>0 && iHead<iTabs && iTabs<iScroll && iScroll<iToday, {iHead,iTabs,iScroll,iToday});
}
ok('★★★ 只有捲動區會捲（吃掉剩下的高度）', /\.tls-panel \.tl-scroll\{flex:1 1 auto;min-height:0;max-height:none;\}/.test(src));

console.log('\n③ 課表張數頁籤（2026-09-16 取代三大項那一列）');
/* 使用者：「上方 深蹲硬舉臥推移除改成分頁籤先設計1頁 旁邊是[+]點了可以多一頁」
   ＋「我要在課卡點課表以後 出現課表頁面 這個頁面可以好幾張 就像一堂課教練會拿兩份課表
      分別記錄不同的訓練 每次由教練決定要開一份還是兩份課表出來寫」
   ⚠ 三大項只拿掉**畫面**，底層函式全部保留（日後要在別處接回入口只要一行）。
     但要知道 tlPrByExercise 全系統只有那一個呼叫端，拿掉後 PR 在畫面上是完全看不到了。 */
ok('★★★ 三大項那一列已從抽屜移除',
   !/const overview=`<div class="tlh-prb"/.test(S) && !/\$\{overview\}/.test(S));
/* 2026-09-16 二修：使用者確認「三大項ＰＲ移除了」「一併清掉」——
   0916 稍早是「拿掉畫面、底層保留」，這一輪連計算與歷史視窗一起清。
   ⚠ 沒有動到 training_logs 的任何欄位：PR 本來就從既有紀錄推導，沒有自己的資料表，
     所以日後要做回來只是重寫推導，資料一筆都沒少。 */
/* ⚠⚠ 反面斷言（「某某已經不存在」）**一定要先剝掉註解再比對** ——
   移除一個功能時，我們會在原地留一段「〔已移除〕…」的說明，那段說明必然會寫出
   被移除的函式名與 class 名。直接掃整個檔案，就會命中自己寫的墓誌銘，永遠為 false。
   2026-09-16 當天第五次踩這個坑（見 tests 裡其他幾支的同款警告）。 */
const codeOnly=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
ok('★★★ 底層也清乾淨：七支 tlPr* 與 TL_PR_LIFTS、TL_LB2KG 都不留',
   !/TL_PR_LIFTS|TL_LB2KG/.test(codeOnly)
   && ['tlPrScore','tlPrBetter','tlPrVol','tlPrChain','tlPrByExercise','tlPrDate','tlOpenPrHistory']
        .every(f=>!new RegExp(f+'\\b').test(codeOnly))
   && !/window\._tlPr\b/.test(codeOnly));
ok('★★ 三組專屬 CSS 也收掉（.tlh-prb-*／.tlh-pr-*／.prh-*）',
   !/\.tlh-prb/.test(codeOnly) && !/\.tlh-pr-/.test(codeOnly)
   && !/\.prh-lift|\.prh-row|\.prh-vol|\.prh-body/.test(codeOnly));
ok('★★★ 頁籤列：每張一顆數字鈕，末端一顆 [+]',
   /<div class="tl-sheets"><span class="tl-sheets-lb">課表<\/span>\$\{Array\.from\(\{length:_sheetN\}/.test(S)
   && /onclick="tlSetSheet\(\$\{n\}\)"/.test(S)
   && /onclick="tlAddSheet\(\)" title="再開一張課表"/.test(S));
/* 2026-09-21 使用者：「上面的 1 2 資訊是不是重複了啊」——
   上排（哪一位學員）與這排（第幾張紙）原本都是一模一樣的數字鈕，看起來像重複顯示。
   上排改標「會員 A／會員 B」、這排前面補一個「課表」小標，兩排就分得開了。
   ⚠ 使用者同時問「那這樣下面的 1 2 + 是不是可以移除了」—— **不能移除**：
     這排是 0916 指定的「一堂課兩份課表」，與 1V2 正交；
     1V1 沒有學員頁籤，但照樣要能開兩張課表。這一條就是擋住它被順手拿掉。 */
ok('★★★ 兩排頁籤要分得開（同一種長相＝看起來重複）',
   /<span class="tl-sheets-lb">課表<\/span>/.test(S)
   && /\.tl-sheets-lb\{font-size:11\.5px;/.test(src)
   && /會員 \$\{s===1\?'A':'B'\}/.test(src));
ok('★★★ 課表頁籤不可以被移除（與 1V2 是正交的兩件事）',
   /<div class="tl-sheets">/.test(S)
   && /onclick="tlAddSheet\(\)"/.test(S)
   && /跟 1V2 是正交的兩個維度/.test(src));
/* ⚠⚠ sheet 與 slot 是兩個正交的維度，混用會出事：
   slot=2 的意思是「這筆不屬於這位會員」（全站八處必須濾掉，漏一處別人的 PR 就算到我頭上）；
   sheet>=2 只是「記在第幾張紙上」，**每一張都屬於這位會員，任何讀取端都不可以濾掉**。 */
ok('★★★ 跨課的歷史與 PR 來源只濾 slot、不濾 sheet',
   /const memAllLogs=allLogs\.filter\(l=>l\.member_id===b\.member_id && _slotOf\(l\)!==2\);/.test(S)
   && !/memAllLogs[\s\S]{0,80}?_sheetOf/.test(S));
{
  /* 張數推導：不存資料庫，由「這堂課現有紀錄的最大 sheet」與「本次按 [+] 的暫存」取大值。
     這裡照抄 renderTrainingLogSheet 裡的三行公式，改了那邊要一起重算。 */
  const sheetOf = l => Math.max(1, Number(l&&l.sheet)||1);
  const calc = (logs, memo) => Math.max(logs.reduce((m,l)=>Math.max(m,sheetOf(l)),1), Number(memo)||1);
  eq('★★★ 舊資料 sheet=null 一律當第一張（不必回填四千多筆）', sheetOf({sheet:null}), 1);
  eq('★★★ 沒有紀錄、沒按過 [+] → 一張', calc([], 1), 1);
  eq('★★★ 紀錄裡已經寫到第 3 張 → 三張（即使暫存只有 1，也不會把第 3 張藏起來）',
     calc([{sheet:null},{sheet:2},{sheet:3}], 1), 3);
  eq('★★ 按了 [+] 開到第 2 張但還沒記動作 → 仍顯示兩張（空白張靠暫存撐著）',
     calc([{sheet:null}], 2), 2);
  eq('　 關掉再開（暫存歸零），只剩有紀錄的那幾張 —— 完全空白的那張本來就沒東西要留',
     calc([{sheet:null}], 1), 1);
}
ok('★★ 開抽屜時回到第 1 張、暫存歸零（連開好幾堂課不會把動作記到上一堂的第二張）',
   /window\._tlSheet=1; window\._tlSheetMax=1;/.test(src));
ok('★★★ [+] 的基準是 _tlSheetN（render 算出的實際張數），不是暫存的 _tlSheetMax',
   /const n=\(Number\(window\._tlSheetN\)\|\|1\)\+1;/.test(src) && /if\(n>6\)\{ showToast\('最多六張課表'\); return; \}/.test(src));
ok('★★ 三個寫入端都帶 sheet（新增動作／套歷史課表／套方案）',
   (src.match(/sheet:\(Number\(window\._tlSheet\)>1\)\?Number\(window\._tlSheet\):null/g)||[]).length===3);

console.log('\n④ 歷史課表的順序（2026-09-16）');
/* 使用者：「我按了下方歷史課表的套用　順序沒有跟之前課表一樣」——
   ⚠⚠ allLogs 來自 dbGetAll，**回傳順序是未定義的**：整表重抓的一批照資料庫給的順序，
     靠 change_log 增量補回來的列接在後面，所以同一堂課的動作會散成沒有規律的順序。
     今日紀錄那一區本來就有排序，只有歷史這一區漏了，於是預覽亂、套用也跟著亂
     （套用是照陣列順序逐筆寫入，新的 created_at 依序遞增）。
   ⚠ 排序要做在**分組之前**：byBk 各組自然升冪，預覽／_tlHistCache／套用三處一次到位。 */
ok('★★★ 分組前先照 created_at 升冪排（不能吃 dbGetAll 的未定義順序）',
   /\.sort\(\(a,b2\)=>String\(a\.created_at\|\|''\)\.localeCompare\(String\(b2\.created_at\|\|''\)\)\);/.test(S));
ok('★★★ 套用吃的就是排序後的那一份（_tlHistCache 直接存 h.ls，套用端照陣列順序寫入）',
   /window\._tlHistCache=Object\.fromEntries\(hist\.map\(h=>\[h\.bid,h\.ls\]\)\);/.test(S)
   && /for\(const s of srcLogs\)\{/.test(src));
ok('★★ 回呼參數避開 b（外層的 b 是這堂 booking，用 b 當參數名會遮蔽掉它）',
   !/\.sort\(\(a,b\)=>b\.t\.localeCompare/.test(S));
{
  /* 照抄修好之後的組裝邏輯，餵入「亂序」的來源，驗證三處都回到時間順序。 */
  const raw=[
    {booking_id:'BK1',created_at:'2026-09-16T03:21:45Z',exercise_name:'伏地挺身'},
    {booking_id:'BK1',created_at:'2026-09-16T03:44:47Z',exercise_name:'股四分腿蹲'},
    {booking_id:'BK1',created_at:'2026-09-16T03:08:24Z',exercise_name:'啟動·推'},
    {booking_id:'BK1',created_at:'2026-09-16T03:16:01Z',exercise_name:'懸吊抬腿'},
    {booking_id:'BK0',created_at:'2026-09-01T02:00:00Z',exercise_name:'舊課'},
  ];
  const sorted=raw.slice().sort((a,b2)=>String(a.created_at||'').localeCompare(String(b2.created_at||'')));
  const byBk={}; sorted.forEach(l=>{ (byBk[l.booking_id]=byBk[l.booking_id]||[]).push(l); });
  const hist=Object.entries(byBk).map(([bid,ls])=>({bid,ls,t:ls[0].created_at||''}))
    .sort((a,b2)=>String(b2.t).localeCompare(String(a.t))).slice(0,3);
  eq('★★★ 預覽那行字回到真正的上課順序',
     [...new Set(hist[0].ls.map(l=>l.exercise_name))],
     ['啟動·推','懸吊抬腿','伏地挺身','股四分腿蹲']);
  eq('★★★ 套用逐筆寫入的順序＝同一份，所以今日紀錄也對',
     hist[0].ls.map(l=>l.exercise_name),
     ['啟動·推','懸吊抬腿','伏地挺身','股四分腿蹲']);
  eq('★★ 該堂課的時間取最早那筆（不是碰巧排第一的那筆）', hist[0].t, '2026-09-16T03:08:24Z');
  eq('★★ 最近三次照時間新到舊', hist.map(h=>h.bid), ['BK1','BK0']);
}
/* 2026-09-16 使用者：「我剛剛測試按新增第二分頁 但沒有刪除按鈕」——
   ⚠ 只能刪最後一張：允許刪中間那張的話，後面的編號要整批往前遞補（第 3 張變第 2 張），
     得批次改寫資料庫、還可能留下編號空洞。「刪掉現在看的最後一張」不必重編號。
   ⚠ 那張上面已經記的動作會一起刪，所以一定要先問、而且要講出幾筆；
     完全空白的那張不必問，直接收掉暫存張數就好。 */
/* 2026-09-16 二修（使用者：「刪除的按鈕在標籤旁邊　幫我改到這一列最右邊　名稱改成移除頁面」）——
   原本夾在數字鈕與 [+] 中間，緊鄰要按的東西容易誤觸；改推到整列最右並改名。
   ⚠ 位置換了之後 ${...} 與條件之間多了換行，原本要求兩者相連的正則會失效 ——
     這裡改成分開比對「條件」與「按鈕本體」，不再綁死它們的排版。 */
ok('★★★ 移除鈕只在「總數>1 且正看著最後一張」時出現',
   /\(_sheetN>1 && _sheet===_sheetN\)\?`<button type="button" class="tl-sheet tl-sheet-del" onclick="tlDelSheet\(\)"/.test(S)
   && /if\(total<=1 \|\| cur!==total\) return;/.test(src));
ok('★★ 移除鈕在整列最右、文字是「移除頁面」（不再是夾在中間的 ✕）',
   /title="移除目前這一頁課表">移除頁面<\/button>/.test(S)
   && /\.tl-sheets \.tl-sheet-del\{color:var\(--danger\);margin-left:auto;/.test(src)
   && S.indexOf('tl-sheet-add') < S.indexOf('tl-sheet-del'));
ok('★★★ 有紀錄先問並講出幾筆；空白那張直接收掉',
   /這張上面已經記了 <b>\$\{rows\.length\}<\/b> 個動作，會一起刪掉。/.test(src)
   && /if\(!rows\.length\)\{ done\(\); return; \}/.test(src));
ok('★★ 1V2 要在同一位學員之內算（切到第 2 位時刪的是他自己那張）',
   /&& \(!_is1v2 \|\| \(Number\(l\.slot\)===2\?2:1\)===_slot\)\);/.test(src));
/* 2026-09-16 二修：移除鈕從夾在中間的 ✕ 改成推到最右的「移除頁面」，
   所以不再釘 min-width（四個字靠 padding 撐）。這一條守的本意沒變：三顆鈕要分得開。 */
ok('　　三顆鈕在視覺上分得開（選中綠底／＋ 綠字虛線／移除頁面 紅字靠右）',
   /\.tl-sheets \.tl-sheet-del\{color:var\(--danger\);margin-left:auto;/.test(src)
   && /\.tl-sheets \.tl-sheet-add\{color:var\(--green\);border-style:dashed;/.test(src)
   && /\.tl-sheets \.tl-sheet\.on\{background:var\(--green\);/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
