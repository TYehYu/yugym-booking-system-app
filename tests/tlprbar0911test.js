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
ok('★★★ 底層保留：TL_PR_LIFTS／tlPrByExercise／tlOpenPrHistory 都還在',
   /const TL_PR_LIFTS=\['深蹲','硬舉','臥推'\];/.test(src)
   && /function tlPrByExercise\(memLogs\)\{/.test(src)
   && /function tlOpenPrHistory\(\)\{/.test(src));
ok('★★★ 頁籤列：每張一顆數字鈕，末端一顆 [+]',
   /<div class="tl-sheets">\$\{Array\.from\(\{length:_sheetN\}/.test(S)
   && /onclick="tlSetSheet\(\$\{n\}\)"/.test(S)
   && /onclick="tlAddSheet\(\)" title="再開一張課表"/.test(S));
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

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
