/* 會員申辦待審要在每一頁都看得到
   （2026-09-03 使用者：「剛剛有一個會員審核的通知　這個審核確認要在櫃檯桌機
     每個頁面都看到　不要只限制在首頁」）

   原本那顆滑出鈕長在 PAGES.g_dashboard 的回傳字串裡 —— 換一頁就跟著整片
   innerHTML 被換掉。改成頂欄那一格，由 navTo 每次換頁順手更新。

   ⚠ 同一件待辦**只留一個地方**：首頁那顆滑出鈕整個退場。兩個都留的話，
     處理完一個另一個還亮著，會讓人以為沒處理成功。
   ⚠ 與「待審核發放」分成兩顆是刻意的：一個是錢（票券要不要放行），
     一個是身分（這個人是不是他說的那個人），處理的人與視窗都不同。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 位置：頂欄，不是某一頁的內容');
ok('★★★ 頂欄有這一格', /<span id="tb-memreq-pill" style="display:none;"><\/span>/.test(src));
ok('★★★ 每次換頁都更新（與待審核發放同一條路徑）',
   /try\{ if\(typeof refreshGrantReviewPill==='function'\) refreshGrantReviewPill\(\); \}catch\(_\)\{\}\s*\n\s*try\{ if\(typeof refreshMemReqPill==='function'\) refreshMemReqPill\(\); \}catch\(_\)\{\}/.test(src));
ok('★★ 更新失敗不能影響換頁（包在 try 裡、不 await）',
   /try\{ if\(typeof refreshMemReqPill==='function'\) refreshMemReqPill\(\); \}catch\(_\)\{\}/.test(src));

console.log('\n② 首頁那顆滑出鈕整個退場（同一件事不要兩個入口）');
ok('★★★ 不再產生 .mc-req-fab',
   !/<button class="mc-req-fab"/.test(src) && !/const reqFab=/.test(src));
ok('★★★ 抽獎鈕不再需要「兩顆都在時往下疊」',
   /<button class="mc-lotto-fab" onclick="openLottoModal\(\)">/.test(src)
   && !/mc-lotto-fab\$\{reqFab\?' mc-fab-up':''\}/.test(src));
ok('★★ 為什麼不留兩個，寫在原地',
   /同一件待辦在同一個畫面上出現兩次，\s*\n?\s*處理完一個另一個還亮著，反而讓人以為沒處理成功/.test(src));
/* .mc-req-fab 的 CSS 與 mc-mode 的搬移選擇器留著（與抽獎鈕共用一批規則），
   所以要在原地寫清楚「那顆鈕已經沒有人產生了」，免得下一個人照著 CSS 找功能。 */
ok('★★ 留著的死 CSS 有標註',
   /留下來的 \.mc-req-fab CSS 與 mc-mode 的搬移選擇器現在都撈不到東西/.test(src)
   && /不要\*\*因為看到那些 CSS 就以為這顆鈕還在/.test(src));
ok('★★★ memberReqs 沒被順手刪掉（dashDataSig 靠它判斷首頁要不要重畫）',
   /const reqPend=j\(\(memberReqs\|\|\[\]\)\.filter\(r=>r\.status==='pending'\)\.map\(r=>r\.id\)\);/.test(src)
   && /memberReqs 仍然要留：dashDataSig 靠它判斷「有新申請 → 首頁要重畫」/.test(src));

console.log('\n③ 只給櫃檯以上看，而且會清乾淨');
/* ⚠ 原本兩支都是「不是櫃檯就直接 return」——那一格如果已經畫過（不重新整理就換帳號），
   教練會看到留在頂欄的待審核提示。清空成本是零，漏掉的代價是權限外洩。 */
ok('★★★ 會員申辦：非櫃檯清空，不是只 return',
   /async function refreshMemReqPill\(\)\{[\s\S]{0,300}?if\(!isDeskLike\(\)\)\{ host\.innerHTML=''; host\.style\.display='none'; return; \}/.test(src));
ok('★★★ 待審核發放：同一個問題一起修',
   /async function refreshGrantReviewPill\(\)\{[\s\S]{0,400}?if\(!isDeskLike\(\)\)\{ host\.innerHTML=''; host\.style\.display='none'; return; \}/.test(src));
ok('★★ 為什麼不能只 return，寫在原地',
   /清空的成本是零，漏掉的代價是權限外洩/.test(src));
ok('★★ 沒有待審時整顆收起來（不佔位置）',
   /if\(!list\.length\)\{ host\.innerHTML=''; host\.style\.display='none'; return; \}/.test(src));

console.log('\n④ 內容與行為');
ok('★★★ 點下去開的是原本那個審核視窗（沒有另做一套）',
   /onclick="openMemberReqModal\(\)"/.test(src)
   && (src.match(/async function openMemberReqModal\(\)/g)||[]).length===1);
ok('★★ 顯示待審筆數', /會員申辦待確認 <b>\$\{list\.length\}<\/b>/.test(src));
ok('★★ 只算 pending，並依送出時間排序（先來的先處理）',
   /\.filter\(r=>r && r\.status==='pending'\)\s*\n\s*\.sort\(\(a,b\)=>String\(a\.created_at\|\|''\)\.localeCompare\(String\(b\.created_at\|\|''\)\)\)/.test(src));
ok('★★ 讀快取，不額外打網路（member_link_requests 本來就在預載清單裡）',
   /\{t:'member_link_requests',soft:1\}/.test(src)
   && /讀的是 dbGetAll 快取（member_link_requests 本來就在預載清單裡），沒有額外網路成本/.test(src));
ok('★ 沿用待審核發放那一套外觀（多一個 tb-memreq 供日後微調）',
   /class="tb-review tb-memreq"/.test(src));
ok('★★ 為什麼不跟「待審核發放」合成一顆，寫在原地',
   /「待審核發放」＝票券要不要放行（錢的事）；「會員申辦」＝這個人是不是他說的那個人/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
