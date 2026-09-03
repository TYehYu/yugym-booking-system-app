/* 首頁課卡 165px 的寬度帳（2026-09-03）

   使用者附截圖：「首頁有一張課卡的場地被縮寫了 但應該還有空間可以完整顯示才對」
   —— 卡片上是「史密斯訓…」。

   用 Playwright 對真實 CSS 實測（不是估的）：中欄只有 62.6px，場地要 66px，差 3.4px。
   兇手是**同一天稍早**那筆改動：續約徽章（.ev-payalert）本來絕對定位在角落不佔空間，
   0903 為了不遮住時間，改成跟時間並排進 .t3-top，那 14+4px 就直接從中欄扣走了。
   卡片註解裡算的「中欄仍有 ~72px」是改徽章**之前**的帳，沒跟上。

   ⚠ 最吃緊的不是有徽章的卡，是**教練名字最寬**的那張（MANGO）——
     .t3-side 取「時間列」與「教練標籤」的較大者，MANGO 那顆比時間列還寬，
     所以光縮徽章對它一點用都沒有。四項一起改才夠（實測 60 種組合全過，
     最吃緊的 MANGO 還有 5.6px 餘裕）。

   這支測試守的是**那四個數字不要被某次改動悄悄改回去**，
   以及那筆帳的說明還留在原地 —— 純靜態檢查，不跑瀏覽器。
   ⚠ 下次要再往這張卡加東西（徽章、圖示、標籤），先把這筆帳重算一遍，
     然後回來改這裡的期望值。這已經是第二次「加了一樣東西、把別人擠掉、
     過幾天才被使用者看見」。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 卡片本身的尺寸沒變（整筆帳都是以它為前提）');
ok('★★★ 卡片仍是 165px', /\.tcard\.tcard-std\{width:165px;min-height:98px;\}/.test(src));
ok('★★ 三欄格線：左章 auto ／ 中欄可壓縮 ／ 右欄 auto',
   /\.tcard-std \.tcard-txt\.tcard-3c\{display:grid;grid-template-columns:auto minmax\(0,1fr\) auto;/.test(src));
ok('★★ 中欄要 min-width:0 才壓得下去（不然 grid 子項會撐開）',
   /\.tcard-3c \.t3-main\{min-width:0;/.test(src));

console.log('\n② 四項省下來的寬度，一項都不能被改回去');
ok('★★★ ①欄距 6→5（兩道 gap 共省 2px）',
   /\.tcard-std \.tcard-txt\.tcard-3c\{[\s\S]{0,140}?gap:0 5px;/.test(src));
ok('★★★ ②徽章 14→12px、間距 4→3（時間列窄 3px）',
   /\.tcard-3c \.t3-top\{display:inline-flex;align-items:center;gap:3px;/.test(src)
   && /\.tcard-3c \.ev-payalert\{position:static;top:auto;right:auto;width:12px;height:12px;/.test(src));
ok('★★★ ③教練標籤內距 7→5（教練那顆窄 4px）',
   /\.tcard-3c \.tcard-co\{[\s\S]{0,120}?padding:2px 5px;\}/.test(src));
ok('★★★ ④場地字級 11→10.5px（需求從 66 降到 63px）',
   /\.tcard-3c \.t3-venue\{opacity:\.7;font-size:10\.5px;\}/.test(src));

console.log('\n③ 場地是「一整列」，不是接在課程名後面');
/* 0822 使用者更正過：場地跟課程名擠同一列，「教練課・史密斯訓練架」一定會被截掉，
   兩個都看不全。所以場地必須是自己一列 —— 那是這筆寬度帳成立的前提。 */
ok('★★★ 場地自成第二列',
   /<span class="t3-l1 t3-venue">\$\{\(typeof venueDisplay==='function'\)\?\(venueDisplay\(b\)\|\|''\):''\}<\/span>/.test(src));
ok('★★ 為什麼要獨立成一列，寫在原地',
   /場地獨立成第二列（2026-08-22 使用者更正）/.test(src));
ok('★★ 課卡用完整場地名（0903 使用者定案，不縮寫）',
   /日後真的遇到塞不下的地方，縮寫叫「訓練架」（使用者指定），到時再加/.test(src));

console.log('\n④ 這筆帳的說明要留在原地');
ok('★★★ 記下量到的數字與差多少',
   /中欄只有 62\.6px，場地要 66px —— 差 3\.4px/.test(src));
ok('★★★ 記下真兇是同日稍早那筆徽章改動',
   /0903 為了不遮住時間改成跟時間並排進 \.t3-top，那 14\+4px 就直接\s*\n\s*從中欄扣走了/.test(src));
ok('★★★ 記下「最吃緊的是教練名最寬那張，縮徽章對它沒用」',
   /最吃緊的不是有徽章的卡，是\*\*教練名字最寬\*\*的那張（MANGO）/.test(src));
ok('★★ 記下實測範圍（十位教練全過、餘裕 5.6px）',
   /全部完整，最吃緊的 MANGO 還有 5\.6px 餘裕/.test(src));
ok('★★★ 留下給下一個人的提醒（再加東西要先重算）',
   /下次再往這張卡加任何東西（徽章、圖示、標籤），先回來把這筆帳重算一遍/.test(src));
/* 舊註解算的「中欄仍有 ~72px」是改徽章**之前**的帳。
   它現在只該以「這句是錯的」的身分出現一次 —— 被引用來說明為什麼會出事。
   如果哪天它又變回一句沒有標註的斷言，下一個人就會照著它算，然後再擠掉一次。 */
{
  const hits=(src.match(/中欄仍有 ~72px/g)||[]).length;
  ok('★★★ 過期的舊帳只以「被推翻」的身分出現，不是還在生效的斷言',
     hits===1 && /「中欄仍有 ~72px」是\*\*改徽章之前\*\*的帳，沒跟上/.test(src), {出現次數:hits});
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
