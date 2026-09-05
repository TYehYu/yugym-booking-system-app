/* 共享票的圓形卡：色點在上、使用人與日期在下（2026-08-27 使用者回報，附截圖）

   「這個圓形卡　票券使用人用黃框表示不夠清楚　情境是 陳瀚竣的方案 分享給陳玟淂
     則該張圓形卡改成一個色點在上方下方顯示使用人跟日期
     因為今天10:00這一堂分不清楚是誰使用的」

   這是第三次改法，前兩次都失敗在同一個地方 ——
     2026-08-04　共享的堂縮小一號  → 兩種大小混排更難讀
     2026-08-06　外圈套一圈金環    → 講得出「不是持有人用的」，講不出「是誰」
   一張票同時共享給兩個人時，兩邊都是金環，完全分不開。第三次直接寫名字。

   這一支守兩件事：
     ① 真的把「誰用、哪一天」寫成文字了（不是再換一個顏色／形狀）
     ② 除了共享的那幾顆，其他一切照舊 —— 狀態語彙、title、可點、流星、場地徽章 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;/* 2026-09-05：這幾顆圓的 50% → 999px（逐條驗過都是正方形，畫出來一樣）——
   同一件事只留一種寫法。 */
console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const CSS=src.slice(src.indexOf('<style>'), src.indexOf('</style>'));

console.log('① 內容：色點在上，使用人與日期各一行在下');
{
  ok('★★ _shBody 三段：色點 → 使用人 → 日期',
     /const _shBody=\(b,dt\)=>\(b&&b\._shName\)\s*\n\s*\? `<i class="mtk-shdot"><\/i>`\s*\n\s*\+`<b class="mtk-shnm">\$\{String\(b\._shName\)\.replace\(\/<\/g,'&lt;'\)\}<\/b>`\s*\n\s*\+`<b class="mtk-shdt">\$\{dt\}<\/b>`\s*\n\s*: dt;/.test(src));
  ok('★★ 使用人的名字有轉義（名字是資料庫來的）',
     /String\(b\._shName\)\.replace\(\/<\/g,'&lt;'\)/.test(src));
  ok('★★ 沒有共享時原封不動回傳同一串 —— 其他所有圓點一個位元都沒變',
     /\s+: dt;/.test(src));
  ok('★★ 兩處都套上了（已使用、已預約）',
     (src.match(/_shBody\(b, /g)||[]).length===2
     && /\$\{_shBody\(b, b\?md\(b\):\(_md\?md\(\{date:_md\}\):'✓'\)\)\}/.test(src)
     /* 2026-08-28：已預約那一處多一個分岔 —— 教練請假走 _lvBody（紅點＋請假＋日期） */
     && /\$\{clv\?_lvBody\(b, md\(b\)\):_shBody\(b, md\(b\)\)\}/.test(src));

  /* 實跑一次，確認兩條路各自吐出什麼 */
  const seg=src.slice(src.indexOf('  const _shBody=(b,dt)=>'), src.indexOf('  const _ghost='));
  const f=new Function(seg+'\nreturn _shBody;')();
  eq('★★ 共享的堂：色點＋姓名＋日期', f({_shName:'陳瀚竣'},'8/29'),
     '<i class="mtk-shdot"></i><b class="mtk-shnm">陳瀚竣</b><b class="mtk-shdt">8/29</b>');
  eq('★★ 持有人自己的堂：還是原本那一串日期', f({},'8/29'), '8/29');
  eq('　 沒有 booking 的格子（舊系統補登）也不受影響', f(null,'✓'), '✓');
  eq('　 名字含 < 會被轉義', f({_shName:'<b>x'},'8/1'),
     '<i class="mtk-shdot"></i><b class="mtk-shnm">&lt;b>x</b><b class="mtk-shdt">8/1</b>');
}

console.log('\n② 色點吃課程色（使用者定案：「依照課程的顏色」）');
{
  ok('★★ 教練請假：紅點＋「請假」＋日期（2026-08-28 使用者指示）',
     /const _lvBody=\(b,dt\)=>`<i class="mtk-shdot"><\/i><b class="mtk-shnm">請假<\/b><b class="mtk-shdt">\$\{dt\}<\/b>`;/.test(src)
     && /\.mtk-lv \.mtk-shdot\{background:var\(--danger,#b5372e\);\}/.test(CSS)
     && /\.mtk-lv \.mtk-shnm\{color:var\(--danger,#b5372e\);\}/.test(CSS));
  ok('★★ 已簽到＝實心紅（堂已退回、人有到）；還沒上＝紅圈空心（時段還留著）',
     /\.mtk-lv\.mtk-booked \.mtk-shdot\{background:#fff;border:2\.5px solid var\(--danger,#b5372e\);\}/.test(CSS));
  /* 2026-08-30：已結課那一顆多帶一個 mtk-lv-ns（未到場＝金點），mtk-lv 仍在 */
  ok('★★ 兩種教練請假狀態都掛上 mtk-lv',
     /class="mtk mtk-used mtk-clvatt mtk-lv\$\{ns\?' mtk-lv-ns':''\}"/.test(src)
     && /\$\{clv\}\$\{clv\?' mtk-lv':''\}/.test(src));
  ok('★★ 色點的底色＝--tk-acc（每張票的課種色，圓點本來就吃它）',
     /\.mtk-shdot\{width:12px;height:12px;border-radius:999px;flex:none;box-sizing:border-box;\s*\n\s*background:var\(--tk-acc,#1F6F54\);\}/.test(CSS));
  ok('★★ 原本的狀態語彙原封不動搬到色點上（不是只剩一種點）',
     /\.mtk-booked \.mtk-shdot\{background:#fff;border:2\.5px solid color-mix\(in srgb,var\(--tk-acc,#1F6F54\) 52%,#d8d2c6\);\}/.test(CSS)
     && /\.mtk-leave \.mtk-shdot,\.mtk-eaten \.mtk-shdot\{background:var\(--danger,#b5372e\);\}/.test(CSS)
     && /\.mtk-cleave \.mtk-shdot\{background:#fff;border:2\.5px solid var\(--danger,#b5372e\);\}/.test(CSS));
  ok('　 空心的邊色算式與原本的圓環一字不差（同一個語彙，不是另調一個色）',
     (CSS.match(/border:2(\.5)?px solid color-mix\(in srgb,var\(--tk-acc,#1F6F54\) 52%,#d8d2c6\)/g)||[]).length>=2);
}

console.log('\n③ 金框退場，而且退乾淨');
{
  ok('★★ .mtk-sh 不再有金色 box-shadow',
     !/\.mtk-sh\{[^}]*box-shadow:0 0 0 2px var\(--gold/.test(CSS));
  ok('★★ 只留 position:relative（流星／金點／場地徽章都靠它定位）',
     /\.mtk-sh\{position:relative;\}/.test(CSS));
  ok('★★ 三次改法的來龍去脈寫在原地（不要再回頭換第四種顏色）',
     /三次都在解同一個問題：\s*\n\s*「哪幾顆不是持有人用的」；前兩次都只用一個視覺屬性（大小、外框）去講，\s*\n\s*所以講不出「是誰」。第三次改成直接寫名字。/.test(src));
}

console.log('\n④ 權重：這一段一定要排在那三條之後（同分時後面的贏）');
{
  const at=k=>CSS.indexOf(k);
  /* 2026-08-28：教練請假那組（.mtk-lv）與共享票共用同一塊排版，選擇器合併寫 */
  ok('★★ 排在 .mtk-used.mtk-leave 之後（0,2,0 同分，否則被蓋回紅圓）',
     at('.mtk-used.mtk-leave,.mtk-used.mtk-eaten{') < at('.mtk.mtk-sh,.mtk.mtk-lv{'));
  ok('★★ 排在 .mtk.mtk-cur 之後（0,2,0 同分，否則綠框畫在方卡上）',
     at('.mtk.mtk-cur{') < at('.mtk.mtk-sh,.mtk.mtk-lv{'));
  ok('★★ 排在 .mtk.mtk-self::after 之後',
     at('.mtk.mtk-self::after{') < at('.mtk.mtk-sh.mtk-self::after{'));
  ok('★★ 踩過的坑寫在原地', /同權重時後面的贏，寫在前面會被那三條蓋回圓形/.test(src));
}

console.log('\n⑤ 其他標記都還在，只是換了位置');
{
  ok('★★ 「本堂」還看得出來（流星換成色點套綠環，同一組綠）',
     /\.mtk-sh\.mtk-cur \.mtk-shdot,\.mtk-lv\.mtk-cur \.mtk-shdot\{box-shadow:0 0 0 3px rgba\(31,111,84,\.34\);\}/.test(CSS)
     && /\.mtk\.mtk-sh\.mtk-cur,\.mtk\.mtk-lv\.mtk-cur\{box-shadow:none;border:none;\}/.test(CSS)
     && /圓環流星畫在方形卡上會歪掉/.test(src));
  ok('★★ 場地徽章（跑／教）沒被蓋掉，改排成最後一行',
     /\.mtk-sh \.mtk-venue,\.mtk-lv \.mtk-venue\{position:static;transform:none;display:block;/.test(CSS));
  ok('★★ 「會員自行預約」的金點還在，只是貼到色點右上',
     /\.mtk\.mtk-sh\.mtk-self::after\{top:-2px;right:calc\(50% - 11px\);/.test(CSS));
  ok('★ 迷你卡與六欄格線版都有各自的收斂（不會被壓扁）',
     /\.tkm-dots \.mtk\.mtk-sh,\.tkm-dots \.mtk\.mtk-lv\{min-width:34px;/.test(CSS)
     && /\.mck-dots6 \.mtk\.mtk-sh,\.mck-dots6 \.mtk\.mtk-lv\{aspect-ratio:auto;/.test(CSS));
  ok('★★ title 一個字都沒改（誰預約的原本就寫在 title 裡，現在畫面上也看得到）',
     /\$\{b&&b\._shName\?'　·　'\+b\._shName\+' 預約':''\}/.test(src)
     && /\$\{b\._shName\?'　·　'\+b\._shName\+' 預約':''\}/.test(src));
  ok('★★ 掛 .mtk-sh 的條件沒動（_shBy 由 _shMark 掛，只在會員資料→票券那一頁）',
     /const shc=\(\(b&&b\._shBy\)\?' mtk-sh':''\)\+_ownCls\(b\);/.test(src)
     && /const shc2=\(\(b&&b\._shBy\)\?' mtk-sh':''\)\+_ownCls\(b\);/.test(src)
     && /return Object\.assign\(\{\},b,\{_shBy:'享',_shName:nm\|\|'共享對象'\}\);/.test(src));
  ok('★ 可點的紅虛線點（校正入口）沒被動到',
     /mtkOverAsk\('\$\{t\.id\}','\$\{b\.id\}'\)/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
