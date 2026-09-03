/* 會員資料：基本資料＋四顆分頁鈕固定在上方，只有下方內容捲動（2026-08-22 使用者指示，
   「桌機的所有會員資料頁面都統一調整」）＋上方米色卡再收短一點。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('表頭固定、只有下方捲動');
/* ⚠ 不要把 z-index 寫進這條斷言 —— 這支測試守的是「捲軸在哪一層」，
   圖層順序是另一回事，由 tests/zorder.js 管（0903 從 90 抬到 800，這裡就誤報了一次）。 */
ok('★★ 捲軸從外層移進 #pp-body（.pp-sheet 與 .pp-root 都改成 overflow:hidden）',
   /\.pp-sheet\{position:fixed;inset:0;z-index:\d+;background:var\(--bg\);overflow:hidden;/.test(src)
   && /\.pp-sheet \.pp-root\{display:flex;flex-direction:column;overflow:hidden;\}/.test(src)
   && /\.pp-sheet #pp-body\{flex:1 1 auto;min-height:0 !important;overflow-y:auto;/.test(src));
ok('★★ ⚠ 中間那層 #pp-host 也要是 flex 容器並帶 min-height:0，否則 overflow 不生效',
   /\.pp-sheet #pp-host\{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;\}/.test(src)
   && /flex 子項的預設 min-height:auto 會被內容撐開，捲軸就跑回最外層/.test(src));
ok('★ 表頭與分頁列不跟著捲',
   /\.pp-sheet #pp-host>\.pp-head,\.pp-sheet #pp-host>\.pp-rectabs,\.pp-sheet #pp-host>\.pp-tabs\{flex:0 0 auto;\}/.test(src));
/* 2026-08-22 二修（使用者：「會員資料的這一列獨立出來凍結 不要跟著下方頁面滑動」）——
   上一輪只固定住表頭，四顆分頁鈕還是跟著捲，因為它是 ppRecordHtml 產出、塞在 #pp-body 裡面。 */
ok('★★ 四顆分頁鈕要搬出 #pp-body 才吃得到「不跟著捲」那條規則',
   /const tabsEl=bodyEl&&bodyEl\.querySelector\('\.pp-rectabs'\);/.test(src)
   && /if\(tabsEl\) host\.insertBefore\(tabsEl, bodyEl\);/.test(src));
ok('★★ ⚠ 它不是 #pp-body 的直接子層（ppRecordHtml 把它包在 .pp-card 裡）——'
   +'第一版寫 :scope > .pp-rectabs 選不到，搬移靜靜失敗，使用者回報「還是跟著捲」',
   /它不是 #pp-body 的直接子層 —— ppRecordHtml 把它包在 \.pp-card 裡面/.test(src)
   && !/querySelector\(':scope > \.pp-rectabs'\)/.test(src)
   && /return `<div class="pp-card">\$\{back\}/.test(src));
ok('　　選擇在 DOM 上搬，而不是改 ppRecordHtml 的回傳結構（那支四個分頁與員工頁共用）',
   /在 DOM 上搬、而不是改 ppRecordHtml 的回傳結構/.test(src));
ok('★ 三種模式統一：手機全頁、管理員手機視窗、桌機視窗都吃同一套',
   /\.pp-sheet\.pp-sheet-desk \.pp-root\{[\s\S]{0,240}?overflow:hidden;\s*\n\s*height:calc\(100vh - 48px\);/.test(src)
   && /\.pp-sheet\.pp-sheet-win \.pp-root\{[\s\S]{0,240}?overflow:hidden;\s*\n\s*height:calc\(100dvh - 24px\);/.test(src));
ok('　　#pp-body 自己的捲軸不顯示',
   /\.pp-sheet #pp-body::-webkit-scrollbar\{display:none;width:0;height:0;\}/.test(src));

console.log('\n上方米色卡收短');
ok('★ 內距與行距各讓一點', /\.pp-head\.pp-head-m2\{[\s\S]{0,140}?gap:8px 16px;\s*\n\s*align-items:start;padding:11px 14px;\}/.test(src));
ok('★ 大頭照 76 → 58（0820 放大過，現在表頭不捲了，佔高度就是永久少掉的可讀區）',
   /\.pp-head-m2 \.pp-avatar\{width:58px;height:58px;\}/.test(src)
   && /表頭改成固定不捲/.test(src));
ok('　　姓名 21 → 19、欄位行距 7 → 5',
   /\.pp-head-m2 \.pp-name\{font-size:19px;\}/.test(src)
   && /\.pp-head-m2 \.pp-idfields,\.pp-head-m2 \.pp-fields\{display:flex;flex-direction:column;gap:5px;margin-top:0;\}/.test(src));
ok('　　理由寫在原地（固定不捲的那一塊，佔多少就少多少可讀區）',
   /它現在是固定在上方不捲的那一塊，\s*\n?\s*佔多少高度就等於永久少掉多少可讀區/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);

/* 2026-08-22 使用者回報：「中間三個按鈕的文字被擠壓了」 */
ok('★ 分頁鈕的文字不會互相壓到（nowrap 之外要有 overflow/ellipsis）',
   /\.pp-rectab\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\}/.test(src)
   && /寧可縮字，也不要讓四個字的分頁名互相壓到/.test(src));
ok('　　窄機型（≤400）再降一級字與內距',
   /@media\(max-width:400px\)\{\s*\n\s*\.pp-rectabs\{gap:4px;\}\s*\n\s*\.pp-rectab\{font-size:11\.5px;padding:8px 2px;letter-spacing:-\.02em;\}/.test(src));
