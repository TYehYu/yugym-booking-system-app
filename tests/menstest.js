/* 生理假（2026-10-19 使用者：Mango 今天請生理假，「我已經幫她標註病假了，你順便幫我修改」）

   性別平等工作法第 14 條：每月得請生理假一日，**工資減半發給**。
   費率與普通傷病假相同 —— 所以金額上併進病假也不會算錯。

   ⚠ 那為什麼要獨立一欄？因為「全年未逾三日不併入病假計算」：
     併在一起就查不出今年用掉幾天，也分不出哪幾小時是生理假。
     這一欄存在的理由是**查得出來**，不是算錢。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n, JSON.stringify(a)===JSON.stringify(b), {got:a,want:b});
const grab=n=>{let i=src.indexOf('function '+n+'(');let d=0;
 for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]=='{')d++;else if(src[k]=='}'){d--;if(!d)return src.slice(i,k+1);}}};
const leaveSummary=new Function(grab('leaveSummary')+'\nreturn leaveSummary;')();

console.log('① 分桶');
const sh=[
 {emp_id:'e1',date:'2026-10-19',hours:6,leave_hours:6,leave_type:'生理假'},
 {emp_id:'e1',date:'2026-10-05',hours:6,leave_hours:6,leave_type:'病假'},
 {emp_id:'e1',date:'2026-10-07',hours:6,leave_hours:6,leave_type:'事假'},
 {emp_id:'e1',date:'2026-10-09',hours:6,leave_hours:0,leave_type:''},
 {emp_id:'e1',date:'2026-09-19',hours:6,leave_hours:6,leave_type:'生理假'},  // 上個月，不該算進來
 {emp_id:'e2',date:'2026-10-19',hours:6,leave_hours:6,leave_type:'生理假'}]; // 別人的
const r=leaveSummary(sh,'e1','2026-10');
eq('★★★ 生理假自己一欄，沒有併進病假', [r.生理假, r.病假], [6,6]);
eq('★★ 排班總時數與實際出勤', [r.scheduled, r.leaveTotal, r.actual], [24,18,6]);
ok('★★ 不會算到別人或別的月份', r.生理假===6, r);

console.log('\n② 扣薪：與病假同樣折半');
/* 時薪 227（底薪 29,500 ÷ 130）：6 小時 × 227 × 50% = 681 */
const hourly=227;
eq('★★★ 生理假折半（與病假同費率）',
   Math.round(r.生理假*hourly*0.5), Math.round(r.病假*hourly*0.5));
eq('★★★ 三種假加起來的扣款',
   Math.round(r.事假*hourly)+Math.round(r.病假*hourly*0.5)+Math.round(r.生理假*hourly*0.5), 2724);
ok('★★★ 薪資那支真的把生理假算進扣款',
   /const baseLeaveDeduct = baseLeavePersonalDed \+ baseLeaveSickDed \+ baseLeaveMensDed;/.test(src));
ok('★★★ 折半不是全扣', /const baseLeaveMensDed = Math\.round\(leaveMens\*baseHourly\*0\.5\);/.test(src));

console.log('\n③ 畫面');
ok('★★★ 請假選單有生理假（半薪）',
   /<option value="生理假"\$\{cur\.leave_type==='生理假'\?' selected':''\}>生理假（半薪）<\/option>/.test(src));
ok('★★ 薪資單會列出來（管理員那一支）',
   /if\(myLeave\.生理假>0\) h\+=ded\(`生理假 \$\{myLeave\.生理假\} 小時（半薪）`, sal\.baseLeaveMensDed\);/.test(src));
ok('★★ 算式說明也有生理假那一行',
   /生理假 \$\{leaveMens\}h × 時薪 × 50%/.test(src));
/* 預設物件少一個 key，沒請假的人會在某些頁面變成 undefined */
ok('★★ 兩處預設物件都補了生理假',
   (src.match(/\{特休:0,病假:0,生理假:0,事假:0,喪假:0,其他:0\}/g)||[]).length===2);

console.log('\n④ 法條依據寫在原地');
ok('★★ 為什麼折半（性平法第 14 條）', /性別平等工作法第 14 條：每月得請一日，\*\*工資減半發給\*\*/.test(src));
ok('★★★ 為什麼不併進病假（全年未逾三日不併入病假計算）',
   /全年未逾三日不併入病假計算/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
