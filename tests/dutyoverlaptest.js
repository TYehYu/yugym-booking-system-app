/* 值班時段內上課：薪資單要說得出「為什麼被扣掉這個時數」（2026-08-30 使用者指示）

   「這種因為值班又上課的情況因為會扣除值班時薪改成課堂薪資
     也要記錄在薪資單上　讓員工知道他為什麼被扣掉這個時數」

   ⚠ 這一支盯兩件事：
     ① 明細與扣掉的時數是**同一份**（dutyClassOverlapHours 只是 dutyClassOverlapRows 的加總）
        —— 分兩份算的話，薪資單列出來的時段會跟實際扣的錢對不起來。
     ② 說明欄位**不參與計算**。呼叫端傳進 calcSalary 的 dutyHours 早就是淨時數了，
        在 calcSalary 裡再扣一次＝同一段時間扣兩遍。
        （0830 之前 payrollCalcRows 就有那三行說明，但上游一律帶 classOverlap=0，
          所以那段程式碼從來沒被畫出來過 —— 時數靜靜少掉。） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 規則寫在原地');
{
  ok('★★★ 時數由明細加總，不是各算各的',
     /function dutyClassOverlapHours\(shifts, bookings, empId, month, emp\)\{\s*\n\s*return dutyClassOverlapRows\(shifts, bookings, empId, month, emp\)\s*\n\s*\.reduce\(\(n,r\)=>n\+r\.hr, 0\);\s*\n\}/.test(src));
  ok('★★★ 三個薪資單都把明細帶進 calcSalary',
     (src.match(/dutyOverlapRows:_?dutyOvRows/g)||[]).length===3);
  ok('★★★ 說明欄位不參與計算（註解講清楚，避免有人「順手」再扣一次）',
     /只給畫面看，不參與計算/.test(src)
     && /如果在這裡再減一次，同一段時間會被扣兩遍/.test(src));
  ok('★★★ 毛額用「淨值班費＋重疊金額」倒推，三個數字一定加得起來',
     /const dutyOvGross=dutyPay\+dutyOvPay;/.test(src));
  ok('★★ 三處薪資單共用同一份明細列',
     /function dutyOverlapListHTML\(sal\)\{/.test(src)
     && (src.match(/dutyOverlapListHTML\(s(al)?\)/g)||[]).length>=3);
  ok('★★★ 舊的死路已經拆掉（payrollCalcRows 不再吃永遠為 0 的 dutyClassDeduct）',
     !/if\(s\.dutyClassDeduct>0\) h\+=rowDeduct/.test(src)
     && /從來沒有被畫出來過/.test(src));
  ok('★★ 正職仍然完全不扣（0731 定案沒被動到）',
     /if\(emp && normEmp\(emp\.employment_type\|\|emp\.pay_type\)==='full_time'\) return \[\];/.test(src));
}

console.log('\n② 實跑 dutyClassOverlapRows');
{
  const i=src.indexOf('function dutyClassOverlapRows(');
  const j=src.indexOf('// ── 值班時數：以打卡時數計');
  if(i<0||j<0) throw new Error('切不到重疊那一段');
  const mk=(emp)=>new Function('normEmp','bkCoachId','bkCounts','bkIsGroup','timeToMin','minToTime',
      src.slice(i,j)+'\nreturn {dutyClassOverlapRows,dutyClassOverlapHours};')(
    v=>v||'full_time',
    b=>b.coach_id, ()=>true, b=>b.category==='小班肌力',
    t=>{ const[h,m]=String(t).split(':').map(Number); return h*60+m; },
    n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'));
  const api=mk();
  const PT={id:'E1', employment_type:'part_time'};
  const FT={id:'E1', employment_type:'full_time'};
  const sh=(d,a,b)=>({emp_id:'E1',date:d,start_time:a,end_time:b});
  const cls=(d,t,cat,st)=>({coach_id:'E1',date:d,start_time:t,duration:60,
    category:cat||'小班肌力',status:st||'checked_in'});

  eq('★★★ 曾邦宏 8/07 的形狀：排班 16–22、18:00 團課 → 1 小時，明細指得出是哪一段',
     api.dutyClassOverlapRows([sh('2026-08-07','16:00','22:00')],
       [cls('2026-08-07','18:00')],'E1','2026-08',PT),
     [{date:'2026-08-07',from:'18:00',to:'19:00',hr:1,category:'小班肌力',cls:'18:00'}]);

  eq('★★★ 課在班外就不算（他 8/03 白天班、晚上團課 → 0）',
     api.dutyClassOverlapHours([sh('2026-08-03','09:00','15:00')],
       [cls('2026-08-03','19:00'),cls('2026-08-03','20:00')],'E1','2026-08',PT), 0);

  eq('★★★ 只重疊一半就只算一半（課 14:30–15:30、班到 15:00 → 0.5）',
     api.dutyClassOverlapRows([sh('2026-08-05','09:00','15:00')],
       [cls('2026-08-05','14:30')],'E1','2026-08',PT).map(r=>[r.from,r.to,r.hr]),
     [['14:30','15:00',0.5]]);

  eq('★★ 正職一律 0（0731 定案：月薪制不重複懲罰）',
     api.dutyClassOverlapRows([sh('2026-08-07','16:00','22:00')],
       [cls('2026-08-07','18:00')],'E1','2026-08',FT), []);

  eq('★★ 沒簽到的課不扣（排了沒來，值班費照領）',
     api.dutyClassOverlapHours([sh('2026-08-07','16:00','22:00')],
       [cls('2026-08-07','18:00','小班肌力','booked')],'E1','2026-08',PT), 0);

  eq('★★ 教練課／體驗課一樣算',
     api.dutyClassOverlapHours([sh('2026-08-07','16:00','22:00')],
       [cls('2026-08-07','18:00','私人教練'),cls('2026-08-07','20:00','體驗')],'E1','2026-08',PT), 2);

  eq('★★ 同一天兩堂都在班內 → 各記一列，加總 2 小時',
     api.dutyClassOverlapRows([sh('2026-08-07','16:00','22:00')],
       [cls('2026-08-07','20:00'),cls('2026-08-07','18:00')],'E1','2026-08',PT)
       .map(r=>r.from),
     ['18:00','20:00']);   // 依時間排序，薪資單上不會跳來跳去

  eq('　 別月的班與課不會混進來',
     api.dutyClassOverlapHours([sh('2026-07-07','16:00','22:00')],
       [cls('2026-07-07','18:00')],'E1','2026-08',PT), 0);
}

console.log('\n③ 三個數字要加得起來');
{
  /* dutyOvGross − dutyOvPay === dutyPay，用倒推法保證，不會因四捨五入差一塊 */
  const calc=(netHr, ovHr, rate)=>{
    const dutyPay=Math.round(netHr*rate);
    const dutyOvPay=Math.round(ovHr*rate);
    return {gross:dutyPay+dutyOvPay, deduct:dutyOvPay, net:dutyPay};
  };
  const a=calc(95, 1, 200);
  eq('★★★ 曾邦宏 8 月：$19,200 − $200 = $19,000', [a.gross,a.deduct,a.net], [19200,200,19000]);
  const b=calc(37.5, 2.5, 183);   // 故意挑會產生小數的組合
  ok('★★★ 時薪不整除時也一定加得起來（倒推法的意義就在這裡）',
     b.gross-b.deduct===b.net, b);
}

console.log('\n④ 薪資單 KPI：0 就淡化並寫原因（2026-08-30 使用者指示）');
{
  ok('★★★ 淡化不隱藏 —— 欄位消失會被當成系統漏算',
     /\.dash-sum\.sal-kpi4 \.ds-card\.ds-zero\{opacity:\.42;cursor:help;\}/.test(src)
     && /淡化不隱藏：欄位消失的話，員工會以為系統漏算/.test(src));
  ok('★★★ 值班 0 的四種原因分開講（不需值班／沒排班／沒打卡／全在上課）',
     /這個職務不需要值班，所以不計值班費。/.test(src)
     && /這個月沒有排班，所以沒有值班時數。/.test(src)
     && /有排班，但沒有打卡紀錄/.test(src)
     && /排班時間全部都在上課，那幾段已改領課堂費用/.test(src));
  ok('★★ 續約 0 要說清楚什麼才算續約（不然員工以為賣了票就該有）',
     /只有賣票時約別標記為「續約」的才算，新約與分期後續期數不計/.test(src));
  ok('★★ 課程數與團課數各有各的說法',
     /這個月還沒有已完成或已簽到的課程。/.test(src) && /這個月沒有帶團體課。/.test(src));
  ok('★★★ 值班原因看 need_duty（跟算 _dutyCap 同一個旗標，不會自相矛盾）',
     /const _dutyWhy = !me\.need_duty \?/.test(src)
     && /拿別的旗標來解釋會出現「說不需值班、卻有時數」的矛盾/.test(src));
  ok('★★ 續約有數字時仍然可以點開名單（淡化不能把功能弄不見）',
     /attr:' onclick="openRenewList\(\)" title="點看續約名單"', arrow:true/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
