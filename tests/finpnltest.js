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
ok('★ 順序：四個大數字 → 損益表 → 收入結構',
   /await finProfitStrip\(\);[\s\S]{0,80}await finPnl\(\);[\s\S]{0,60}await finMonth\(\);/.test(src));

console.log('\n② 口徑與既有數字同源');
ok('★ 營業額看 purchases.created_at 的實收金額（與 finProfitStrip 一致）',
   /const pur=\(purAll\|\|\[\]\)\.filter\(p=>String\(p\.created_at\|\|''\)\.slice\(0,7\)===ym\);/.test(F)
   && /const revenue=pur\.reduce\(\(s,p\)=>s\+\(Number\(p\.deal_amount\)\|\|0\),0\);/.test(F));
ok('★ 薪資走 computeMonthlyPayroll（與薪資頁同一支，不另算一套）',
   /pr=await computeMonthlyPayroll\(ym\)/.test(F));
ok('★ 支出看 expenses.ym，用 is_fixed 分固定／其他',
   /const fixed=exp\.filter\(e=>e\.is_fixed===true\);/.test(F)
   && /const other=exp\.filter\(e=>e\.is_fixed!==true\);/.test(F));

console.log('\n③ 營業稅：內含，算式寫在畫面上');
{
  const box=new Function('revenue','return (function(){'+
    /const taxBase=[\s\S]*?const tax=revenue-taxBase;/.exec(F)[0]+' return {taxBase,tax}; })();');
  eq('★★ 105,000 → 銷售額 100,000、稅額 5,000', box(105000), {taxBase:100000, tax:5000});
  eq('　　0 元不會爆', box(0), {taxBase:0, tax:0});
  ok('★ 畫面上寫出算式（要改成外加才看得出差在哪）',
     /內含：\$\{m\(revenue\)\} ÷ 1\.05 × 5%/.test(F));
  ok('★ 註明可改成外加', /若貴店報價是稅外加，跟我說改成營業額 × 5%/.test(F));
}

console.log('\n④ 逐項列出');
ok('★★ 每位教練一列（只列本月要計薪、金額大於 0 的，金額由大到小）',
   /\.filter\(r=>r\.countSalary&&Number\(r\.sal&&r\.sal\.grossPay\)>0\)/.test(F)
   && /\.sort\(\(a,b\)=>b\.amt-a\.amt\)/.test(F));
ok('★ 固定支出與其他支出各自逐項（同名目合併、多筆標次數）',
   /const groupBy=a=>\{ const g=\{\}; a\.forEach\(e=>\{ const k=e\.category\|\|'其他';/.test(F)
   && /r\.n>1\?`×\$\{r\.n\}`:''/.test(F));
ok('　　沒有支出時也講清楚（不是留白）',
   /（本月沒有固定支出）/.test(F) && /（本月沒有其他支出）/.test(F));
ok('★ 淨利＝營業額 − 稅 − 薪資 − 固定 − 其他',
   /const net=revenue-tax-salary-fixedTotal-otherTotal;/.test(F));
ok('　　淨利正負用綠／紅', /class="pnl-net \$\{net>=0\?'ok':'bad'\}"/.test(F));

console.log('\n⑤ 兩處淨利不一致要先講');
ok('★★ 明講四個大數字沒扣營業稅、差額多少',
   /上方四個大數字的「淨利」<b>沒有扣營業稅<\/b>，所以會比這裡多 \$\{m\(tax\)\}/.test(F));
ok('★ 公司負擔勞健保有揭露、且明說未計入',
   /另有公司負擔勞健保 <b>\$\{m\(coIns\)\}<\/b>，<b>未<\/b>計入淨利/.test(F));
ok('　　人事成本標明是「應發」', /人事成本＝各員工當月<b>應發<\/b>薪資/.test(F));

console.log('\n⑥ 版面與防呆');
ok('　　金額右對齊、等寬數字', /\.pnl td:last-child\{text-align:right;font-family:var\(--num\)/.test(src));
ok('　　小項縮排', /\.pnl \.pnl-sub td:first-child\{padding-left:18px;/.test(src));
ok('　　算不出來時不留白', /損益表暫時算不出來/.test(F));
ok('　　算之前先顯示計算中', /損益表計算中…/.test(F));
ok('　　使用者的原話寫在程式裡', /經營報表幫我列出當月淨利，包含每個教練的薪資、/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
