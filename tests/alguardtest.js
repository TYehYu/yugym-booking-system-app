/* 特休要有餘額才請得了（2026-10-26 使用者：「特休這邊有防呆嗎　有特休才能選」）

   在這之前排班視窗只擋兩件事：請假時數 ≤ 排班時數、假別與時數同進同出。
   特休是**不扣薪**的假 —— 剩 0 還選得下去，等於白給一天薪水，而且安靜地發生
   （黃美蓉 2026 的特休 34 小時在 10/26 剛好用完，下一筆就會踩到）。

   兩道關：
     ① 下拉：標出「剩 N 小時」，剩 0 就 disabled（已經存成特休的那一筆除外，
        不然改不動也刪不掉）
     ② 儲存：再算一次，而且**一定要排在「沒填時數就帶整段排班」之後** */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n, JSON.stringify(a)===JSON.stringify(b), {got:a,want:b});
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');
 let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]=='{')d++;else if(src[k]=='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 餘額怎麼算（沿用薪資那一支 annualLeaveAccount，口徑要一致）');
const ALA=new Function(grab('annualLeaveAccount')+';return annualLeaveAccount;')();
/* 正式庫的黃美蓉（2026-10-26 查到的）：結轉 12、今年新增 22，
   8/20–8/24 各 6 小時＋10/26 的 4 小時 ＝ 34，剛好用完。 */
const MANGO={id:'c-mqueqc9uxp3k', name:'黃美蓉', al_carry_hours:12, al_earned_hours:22};
const SH=[['2026-08-20',6],['2026-08-21',6],['2026-08-22',6],['2026-08-23',6],['2026-08-24',6],['2026-10-26',4]]
  .map(([d,h])=>({emp_id:MANGO.id, date:d, leave_type:'特休', leave_hours:h}));
eq('★★★ 黃美蓉 2026：可用 34、已休 34、剩 0',
   (()=>{const a=ALA(MANGO,SH,'2026'); return [a.grant,a.used,a.remain];})(), [34,34,0]);
eq('★★ 只算當年度（曆年制）—— 2025 的帳不會被 2026 的假影響',
   ALA(MANGO,SH,'2025').used, 0);

console.log('\n② 下拉：標餘額、剩 0 不能選');
const fn=grab('openShiftEdit');
ok('★★★ 算餘額時要扣掉**正在編輯的這一筆**',
   /const _alSelf=\(cur && cur\.leave_type==='特休'\) \? \(Number\(cur\.leave_hours\)\|\|0\) : 0;/.test(fn)
   && /const _alLeft=_alAcc \? Math\.max\(0, _alAcc\.remain \+ _alSelf\) : null;/.test(fn));
ok('　　理由寫在原地（不然改時數會自己卡自己）',
   /不然把今天的 6 小時改成 4 小時會被自己卡住/.test(fn));
ok('★★★ 選項標出剩幾小時', /特休（不扣薪\$\{\s*\n?\s*_alAcc!=null\?`・剩 \$\{fmtHours\(_alLeft\)\} 小時`:''\}）/.test(fn));
ok('★★★ 剩 0 就 disabled，但已經存成特休的那一筆仍然選得到',
   /const _alNone=\(_alAcc!=null && _alLeft<=0 && _alSelf<=0\);/.test(fn)
   && /\$\{_alNone\?' disabled':''\}/.test(fn));
ok('　　年度取這張卡的年份（跨年那幾天不會算到去年的帳）',
   /const _alYear=String\(dateStr\|\|''\)\.slice\(0,4\);/.test(fn));

console.log('\n③ 儲存那一關');
const sv=grab('saveShift');
ok('★★★ 儲存時再算一次', /if\(leave_type==='特休'\)\{/.test(sv));
/* ⚠ 順序是這一條的重點：排在「沒填時數就帶整段排班」前面的話，
   選了特休但時數留空會先以 0 通過，再被自動補成 6 小時 —— 防呆形同虛設。 */
ok('★★★ 一定排在「沒填時數就帶整段排班」之後', (()=>{
  const a=sv.indexOf("showToast(`未填請假時數，以整段排班");
  const b=sv.indexOf("if(leave_type==='特休'){");
  return a>0 && b>a;
})());
ok('　　那個順序陷阱寫在原地', /然後被自動補成 6 小時，整個防呆形同虛設/.test(sv));
ok('★★ 訊息寫出剩幾小時（不然只知道被擋、不知道能填多少）',
   /特休只剩 \$\{fmtHours\(_left2\)\} 小時，填不了/.test(sv)
   && /今年的特休已經用完了/.test(sv));

console.log('\n④ 實跑：三種情況');
/* 把儲存那一段的特休判斷抽出來跑（整支 saveShift 相依太多，這裡只跑這一塊）。 */
function guard(leave_hours, cur0, shifts){
  const emp=MANGO, date='2026-11-03';
  const _self2=(cur0 && cur0.leave_type==='特休') ? (Number(cur0.leave_hours)||0) : 0;
  const _left2=Math.max(0, ALA(emp, shifts, String(date).slice(0,4)).remain + _self2);
  return leave_hours>_left2 ? ('擋下・剩'+_left2) : '放行';
}
eq('★★★ 用完了還想請 6 小時 → 擋', guard(6,null,SH), '擋下・剩0');
eq('★★★ 把 10/26 那筆從 4 小時改成 6 小時 → 擋（只剩 4 可用）',
   guard(6,{leave_type:'特休',leave_hours:4},SH), '擋下・剩4');
eq('★★★ 把 10/26 那筆從 4 小時改成 3 小時 → 放行',
   guard(3,{leave_type:'特休',leave_hours:4},SH), '放行');
eq('★★ 還有餘額時照樣請得了', guard(6,null,SH.slice(0,3)), '放行');

console.log('\n⑤ 其他假別不受影響（只有特休有額度）');
ok('★★★ 判斷寫死在 特休 這一支', /if\(leave_type==='特休'\)\{/.test(sv)
   && !/leave_type==='病假'[\s\S]{0,80}remain/.test(sv));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
