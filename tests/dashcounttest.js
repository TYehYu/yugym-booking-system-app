/* 報表與員工列表的堂數口徑要一致（2026-09-30 使用者：
   「為什麼手機的報表上課堂數跟桌機管理員-員工管理這邊的數字有出入」）

   查出來的差異只有一條：「全員請假的團課不成課」（2026-08-02 定案，見 grpAllOnLeave）。
   員工列表（_stat）走 bkCounts 有濾掉；報表頁（rangeBk）只擋 cancelled，所以多算。
   9 月正好兩堂 —— 9/21 13:00 曾邦宏、9/28 17:45 黃沛瀞，兩堂都只有一位學員且請假。
   教練課兩邊本來就一樣（那條規則只管團課），差的是團體課那一欄。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 兩邊都走 bkCounts');
{
  ok('★★★ 報表頁的 rangeBk 改吃 bkCounts（原本只擋 cancelled）',
     /const rangeBk=bookings\.filter\(b=>inRange\(b\.date\)&&bkCounts\(b\)\);/.test(src));
  ok('★★★ 員工列表那邊本來就是（沒被改壞）',
     /const _mBk=\(_bk\|\|\[\]\)\.filter\(b=>String\(b\.date\|\|''\)\.slice\(0,7\)===_ym && bkCounts\(b\)\);/.test(src));
  ok('★★ 成因寫在原地（下一個人不要又改回 status!==cancelled）',
     /全員請假的團課不成課/.test(src) && /9\/21 13:00 曾邦宏、9\/28 17:45 黃沛瀞/.test(src));
}

console.log('\n② bkCounts 就是那條規則本身');
{
  const grpAll=new Function('bkIsGroup','seatKeys','attObj','return '+g('function grpAllOnLeave(b){','\n}'))
    (b=>b&&b.category==='小班肌力', b=>Object.keys((b&&b.attendance)||{}), b=>(b&&b.attendance)||{});
  const F=new Function('grpAllOnLeave','return '+g('function bkCounts(b){','\n}'))(grpAll);
  const grp=(att,st)=>({category:'小班肌力',status:st||'booked',attendance:att});
  eq('★★★ 全員請假的團課不算（9/21、9/28 那兩堂就是這樣）',
     F(grp({A:'leave'})), false);
  eq('★★★ 有人到就算（一個請假一個到）', F(grp({A:'leave',B:'checked_in'})), true);
  eq('★★ 還沒有人簽到也算（課還在，只是沒處理）', F(grp({A:'',B:''})), true);
  eq('★★ 沒有名額資料的團課照算（不要因為資料缺就把課吃掉）', F(grp({})), true);
  eq('★★★ 教練課不受這條影響（規則只管團課 —— 兩邊教練課數字本來就一樣）',
     [F({category:'私人教練',status:'booked'}), F({category:'私人教練',status:'checked_in'})], [true,true]);
  eq('★★★ 取消的一律不算', [F(grp({A:'leave'},'cancelled')), F({category:'私人教練',status:'cancelled'})], [false,false]);
  eq('★★ null 不會爆', F(null), false);
}

console.log('\n③ 兩邊的教練課／團課定義沒有第二處分歧');
{
  /* 兩支都用同一個 isPtPayClass 與 bkIsGroup，且「已上」都是 completed|checked_in。
     這三件事只要有一處各寫各的，數字又會飄。 */
  ok('★★★ 教練課＝isPtPayClass，兩邊同一支', /function isPtPayClass\(b\)\{ return !!b && b\.category==='私人教練'; \}/.test(src)
     && (src.match(/\.filter\(isPtPayClass\)\.length/g)||[]).length>=4);
  ok('★★★ 代課的課算在代課教練身上，兩邊都吃 bkCoachId',
     /const myBk=rangeBk\.filter\(b=>\(bkCoachId\(b\)\)===c\.id\);/.test(src)
     && /const mine=_mBk\.filter\(b=>\(bkCoachId\(b\)\)===c\.id && !bkIsLeaveSelfTrain\(b\)\);/.test(src));
  ok('★★ 「已上」兩邊同義（completed 或 checked_in）',
     /const myDone=myBk\.filter\(b=>b\.status==='completed'\|\|b\.status==='checked_in'\);/.test(src)
     && /const done=mine\.filter\(b=>b\.status==='checked_in'\|\|b\.status==='completed'\);/.test(src));
  /* ⚠ 刻意保留的一處不同：員工列表的「總堂數」還會扣掉教練請假轉的自主訓練
       （人在放假，不算實際帶課）。報表頁沒有總堂數那一欄，所以不跟進。 */
  ok('★★★ 唯一刻意保留的差異寫在原地（別順手把它也「對齊」掉）',
     /不順便濾 bkIsLeaveSelfTrain：那是員工列表「總堂數」那一欄專有的規則/.test(src));
}

console.log('\n④ 薪資不受影響');
{
  /* 薪資走的是自己那一份 ptDoneById，不吃 rangeBk —— 改報表不會動到任何人的錢 */
  ok('★★★ 薪資的堂數自己算（bkCounts 這次的改動碰不到）',
     /ptDoneById\[emp\.id\]=bookings\.filter\(b=>bkCoachId\(b\)===emp\.id&&\(b\.status==='completed'\|\|b\.status==='checked_in'\)&&bkCounts\(b\)/.test(src));
  ok('★★ 而且它本來就有 bkCounts（薪資一直是對的那一邊）',
     /ptDoneById\[emp\.id\]=bookings\.filter\([^\n]*bkCounts\(b\)/.test(src));
}

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
