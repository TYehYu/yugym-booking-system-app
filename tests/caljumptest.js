/* 「跳至日期」直接開自家月曆（2026-09-03 使用者附截圖：「可以改成我們月曆的模式」）
   ＋ 工具列三顆鈕搬到第二列（使用者：「教練篩選列換行了　把右邊的預約模式按鈕
     改到下一列［今天］的左邊」）

   ⚠ 兩件事其實同源：0903 篩選鈕加上堂數之後，第一列被三顆鈕擠到換行；
     而「跳至日期」本來就是多包了一層小視窗。都是「中間多了一層」的問題。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const F=src.slice(src.indexOf('function openCalJump()'), src.indexOf('// 頂部時鐘'));

console.log('① 點日期標題＝直接開月曆，中間那層小視窗拿掉');
ok('★★★ 不再開一層 showModal（原本要開視窗→點欄位→再疊一層月曆→確定→前往）',
   !/showModal\(/.test(F) && /ashDateOpen\('cal-jump-date'\);/.test(F));
ok('★★★ 也不再用 ashDateField（那是「表單裡的一格」，這裡沒有表單）',
   !/ashDateField\(/.test(F));
/* 日期導覽只剩一份（_calNavHtml），所以入口也只剩一處 —— 定義處 1 次、使用處 1 次。 */
ok('★★ 日期標題仍然是入口，而且整份只有一份導覽',
   (src.match(/onclick="openCalJump\(\)"/g)||[]).length===1
   && (src.match(/_calNavHtml/g)||[]).length===2);

console.log('\n② 隱藏 input 只建一次、事件只綁一次');
/* 綁兩次的話，選一天會觸發兩次 doCalJump —— 第二次跑時 navTo 已經重畫過，
   症狀是「跳過去又跳一次」，很難查。 */
ok('★★★ 先找再建（不是每次開都 createElement）',
   /let inp=document\.getElementById\('cal-jump-date'\);\s*\n\s*if\(!inp\)\{/.test(F));
ok('★★★ addEventListener 在 if(!inp) 裡面（只綁一次）',
   /if\(!inp\)\{[\s\S]{0,320}?inp\.addEventListener\('change', doCalJump\);[\s\S]{0,120}?\}/.test(F));
ok('★★ 每次開只更新 value', /\}\s*\n\s*inp\.value=ymd\(calWeekStart\|\|TODAY\);/.test(F));
ok('★★ 掛在 body 上（navTo 只換 #content，它才活得下來）',
   /document\.body\.appendChild\(inp\);/.test(F)
   && /navTo 只換掉 #content，它會活著/.test(src));

console.log('\n③ 關窗要關對那一層');
/* 月曆是自己開的 #adp-sheet，不是 .modal-bg —— ashDateClose 的註解寫過為什麼。
   呼 closeModal 會關到別人（或什麼都沒關，然後月曆留在畫面上）。 */
/* ⚠ 只看 doCalJump 這一支 —— 別處（例如抽獎補登）本來就開在 .modal-bg 上，
   那裡呼 closeModal 是對的，不要把整份檔案一起禁掉。 */
{
  /* 只看程式、不看註解 —— 註解裡刻意寫著「原本是 closeModal()」當紀錄。 */
  const D=src.slice(src.indexOf('function doCalJump()'), src.indexOf('// 頂部時鐘'))
             .replace(/\/\*[\s\S]*?\*\//g,'');
  ok('★★★ doCalJump 整支都不呼 closeModal（含找不到值就返回那條早退路徑）',
     /ashDateClose\(\); navTo\(CUR_PAGE\);/.test(D)
     && /if\(!v\)\{ ashDateClose\(\); return; \}/.test(D)
     && !/closeModal\(/.test(D));
}
ok('★★ 為什麼不能用 closeModal，寫在原地',
   /這裡不能用 closeModal\(\)：月曆是自己那一層 #adp-sheet，不是 \.modal-bg/.test(src));

console.log('\n④ 月曆標題看得出自己在做什麼');
ok('★★ 標題可由呼叫端指定，預設維持「選擇日期」',
   /<div class="modal-title">\$\{c\.title\|\|'選擇日期'\}<\/div>/.test(src)
   && /title:String\(inp\.getAttribute\('data-title'\)\|\|''\)/.test(src));
ok('★★ 跳日期時寫「跳至日期」', /inp\.setAttribute\('data-title','跳至日期'\);/.test(F));

console.log('\n⑤ 工具列排成穩定的兩列');
/* 沿革（同一天兩輪）：
   ① 篩選鈕加上堂數 → 教練那排變寬 → 被右邊三顆鈕擠到換行
      使用者：「把右邊的預約模式按鈕改到下一列［今天］的左邊」
   ② 照做之後第二列變成 課程 chips＋三顆鈕＋日期導覽 → 使用者：「然後多出一列」
   實測（Ink 主題、真實 CSS）：課程 866＋三顆鈕 301＋導覽 277＋間距 ＝ 1453px，
   1440／1512 的 MacBook 內容區只有 1400／1472，flex-wrap 就把導覽甩成第三列。
   定案：三顆鈕留在第二列（使用者要的），**日期導覽改回第一列右邊** ——
   列1 1390、列2 1162，1440 以上都是穩穩兩列。 */
ok('★★★ 列1＝教練 chips ＋ 日期導覽',
   /<div class="cal-head-left" style="min-width:0;">\s*\n\s*\$\{opts\.coachFilter\?`<div class="cal-chip-row">\$\{calCoachChips\(coaches,filterCoach,chipN\.coach\)\}<\/div>`:''\}\s*\n\s*<\/div>/.test(src)
   && /\$\{_calNavHtml\}\s*\n\s*<\/div>/.test(src));
ok('★★★ 列2＝課程 chips ＋ 三顆鈕，沒有日期導覽',
   /<div class="cal-chip-row">\$\{calCourseChips\(chipN\.course\)\}<\/div>[\s\S]{0,1400}?＋ 新增預約<\/button>\s*\n\s*<\/div>\s*\n\s*<\/div>`:''\}/.test(src)
   && !/cal-bar2[\s\S]{0,1600}?class="cal-nav"/.test(src));
ok('★★ 三顆鈕只有一份（不是複製過去、原地忘了刪）',
   (src.match(/onclick="openGroupScheduleModal\(\)">團課課表<\/button>/g)||[]).length===1
   && (src.match(/id="cal-bookmode-btn"/g)||[]).length===1);
ok('★★★ 量出來的數字寫在原地（下次再往工具列加東西，先看這筆帳）',
   /課程 chips＋三顆鈕＋日期導覽，總寬 1453px/.test(src)
   && /列1 1390、列2 1162/.test(src));

console.log('\n⑥ 省下寬度的三個來源，一個都不能被改回去');
ok('★★★ 同一年不寫年份（222px → ~95px，工具列最寬的一塊）',
   /const _sameY=\(calWeekStart\.getFullYear\(\)===_tY && _weekEnd\.getFullYear\(\)===_tY\);/.test(src)
   && /\? `\$\{_md\(calWeekStart\)\} ～ \$\{_md\(_weekEnd\)\}`/.test(src));
ok('★★ 跨年與看往年時仍寫完整年份（那時候年份才是關鍵資訊）',
   /跨年（12 月底那一週）與看往年時仍然寫完整年份/.test(src)
   && /\$\{calWeekStart\.getFullYear\(\)\}\/\$\{_p2\(calWeekStart\.getMonth\(\)\+1\)\}/.test(src));
ok('★★★ cal-title 的 min-width 從 160 收到 112（否則縮短文字省不到寬度）',
   /\.cal-title\{[\s\S]{0,120}?min-width:112px;/.test(src));
ok('★★ 防抖改靠 tabular-nums，不是靠 min-width 撐著',
   /\.cal-title\{[\s\S]{0,200}?font-variant-numeric:tabular-nums;/.test(src)
   && /tabular-nums 才是防抖的正解/.test(src));
ok('★ 數字徽章壓縮（11 顆教練 chip 加起來省 ~30px）',
   /\.cal-chip \.cchip-n\{[\s\S]{0,160}?font-size:\.8em;opacity:\.62;margin-left:3px;/.test(src));

console.log('\n⑦ 更窄的視窗要折 chips，不要甩掉控制項');
/* 1366 這種舊機還是放不下（列1 差 64px）。那時候要折的是 chips ——
   chips 折行看得懂，一顆孤零零的日期導覽掉到下面則像壞掉。 */
ok('★★★ 可壓縮的額度全給 chips，右側控制項不縮不折',
   /\.cal-bar2 \.cal-chip-row\{flex:1 1 auto;min-width:0;\}/.test(src)
   && /\.cal-head-left\{flex:1 1 auto;min-width:0;\}/.test(src)
   && /\.cal-head>\.cal-nav\{flex:0 0 auto;\}/.test(src));
ok('★★ 為什麼寧可折 chips，寫在原地',
   /chips 折行是看得懂的，\s*\n?\s*一顆孤零零的日期導覽掉到下面則像壞掉/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
