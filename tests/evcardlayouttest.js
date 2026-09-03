/* 行事曆課卡的版面（2026-09-03 使用者附截圖定版）

   「這邊可以看到幾種課卡 分成橫式跟直式 幫我把重要資料都往卡片置中擺
     依序是 時間 會員 教練 場地
     如果擺不下資訊的卡片 統一只留下會員姓名在中間 教練姓名縮寫 場地縮寫
     場地如果是史密斯訓練架不顯示」
   「[NEW][PAY] 可以顯示在課卡第一列靠右 不用做成標籤 用細線外框」

   ⚠ 同一天這張卡改過五輪（出席章位置 → 章移除 → 時間三段 → 置中四段 → 標籤進第一列）。
     每一輪都用 Playwright 對真實 CSS 量過，最後一輪掃了 488 種
     「寬度 × 高度 × 標籤組合 × 姓名長度」，全部不重疊、不溢出、不出界、姓名一定在。
   ⚠ 尺寸判斷一律 @container 量卡片真實寬高（.cal-ev-std 有 container-type:size），
     不要用 wCls —— 那是 (innerWidth-80)/nDays/lane 估的，0903 教練標籤殘字就是它造成的。
   ⚠ 只動 CSS 與一層包裝，手機那兩套（.cag-wk-col／.admcag）用 display:contents 讓包裝透明。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 置中，依序 時間 → 會員 → 教練 → 場地');
ok('★★★ 整層置中（水平與垂直都是）',
   /\.cal-ev\.cal-ev-std \.evc-txt\{\s*\n\s*align-items:center !important; justify-content:center !important; text-align:center !important;/.test(src));
/* DOM 順序是 時間／姓名／場地／教練 —— 用 order 換成使用者要的順序，不動 DOM，
   因為手機那兩套吃同一份 DOM。 */
ok('★★★ 順序用 CSS order（不動 DOM）',
   /\.cal-ev\.cal-ev-std \.evc-r1\{ order:1;/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-nmrow\{ order:2;/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-coach\{ order:3;/.test(src)
   && /\.cal-ev\.cal-ev-std \.evc-sub\{ order:4;/.test(src));
ok('★★ 不動 DOM 的理由寫在原地',
   /順序用 CSS 的 order，不動 DOM —— DOM 順序是 時間／姓名／場地／教練/.test(src));
/* 左內距只要 6px：課程色條寬 5px，內容從 6px 起算就不會壓到它，左右因此可以對稱。
   靠左版當初留 12px 是為了讓文字離色條遠一點，置中版不需要。 */
ok('★★ 左右內距對稱才是真的置中（6px，剛好讓開 5px 色條）',
   /padding:4px 6px !important; gap:1px !important;/.test(src)
   && /左內距只要 6px：課程色條（\.evc-body::before）寬 5px/.test(src));
ok('★★ 教練回到置中（原本是 margin-top:auto 推到右下）',
   /\.cal-ev\.cal-ev-std \.evc-coach\{ order:3; align-self:center !important; margin-top:0 !important;/.test(src));

console.log('\n② 第一列：時間置中、[NEW][PAY] 靠右');
ok('★★★ 第一列是真的一列（.evc-r1），不是絕對定位的角落',
   /<span class="evc-r1"><span class="evc-time">\$\{b\.start_time\}<\/span>\$\{_tagPay\}\$\{_tagNew\}<\/span>/.test(src));
/* ⚠ 絕對定位在右上角看起來也在「第一列靠右」，但內容是垂直置中的，
   窄卡上姓名會頂到那個角落 —— 實測 90 種組合有 42 種相撞。 */
ok('★★★ 為什麼不能用絕對定位，寫在原地（附實測數字）',
   /實測 90 種組合有 42 種相撞/.test(src));
ok('★★★ 用 grid 1fr auto 1fr：時間永遠在卡片正中央，不因右邊有無標籤而晃',
   /\.cal-ev\.cal-ev-std \.evc-r1\{ order:1; display:grid; align-items:center;\s*\n\s*grid-template-columns:1fr auto 1fr;/.test(src)
   && /不會因為右邊有沒有標籤而左右晃動（用 flex \+ space-between 就會晃）/.test(src));
ok('★★ 兩個標籤並排在同一格（各自 justify-self:end 會疊在一起）',
   /\.cal-ev\.cal-ev-std\.ev-has-new\.ev-has-pay \.evc-r1\{ grid-template-columns:1fr auto auto auto; \}/.test(src));
ok('★★★ 細線外框，不是實色標籤',
   /background:transparent;border:1px solid currentColor;\}/.test(src)
   && /\.cal-ev\.cal-ev-std \.ev-tag-new\{color:var\(--gold-d,#b48a56\);\}/.test(src)
   && /\.cal-ev\.cal-ev-std \.ev-tag-pay\{color:var\(--danger,#b5372e\);\}/.test(src));
ok('★★ 為什麼改外框，寫在原地',
   /實色標籤在一整片課卡上是兩塊高飽和色塊，比課卡本身還搶眼/.test(src));
ok('★★ 標籤文字是大寫 NEW／PAY', />NEW<\/span>/.test(src) && />PAY<\/span>/.test(src));
/* :empty 收不掉那一列 —— r1 永遠含著 .evc-time 節點，只是被 display:none。 */
ok('★★ 沒有用失效的 :empty 去收那一列，理由寫在原地',
   !/\.evc-r1:empty/.test(src)
   && /\.evc-r1 永遠含著 \.evc-time 那個節點，\s*\n?\s*只是被 display:none，:empty 不會成立/.test(src));

console.log('\n③ 擺不下：只留 會員姓名（置中）＋ 教練縮寫 ＋ 場地縮寫');
ok('★★★ 寬高任一邊不夠就算擺不下（用 or 不是 and）',
   /@container \(max-width:104px\) or \(max-height:58px\)\{/.test(src));
ok('★★★ 讓位的是時間（四項裡唯一有替代線索的）',
   /@container \(max-width:104px\) or \(max-height:58px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-time\{ display:none; \}/.test(src)
   && /卡片的垂直位置本來就對齊左側時間軸，時間是四項裡唯一\s*\n?\s*有替代線索的/.test(src));
ok('★★★ 教練換縮寫、場地換縮寫',
   /\.cal-ev\.cal-ev-std \.co-fl\{ display:none; \}\s*\n\s*\.cal-ev\.cal-ev-std \.co-ab\{ display:inline; \}\s*\n\s*\.cal-ev\.cal-ev-std \.vn-fl\{ display:none; \}\s*\n\s*\.cal-ev\.cal-ev-std \.vn-ab\{ display:inline; \}/.test(src));
ok('★★ 教練縮寫是 20px 正圓章＋教練色（使用者：「教練用圓章＋教練色[RA][SA]」）',
   /\.cal-ev\.cal-ev-std \.evc-coach:not\(\.evc-leavetag\)\{\s*\n\s*width:20px;height:20px;padding:0;flex:none;border-radius:50%;/.test(src));
ok('★★ 「請假」排除在圓章之外（兩個字塞不進 20px）', /:not\(\.evc-leavetag\)/.test(src));
ok('★★★ 只留一套門檻（原本 90px 那組已併入，兩套會互相打架）',
   !/@container \(max-width:90px\)\{/.test(src)
   && /使用者把三件事（時間讓位、教練縮寫、場地縮寫）綁在同一個「擺不下」的判斷上/.test(src));

console.log('\n④ 場地：縮寫與「史密斯訓練架不顯示」');
ok('★★★ 全名與縮寫兩份都畫出來，由 CSS 挑一個',
   /<span class="vn-fl">\$\{_selfVenue\}<\/span><span class="vn-ab">\$\{_VEN_AB\[_selfVenue\]\|\|_selfVenue\.slice\(0,1\)\}<\/span>/.test(src)
   && /const _VEN_AB=\{'跑步機':'跑','教室':'教'\};/.test(src));
ok('★★ 預設隱藏縮寫（寬卡顯示全名）', /\.vn-ab\{ display:none; \}/.test(src));
/* 史密斯訓練架不顯示這件事本來就成立 —— selfVenueLabel 對 multi_* 回空字串。 */
ok('★★★ 史密斯訓練架本來就不顯示（selfVenueLabel 對 multi 回空字串）',
   /if\(u\.startsWith\('multi'\)\) return '';/.test(src)
   && /selfVenueLabel 對 multi_\* 回空字串/.test(src));
ok('★★ 為什麼不用省略號，寫在原地',
   /原本靠 CSS 省略號會切成「教…」「跑…」，\s*\n?\s*一個殘字加一個點，比單字還長也更難認/.test(src));

console.log('\n⑤ 矮卡改橫排（30／45 分鐘的課）');
ok('★★★ 高度不足就轉九十度，姓名與教練圓章併一列',
   /@container \(max-height:58px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-txt\{\s*\n\s*flex-direction:row !important;/.test(src));
ok('★★★ 門檻 58 是算出來的（SLOT_PX 34 → 30分34／45分51／60分68）',
   /門檻取 58：SLOT_PX 是 34，所以 30 分鐘的卡約 34px、45 分鐘約 51px、\s*\n?\s*60 分鐘約 68px/.test(src)
   && /先試過 44 與 47，都只蓋到 30 分鐘那一段/.test(src));
ok('★★ 橫排時第一列不自成一列（display:contents），標籤排到最後',
   /\.cal-ev\.cal-ev-std \.evc-r1\{ display:contents; \}\s*\n\s*\.cal-ev\.cal-ev-std \.evc-r1 \.ev-tag2\{ order:5; \}/.test(src));
ok('★★★ 橫排時姓名要能被壓縮（line-clamp 會撐出不肯縮的最小寬度）',
   /\.cal-ev\.cal-ev-std \.evc-name\{ display:block !important; overflow:hidden;\s*\n\s*text-overflow:ellipsis; flex:0 1 auto; min-width:0; \}/.test(src));
ok('★★ 又矮又窄時標籤讓位，姓名留下（姓名是使用者指定「統一只留下」的那一項）',
   /@container \(max-width:96px\) and \(max-height:58px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.ev-tag2\{ display:none; \}/.test(src)
   && /讓的是標籤不是姓名：姓名是使用者指定「統一只留下」的那一項/.test(src));
ok('★★ 極窄卡姓名收到 11px（13px 下三個中文字一定折兩行，兩行會把高度撐爆）',
   /@container \(max-width:66px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-name\{ font-size:11px !important; \}/.test(src)
   && /收的是字級不是行數：0725 定過「窄卡姓名折兩行、不要切成…」/.test(src));

console.log('\n⑥ 手機那兩套不受影響');
ok('★★★ .evc-r1 在手機版當作不存在（display:contents）',
   /\.cag-wk-col \.cal-ev\.cal-ev-std \.evc-r1,\s*\n\.admcag\.cal-ev-std \.evc-r1\{display:contents;\}/.test(src));
ok('★★ 理由寫在原地', /用 display:contents 讓那層包裝在這裡不存在，版面與改版前完全相同/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
