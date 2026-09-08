/* 主管津貼與團隊獎金池（2026-09-08 使用者定案）——
   「主管津貼　預設3000　團隊獎金　所有教練每一位達到80堂(含團課)獎金4000
     所以有四個教練達標　獎金16000　然後再平分給主管」
   補充：「Sandy自己也算　平分照人頭　9月開始　主管津貼每位固定3000」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

const fn=new Function('LEADER_NEW_FROM','LEADER_TEAM_FROM',
  g('function leaderBonusOf(emp, extras, G, month){','\n}')+'\nreturn leaderBonusOf;')('2026-08','2026-09');
const MGR={is_manager:true};
const rows=(...ns)=>ns.map((n,i)=>({id:'c'+i, name:'教練'+i, classes:n}));
const mgrs=n=>Array.from({length:n},(_,i)=>({id:'m'+i,name:'主管'+i}));

console.log('① 使用者舉的那個例子');
{
  const r=fn(MGR,{leaderRows:rows(80,90,100,85,20,0), leaderMgrs:mgrs(1), month:'2026-09'},{},'2026-09');
  ok('★★★ 4 位達標 × 4,000 ＝ 池 16,000，1 位主管全拿', r.pool===16000 && r.pay===16000, {pool:r.pool,pay:r.pay});
  ok('★★ 達標人數算得對', r.units===4);
}

console.log('\n② 平分照人頭');
{
  const r=fn(MGR,{leaderRows:rows(80,90,100,85), leaderMgrs:mgrs(2), month:'2026-09'},{},'2026-09');
  ok('★★★ 2 位主管 → 各 8,000', r.pay===8000 && r.pool===16000);
}
{
  const r=fn(MGR,{leaderRows:rows(80,90,100,85), leaderMgrs:mgrs(3), month:'2026-09'},{},'2026-09');
  ok('★★★ 除不盡無條件捨去（16000÷3＝5,333，餘 1 不分配）',
     r.pay===5333 && r.rest===1, {pay:r.pay,rest:r.rest});
  ok('★★ 餘數要寫在說明裡，不要默默消失', /餘 \$1 不分配/.test(r.detail), r.detail);
}
{
  const r=fn(MGR,{leaderRows:rows(80), leaderMgrs:[], month:'2026-09'},{},'2026-09');
  ok('★★ 主管名單是空的也不能除以 0', r.pay===4000 && r.mgrN===1);
}

console.log('\n③ 門檻與範圍');
{
  const r=fn(MGR,{leaderRows:rows(79,80), leaderMgrs:mgrs(1), month:'2026-09'},{},'2026-09');
  ok('★★★ 80 堂含在內、79 堂不算', r.units===1 && r.pay===4000);
}
{
  const r=fn(MGR,{leaderRows:rows(10,20), leaderMgrs:mgrs(1), month:'2026-09'},{},'2026-09');
  ok('★★ 無人達標＝0，而且說得出「名單幾位」', r.pay===0 && /名單 2 位，無人達到 80 堂/.test(r.detail), r.detail);
}
{
  const r=fn(MGR,{leaderRows:rows(90,90), leaderMgrs:mgrs(1), month:'2026-09'},{leader_t1:100,leader_b1:5000},'2026-09');
  ok('★  門檻與金額吃全域設定（不再逐位店長覆寫）', r.pay===0 && r.t1===100 && r.b1===5000);
}
{
  const r=fn(MGR,{leaderRows:rows(80,80), leaderMgrs:mgrs(1), month:'2026-09'},{},'2026-09');
  ok('★★★ 不再看 leader_members —— 全店教練都算，主管自己也在 rows 裡（呼叫端不排除）',
     r.pay===8000 && !/尚未設定計算名單/.test(r.detail));
  ok('★★ 也不再有第二階 t2/b2', r.t2===0 && r.b2===0);
}

console.log('\n④ 9 月起才換制，之前的薪資單不能被改動');
{
  const emp={is_manager:true, leader_members:['c0'], leader_t1:80, leader_b1:4000};
  const r8=fn(emp,{leaderRows:rows(80,80,80,80), leaderMgrs:mgrs(1), month:'2026-08'},{},'2026-08');
  ok('★★★ 8 月仍走舊制（只算自己名單的 c0 → 一筆 4,000）', r8.pay===4000 && !r8.team, {pay:r8.pay,team:r8.team});
  const r9=fn(emp,{leaderRows:rows(80,80,80,80), leaderMgrs:mgrs(1), month:'2026-09'},{},'2026-09');
  ok('★★★ 9 月起走新制（全店 4 位達標 → 16,000）', r9.pay===16000 && r9.team===true);
}
{
  const r7=fn({is_manager:true},{leaderRows:rows(80,80), leaderMgrs:mgrs(1), month:'2026-07'},{},'2026-07');
  ok('★★ 7 月以前的「總堂數除門檻」那一套也還在', r7.pay===8000 && !r7.team);
}

console.log('\n⑤ 主管津貼');
ok('★★★ 預設 3,000（原本 4,000）', /supervisor_bonus: 3000,/.test(src));
/* 2026-09-08 二修（使用者：「主管津貼的調整　不要影響以前的薪資」）——
   看 is_manager 這件事只能從 2026-09 起，否則店長連七、八月都會憑空多一筆。 */
ok('★★★ 判斷改看 is_manager，但只從 2026-09 起',
   /const _supByMgr = String\(extras\.month\|\|''\) >= LEADER_TEAM_FROM;/.test(src)
   && /const isSup=!!\(emp&&\(emp\.is_supervisor\|\|\(_supByMgr&&emp\.is_manager\)\)\);/.test(src));
ok('★★★ 九月以前照舊只看 is_supervisor（歷史薪資一毛都不會變）',
   /九月以前照舊只看 is_supervisor（等於維持 0 元，歷史薪資單一毛都不會變）/.test(src));
ok('★★ 每位固定、不平分（要平分的是獎金池）', /每位主管各拿 3,000，不平分/.test(src));

console.log('\n⑥ 主管人數要用「那個月的」');
const M=g('function leaderMgrsOf(staff, month){','\n}');
ok('★★★ 透過 empAtMonth 取當月身分（is_manager 是月份版欄位）',
   /empAtMonth\(o, month\)/.test(M) && /return !!\(at && at\.is_manager\)/.test(M));
ok('★★ 離職的不算', /o\.status==='inactive'/.test(M));
ok('★★ 兩個呼叫端都把名單帶進去',
   (src.match(/leaderMgrs = emp\.is_manager \? leaderMgrsOf\(/g)||[]).length===2);

console.log('\n⑦ 堂數口徑一個字都沒動（0729→0827 來回確認過兩次）');
ok('★★★ 仍是教練課＋團課', /const LEADER_CATS=\['私人教練','小班肌力'\];/.test(src));
ok('★★★ 仍是已完成／已簽到、代課算在代課教練身上',
   /bkCoachId\(b\)===coachId   \/\/ 代課的課算在代課教練身上/.test(src)
   && /\(b\.status==='completed'\|\|b\.status==='checked_in'\)/.test(src));

console.log('\n⑧ 門檻可增可刪、名單全主管共用（2026-09-08 使用者兩則）');
{
  const G={team_tiers:[{classes:80,amount:4000},{classes:100,amount:2000}]};
  const r=fn(MGR,{leaderRows:rows(80,100,120,50), leaderMgrs:mgrs(1), month:'2026-09'},G,'2026-09');
  ok('★★★ 多階是「追加」：80→4,000、100→再加 2,000，上滿 100 就是 6,000',
     r.pool===4000+6000+6000 && r.pay===16000, {pool:r.pool});
  ok('★★ 三位達標（50 堂那位不算）', r.units===3);
  ok('★  明細寫出每位拿多少', /100 堂 \$6,000/.test(r.detail), r.detail);
}
{
  const G={team_tiers:[{classes:100,amount:2000},{classes:80,amount:4000}]};
  const r=fn(MGR,{leaderRows:rows(80), leaderMgrs:mgrs(1), month:'2026-09'},G,'2026-09');
  ok('★★ 門檻沒照順序填也算得對（內部會排序）', r.pool===4000);
}
{
  const G={team_members:['c0','c1']};
  const r=fn(MGR,{leaderRows:rows(80,80,80,80), leaderMgrs:mgrs(1), month:'2026-09'},G,'2026-09');
  ok('★★★ 名單全主管共用：只算名單內的兩位 ＝ 8,000', r.pool===8000 && r.scoped===true);
  ok('★★ 名單外的不出現在明細裡', r.rows.length===2);
}
{
  const r=fn(MGR,{leaderRows:rows(80,80), leaderMgrs:mgrs(1), month:'2026-09'},{team_members:null},'2026-09');
  ok('★★★ 名單沒設（null）＝全體 —— 使用者定的規則就是「所有教練」',
     r.pool===8000 && r.scoped===false);
}
{
  const r=fn(MGR,{leaderRows:rows(80,80), leaderMgrs:mgrs(1), month:'2026-09'},{team_tiers:[]},'2026-09');
  ok('★  門檻整個刪光時退回 80/4,000，不會算成 0 或爆掉', r.pool===8000);
}

console.log('\n⑨ 設定畫面');
ok('★★★ 門檻那幾列不會撐出卡外（grid 子項要補 min-width:0）',
   /\.hr-tt-row\{display:grid;grid-template-columns:1fr 1\.1fr 34px;/.test(src)
   && /\.hr-tt-row>\*\{min-width:0;\}/.test(src)
   && /<div class="hr-tt-head">/.test(src));
ok('★★★ 門檻可以新增、可以刪除',
   /function hrAddTeamTier\(\)\{/.test(src)
   && /onclick="hrAddTeamTier\(\)"/.test(src)
   && /onclick="this\.parentElement\.remove\(\)" title="刪除這一階"/.test(src));
ok('★★★ 名單是全域的，而且畫面上要講明「全主管共用」',
   /<b>全主管共用<\/b>：這裡改的是全店設定，不是只改這一位。/.test(src));
ok('★★★ 存的是全域 salary_templates._global，不是存在這位員工身上',
   /_G\.team_tiers=hrReadTeamTiers\(\);/.test(src)
   && /_G\.team_members=_tm;/.test(src)
   && /await dbPut\('salary_templates',\{id:'_global',config:_G\}\);/.test(src));
ok('★★★ 非主管的視窗畫不出那一塊時整段跳過（不會被清空）',
   /if\(!els\.length\) return undefined;/.test(src)
   && /if\(_tm!==undefined\)\{/.test(src));
ok('★★ 全選＝null（日後新進教練自動納入），不是把當下每個人的 id 寫死',
   /return \(on\.length===els\.length\) \? null : on;/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
