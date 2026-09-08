/* 挑選視窗（#adp-sheet）2026-09-08 兩件事：
   ①「這個視窗改成兩欄　教練課 團體課 運動按摩一欄　自主訓練 團課體驗 自訂方案一欄」
   ②「視窗固定靠上」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 兩欄');
{
  /* 清單的順序就是分欄的依據，所以直接把它抽出來核對 */
  const L=new Function('return '+g('const SL_COURSES=[','];').replace(/^const SL_COURSES=/,'').replace(/;$/,''))();
  eq('★★★ 清單順序就是使用者指定的分欄（先填左欄三個，再填右欄三個）',
     L.map(c=>c.name), ['教練課','團體課','運動按摩','自主訓練','團課體驗','自訂']);
  ok('★★★ 用 grid「先填滿一欄再換下一欄」，不把清單拆成兩份',
     /grid-template-rows:repeat\(3,auto\);\s*\n?\s*grid-auto-flow:column;/.test(src)
     && /不必把清單拆成兩份/.test(src));
  ok('★★ 拆兩份的代價寫在原地（日後加一項要記得加在對的那一半）',
     /日後加一項就要記得加在對的那一半/.test(src));
  ok('★★★ .ash-eirow 自己的 margin-bottom 在 grid 裡會跟 gap 疊起來 → 歸零改吃 gap',
     /\.adp-2col>\.ash-eirow\{margin-bottom:0;/.test(src));
  ok('★★ 兩欄要加寬，不然 340px 兩欄各 155px 放不下副標',
     /#adp-sheet \.adp-box\.adp-box-2c\{width:min\(560px,94vw\);\}/.test(src));
  ok('★★★ 窄畫面收回一欄',
     /@media\(max-width:520px\)\{\s*\n\s*\.adp-2col\{grid-template-columns:1fr;grid-template-rows:none;grid-auto-flow:row;\}/.test(src));
  ok('★★ 六張卡等高（一欄三張，右欄副標長度不同會撐開）',
     /\.adp-2col>\.ash-eirow\{margin-bottom:0;height:100%;/.test(src)
     && /align-items:stretch;/.test(src));
  ok('　　容器真的套在課程清單上', /<div class="adp-2col">/.test(src)
     && /class="adp-box adp-box-2c"/.test(src));
}

console.log('\n② 視窗靠上');
ok('★★★ 改成靠上，不再垂直置中',
   /#adp-sheet \.adp-box\{position:absolute;left:50%;top:6vh;transform:translateX\(-50%\);/.test(src)
   && !/#adp-sheet \.adp-box\{position:absolute;left:50%;top:50%;transform:translate\(-50%,-50%\);/.test(src));
ok('★★★ 只動挑選視窗；一般 .modal 維持垂直置中（0729 使用者回報後定的，別順手推翻）',
   /只動 #adp-sheet 這一組挑選視窗。一般 \.modal 維持垂直置中/.test(src)
   && /預約明細沒有置中/.test(src));
ok('★★★ 靠上之後高度要自己管：太高就自己捲，不要溢出畫面外',
   /max-height:88vh;overflow-y:auto;overscroll-behavior:contain;/.test(src));
ok('★★ 原因寫在原地（連著開好幾層，置中會讓標題每次落在不同高度）',
   /挑選視窗是連著開好幾層的（挑課程 → 挑方案 → 挑日期）/.test(src));
ok('　　原本寫在 HTML 上的 max-height 改由 CSS 統一管（不要兩個地方各寫一次）',
   !/class="adp-box" style="max-height:86vh;overflow-y:auto;"/.test(src));

console.log('\n③ 簽約視窗（2026-09-08 使用者：「這個視窗也採用同樣規格」）');
ok('★★★ 寬視窗也靠上（多步驟，每一步高度差很多）',
   /\.modal-bg:has\(>\.modal-wide\)\{align-items:flex-start;\}/.test(src));
ok('★★★ 只吃 .modal-wide，其他視窗維持垂直置中',
   /只吃 \.modal-wide；其他視窗維持垂直置中（0729 使用者回報後定的）/.test(src)
   && /\.modal-bg\{position:fixed;inset:0;background:rgba\(20,18,14,0\.55\);display:flex;align-items:center;/.test(src));
ok('★★ 用 align-items 改，不動 .modal 自己的 max-height 與捲動',
   /用 align-items 而不是改 \.modal 的定位/.test(src));

console.log('\n④ 方案卡右側的類型浮水印');
ok('★★★ 規格照抄首頁課卡的 .tcard-seq（靠右、垂直置中、大字、低透明度）',
   /\.gt-c2-seq\{position:absolute;right:8px;top:50%;transform:translateY\(-50%\);/.test(src)
   && /\.tcard-std \.tcard-seq\{position:absolute;right:8px;top:50%;transform:translateY\(-50%\);/.test(src));
ok('★★★ 字串用 slotLabelOf 算好的那一份，不在卡片裡另外判「名字有沒有友善」',
   /<span class="gt-c2-seq" aria-hidden="true">\$\{slotLabel\}<\/span>/.test(src)
   && /那種判法 0718 就出過錯（友善課被當成一般教練課）/.test(src));
ok('★★★ 是背景不是標籤：不能吃掉點卡片的動作',
   /\.gt-c2-seq\{[\s\S]{0,200}pointer-events:none;user-select:none;/.test(src));
ok('★★★ 卡片要 position:relative，否則會定位到更外面的祖先',
   /\.gt-card\.gt-card2\{position:relative;overflow:hidden;\}/.test(src));
ok('★★ 內容要壓在浮水印上面（z-index 分層）',
   /\.gt-card\.gt-card2>\*:not\(\.gt-c2-seq\)\{position:relative;z-index:1;\}/.test(src));
ok('★★ 文字比數字長 → 字級小一階、寬度封頂再截斷（「友善優惠」不會頂到價格）',
   /max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\}/.test(src));
ok('★★ 選中的那張浮水印再明顯一點', /\.gt-card\.gt-card2\.on \.gt-c2-seq\{opacity:\.28;\}/.test(src));
ok('★★ 讀螢幕不重複念（名稱那一行已經講過）', /<span class="gt-c2-seq" aria-hidden="true">/.test(src));
ok('★  單堂也有自己的標籤，不會落到看不出是什麼的「其他」',
   /friendly_promo:'友善優惠',single:'單堂'/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
