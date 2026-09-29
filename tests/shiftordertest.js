/* 班表的員工列排序（2026-09-29）

   使用者：「桌機導覽列的班表 裡面的內容給我優化建議
     我想要改成排序由上至下全班 早班 晚班 支援班」→ 選「員工列依班別排序」。

   ⚠ 一個人每天可以排不同班，所以「他是哪一班的」＝**這個月排最多的那一班**。
   ⚠ 支援班（補班）不是某個人的班別，它本來就固定在表格最後一列。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 排序規則寫在原地');
ok('★★★ 依「這個月排最多的那一班」分組', /const _shKind=e=>\{/.test(src));
ok('★★★ 平手時 全 > 早 > 晚（與使用者講的順序一致）',
   /return cnt\[0\]===max\?0:\(cnt\[1\]===max\?1:2\);\s*\/\/ 平手時 全 > 早 > 晚/.test(src));
ok('★★★ 補班不算進某個人的班別（它固定在最後一列）', /if\(s\.emp_id!==e\.id \|\| shIsSub\(s\)\) return;/.test(src));
ok('★★ 同一班別內照姓名排（不然每次重畫順序會跳）',
   /\(a\.k-b\.k\) \|\| String\(a\.e\.name\|\|''\)\.localeCompare\(String\(b\.e\.name\|\|''\),'zh-Hant'\)/.test(src));
ok('★★ 這個月沒排班的人排最後', /if\(!n\) return 4;/.test(src));

console.log('\n② 實跑排序');
{
  const F=(src.match(/const _shKind=e=>\{[\s\S]*?\n  \};/)||[''])[0];
  const SH=[
    // 阿全：4 全 1 早
    ...Array.from({length:4},(_,i)=>({emp_id:'A',code:'全',date:'2026-09-0'+(i+1)})),
    {emp_id:'A',code:'早',date:'2026-09-05'},
    // 小早：3 早
    ...Array.from({length:3},(_,i)=>({emp_id:'B',code:'早',date:'2026-09-0'+(i+1)})),
    // 晚晚：2 晚
    {emp_id:'C',code:'晚',date:'2026-09-01'},{emp_id:'C',code:'晚',date:'2026-09-02'},
    // 補班的（不算）
    {emp_id:'D',code:'全',date:'2026-09-01',is_sub:true},
    // 平手：1 全 1 早 1 晚 → 取全
    {emp_id:'E',code:'全',date:'2026-09-01'},{emp_id:'E',code:'早',date:'2026-09-02'},{emp_id:'E',code:'晚',date:'2026-09-03'},
  ];
  const mk=id=>new Function('_monthShifts0','shIsSub','shiftCodeDisp','shiftCode',
    F+'\nreturn _shKind({id:'+JSON.stringify(id)+'});')(SH, s=>!!s.is_sub, c=>c, ()=>'');
  eq('★★★ 4 全 1 早 → 全（0）', mk('A'), 0);
  eq('★★★ 3 早 → 早（1）', mk('B'), 1);
  eq('★★★ 2 晚 → 晚（2）', mk('C'), 2);
  eq('★★★ 只有補班 → 當作沒排班（4）', mk('D'), 4);
  eq('★★★ 各 1 班平手 → 取全（0）', mk('E'), 0);
  eq('★★ 完全沒資料 → 4', mk('Z'), 4);
}

console.log('\n③ 畫面標得出來');
ok('★★★ 姓名那一格標主要班別（不標的話看不出列是照什麼排的）',
   /\{0:'<b class="shn-kind sh-code-full">全<\/b>',1:'<b class="shn-kind sh-code-am">早<\/b>',/.test(src));
/* ⚠ 顏色沿用格子裡那一套（全紅／早金／晚綠），不另訂一組 */
ok('★★ 顏色沿用既有的班別色 class', /\.sh-code\.sh-code-full\{background:var\(--danger/.test(src)
   && /\.shn-kind\{display:inline-block;/.test(src));

/* 使用者：「如果有教練請假　格子改成[假]顯示在支援班的下面　一個教練就一列」 */
console.log('\n④ 請假區');
ok('★★★ 排在補班列之後、一位一列', /<tr class="sh-lvrow">/.test(src)
   && src.indexOf('sh-subrow')<src.indexOf('sh-lvrow'));
ok('★★★ 格子畫〔假〕', /<b class="sh-code sh-code-leave"/.test(src) && />假<\/b>/.test(src));
/* ⚠ 兩種請假都收：排班請假（特休／病假／事假）與教練請假（課程請假補登）——
   在班表上都是「這天他不在」，分開列只會讓人要對兩個地方。 */
ok('★★★ 兩種請假都收（有 leave_type 就算，補班那幾筆除外）',
   /const _lv=monthShifts\.filter\(s=>s&&s\.leave_type&&!shIsSub\(s\)\);/.test(src));
ok('★★ 沒有人請假就整區不畫（不要留一排空格子）',
   /if\(!_lv\.length\) return '';/.test(src));
ok('★★ 假別與時數寫進 title（不佔格子寬度）',
   /\$\{s\.leave_type\|\|'請假'\}\$\{s\.leave_hours\?` \$\{s\.leave_hours\} 小時`:''\}/.test(src));
ok('★★ 這一區是唯讀（點了不會開排班編輯）', /sh-cell-ro">\$\{inner\}/.test(src));
ok('★★ 灰底，與班別色分得開（它不是一種班）',
   /\.sh-code\.sh-code-leave\{background:var\(--t3,#9C9084\);\}/.test(src));

/* 使用者：「補班人員改成支援班　這一列要支薪　只是如果是主管職[沛瀞]跟[東翰]
   就不用另外給薪」 */
console.log('\n⑤ 支援班的計薪');
{
  const F=(src.match(/function dutyHoursCapped\([\s\S]*?\n\}/)||[''])[0];
  const run=(emp,shifts,att)=>new Function('attendance','shifts','empId','month','emp','shIsSub','calcWorkHours',
    F.replace(/^function dutyHoursCapped\([^)]*\)\{/,'').replace(/\}$/,''))
    (att,shifts,'E1','2026-09',emp,s=>!!s.is_sub,a=>Number(a.h)||0);
  const SH=[{emp_id:'E1',date:'2026-09-01',hours:8},
            {emp_id:'E1',date:'2026-09-02',hours:6,is_sub:true}];
  const ATT=[{emp_id:'E1',date:'2026-09-01',h:8},{emp_id:'E1',date:'2026-09-02',h:6}];
  ok('★★★ 一般員工：支援班照算（8＋6＝14）', run({is_manager:false},SH,ATT)===14, run({is_manager:false},SH,ATT));
  /* ⚠ 主管的管理職責本來就含支援，不另外給薪 */
  ok('★★★ 主管職：只算正常班那 8 小時', run({is_manager:true},SH,ATT)===8, run({is_manager:true},SH,ATT));
  ok('★★ 沒傳 emp 就維持原行為（有幾個呼叫端只是要看時數）',
     run(null,SH,ATT)===14, run(null,SH,ATT));
  ok('★★★ 算薪那三個呼叫端都把 emp 傳進去',
     (src.match(/dutyHoursCapped\((attendance,shifts,empId,ym,emp|attendance, shifts, emp\.id, month, emp|attendance, shifts, empId, month, me)\)/g)||[]).length===3);
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
