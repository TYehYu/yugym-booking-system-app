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
  /* 2026-09-16 這裡是「課表張數頁籤」，0921 收掉了（見 ③）。
     凍結區現在只剩會員資料＋（只有 1V2 才有的）學員頁籤。 */
  const iHead=S.indexOf('<div class="ms-head">'), iTabs=S.indexOf('<div class="tl-slots">'), iScroll=S.indexOf('<div class="tl-scroll">'), iToday=S.indexOf('<div class="tlh-label">今日訓練紀錄');   /* 找畫面標籤，不找字（函式開頭的註解也有這四個字） */
  ok('★★★ 順序：會員資料 → 學員頁籤 → 捲動區（今日訓練紀錄在捲動區裡）', iHead>0 && iHead<iTabs && iTabs<iScroll && iScroll<iToday, {iHead,iTabs,iScroll,iToday});
}
ok('★★★ 只有捲動區會捲（吃掉剩下的高度）', /\.tls-panel \.tl-scroll\{flex:1 1 auto;min-height:0;max-height:none;\}/.test(src));

console.log('\n③ 課表張數（sheet）退場（2026-09-21）＋ 動作名稱字級定案（2026-09-22）');
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
/* ══ 2026-09-21：課表張數（sheet）這一維整組退場 ══
   使用者當天先問「下面的 1 2 + 是不是可以移除了」，我判斷不該移除、還寫了一條
   「不可以被移除」的斷言擋著；同一天使用者看過實機後定案要移除，並指出
   真正的需求是「每次開課表詢問是否套用上次課表」——
   要兩張紙是因為「這堂要記的跟上次很像」，直接把上次搬過來才是對的解法。
   ⚠ 我那條擋住移除的斷言是**錯的判斷**，留這段當記錄：
     使用者問「這個可以拿掉嗎」的時候，通常是他已經想清楚了。

   ⚠⚠ 移除時最重要的一件事：**讀取端的 sheet 過濾一定要一起拿掉**。
     正式庫當時有 17 筆 sheet=2 的紀錄（4 堂課；陳世勳 9/16 那 5 筆只存在第 2 張）。
     只拆頁籤不拆過濾＝那些紀錄看不到也刪不掉。下面第一條就是守這件事。 */
const codeOnly2=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
ok('★★★⚠ 今日紀錄完全不看 sheet（留著過濾就會把舊的第 2 張藏起來）',
   /const logs=tlSeqSort\(allLogs\.filter\(l=>l\.booking_id===b\.id && \(!_is1v2 \|\| _slotOf\(l\)===_slot\)\)\);/.test(S)
   && !/_sheetOf/.test(codeOnly2));
ok('★★★ 頁籤與三支操作都不留死碼',
   !/tl-sheets/.test(codeOnly2) && !/tlSetSheet|tlAddSheet|tlDelSheet/.test(codeOnly2)
   && !/_tlSheet\b|_tlSheetMax|_tlSheetN/.test(codeOnly2));
ok('★★★ 三個寫入端都不再寫 sheet 欄位（資料庫欄位保留，只是不再寫）',
   !/sheet:\(Number\(window\._tlSheet\)/.test(src));
ok('★★ 為什麼移除、以及「過濾要一起拿掉」的理由寫在原地',
   /感覺第二列的 1 2 \+ 應該可以移除/.test(src)
   && /只拆頁籤不拆過濾的話，那些紀錄會變成看不到也刪不掉/.test(src));
ok('★★★ slot 的過濾**不可以**跟著拿掉（那是別人的紀錄，不是別張紙）',
   /slot 的過濾要留著 —— 那是「這筆不屬於這位學員」，與 sheet 完全不同一回事/.test(src)
   && /const memAllLogs=allLogs\.filter\(l=>l\.member_id===b\.member_id && _slotOf\(l\)!==2\);/.test(S));

/* ══ 〔已移除〕課表張數頁籤的「移除頁面」鈕（2026-09-16 做的）══
   0921 整個張數功能退場（見 ③），這一區連同 tlDelSheet／tlDelSheetDo
   與 .tl-sheets 那組樣式一起收掉。刪紀錄的路仍在：每一張動作卡右上角的 ✕。 */
/* 2026-09-23：動作卡抽成 tlLogCardHtml，刪除鈕跟著搬過去（整份 src 裡找得到就好）。 */
ok('★★ 刪單一動作的路還在（張數沒了，但要刪的東西還是刪得掉）',
   /onclick="event\.stopPropagation\(\);delTrainingLog\('\$\{l\.id\}'\)"/.test(src));

/* 2026-09-22：動作名稱字級比較過 19.5／24／27px，定案維持 19.5px。
   ⚠ 這一條是**擋放大**的：中文名（最長 7 字）到 28px 都放得下，光看中文會覺得該放大；
     但正式庫有 43 字的英文動作名，24px 就會從 2 行變 3 行、那張卡從 142px 變 187px。
     要動這個值，先量英文長名那一支。 */
ok('★★★ 動作名稱維持 19.5px（放大會讓英文長名多折一行）',
   /\.tlh-ex\{font-size:19\.5px;/.test(src)
   && /只量中文會得出錯的答案/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
