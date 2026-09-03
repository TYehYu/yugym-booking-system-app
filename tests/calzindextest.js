/* 行事曆的三個 sticky 圖層要壓得過課卡
   （2026-09-03 使用者附截圖：「行事曆課卡會蓋過日期標題」）

   往上捲時，日期列（.cal-daycol-head，sticky top:0）被課卡蓋掉。
   ⚠ 真因有兩層：
     ① .cal-ev:hover 有**兩條**規則疊著（250 與 400），後面那條 400 才生效 ——
        只看到前面那條會以為是 250，然後把欄頭設成 300 還是被蓋。
     ② .cal-daycol 只有 position:relative、沒有 z-index —— 不會另開堆疊脈絡，
        所以卡片的 400 是跟欄頭在**同一層**比大小，不是只在自己那一欄裡打轉。
   ⚠ 三個 sticky 圖層的相對關係要維持（左上角交會處才不會破）：
     欄頭 < 時間軸 < 左右翻頁箭頭。
   ⚠ 提示卡（.ev-tip z-index:500）在卡片的堆疊脈絡裡（400 已開脈絡），
     所以它整組也在 400 —— 一樣被欄頭壓住，那是對的。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

const z=(re)=>{ const m=src.match(re); return m?Number(m[1]):null; };
const 欄頭   = z(/\.cal-daycol-head\{[^}]*?z-index:(\d+);/);
const 時間軸 = z(/\.cal-timecol\{[^}]*?z-index:(\d+);/);
const 箭頭   = z(/\.cal-hdr-arrow\{[^}]*?z-index:(\d+);/);
const 課卡   = z(/\.cal-ev\{[^}]*?z-index:(\d+);/);
/* 取**最後一條** .cal-ev:hover 的 z-index —— 前面那條是死的。 */
const hovers = [...src.matchAll(/\.cal-ev:hover\{[^}]*?z-index:(\d+);/g)].map(m=>Number(m[1]));
const 滑過   = hovers.length ? hovers[hovers.length-1] : null;

console.log('① 讀到的圖層值');
console.log(`     課卡 ${課卡} ／ 滑過 ${滑過} ／ 欄頭 ${欄頭} ／ 時間軸 ${時間軸} ／ 箭頭 ${箭頭}`);
ok('　 五個值都讀得到', [課卡,滑過,欄頭,時間軸,箭頭].every(v=>typeof v==='number'), {課卡,滑過,欄頭,時間軸,箭頭});

console.log('\n② 欄頭要壓得過課卡（含滑過時）');
ok('★★★ 欄頭 > 滑過的課卡', 欄頭 > 滑過, {欄頭, 滑過});
ok('★★★ 欄頭 > 一般課卡', 欄頭 > 課卡, {欄頭, 課卡});
ok('★★★ 只剩一條 .cal-ev:hover 帶 z-index（另一條的死值已移除，免得下次又看錯）',
   hovers.length===1, {找到幾條:hovers.length, 值:hovers});
ok('★★ 那條死規則的事寫在原地',
   /這一條的 z-index 是\*\*死的\*\*/.test(src)
   && /同權重、在後面，所以贏的是那條。查圖層問題時兩條都要看/.test(src));

console.log('\n③ 三個 sticky 圖層的相對關係不變');
ok('★★★ 欄頭 < 時間軸（左上角交會處，時間軸要在上面）', 欄頭 < 時間軸, {欄頭, 時間軸});
ok('★★★ 時間軸 < 翻頁箭頭（箭頭壓在欄頭那一列上）', 時間軸 < 箭頭, {時間軸, 箭頭});

console.log('\n④ 成因寫在原地');
ok('★★★ 記下「.cal-daycol 沒開堆疊脈絡」這個關鍵',
   /\.cal-daycol 只有 position:relative 沒有 z-index —— 不會另開堆疊脈絡/.test(src)
   && /所以卡片的 400 是跟欄頭在\*\*同一層\*\*比大小/.test(src));
ok('★★ 記下使用者原話（下次同樣症狀查得回來）',
   /行事曆課卡會蓋過日期標題/.test(src));
ok('★★ 記下提示卡也會被壓住、而且那是對的',
   /一樣會被欄頭壓住 —— 那是對的：欄頭永遠要看得見/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
