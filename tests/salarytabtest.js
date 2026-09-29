/* 員工資料的「薪資」分頁（2026-09-29 優化）

   使用者：「薪資這一區有優化建議嗎」→ 逐項確認：
     ・「最上面那一格 薪水可以靠右」
     ・「這邊是不是可以再簡化　留下保障底薪　教練課費　兩列就好」

   ⚠⚠ 最要緊的一條：底薪與課費是**二選一取高者**，原本卻是三列
     （底薪／課費／教練課收入），看起來像三筆都加，加起來還跟應發合計對不上。
     現在兩列講完，勝出的標「採用」、另一列淡化標「未採用」。
   ⚠ 金額與合計一個字都沒動 —— 合計吃的一直是 sal.ptIncome。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grab=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 余東曄 9 月的真實形狀：底薪 29,500 ＜ 課費 56,500 → 取課費 */
const SAL={base:29500,ptPay:56500,ptIncome:56500,ptIsFloor:false,baseHourly:227,divisor:130,
  bonus:5000,renewPay:5000,groupPay:0,dutyPay:0,bdayPay:0,leaveDeduct:0,
  grossPay:66500,netPay:64132,insEmpDeduct:2368,insLaborEmp:818,insHealthEmp:1550,insGrade:30300,
  insIdentity:'employee',isLeader:false,supPay:0,ptDetail:'91 堂'};
const R={emp:{id:'c-1',name:'余東曄'},sal:SAL,ptDone:91,groupHeads:0,dutyHours:0,countSalary:true,leave:{}};

function run(rr){
  const g={ ymd:()=>'2026-09', TODAY:new Date(2026,8,29), escH:s=>String(s==null?'':s),
    computeMonthlyPayroll:async()=>({rows:[rr]}),
    payrollCalcRows:new Function('r','return ('+grab('payrollCalcRows')+')(r);'),
    fmtHours:h=>String(h), PP:{rec:{id:'c-1'}} };
  const scope=new Proxy(g,{has:()=>true,
    get:(t,k)=>(k in t)?t[k]:((k in globalThis)?globalThis[k]:(()=>''))});
  return new Function('scope','with(scope){ '+grab('ppEmpSalaryHtml')+'\nreturn ppEmpSalaryHtml("c-1"); }')(scope);
}

console.log('① 二選一：兩列講完');
{
  const H=grab('payrollCalcRows');
  ok('★★★ 不再有第三列「教練課收入」', !/rowL\('教練課收入'/.test(H));
  ok('★★★ 勝出的那一列標「採用」，另一列標「未採用」',
     /tag:_floor\?'採用':'未採用'/.test(H) && /tag:_floor\?'未採用':'採用'/.test(H));
  ok('★★★ 未採用那一列淡化但不隱藏（有比較才知道為什麼取另一邊）',
     /\.sal-line-dim\{opacity:\.5;\}/.test(src));
  ok('★★ 合計沒被動到（吃的一直是 ptIncome）', /ptIncome/.test(src));
  /* ⚠ 請假時薪是「請假扣薪」才用得到的數字，沒請假還印出來會被當成扣了什麼 */
  ok('★★ 請假時薪只在真的有請假扣薪時才寫',
     /if\(s\.baseHourly>0 && s\.leaveDeduct>0\)/.test(H));
}

/* ⚠ ppEmpSalaryHtml 是 async —— 忘了 await 的話拿到的是 Promise，
   所有字串比對都會落空（第一版就這樣全紅）。 */
async function main(){
console.log('\n② 這一頁畫得出來（實跑）');
{
  let html='',err='';
  try{ html=await run(R); }catch(e){ err=(e&&e.message)||String(e); }
  ok('★★★ 不拋錯', !err, err);
  ok('★★★ 最上面金額靠右（文字一塊、數字一塊）',
     /<div class="pp-sal-tx">/.test(html) && /\.pp-sal-v\{[^}]*text-align:right/.test(src.replace(/\n\s*/g,'')));
  ok('★★★ 扣項直接列出來（不用再點完整薪資單）',
     /勞保（員工負擔）/.test(html) && /健保（員工負擔）/.test(html) && /−\$818/.test(html) && /−\$1,550/.test(html));
  ok('★★★ 最後一列是「實領」，不跟上面的應發重複',
     /<span>實領<\/span><b>\$64,132<\/b>/.test(html));
  ok('★★ 兩列都在，且標了採用／未採用',
     /保障底薪/.test(html) && /教練課費/.test(html)
     && /sal-line-tag">未採用/.test(html) && /sal-line-tag on">採用/.test(html));
}

console.log('\n③ 沒有扣項的人（多數合作教練）');
{
  const S2=Object.assign({},SAL,{insEmpDeduct:0,insLaborEmp:0,insHealthEmp:0,netPay:66500});
  const html=await run(Object.assign({},R,{sal:S2}));
  /* ⚠ 「扣項」兩個字也出現在最上面那一格的說明裡（「沒有勞健保與扣項」），
     所以要驗的是**那一段分隔標題**不在，不是整頁都沒有這兩個字。 */
  ok('★★ 沒有扣項就不畫扣項那一段', !/pp-sal-grp">扣項/.test(html));
  /* ⚠ 應發＝實領時照舊寫「應發合計」，不要憑空冒出一個新名詞 */
  ok('★★ 最後一列寫「應發合計」', /<span>應發合計<\/span><b>\$66,500<\/b>/.test(html));
  ok('★★ 最上面那一格也寫應發、並說明沒有扣項', /應發＝實領/.test(html));
}

console.log('\n④ 底薪比較高的人（取底薪）');
{
  const S3=Object.assign({},SAL,{base:60000,ptPay:20000,ptIncome:60000,ptIsFloor:true,grossPay:70000,netPay:67632});
  const html=await run(Object.assign({},R,{sal:S3}));
  ok('★★★ 這次換底薪標「採用」', /保障底薪[\s\S]{0,80}sal-line-tag on">採用/.test(html));
  ok('★★★ 課費那一列標「未採用」並淡化', /sal-line-dim[\s\S]{0,160}教練課費[\s\S]{0,80}未採用/.test(html));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
}
main();
