/* 2026-08-02 使用者指示（附截圖，員工列表的「實領薪資」欄）：
   「點擊薪資數字，可以直接跳出完整薪資明細，用視窗顯示」

   薪資單原本只有兩個入口：帳號選單（看自己的）與切進某位員工的範圍（coach_salary 整頁）。
   管理員在員工列表看到一整排實領金額，想確認某個數字怎麼來的時候，要先切範圍、
   再進薪資頁、看完再切回來 —— 所以直接讓那個數字點得開同一份彈窗。

   要小心的兩件事：
   ① 整列本來就會開員工明細 → 這一格要 stopPropagation，不然兩個視窗一起開。
   ② 彈窗是共用的，看完別人的要把指定對象清掉，否則下次從帳號選單開會變成看別人的。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 員工列表：薪資數字點得開');
/* 2026-08-02 使用者回報：「我點 7 月的要跳 7 月的內容啊」——
   員工列表可以翻月，點的必須是「那一列那個月」的明細，不能永遠開本月。 */
ok('★ 數字包在可點的元素裡，指向薪資彈窗，並且把列表現在看的月份一起帶過去',
   /<b class="st-l-paytap" title="看 \$\{c\.name\|\|''\} \$\{_ym\.replace\('-','年'\)\}月的完整薪資明細" onclick="event\.stopPropagation\(\);openSalarySheet\('\$\{c\.id\}','\$\{_ym\}'\)">/.test(src));
ok('　　帶的就是列表正在看的那個月（不是今天所在的月）',
   /const _ym=stMonthCur\(\);/.test(src));
ok('★ 點數字不會順便開員工明細（整列本來就可點）',
   /onclick="event\.stopPropagation\(\);openSalarySheet/.test(src));
ok('★ 沒納入計薪的（離職／待接受邀請）維持破折號，不給點',
   /st\.net==null \? '<i class="st-l-none">—<\/i>'/.test(src));
ok('★ 看不到金額的角色只看到 •••，也不會有可點的東西',
   /const payCell = !_canPay \? '<i class="st-l-none">•••<\/i>'/.test(src));
ok('　　只有管理員看得到金額（沿用原本的判斷）',
   /const _canPay = !!\(SESSION && SESSION\.role==='admin'\);/.test(src));
ok('　　看得出來點得動（游標＋hover 變色）',
   /\.st-l-paytap\{[^}]*cursor:pointer;/.test(src)
   && /\.st-l-paytap:hover\{background:var\(--sage-bg,#eef4ee\);color:var\(--green,#1f6f54\);\}/.test(src));
ok('　　平常長得跟原本一樣（font:inherit，不會突然變成按鈕）',
   /\.st-l-paytap\{[^}]*font:inherit;color:inherit;/.test(src));

console.log('\n② 彈窗指定看誰的薪資');
{
  const body=grabFn('openSalarySheet');
  const run=(empId, role, ym, cur)=>{
    const win=cur?{_salaryMonth:cur}:{};
    const toasts=[];
    const env={ closeAcctMenu:()=>{}, SESSION:{id:'ME', role}, showToast:t=>toasts.push(t),
      window:win, ymd:()=>'2026-08-02', TODAY:new Date(2026,7,2),
      document:{ getElementById:()=>null, createElement:()=>({classList:{add(){}},addEventListener(){}, style:{}}),
        body:{ appendChild(){}, classList:{add(){}} } },
      renderSalaryContent:()=>{} };
    const f=new Function(...Object.keys(env), body+'\nreturn openSalarySheet;')(...Object.values(env));
    f(empId, ym);
    return {win, toasts};
  };

  let r=run('E7','admin');
  eq('★ 從員工列表帶 id 進來 → 記下要看誰的', r.win._salaryEmpId, 'E7');
  r=run(undefined,'admin');
  eq('★ 帳號選單不帶 id → 清成 null（看自己的）', r.win._salaryEmpId, null);
  r=run('E7','front_desk');
  eq('★ 櫃台就算硬呼叫也看不到別人的薪資', r.win._salaryEmpId, undefined);
  ok('　　　　而且會講原因', /只有管理員可以查看其他員工的薪資/.test(r.toasts.join('')));
  r=run(undefined,'coach');
  eq('　　教練看自己的不受影響（不帶 id 就放行）', r.win._salaryEmpId, null);

  r=run('E7','admin','2026-07','2026-08');
  eq('★ 點 7 月那一列 → 彈窗停在 7 月（不是今天所在的 8 月）', r.win._salaryMonth, '2026-07');
  r=run(undefined,'admin',undefined,'2026-05');
  eq('　　不帶月份 → 沿用上次看的月份（帳號選單那條路不受影響）', r.win._salaryMonth, '2026-05');
  r=run(undefined,'admin');
  eq('　　第一次開又沒帶月份 → 預設本月', r.win._salaryMonth, '2026-08');
}
ok('　　為什麼月份要跟著來源走，寫在程式裡',
   /不然看到的明細跟剛剛點的數字對不起來。/.test(src));
ok('★ 關掉視窗要把指定對象清掉（不然下次看自己的會看到別人）',
   /function closeSalarySheet\(\)\{[\s\S]*?window\._salaryEmpId=null;\n\}/.test(src));
ok('　　為什麼要清，寫在程式裡',
   /看完要清掉，否則下次看自己的會變成看別人的。/.test(src));

console.log('\n③ 薪資內容照指定的人算');
{
  const i=src.indexOf('async function renderSalaryContent(TARGET, withHead){');
  const seg=src.slice(i, i+2600);
  ok('★ 優先順序：彈窗指定 ＞ 員工範圍 ＞ 自己',
     /const empId = window\._salaryEmpId \|\| \(_salScoped \? SCOPE\.id : SESSION\.id\);/.test(seg));
  ok('　　優先順序寫在程式裡', /_salaryEmpId（彈窗指定）＞ 員工範圍（管理員切進某位員工）＞ 自己/.test(seg));

  // 彈窗標題會跟著換人
  const pick=(l)=>{ let t=null;
    const env={ withHead:false, me:{id:l.meId,name:l.name}, SESSION:{id:'ME'},
      document:{ querySelector:()=>({ set textContent(v){ t=v; }, get textContent(){ return t; } }) } };
    const code=`if(!withHead){
    const _t=document.querySelector('#salary-sheet-ov .sheet-title');
    if(_t) _t.textContent = (me && me.id!==(SESSION&&SESSION.id)) ? \`薪資單 · \${me.name||''}\` : '薪資單';
  }`;
    new Function(...Object.keys(env), code)(...Object.values(env));
    return t; };
  eq('★ 看別人的 → 標題帶名字（不然分不出看的是誰）', pick({meId:'E7',name:'小曾'}), '薪資單 · 小曾');
  eq('★ 看自己的 → 標題就是「薪資單」', pick({meId:'ME',name:'我'}), '薪資單');
  ok('　　整頁版不去動彈窗標題（withHead 時跳過）', /if\(!withHead\)\{\n\s*const _t=document\.querySelector\('#salary-sheet-ov \.sheet-title'\);/.test(seg));
}
ok('　　月份下拉在彈窗裡照舊可用（換月不會換掉看的人）',
   /function salarySheetPickMonth\(ym\)\{ if\(!ym\) return; window\._salaryMonth=ym; renderSalaryContent/.test(src)
   && !/salarySheetPickMonth[\s\S]{0,120}_salaryEmpId/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
