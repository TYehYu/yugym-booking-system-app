/* 全員請假的團課要蓋紅色「假」章（2026-07-31 使用者回報）

   「今天團課發生一件事情：三名會員同時都請假了，可是點開課卡簽到還是能看到三名會員的名字。
     像這種三個會員都請假的團課，課卡右下角就顯示紅色圓章『假』。」

   請假的人本來就不會簽到，所以這種課看起來跟「還沒簽」一模一樣，
   櫃檯得點進去才知道今天沒人會來。名單本身不動（請假的人仍要看得到、也還能取消請假）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};

const api=new Function(
  g('function mids(','\n}\n')+'\n'+g('function seatKeys(b){','\n}\n')+'\n'
  +g('function attObj(b){','\n}\n')+'\n'+g('function grpAllOnLeave(b){','\n}\n')
  +'\nreturn grpAllOnLeave;')();

const B=(o)=>Object.assign({category:'小班肌力',status:'booked',member_ids:['A','B','C']},o);

console.log('判定');
eq('★ 三個人全部請假 → 蓋章', api(B({attendance:{A:'leave',B:'leave',C:'leave'}})), true);
eq('★ 有一個人沒請假 → 不蓋', api(B({attendance:{A:'leave',B:'leave'}})), false);
eq('★ 有人已簽到 → 不蓋', api(B({attendance:{A:'leave',B:'leave',C:'checked_in'}})), false);
eq('★ 沒有人請假 → 不蓋', api(B({attendance:{}})), false);
eq('★ 空名單不算（沒有人可以請假）', api(B({member_ids:[],attendance:{}})), false);
eq('★ 已取消的課不看（那本來就有自己的樣式）',
   api(B({status:'cancelled',attendance:{A:'leave',B:'leave',C:'leave'}})), false);
eq('★ 教練課不適用（沒有逐人請假的機制）',
   api(B({category:'私人教練',attendance:{A:'leave',B:'leave',C:'leave'}})), false);
eq('　　null 不會爆', api(null), false);
eq('　　attendance 是 JSON 字串時也讀得到（舊資料）',
   api(B({attendance:'{"A":"leave","B":"leave","C":"leave"}'})), true);

console.log('\n同一人多名額');
eq('★ 兩個名額都請假才算（名額鍵 A / A#2）',
   api(B({member_ids:['A','A'],attendance:{'A':'leave','A#2':'leave'}})), true);
eq('★ 只有第一個名額請假 → 不蓋',
   api(B({member_ids:['A','A'],attendance:{'A':'leave'}})), false);

console.log('\n三處課卡都蓋');
ok('★ 桌機行事曆的標準卡（右下角角章，紅底「假」）',
   /const _allLeave = !hideMember && grpAllOnLeave\(b\);/.test(src)
   && /<span class="evc-check evc-leave" title="全員請假">假<\/span>/.test(src));
ok('★ 桌機行事曆的三態小徽章（右上角）也改成紅色「假」',
   /: grpAllOnLeave\(b\) \? '<span class="ev-stamp ev-stamp-leave" title="全員請假">假<\/span>'/.test(src));
ok('★ 手機週檢視的課卡', /\$\{grpAllOnLeave\(b\)\?'<span class="evc-check evc-leave" title="全員請假">假<\/span>'/.test(src));
ok('★ 首頁「今日教練任務」課卡',
   /\$\{grpAllOnLeave\(b\)\?'<span class="tcard-chk tcard-chk-leave">假<\/span>':\(done\?'<span class="tcard-chk">簽<\/span>':''\)\}/.test(src));
ok('★ 三種角章都是紅底（沿用既有角章的形狀與位置，只換顏色與字）',
   /\.evc-check\.evc-leave,\.cal-ev\.cal-ev-std \.evc-check\.evc-leave\{background:var\(--danger,#b5372e\);\}/.test(src)
   && /\.tcard-chk\.tcard-chk-leave\{background:var\(--danger,#b5372e\);\}/.test(src)
   && /\.ev-stamp-leave\{background:var\(--danger,#b5372e\);color:#fff;/.test(src));
ok('★ 全員請假排在「已簽到」前面判斷（兩者不會同時成立）',
   src.indexOf("const _allLeave = !hideMember && grpAllOnLeave(b);")<src.indexOf("? `<span class=\"evc-check evc-leave\""));

console.log('\n名單本身不動');
ok('★ 請假的人仍列在名單上（可以取消請假）', /groupToggleLeave\('\$\{b\.id\}','\$\{mid\}'\)">取消請假/.test(src));
ok('★ 請假仍不算銷課名額（2026-07-30 定案，這次沒動到）',
   /return keys\.filter\(k=>att\[k\]!=='leave'\)\.length;/.test(src));
ok('　　原因寫在程式裡', /這種課不會有人簽到，卡片看起來就跟「還沒簽」一樣/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
