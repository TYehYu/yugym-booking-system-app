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
/* 2026-07-31：課種判斷抽成共用的 bkIsGroup（見 TK_POCKETS）—— 沙箱給等價替身 */
const bkIsGroupT=b=>!!(b&&b.category==='小班肌力');

const api=new Function('bkIsGroup',
  g('function mids(','\n}\n')+'\n'+g('function seatKeys(b){','\n}\n')+'\n'
  +g('function attObj(b){','\n}\n')+'\n'+g('function grpAllOnLeave(b){','\n}\n')
  +'\nreturn grpAllOnLeave;')(bkIsGroupT);

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
/* 2026-07-31 重構：狀態章改走共用的 bkStampKind（取消 → 全員請假 → 已簽到／補簽） */
ok('★ 手機週檢視的課卡', /return k==='leave'\?'<span class="evc-check evc-leave" title="全員請假">假<\/span>'/.test(src));
ok('★ 首頁「今日教練任務」課卡',
   /return k==='leave'\?'<span class="tcard-chk tcard-chk-leave">假<\/span>'/.test(src));
ok('★ 首頁手機版的圓點也吃同一支', /const allLeave2=bkStampKind\(b\)==='leave';/.test(src));
ok('★ 狀態章的判斷順序固定（取消 → 全員請假 → 已簽到）',
   /function bkStampKind\(b\)\{[\s\S]{0,120}if\(b\.status==='cancelled'\) return 'cancel';[\s\S]{0,160}return 'leave';/.test(src));
ok('★ 三種角章都是紅底（沿用既有角章的形狀與位置，只換顏色與字）',
   /\.evc-check\.evc-leave,\.cal-ev\.cal-ev-std \.evc-check\.evc-leave\{background:var\(--danger,#b5372e\);\}/.test(src)
   && /\.tcard-chk\.tcard-chk-leave\{background:var\(--danger,#b5372e\);\}/.test(src)
   && /\.ev-stamp-leave\{background:var\(--danger,#b5372e\);color:#fff;/.test(src));
ok('★ 全員請假排在「已簽到」前面判斷（兩者不會同時成立）',
   src.indexOf("const _allLeave = !hideMember && grpAllOnLeave(b);")<src.indexOf("? `<span class=\"evc-check evc-leave\""));

console.log('\n簽到章要等全部名額都處理完（2026-07-31 使用者回報）');
{
  const done=new Function('bkIsGroup','seatKeys','attObj',
    g('function grpAllDone(b){','\n}\n')+'\nreturn grpAllDone;')(
      b=>!!(b&&b.category==='小班肌力'),
      new Function(g('function mids(','\n}\n')+'\n'+g('function seatKeys(b){','\n}\n')+'\nreturn seatKeys;')(),
      new Function(g('function attObj(b){','\n}\n')+'\nreturn attObj;')());
  const B2=(o)=>Object.assign({category:'小班肌力',status:'booked',member_ids:['A','B','C']},o);
  eq('★ 三個人全簽到 → 蓋章', done(B2({attendance:{A:'checked_in',B:'checked_in',C:'checked_in'}})), true);
  eq('★ 只有兩個人簽到、一個還沒 → 不蓋（使用者回報的狀況）',
     done(B2({attendance:{A:'checked_in',B:'checked_in'}})), false);
  eq('★ 沒來的那位是請假（已另發補課券）→ 算處理完，蓋章',
     done(B2({attendance:{A:'checked_in',B:'checked_in',C:'leave'}})), true);
  eq('★ 全員請假 → 這裡不算（走紅色「假」章）',
     done(B2({attendance:{A:'leave',B:'leave',C:'leave'}})), false);
  eq('　　一個都還沒簽 → 不蓋', done(B2({attendance:{}})), false);
  eq('　　同一人兩個名額，只到一個 → 不蓋',
     done(B2({member_ids:['A','A'],attendance:{'A':'checked_in'}})), false);
  eq('　　兩個名額都到 → 蓋',
     done(B2({member_ids:['A','A'],attendance:{'A':'checked_in','A#2':'checked_in'}})), true);
  eq('　　已取消的課不看', done(B2({status:'cancelled',attendance:{A:'checked_in',B:'checked_in',C:'checked_in'}})), false);
  eq('　　教練課不適用（走整堂 status）',
     done(B2({category:'私人教練',attendance:{A:'checked_in'}})), false);
}
ok('★ 三個畫面都改（行事曆標準卡、三態徽章、共用的狀態章）',
   /const _isCheckedIn = bkIsGroup\(b\) \? grpAllDone\(b\)/.test(src)
   && /const done=bkIsGroup\(b\) \? grpAllDone\(b\)/.test(src)
   && /const checked = bkIsGroup\(b\) \? grpAllDone\(b\)/.test(src));
ok('　　整堂 status 不能直接信（有一個人簽到就會被寫成 checked_in）',
   /因為只要有一個人簽到，status 就會被寫成 checked_in/.test(src));

console.log('\n請假的會員要標示清楚（2026-07-31 使用者指示）');
ok('★ 「請假」改成紅底白字（原本淡金色，跟旁邊的淡綠「已簽到」分不出來）',
   /\.gr-leave-tag\{font-size:11px;background:var\(--danger,#b5372e\);color:#fff;font-weight:800;\}/.test(src)
   && /\? '<span class="tag gr-leave-tag">請假<\/span>'/.test(src));
ok('★ 整列淡化＋左緣紅線（這個人今天不會來）',
   /const onLeaveM = att\[sk\]==='leave';/.test(src)
   && /gr-row\$\{onLeaveM\?' gr-row-leave':''\}/.test(src)
   && /\.gr-row-leave::before\{content:'';position:absolute;left:0;/.test(src)
   && /\.gr-row-leave \.gr-name\{opacity:\.55;\}/.test(src));
ok('★ 顏色與課卡右下角的紅色「假」章同一個語彙',
   /\.evc-check\.evc-leave,\.cal-ev\.cal-ev-std \.evc-check\.evc-leave\{background:var\(--danger,#b5372e\);\}/.test(src));
ok('　　已簽到／未簽到不受影響',
   /\? '<span class="tag tag-ok" style="font-size:11px;">已簽到<\/span>'/.test(src)
   && /: '<span class="tag tag-warn" style="font-size:11px;">未簽到<\/span>'/.test(src));
ok('　　原因寫在程式裡（品牌色強度：紅＞金＞綠）',
   /跟旁邊的「已簽到」淡綠幾乎一樣，一整排掃過去看不出誰沒來/.test(src));

console.log('\n名單本身不動');
ok('★ 請假的人仍列在名單上（可以取消請假）', /groupToggleLeave\('\$\{b\.id\}','\$\{mid\}'\)">取消請假/.test(src));
/* 2026-07-31 使用者指示再收緊：人次改成「簽到才算」（請假與漏簽都不算），見 seattest.js */
ok('★ 請假不算人次（2026-07-30 定案，2026-07-31 收緊成只算已簽到）',
   /return keys\.filter\(k=>att\[k\]==='checked_in'\)\.length;/.test(src));
ok('　　原因寫在程式裡', /人頭費是付給「實際來上課的人」/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
