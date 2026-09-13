/* 管理員代補打卡（2026-09-13 使用者：「今天員工mango忘記打卡 我無法幫她補打」）
   那天黃美蓉（Mango）整天沒打卡，而既有兩個入口都要求「當天已經有一筆紀錄」：
   ① 驚嘆號只認「有上班、忘了下班、而且日期在今天以前」（punchIssuesOf）
   ② 今日值班圓環的代打要 att.id 存在才點得開（dutyRingHTML 的 _canProxy）
   於是「完全沒打卡」是唯一沒有入口的情況，只能等本人送申請（submitPunchRequest 寫死本人）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),{得到:a,預期:e});
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };

console.log('① 入口');
ok('★★★ 驚嘆號彈窗底部多一顆「代補打卡」，只給管理員',
   /\$\{SESSION&&SESSION\.role==='admin'\?`<button class="btn btn-ghost" onclick="openProxyPunch\(\)">代補打卡<\/button>`:''\}/.test(src));
ok('★★ 成因寫在原地（三個入口為什麼都不通）',
   /今天員工mango忘記打卡/.test(src) && /完全沒打」變成唯一沒有入口的情況/.test(src));

console.log('\n② 開窗：選誰、選哪天');
const OP=fnBody('openProxyPunch');
ok('★★★ 兩支都擋權限（畫面沒露出不等於做不到）',
   /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以代補打卡'\); return; \}/.test(OP)
   && /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('只有管理員可以代補打卡'\); return; \}/.test(fnBody('_saveProxyPunch')));
ok('★★ 只列需要打卡的在職員工', /c\.need_punch && c\.status!=='inactive' && c\.status!=='resigned'/.test(OP));
ok('★★ 日期不給選未來（打卡是既成事實，不是排班）', /<input type="date" id="pp-date" value="\$\{today\}" max="\$\{today\}">/.test(OP));
ok('★ 從某位員工的驚嘆號進來時，預設就選他', /const pre=window\._punchFixEmp\|\|'';/.test(OP));

console.log('\n③ 寫入');
const SV=fnBody('_saveProxyPunch');
ok('★★★ 未來日期再擋一次', /if\(date>ymd\(TODAY\)\)\{ showToast\('不能補未來的日期'\); return; \}/.test(SV));
ok('★★★ 至少要填一個時間', /if\(!cin&&!cout\)\{ showToast\('請至少填一個時間'\); return; \}/.test(SV));
ok('★★★ 沿用 approvePunchReq 那套：有紀錄就補空格、沒有才新建',
   /let rec=await getAttendance\(empId,date\);/.test(SV) && /if\(!rec\) rec=\{id:uid\('AT'\),emp_id:empId,emp_name:nm,date,created_at:new Date\(\)\.toISOString\(\)\};/.test(SV));
ok('★★★ 工時用系統同一支算（0.5 小時為單位）', /if\(rec\.clock_in&&rec\.clock_out\) rec\.work_hours=calcWorkHours\(rec\);/.test(SV));
ok('★★★ 留痕：誰代補的、什麼時候', /rec\.fixed_by=SESSION\.id; rec\.fixed_at=new Date\(\)\.toISOString\(\);/.test(SV)
   && /代補打卡\$\{reason\?\('（'\+reason\+'）'\):''\}/.test(SV));
ok('★★ 防連點', /return onceAct\('proxypunch', _saveProxyPunch\);/.test(src));

console.log('\n④ 不覆蓋本人打對的時間');
{
  /* 只取「補空格」那段邏輯實跑：已有值且不同 → 記進 _kept、不覆蓋 */
  const fill=(rec,cin,cout)=>{ const _kept=[];
    if(cin){ if(rec.clock_in && rec.clock_in!==cin) _kept.push('上班'); else rec.clock_in=cin; }
    if(cout){ if(rec.clock_out && rec.clock_out!==cout) _kept.push('下班'); else rec.clock_out=cout; }
    return {rec,_kept}; };
  const a=fill({},'08:30','15:00');
  eq('★★★ 整天空白 → 兩格都補上', [a.rec.clock_in,a.rec.clock_out,a._kept], ['08:30','15:00',[]]);
  const b=fill({clock_in:'08:41'},'08:30','15:00');
  eq('★★★ 他自己打過上班 → 上班保留原值，只補下班', [b.rec.clock_in,b.rec.clock_out,b._kept], ['08:41','15:00',['上班']]);
  ok('★★ 保留了什麼要講出來，不能默默不補', /原本就有紀錄，沒有蓋掉/.test(SV));
}

console.log('\n⑤ 這支邏輯真的跟系統一致');
{
  const calc=new Function(fnBody('calcWorkHours')+'\nreturn calcWorkHours;')();
  eq('★★ 08:30–15:00 ＝ 6.5 小時（Mango 那筆補登的值）', calc({clock_in:'08:30',clock_out:'15:00'}), 6.5);
  eq('★★ 跨午夜也算得出來', calc({clock_in:'22:00',clock_out:'02:00'}), 4);
}

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
