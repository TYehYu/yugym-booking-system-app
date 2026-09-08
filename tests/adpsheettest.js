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

console.log('\n② 視窗一律置中（2026-09-08 當天試過靠上就撤：「視窗靠中好了」）');
ok('★★★ 挑選視窗是置中的',
   /#adp-sheet \.adp-box\{position:absolute;left:50%;top:50%;transform:translate\(-50%,-50%\);/.test(src));
ok('★★★ 全站沒有第二套（沒有任何視窗被釘在上緣）',
   !/align-items:flex-start;\}/.test(src.slice(src.indexOf('.modal-bg{'), src.indexOf('.modal-bg{')+600))
   && !/\.modal-bg:has\(>\.modal-wide\)\{align-items:flex-start;\}/.test(src));
ok('★★ 撤掉的理由留在原地，免得日後又有人「順手改成靠上」',
   /試了一版，使用者當天改口「視窗靠中好了」→ 退回置中/.test(src)
   && /全站視窗一律垂直置中，沒有例外，不要再分兩套/.test(src));
ok('★★★ 靠上那版加的 max-height 與自捲留著（置中一樣需要，內容太高要能捲）',
   /max-height:88vh;overflow-y:auto;overscroll-behavior:contain;/.test(src));
ok('　　原本寫在 HTML 上的 max-height 改由 CSS 統一管（不要兩個地方各寫一次）',
   !/class="adp-box" style="max-height:86vh;overflow-y:auto;"/.test(src));

console.log('\n③ 簽約視窗：方案牆上方的自訂捷徑移除（2026-09-08 使用者：「這邊移除自訂方案捷徑」）');
ok('★★★ 方案牆上不再有那顆「✎ 自訂方案」（只剩註解記著它為什麼被拿掉）',
   !/gt-card-name" style="font-size:13px;">✎ 自訂方案/.test(src)
   && !/onclick="gtSwitchCustom\(\)"/.test(src));
ok('★★★ gtSwitchCustom 本身留著 —— 自訂銷售那條路還在用',
   /function gtSwitchCustom\(/.test(src) && /function salesCustom\(\)\{/.test(src));
ok('★★ 自訂仍然進得去（「選擇課程」那張視窗裡本來就有一項）',
   /\{k:'custom',   name:'自訂',/.test(src));
ok('★★ 移除的理由寫在原地（同一個入口兩條路，而且它長得像方案卡卻不是方案）',
   /在方案牆上再放一次等於同一個入口兩條路/.test(src));

console.log('\n④ 方案卡右側的類型浮水印');
ok('★★★ 規格照抄首頁課卡的 .tcard-seq（靠右、垂直置中、大字、低透明度）',
   /\.gt-c2-seq\{position:absolute;right:8px;top:50%;transform:translateY\(-50%\);/.test(src)
   && /\.tcard-std \.tcard-seq\{position:absolute;right:8px;top:50%;transform:translateY\(-50%\);/.test(src));
ok('★★★ 字串用 slotLabelOf 算好的那一份，不在卡片裡另外判「名字有沒有友善」',
   /">\$\{slotLabel\}<\/i><\/span>/.test(src)
   && /那種判法 0718 就出過錯（友善課被當成一般教練課）/.test(src));
ok('★★★ 是背景不是標籤：不能吃掉點卡片的動作',
   /\.gt-c2-seq\{[\s\S]{0,200}pointer-events:none;user-select:none;/.test(src));
ok('★★★ 卡片要 position:relative，否則會定位到更外面的祖先',
   /\.gt-card\.gt-card2\{position:relative;overflow:hidden;\}/.test(src));
ok('★★ 內容要壓在浮水印上面（z-index 分層）',
   /\.gt-card\.gt-card2>\*:not\(\.gt-c2-seq\)\{position:relative;z-index:1;\}/.test(src));
ok('★★ 一列不折行（折了就不是浮水印，是一團字）',
   /\.gt-c2-seq>i\{font-style:normal;display:block;white-space:nowrap;\}/.test(src));
ok('★★ 選中的那張浮水印再明顯一點', /\.gt-card\.gt-card2\.on \.gt-c2-seq\{opacity:\.5;\}/.test(src));
ok('★★★ 二修：再大一點、顏色再明顯（20→27px、.15→.32）',
   /\.gt-c2-seq-t\{font-size:27px;\}/.test(src)
   && /color:var\(--pc,#1f6f54\);opacity:\.32;\}/.test(src));
/* 2026-09-08 四修（使用者：「不用縮小文字　讓他被左邊的字蓋住沒關係　浮水印是視覺提醒」）
   —— 三修那版「依字數降級 ＋ 截字」整組退場。 */
ok('★★★ 字級一律 27px，沒有第二套（兩套規則並存會讓人以為字級是隨機的）',
   !/\.gt-c2-seq-t\.s4\{/.test(src) && !/\.gt-c2-seq-t\.s5\{/.test(src)
   && !/length>=5\?' s5'/.test(src));
ok('★★★ 不設寬度上限、不截字 —— 長的那幾個往左伸到價格底下是刻意的',
   !/\.gt-c2-seq\{[^}]*max-width:/.test(src)
   && !/\.gt-c2-seq>i\{[^}]*text-overflow:/.test(src)
   && /它是背景提醒，不是要讀完的資訊/.test(src));
console.log('\n⑤ 浮水印上面加一列 1V1／1V2（2026-09-08 三修）');
ok('★★★ 讀 p.format，不從方案名稱裡撈（名稱是人打的，空格都不一樣）',
   /\$\{p\.format\?`<i class="gt-c2-seq-f">\$\{String\(p\.format\)\.toUpperCase\(\)\}<\/i>`:''\}/.test(src)
   && /不要從方案名稱裡撈/.test(src));
ok('★★★ 沒有 format 的方案（團課、自主訓練）就只畫下面那一列',
   /沒有 format 的方案（團課、自主訓練那些）就只畫下面那一列/.test(src));
ok('★★★ 兩列靠右疊起來',
   /display:flex;flex-direction:column;align-items:flex-end;gap:1px;/.test(src));
ok('★★★ 蓋得住的前提：內容有 z-index:1 壓在上面、卡片 overflow:hidden 擋右緣',
   /\.gt-card\.gt-card2>\*:not\(\.gt-c2-seq\)\{position:relative;z-index:1;\}/.test(src)
   && /\.gt-card\.gt-card2\{position:relative;overflow:hidden;\}/.test(src));
ok('★★ 上列小一階（它是附註，不是主角）', /\.gt-c2-seq-f\{font-size:15px;/.test(src));
ok('★★ 卡片右緣不會被撐破（overflow:hidden）',
   /\.gt-card\.gt-card2\{position:relative;overflow:hidden;\}/.test(src));
ok('★★ 讀螢幕不重複念（名稱那一行已經講過）', /<span class="gt-c2-seq" aria-hidden="true">/.test(src));
ok('★  單堂也有自己的標籤，不會落到看不出是什麼的「其他」',
   /friendly_promo:'友善優惠',single:'單堂'/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
