/* 2026-08-08 使用者定案：「我們的淨利應該是教練們的銷課金額扣掉所有支出」

   起因：使用者看 7 月的損益表發現是負數。查下來不是真的虧 ——
     ・7 月的票有 127 張是舊系統轉入的，只寫進 member_tickets、沒有收款紀錄
       （金額 $338,850）→ 損益表的「營業額」只認得到 $165,100，實際售票 $497,550
     ・但薪資是照整個 7 月的 776 堂課算的，房租也是整月
     → 收入缺三分之二、支出整月，當然是負的。
   而且就算資料完整，用「收款」當營收本來就不適合這門生意：
   客人一次買 20 堂、錢在一月收、課上到六月 —— 賣票那個月暴賺、之後每個月都在虧。

   改法：營收改認**銷課**（這個月上掉了多少錢的課）。
   ⚠ 營業稅的基礎仍是**收款** —— 稅是對實際開出去的銷售額課的，
     混用會算出一個不存在的稅額。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 銷課怎麼算（實跑）');
{
  const env={
    bkCounts:()=>true,
    bkIsGroup:b=>b.category==='小班肌力',
    grpHeadsNoLeave:b=>(b.member_ids||[]).length,
    dbGetAll:async()=>[],
  };
  /* 2026-08-13 銷課分類：monthSalesValue 內用到 tkRevClass，一併抽真的進沙箱 */
  const F=new Function(...Object.keys(env), grabFn('tkRevClass')+'\n'+grabFn('monthSalesValue')+'\nreturn monthSalesValue;')(...Object.values(env));
  const types=[{id:'tt-pt',category:'私人教練'},{id:'tt-grp',category:'團體課'},{id:'tt-self',category:'自主訓練'}];
  const tks=[
    {id:'T1',member_id:'M1',ticket_type_id:'tt-pt', unit_price:1600, amount_paid:16000, sessions_total:10},
    {id:'T2',member_id:'M2',ticket_type_id:'tt-pt', unit_price:0,    amount_paid:24000, sessions_total:10}, // 沒單價 → 24000/10
    {id:'T3',member_id:'M3',ticket_type_id:'tt-grp',unit_price:0,    amount_paid:2000,  sessions_total:4},  // 團課 500/堂
    {id:'T9',member_id:'M9',ticket_type_id:'tt-self',unit_price:0,   amount_paid:0,     sessions_total:2},  // 贈點不入帳
  ];
  const bks=[
    {id:'B1',date:'2026-08-03',category:'私人教練',status:'checked_in',member_id:'M1',ticket_id:'T1'},
    {id:'B2',date:'2026-08-04',category:'私人教練',status:'completed', member_id:'M2',ticket_id:'T2'},
    {id:'B3',date:'2026-08-05',category:'小班肌力',status:'checked_in',member_ids:['M3','M3']},
    {id:'B4',date:'2026-08-06',category:'私人教練',status:'booked',    member_id:'M1',ticket_id:'T1'},  // 還沒上 → 不算
    {id:'B5',date:'2026-07-30',category:'私人教練',status:'checked_in',member_id:'M1',ticket_id:'T1'},  // 別的月份
    {id:'B6',date:'2026-08-07',category:'自主訓練',status:'checked_in',member_id:'M9',ticket_id:'T9'},  // 自主訓練不算
  ];
  (async()=>{
    const r=await F('2026-08',[bks,tks,types]);
    eq('★★ 教練課：1,600 ＋ 2,400（沒單價就用 總額÷總堂）', Math.round(r.ptValue), 4000);
    eq('★ 教練課堂數只數已上的', r.ptCount, 2);
    eq('★★ 團課：一堂兩個名額 × 500', Math.round(r.grpValue), 1000);
    eq('★ 團課人次（請假不算，這裡兩個名額都在）', r.grpHeads, 2);
    eq('★★ 銷課合計＝教練課＋團課（自主訓練贈點不入帳）', Math.round(r.salesValue), 5000);
    eq('　　已上的課總數（不含還沒上的、不含別的月份）', r.doneCount, 4);

    console.log('\n② 損益表改用銷課當營收');
    const P=grabFn('finPnl');
    ok('★★ 營收＝銷課', /const SV=await monthSalesValue\(ym\);/.test(P)
       && /const revenue=Math\.round\(SV\.salesValue\);/.test(P));
    ok('★★ 淨利＝銷課 − 稅 − 薪資 − 勞健保 − 固定 − 其他（＝銷課扣掉所有支出）',
       /const net=revenue-tax-salary-coIns-fixedTotal-otherTotal;/.test(P));
    ok('★★ 稅的基礎仍是收款（不是銷課）',
       /const taxBase=Math\.round\(cash\/1\.05\);/.test(P) && /const tax=cash-taxBase;/.test(P));
    ok('★ 為什麼稅不能用銷課算，寫在原地',
       /稅是對「實際開出去的銷售額」課的，\s*\n\s*所以基礎仍是\*\*收款\*\*，不是銷課 —— 兩者混用會算出一個不存在的稅額。/.test(P));
    ok('★★ 大數字那一塊改講「銷課 − 支出」',
       /<span class="pnl2-hero-say">銷課 \$\{m\(revenue\)\} − 支出 \$\{m\(spend\)\}/.test(P)
       && /<span class="pnl2-head-l">銷課金額<\/span>/.test(P));
    /* 0823 兩欄改版：分類列改畫在左欄的 .pnl2-i，分類來源與順序沒變 */
    ok('★ 把銷課拆成課種分類列（2026-08-13：教練課/友善 × 1V1/1V2、團體課）',
       /REV_CLS_ORDER\.filter\(k=>k!=='grp'&&\(SV\.byCls\[k\]\|\|\{\}\)\.n>0\)\.map\(k=>/.test(P)
       && /<span class="pnl2-i-l">團體課<i>\$\{SV\.grpCount\} 堂 \$\{SV\.grpHeads\} 人次<\/i><\/span>/.test(P));
    ok('★★ 收款仍看得到（與銷課並列，不會以為錢不見了）',
       /本月實際<b>收款<\/b> \$\{m\(cash\)\}（\$\{pur\.length\} 筆）—— 與銷課是兩件事，只用來算營業稅。/.test(P));
    ok('★ 銷課的定義寫在畫面上',
       /<b>銷課金額<\/b>＝這個月已簽到／已完成的課 × 那堂用的票的單價（自主訓練贈點與體驗課不計）。/.test(P));

    console.log('\n③ 只有一份計算');
    ok('★★ 營運卡改吃同一支（不再自己算一遍）',
       /const SV=await monthSalesValue\(month,\[bookings,mtks,types\]\);/.test(src)
       && /const salesValue=SV\.salesValue, ptValue=SV\.ptValue, grpValue=SV\.grpValue;/.test(src));
    ok('★ 舊的那份行內計算已移除',
       !/const ptDoneList=done\.filter\(b=>b\.category==='私人教練'\);\n\s*const ptValue=ptDoneList\.reduce/.test(src));
    ok('★ 為什麼要共用，寫在原地',
       /這是損益表與下方營運卡共用的\*\*唯一一份\*\*計算。兩邊各算一次，/.test(src));
    ok('★ 呼叫端可以把已載好的表傳進去（同一頁不重抓）',
       /async function monthSalesValue\(ym, pre\)\{/.test(src)
       && /const \[bookings,mtks,types\] = pre \|\| await Promise\.all\(\[/.test(src));

    console.log('\n④ 為什麼要改，寫在程式裡');
    ok('★★ 7 月那個負數的真正原因記下來',
       /（7 月就是這樣：舊系統轉入的票沒有收款紀錄，營業額只認得到三分之一，\s*\n\s*但薪資與房租是整月的，於是算出來是負的。）/.test(src));
    ok('★ 使用者的原話',
       /「我們的淨利應該是教練們的銷課金額扣掉所有支出」/.test(src));
    ok('★ 為什麼不用收款當營收',
       /客人一次買 20 堂、錢在一月收，課上到六月 ——\s*\n\s*用收款當營收，賣票的那個月暴賺、之後每個月都在虧，看不出真實經營狀況。/.test(src));

    console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
    /* 2026-08-13：課種分類實跑（教練課/友善 × 1V1/1V2、團體課、其他） */
    {
      const C=new Function(grabFn('tkRevClass')+'\nreturn tkRevClass;')();
      const tm={pt:{id:'pt',category:'私人教練',name:'一般教練課 1V1'},
                pt2:{id:'pt2',category:'私人教練',name:'一般教練課 1V2'},
                fr:{id:'fr',category:'私人教練',name:'友善教練課',color:'friendly'},
                g:{id:'g',category:'團體課',name:'一般團體課'},
                ms:{id:'ms',category:'運動按摩',name:'運動按摩'}};
      eq('★ 教練課 1V1', C({ticket_type_id:'pt',plan_name:'一般教練課 1V1'},tm), 'pt1');
      eq('★ 教練課 1V2（票種名認得出）', C({ticket_type_id:'pt2',plan_name:'自訂方案'},tm), 'pt2');
      eq('★ 友善 1V2（format 認得出）', C({ticket_type_id:'fr',plan_name:'友善一般',format:'1V2'},tm), 'fr2');
      eq('★ 團體課', C({ticket_type_id:'g',plan_name:'團課 4週優惠'},tm), 'grp');
      eq('★ 按摩／其他', C({ticket_type_id:'ms',plan_name:'運動按摩'},tm), 'other');
      eq('★ 對不到票 → 其他', C(null,tm), 'other');
      console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗（含課種分類）');
    }
    process.exit(fail?1:0);
  })();
}
