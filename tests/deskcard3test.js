/* 桌機首頁課卡改成三欄（2026-08-22 使用者指示）：
   「第一欄出席章，第二欄分三列 課程名稱・使用場地／會員名稱（粗體）／第幾堂/總課堂，
     課卡右上角時間，右下角教練標籤」——與手機雙欄版 .admh2-card 同一種資訊順序。 */
const fs=require('fs'), path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

console.log('三欄結構');
ok('★ 第一欄＝出席章（假／未／簽三種照舊）',
   /<span class="t3-stamp">\$\{\(\(\)=>\{const k=bkStampKind\(b\);/.test(src)
   && /return k==='leave'\?'<span class="tcard-chk tcard-chk-leave">假<\/span>'/.test(src));
/* 0822 更正：場地從「跟課程名擠同一列」改成自己一列（第二列）——
   「教練課・多功能訓練架」這種長度一定會被截掉，兩個都看不全。
   ⚠ 2026-10-29 兩個改動（使用者指示，impeccable 體檢）：
     ① 場地只在**非預設**時才寫（量過：10/28 的 16 張卡有 13 張寫同一個「史密斯訓練架」）。
        判斷走現成的 venueIsNotable()，不另外發明規則。
     ② 票券進度（7/12 堂）從姓名下面搬到**右下角**，原本教練標籤的位子 ——
        它跟右邊的浮水印「本月第幾堂」挨著，兩個都是「第幾堂」卻是不同的東西。
        使用者：「2不能動　但可以把票的進度改到右下角原本教練的位子」。 */
ok('★ 第二欄：課程／（非預設才寫的場地）／會員姓名（粗體）',
   /<span class="t3-l1">\$\{catName\[cc\]\|\|'課程'\}<\/span>\s*\n\s*\$\{\(typeof venueIsNotable==='function' && venueIsNotable\(b\.category, b\.venue_unit\)\)/.test(src)
   && /<span class="t3-l2 tcard-mem\$\{bkNameBlankCls\(b\)\}">\$\{nm\}<\/span>/.test(src)
   /* 2026-10-29 二修：姓名 14.5 → 17.5 → 22px。能放這麼大是因為
      ①場地那一列拿掉了 ②中間那列右邊是空的，姓名框往右多借 22px（框寬 97px）。
      量出來的（見 index.html 的說明）：4 字 88px、6 字 79px，卡高不變。 */
   && /\.tcard-3c \.t3-l2\{font-size:22px;font-weight:800;/.test(src)
   && /\.tcol-cards \.tcard-std \.tcard-3c \.t3-l2\{margin-right:-22px;\}/.test(src));
/* ⚠⚠ 姓名同時掛 .t3-l2 與 .tcard-mem，兩條選擇器權重相同（0,2,0）→ **後面那條贏**。
   1029 第一次只改 .t3-l2，畫面完全沒變，而這支測試照樣綠 —— 因為它只比字串。
   兩條都要釘，而且值要一樣，否則又會出現「改了沒生效」。 */
ok('★★★ 姓名字級兩條都要改（同權重，後面那條才是真正生效的）',
   /\.tcard-std \.tcard-mem\{font-size:22px;font-weight:800;\}/.test(src));
ok('★★  兩條的值一致（不一致＝畫面吃後面那條，前面那條是假的）', (()=>{
   const a=/\.tcard-3c \.t3-l2\{font-size:([\d.]+)px/.exec(src);
   const b=/\.tcard-std \.tcard-mem\{font-size:([\d.]+)px/.exec(src);
   return !!(a&&b&&a[1]===b[1]);
})());
ok('★★ 場地的判斷用現成那一支，不要在課卡裡另外寫一條規則',
   /function venueIsNotable\(category, unit\)\{/.test(src)
   && !/<span class="t3-l1 t3-venue">\$\{\(typeof venueDisplay==='function'\)\?\(venueDisplay\(b\)\|\|''\):''\}<\/span>\s*\n\s*<span class="t3-l2/.test(src));
/* 2026-09-03：時間那一格多包一層 .t3-top —— 續約／繳費徽章改成與時間並排
   （原本絕對定位在右上角，正好蓋住時間最後一位數字，見 lastmarktest）。 */
/* 2026-10-29：右欄從兩格變三格 —— 時間（上）／票券進度（中）／教練標籤（下）。
   直欄版把教練標籤關掉，space-between 就讓進度落到右下角。 */
ok('★ 右上時間、右下票券進度，教練標籤仍在（橫排版與行事曆要用）',
   /<span class="t3-side"><span class="t3-top">\$\{_mk\}<span class="tcard-time">\$\{b\.start_time\}<\/span><\/span><span class="t3-l3">/.test(src)
   && /<span class="t3-co">\$\{_tagOut\}\$\{coTag\}<\/span><\/span>/.test(src)
   && /\.tcard-3c \.t3-side\{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;/.test(src));
ok('★★ 教練標籤只在**直欄版**不畫（橫排版 .tcard-row 與行事曆不受影響）',
   /\.tcol-cards \.tcard-std \.t3-co\{display:none;\}/.test(src)
   && !/^\.tcard-3c \.t3-co\{display:none/m.test(src));
ok('　　進度搬到右欄之後要靠右、不換行',
   /\.tcard-3c \.t3-l3\{font-size:10\.5px;font-family:var\(--num\);opacity:\.72;\n\s*text-align:right;white-space:nowrap;\}/.test(src));
ok('★★ ⚠ 舊規則把時間釘在左上（.tcard-std .tcard-time{align-self:flex-start}），三欄版要覆蓋掉',
   /\.tcard-3c \.tcard-time\{align-self:flex-end !important;\}/.test(src)
   && /三欄版要靠右，否則時間會停在右欄的左緣、跟教練標籤對不齊/.test(src));
/* 120→190（0822 三欄排法）→165（0823 使用者要求再窄一點）。
   收窄的底線：中欄要留 ~76px 給場地「多功能訓練架」，再窄就會先切到那一列。 */
ok('★ 卡片 165px（120 放不下章＋三列＋時間／教練；190 是使用者嫌太寬的那一版）',
   /\.tcard\.tcard-std\{width:165px;min-height:98px;\}/.test(src)
   && /190px 是「課程名不必馬上截斷、一列仍放得下 4～5 張」的折衷/.test(src)
   && /再往下收就會先切到場地那一列/.test(src));
ok('　　長文字截斷而不是撐爆卡片',
   /\.tcard-3c \.t3-l1\{[^}]*text-overflow:ellipsis;\}/.test(src)
   && /\.tcard-3c \.t3-l2\{[^}]*text-overflow:ellipsis;\}/.test(src));
ok('　　自成一套 class（不共用 .admh2-card 那組，兩邊不互相牽動）',
   /但那組 class 綁在\s*\n?\s*\.admh2-card 底下，這裡自成一套/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
