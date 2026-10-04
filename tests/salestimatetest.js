/* 薪資單的「應領合計」漏扣請假（2026-10-04 使用者：「美蓉這邊病假681看起來沒有扣進去　應領合計」）。

   黃美蓉 2026-10 的實例：底薪 29,500（保障底薪高於課費 7,200）＋團課費 800 ＝ 應發 30,300；
   10/04 病假 6 小時 × 時薪 227 × 50% ＝ −681 → 應領 29,619。
   畫面上「病假 6 小時（半薪） −$681」那一列列得出來，應領合計卻還是寫 $30,300 ——
   因為它直接讀 sal.grossPay（應發，還沒扣請假）。

   順序以管理員那張表為準（0801 定）：應發合計 → 請假扣薪 → 應領 → 勞健保 → 實領。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 應領 ＝ 應發 − 請假扣薪');
ok('★★★ estimate 不再直接等於 grossPay',
   !/const estimate=countSalary\?sal\.grossPay:0;/.test(src));
ok('★★★ estimate 扣掉 leaveDeduct（且不會變負數）',
   /const estimate=countSalary\?Math\.max\(sal\.grossPay-sal\.leaveDeduct,0\):0;/.test(src));
/* calcSalary 那一端本來就是對的，別為了這個 bug 去動它 */
ok('★★★ 實領仍是 應發 − 請假 − 勞健保（calcSalary 沒被動到）',
   /const netPay   = Math\.max\(grossPay - leaveDeduct - insEmpDeduct, 0\);/.test(src));
ok('★★ 應發 grossPay 本身不含請假扣款（請假在最後統一扣，0801）',
   /const grossPay = ptIncome \+ bonus \+ groupPay \+ dutyPay \+ renewPay \+ mgmtPay \+ bdayPay;/.test(src));

console.log('\n② 數字對得起來（美蓉 2026-10）');
const gross=29500+800, cut=Math.round(6*Math.round(29500/130)*0.5);
ok('★★★ 請假時薪 227、病假半薪扣 681', Math.round(29500/130)===227 && cut===681, {hr:Math.round(29500/130), cut});
ok('★★★ 應領 29,619（30,300 − 681）', Math.max(gross-cut,0)===29619, Math.max(gross-cut,0));

console.log('\n③ 明細列的順序');
ok('★★★ 請假扣款列在「應發合計」底下，不在底薪旁邊',
   src.indexOf("h+=row('應發合計'") > 0
   && src.indexOf("myLeave.病假>0) h+=ded(") > src.indexOf("h+=row('應發合計'")
   && src.indexOf("h+=row('應領合計'") > src.indexOf("myLeave.病假>0) h+=ded(")
   && src.indexOf("h+=row('教練課費'") < src.indexOf("h+=row('應發合計'"));
ok('★★ 沒請假的人不畫「應發合計」（應發＝應領，同一個數字不講兩遍）',
   /if\(sal\.leaveDeduct>0\)\{\s*\n\s*h\+=row\('應發合計'/.test(src));
/* adjBase 自 0801 就恆等於 base，那一列永遠寫著與底薪一樣的數字 */
ok('★★★ 「調整後底薪」那一列已移除', !/row\('調整後底薪'/.test(src));
ok('★★ 不扣薪的假別照列（特休／喪假／其他）',
   /特休 \$\{myLeave\.特休\} 小時[\s\S]{0,200}?不扣薪/.test(src)
   && /喪假 \$\{myLeave\.喪假\} 小時/.test(src) && /其他假 \$\{myLeave\.其他\} 小時/.test(src));

console.log(`\n${fail?'✗':'✓'} ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
