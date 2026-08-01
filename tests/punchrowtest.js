/* 2026-08-01 使用者指示：
   「管理員的打卡異常與補打卡移除 把這個功能設計在員工列表的每一列員工各自身上
     如果有異常顯示驚嘆號 讓我可以點選查看修改」

   原本要先切到「打卡異常與補卡」分頁，再在一長串裡找是誰。改成：
   誰有問題，誰那一列就掛紅色驚嘆號，點下去只看那個人的兩種待處理事項。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 分頁與入口移除');
ok('★ STAFF_TABS 不再有 punchfix', !/\{key:'punchfix',label:'打卡異常與補卡'\}/.test(src));
ok('★ 左側次選單的「打卡異常與補卡」入口移除',
   !/\{grp:'人事', label:'打卡異常與補卡', page:'staff', tab:'punchfix'\}/.test(src));
ok('★ 舊的深連結／記憶的分頁落回員工列表，並直接打開全部員工的彈窗（不是白畫面）',
   /else if\(_staffTab==='punchfix'\)\{ _staffTab='list'; CUR_TAB='list'; await renderStaffList\(\);\s*\n\s*setTimeout\(\(\)=>\{ try\{ openPunchFixModal\(null\); \}catch\(_\)\{\} \},0\); \}/.test(src));
ok('★ punchfix 的抬頭文案保留（導回 list 之前 h 取不到會噴 undefined）',
   /punchfix:  \['STAFF','員工管理'/.test(src));
ok('★ 首頁待辦的「N 筆補打卡待審核」仍直接看得到那幾筆',
   /function gotoPunchReview\(\)\{ _staffTab='list'; CUR_TAB='list'; window\._navTab='list'; navTo\('staff','g_admin'\);\s*\n\s*setTimeout\(\(\)=>\{ try\{ openPunchFixModal\(null\); \}catch\(_\)\{\} \},260\); \}/.test(src));
ok('　　出勤頁那邊的 renderAttAbnormal／renderStaffAttendance 保留，沒有一起砍掉',
   /function renderAttAbnormal\(needPunch,all\)\{/.test(src)
   && /async function renderStaffAttendance\(tab\)\{/.test(src));

console.log('\n② 員工列表每一列的驚嘆號');
ok('★ 名字後面掛驚嘆號，且只在有待處理時出現',
   /\$\{\(_punch\[c\.id\]\|\|0\)\?`<button class="st-punch-x"[\s\S]{0,200}openPunchFixModal\('\$\{c\.id\}'\)">!<\/button>`:''\}/.test(src));
ok('★ 點驚嘆號不會順便觸發整列的「開員工明細」', /event\.stopPropagation\(\);openPunchFixModal/.test(src));
ok('★ 滑過去看得到有幾筆', /title="打卡異常／補卡申請 \$\{_punch\[c\.id\]\} 筆，點一下查看修改"/.test(src));
ok('★ 用紅色（影響工時與薪資，是要處理的錯不是提醒）',
   /\.st-punch-x\{width:19px;height:19px;border-radius:50%;border:none;flex:0 0 auto;\s*\n\s*background:var\(--danger,#b5372e\);/.test(src));
ok('★ 列表的筆數與彈窗共用 punchIssuesOf（兩邊不可能對不上）',
   /coaches\.forEach\(c=>\{ _punch\[c\.id\]=punchIssuesOf\(_pa,_prq,c\.id,_td\)\.n; \}\);/.test(src));
ok('　　不限本月：忘記打下班擺著不處理，工時就一直是錯的',
   /不限本月：忘記打下班的紀錄擺著不處理，工時就一直是錯的/.test(src));
ok('　　統計失敗不會讓整個員工列表畫不出來', /catch\(e\)\{ console\.error\('員工列表打卡待處理統計失敗:',e\); \}/.test(src));

console.log('\n③ 彈窗');
ok('★ 有 openPunchFixModal，兩種待處理分開列',
   /async function openPunchFixModal\(empId\)\{/.test(src)
   && /異常打卡（\$\{d\.abn\.length\}）/.test(src)
   && /補卡申請待審核（\$\{d\.pend\.length\}）/.test(src));
ok('★ 異常打卡可以補登下班', /onclick="fixPunchOut\('\$\{r\.id\}'\)">補登下班<\/button>/.test(src));
ok('★ 補卡申請可以核准／駁回',
   /onclick="rejectPunchReq\('\$\{r\.id\}'\)">駁回<\/button>/.test(src)
   && /onclick="approvePunchReq\('\$\{r\.id\}'\)">核准<\/button>/.test(src));
ok('★ 沒事的時候給空狀態，並說明這裡會列什麼', /沒有需要處理的打卡問題 👍/.test(src));
ok('★ 全部員工的視角會標出是誰（單一員工的視角不重複標名字）',
   /const nm=r=>empId\?'':`<b class="pfx-who">\$\{esc\(nameOf\(r\.emp_id\)\|\|r\.emp_name\|\|'—'\)\}<\/b>`;/.test(src));
ok('★ 姓名與原因有跳脫，不會被資料裡的角括號弄壞版面',
   /const esc=t=>String\(t==null\?'':t\)\.replace\(\/&\/g,'&amp;'\)\.replace\(\/<\/g,'&lt;'\)\.replace\(\/>\/g,'&gt;'\);/.test(src));
ok('★ 處理完一筆回到同一個彈窗（原本是跳去出勤頁，連續處理要重進好幾次）',
   /function punchFixReopen\(\)\{/.test(src)
   && /punchFixReopen\(\);   \/\/ 2026-08-01：回到同一個彈窗，連續處理不用重進/.test(src));
ok('　　核准／駁回／補登三個收尾都改過來，沒有漏',
   (src.match(/punchFixReopen\(\);/g)||[]).length>=3
   && !/showToast\('已駁回'\);\s*\n\s*navTo\('attendance'\);/.test(src)
   && !/showToast\('已補登，工時 '\+rec\.work_hours\+' 小時'\); navTo\('attendance'\);/.test(src));
ok('　　筆數多時彈窗內捲，不會長到看不到底', /\.pfx-list\{[^}]*max-height:min\(46vh,340px\);overflow-y:auto;\}/.test(src));

console.log('\n④ 實跑：一位員工有哪些待處理');
{
  const i=src.indexOf('function punchIssuesOf(att, reqs, empId, today){');
  const punchIssuesOf=new Function(src.slice(i, src.indexOf('\n}\n', i)+3)+'\nreturn punchIssuesOf;')();
  const ATT=[
    {id:'A1',emp_id:'e1',date:'2026-07-28',clock_in:'09:00',clock_out:null},   // 忘記打下班
    {id:'A2',emp_id:'e1',date:'2026-07-30',clock_in:'09:00',clock_out:'18:00'},// 正常
    {id:'A3',emp_id:'e2',date:'2026-07-29',clock_in:'14:00',clock_out:null},   // 別人的
    {id:'A4',emp_id:'e1',date:'2026-08-01',clock_in:'09:00',clock_out:null},   // 今天，還在上班中
    {id:'A5',emp_id:'e1',date:'2026-07-20',clock_in:null,clock_out:'18:00'},   // 只有下班（不算這一類）
    {id:'A6',emp_id:'e1',date:null,clock_in:'09:00',clock_out:null},           // 沒有日期的壞資料
  ];
  const REQ=[
    {id:'R1',emp_id:'e1',status:'pending', created_at:'2026-07-31T02:00:00Z'},
    {id:'R2',emp_id:'e1',status:'approved',created_at:'2026-07-30T02:00:00Z'},
    {id:'R3',emp_id:'e2',status:'pending', created_at:'2026-07-29T02:00:00Z'},
    {id:'R4',emp_id:'e1',status:'pending', created_at:'2026-07-29T02:00:00Z'},
  ];
  const T='2026-08-01';
  const r1=punchIssuesOf(ATT,REQ,'e1',T);
  eq('★ 只算「過去的日期、有上班沒下班」', r1.abn.map(x=>x.id), ['A1']);
  eq('　　今天還在上班中的不算異常（下班本來就還沒到）', r1.abn.some(x=>x.id==='A4'), false);
  eq('　　只有下班沒上班的不算這一類', r1.abn.some(x=>x.id==='A5'), false);
  eq('　　沒有日期的壞資料直接跳過，不會噴錯', r1.abn.some(x=>x.id==='A6'), false);
  eq('★ 補卡申請只算待審核的，且照送出時間由舊到新', r1.pend.map(x=>x.id), ['R4','R1']);
  eq('★ 驚嘆號上的數字＝兩種加總', r1.n, 3);
  eq('★ 不會混到別人的', punchIssuesOf(ATT,REQ,'e2',T).n, 2);
  eq('★ empId 傳 null＝全部員工（首頁待辦走這條）',
     [punchIssuesOf(ATT,REQ,null,T).abn.map(x=>x.id), punchIssuesOf(ATT,REQ,null,T).pend.map(x=>x.id)],
     [['A3','A1'], ['R3','R4','R1']]);
  eq('　　異常照日期由新到舊（最近的先處理）',
     punchIssuesOf(ATT,REQ,null,T).abn.map(x=>x.date), ['2026-07-29','2026-07-28']);
  eq('　　沒有任何待處理 → n=0，列表就不掛驚嘆號',
     punchIssuesOf([{id:'A9',emp_id:'e1',date:'2026-07-28',clock_in:'09:00',clock_out:'18:00'}],[],'e1',T).n, 0);
  eq('　　資料是 null 也不會爆', punchIssuesOf(null,null,'e1',T).n, 0);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
