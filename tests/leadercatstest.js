/* 店長獎金的堂數基準＝教練課（含友善）＋團體課（2026-08-27 使用者二次確認）

   這一支存在的理由不是「驗一個新功能」，而是**把一個被來回改過的決定釘住**：
     ・2026-07-29 v260729.0022 只算教練課
     ・2026-07-29 v260729.0028 改成含團體課
     ・2026-08-27 使用者看到黃沛瀞 85 堂（77＋8）覺得不該達標 → 一度改回只算教練課
     ・2026-08-27 同日再確認：「剛剛跟太太討論　還是讓店長獎金變成教練課＋團體課
       去當抽成標準」→ 維持含團課
   下一次有人覺得「這裡是不是算錯了」，先看這一支與程式裡的註解。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
const grabLine=t=>{const i=src.indexOf(t);return src.slice(i,src.indexOf('\n',i));};

const count=new Function('bkCoachId','bkCounts',
  grabLine("const LEADER_CATS=")+'\n'+grabFn('leaderClassCount')+'\nreturn leaderClassCount;')(
  b=>b.substitute_coach_id||b.coach_id, ()=>true);

console.log('① 基準就是「教練課＋團體課」，而且不分月份');
{
  ok('★★ LEADER_CATS 兩種都在', /const LEADER_CATS=\['私人教練','小班肌力'\];/.test(src));
  ok('★★ 沒有起算月的分歧（歷史與現在用同一套）',
     !/LEADER_PT_ONLY_FROM|LEADER_CATS_PT|leaderCatsOf/.test(src)
     && /且\*\*不分月份\*\*，\s*\n\s*七月與八月用同一套（不要再加起算月，那會讓歷史與現在兩套並行）/.test(src));
  const mk=(pt,grp,ym)=>[]
    .concat(Array.from({length:pt},()=>({coach_id:'S',status:'checked_in',date:ym+'-05',category:'私人教練'})))
    .concat(Array.from({length:grp},()=>({coach_id:'S',status:'checked_in',date:ym+'-06',category:'小班肌力'})));
  eq('★★ 黃沛瀞八月：教練課 77 ＋ 團課 8 ＝ 85（達標門檻 80）',
     count(mk(77,8,'2026-08'),'S','2026-08'), 85);
  eq('★★ 七月用同一套：84 ＋ 8 ＝ 92', count(mk(84,8,'2026-07'),'S','2026-07'), 92);
  eq('　 團課單獨也算得到（曾邦宏那種只帶團課的）', count(mk(0,16,'2026-08'),'S','2026-08'), 16);
}

console.log('\n② 其他條件');
{
  const base=(over)=>Object.assign({coach_id:'S',status:'checked_in',date:'2026-08-05',category:'私人教練'},over);
  const one=(over)=>count([base(over)],'S','2026-08');
  eq('　 已簽到／已完成才算', [one({}), one({status:'completed'}), one({status:'booked'})], [1,1,0]);
  eq('★ 取消的不算', one({status:'cancelled'}), 0);
  eq('★★ 體驗課不算', one({category:'體驗'}), 0);
  eq('★★ 自主訓練不算', one({category:'自主訓練'}), 0);
  eq('★ 別的月份不算', one({date:'2026-07-05'}), 0);
  eq('★ 代課算在代課教練身上（0801 的規則）',
     count([base({coach_id:'X',substitute_coach_id:'S'})],'S','2026-08'), 1);
}

console.log('\n③ 決定的來龍去脈寫在原地（避免第三次來回）');
{
  ok('★★ 三次變動的時間與版本都記著',
     /2026-07-29 v260729\.0022 一度是「只算教練課」/.test(src)
     && /2026-07-29 v260729\.0028 改成含團體課/.test(src)
     && /2026-08-27 使用者看到黃沛瀞 85 堂（教練課 77＋團課 8）覺得不該達標/.test(src));
  ok('★★ 使用者二次確認的原話寫著',
     /剛剛跟太太討論　還是讓店長獎金變成\s*\n\s*教練課＋團體課 去當抽成標準/.test(src));
  ok('★★ 「不要再順手改回只算教練課」的警告寫著',
     /這一條被來回確認過兩次，不要再「順手改回只算教練課」/.test(src));
  ok('★ 三處計算仍共用同一支（口徑不會各自漂）',
     /classes:leaderClassCount\(bookings,o\.id,month\)/.test(src)
     && /排除老闆的名單過濾在呼叫端（role!=='admin'），三處計算共用本函式確保口徑一致/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
