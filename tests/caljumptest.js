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
ok('★★ 日期標題仍然是入口（兩處：第一列與第二列的工具列）',
   (src.match(/onclick="openCalJump\(\)"/g)||[]).length===2);

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

console.log('\n⑤ 工具列三顆鈕搬到第二列');
ok('★★★ 第一列整列都給教練 chips（右邊不再放東西）',
   /<div class="cal-head-left" style="min-width:0;">\s*\n\s*\$\{opts\.coachFilter\?`<div class="cal-chip-row">\$\{calCoachChips\(coaches,filterCoach,chipN\.coach\)\}<\/div>`:''\}\s*\n\s*<\/div>\s*\n\s*\$\{opts\.coachFilter\?'':_calNavHtml\}/.test(src));
ok('★★★ 三顆鈕在第二列、日期導覽的左邊',
   /<div class="cal-head-right" style="display:flex;gap:8px;margin:0 8px 0 auto;flex:none;">[\s\S]{0,900}?＋ 新增預約<\/button>\s*\n\s*<\/div>\s*\n\s*<div class="cal-nav" style="margin:0;flex:none;">/.test(src));
ok('★★ 三顆鈕只有一份（不是複製到第二列、第一列忘了刪）',
   (src.match(/onclick="openGroupScheduleModal\(\)">團課課表<\/button>/g)||[]).length===1
   && (src.match(/id="cal-bookmode-btn"/g)||[]).length===1);
ok('★★ 為什麼要搬，寫在原地',
   /0903 篩選鈕加上堂數之後教練那排變寬，右邊被這三顆佔著就換行了/.test(src));
ok('★ 沒有 coachFilter 的呼叫端仍在第一列放日期導覽（教練端／唯讀檢視）',
   /\$\{opts\.coachFilter\?'':_calNavHtml\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
