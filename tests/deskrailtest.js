/* 桌機首頁「今日教練任務」：日期列從上方橫排改成左側直欄（2026-08-22 使用者指示）
   「上方日期列也改到左邊，像手機版首頁一欄的日期，但左右翻頁的箭頭放在最上面用按的；
     第二欄顯示用兩列 教練／今日目前銷課數/今日總課堂數；第三欄起才是今天的課卡。
     這個日期列也是上下填滿頁面，根據視窗大小要自己調整。」 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('三欄：日期直欄 → 教練 → 課卡');
ok('★ 日期直欄在最左，課卡區在右（同一列 flex）',
   /<div class="tl-3col">\s*\n\s*<div class="twk-rail">/.test(src)
   && /<div class="twk-railin">\$\{_wkDays\}<\/div>/.test(src)
   && /<div class="tcard-body">\$\{rows\.map/.test(src)
   && /\.tl-3col\{display:flex;gap:12px;flex:1;min-height:0;\}/.test(src));
ok('★ 左右翻頁的箭頭放在直欄最上面（不再夾在日期兩側）',
   /<div class="twk-rail-nav">\s*\n\s*<button class="tl-daynav" onclick="dashDayShift\(-7\)" title="上一週">‹<\/button>\s*\n\s*<button class="tl-daynav" onclick="dashDayShift\(7\)" title="下一週">›<\/button>/.test(src)
   && !/<div class="twk-strip">\$\{_wkDays\}<\/div>/.test(src));
ok('★★ 七天平分整欄高度（不是固定高度）—— 視窗變矮時一起縮，不會有人被擠出畫面',
   /\.twk-railin \.twk-day\{flex:1 1 0;min-height:0;/.test(src)
   && /\.twk-railin\{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:5px;\}/.test(src));
ok('　　直欄本身不捲（overflow:hidden），只有課卡區會捲',
   /\.twk-rail\{flex:0 0 62px;display:flex;flex-direction:column;gap:6px;overflow:hidden;/.test(src)
   && /\.mc-coachcenter \.tcard-body\{flex:1;min-height:0;overflow-y:auto/.test(src));
ok('　　日期鈕沿用既有的 .twk-day（選中／今天的語彙不變）',
   /out\+=`<button type="button" class="twk-day\$\{sel\?' on':''\}\$\{isT\?' today':''\}"/.test(src)
   && /out\+=`<button type="button" class="twk-day/.test(src));   /* 選中／今天的配色 0822 改版，見下方 */
ok('　　「回到今天」與「N 人上課中」留在標題列（只有日期列搬走）',
   /<div class="tl-title tl-title-week">\$\{!isTodayView\?`<button class="tl-daynav tl-daynav-today"/.test(src));
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
ok('★ 日期欄用品牌金淡底，右側一條分隔線',
   /\.twk-rail\{[\s\S]{0,200}?background:rgba\(180,138,86,\.13\);border-radius:12px;padding:6px 5px;\s*\n\s*border-right:1px solid var\(--bd\);\}/.test(src));
ok('★ 教練欄與課卡欄之間也一條', /\.tl-3col \.tcard-coach\{border-right:1px solid var\(--bd\);\}/.test(src));
ok('★★ 今天＝品牌綠底、選取＝黑框（兩個維度分開，可以同時成立）',
   /\.twk-day\.today\{background:var\(--green\);color:#fff;border-color:var\(--green\);\}/.test(src)
   && /\.twk-day\.on\{border-color:#1a1a1a;border-width:2px;\}/.test(src)
   && /\.twk-day\.on:not\(\.today\)\{background:#fff;color:var\(--text-primary\);\}/.test(src));
ok('　　金底上的日期改白卡（原本是 --card2，疊在金底上會糊成一片）',
   /\.twk-railin \.twk-day\{flex:1 1 0;min-height:0;justify-content:center;padding:4px 2px;background:#fff;\}/.test(src));
ok('★ 「N 人上課中」標籤移除（那一列本來就有流星邊框）',
   !/\$\{_liveCount\?`<span class="tl-live-badge">/.test(src)
   && /頂上再掛一顆數字標是同一件事講兩次/.test(src));
