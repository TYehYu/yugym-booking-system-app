/* 課卡標題卡右上角的關閉鈕（2026-09-14 使用者：「課卡的標題卡 右上角可以新增一個x
   點選關閉視窗 桌機跟手機版都要」）
   四張標題卡：桌機課卡、手機課卡（.ash-crs）、會員端 V2、會員端舊版、會員端團課。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 四張標題卡都有關閉鈕');
ok('★★★ 會員端三張（V2／團課／舊版）都有，關閉走 memTaskClose',
   (src.match(/<button type="button" class="mtp-x" onclick="memTaskClose\(\)" aria-label="關閉">✕<\/button>/g)||[]).length===3);
ok('★★★ 手機課卡（.ash-crs 那張）有，關閉走 collapseBkCard',
   /<button type="button" class="mtp-x ash-x" onclick="event\.stopPropagation\(\);collapseBkCard\(\);" aria-label="關閉">✕<\/button>/.test(src));
ok('★★★ 桌機課卡也有（使用者特別交代「桌機跟手機版都要」）',
   /<button type="button" class="mtp-x" onclick="event\.stopPropagation\(\);collapseBkCard\(\);" aria-label="關閉">✕<\/button>/.test(src));

console.log('\n② 不可以誤觸到既有行為');
ok('★★★ 手機那張的 ✕ 一定要 stopPropagation（整張卡綁著 ashEditAsk）',
   /onclick="ashEditAsk\('\$\{b\.id\}'\)" title="調整課程"/.test(src)
   && /class="mtp-x ash-x" onclick="event\.stopPropagation\(\);/.test(src));
ok('★★★ 會員端標題卡仍然刻意不可點（onclick 只掛在 ✕ 上）',
   !/<div class="mtp-card mtp-head"[^>]*onclick=/.test(src));
ok('★★ 原因寫在原地', /會員端的標題卡是\*\*刻意不可點\*\*的（memgrpviewtest 釘著）/.test(src));

console.log('\n③ 三份樣式各自寫（三個容器的樣式作用域不同）');
/* 2026-09-15 使用者回報：「這個Ｘ按鈕把時間往左邊調整了　這個Ｘ按鈕可以做成一個
   小圓形按鈕放在視窗邊緣嗎」—— ✕ 原本是標題列 flex 的成員，佔著文字流把開課時間
   往左擠。三張都改成 position:absolute 貼右上的圓形鈕，脫離流。 */
ok('★★★ 會員端：貼邊絕對定位（不再佔文字流）',
   /#mem-task-pop \.mtp-x\{position:absolute;right:9px;top:9px;/.test(src));
ok('★★★ 桌機：貼邊絕對定位', /#bk-card-pop \.mtp-x\{position:absolute;right:9px;top:9px;/.test(src));
ok('★★★ 手機（.ash-* 那組住在 @media 裡，要另寫一份）',
   /\.ash-x\{position:absolute;right:9px;top:9px;/.test(src));
ok('★★★ 三張都是圓形（border-radius:999px）且有底色，看起來像按鈕',
   (src.match(/border-radius:999px;cursor:pointer;font-family:inherit;\s*\n?\s*font-size:1[45]px;line-height:1;color:var\(--t3\);padding:0/g)||[]).length>=2);
ok('★★★ 觸控面積夠（長輩按得到才算數）—— 會員端與手機 28px、桌機 26px',
   (src.match(/width:28px;height:28px;display:flex;align-items:center;justify-content:center;/g)||[]).length===2
   && /width:26px;height:26px;display:flex;align-items:center;justify-content:center;/.test(src));
/* ⚠ 脫離流之後，容器一定要有 position:relative 當定位基準，右側也要留 padding，
     否則長課名會被鈕壓到。桌機那張的 .mtp-card 本來沒有 relative，是這次補的。 */
ok('★★★ 桌機容器補上 relative＋右側 padding（它本來兩者都沒有）',
   /#bk-card-pop \.mtp-card\{position:relative;width:100%;display:flex;[^}]*padding:12px 40px 12px 14px;/.test(src));
ok('★★★ 會員端容器右側 padding 留給鈕',
   /#mem-task-pop \.mtp-head\{display:block;position:relative;padding:13px 44px 13px 24px;\}/.test(src));
ok('★★★ 手機容器右側 padding 留給鈕（18 → 44）',
   /\.mtp-card\.admh-sheet\{flex:none;display:block;position:relative;[^}]*padding:13px 44px 13px 26px;/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
