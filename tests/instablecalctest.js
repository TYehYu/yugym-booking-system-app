/* 2026-08-05 使用者指示（附截圖）：「這邊幫我改成第一個設定投保級距跟投保日，後面顯示每種金額」
   —— 勞健保管理表：級距＋加保日移到前面當設定值，勞保／健保／勞退三欄改成依級距算出的
   每月金額（上＝員工自付、下＝公司負擔）；編輯視窗即時試算。
   費率沿用薪資頁那一套（2026 官方）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');const j=src.indexOf('};',i);return src.slice(i,j+2);};

const insAmounts=new Function(grabConst('INS_R')+'\n'+grabFn('insAmounts')+'\nreturn insAmounts;')();
const E=(g,o)=>Object.assign({insured_grade:g,labor_insurance_status:'enrolled',
  health_insurance_status:'enrolled',pension_status:'enrolled'},o||{});

console.log('① 金額算得對（對照薪資頁既有級距表）');
{
  // 42,000 級距：勞保員工 1050、健保員工 651（皆與 SALARY_GLOBAL_DEFAULT.insurance_levels 一致）
  const a=insAmounts(E(42000));
  eq('★ 勞保員工自付 42000×12.5%×20%＝1,050', a.labor.emp, 1050);
  eq('★ 健保員工自付 42000×5.17%×30%＝651', a.health.emp, 651);
  eq('★ 勞退雇主提繳 42000×6%＝2,520（員工不負擔）', [a.pension.co,a.pension.emp], [2520,0]);
  eq('★ 勞保雇主含職災＋墊償 42000×(12.5%×70%＋0.1350%)＝3,732', a.labor.co, 3732);
  eq('　　健保雇主 42000×5.17%×60%＝1,303', a.health.co, 1303);
  // 級距表對照：36300 → 勞保 908、健保 563
  const b=insAmounts(E(36300));
  eq('★ 36,300 級距：勞保 908／健保 563（與級距表相同）', [b.labor.emp,b.health.emp], [908,563]);
}

console.log('\n② 健保投保金額下限 29,500');
{
  const a=insAmounts(E(12540));
  eq('★ 低於下限的級距，健保以 29,500 計＝458', a.health.emp, 458);
  eq('　　勞保仍照實際級距 12540×12.5%×20%＝314', a.labor.emp, 314);
}

console.log('\n③ 身分與狀態');
{
  const o=insAmounts(E(42000,{insurance_identity:'owner'}));
  eq('★ 負責人健保本人全額 42000×5.17%＝2,171、公司 0', [o.health.emp,o.health.co,o.health.owner], [2171,0,true]);
  const n=insAmounts(E(42000,{labor_insurance_status:'not_enrolled'}));
  eq('★ 未投保的那一種不算錢（回 null，畫面顯示狀態）', n.labor, null);
  eq('　　其他兩種照算', [!!n.health,!!n.pension], [true,true]);
  eq('★ 沒有級距 → 整列回 null（畫面提示「未設定級距」）', insAmounts(E(0)), null);
}

console.log('\n④ 版面接線');
ok('★ 表頭：級距·加保日在前，後面三欄是金額',
   /<th>投保級距 · 加保日<\/th><th>勞保<\/th><th>健保<\/th><th>勞退<\/th>/.test(src));
ok('★ 三欄都走同一支 insCell（上自付、下公司）',
   (src.match(/insCell\(a,'(labor|health|pension)'/g)||[]).length===3
   && /公司 \$\{money\(v\.co\)\}/.test(src));
ok('★ 級距欄可直接點開設定（沒設定時顯示「＋ 設定級距」）',
   /\$\{c\.insured_grade\?'\$'\+Number\(c\.insured_grade\)\.toLocaleString\(\):'＋ 設定級距'\}/.test(src));
ok('★ 加保日顯示在級距下面', /加保 \$\{String\(c\.insured_enroll_date\)\.slice\(5\)\.replace\('-','\/'\)\}/.test(src));
ok('★ 編輯視窗：級距與加保日提到最上面，改了即時試算',
   /<label>投保級距（金額）\*<\/label><input type="number" id="ins-grade"[^>]*oninput="insPreview/.test(src)
   && /function insPreview\(\)\{/.test(src)
   && /合計：員工自付/.test(src));
ok('　　費率說明列在表格下方（含健保下限與眷屬未計入）',
   /健保眷屬人數未計入。/.test(src) && /投保金額下限 \$\$\{INS_R\.nhiFloor\.toLocaleString\(\)\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
