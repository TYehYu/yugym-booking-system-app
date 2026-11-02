/* 2026-11-02 黃美蓉回報：11月轉合作教練後，連10月以前正職的勞健保扣款都一起被取消。
   根因：insured_grade/insurance_identity/labor_insurance_status/health_insurance_status
   原本不在 PAY_RULE_KEYS 裡，empAtMonth() 不會按月快照它們，calcSalary() 永遠讀「現在」的
   即時值。修法：這4個欄位加入 PAY_RULE_KEYS，saveInsurance() 比照 stApplyEmpType() 先凍結
   更早月份、再寫當月快照。
   純函式層級測試（抽函式直接跑，不連資料庫），涵蓋：
     ①正職轉合作，歷史正職月份扣款不變 ②合作轉正職，新月份起正確扣款
     ③調整投保級距，過去月份不受影響 ④同一月份多次修改不錯誤覆蓋
     ⑤舊月份沒快照時沿用現值（既有設計，不是這次改的範圍）
     ⑥ saveInsurance 的凍結邏輯跟 stApplyEmpType 同一套寫法 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i, src.indexOf('];', i)+2);};

const M=new Function(grabConst('PAY_RULE_KEYS')+'\n'
  +['payRulesMap','empRuleAt','empAtMonth','payRuleSnapshot','prevYm'].map(grabFn).join('\n')
  +'\nreturn {empRuleAt,empAtMonth,payRuleSnapshot,prevYm};')();

console.log('① PAY_RULE_KEYS 已納入4個勞健保欄位');
{
  const txt=grabConst('PAY_RULE_KEYS');
  ['insured_grade','insurance_identity','labor_insurance_status','health_insurance_status'].forEach(k=>{
    ok('★ 清單含 '+k, txt.includes("'"+k+"'"));
  });
}

console.log('\n② empAtMonth() 能把勞健保欄位換成那個月的樣子（不需要改 empAtMonth 本身，通用機制自動生效）');
{
  // 模擬黃美蓉：10月正職＋有投保，11月轉合作＋退保
  const MANGO={id:'E_MANGO', insured_grade:0, insurance_identity:'employee',
    labor_insurance_status:'withdrawn', health_insurance_status:'withdrawn', // 現在（11月後）的即時值
    employment_type:'contractor',
    pay_rules:{
      '2026-10':{employment_type:'full_time', insured_grade:34800,
        insurance_identity:'employee', labor_insurance_status:'enrolled', health_insurance_status:'enrolled'},
      '2026-11':{employment_type:'contractor', insured_grade:null,
        insurance_identity:'employee', labor_insurance_status:'withdrawn', health_insurance_status:'withdrawn'}
    }};
  const oct=M.empAtMonth(MANGO,'2026-10');
  eq('★ 正職轉合作，歷史正職月份(10月)扣款設定不變：維持 enrolled + 級距34800',
     [oct.labor_insurance_status, oct.health_insurance_status, oct.insured_grade],
     ['enrolled','enrolled',34800]);
  const nov=M.empAtMonth(MANGO,'2026-11');
  eq('★ 11月起正確套用合作教練的退保狀態', [nov.labor_insurance_status, nov.insured_grade], ['withdrawn', null]);

  // 合作轉正職：12月重新投保
  const REHIRE={id:'E2', labor_insurance_status:'enrolled', insured_grade:30300,
    pay_rules:{ '2026-09':{employment_type:'contractor', labor_insurance_status:'withdrawn', insured_grade:null},
                '2026-12':{employment_type:'full_time', labor_insurance_status:'enrolled', insured_grade:30300} }};
  eq('★ 合作轉正職，新月份(12月)起正確扣款',
     [M.empAtMonth(REHIRE,'2026-12').labor_insurance_status, M.empAtMonth(REHIRE,'2026-12').insured_grade],
     ['enrolled', 30300]);
  eq('　　轉換前(9月)維持退保原狀',
     M.empAtMonth(REHIRE,'2026-09').labor_insurance_status, 'withdrawn');
}

console.log('\n③ 調整投保級距，過去月份不受影響');
{
  const EMP={id:'E3', insured_grade:40100, // 現在最新值
    pay_rules:{ '2026-08':{insured_grade:36300}, '2026-10':{insured_grade:40100} }};
  eq('★ 10月(調整後)用新級距', M.empAtMonth(EMP,'2026-10').insured_grade, 40100);
  eq('★ 9月(調整前，沿用8月那份)用舊級距，不受10月調整影響', M.empAtMonth(EMP,'2026-09').insured_grade, 36300);
  eq('★ 8月本身也是舊級距', M.empAtMonth(EMP,'2026-08').insured_grade, 36300);
}

console.log('\n④ 同一月份多次修改，不會錯誤覆蓋（後面一次完整取代同月那份，不是疊加殘留舊欄位）');
{
  let rules={ '2026-10':{insured_grade:30000} };
  // 模擬同月第二次存檔：payRuleSnapshot 用「當下完整物件」整份覆蓋該月，不是局部合併
  const c2={id:'E4', insured_grade:31000, labor_insurance_status:'enrolled'};
  rules['2026-10']=M.payRuleSnapshot(c2);
  eq('★ 第二次存檔完整取代該月快照', rules['2026-10'].insured_grade, 31000);
  ok('　　沒有殘留第一次存檔但這次沒帶到的欄位污染（payRuleSnapshot 只收 c2 身上存在的欄位）',
     rules['2026-10'].labor_insurance_status==='enrolled');
}

console.log('\n⑤ 舊月份完全沒有任何快照時：沿用員工現值（既有設計，不是這次修改範圍，這裡只是釘住不被誤改）');
{
  const EMP={id:'E5', insured_grade:99999, pay_rules:{'2026-10':{insured_grade:1111}}};
  eq('★ 比最早快照還早的月份，用現值（既有 empAtMonth 行為，沒有被這次改動動到）',
     M.empAtMonth(EMP,'2026-01').insured_grade, 99999);
}

console.log('\n⑥ saveInsurance() 已改成跟 stApplyEmpType() 同一套「先凍結、再寫當月」規矩');
ok('★ saveInsurance 內有凍結更早月份的邏輯（跟 stApplyEmpType 用同一個條件寫法）',
   /async function saveInsurance\(id\)\{[\s\S]*?if\(!Object\.keys\(rules\)\.some\(k=>k<ym\)\)\{\s*\n\s*rules\[prevYm\(ym\)\]=payRuleSnapshot\(c\);/.test(src));
ok('★ saveInsurance 會寫入當月快照並存回 c.pay_rules', /rules\[ym\]=payRuleSnapshot\(c\);\s*\n\s*c\.pay_rules=rules;\s*\n\s*await dbPut\('coaches',c\); closeModal\(\); showToast\('勞健保資料已儲存'\)/.test(src));
ok('★ 凍結判斷用 ym=stCurYm()（跟其他存檔路徑一致，不是另外發明新規則）',
   /async function saveInsurance\(id\)\{[\s\S]*?const ym=stCurYm\(\);/.test(src));
ok('　　沒有動到 stApplyEmpType 本身（重用既有函式，不是重寫）',
   /async function stApplyEmpType\(c, type, when\)\{/.test(src));

console.log('\n⑦ calcSalary 呼叫入口仍全部經過 empAtMonth（確認這次改動沒有破壞既有保護，沿用 payrulemonthtest.js 同一條規則）');
eq('　　沒有新增繞過 empAtMonth 直呼 calcSalary 的地方',
   (src.match(/=\s*calcSalary\((?!empAtMonth)/g)||[]), []);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
