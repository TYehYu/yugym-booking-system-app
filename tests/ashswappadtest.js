/* 「其他方案 ›」的留位只能留在它壓到的那一行（2026-08-31 使用者回報，附截圖）

   「念恩這張簡易課卡的會員卡　右上角的備註怎麼歪掉了」
   「然後一列的圓形卡沒有8個？」

   —— 兩個症狀同一個原因。0829 為了讓右下角絕對定位的「其他方案 ›」不壓到內容，
   加了 `.ash-has-swap .ash-mmain{padding-right:78px}`，但那是**整個內容區**：
     ・姓名列跟著縮 → 右上角「＋ 備註」沒有貼齊卡片右緣（實測差 92px，正常是 14px）
     ・圓點容器也縮：357 → 279px。8 顆需要 8×35+7×5 = 315px，剛好放不下 → 一列只剩 7 顆
   （吳美芳那張沒有「其他方案」，所以看起來正常 —— 只有有換票選項的卡會歪。）

   改成只留在最後那一行（.ash-mop，建立／取消紀錄）。
   實測（410px 手機、真實 CSS）：容器從 279px 回到 357px、備註距右緣從 92px 回到 14px
   （14px ＝ 卡片自己的內距，也就是貼齊了）。
   ⚠ 帶上 gap:5px 之後，357px 一列排得下 9 顆已上完（35px）的圓點 —— 0821 要求的 8 顆過關。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 留位只留在最後那一行');
{
  ok('★★★ padding 掛在 .ash-mop，不是 .ash-mmain',
     /\.ash-has-swap \.ash-mop\{padding-right:78px;\}/.test(src)
     && !/\.ash-has-swap \.ash-mmain\{padding-right:78px;\}/.test(src));
  ok('★★★ 兩個症狀與數字寫在原地（下次有人想改回去看得到代價）',
     /姓名列跟著縮 → 右上角的「＋ 備註」看起來歪掉、沒有貼齊卡片右緣/.test(src)
     && /圓點容器也縮（357→279）→ 8 顆要 315px，剛好放不下，一列只剩 7 顆/.test(src));
  ok('★★ 為什麼 .ash-mop 一定在（單人課才有這顆按鈕，而單人課一定有 _opLine）',
     /單人課才會有這顆，而單人課一定有 \.ash-mop（見 _opLine）/.test(src));
  ok('★★ 換票按鈕仍然是絕對定位貼右下角（沒有順手改掉版型）',
     /\.ash-mswap\{position:absolute;right:13px;bottom:9px;/.test(src));
  ok('★★ has-swap 這個 class 還是照舊掛（判準沒動）',
     /\$\{_hasSwap\?' ash-has-swap':''\}/.test(src));
  ok('★★ _opLine 只有單人課會畫（團課畫在標題卡）',
     /const _opLine=bkIsGroup\(b\)\?'':\(\(\)=>\{/.test(src));
}

console.log('\n② 圓點尺寸與可用寬度的關係（改任一個都要重算）');
{
  const D_USED=35, D_BIG=44, GAP=5;
  ok('★★ 已上完 35px、未上／本堂 44px（0829 定案沒被動到）',
     /\.ash-mcard \.ash-tk \.mtk\.mtk-booked,\s*\n\s*\.ash-mcard \.ash-tk \.mtk\.mtk-free,\s*\n\s*\.ash-mcard \.ash-tk \.mtk\.mtk-cur\{width:44px;height:44px;/.test(src)
     && /\.mtk\{position:relative;width:35px;height:35px;/.test(src)
     && /\.ash-tk\{[^}]*gap:5px;/.test(src));
  const fit=(inner,d)=>Math.max(1, Math.floor((inner+GAP)/(d+GAP)));
  eq('★★★ 修好前 279px：已上完只排得下 7 顆（＝使用者看到的）', fit(279,D_USED), 7);
  eq('★★★ 修好後 357px：已上完排得下 9 顆（超過 0821 要求的 8 顆）', fit(357,D_USED), 9);
  eq('★★ 未上課那種 44px 在 357px 下是 7 顆 —— 手機寬度就是放不下 8 顆 44px（需要 387px）',
     [fit(357,D_BIG), 8*D_BIG+7*GAP], [7,387]);
  eq('　 0821 訂的「一列 8 顆」門檻＝315px，修好後有 357px，過關',
     [8*D_USED+7*GAP, 357>=8*D_USED+7*GAP], [315,true]);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
