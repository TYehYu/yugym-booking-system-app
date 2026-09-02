/* 團課［＋新增］點名字沒反應（2026-09-02 使用者急件）
   「我要在下週二團體課新增許佳慈　結果卡在這邊點了名字沒反應」

   9/08(二) 20:00 那堂：許佳慈已經用「姊姊」的補課券佔了一格，而那張票已經扣到 0 堂。
   0 堂的票不在候選清單（m.tks）裡 → _seatFam 找不到就回 ''（＝本人），
   於是那一格被算到「許佳慈（本人）」那一列頭上。
   addMode 看到那一列「已經有名額」，點下去就走「再點一次＝取消」——
   **畫面完全沒反應，人也加不進去**。

   ⚠ 這是 0829 修 _grpTaken 時就寫下的同一個坑：「用完的票不在清單裡就會推錯人」，
     當時只修了 _grpTaken，_seatFam 漏掉。同一條規則抄兩份就是警訊。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
const g=(a,b)=>{const i=src.indexOf(a);return src.slice(i,src.indexOf(b,i)+b.length);};
const body=g("  const _famKey=t=>String((t&&t.fam)||'');","    const t=(m.tks||[]).find(x=>x.id===pk); return t?_famKey(t):''; };");
const mk=(tkFam)=>new Function('window','grpPickOf',body+`
  return _seatFam;`)({_grpSeatTk:{'MEM-AFF9DC4DB096':'TK-mtcq5r6nz718'}, _grpTkFam:tkFam}, ()=>'');
const m={id:'MEM-AFF9DC4DB096', tks:[{id:'TK-mtjvt8x41ekv', fam:null}]};  // 只剩本人那張補課券

let pass=0,fail=0;
const eq=(n,a,e)=>{ if(JSON.stringify(a)===JSON.stringify(e)){pass++;console.log('  ✓ '+n);}
  else {fail++;console.log('  ✗ '+n+'  → 得到 '+JSON.stringify(a)+'，預期 '+JSON.stringify(e));} };

console.log('修好之後（_grpTkFam 涵蓋已用完的票）');
eq('★★★ 既有名額算回「姊姊」，不再掛到本人頭上',
   mk({'TK-mtcq5r6nz718':'姊姊','TK-mtjvt8x41ekv':''})(m,0), '姊姊');

console.log('\n反例：沒有全表可查（就是 0902 之前的行為）');
eq('★★★ 會誤判成本人（空字串）—— 這就是「點了沒反應」的來源',
   mk({})(m,0), '');
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
