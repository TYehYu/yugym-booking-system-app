/* 2026-08-03 使用者指示：「櫃檯帳號、管理員帳號、店長帳號要能夠調整課卡功能」

   缺口在手機版行事曆（renderCoachAgenda）的課卡：
   ・canClick 只認 admin 與店長 —— 櫃檯連課卡都點不開
   ・長按拖移改期（data-bid）只綁「自己的課」—— 三種管理身份都拖不動別人的課
   明細與圓形按鈕那層（coachOwnsBk）本來就對三種身份全開，卡就卡在課卡本身。

   修正：三種身份對全部課卡開放點擊＋長按拖移＋繳費/續約角標；
   右欄可拖的卡用 pan-y（平常照捲、長按定住才拖，tlx 卡同一套已驗證的模式），
   教練（非店長）行為完全不變。已在瀏覽器驗過 computed style：
   mine=none / 管理身份的右欄卡=pan-y / 教練看別人的卡=auto。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 三種身份的完整權限');
ok('★ 櫃檯納入 isAdmin（原本只有 admin 與店長）',
   /const isAdmin=SESSION\.role==='admin'\|\|SESSION\.role==='front_desk'\|\|!!SESSION\.is_manager;/.test(src));
ok('★ 課卡的 data-bid 跟著 canClick 走（三種身份＝全部課卡可拖，教練＝只有自己的）',
   /\$\{canClick\?`data-bid="\$\{b\.id\}"`:''\} style="top:\$\{top\}px;height:\$\{height\}px;\$\{posStyle\}"\$\{canClick\?` onclick="wtlCardClick\('\$\{b\.id\}',this\)"`:''\}/.test(src));
ok('★ canClick 的定義沒變（mine 或管理身份）', /const canClick = layer==='mine' \|\| isAdmin;/.test(src));
ok('　　長按拖移本來就綁在 data-bid 卡上，新卡自動生效',
   /host\.querySelectorAll\('\.cag-wc\[data-bid\], \.cag-std\[data-bid\]'\)\.forEach\(card=>\{/.test(src));
ok('　　繳費/續約角標與紅框提醒也對櫃檯開（_mk/_vis 走同一個 isAdmin）',
   /const _mk = \(layer==='mine'\|\|isAdmin\)/.test(src) && /const _vis=\(layer==='mine'\|\|isAdmin\);/.test(src));

console.log('\n② 捲動與拖移並存');
ok('★ 右欄可拖的卡用 pan-y（平常照捲、長按定住才拖）',
   /\.cag-col-rest \.cag-std\[data-bid\]\{touch-action:pan-y;\}/.test(src));
ok('★ 自己的課卡（左欄）維持 none（拖移最穩，前一案定案）',
   /\.cag-wc\[data-bid\],\.cag-std\[data-bid\]\{touch-action:none;\}/.test(src));
ok('　　為什麼右欄用 pan-y，寫在 CSS 旁',
   /也綁了長按拖移，但保留 pan-y —— 平常滑動照捲，長按定住才進拖移/.test(src));

console.log('\n③ 下游權限鏈不用改（本來就放行）');
ok('★ coachOwnsBk：非教練與店長一律 true（圓形按鈕、儲存、取消、簽到）',
   /if\(!SESSION \|\| SESSION\.role!=='coach' \|\| SESSION\.is_manager\) return true;/.test(src));
ok('★ bkIsMasked：非教練不遮蔽（櫃檯/管理員看得到完整內容）',
   /if\(!SESSION \|\| SESSION\.role!=='coach'\) return false; \/\/ 非教練不遮蔽/.test(src));
ok('　　教練（非店長）看別人的課維持純顯示（0801 定版沒動）',
   /不要再回頭用 pointer-events:none/.test(src));
ok('　　使用者的指示寫在程式裡',
   /「櫃檯帳號、管理員帳號、店長帳號要能夠調整課卡功能」/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
