/* 買了兩份團課優惠，要能在同一堂課排兩個名額（2026-09-07 使用者回報）——
   「羅書恆購買兩份團課優惠　但是在預約團課的時候　如果不選擇使用人　就無法預約在同一堂課」

   0829 把「已在名單」整列藏起來時，濾的單位是「一位使用人」（member|family_user）。
   兩張都沒填使用人的票會併成同一列 → 第一格佔掉之後整列消失 → 第二張票沒有入口。
   正式庫看得到後果：他今天買的兩張（TK-mtqqtwj4ada6 / TK-mtqqu7hty8ei）
   其中一張的 family_user 被填成「佩玲」—— 那是被系統逼出來的假資料。

   改成再問一句：這一列還有沒有「這堂還沒用到、而且有剩餘堂數」的票。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 把 addMode 的那段濾網原樣抽出來跑 */
const i0=src.indexOf('  if(_addMode){\n    const _pk=window._grpPick||{};');
const FIL=src.slice(i0, src.indexOf('  window._grpRows=', i0));
const run=(ROWS, seatTk, taken, pick)=>{
  const win={_grpPick:pick||{}, _grpTaken:taken||{}, _grpSeatTk:seatTk||{}, _grpAdd:true};
  const fn=new Function('ROWS','window','_addMode','let _inClass=0;'+FIL+'return {ROWS,_inClass};');
  return fn(ROWS, win, true);
};
const row=(mid,fam,tks)=>({m:{id:mid,name:'x'}, fam:fam||'', tks:tks, seats:[]});
const T=(id,left)=>({id, left:left==null?4:left});

console.log('① 羅書恆：兩張都沒填使用人');
{
  const r=run([row('M1','',[T('TK-A',0),T('TK-B',4)])], {'M1':'TK-A'}, {'M1|':1});
  ok('★★ 第一格用了 A、B 還有剩 → 這一列留著（排得進第二格）', r.ROWS.length===1);
  ok('★★ 而且要標出來這是「再加一格」，不然櫃檯以為自己點錯', r.ROWS[0].again===true);
  ok('★★ 未列出人數不把它算進去（它沒被藏）', r._inClass===0);
}

console.log('\n② 0829 想擋掉的雜訊仍然要擋掉');
{
  const r=run([row('M1','',[T('TK-A',0)])], {'M1':'TK-A'}, {'M1|':1});
  ok('★★ 只有一張票、而且已經被這堂用掉 → 藏起來（同一張扣兩格請走「管理名單」）',
     r.ROWS.length===0 && r._inClass===1);
}
{
  const r=run([row('M1','媽媽',[T('TK-M',0)]), row('M1','姊姊',[T('TK-S',4)])],
              {'M1':'TK-M'}, {'M1|媽媽':1});
  ok('★★ 許佳慈那型：媽媽那列藏掉、姊姊那列還在（濾的單位是使用人）',
     r.ROWS.length===1 && r.ROWS[0].fam==='姊姊');
}
{
  const r=run([row('M1','',[T('TK-A',0),T('TK-B',0)])], {'M1':'TK-A'}, {'M1|':1});
  ok('★★ 另一張是 0 堂 → 不算可用，照樣藏（不能讓人加進來卻扣不到票）',
     r.ROWS.length===0);
}

console.log('\n③ 剛點選的那一列永遠留著（按下去立刻消失會以為沒加到）');
{
  const r=run([row('M1','',[T('TK-A',0)])], {'M1':'TK-A'}, {'M1|':1}, {mid:'M1',fam:''});
  ok('★★ isPicked 優先於一切', r.ROWS.length===1);
}

console.log('\n④ 判準用的是課卡記的事實，不是推算');
ok('★★ 已用票取自 _grpSeatTk（逐名額記的票）',
   /const _usedTk=new Set\(Object\.values\(window\._grpSeatTk\|\|\{\}\)\.map\(String\)\)/.test(FIL));
ok('★★ 只放行「另有一張沒被這堂用掉、且有剩餘堂數」的票',
   /_spare=\(r\.tks\|\|\[\]\)\.some\(t=>t && !_usedTk\.has\(String\(t\.id\)\) && \(Number\(t\.left\)\|\|0\)>0\)/.test(FIL));
ok('★  原因寫在原地（含使用者原話與「假資料」那句）',
   /就無法預約在同一堂課/.test(src) && /那是被系統逼出來的假資料/.test(src));
ok('★  列上的副標會講明白', /已在名單・可用另一張票再加一格/.test(src));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
