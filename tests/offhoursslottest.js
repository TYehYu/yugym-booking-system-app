/* 行事曆的「已打烊」格子開放教練以上點（2026-10-11 使用者：
     「週日15:00 教練想預約一堂課　可是系統有限制　可以開放櫃檯以上帳號新增非營業時間的課程」
     → 追問後定為**教練以上**（與 0823 定版同一條線）；同日追加「但是要跳提示」）

   在此之前：0821 把打烊後的空格畫成灰底且拿掉 onclick，連管理員都點不動，
   只能繞路（從會員頁建、或建完再改時間）。週日 15:00 打烊，那一格就是灰的。

   ⚠ 只是把格子點得下去，規則沒放寬：仍然吃 bizOffHoursHardBlock（前後各 1 小時）
     與 confirmOffHours。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

function grab(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到 '+name);
  let d=0;
  for(let k=src.indexOf('{', i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} }
  throw new Error('括號沒收完 '+name);
}
/* 營業時間是全站唯一一份，照抄它來驗邊界 */
const BH=JSON.parse(('{'+src.match(/const BUSINESS_HOURS=\{([^}]+)\}/)[1]+'}')
  .replace(/(\d+):\[/g,'"$1":[').replace(/'/g,'"'));
const timeToMin=t=>{const[a,b]=String(t).split(':').map(Number);return a*60+(b||0);};
const DOW={'2026-10-11':0,'2026-10-10':6,'2026-10-09':5};  // 日／六／五
const bizCloseMin=ds=>timeToMin(BH[DOW[ds]][1]);
const bizOpenMin =ds=>timeToMin(BH[DOW[ds]][0]);
const env={timeToMin,bizCloseMin,bizOpenMin,minToTime:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
  bizHoursLabel:()=>'', OFFHOURS_GRACE_MIN:60};
const mk=(name,extra)=>new Function(...Object.keys(env),...Object.keys(extra||{}),
  grab(name)+'; return '+name+';')(...Object.values(env),...Object.values(extra||{}));
const bizOffHoursLastStart=mk('bizOffHoursLastStart');
const bizOffHoursHardBlock=mk('bizOffHoursHardBlock');

console.log('① 使用者那一筆：週日 15:00');
eq('★★★ 週日打烊 15:00，最晚可以開始的打烊後時段＝15:00',
   bizOffHoursLastStart('2026-10-11'), 15*60);
eq('★★★ 週日 15:00 開始（16:00 下課）不會被硬擋', bizOffHoursHardBlock('2026-10-11','15:00',60), '');
ok('★★★ 週日 15:30 開始（16:30 下課）仍然擋', !!bizOffHoursHardBlock('2026-10-11','15:30',60));
ok('★★ 90 分鐘的課從 15:00 排也擋（16:30 下課）', !!bizOffHoursHardBlock('2026-10-11','15:00',90));

console.log('\n② 其他天的邊界');
eq('★★ 週六打烊 21:00 → 最晚 21:00 開始', bizOffHoursLastStart('2026-10-10'), 21*60);
eq('★★ 平日打烊 22:00 → 最晚 22:00 開始', bizOffHoursLastStart('2026-10-09'), 22*60);

console.log('\n③ 誰點得下去');
ok('★★★ 會員點不到（bizOffHoursCanAdd 只認員工）',
   /function bizOffHoursCanAdd\(\)\{ return !!\(SESSION && SESSION\.role && SESSION\.role!=='member'\); \}/.test(src));
ok('★★★ 格子的可點條件接上這兩支',
   /const _offOk=_closed && bizOffHoursCanAdd\(\) && min<=bizOffHoursLastStart\(ds\);/.test(src)
   && /const _canAdd=opts\.onSlot && ds>=ymd\(TODAY\) && \(!_closed \|\| _offOk\);/.test(src));

console.log('\n④ 看得出來還是打烊、而且會跳提示');
ok('★★★ 灰底沒拿掉（cal-half-closed 照掛）', /\$\{_closed\?' cal-half-closed':''\}/.test(src));
ok('★★ 可點的那一格另外標記＋游標變手指',
   /\$\{_offOk\?' cal-half-offok':''\}/.test(src)
   && /\.cal-half\.cal-half-closed\.cal-half-offok\{cursor:pointer;\}/.test(src));
ok('★★ 滑過去有寫「會先跳提示」', /已打烊 — 可以排，但會先跳提示確認/.test(src));
ok('★★★ 送出前仍然要確認（confirmOffHours 沒有被繞過）',
   /if\(!\(await confirmOffHours\(date, time, 60, '取消預約', t&&t\.category\)\)\) return;/.test(src));

console.log('\n⑤ 手機一日行事曆的軸要畫得到那一格');
ok('★★★ 軸的下緣加上寬限（只有員工）',
   /const _agGrace=bizOffHoursCanAdd\(\)\?OFFHOURS_GRACE_MIN:0;/.test(src)
   && /Math\.max\(bizCloseMin\(selDate\)\+_agGrace,/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
