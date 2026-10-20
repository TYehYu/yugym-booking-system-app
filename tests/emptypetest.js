/* 主管調整僱用別的窄門（2026-10-20 使用者指示：「新增這個功能進主管」）

   起因：Mango 11/1 轉合作教練，使用者人在國外要請主管按。
   但員工資料在資料庫層只放行管理員（fn_employees_guard），
   而且〔員工〕整頁本來就只有管理員進得去 —— 主管連人都點不到。

   所以做的是「窄門」，不是「把員工頁開給主管」：
     ・入口放在主管本來就看得到的班表，而且是**點僱用別小字本身**
       （那一列已經塞滿，再加一顆按鈕一定折行 —— 2026-10-19 量過）
     ・寫入一律走 fn_set_employment_type，前端只管畫

   正式庫已實跑驗過（拋棄式測試員，跑完刪掉）：
     主管改測試員 → ok，2026-09 凍結 full_time、2026-10 contractor、現值跟著變
     改自己 → EMP.SELF　改管理員 → EMP.IS_ADMIN　一般教練 → AUTH.NOT_MANAGER
     亂填身分 → TYPE.INVALID　查無此人 → EMP.NOT_FOUND　同身分 → ok+unchanged
     主管直接 update employees（不走 RPC）→ 仍被 EMP.GUARD 擋住 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 入口：點僱用別本身，不新增按鈕');
{
  ok('★★★ 僱用別在可編輯時變成按鈕、不可編輯時維持 <span>',
     /class="shn-type shn-type-act" title="調整僱用別" onclick="event\.stopPropagation\(\);openEmpTypeChange\('\$\{e\.id\}'\)"/.test(src)
     && /: `<span class="shn-type">\$\{PAY_LABEL\[e\.employment_type\|\|e\.pay_type\]\|\|''\} \$\$\{rate\}<\/span>`/.test(src));
  ok('★★★ 自己與管理員不給點（與後端同一組條件）',
     /\(_canEditShifts && String\(e\.id\)!==String\(SESSION\.id\) && e\.role!=='admin'\)/.test(src));
  ok('★★ 沒有在那一列多加一顆字鈕（0919 量過會折行）',
     !/shn-etbtn|shn-job|調整職務<\/button>/.test(src)
     && /再塞一顆字鈕一定折行/.test(src));
  ok('★ 提示用虛線底線，不換顏色（那一列的顏色是班別語意）',
     /\.shn-type\.shn-type-act\{cursor:pointer;border-bottom:1px dotted var\(--t3\);/.test(src)
     && /這一列的顏色是班別語意（紅金綠），不能借走。/.test(src));
}

console.log('\n② 前端的三道檢查（畫面，不是防線）');
{
  ok('★★ 不是主管以上就擋', /if\(!isManagerUp\(\)\)\{ showToast\('調整僱用別只有管理員或主管可以操作'\); return; \}/.test(src));
  ok('★★ 不能改自己', /if\(String\(empId\)===String\(SESSION\.id\)\)\{ showToast\('不能調整自己的僱用別'\); return; \}/.test(src));
  ok('★★ 非管理員不能改管理員',
     /if\(e\.role==='admin' && SESSION\.role!=='admin'\)\{ showToast\('管理員的僱用別只有管理員能調整'\); return; \}/.test(src));
  ok('★★★ 寫入只走 RPC，前端不直接寫 employees',
     /await sb\.rpc\('fn_set_employment_type',\{p_emp_id:empId, p_type:type\}\)/.test(src)
     && !/dbPut\('coaches',\s*e\)/.test(src.slice(src.indexOf('async function openEmpTypeChange'),
                                                 src.indexOf('function openWeeklyShift'))));
  ok('★ 前端只管畫這件事寫在原地', /前端這裡只管畫，不是防線。/.test(src));
}

console.log('\n③ 畫面要跟實際會發生的事一致');
{
  ok('★★★ 這個月已經有快照且身分相同 → 寫「沿用已經設好的條件」，不套模板',
     /const _effOf=\(k,snap\)=>snap\|\|\(\(window\.SALARY_TPL\|\|\{\}\)\[k\]\|\|\{\}\);/.test(src)
     && /const keep=\(pre && normEmp\(pre\.employment_type\)===k\);/.test(src)
     && /沿用已經設好的條件/.test(src));
  ok('★★ 兩張視窗用同一份條件算「有沒有底薪」',
     /const _base=Number\(\(_effOf\(k, keep\?pre:null\)\|\|\{\}\)\.base_salary\)\|\|0;/.test(src)
     && /function empTypeGo\(empId, type, baseSalary\)\{/.test(src)
     && src.indexOf("_base>0?`底薪 $${_base.toLocaleString()}。`:'<b>沒有底薪</b>。'")>=0);
  ok('★★ 列的寫法照定版 .bk-opt（名字在左、條件靠右）',
     /<span class="bk-opt-l"><b class="bk-opt-t">\$\{lb\}<\/b>/.test(src)
     && /<span class="bk-opt-r">\$\{on\?'':escH\(_tplLine\(k, keep\?pre:null\)\)\}<\/span>/.test(src));
  ok('★★ 講明勞保要另外辦（系統做不到的事要寫出來）',
     /勞保加退保要另外去勞保局辦，系統不會做。/.test(src));
  ok('★ 生效月份寫在畫面上', /\$\{ym\.replace\('-','\/'\)\} 起生效，上個月以前的薪資不受影響。/.test(src));
}

console.log('\n④ 動錢的操作：二次確認＋防連按＋清快取');
{
  ok('★★★ 要再確認一次才送出',
     /function empTypeGo\(/.test(src) && /確定改成「\$\{lb\}」？/.test(src)
     && /onclick="empTypeRun\('\$\{empId\}','\$\{type\}'\)">確定調整<\/button>/.test(src));
  ok('★★ 防連按走 onceAct', /return onceAct\('emptype:'\+empId, async \(\)=>\{/.test(src));
  ok('★★★ RPC 繞過 dbPut → 一定要 dbCacheClear（CLAUDE.md 的規矩）',
     /dbCacheClear\('coaches'\);/.test(src)
     && /RPC 繞過 dbPut，快取不會自己失效/.test(src));
  ok('★★ 後端的錯誤碼都翻成人看得懂的話',
     ['AUTH.NOT_MANAGER','AUTH.FORBIDDEN','EMP.SELF','EMP.IS_ADMIN','EMP.NOT_FOUND','TYPE.INVALID']
       .every(c=>src.indexOf("'"+c+"':")>=0));
  ok('★ 同身分再按會講一聲，不是靜悄悄',
     /d\.unchanged \? '本來就是這個僱用別，沒有變動'/.test(src));
}

console.log('\n⑤ 只做當月；預排未來仍然只有管理員（薪資規則視窗）');
ok('★★ 寫在原地', /只做「當月生效」。要預先排下個月的，仍然只有管理員能做（薪資規則視窗）。/.test(src));
ok('★★ 四種身分都列得出來',
   /const EMP_TYPE_PICK=\[\['full_time','正職'\],\['part_time','兼職'\],\s*\n\s*\['contractor','合作教練'\],\['intern','工讀'\]\];/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
