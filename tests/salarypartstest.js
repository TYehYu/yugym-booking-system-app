/* 2026-08-08 使用者指示：「把每個教練的課堂獎金、值班獎金、達標獎金等等都分別列出來，
   該加該減的都列在教練這一列明細，用顏色區分。然後公司負擔的勞健保也獨立出來在每月支出」

   損益表原本每位教練只有一行總額，看不出那筆錢是課上出來的、值班值出來的、
   還是達標獎金；請假扣薪也看不到。改成點姓名展開明細，加項綠、減項紅。
   公司負擔的勞健保則從「人事成本的子項」提成與固定支出、其他支出並列的大項。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const SP=new Function(grabFn('salaryParts')+'\nreturn salaryParts;')();

console.log('① 一位教練的薪資組成');
{
  const sal={ ptPay:48000, ptDetail:'30 堂', bonus:4000, bonusDetail:'滿 30 堂',
    groupPay:6000, groupDetail:'40 人次', dutyPay:3200, dutyDetail:'20 小時',
    renewPay:2000, renewDetail:'2 張', leaderPay:0, supPay:0, bdayPay:0,
    leaveDeduct:1500, leaveDeductDetail:'事假 1 天', grossPay:63200 };
  const P=SP(sal,{ptDone:30,groupHeads:40});
  eq('★★ 逐項列出（順序：課費→達標→團課→值班→續約→扣薪）',
     P.map(x=>x.k), ['教練課費','達標獎金','團體課費','值班費','續約獎金','請假扣薪']);
  eq('★★ 該加的標 add、該減的標 cut', P.map(x=>x.sign),
     ['add','add','add','add','add','cut']);
  eq('★ 金額照抄，不重算', P.map(x=>x.v), [48000,4000,6000,3200,2000,1500]);
  eq('★ 每一項帶說明（幾堂／幾小時／幾張）',
     P.map(x=>x.d), ['30 堂','滿 30 堂','40 人次','20 小時','2 張','事假 1 天']);
  eq('　　0 的項目不列（版面不被稀釋）', P.some(x=>x.k==='店長獎金'||x.k==='主管津貼'||x.k==='生日禮金'), false);
}
{
  /* 月薪制：取保障底薪時列「保障底薪」，取課費時列「教練課費」 */
  const floor=SP({base:36000,ptIsFloor:true,schedHours:160,ptPay:20000,grossPay:36000});
  eq('★★ 月薪制取底薪 → 列保障底薪（不會兩個都列、加總變兩倍）',
     floor.map(x=>x.k), ['保障底薪']);
  const pay=SP({base:36000,ptIsFloor:false,ptPay:52000,ptDetail:'32 堂',grossPay:52000});
  eq('★ 課費高於底薪 → 列教練課費', pay.map(x=>[x.k,x.v]), [['教練課費',52000]]);
}
{
  const mgr=SP({ptPay:30000,leaderPay:6000,leaderDetail:'2 / 3 位達標',supPay:3000,bdayPay:1000,bdayDetail:'9 月壽星'});
  eq('★ 店長獎金／主管津貼／生日禮金都列得出來',
     mgr.map(x=>x.k), ['教練課費','店長獎金','主管津貼','生日禮金']);
}
eq('　　沒有薪資物件不會爆', SP(null), []);
ok('★★ 只列「應發」這一段，員工自付的勞健保不列（會讓人以為公司少付了）',
   /只列「應發」這一段：員工自付的勞健保是從應發裡代扣的，/.test(src));

console.log('\n② 損益表：點姓名展開，加綠減紅');
{
  const F=grabFn('finPnl');
  ok('★★ 每位員工帶上明細', /parts:salaryParts\(r\.sal,\{ptDone:r\.ptDone,groupHeads:r\.groupHeads\}\)/.test(F));
  ok('★★ 姓名那一列可點、明細列預設收起來',
     /<tr class="pnl-sub pnl-emp" onclick="pnlToggleEmp\(this,'\$\{pid\}'\)">/.test(F)
     && /<tr class="pnl-part \$\{pt\.sign\} " data-emp="\$\{pid\}" style="display:none;">/.test(F.replace('pt.sign}','pt.sign} ')));
  ok('★★ 加項標「＋」、減項標「−」，金額前面也跟著',
     /\$\{pt\.sign==='add'\?'＋':'−'\} \$\{escH\(pt\.k\)\}/.test(F)
     && /\$\{pt\.sign==='add'\?'':'−'\}\$\{m\(pt\.v\)\}/.test(F));
  ok('★★ 顏色分：加項綠、減項紅',
     /\.pnl tr\.pnl-part\.add td:last-child\{color:var\(--green\);\}/.test(src)
     && /\.pnl tr\.pnl-part\.cut td:last-child\{color:var\(--danger,#b5372e\);\}/.test(src));
  ok('★ 展開時箭頭轉向（看得出哪一列開著）',
     /\.pnl tr\.pnl-emp td:first-child::before\{content:'▸';/.test(src)
     && /\.pnl tr\.pnl-emp\.open td:first-child::before\{transform:rotate\(90deg\);\}/.test(src));
  ok('★ 標題那一列提示「點姓名看明細」', /　\$\{payRows\.length\} 位・點姓名看明細/.test(F));
}
{
  const T=grabFn('pnlToggleEmp');
  ok('★ 再點一次收回去', /const open=tr\.classList\.toggle\('open'\);/.test(T));
  ok('★★ 只動這一位的明細列（不重繪整張表，畫面不會跳）',
     /tb\.querySelectorAll\(`tr\.pnl-part\[data-emp="\$\{pid\}"\]`\)\.forEach\(x=>\{ x\.style\.display=open\?'':'none'; \}\);/.test(T)
     && /不重繪整張表，免得剛看的地方跳掉。/.test(src));
}

console.log('\n③ 公司負擔勞健保獨立成一個支出大項');
{
  const F=grabFn('finPnl');
  ok('★★ 與固定支出、其他支出並列（不再是薪資的子項）',
     /<tr class="pnl-h pnl-out"><td>公司負擔勞健保<span style="color:var\(--t3\);font-weight:400;"> 　勞保雇主＋健保雇主＋勞退<\/span><\/td><td>\$\{neg\(coIns\)\}<\/td><\/tr>\n\s*<tr class="pnl-h pnl-out"><td>固定支出<\/td>/.test(F));
  ok('★★ 淨利式子把它單獨列出來',
     /const net=revenue-tax-salary-coIns-fixedTotal-otherTotal;/.test(F));
  ok('★ 薪資那一列回到「員工薪資（應發）」', /<td>員工薪資（應發）/.test(F));
  ok('★ 註腳仍算給你看「公司實際人事總支出」',
     /公司實際人事總支出＝\$\{m\(salary\)\} ＋ \$\{m\(coIns\)\} ＝ <b>\$\{m\(staffCost\)\}<\/b>。/.test(F));
  ok('　　使用者的原話寫在程式裡',
     /「公司負擔的勞健保也獨立出來在每月支出」/.test(src)
     && /「把每個教練的課堂獎金、值班獎金、\s*\n\s*達標獎金等等都分別列出來，該加該減的都列在教練這一列明細，用顏色區分」/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
