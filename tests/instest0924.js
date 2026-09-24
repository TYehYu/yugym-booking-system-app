/* 勞健保金額：用 115/08（2026-08）的三張實際繳款單逐筆對帳（2026-09-24）

   使用者：「可以幫我查一下目前勞健保的金額　我今天收到繳費帳單　好像有出入」

   帳單（筋實堂，投保單位 01480791W／154192720）：
     勞保繳款單   16,340（個人 2,659＋908、單位 9,503＋3,234、墊償 36）
     健保計算表   12,570（自付 4,845、單位負擔 7,725、被保險人 6 人）
     勞退提繳     8,558（雇主 6%）
     投保薪資總額 142,640（勞保／勞退）、受僱者投保金額總額 159,600（健保）

   對出三件事：
     ① 余東翰的投保級距是 36,300，系統存成 34,800（34,800 的下一級）
        → 五個數字同時吻合，見下面的 ①
     ② 職災費率 0.11% → 0.16%（行業別 9312 運動場館：上下班 0.07%＋行業別 0.09%）
     ③ 健保雇主負擔漏乘「平均眷口數」0.56 —— 每位每月少算約 500

   ⚠ 薪資單那條路（calcSalary ⑧ 查 insurance_levels.co_total）本來就是對的，
     那張表抄的是官方對照表、已經含眷口數；錯的只有人事頁即時算的 insAmounts。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${a}，帳單 ${e}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const INS_R=eval('('+/const INS_R=(\{[\s\S]*?\});/.exec(src)[1]+')');
const fn=new Function('INS_R','window', grab('insAmounts')+'\nreturn insAmounts;')(INS_R,{SALARY_GLOBAL:{}});

/* 八月實際在保名單（級距＝更正後） */
const E=(name,grade,identity,opts)=>Object.assign({name, insured_grade:grade,
  insurance_identity:identity||'employee',
  labor_insurance_status:'enrolled', health_insurance_status:'enrolled', pension_status:'enrolled'}, opts||{});
const ROSTER=[
  E('余東曄',45800,'owner',{labor_insurance_status:null, pension_status:null}),
  E('余東翰',36300),                     /* ← 系統原本存 34,800 */
  E('黃沛瀞',34800),
  E('鄭百益',29500),
  E('黃美蓉',29500),
  E('曾邦宏',12540),
];
const A=ROSTER.map(c=>({c, a:fn(c)}));
const sum=f=>A.reduce((s,x)=>s+(f(x.a)||0),0);

console.log('① 余東翰 36,300：五個數字同時吻合');
{
  const laborBase=ROSTER.filter(c=>c.labor_insurance_status==='enrolled')
    .reduce((s,c)=>s+c.insured_grade,0);
  eq('★★★ 勞保／勞退投保薪資總額 142,640', laborBase, 142640);
  /* 勞保個人 ＝ 投保薪資 × 2.5%（普通事故 11.5%×20% ＋ 就保 1%×20%）。
     帳單把「全月無異動」與「本月有異動」分開列：余東翰 8/1 才加保，落在有異動那一欄。 */
  const noChange=['黃沛瀞','鄭百益','黃美蓉','曾邦宏']
    .reduce((s,n)=>s+ROSTER.find(c=>c.name===n).insured_grade,0);
  eq('★★★ 全月無異動 106,340 × 2.5% ＝ 個人 2,659', Math.round(noChange*0.025), 2659);
  eq('★★★ 本月有異動（余東翰 36,300）× 2.5% ＝ 個人 908', Math.round(36300*0.025), 908);
  eq('　　（對照）存 34,800 時只算得出 870 —— 使用者看到的出入', Math.round(34800*0.025), 870);
  eq('★★★ 勞退 142,640 × 6% ＝ 8,558', sum(a=>a.pension&&a.pension.co), 8558);
  /* 健保：受僱者（不含負責人）的投保金額總額，12,540 那位拉到下限 29,500 */
  const nhiBase=ROSTER.filter(c=>c.insurance_identity!=='owner')
    .reduce((s,c)=>s+Math.max(c.insured_grade,29500),0);
  eq('★★★ 健保受僱者投保金額總額 159,600', nhiBase, 159600);
  eq('★★★ 健保員工自付 4,845（負責人全額自付＋五位受僱者 30%）',
     sum(a=>a.health&&a.health.emp), 4845);
}

console.log('\n② 職災 0.16%（行業別 9312），不是寫死的 0.11%');
{
  ok('★★★ 預設改成 0.16%', /occ:0\.0016,/.test(src));
  ok('★★★ 做成設定值，行業別變了不用改程式',
     /occ_rate: 0\.0016,/.test(src)
     && /const _occ=\(Number\(_G\.occ_rate\)>0\)\?Number\(_G\.occ_rate\):INS_R\.occ;/.test(src));
  ok('★★ 理由寫在原地（職災費率是行業別的）',
     /職災費率是\*\*行業別\*\*的，不是固定 0\.11%/.test(src));
  /* 墊償基金 0.025%：帳單 142,640 × 0.025% ＝ 36 */
  eq('★★ 墊償基金 142,640 × 0.025% ＝ 36', Math.round(142640*0.00025), 36);
}

console.log('\n③ 健保雇主負擔要乘 (1 ＋ 平均眷口數 0.56)');
{
  eq('★★★ 單位負擔 ≒ 7,725（逐人四捨五入，容許 ±5）',
     Math.abs(sum(a=>a.health&&a.health.co)-7725)<=5 ? 7725 : sum(a=>a.health&&a.health.co), 7725);
  const plain=new Function('INS_R','window', grab('insAmounts')+'\nreturn insAmounts;')(
    Object.assign({},INS_R,{nhiDep:0}), {SALARY_GLOBAL:{nhi_avg_dependents:0}});
  const before=ROSTER.reduce((s,c)=>{const a=plain(c);return s+((a.health&&a.health.co)||0);},0);
  eq('　　（對照）沒有眷口數時只有 4,950 —— 帳單差快 2,800 就是這個', before, 4950);
  ok('★★★ 做成設定值（健保署每年公告）',
     /nhi_avg_dependents: 0\.56,/.test(src)
     && /const _dep=\(_G\.nhi_avg_dependents!=null&&_G\.nhi_avg_dependents!==''\)/.test(src));
  ok('★★★ 員工自付**不**乘眷口數（眷屬那一份是眷屬自己的）',
     /emp:R\(nhiBase\*INS_R\.nhi\*INS_R\.nhiEmp\),/.test(src)
     && /co:R\(nhiBase\*INS_R\.nhi\*INS_R\.nhiCo\*\(1\+_dep\)\)/.test(src));
  ok('★★ 負責人維持「本人全額自付、單位 0」—— 對帳證明這個設定是對的',
     /owner \? \{emp:R\(nhiBase\*INS_R\.nhi\), co:0, owner:true\}/.test(src)
     && /負責人維持|負責人健保由本人全額自付/.test(src));
}

console.log('\n④ 薪資單那條路沒被動到');
{
  ok('★★★ calcSalary 仍然查級距表的 co_total（那張表已含眷口數）',
     /const insCoTotal = lvl\?\(Number\(lvl\.co_total\)\|\|0\):0;/.test(src)
     || /Number\(lvl\.co_total\)/.test(src));
  ok('★★ 兩條路的差別寫在原地（下次不要又只改一邊）',
     /薪資單那條路（calcSalary ⑧ 查 insurance_levels\.co_total）\*\*本來就是對的\*\*/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
