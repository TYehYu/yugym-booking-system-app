/* 桌機首頁「今日教練任務」的日期列
   0822 使用者：「改到左邊，像手機版首頁一欄的日期，翻頁箭頭放最上面」→ 左側直欄
   0823 使用者：「日期列改到上方 變橫向一列」→ 搬回上方橫列（本檔案改測這一版）
   ⚠ 選日／翻週的行為與樣式語彙（今天綠底、選取黑框、金底底色）兩版共用，沒有跟著改。
   教練欄（圓形色塊）與課卡欄的部分不受影響，下半段的斷言原封不動。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('日期列在上方橫排 → 底下是 教練 ｜ 課卡 兩欄');
/* 2026-09-02 使用者指示：「中間欄上方的日期列　移出任務視窗改到上方
   日期列左右延伸跟任務視窗一樣寬」—— 從 .tl-panel 裡面搬到任務卡外面、卡片上方。 */
ok('★★ 日期列移出任務卡，掛在它上方（寬度＝中間欄寬＝跟卡片切齊）',
   /const dayBar = `<div class="twk-bar">[\s\S]{0,600}<div class="twk-barin">\$\{_wkDays\}<\/div>/.test(src)
   && /<div class="mc-daybar">\$\{dayBar\}<\/div>\s*\n\s*<div class="card mc-card mc-coachcenter">/.test(src)
   && !/<div class="tl-panel tl-desktop-only">[\s\S]{0,900}?<div class="twk-bar">/.test(src)
   && /\.mc-g5-mid>\.mc-daybar\{margin:-10px 0 12px !important;\}/.test(src));
ok('★ 課卡區照舊',
   /<div class="tcard-body">\$\{rows\.map/.test(src)
   && /\.tl-3col\{display:flex;gap:12px;flex:1;min-height:0;\}/.test(src));
/* 2026-08-23：兩端各多一格 .twk-today-slot（「回到今天」的固定位），
   箭頭仍緊貼在七天那一排的兩側。 */
ok('★ 左右翻頁的箭頭在日期列兩端',
   /<span class="twk-today-slot">[\s\S]{0,220}?<\/span>\s*\n\s*<button class="tl-daynav" onclick="dashDayShift\(-7\)" title="上一週">‹<\/button>/.test(src)
   && /<div class="twk-barin">\$\{_wkDays\}<\/div>\s*\n\s*<button class="tl-daynav" onclick="dashDayShift\(7\)" title="下一週">›<\/button>/.test(src));
/* 2026-09-02 使用者：「回到今日的按鈕固定在日期列左邊」——
   推翻 0823 的左右判斷（_todaySide），右邊那一格一起移除。 */
ok('★★ 「回到今天」固定在左邊；那一格仍預留固定寬，鈕消失時版面不跳',
   !/_todaySide/.test(src)
   && /const _showToday=!isTodayView;/.test(src)
   && /\.twk-today-slot\{flex:0 0 58px;/.test(src));
/* 2026-09-02 二修（使用者：「中間空了一格　可以把每日的按鈕再加寬加高一點」）——
   一修的 margin-left:auto 把空白全推到 ‹ 前面；改回平分，空白被吃掉、按鈕同時變寬。 */
ok('★★ 七天平分剩餘寬度，中間不留空格',
   /\.twk-barin \.twk-day\{flex:1 1 0;min-width:0;justify-content:center;padding:15px 2px;/.test(src)
   && /\.twk-barin\{flex:1 1 auto;min-width:0;display:flex;gap:5px;\}/.test(src)
   && !/margin-left:auto;\}\s*\n?[^\n]*twk-barin/.test(src));
/* 註解裡還提得到舊 class（說明它為什麼被移除），所以先把註解剝掉再檢查 */
const _noComment = src.replace(/\/\*[\s\S]*?\*\//g,'');
ok('　　舊的直欄樣式已清乾淨（不留死 CSS）',
   !/\.twk-rail\{/.test(_noComment) && !/\.twk-railin/.test(_noComment)
   && !/\.twk-rail-nav/.test(_noComment)
   && /\.mc-coachcenter \.tcard-body\{flex:1;min-height:0;overflow-y:auto/.test(src));
ok('　　日期鈕沿用既有的 .twk-day（選中／今天的語彙不變）',
   /out\+=`<button type="button" class="twk-day\$\{sel\?' on':''\}\$\{isT\?' today':''\}"/.test(src)
   && /out\+=`<button type="button" class="twk-day/.test(src));   /* 選中／今天的配色 0822 改版，見下方 */
/* 2026-08-23 使用者指示：「[回到今天] 的按鈕改到左右翻頁鈕的旁邊」——
   標題列因此只剩右邊的圖例（上面那塊空白就是使用者說「看起來好空」的地方）。 */
ok('　　「回到今天」已從標題列搬到日期列的翻頁鈕旁',
   !/<div class="tl-title tl-title-week">\$\{!isTodayView\?`<button class="tl-daynav tl-daynav-today"/.test(src)
   && /<div class="tl-panel-top"><div class="tl-top-right">\$\{legend\}<\/div><\/div>/.test(src));
ok('　　第二欄（教練姓名＋今日銷課\/總堂）沿用既有的課卡列，不另做一套',
   /<div class="tcard-body">\$\{rows\.map\(r=>r\.cardHtml\)\.join\(''\)\}<\/div>/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);

/* 2026-08-22 使用者指示：「桌機首頁的教練欄 用圓形色塊顯示，教練的名稱在上、下面是
   課堂數 n/n，移除不必要的內容，色塊用該教練的顏色」 */
console.log('\n教練欄：一顆圓形色塊');
ok('★ 名字在上、n/n 在下，包在同一顆圓裡',
   /<span class="tcard-cball" style="background:\$\{_cc\.bg\};color:\$\{_cc\.fg\};"/.test(src)
   && /<b class="tcard-cbn\$\{String\(coachDisp\(c\)\|\|''\)\.length>4\?' long':''\}">\$\{coachDisp\(c\)\}/.test(src)
   && /<span class="tcard-cbt\$\{\(total>0&&done>=total\)\?' done':''\}">\$\{done\}\/\$\{total\}<\/span>/.test(src));
ok('★ 色塊用該教練的顏色（同 coachTagColor，與課卡右下角那顆標籤同一組）',
   /const _cc=\(typeof coachTagColor==='function'\)\?coachTagColor\(c\.id\):\{bg:'#EAE6DE',fg:'#6a655c'\};/.test(src));
ok('★ 移除不必要的內容：灰底縮寫圓與「上課中」那一行退場',
   !/<span class="tcard-av">\$\{coachAbbr\(c\)\}<\/span>/.test(src)
   && !/tcard-cstate-live"><i class="tl-cstate-dot live"><\/i>上課中/.test(src)
   && /「上課中」那一行拿掉 —— 該列本來就有流星邊框在表示/.test(src));
ok('　　正圓不被名字撐成橢圓（固定 72×72＋長名字先縮字再截斷）',
   /\.tcard-cball\{width:72px;height:72px;border-radius:50%;flex:0 0 auto;/.test(src)
   && /\.tcard-cball \.tcard-cbn\.long\{font-size:10\.5px;/.test(src)
   && /\.tcard-cball \.tcard-cbn\{[^}]*text-overflow:ellipsis;/.test(src));
/* 0822 二修（使用者）：不要「我」那顆咖啡色標籤、堂數放大、欄寬收斂 */
ok('★ 「我」的標記拿掉（管理員看這頁是看全店，自己那一列不需要特別指認）',
   !/<i class="tl-me">我<\/i>/.test(src)
   && /「我」那顆標記拿掉/.test(src));
ok('★ 堂數放大、名字降一階（這一欄要一眼讀到的是幾堂）',
   /\.tcard-cball \.tcard-cbt\{font-family:var\(--num\);font-size:17px;font-weight:800;line-height:1;\}/.test(src)
   && /\.tcard-cball \.tcard-cbn\{font-size:11\.5px;/.test(src));
ok('★ 欄寬從 118 收到 84（原本是給「縮寫圓＋三行文字」的寬度）',
   /\.tcard-coach\{display:flex;align-items:center;justify-content:center;gap:0;width:84px;/.test(src)
   && /\.tcard-coach\{width:84px;flex-shrink:0;padding-top:4px;position:sticky;/.test(src));

/* 2026-08-22 使用者定版：日期欄金底＋三欄之間各一條分隔線；今天＝品牌綠、選取＝黑框；
   「N 人上課中」標籤移除。 */
console.log('\n日期欄的底色與狀態語彙');
ok('★ 日期列用品牌金淡底（0823 搬到上方後仍是同一個底色）',
   /\.twk-bar\{[\s\S]{0,160}?background:rgba\(180,138,86,\.13\);border-radius:12px;padding:6px;\}/.test(src));
ok('★ 教練欄與課卡欄之間一條分隔線', /\.tl-3col \.tcard-coach\{border-right:1px solid var\(--bd\);\}/.test(src));
ok('★★ 今天＝品牌綠底、選取＝黑框（兩個維度分開，可以同時成立）',
   /\.twk-day\.today\{background:var\(--green\);color:#fff;border-color:var\(--green\);\}/.test(src)
   && /\.twk-day\.on\{border-color:#1a1a1a;border-width:2px;\}/.test(src)
   && /\.twk-day\.on:not\(\.today\)\{background:#fff;color:var\(--text-primary\);\}/.test(src));
ok('　　金底上的日期改白卡（原本是 --card2，疊在金底上會糊成一片）',
   /\.twk-barin \.twk-day\{flex:1 1 0;min-width:0;justify-content:center;padding:5px 2px;background:#fff;\}/.test(src));
ok('★ 「N 人上課中」標籤移除（那一列本來就有流星邊框）',
   !/\$\{_liveCount\?`<span class="tl-live-badge">/.test(src)
   && /頂上再掛一顆數字標是同一件事講兩次/.test(src));

/* 2026-08-22 使用者指示：回到今天＝紅底、日期列翻頁鈕＝金底、教練＋課卡整列＝米底 */
ok('★ 「回到今天」用品牌紅（紅>金>綠：它是「你現在不在今天」的最高等級提示）',
   /\.tl-daynav\.tl-daynav-today\{width:auto;padding:0 12px;font-size:11\.5px;font-weight:700;\s*\n\s*color:#fff;background:var\(--danger,#7F0303\);/.test(src));
ok('★ 日期列的翻頁鈕金底（跟金色的日期列收在一起）',
   /\.twk-bar>\.tl-daynav\{[\s\S]{0,90}background:var\(--gold,#B48A56\);color:#fff;\}/.test(src));
ok('★ 教練＋課卡整列米底（左金右米，兩區的界線不只靠那條線）',
   /\.tl-3col \.tcard-row\{background:var\(--card2,#FAF7F0\);border-radius:12px;/.test(src));
ok('　　⚠ sticky 的教練欄底色要一起換，否則橫捲時會露出一塊白',
   /\.tl-3col \.tcard-row \.tcard-coach\{background:var\(--card2,#FAF7F0\);\}/.test(src)
   && /否則捲動時會露出一塊白/.test(src));
