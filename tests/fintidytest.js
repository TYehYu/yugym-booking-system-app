/* 2026-08-08 使用者回報：「經營報表裡面資料好亂，好多重複的資訊，你幫我整理一下，
   我要清楚知道當月利潤、支出、各教練的薪水」
   追加：「要重點標示身為老闆該看到的內容喔」

   整理前，「本月」這一頁疊了四段各自算一遍的東西：
     ① finProfitStrip　四個大數字（營收／支出／毛利／淨利）
     ② finPnl　　　　　損益表（同樣的營收，但淨利有扣營業稅 → 兩個淨利永遠差一個稅額）
     ③ finMonth　　　　又一組「本月營收／筆數／其他支出／待收款」＋自帶月份切換器
     ④ anaMonth　　　　「本月利潤」＝銷課−薪資、「本月營收」＝票券金額（第三種口徑）
                        ＋另一個月份切換器，而且改的是 _anaMonth 不是 _finMonth
   結果：同一頁上兩個月份切換器、三個「本月營收」、兩個「利潤」。

   整理原則：一個月份、一份損益表、一個淨利；其餘只留損益表沒有的資訊。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 一個月份切換器');
{
  const F=grabFn('finMonthBar');
  ok('★★ 只有一個，而且兩個月份變數一起設（切了上面下面就跟著動）',
     /window\._anaMonth=ym;                       \/\/ 下面每一段都跟著同一個月份/.test(F));
  ok('★ 本月會標「累計到今天」（月中的數字本來就還會變）',
     /const isNow=ym===ymd\(TODAY\)\.slice\(0,7\);/.test(F)
     && /本月（累計到今天）/.test(F));
  ok('★★ 底下兩段在整合頁不再各畫一個',
     /const dateBar=_one\?'':`<div class="card ops-datebar"[\s\S]{0,200}finMonthMove\(-1\)/.test(src)
     && /const dateBar=_one\?'':`<div class="card ops-datebar"[\s\S]{0,200}anaMonthMove\(-1\)/.test(src));
  ok('★ 用 _finOnePage 告訴底下兩段「這裡已經整合過了」',
     /window\._finOnePage=true;         \/\/ 讓下面兩段知道/.test(src)
     && /window\._finOnePage=false;/.test(src)
     && (src.match(/const _one=!!window\._finOnePage;/g)||[]).length===2);
  ok('　　單獨開舊路由時仍照原樣（沒有把別人的頁面弄壞）',
     /單獨開這一支時（舊路由）仍照原樣顯示。/.test(src));
}

console.log('\n② 四個大數字退場，摘要改做在損益表頂端');
ok('★★ 月份頁不再呼叫 finProfitStrip',
   !/await finProfitStrip\(\);          \/\/ 營收／支出／毛利／淨利 四個大數字/.test(src));
ok('★ 為什麼退場，寫在原地（兩個淨利永遠差一個稅額）',
   /它的四個大數字與損益表講的是同一件事，但「淨利」沒有扣營業稅，\s*\n\s*跟損益表的淨利永遠差一個稅額，兩邊都對不起來。/.test(src));
ok('　　函式本身保留未刪（要回頭比對時還在）', /async function finProfitStrip\(\)\{/.test(src));

console.log('\n③ 老闆要看的重點標示出來');
{
  const F=grabFn('finPnl');
/* 0823 使用者指示改成兩欄版：淨利改為獨佔「頂列」（原本是與兩小格並排的左半）。 */
  /* 0823 二修（使用者：「上方的利潤置中顯示」）：它橫跨整個寬度，靠左時右邊空一大片。 */
  ok('★★ 淨利獨佔頂列一整條、置中、字最大，賺／虧用綠紅分',
     /<div class="pnl2-hero \$\{net>=0\?'ok':'bad'\}">/.test(F)
     && /\.pnl2-hero\{[^}]*align-items:center;text-align:center;/.test(src)
     && /\.pnl2-hero-v\{font-family:var\(--num\),inherit;font-size:38px;font-weight:800;/.test(src)
     && /\.pnl2-hero\.bad\{background:linear-gradient\(180deg,#fdf1f0 0%,#fbe9e7 100%\);border-color:#e8b6b0;\}/.test(src));
  ok('★★ 直接用白話講結論（「本月到目前為止賺 $X」）',
     /\$\{_isNow\?'本月到目前為止':'當月'\}\$\{net>=0\?'賺':'虧'\}/.test(F));
  ok('★ 月中會提醒「這個月還沒過完，數字會繼續變」',
     /\$\{_isNow\?'　·　這個月還沒過完，數字會繼續變':''\}/.test(F));
  ok('★★ 銷課與支出各成一欄（左綠右紅），品項掛在各自底下',
     /<section class="pnl2-col pnl2-in">/.test(F) && /<section class="pnl2-col pnl2-out">/.test(F)
     && /\.pnl2-cols\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/.test(src)
     && /\.pnl2-in \.pnl2-head-l,\.pnl2-in \.pnl2-head-v\{color:var\(--green,#1f6f54\);\}/.test(src)
     && /\.pnl2-out \.pnl2-head-l,\.pnl2-out \.pnl2-head-v\{color:var\(--red,#7A2E28\);\}/.test(src));
  ok('★ 支出那格直接拆給你看（人事排最前 —— 那是最大一筆）',
     /人事 \$\{m\(staffCost\)\}・稅 \$\{m\(tax\)\}・支出 \$\{m\(fixedTotal\+otherTotal\)\}/.test(F));
  ok('★★ 員工薪資仍是支出欄裡的一列，指向下方明細',
     /<span class="pnl2-i-l">員工薪資（應發）<i>\$\{payRows\.length\} 位・明細見下方<\/i><\/span>/.test(F));
  ok('★ 逐位教練仍逐列列出、金額由大到小',
     /\.filter\(r=>r\.countSalary&&Number\(r\.sal&&r\.sal\.grossPay\)>0\)/.test(F)
     && /\.sort\(\(a,b\)=>b\.amt-a\.amt\)/.test(F));
  ok('★ 支出合計＝稅＋薪資＋勞健保＋固定＋其他，與淨利同一份計算',
     /const spend=tax\+salary\+coIns\+fixedTotal\+otherTotal;/.test(F)
     && /const net=revenue-tax-salary-coIns-fixedTotal-otherTotal;/.test(F));
  ok('　　手機版縮成一欄', /@media\(max-width:900px\)\{ \.pnl2-cols\{grid-template-columns:1fr;\} \.pnl2-hero-v\{font-size:32px;\} \}/.test(src));
  ok('　　使用者的原話寫在程式裡', /「要重點標示身為老闆該看到的內容喔」/.test(src));
}

console.log('\n④ 重複的資訊拿掉，剩下的講清楚彼此的差別');
{
  const F=grabFn('finMonth');
  ok('★★ 整合頁不再重複「本月營收／筆數／其他支出／待收款」四格',
     /const stats=_one\?'':lpStats\(\[/.test(F));
  ok('★ 只留損益表沒有的「收款方式」，並標明是同一筆錢',
     /收款方式\$\{_one\?`<span[^`]*合計 \$\{finMoney\(revenue\)\}，與上方營業額同一筆錢/.test(F));
}
{
  const F=grabFn('anaMonth');
  ok('★★ 整合頁不再顯示第三種「本月營收」與第二種「利潤」',
     /const stats=_one\?'':lpStats\(\[\n\s*\{label:'本月利潤（銷課−教練薪資）'/.test(F));
  /* 2026-08-08 再定案：「淨利＝銷課−所有支出」→ 銷課變成損益表的營收本身，
     下面那張「本月銷課與人事」就整個重複了，整合頁不再畫（見 salesbasetest.js）。 */
  ok('★★ 整合頁不再重複「本月銷課與人事」（損益表已經逐項拆開）',
     /const breakdown=\(_one\?'':`<div class="card" style="padding:14px 16px;">/.test(F));
  ok('★ 只留損益表沒有的營運面（課堂數、新會員）',
     /<span>本月課程（已上） <b style="font-family:var\(--font-en\);">\$\{done\.length\}<\/b> 堂<\/span>/.test(F));
  ok('★ 損益表註腳點明下方的銷課與這裡同一份計算',
     /這是這一頁<b>唯一<\/b>的淨利數字，下方營運卡的銷課與這裡同一份計算。/.test(src));
  ok('　　為什麼要拿掉，寫在原地',
     /兩個都與損益表的數字不同，擺在同一頁只會讓人不知道該信哪一個。/.test(F));
}
ok('　　使用者的原話寫在程式裡',
   /「經營報表裡面資料好亂，好多重複的資訊，你幫我整理一下，\s*\n\s*我要清楚知道當月利潤、支出、各教練的薪水」/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
