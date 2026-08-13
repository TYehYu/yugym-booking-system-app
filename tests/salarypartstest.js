/* 2026-08-08 使用者指示（兩次）：
     ①「把每個教練的課堂獎金、值班獎金、達標獎金等等都分別列出來，
        該加該減的都列在教練這一列明細，用顏色區分。
        然後公司負擔的勞健保也獨立出來在每月支出」
     ②「直接列出來吧，在員工這邊最上方新增一列標示每一個金額代表什麼：
        教練課、團體課、達標獎金、續約等等的，還有勞保、健保，
        另外公司負擔的勞健保勞退職保也要列為一項」

   第一版做成「點姓名展開」，第二次指示改成攤平的表：一位一列、一欄一個名目，
   最上面一列就是欄名，不用點也不用展開。

   ⚠ 勞保／健保那兩欄是**員工自付**、從應發裡代扣的 —— 不是公司的額外成本。
     公司的額外成本是最後一欄「公司負擔」。兩者混在一起看會把人事成本算成兩倍。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const COLS=new Function(src.slice(src.indexOf('const SAL_MX_COLS=['), src.indexOf('];',src.indexOf('const SAL_MX_COLS=['))+2)
  +'\nreturn SAL_MX_COLS;')();
const salaryRow=new Function(grabFn('salaryRow')+'\nreturn salaryRow;')();

console.log('① 欄位就是使用者點名要的那些');
eq('★★ 欄序（2026-08-12 定版）：實領第一欄、應發合計移除',
   COLS.map(c=>c.t),
   ['實領','教練課','團體課','值班','達標獎金','續約獎金','管理職','生日禮金','請假扣薪','勞保','健保','公司負擔']);
eq('★★ 加項／減項／合計分得出來（畫面靠這個上色；0812 起 sum 在最前）',
   COLS.map(c=>c.kind),
   ['sum','add','add','add','add','add','add','add','cut','cut','cut','co']);
ok('★★ 每一欄都有一句說明（就是使用者要的「標示每一個金額代表什麼」）',
   COLS.filter(c=>c.k!=='bday').every(c=>!!c.s));
/* 2026-08-08 使用者指正：負責人的健保是「雇主自負額」（全額自付），受僱者才是「員工負擔」
   —— 兩者都不是公司的額外成本，欄名改用共通說法。 */
ok('★ 勞保／健保標明是「自付・非公司負擔」',
   COLS.find(c=>c.k==='labor').s==='自付・非公司負擔' && COLS.find(c=>c.k==='health').s==='自付・非公司負擔');
ok('★★ 公司負擔那欄標明含勞退與職災',
   COLS.find(c=>c.k==='co').s==='勞健保・勞退・職保');

console.log('\n② 一位員工攤平成一列');
{
  const sal={ base:0, ptIsFloor:false, ptPay:48000, bonus:4000, groupPay:6000, dutyPay:3200,
    renewPay:2000, leaderPay:6000, supPay:3000, bdayPay:1000, leaveDeduct:1500,
    grossPay:71700, insLaborEmp:870, insHealthEmp:540, netPay:70290, insCoCost:6864 };
  const v=salaryRow(sal);
  eq('★ 教練課取課費', v.pt, 48000);
  eq('★★ 管理職＝店長獎金＋主管津貼（合成一欄）', v.mgmt, 9000);
  eq('★ 其餘各欄照抄', [v.group,v.duty,v.bonus,v.renew,v.bday,v.leave], [6000,3200,4000,2000,1000,1500]);
  eq('★★ 應發／勞保／健保／實領／公司負擔都有', [v.gross,v.labor,v.health,v.net,v.co],
     [71700,870,540,70290,6864]);
}
{
  const floor=salaryRow({base:36000,ptIsFloor:true,schedHours:160,ptPay:20000,grossPay:36000});
  eq('★★ 月薪制取保障底薪 → 教練課那欄放底薪（不是課費）', [floor.pt,floor.ptIsFloor], [36000,true]);
  const pay=salaryRow({base:36000,ptIsFloor:false,ptPay:52000,grossPay:52000});
  eq('★ 課費高於底薪 → 放課費', [pay.pt,pay.ptIsFloor], [52000,false]);
  ok('　　為什麼不能兩個都放，寫在原地',
     /月薪制取保障底薪時放底薪、取課費時放課費 —— 兩個都放會讓應發看起來對不上/.test(src));
}
eq('　　沒有薪資物件不會爆', salaryRow(null), null);

console.log('\n③ 表怎麼畫');
{
  const F=grabFn('salaryMatrixHTML');
  ok('★★ 最上面一列是欄名＋說明',
     /<thead><tr><th>員工<small>\$\{rows\.length\} 位<\/small><\/th>/.test(F)
     && /\$\{SAL_MX_COLS\.map\(c=>`<th>\$\{c\.t\}\$\{c\.s\?`<small>\$\{c\.s\}<\/small>`:''\}<\/th>`\)\.join\(''\)\}/.test(F));
  ok('★★ 一位一列，最後一列是合計',
     /<tr class="sx-total"><td>合計<\/td>/.test(F)
     && /SAL_MX_COLS\.forEach\(c=>\{ tot\[c\.k\]=rows\.reduce\(\(s,r\)=>s\+\(Number\(r\.v\[c\.k\]\)\|\|0\),0\); \}\);/.test(F));
  ok('★★ 顏色：加項綠、扣項與公司負擔紅、合計加粗',
     /const cls=\(c\.kind==='sum'\)\?'sx-sum':\(\(c\.kind==='cut'\|\|c\.kind==='co'\)\?'sx-cut':'sx-add'\);/.test(F)
     && /\.sal-mx \.sx-add\{color:var\(--green\);\}/.test(src)
     && /\.sal-mx \.sx-cut\{color:var\(--danger,#b5372e\);\}/.test(src)
     && /\.sal-mx \.sx-sum\{font-weight:800;/.test(src));
  ok('★ 扣的項目金額前面帶負號', /\$\{c\.kind==='cut'\?'−':''\}\$\{m\(v\)\}/.test(F));
  ok('★ 0 的格子畫破折號（不是一整排 $0）', /if\(!v\) return '<td class="sx-zero">—<\/td>';/.test(F));
  ok('★★ 欄多 → 橫向捲動，姓名那欄與表頭釘住',
     /\.sal-mx-wrap\{overflow-x:auto;/.test(src)
     && /\.sal-mx th\{[^}]*position:sticky;top:0;/.test(src)
     && /\.sal-mx th:first-child,\.sal-mx td:first-child\{text-align:left;position:sticky;left:0;/.test(src));
  ok('★★ 表下方說清楚「勞保健保不是公司的額外成本」，並點名負責人的健保是雇主自負額',
     /<b>勞保／健保<\/b>是本人自付、從應發裡代扣（負責人的健保是雇主自負額，全額自付），<b>不是<\/b>公司的額外成本；/.test(F));
  ok('★★ 並明說負責人的「公司負擔」是 0',
     /<b>負責人為 0<\/b>，公司沒有替雇主本人負擔的部分。/.test(F));
  ok('★ 並且算給你看公司實際的人事支出（0812 起應發合計改由各列加總 _grossTot）',
     /公司這個月實際的人事支出＝應發合計 \$\{m\(_grossTot\)\} ＋ 公司負擔 \$\{m\(tot\.co\)\} ＝ <b>\$\{m\(_grossTot\+tot\.co\)\}<\/b>/.test(F));
  ok('　　月薪制的人標一下（那一欄放的是底薪不是課費）', /月薪制<\/small>/.test(F));
}

console.log('\n④ 接到損益表上');
{
  const F=grabFn('finPnl');
  ok('★★ 每位員工帶上攤平後的數字', /v:salaryRow\(r\.sal\)/.test(F));
  ok('★★ 明細表接在損益表下面（不用點、不用展開）',
     /\$\{payRows\.length\?`<div class="card-title" style="margin:16px 0 6px;">員工薪資明細<\/div>\$\{salaryMatrixHTML\(payRows\)\}`:''\}/.test(F));
  ok('★ 損益表那一列只留總額，指向下方明細',
     /<td>員工薪資（應發）<span style="color:var\(--t3\);font-weight:400;"> 　\$\{payRows\.length\} 位・明細見下方<\/span><\/td>/.test(F));
  ok('★★ 公司負擔仍是獨立的支出大項（標明含職災）',
     /<td>公司負擔勞健保<span style="color:var\(--t3\);font-weight:400;"> 　勞保雇主＋健保雇主＋勞退＋職災<\/span><\/td>/.test(F));
  ok('★ 舊的「點姓名展開」已整組移除',
     !/pnlToggleEmp/.test(src) && !/function salaryParts\(/.test(src) && !/pnl-part/.test(src));
  ok('　　使用者的原話寫在程式裡',
     /「直接列出來吧，在員工這邊\s*\n\s*最上方新增一列標示每一個金額代表什麼」/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
