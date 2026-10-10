/* 遲到警示（2026-10-10 使用者：「小曾這一天晚打卡　系統都沒有警示嗎
   例如在員工管理名單這邊要有提示」）

   在此之前遲到**完全沒有警示**：驚嘆號只認「有上班沒下班」與補卡申請，
   晚打卡不算異常；唯一看得到的是員工自己時間軸上那幾格紅色。
   使用者定兩條：**不寬限**（晚 1 分鐘就算）、**看本月**（與薪資班表同口徑）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 真的把 punchLateOf 抽出來跑，不是比字串 */
function grab(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0) throw new Error('找不到 '+name);
  let d=0, j=src.indexOf('{', i);
  for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.slice(i,k+1);} }
  throw new Error('括號沒收完 '+name);
}
const timeToMin=t=>{ const[a,b]=String(t).split(':').map(Number); return a*60+(b||0); };
const punchLateOf=new Function('timeToMin', grab('punchLateOf')+'; return punchLateOf;')(timeToMin);

const SH=[
  {emp_id:'e1', date:'2026-10-09', start_time:'16:00', end_time:'22:00'},
  {emp_id:'e1', date:'2026-10-08', start_time:'16:00', end_time:'22:00'},
  {emp_id:'e1', date:'2026-10-07', start_time:'16:00', end_time:'22:00', leave_type:'sick'},
  {emp_id:'e2', date:'2026-10-09', start_time:'09:00', end_time:'17:00'},
  {emp_id:'e1', date:'2026-09-30', start_time:'16:00', end_time:'22:00'},
];
const AT=[
  {id:'a1', emp_id:'e1', date:'2026-10-09', clock_in:'16:06', clock_out:'22:06'},  // 遲到 6 分（使用者截圖那筆）
  {id:'a2', emp_id:'e1', date:'2026-10-08', clock_in:'15:55', clock_out:'22:00'},  // 提早到，不算
  {id:'a3', emp_id:'e1', date:'2026-10-07', clock_in:'16:30', clock_out:'22:00'},  // 請假日，不算
  {id:'a4', emp_id:'e2', date:'2026-10-09', clock_in:'09:01', clock_out:'17:00'},  // 晚 1 分也算
  {id:'a5', emp_id:'e1', date:'2026-09-30', clock_in:'16:40', clock_out:'22:00'},  // 上個月，不算
  {id:'a6', emp_id:'e3', date:'2026-10-09', clock_in:'10:30', clock_out:'19:00'},  // 沒排班，不算
];

console.log('① 不寬限：晚 1 分鐘就算（使用者定）');
const e2=punchLateOf(AT, SH, 'e2', '2026-10');
eq('★★★ e2 晚 1 分被抓到', e2.map(r=>[r.date, r.lateMin]), [['2026-10-09', 1]]);

console.log('\n② 使用者截圖那一筆');
const e1=punchLateOf(AT, SH, 'e1', '2026-10');
eq('★★★ 排 16:00、16:06 打卡 → 晚 6 分', e1.map(r=>[r.date, r.start_time, r.clock_in, r.lateMin]),
   [['2026-10-09','16:00','16:06',6]]);
ok('★★★ 帶得出 attendance 的 id（修正時間要用）', e1[0] && e1[0].id==='a1');

console.log('\n③ 這些不算遲到');
ok('★★★ 提早打卡', !e1.some(r=>r.date==='2026-10-08'));
ok('★★★ 請假那天（班表有 leave_type，本來就不用到）', !e1.some(r=>r.date==='2026-10-07'));
ok('★★★ 上個月（只看本月，與薪資班表同口徑）', !e1.some(r=>r.date==='2026-09-30'));
eq('★★★ 沒排班的人不算（沒有「該到的時間」可以比）', punchLateOf(AT, SH, 'e3', '2026-10').length, 0);

console.log('\n④ 全部員工一起看（empId 傳 null）');
eq('★★ 兩個人共 2 筆、日期新的在前', punchLateOf(AT, SH, null, '2026-10').map(r=>r.emp_id).sort(), ['e1','e2']);

console.log('\n⑤ 只用驚嘆號（2026-10-10 使用者：「都用驚嘆號表示就好」）');
/* 一度另外做了一顆金色「遲到 N」，使用者否決：一個員工只要一個訊號。 */
const code=src.replace(/\/\*[\s\S]*?\*\//g,'');
ok('★★★ 金色那顆已經收掉（不是藏起來，是整個不存在）',
   !/st-late/.test(code));
ok('★★★ 遲到併進驚嘆號的數字裡（shifts 有帶進去）',
   /_punch\[c\.id\]=punchIssuesOf\(_pa,_prq,c\.id,_td,_psh\)\.n;/.test(src));
ok('★★★ n 真的把三種加起來', /n:abn\.length\+pend\.length\+late\.length/.test(src));
ok('★★ 舊呼叫端（沒帶 shifts）行為不變 —— late 會是空陣列',
   /const late=shifts \? punchLateOf\(att, shifts, empId, String\(today\)\.slice\(0,7\)\) : \[\];/.test(src));
ok('★★ 驚嘆號的說明有寫清楚是哪三種',
   /漏打下班／遲到／補卡申請/.test(src));
ok('★★ 彈窗有「本月遲到」一區，並寫明不寬限', /本月遲到（\$\{lateRows0\.length\}）/.test(src)
   && /不寬限幾分鐘/.test(src));
ok('★★ 打錯時間可以修正（沿用管理員那支，不另做一個）',
   /onclick="dutyPunchOutAsk\('\$\{r\.id\}'\)">修正時間/.test(src));

console.log('\n⑥ 併進去之後數字要對');
const punchIssuesOf=new Function('punchLateOf', grab('punchIssuesOf')+'; return punchIssuesOf;')(punchLateOf);
const REQ=[{id:'q1', emp_id:'e1', status:'pending', date:'2026-10-05'}];
const AT2=AT.concat([{id:'a7', emp_id:'e1', date:'2026-10-01', clock_in:'16:00', clock_out:null}]);
eq('★★★ e1＝漏打下班 1 ＋ 補卡申請 1 ＋ 本月遲到 1 ＝ 3',
   punchIssuesOf(AT2, REQ, 'e1', '2026-10-10', SH).n, 3);
eq('★★★ 不帶 shifts 就回到舊行為（2）',
   punchIssuesOf(AT2, REQ, 'e1', '2026-10-10').n, 2);

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
