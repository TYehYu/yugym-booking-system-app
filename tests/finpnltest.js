/* 2026-08-08 使用者指示：「經營報表幫我列出當月淨利，包含每個教練的薪資、固定支出、
   其他支出、營業額、營業稅 5% 等等，用列表顯示」

   原本「本月」頁只有四個大數字（營收／支出／毛利／淨利），看得出賺不賺錢，
   但看不出錢從哪來、花到哪去 —— 尤其薪資是一整包，不知道哪位教練多少。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const F=grabFn('finPnl');

console.log('① 掛在「本月」分頁、四個大數字下面');
ok('★ 有自己的容器', /<div id="fin-sum"><\/div><div id="fin-pnl"><\/div><div id="fin-body">/.test(src));
/* 2026-08-08 使用者回報「經營報表資料好亂、好多重複」→ 四個大數字（finProfitStrip）退場，
   摘要改做在損益表頂端；#fin-sum 改放唯一的月份切換器。見 fintidytest.js */
ok('★ 順序：月份切換器 → 損益表 → 收款方式 → 營運',
   /finMonthBar\(\);[\s\S]{0,200}await finPnl\(\);[\s\S]{0,120}await finMonth\(\);[\s\S]{0,120}await anaMonth\(\);/.test(src));

console.log('\n② 口徑與既有數字同源');
/* 2026-08-08 使用者定案：「我們的淨利應該是教練們的銷課金額扣掉所有支出」——
   營收改認銷課（這個月上掉多少錢的課），收款只留著算營業稅。見 salesbasetest.js */
ok('★★ 營收改認銷課金額（不是收款）',
   /const SV=await monthSalesValue\(ym\);/.test(F)
   && /const revenue=Math\.round\(SV\.salesValue\);/.test(F));
ok('★ 收款仍算出來（營業稅的基礎、且要讓老闆看得到）',
   /const cash=pur\.reduce\(\(s,p\)=>s\+\(Number\(p\.deal_amount\)\|\|0\),0\);   \/\/ 這個月實際收到的錢/.test(F));
ok('★ 薪資走 computeMonthlyPayroll（與薪資頁同一支，不另算一套）',
   /pr=await computeMonthlyPayroll\(ym\)/.test(F));
ok('★ 支出看 expenses.ym，用 is_fixed 分固定／其他',
   /const fixed=exp\.filter\(e=>e\.is_fixed===true\);/.test(F)
   && /const other=exp\.filter\(e=>e\.is_fixed!==true\);/.test(F));

console.log('\n③ 營業稅：內含，算式寫在畫面上');
{
  const box=new Function('cash','return (function(){'+
    /const taxBase=[\s\S]*?const tax=cash-taxBase;/.exec(F)[0]+' return {taxBase,tax}; })();');
  eq('★★ 收款 105,000 → 銷售額 100,000、稅額 5,000', box(105000), {taxBase:100000, tax:5000});
  eq('　　0 元不會爆', box(0), {taxBase:0, tax:0});
  ok('★★ 稅的基礎是收款不是銷課（混用會算出不存在的稅額）',
     /依收款 \$\{m\(cash\)\} 內含計/.test(F)   /* 0823 兩欄改版：這句移到支出欄那一列的小字 */
     && /稅是對「實際開出去的銷售額」課的，\s*\n\s*所以基礎仍是\*\*收款\*\*，不是銷課/.test(F));
  ok('★ 註明可改成外加', /若貴店報價是稅外加，跟我說改成收款 × 5%/.test(F));
}

console.log('\n④ 逐項列出');
ok('★★ 每位教練一列（只列本月要計薪、金額大於 0 的，金額由大到小）',
   /\.filter\(r=>r\.countSalary&&Number\(r\.sal&&r\.sal\.grossPay\)>0\)/.test(F)
   && /\.sort\(\(a,b\)=>b\.amt-a\.amt\)/.test(F));
/* 0823 二修（使用者：「收斂成［支出］」）：固定／其他兩列與各自的逐項清單收成一列總額，
   品項改在支出登記視窗裡看。分法沒有消失——這一列的小字寫著各自多少。 */
ok('★★ 損益表只留一列［支出］（固定＋其他），逐項清單不再畫在表上',
   /<span class="pnl2-i-l">支出<i>固定 \$\{m\(fixedTotal\)\}・其他 \$\{m\(otherTotal\)\}/.test(F)
   && /<span class="pnl2-i-v">\$\{neg\(fixedTotal\+otherTotal\)\}<\/span>/.test(F)
   && !/pnl2-i-sub/.test(F));
ok('　　沒登記過也講清楚（不是只留一個 −$0 讓人猜）',
   /\$\{\(fixedTotal\+otherTotal\)\?'':'・本月還沒登記'\}/.test(F));
ok('　　合併／次數那段沒有留半套在程式裡（groupBy 沒有呼叫端了就移除）',
   !/const groupBy=/.test(F)
   && /隨 0823 二修的「收斂成［支出］」\s*\n\s*一起移除/.test(F));
/* 2026-08-08 使用者提問「人事成本還沒扣掉勞健保嗎」→ 納入；
   同日再指示「公司負擔的勞健保也獨立出來在每月支出」→ 改成與固定／其他支出並列的大項。 */
ok('★ 淨利＝銷課 − 稅 − 薪資 − 公司負擔勞健保 − 固定 − 其他',
   /const net=revenue-tax-salary-coIns-fixedTotal-otherTotal;/.test(F));
ok('★ 大數字那格仍給「公司實際人事總支出」（薪資＋公司負擔）',
   /const staffCost=salary\+coIns;   \/\/ 公司實際的人事總支出（大數字那格用）/.test(F));
ok('　　淨利正負用綠／紅', /class="pnl2-hero \$\{net>=0\?'ok':'bad'\}"/.test(F));

console.log('\n⑤ 兩處淨利不一致要先講');
/* 2026-08-08：四個大數字已退場，不再有兩個對不起來的淨利 → 改成明說「這是唯一的淨利」；
   同日再定案「淨利＝銷課−所有支出」後，下方營運卡的銷課與這裡改成同一份計算。 */
ok('★★ 明講這是這一頁唯一的淨利，且下方營運卡同源',
   /這是這一頁<b>唯一<\/b>的淨利數字，下方營運卡的銷課與這裡同一份計算。/.test(F));
ok('★★ 公司負擔勞健保是獨立的支出大項（不是薪資的子項）',
   /<span class="pnl2-i-l">公司負擔勞健保<i>勞保雇主＋健保雇主＋勞退＋職災<\/i><\/span><span class="pnl2-i-v">\$\{neg\(coIns\)\}<\/span>/.test(F));
ok('★ 明說員工自付的那一份不必再扣（已含在應發裡）',
   /員工自付的那一份不必另外扣 —— 那是從應發裡代扣的，已經含在應發裡。/.test(F));
ok('　　員工薪資標明是「應發」', /<b>員工薪資<\/b>＝各員工當月應發（與薪資頁同一支計算）/.test(F));

console.log('\n⑥ 版面與防呆');
ok('　　金額右對齊、等寬數字', /\.pnl2-i-v\{[^}]*font-family:var\(--num\)/.test(src)
   && /\.pnl2-i\{[^}]*justify-content:space-between/.test(src));
/* 0823 二修：表格版樣式（.pnl/.pnl-sub/.pnl-hero/.pnl-link）整組移除，沒有標記在用了。
   縮排小項這件事本身也一起退場——支出只剩一列總額，品項在登記視窗裡看。 */
ok('　　舊表格版樣式不留半套在檔案裡', !/^\.pnl\{/m.test(src) && !/\.pnl \.pnl-sub td/.test(src)
   && !/\.pnl-link\{/.test(src) && !/^\.pnl-hero\{/m.test(src)
   && /整組移除；現行樣式是下面的 \.pnl2-\*/.test(src));
ok('　　算不出來時不留白', /損益表暫時算不出來/.test(F));
ok('　　算之前先顯示計算中', /損益表計算中…/.test(F));
ok('　　使用者的原話寫在程式裡', /經營報表幫我列出當月淨利，包含每個教練的薪資、/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
