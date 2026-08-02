/* 2026-08-02 使用者指示（一連串，都是同一件事：員工資料下方那排入口太散）：
   ①「本月課堂點開用月曆呈現，每一天可以再點開看當天的名單」
   ②「本月值班也改成月曆模式」
   ③「把最近打卡這功能整理在本月值班裡面，就可以移除這個按鈕」
   ④「本月薪資改成薪資單，連動完整薪資單的彈跳視窗」
   ⑤「特休的按鈕也放到本月值班的視窗裡面」
   ⑥「員工資料下方的工作紀錄可以重新編排，改成列表」
   ⑦（附截圖）「這一筆資料移除，或新增刪除按鈕讓我按」

   原本課堂與值班都是把整月倒成一張長表格：看得到「有哪幾筆」，看不出「哪幾天有排、
   哪幾天空著」。打卡又是第三張表 —— 但打卡跟值班是同一天的兩件事（該上班、有沒有到），
   拆成兩個入口時「排了班卻沒打卡」得自己開兩張表對照。合成一張月曆就一眼看到。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* 月曆那幾支是純函式（吃 _ppCal 的狀態、吐 HTML），可以直接跑 */
const FNS=['ppCalDaysOf','ppCalGrid','ppCalCellClass','ppCalCellDuty','ppCalBkOf','ppCalShiftOf',
           'ppCalAttOf','ppCalDayBox','ppCalNames','ppCalClassSum','ppCalDutySum'];
function mk(state, extra){
  const env=Object.assign({
    _ppCal:state,
    _PPCAL_DONE:st=>st==='completed'||st==='checked_in',
    ymd:()=>'2026-08-02', TODAY:new Date(2026,7,2),
    calcWorkHours:r=>{ if(!r||!r.clock_in||!r.clock_out) return null;
      const[a,b]=r.clock_in.split(':').map(Number),[c,d]=r.clock_out.split(':').map(Number);
      let m=(c*60+d)-(a*60+b); if(m<0)m+=1440; return Math.round(m/6)/10; },
    bookingTypeName:b=>b.category||'課',
    isDeskLike:()=>true, PP:{rec:null},
  }, extra||{});
  const code=FNS.map(grabFn).join('\n')+'\nreturn {'+FNS.join(',')+'};';
  return new Function(...Object.keys(env), code)(...Object.values(env));
}
const BASE={ kind:'class', id:'E1', name:'小曾', month:'2026-08', sel:null,
  bookings:[], memMap:{M1:'王小明',M2:'李小美'}, shifts:[], att:[] };

console.log('① 月份格線');
{
  const F=mk(Object.assign({},BASE));
  eq('★ 八月 31 天，1 號是週六', [F.ppCalDaysOf('2026-08').days, F.ppCalDaysOf('2026-08').first], [31,6]);
  eq('★ 二月算得對（不是硬寫 30/31）', F.ppCalDaysOf('2026-02').days, 28);
  eq('　　閏年二月 29 天', F.ppCalDaysOf('2024-02').days, 29);
  const h=F.ppCalGrid();
  eq('★ 月初補空格，格子數＝空格＋天數', (h.match(/class="cdash-cell/g)||[]).length, 6+31);
  ok('★ 今天有記號', /cdash-today/.test(h));
  ok('　　週末底色不同（排班看的就是平日／假日）', /cdash-wk/.test(h));
  ok('★ 空的那天點不動（點了也沒東西看）', /ppc-blank/.test(h) && !/ppc-blank[^>]*onclick/.test(h));
}

console.log('\n② 課堂月曆：格子看密度，點開看名單');
{
  const bk=[
    {id:'b1',date:'2026-08-05',start_time:'10:00',status:'completed',category:'私人教練',member_id:'M1'},
    {id:'b2',date:'2026-08-05',start_time:'14:00',status:'booked',category:'私人教練',member_id:'M2'},
    {id:'b3',date:'2026-08-12',start_time:'19:00',status:'checked_in',category:'團體課',member_ids:['M1','M1','M2']},
  ];
  let F=mk(Object.assign({},BASE,{bookings:bk}));
  const c5=F.ppCalCellClass('2026-08-05');
  ok('★ 一天兩堂、一完成一未上 → 兩顆燈分開數', /lamp-done">1</.test(c5) && /lamp-pend">1</.test(c5), c5);
  eq('　　沒課的那天不畫東西（月曆才看得出空檔）', F.ppCalCellClass('2026-08-06'), '');
  ok('★ 上方合計：本月幾堂、已完成幾堂', /本月 <b>3<\/b> 堂/.test(F.ppCalClassSum()) && /已完成 <b class="ppc-g">2<\/b>/.test(F.ppCalClassSum()));

  F=mk(Object.assign({},BASE,{bookings:bk, sel:'2026-08-05'}));
  const box=F.ppCalDayBox();
  ok('★ 點開看得到當天每一堂的時間與對象', /10:00/.test(box) && /王小明/.test(box) && /14:00/.test(box) && /李小美/.test(box), box);
  ok('　　也看得到狀態', /已完成/.test(box) && /已預約/.test(box));

  F=mk(Object.assign({},BASE,{bookings:bk, sel:'2026-08-12'}));
  ok('★ 團課看得到整份名單（不是只寫「3 人」）', /王小明 ×2/.test(F.ppCalDayBox()) && /李小美/.test(F.ppCalDayBox()), F.ppCalDayBox());
  ok('　　同一人佔兩個名額收成「×2」，不會列兩次',
     (F.ppCalDayBox().match(/王小明/g)||[]).length===1);

  F=mk(Object.assign({},BASE,{bookings:bk}));
  ok('★ 還沒點日期時給提示，不是一片空白', /點一天看當天名單/.test(F.ppCalDayBox()));
}

console.log('\n③ 值班月曆：排班與打卡排在同一格');
{
  const st={ kind:'duty', id:'E1', name:'小曾', month:'2026-08', sel:null, bookings:[], memMap:{},
    shifts:[{date:'2026-08-03',start_time:'09:00',end_time:'18:00',hours:8},
            {date:'2026-08-04',start_time:'09:00',end_time:'18:00',hours:8},
            {date:'2026-08-05',leave_type:'特休',hours:8}],
    att:[{date:'2026-08-03',clock_in:'08:55',clock_out:'18:10'},
         {date:'2026-08-04',clock_in:'08:58',clock_out:null}] };
  const F=mk(st);
  const c3=F.ppCalCellDuty('2026-08-03');
  ok('★ 有排班有打卡 → 兩個都寫在同一格（8 小時的班、實際 9.3 小時）',
     /🕒8h/.test(c3) && /9\.3h/.test(c3), c3);
  ok('★ 忘記打下班 → 標出來（不是靜靜留白）', /未打下班/.test(F.ppCalCellDuty('2026-08-04')));
  ok('★ 請假那天標請假，不寫時數', /請特休/.test(F.ppCalCellDuty('2026-08-05'))
     && !/🕒/.test(F.ppCalCellDuty('2026-08-05')));
  eq('　　沒排班也沒打卡的日子留白', F.ppCalCellDuty('2026-08-06'), '');

  const st2=Object.assign({},st,{att:[]});
  ok('★ 排了班卻完全沒打卡 → 也要看得出來（這正是合成一張月曆要解決的事）',
     /未打卡/.test(mk(st2).ppCalCellDuty('2026-08-03')));
  ok('★ 上方合計把「排了班沒打卡」直接算出來',
     /<b class="ppc-w">2<\/b> 天排了班沒打卡/.test(mk(st2).ppCalDutySum()), mk(st2).ppCalDutySum());
  const sum=F.ppCalDutySum();
  ok('　　也給排班時數、打卡天數與工時', /排班 <b>16<\/b> 小時/.test(sum) && /打卡 <b class="ppc-g">2<\/b> 天/.test(sum), sum);
  ok('　　忘記打下班的天數也列出來', /<b class="ppc-w">1<\/b> 天忘記打下班/.test(sum));

  const box=mk(Object.assign({},st,{sel:'2026-08-04'})).ppCalDayBox();
  ok('★ 點開同時看到班別與打卡', /09:00–18:00/.test(box) && /08:58/.test(box), box);
  ok('★ 沒打下班在明細裡也標紅', /<b class="ppc-w">未打<\/b>/.test(box));
  ok('★ 點開的那天可以直接改打卡（不用再繞回別的地方）',
     /openPunchEdit\('E1','2026-08-04'\)/.test(box));
  const box2=mk(Object.assign({},st,{sel:'2026-08-06'})).ppCalDayBox();
  ok('　　沒排班沒打卡的日子講清楚，並給補登入口',
     /這一天沒有排班/.test(box2) && /沒有打卡紀錄/.test(box2) && /補登這天的打卡/.test(box2));
}

console.log('\n④ 入口整理：工作紀錄改成列表');
ok('★ 改用列表（不是卡片格）', /<div class="pp-dlist">/.test(src) && /function ppDashRow\(icon, title, value, sub, go\)\{/.test(src));
ok('★ 只剩四行：本月課堂／值班與打卡／薪資單／薪資規則',
   (src.match(/\$\{ppDashRow\(/g)||[]).length===4
   && /ppDashRow\('calendar','本月課堂'/.test(src)
   && /ppDashRow\('clock','值班與打卡'/.test(src)
   && /ppDashRow\('money','薪資單'/.test(src)
   && /ppDashRow\('card','薪資規則'/.test(src));
ok('★「最近打卡」那顆卡拿掉了', !/ppDashCard\('clock','最近打卡'/.test(src) && !/'最近打卡'/.test(src));
ok('★「特休」那顆卡也拿掉了（併進值班視窗）',
   !/ppDashCard\('leaf','特休'/.test(src) && !/async function ppOpenEmpLeave/.test(src));
ok('　　值班那一行的標題寫出「打卡」，不然沒人知道打卡搬去哪了',
   /ppDashRow\('clock','值班與打卡'/.test(src));
ok('　　特休的數字仍在那一行的說明裡（不用點進去才知道剩多少）',
   /月曆 · 排班與打卡對照 · 特休 \$\{al\} 小時可用/.test(src));
ok('★ 會員那側仍是卡片（那邊是四個並列的紀錄型入口，沒有要改）',
   /<div class="pp-dash" style="grid-template-columns:repeat\(2,1fr\);">/.test(src));

console.log('\n⑤ 舊入口不會壞');
ok('★ ppOpenEmpPunch 保留成導向值班月曆（補登存完的返回、員工列表的鑰匙都靠它）',
   /async function ppOpenEmpPunch\(id\)\{ return ppCalOpen\('duty', id, \(_ppCal&&_ppCal\.id===id\)\?_ppCal\.month:null\); \}/.test(src));
ok('　　沒有留下第二份同名實作（會蓋掉新的那份）',
   src.split('async function ppOpenEmpPunch(').length===2);
ok('　　舊的打卡長表格整份移除', !/近 \$\{att\.length\} 筆/.test(src));
ok('★ 課堂與值班共用同一個開法，只差 kind',
   /async function ppOpenEmpClasses\(id, month\)\{ return ppCalOpen\('class', id, month\); \}/.test(src)
   && /async function ppOpenEmpShifts\(id, month\)\{ return ppCalOpen\('duty', id, month\); \}/.test(src));
ok('★ 翻月只在前端切，不重打資料庫', /一次載完整份、之後翻月都在前端切/.test(src));
ok('　　再點同一天＝收起來', /function ppCalPick\(ds\)\{ if\(!_ppCal\) return; _ppCal\.sel=\(_ppCal\.sel===ds\)\?null:ds; ppCalDraw\(\); \}/.test(src));
ok('　　本月時「下個月」按不動', /isCurMonth\?' disabled style="opacity:\.4;cursor:not-allowed;"':''/.test(src));

console.log('\n⑥ 本月薪資 → 直接開完整薪資單');
ok('★ 不再是只有兩行數字的摘要視窗',
   /async function ppOpenEmpSalary\(id\)\{\n\s*closeModal\(\);\n\s*return openSalarySheet\(\(SESSION&&SESSION\.id===id\)\?undefined:id\);/.test(src));
ok('★ 看自己的不傳 id（教練沒有管理員權限，傳了會被擋）',
   /看自己的不傳 id：薪資單只有管理員能指定別人/.test(src));
ok('　　中間那層「開啟完整薪資頁」的按鈕沒了（只剩註解記著為什麼拿掉）',
   !/>開啟完整薪資頁</.test(src));

console.log('\n⑦ 特休併進值班視窗');
ok('★ 值班視窗裡有特休的按鈕', /function ppCalLeaveBar\(\)\{/.test(src)
   && /<button class="ppc-al-btn" onclick="ppCalToggleLeave\(\)">特休 <b>\$\{avail\}<\/b> 小時可用/.test(src));
ok('★ 就地展開，不再疊一層彈窗（疊了就得再做返回）',
   /不另外疊一層彈窗（疊起來就得再做返回）/.test(src));
ok('★ 展開看得到結轉／新增／已使用', /去年結轉 <b>\$\{n\('al_carry_hours'\)\}<\/b>/.test(src)
   && /今年新增 <b>\$\{n\('al_earned_hours'\)\}<\/b>/.test(src)
   && /已使用 <b>\$\{used\}<\/b>/.test(src));
ok('★ 課堂月曆不顯示特休（那是值班的事）', /const leaveBar = isCls \? '' : ppCalLeaveBar\(\);/.test(src));
ok('　　從別的地方開、沒載到這個人的特休帳時不硬印數字',
   /if\(!r\) return '';\s+\/\/ 從別的地方開的/.test(src));

console.log('\n⑧ 打卡紀錄可以直接刪');
ok('★ 修改視窗裡有「刪除這筆」（原本只能兩個時間清空再存，那是規則不是按鈕）',
   /\$\{rec\?`<button class="btn btn-ghost" style="color:var\(--danger,#b5372e\);" onclick="delPunchRec\('\$\{empId\}','\$\{d\}'\)">刪除這筆<\/button>`:''\}/.test(src));
ok('★ 沒有紀錄的那天不出現刪除鈕（沒東西可刪）', /\$\{rec\?`<button class="btn btn-ghost" style="color:var\(--danger/.test(src));
ok('★ 刪除會影響工時與薪資，所以問一次再刪',
   /if\(!confirm\(`確定刪除 \$\{String\(d\)\.replace\(\/-\/g,'\/'\)\} 的打卡紀錄？/.test(src));
ok('★ 刪除也上了防連點鎖',
   /async function delPunchRec\(empId, d\)\{ return onceAct\('punchdel:'\+empId\+':'\+d, \(\)=>_delPunchRec\(empId,d\)\); \}/.test(src));
ok('　　刪完回到值班月曆（接著處理下一天不用重進）', /await dbDel\('attendance',rec\.id\);[\s\S]{0,120}ppOpenEmpPunch\(empId\);/.test(src));
ok('　　原本「清空兩個時間＝刪除」的路留著（不影響既有習慣）',
   /if\(rec\)\{ await dbDel\('attendance',rec\.id\); showToast\(`已刪除 \$\{d\.slice\(5\)\} 的打卡紀錄`\); \}/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
