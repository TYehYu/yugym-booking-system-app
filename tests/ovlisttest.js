/* 營運分析・手機版「本月總覽」列表（2026-07-31 使用者指示）

   ① 營收改到第一列，接著 教練課／團體課／銷課金額／銷課堂數
   ② 教練課與團體課：金額放左邊、堂數放右邊（原本相反）
   ③ 營收與銷課金額的數字也改成金色（＝金額一律金色、堂數維持深色）
   ④ 銷課堂數只記教練課與團體課 —— 原本 749 堂裡有 272 堂是自主訓練與體驗，
      擺在「營收／銷課金額」旁邊會誤導。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

console.log('列的順序');
{
  const blk=g('<div class="ov-list">','</div>');
  const order=[...blk.matchAll(/ovRow\(OV_IC\.\w+,'([^']+)'/g)].map(m=>m[1]);
  /* 2026-08-23 使用者指示：利潤下方那排說明文字移除，空出來的位子改放「支出」，
     整列可點＝開支出登記視窗（頂上的 [＋ 支出] 因此退場）。 */
  eq('★ 營收／教練課／團體課／銷課金額／銷課堂數／支出',
     order, ['營收','教練課','團體課','銷課金額','銷課堂數','支出']);
}

console.log('\n教練課與團體課：金額在左、堂數在右');
ok('★ 教練課主數值＝金額、副數值＝堂數',
   /ovRow\(OV_IC\.pt,'教練課',fmtNT\(_svPt!=null\?_svPt:Math\.round\(ptFee\)\),`\$\{ptDoneBk\.length\}\/\$\{ptClassCount\} 堂`,'',\{gold:true,subPlain:true\}\)/.test(src));   // 2026-08-20 對帳：月檢視金額改吃 monthSalesValue
ok('★ 團體課主數值＝金額、副數值＝堂數',
   /ovRow\(OV_IC\.grp,'團體課',fmtNT\(_svGrp!=null\?_svGrp:Math\.round\(grpFee\)\),`\$\{grpDoneBk\.length\}\/\$\{groupClassCount\} 堂`,'',\{gold:true,subPlain:true\}\)/.test(src));   // 2026-08-20 對帳：月檢視金額改吃 monthSalesValue
ok('　　主數值仍是大字、副數值仍是小字（只換內容不換版面）',
   /\.ov-i-v\{font-size:17px;font-weight:800;/.test(src)
   && /\.ov-i-v2\{font-size:12\.5px;font-weight:700;/.test(src));

console.log('\n顏色：金額金色、堂數深色');
ok('★ 營收上金色', /ovRow\(OV_IC\.rev,'營收',fmtNT\(revenue\),'','',\{gold:true\}\)/.test(src));
ok('★ 銷課金額上金色', /ovRow\(OV_IC\.rev,'銷課金額',fmtNT\(_ovRev!=null\?_ovRev:usedFee\),'','',\{gold:true\}\)/.test(src));   // 2026-08-20 對帳：月檢視改吃 monthSalesValue
ok('★ 銷課堂數維持深色（沒帶 gold）',
   /ovRow\(OV_IC\.done,'銷課堂數',`\$\{doneMainCount\} 堂`,'',_doneMix\)/.test(src));
ok('★ 兩個修飾樣式都有定義',
   /\.ov-i-v\.ov-i-gold\{color:var\(--gold-d\);\}/.test(src)
   && /\.ov-i-v2\.ov-i-plain\{color:var\(--text\);\}/.test(src));
{
  /* 2026-08-23：ovRow 從單行 arrow 改成有 block body（多了 opt.tap／opt.red），
     所以抽法從「找 </div>`;」改成「找 };」—— 抓的仍是同一支真正的原始碼。 */
  const i=src.indexOf('  const ovRow=(ic,label,val,sub,note,opt)=>{');
  const line=src.slice(i, src.indexOf('\n  };', i)+5);
  const ovRow=new Function('return '+line.replace(/^\s*const ovRow=/,'').replace(/;\s*$/,''))();
  const r1=ovRow('IC','教練課','$608,624','425/439 堂','',{gold:true,subPlain:true});
  ok('★ 實跑：金額在前、堂數在後', r1.indexOf('$608,624')<r1.indexOf('425/439 堂'));
  ok('★ 實跑：金額掛金色、堂數不掛金色',
     /class="ov-i-v ov-i-gold">\$608,624</.test(r1) && /class="ov-i-v2 ov-i-plain">425\/439 堂</.test(r1));
  const r2=ovRow('IC','銷課堂數','477 堂','','教練課 425・團體課 52');
  ok('　　沒帶 opt 時不加任何修飾類別', /class="ov-i-v">477 堂</.test(r2));
  ok('　　note 仍畫在標題下方', /<i class="ov-i-note">教練課 425・團體課 52<\/i>/.test(r2));
  ok('　　沒有 sub 就不畫右邊那格', r2.indexOf('ov-i-v2')<0);
}

console.log('\n銷課堂數只記教練課與團體課');
ok('★ 有明確的白名單', /const DONE_CATS=\['私人教練','小班肌力'\];/.test(src));
ok('★ 數字用白名單重算', /const doneMainCount=rangeBk\.filter\(b=>\(b\.status==='completed'\|\|b\.status==='checked_in'\)&&DONE_CATS\.includes\(b\.category\)\)\.length;/.test(src));
ok('★ 組成小字也套同一個白名單', /if\(!DONE_CATS\.includes\(b\.category\)\) return;/.test(src));
ok('★ 桌機的「銷課數」同口徑（同一個名稱不能是兩個數字）',
   /<div class="sc-label">銷課數<\/div><div><span class="sc-num">\$\{doneMainCount\}<\/span>/.test(src));
ok('　　舊的 doneCount 仍留著給別處用，沒被改掉語意',
   /const doneCount=rangeBk\.filter\(b=>b\.status==='completed'\|\|b\.status==='checked_in'\)\.length;/.test(src));
ok('　　原因寫在程式裡', /749 堂裡有 272 堂不是賣出去的課/.test(src));
{
  // 實跑組成計算：自主訓練與體驗要被濾掉
  const i=src.indexOf("  const DONE_CATS=['私人教練','小班肌力'];");
  const j=src.indexOf('\n  })();',i)+8;
  const code=src.slice(i,j);
  const rangeBk=[
    {status:'checked_in',category:'私人教練'},{status:'completed',category:'私人教練'},
    {status:'checked_in',category:'小班肌力'},
    {status:'checked_in',category:'自主訓練'},{status:'completed',category:'體驗'},
    {status:'booked',category:'私人教練'},
  ];
  const r=new Function('rangeBk',code+'\nreturn {doneMainCount,_doneMix};')(rangeBk);
  eq('★ 6 筆裡只算到 3 堂（自主／體驗／未簽到都不算）', r.doneMainCount, 3);
  eq('★ 組成只列教練課與團體課', r._doneMix, '教練課 2・團體課 1');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
