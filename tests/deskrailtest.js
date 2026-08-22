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
   /\.twk-rail\{flex:0 0 62px;display:flex;flex-direction:column;gap:6px;overflow:hidden;\}/.test(src)
   && /\.mc-coachcenter \.tcard-body\{flex:1;min-height:0;overflow-y:auto/.test(src));
ok('　　日期鈕沿用既有的 .twk-day（選中／今天的語彙不變）',
   /out\+=`<button type="button" class="twk-day\$\{sel\?' on':''\}\$\{isT\?' today':''\}"/.test(src)
   && /\.twk-day\.on\{background:var\(--green\);color:#fff;border-color:var\(--green\);\}/.test(src));
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
ok('　　正圓不被名字撐成橢圓（固定 74×74＋長名字先縮字再截斷）',
   /\.tcard-cball\{width:74px;height:74px;border-radius:50%;flex:0 0 auto;/.test(src)
   && /\.tcard-cball \.tcard-cbn\.long\{font-size:11px;/.test(src)
   && /\.tcard-cball \.tcard-cbn\{[^}]*text-overflow:ellipsis;/.test(src));
