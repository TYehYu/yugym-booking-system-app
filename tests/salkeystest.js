/* 薪資單的鍵要齊（2026-10-20 Mango 回報「看不了薪資單」）

   畫面訊息：undefined is not an object (evaluating 'val.toLocaleString')
   —— 教練端薪資單整頁打不開。

   根因：1019 加生理假時三個常數都算好了
     baseLeavePersonalDed / baseLeaveSickDed / baseLeaveMensDed
   但 computeSalary 的 return 只帶了前兩個。教練端那一列寫的是
     if(myLeave.生理假>0) h+=ded(..., sal.baseLeaveMensDed)
   於是**只要有人請過生理假，他的薪資單就整頁打不開**。
   Mango 10/19 剛好請了生理假，所以只有她壞。

   這支擋的是「算了卻沒回傳」這一類，不是只釘生理假那一個鍵：
   把 computeSalary 回傳物件的鍵抓出來，跟全檔的 sal.<鍵> 讀取比對。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* computeSalary 的回傳物件 */
const i0=src.indexOf('  return { base, adjBase, baseLeaveDeduct, baseHourly, schedHours,');
const i1=src.indexOf('\n  };', i0);
const RET=src.slice(i0, i1);
ok('★ 抓得到 computeSalary 的回傳物件', i0>0 && i1>i0);

/* 鍵：`x,` 或 `x:` 兩種寫法都有 */
const keys=new Set();
RET.replace(/(?:^|[{,\s])([A-Za-z_][A-Za-z0-9_]*)\s*(?::|[,}\n])/g,(_,k)=>{keys.add(k);return _;});

console.log('\n① 讀得到的 sal.<鍵> 都要在回傳物件裡');
{
  const used=new Set();
  src.replace(/\bsal\.([A-Za-z_][A-Za-z0-9_]*)/g,(_,k)=>{used.add(k);return _;});
  /* sal 這個變數名在別處也被拿來指 DOM 元素，.style 是那一種，排除。 */
  used.delete('style');
  const missing=[...used].filter(k=>!keys.has(k)).sort();
  ok('★★★ 沒有「算了卻沒回傳」的鍵', missing.length===0, missing);
}

console.log('\n② 三種扣薪假都要回傳（1019 漏掉的就是第三個）');
{
  ['baseLeavePersonalDed','baseLeaveSickDed','baseLeaveMensDed'].forEach(k=>{
    ok('★★★ 回傳 '+k, keys.has(k));
  });
  ok('★★ 三個常數都真的有算',
     /const baseLeavePersonalDed = Math\.round\(leavePersonal\*baseHourly\);/.test(src)
     && /const baseLeaveSickDed = Math\.round\(leaveSick\*baseHourly\*0\.5\);/.test(src)
     && /const baseLeaveMensDed = Math\.round\(leaveMens\*baseHourly\*0\.5\);/.test(src));
  ok('★★ 合計有把生理假加進去',
     /const baseLeaveDeduct = baseLeavePersonalDed \+ baseLeaveSickDed \+ baseLeaveMensDed;/.test(src));
}

console.log('\n③ _zeroSal 的預設物件也要有這三個（不然歷史月份同一個洞）');
{
  const j0=src.indexOf('const _zeroSal=n=>({');
  const j1=src.indexOf('grossPay:n, netPay:n, total:n });', j0);
  const Z=src.slice(j0,j1);
  ok('★ 抓得到 _zeroSal', j0>0 && j1>j0);
  ['baseLeavePersonalDed','baseLeaveSickDed','baseLeaveMensDed','leaveDeductDetail'].forEach(k=>{
    ok('★★ _zeroSal 有 '+k, new RegExp('\\b'+k+':').test(Z));
  });
  ok('★★ 假別清單含生理假（leaveSummary 與 _zeroSal 要同一套）',
     /leave:\{特休:0,病假:0,生理假:0,事假:0,喪假:0,其他:0\}/.test(Z)
     && /return \{ scheduled, 特休, 病假, 生理假, 事假, 喪假, 其他, leaveTotal/.test(src));
}

console.log('\n④ 教訓寫在原地（下一個加扣款項目的人要看到）');
ok('★★ 三處要一起看，寫在 return 上面',
   /新增扣款項目時，這三處要一起看：/.test(src)
   && /算式 → 這份 return → _zeroSal 的預設物件。/.test(src));
ok('★★ 症狀寫出來（只要有人請過生理假就整頁打不開）',
   /只要有人請過生理假，他的薪資單就整頁打不開/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
