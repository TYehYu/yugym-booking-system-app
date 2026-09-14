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
ok('★★ 會員端', /#mem-task-pop \.mtp-x\{flex:none;background:none;border:none;cursor:pointer;/.test(src));
ok('★★ 桌機', /#bk-card-pop \.mtp-x\{flex:none;align-self:flex-start;/.test(src));
ok('★★ 手機（.ash-* 那組住在 @media 裡，要另寫一份）',
   /\.ash-x\{flex:none;background:none;border:none;cursor:pointer;/.test(src));
ok('★ 觸控面積夠（長輩按得到才算數）', /padding:4px 2px 4px 8px;margin:-4px -2px -4px 0;/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
