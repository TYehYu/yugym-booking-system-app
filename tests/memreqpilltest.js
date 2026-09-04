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
   /async function refreshMemReqPill\(\)\{[\s\S]{0,300}?if\(!isDeskLike\(\)\)\{ host\.innerHTML=''; host\.style\.display='none'; alertDockSync\(\); return; \}/.test(src));
ok('★★★ 待審核發放：同一個問題一起修',
   /async function refreshGrantReviewPill\(\)\{[\s\S]{0,400}?if\(!isDeskLike\(\)\)\{ host\.innerHTML=''; host\.style\.display='none'; alertDockSync\(\); return; \}/.test(src));
ok('★★ 為什麼不能只 return，寫在原地',
   /清空的成本是零，漏掉的代價是權限外洩/.test(src));
ok('★★ 沒有待審時整顆收起來（不佔位置）',
   /if\(!list\.length\)\{ host\.innerHTML=''; host\.style\.display='none'; alertDockSync\(\); return; \}/.test(src));

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

console.log('\n⑤ 提示會自己跳出來（2026-09-04）');
/* 使用者回報：「剛剛蘇映倢 確認審核的視窗不見了」——
   查資料庫那筆 member_link_requests 一直是 pending，trg_change_log 與 fn_table_sigs
   也都正常。問題不在資料，在**更新時機**：這兩顆提示原本只在 navTo（換頁）時重算，
   櫃檯坐在「預約管理」不動時，會員送出申辦，提示永遠不會自己跳出來。
   ⚠ 這是 0903「這個審核確認要在櫃檯桌機每個頁面都看到」只做了一半：
     放到每一頁了，但不會自己更新 —— 人不換頁就等於沒做。 */
ok('★★★ 有背景輪詢，而且只會建一個計時器',
   /function startReviewPillPoll\(\)\{\s*\n\s*if\(window\._pillPollTimer\) return;\s*\n\s*window\._pillPollTimer=setInterval\(async\(\)=>\{/.test(src));
ok('★★★ navTo 會把它啟動起來', /try\{ if\(typeof startReviewPillPoll==='function'\) startReviewPillPoll\(\); \}catch\(_\)\{\}/.test(src));
ok('★★★ 分頁在背景不打、非櫃檯不打',
   /if\(document\.hidden\) return;\s*\n\s*if\(typeof isDeskLike!=='function' \|\| !isDeskLike\(\)\) return;/.test(src));
ok('★★★ 回前景立刻補一次（背景時輪詢是停的）',
   /回到前景立刻補一次 —— 分頁在背景時輪詢是停的，切回來不補的話還要再等 20 秒/.test(src));
/* 既有的兩支輪詢都吃 remoteSigChanged()，而那支是一次性的（比對完就記下新簽章），
   多一個呼叫端會互相吃掉對方的變更 —— 21676 行那段註解講的就是這個坑。 */
ok('★★★ 沒有掛進既有的 _dashPollTimer／_calPollTimer（會吃掉彼此的簽章）',
   /它們各自只在自己那一頁跑，而且都吃 remoteSigChanged\(\) —— 那支是\*\*一次性\*\*的/.test(src)
   && !/_pillPollTimer[\s\S]{0,200}?remoteSigChanged/.test(src));
ok('★★ 成本：只清時間戳，沒變動就不傳資料（理由寫在原地）',
   /dbCacheClear 只把時間戳歸零（資料與簽章都留著），/.test(src));
/* 離線實跑（2026-09-04）：重複呼叫只建一個 20 秒計時器、掛一個 visibilitychange；
   櫃檯那一輪會清兩張表的快取並更新兩顆提示；非櫃檯與背景分頁都不打。 */
ok('★★ 實跑四種情況的結果記在這支測試裡',
   /重複呼叫只建一個 20 秒計時器、掛一個 visibilitychange/.test(fs.readFileSync(__filename,'utf8')));

console.log('\n⑥ 讀不到的時候要出聲，不能靜靜當作「沒有待審核」（2026-09-04）');
/* 這兩支原本把錯誤整個吞掉（catch(_){} ＋ .catch(()=>[])）——
   壞掉的時候畫面跟「目前沒有待審核」長得一模一樣，櫃檯只會覺得「怎麼沒跳出來」。
   與今天早上 fn_change_sig 那次同一種病（前端吞掉錯誤，背景更新靜靜停擺）。 */
ok('★★★ 讀失敗會 console.warn，而且與「真的沒有」分得開',
   /return null;   \/\/ null＝讀失敗，與「真的沒有待審核」的 \[\] 區分開/.test(src)
   && /\[會員申辦待確認\] 讀取失敗，頂欄那顆提示會一直不出現：/.test(src));
ok('★★★ 同一種錯只印一次（每 20 秒一輪，不能洗版）',
   /if\(_memReqWarned!==k\)\{ _memReqWarned=k;/.test(src)
   && /免得每 20 秒洗版/.test(src));
ok('★★ 吞掉是對的，但要出聲（理由寫在原地）',
   /吞掉是對的（不能讓一顆提示炸掉整個換頁），但\*\*要出聲\*\*/.test(src));
/* 離線實跑（2026-09-04）：正常回兩筆並依 created_at 排序、真的沒有時不出聲、
   讀失敗回空陣列且同一種錯只印一次。 */
ok('★★ 實跑結果記在這支測試裡',
   /正常回兩筆並依 created_at 排序、真的沒有時不出聲、/.test(fs.readFileSync(__filename,'utf8')));

console.log('\n⑦ 提示搬出 .tb-left（2026-09-04：mc-mode 把它整個藏起來）');
/* 使用者連續回報「1901 沒看到申辦待確認」「沒看到你說的那個按鈕」，
   而資料庫裡兩張表都確實有 pending、RLS 也正常。
   根因是**位置**：兩顆原本掛在 .topbar 的 .tb-left 裡，而
     body.mc-mode .tb-left{display:none}
   mc-mode 正是桌機櫃檯／管理員的版面 —— 等於對它們唯一的觀眾永遠是隱藏的。
   ⚠ 父層 display:none 之下子元素怎麼設 display 都救不回來，必須把節點搬出那棵子樹。
   ⚠ 位置抄 .mc-lotto-fab（抽獎那顆）：position:fixed 掛在視窗上，不依賴任何版面容器
     —— 那顆在使用者畫面上一直看得到，是現成的證據。 */
ok('★★★ host 已經不在 .tb-left 裡',
   /<div id="alert-dock" class="alert-dock">[\s\S]{0,1200}?id="tb-memreq-pill"[\s\S]{0,1200}?<\/div>/.test(src)
   && !/<div class="tb-left">[\s\S]{0,900}?id="tb-memreq-pill"/.test(src));
/* 2026-09-04 使用者定案：「待審核只要做會員連動 不要做票券發放提醒」——
   同一天稍晚，dock 從兩顆縮成一顆。會員連動留著是因為它**沒有別的入口**；
   待審核發放拿掉是因為它在會員資料裡已經看得到兩處（見 grantreviewtest ③）。 */
ok('★★★ dock 裡只有會員連動這一顆',
   /<div id="alert-dock" class="alert-dock">([\s\S]{0,1200}?)<\/div>/.test(src)
   && (RegExp.$1.match(/<span id="/g)||[]).length===1
   && !/id="tb-review-pill"/.test(src));
ok('★★★ dock 是 fixed，不依賴任何版面容器',
   /\.alert-dock\{position:fixed;left:24px;top:78px;z-index:97;display:none;/.test(src));
ok('★★★ 空的時候整個收起來（不然透明區塊會擋到底下的東西）',
   /\.alert-dock\.on\{display:flex;\}/.test(src)
   && /d\.classList\.toggle\('on', has\);/.test(src));
/* 抽獎那顆也在 left:24px/top:78px，會疊到 —— 由 dock 的實際高度推開。 */
ok('★★★ 抽獎那顆用 calc 讓開，不寫死',
   /\.mc-lotto-fab\{position:fixed;left:24px;right:auto;top:calc\(78px \+ var\(--adock-h,0px\)\);/.test(src)
   && /body\.verup-on \.mc-lotto-fab\{top:calc\(168px \+ var\(--adock-h,0px\)\);\}/.test(src));
ok('★★★ 高度是量的不是算的（一顆與兩顆不一樣）',
   /document\.body\.style\.setProperty\('--adock-h', has \? \(d\.offsetHeight\+10\)\+'px' : '0px'\);/.test(src));
ok('★★ 兩支 refresh 的每一條出口都要 sync（含清空那兩條）',
   (src.match(/alertDockSync\(\);/g)||[]).length>=6);
ok('★★ 父層 display:none 救不回來，所以要搬節點（理由寫在原地）',
   /父層 display:none 之下，子元素再怎麼設 display 都救不回來/.test(src));
/* 離線量測（2026-09-04，body.mc-mode）：.tb-left 確認是 display:none；
   dock 不在它底下、空時收起、有內容時 x24/y78 看得見、
   抽獎被 --adock-h 推開、清空後回到 78、pointer-events 可點。
   （當時量的是兩顆＝高 80、抽獎 78→168；改成一顆後高度變小，
     但 --adock-h 是 offsetHeight 量出來的，不需要重量。） */
ok('★★ 離線量測結果記在這支測試裡',
   /\.tb-left 確認是 display:none；/.test(fs.readFileSync(__filename,'utf8')));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
