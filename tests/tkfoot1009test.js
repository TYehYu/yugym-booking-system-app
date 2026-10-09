/* 票券卡底列定版（2026-10-09 使用者，分兩次講）：
     ①「右邊分期金額改到靠左靠下　有辦法用一列呈現嗎　然後左下的按鈕改到右下」
     ②「手機版不用出現出席證明　這個是桌機要列印使用的」

   這翻掉了 0915 的左右對調（那時分期是直排三列、右下太擠才把按鈕挪到左邊）；
   改成橫排一列之後右下就不擠了。

   實測（預覽頁用真的 CSS 量）：
     卡片寬 1180／880 → 分期一列、底列 21px、整張卡 152px（原本 70px／201px）
     卡片寬 340（手機）→ 分期三列、底列 97px、〔出席證明〕不出現 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 金額靠左、按鈕靠右（0915 的對調已撤）');
ok('★★★ 不再有 order:-1 的左右對調',
   !/\.tkc-foot>span:last-child\{order:-1/.test(src));
ok('★★★ 第一格（金額）靠左', /\.tkc-foot>span:first-child\{text-align:left;\}/.test(src));
/* 按鈕那個 span 的 inline margin-left:auto 原本被 !important 蓋掉，現在要留著用 */
ok('★★★ 按鈕靠右靠的是 .tkc-acts 的 margin-left:auto（沒有被蓋掉）',
   /\.tkc-acts\{display:flex;gap:6px;flex:none;margin-left:auto;white-space:nowrap;\}/.test(src)
   && !/\.tkc-foot>span:first-child\{margin-left:auto;\}/.test(src));

console.log('\n② 多期橫排一列');
ok('★★★ 從 inline-grid 改成橫排 flex',
   /\.tkc-money \.tk-paylist-multi\{display:flex;flex-direction:row;flex-wrap:wrap;/.test(src)
   && !/\.tkc-money \.tk-paylist-multi\{display:inline-grid/.test(src));
/* ⚠ .tk-paylist 本身帶 flex-direction:column，只改 display 不會生效（預覽時踩過） */
ok('★★★ flex-direction 有寫（只改 display 會被 .tk-paylist 的 column 蓋掉）',
   /\.tkc-money \.tk-paylist\{display:flex;flex-direction:column;/.test(src)
   && /\.tk-paylist-multi\{display:flex;flex-direction:row;/.test(src));
ok('★★★ 每一期變成一個 inline-flex 的盒子（原本是 display:contents 的 grid 列）',
   /\.tk-paylist-multi \.tk-payrow\{display:inline-flex;align-items:center;gap:6px;\}/.test(src)
   && !/\.tk-paylist-multi \.tk-payrow\{display:contents;\}/.test(src));
ok('★★ 窄視窗折成多列時，按鈕仍與最後一列切齊（0923 那條留著）',
   /\.tkc-foot:has\(\.tk-paylist-multi\)\{align-items:flex-end !important;\}/.test(src));

console.log('\n③ 手機不出現〔出席證明〕');
ok('★★★ 按鈕掛 .tkc-attcert（兩張卡都要）',
   (src.match(/class="btn btn-ghost btn-sm tkc-attcert"/g)||[]).length===2);
ok('★★★ 820px 以下藏起來（沿用票券卡自己那一組斷點）',
   /@media \(max-width:820px\)\{\s*\n\s*\.tkc-attcert\{display:none !important;\}/.test(src));
/* ⚠ 用 CSS 藏而不是產生按鈕時判斷：轉向或拉寬視窗要立刻正確，不必重畫卡片 */
ok('★★ 不是在產生按鈕時用 JS 判斷裝置',
   !/tkAttendCert[\s\S]{0,200}?innerWidth/.test(src));

console.log('\n④ 手機折行時左下不留空白');
/* 使用者附截圖：「左下空了一列　是因為右下的按鈕嗎　有辦法不要有空白嗎」——
   底列本來是「金額一格 ╳ 按鈕一格」兩個盒子，分期折成三列後按鈕只能整塊掉到第四列。
   手機改用 display:contents 把中間兩層拆掉，每一期自己當底列的項目，
   按鈕就接在最後一期後面。實測 360px：底列 97→73px、整張卡 267→234px、沒有溢位。 */
ok('★★★ 手機把金額那兩層盒子拆掉（每一期直接當底列項目）',
   /\.tkc-foot:has\(\.tk-paylist-multi\)>span:first-child\{display:contents;\}/.test(src)
   && /\.tkc-foot:has\(\.tk-paylist-multi\) \.tkc-money\{display:contents;\}/.test(src)
   && /\.tkc-foot:has\(\.tk-paylist-multi\) \.tk-paylist-multi\{display:contents;\}/.test(src));
/* ⚠ 單期那條路的金額是一堆散的 inline 片段（$金額、現金章、折抵券…），
   拆掉盒子會讓它們各自換行，所以三條都要夾 :has(.tk-paylist-multi) */
ok('★★★ 只對多期套，單期不受影響',
   (src.match(/\.tkc-foot:has\(\.tk-paylist-multi\)[^\n]*display:contents/g)||[]).length===3);
ok('★★ 這三條與〔出席證明〕住在同一個 820px 區塊',
   /@media \(max-width:820px\)\{[\s\S]{0,1400}?\.tkc-foot:has\(\.tk-paylist-multi\)>span:first-child\{display:contents;\}/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
