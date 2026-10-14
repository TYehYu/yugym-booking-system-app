/* 2026-10-14 四件使用者回報：
   ① 調課視窗「日期看起來不像可以點選」    ② 教練請假視窗版面分層
   ③ 更改場地選得到已滿的場地              ④ 建立預約的會員篩選沒把該教練的會員排前面 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 調課視窗');
ok('★ 不再借用 .evr-row（那個 class 只在三個容器底下有定義，彈窗裡等於沒樣式）',
   !/class="evr-row"[^>]*onclick="bkSwapPick/.test(src) && /class="swp-row" onclick="bkSwapPick/.test(src));
ok('★ 滑鼠移上去有反應（變色＋位移＋陰影）',
   /\.swp-row:hover\{[\s\S]{0,200}background:var\(--sage-bg\);transform:translateX\(3px\);box-shadow:/.test(src));
ok('　　按下去也有反應', /\.swp-row:active\{transform:translateX\(3px\) scale\(\.99\);\}/.test(src));
ok('★ 右邊一顆〔讓出這堂〕，移上去變實心綠',
   /<span class="swp-go">讓出這堂<\/span>/.test(src)
   && /\.swp-row:hover \.swp-go\{background:var\(--green\);color:#fff;/.test(src));
ok('　　上面一句「點一堂讓出來」', /<div class="swp-hint">↓ 點一堂讓出來<\/div>/.test(src));
ok('　　日期去掉年份、加大加粗、等寬數字',
   /\.swp-d\{display:block;font-size:14px;font-weight:800;[\s\S]{0,80}font-family:var\(--num\)/.test(src)
   && /class="swp-d">\$\{String\(b\.date\)\.slice\(5\)/.test(src));
ok('　　方案名太長會截斷，不把〔讓出這堂〕擠掉',
   /\.swp-p\{[\s\S]{0,160}text-overflow:ellipsis;/.test(src) && /\.swp-go\{flex:none;/.test(src));

console.log('\n② 教練請假視窗');
ok('★ 真正的結果獨立一條綠底', /<div class="lv-out"><i>🏋️<\/i><span>這堂改成<b>自主訓練<\/b>/.test(src));
ok('★ 「效期不再延長」改金色警示框，而且只有踩到才出現',
   /\$\{_dupWk\?`<div class="lv-warn">/.test(src)
   && /\.lv-warn\{[\s\S]{0,200}border-left:3px solid var\(--gold\);/.test(src));
ok('　　沒踩到時效期仍寫在條列裡（不是整條消失）',
   /\$\{_dupWk \? '' : `<li>\$\{_to/.test(src));
ok('　　時間獨立一條淺底、帶星期', /<div class="lv-sub"><b>\$\{String\(b\.date\)\.slice\(5\)[\s\S]{0,80}_wd\[_dt\.getDay\(\)\]/.test(src));
ok('★ 「代課」是另一條路，用分隔線收到最底下',
   /<div class="lv-alt">找得到代課教練的話，請改用「代課」。<\/div>/.test(src)
   && /\.lv-alt\{[\s\S]{0,120}border-top:1px solid var\(--bd\);/.test(src));
ok('　　條列只剩「堂數先不退」一條（加上條件式的效期）',
   /<li>堂數<b>先不退<\/b>，會員簽到或這堂取消時才退回<\/li>/.test(src));

console.log('\n③ 更改場地：額滿不能選');
ok('★★★ 視窗會先問這個時段的佔用', /const _av=await bkVenueStatus\(String\(b\.date\|\|''\)\.slice\(0,10\),/.test(src));
ok('　　自己那幾筆（含跑步機第 2 台）要先扣掉',
   /\(all\|\|\[\]\)\.filter\(x=>x && \(x\.id===root\|\|x\.sibling_of===root\)\)\.map\(x=>x\.id\)/.test(src));
ok('　　讀不到資料時放行（不要整排畫成不能選）', /if\(!r\) return '';/.test(src));
ok('★ 不能用就淡化＋寫原因，不是把按鈕藏起來',
   /\$\{bad\?' disabled':''\}/.test(src) && /opacity:\.5;cursor:not-allowed;/.test(src)
   && /color:var\(--danger,#7F0303\);font-weight:600;margin-top:3px;">\$\{bad\}/.test(src));
ok('★★★ 存檔前再配一次號（原本寫的是沒有編號的 multi，三筆被當成同一台）',
   /const r=allocateVenue\(b\.category\|\|'自主訓練', day, _ns, _ne, null, unit\);/.test(src)
   && /if\(r && r\.error\)\{ showToast\(r\.error\); return; \}/.test(src)
   && !/^\s*b\.venue_unit=unit;$/m.test(src));
ok('　　bkVenueStatus 的 selfId 可以收一組 id',
   /const skip=new Set\(\[\]\.concat\(selfId\|\|\[\]\)\.filter\(Boolean\)\);/.test(src));

console.log('\n④ 會員篩選：該教練的會員排前面');
ok('★★★ 沒票券的那群也依教練分組（原本整坨「其他會員」還會被截斷）',
   /const noMine=cid\?no\.filter\(m=>String\(m\.default_coach_id\|\|''\)===String\(cid\)\):\[\];/.test(src));
ok('　　這一組排在「其他會員」上面',
   src.indexOf('的會員・沒有可用票券（')<src.indexOf('<optgroup label="其他會員（${noRest.length}）">'));
ok('　　而且不截斷（就是櫃檯要找的人）',
   /\$\{noMine\.map\(opt\)\.join\(''\)\}<\/optgroup>/.test(src));
ok('　　「其他會員」的數字改用扣掉之後的那一組', /其他會員（\$\{noRest\.length\}）/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
if(fail) process.exit(1);
