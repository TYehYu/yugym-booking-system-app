/* 密集課卡優化（2026-09-03 使用者指示）
   「先做1 4　教練用圓章＋教練色[RA][SA]　2出席章改到課卡靠上置中 時間靠右置上　3不變」

   ① 整點卡不印時間 —— 卡片的垂直位置本來就對齊左側時間軸，一整列同鐘點的卡
      都印著同一個數字，那是重複資訊；同時段十幾張並排時，它吃掉的正是姓名的空間。
   ② 出席章靠上置中、時間靠右置上。
   ③（課程色條）使用者指定不動。
   ④ 教練改成圓章＋教練色。

   ⚠ 全部只動 CSS，不動 DOM —— 出席章在 DOM 上包在 .evc-nmrow 裡，
     手機那套（.cag-wk-col）靠它把章排到姓名左邊，搬 DOM 會弄壞手機版。
   ⚠ 寬度相關的判斷一律用 @container 量卡片真實寬度，不要用 wCls（JS 估的）——
     0903 教練標籤那次殘字就是估錯造成的，見 tests/evwidthtest.js。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 時間：看卡片放不放得下，不是看整不整點');
/* 一修：整點卡一律不印時間。使用者看實機後：「有些課卡是不是又變得太乾淨了」——
   大卡片只剩一個名字浮在中間。
   二修的關鍵推論：時間現在是絕對定位在頂列，而頂列本來就為了出席章存在
   （.evc-txt 讓出 22px）→ 在寬卡上印時間是**免費的**，一修的理由已經不成立。
   改成三段（門檻全部由 @container 量真實寬度）：
     ≥88px      章置中＋時間靠右，兩者都印
     62–87px    整點省略時間（重複資訊，這個寬度才真的有壓力）；非整點保留，章讓到左邊
     ≤61px      兩樣擺不下 → 時間讓位、章回到置中 */
ok('★★★ 判斷字串就好（start_time 是 HH:MM 文字，不必換算分鐘）',
   /const onHour = \/:00\$\/\.test\(String\(b\.start_time\|\|''\)\);/.test(src));
ok('★★★ class 掛在卡片上', /\$\{wCls\}\$\{onHour\?' ev-onhour':''\}/.test(src));
ok('★★★ 不再無條件藏整點卡的時間（寬卡要印）',
   !/^\s*\.cal-ev\.cal-ev-std\.ev-onhour \.evc-time\{ display:none; \}$/m.test(
     src.split('@container (max-width:87px)')[0]));
ok('★★★ 62–87px：整點省略時間、非整點的章讓到左邊',
   /@container \(max-width:87px\)\{\s*\n\s*\.cal-ev\.cal-ev-std\.ev-onhour \.evc-time\{ display:none; \}\s*\n\s*\.cal-ev\.cal-ev-std:not\(\.ev-onhour\) \.evc-check\{ left:9px; transform:none; \}\s*\n\s*\}/.test(src));
ok('★★★ 88px 這個門檻是算出來的，算式寫在原地',
   /卡寬\/2\+8 ≤ 卡寬-36 → 卡寬 ≥ 88/.test(src));
ok('★★★ 二修的推論寫在原地（在寬卡上印時間是免費的）',
   /在寬卡上「印時間」是\*\*免費的\*\*，不再吃掉姓名任何空間/.test(src)
   && /有些課卡是不是又變得太乾淨了/.test(src));
ok('★★★ 兩個 @container 區塊的順序有意義（61px 那塊要在後面）',
   src.indexOf('@container (max-width:87px)') < src.indexOf('@container (max-width:61px)')
   && /61px 那塊一定要在 87px 那塊後面/.test(src));

console.log('\n② 出席章靠上置中、時間靠右置上');
ok('★★★ 章：絕對定位、頂端、水平置中',
   /\.cal-ev\.cal-ev-std \.evc-check\{ position:absolute; top:3px; left:50%; transform:translateX\(-50%\);/.test(src));
ok('★★★ 時間：絕對定位、頂端靠右',
   /\.cal-ev\.cal-ev-std \.evc-time\{ position:absolute; top:3px; right:6px; z-index:3;/.test(src));
ok('★★★ .evc-txt 讓出頂列高度（不讓的話姓名會被壓在章底下）',
   /\.cal-ev\.cal-ev-std \.evc-txt\{ padding-top:22px !important; \}/.test(src));
/* 有時間的卡（非整點）章要讓開，否則兩個都擠在中間偏右。
   左緣 9px 沿用 0823：課程色條 5px＋間距 4px，不然章會壓在色條上。 */
ok('★★★ 章的預設是置中（讓到左邊只在 62–87px 那一段）',
   /\.cal-ev\.cal-ev-std \.evc-check\{ position:absolute; top:3px; left:50%; transform:translateX\(-50%\);/.test(src)
   && /@container \(max-width:87px\)\{[\s\S]{0,220}?:not\(\.ev-onhour\) \.evc-check\{ left:9px; transform:none; \}/.test(src));
ok('★★ 不動 DOM 的理由寫在原地（手機那套靠 .evc-nmrow）',
   /章在 DOM 上包在 \.evc-nmrow 裡（手機那套靠它\s*\n?\s*把章排到姓名左邊），搬 DOM 會弄壞手機版/.test(src));

console.log('\n③ 極窄卡：時間讓位，不是章讓位');
ok('★★★ 61px 以下藏時間（不論整不整點）',
   /@container \(max-width:61px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-time\{ display:none; \}/.test(src));
ok('★★★ 時間藏掉後章回到置中（不然它還停在讓位的左邊）',
   /@container \(max-width:61px\)\{[\s\S]{0,200}?\.cal-ev\.cal-ev-std:not\(\.ev-onhour\) \.evc-check\{ left:50%; transform:translateX\(-50%\); \}/.test(src));
ok('★★★ 讓的是時間不是章，理由寫在原地',
   /反過來藏章就不行 —— 有沒有簽到看不出替代線索/.test(src)
   && /非整點的卡本來就落在半點虛線上，垂直位置已經說明它是 :30/.test(src));
ok('★★ 用 @container 不用 wCls，理由寫在原地',
   /門檻一律用 @container 量卡片真實寬度，不要用 wCls —— wCls 是\s*\n?\s*\(innerWidth-80\)\/nDays\/lane 估的/.test(src)
   && /這裡的三段判斷全部踩在同一個地雷上，一定要量真的/.test(src));

console.log('\n④ 教練圓章＋教練色');
ok('★★★ 窄卡的教練是固定 20px 正圓（padding 歸零，不是靠內距撐的膠囊）',
   /\.cal-ev\.cal-ev-std \.evc-coach:not\(\.evc-leavetag\)\{\s*\n\s*width:20px;height:20px;padding:0;flex:none;border-radius:50%;/.test(src));
ok('★★★ 圓章在 90px 以下生效（寬卡維持全名膠囊）',
   /@container \(max-width:90px\)\{[\s\S]{0,400}?\.cal-ev\.cal-ev-std \.evc-coach:not\(\.evc-leavetag\)\{/.test(src));
/* 改成圓章之後任何寬度都放得下 —— 所以原本「70px 以下整個藏起來」那條可以拿掉，
   教練是掃描時很常用的線索，能留就留。 */
ok('★★★ 不再有「70px 以下藏教練」那條',
   !/@container \(max-width:70px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-coach\{display:none;\}/.test(src));
ok('★★★ 「請假」排除在外（兩個字塞不進 20px 圓）',
   /:not\(\.evc-leavetag\)/.test(src)
   && /「請假」那顆也吃這條（它同樣是 \.evc-coach）—— 兩個字塞不進 20px 圓/.test(src));
ok('★★ 顏色沿用 renderCalendar 寫的 inline background（與教練篩選 chip 同一組色）',
   /顏色沿用 renderCalendar 寫在元素上的 inline background（每位教練一色），/.test(src));

console.log('\n⑤ 使用者指定不動的那一項');
/* 「3不變」＝課程左色條維持原樣，不要「順手」一起改。 */
ok('★★ 課程左色條沒被動到（.evc-body::before 仍是 5px 實色）',
   /\.cal-ev\.cal-ev-std \.evc-body::before,\s*\n\.tcard\.tcard-std \.tcard-body::before\{ content:''; position:absolute; left:0; top:0; bottom:0; width:5px;/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
