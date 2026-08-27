/* 店長獎金的堂數基準改回「只算教練課」（2026-08-27 使用者回報）
   「沛瀞是教練課 77 團體課 8 應該還不到發獎金的程度，因為獎金只計算教練課」

   ⚠ 這不是計算錯誤 —— 程式是照 2026-07-29 的紀錄在算（commit 7f714c9
     「店長津貼基準含團體課」）。再往前一版（5c50315）是「全店當月教練課總堂數」，
     也就是本來就是只算教練課，0729 那天才被改成含團課。
   ⚠ 換月生效而不是全面套用：七月已經照舊制發過薪了。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabLine=t=>{const i=src.indexOf(t);return src.slice(i,src.indexOf('\n',i));};

const API=new Function('bkCoachId','bkCounts',
  grabLine("const LEADER_CATS=")+'\n'+grabLine("const LEADER_CATS_PT=")+'\n'
  +grabLine("const LEADER_PT_ONLY_FROM=")+'\n'
  +grabFn('leaderCatsOf')+'\n'+grabFn('leaderClassCount')
  +'\nreturn {leaderCatsOf, leaderClassCount, LEADER_PT_ONLY_FROM};')(
  b=>b.substitute_coach_id||b.coach_id, ()=>true);

console.log('① 換月生效：八月起只算教練課，七月照舊');
{
  eq('★★ 2026-08 起 → 只有私人教練', API.leaderCatsOf('2026-08'), ['私人教練']);
  eq('★★ 2026-09 → 也是只有私人教練', API.leaderCatsOf('2026-09'), ['私人教練']);
  eq('★★ 2026-07 → 維持舊制（教練課＋團課）', API.leaderCatsOf('2026-07'), ['私人教練','小班肌力']);
  eq('　 2026-06 → 舊制', API.leaderCatsOf('2026-06'), ['私人教練','小班肌力']);
  eq('　 沒帶月份 → 當成舊制（不會誤把歷史整片改掉）', API.leaderCatsOf(''), ['私人教練','小班肌力']);
  ok('★★ 起算月與「為什麼不全面套用」寫在原地',
     /const LEADER_PT_ONLY_FROM='2026-08';/.test(src)
     && /七月的薪資已經照舊制發過了，\s*\n\s*全面套用會讓回頭看的歷史薪資整片變動/.test(src)
     && /若要連七月一起重算，把 LEADER_PT_ONLY_FROM 改成 '2026-07' 即可/.test(src));
}

console.log('\n② 用黃沛瀞的真實數字驗（正式庫 2026-08：教練課 77、團課 8）');
{
  const mk=(pt,grp,ym)=>[]
    .concat(Array.from({length:pt},()=>({coach_id:'S',status:'checked_in',date:ym+'-05',category:'私人教練'})))
    .concat(Array.from({length:grp},()=>({coach_id:'S',status:'checked_in',date:ym+'-06',category:'小班肌力'})));
  eq('★★ 八月：85 → 77（門檻 80，所以從「達標」變成「不達標」）',
     API.leaderClassCount(mk(77,8,'2026-08'),'S','2026-08'), 77);
  ok('★★ 77 < 80 → 這一位不再發 $4,000', 77<80);
  eq('★ 鄭百益八月 83（原 89）→ 仍然達標',
     API.leaderClassCount(mk(83,6,'2026-08'),'S','2026-08'), 83);
  eq('★★ 七月照舊：92（84 教練課 ＋ 8 團課）', API.leaderClassCount(mk(84,8,'2026-07'),'S','2026-07'), 92);
}

console.log('\n③ 其他條件一個都沒鬆');
{
  const base=(over)=>Object.assign({coach_id:'S',status:'checked_in',date:'2026-08-05',category:'私人教練'},over);
  const one=(over)=>API.leaderClassCount([base(over)],'S','2026-08');
  eq('　 已簽到算', one({}), 1);
  eq('　 已完成也算', one({status:'completed'}), 1);
  eq('★ 只排了還沒上的不算', one({status:'booked'}), 0);
  eq('★ 取消的不算', one({status:'cancelled'}), 0);
  eq('★ 別的月份不算', one({date:'2026-07-05'}), 0);
  eq('★★ 體驗課不算（兩制都不列入）', one({category:'體驗'}), 0);
  eq('★★ 自主訓練不算', one({category:'自主訓練'}), 0);
  eq('★★ 團課八月起不算', one({category:'小班肌力'}), 0);
  eq('★ 代課算在代課教練身上（0801 的規則沒被動到）',
     API.leaderClassCount([base({coach_id:'X',substitute_coach_id:'S'})],'S','2026-08'), 1);
}

console.log('\n④ 三處計算共用同一支（口徑不會各自漂）');
{
  ok('★★ leaderRowsOf 走 leaderClassCount',
     /classes:leaderClassCount\(bookings,o\.id,month\)/.test(src));
  ok('★★ 呼叫端都有把 month 傳進來（沒傳就會被當成舊制）',
     (src.match(/leaderRowsOf\([^)]*month\)/g)||[]).length>=2);
  ok('★ 排除老闆與櫃檯的過濾仍在呼叫端',
     /\.filter\(o=>o\.role!=='admin' && o\.role!=='front_desk' && o\.status!=='inactive'\)/.test(src));
  ok('　 舊制的常數沒被刪（七月以前還要用）', /const LEADER_CATS=\['私人教練','小班肌力'\];/.test(src));
  ok('★★ 使用者原話與「這不是算錯、是 0729 改成含團課」寫在原地',
     /因為獎金只計算教練課/.test(src)
     && /新（>= LEADER_PT_ONLY_FROM）＝\*\*只算教練課\*\*/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
