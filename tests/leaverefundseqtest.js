/* 教練請假退堂的那一格，不算這張票的一堂（2026-08-30 使用者回報）

   「鄭宇涵這堂課是 7/8　為什麼被記錄成 8/8　還通知客人要繳錢了」

   正式庫的形狀（MTK-CDDD37B6CD8C，友善教練課 1V1，8 堂）：
     7/06 completed・7/20・7/27・8/03・8/10・8/17 checked_in（＝6 堂真的用掉）
     8/24  MANGO 請假 → 改記自主訓練、未到場結課、**堂數當場退回**（帳本淨額 0）
           ⚠ 但那筆預約仍然掛著同一個 ticket_id、狀態 completed
     8/31 booked（第 7 堂）
     sessions_remaining = 1

   票券夾（buildWallet.isAtt）早就不算 8/24，所以圓點畫 6/8 是對的。
   但「第幾堂／共幾堂」與續課提醒是另一套算法，把 8/24 當成一堂 →
     ・_bkSeq：8/31 變成 8/8（正確是 7/8）
     ・_renewLastBk：8 − 已用7 − 已排1 = 0 → 判定最後一堂 → 跳收款提醒 → 櫃檯去跟客人收錢

   同一張票不能有兩套「用了幾堂」。這一支釘住：判準只有一份，而且鄭宇涵那張票算得出 7/8。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 判準只有一份');
{
  ok('★★★ 抽成 bkLeaveRefunded，不再各處抄一份',
     /function bkLeaveRefunded\(b\)\{\s*\n\s*return !!b && b\.coach_leave===true && \(b\.status==='checked_in'\|\|b\.status==='completed'\);\s*\n\}/.test(src));
  ok('★★★ 原本那四份抄寫都收斂掉了（只剩函式本體那一份）',
     (src.match(/coach_leave===true && \(b\.status==='checked_in'\|\|b\.status==='completed'\)/g)||[]).length===1);
  ok('★★★ computeLastBkMarks 建索引時就把它排除',
     /if\(b&&b\.ticket_id&&b\.status!=='cancelled'&&!bkLeaveRefunded\(b\)\)\{ \(_bkByTk\[b\.ticket_id\]=_bkByTk\[b\.ticket_id\]\|\|\[\]\)\.push\(b\); \}/.test(src));
  ok('★★ 票券夾（圓點）也改吃同一支 —— 兩邊本來就該一致',
     /if\(bkLeaveRefunded\(b\)\) return false;/.test(src));
  ok('★★ usedSessionsMap 也是同一支',
     /if\(bkLeaveRefunded\(b\)\) return;   \/\* 教練請假簽到＝淨額 0/.test(src));
  ok('★★ 判準看的是旗標與狀態，不是備註文字（備註是人寫的，會變）',
     /判準是「請假且已結課」，不是看備註文字 —— 備註是人寫的，會變/.test(src));
  ok('★★★ 為什麼會誤發收款提醒，寫在原地',
     /_renewLastBk：8−7已用−1已排＝0 → 判定「最後一堂」→ 跳續課提醒 → 櫃檯去跟客人收錢/.test(src));
}

console.log('\n② 實跑：鄭宇涵那張票');
{
  /* 把 _bkSeq 與 _renewLastBk 的兩條算式照抄出來跑（來源見上方切片斷言） */
  const LR=new Function('return '+src.slice(src.indexOf('function bkLeaveRefunded(b){'),
    src.indexOf('\n}\n', src.indexOf('function bkLeaveRefunded(b){'))+2)+';')();

  const mk=(id,date,status,tk,clv)=>({id,date,start_time:'14:00',status,ticket_id:tk,coach_leave:clv||null});
  const TK='MTK-CDDD37B6CD8C';
  const all=[
    mk('IMP-00464','2026-07-06','completed',TK),
    mk('IMP-00366','2026-07-13','cancelled',null),          // MANGO 請假，以取消處理
    mk('IMP-00209','2026-07-20','checked_in',TK),
    mk('IMP-00087','2026-07-27','checked_in',TK),
    mk('B669','2026-08-03','checked_in',TK),
    mk('B684','2026-08-10','checked_in',TK),
    mk('B701','2026-08-17','checked_in',TK),
    mk('B706','2026-08-24','completed',TK,true),            // ← 教練請假、堂數已退，但票還掛著
    mk('BK-ms73d0gfl8js','2026-08-31','booked',TK),
  ];
  const build=arr=>arr.filter(b=>b&&b.ticket_id&&b.status!=='cancelled'&&!LR(b))
    .sort((x,y)=>((x.date||'')+(x.start_time||'')).localeCompare((y.date||'')+(y.start_time||'')));

  const linked=build(all);
  eq('★★★ 掛在這張票上的課＝7 堂（8/24 請假那格不算）', linked.length, 7);
  eq('★★★ 8/31 是第 7 堂，不是第 8 堂', linked.findIndex(b=>b.date==='2026-08-31')+1, 7);

  const done=linked.filter(b=>b.status==='checked_in'||b.status==='completed').length;
  const ahead=linked.length-done;
  const total=8, remaining=1;
  eq('★★★ 已用 6、已排 1', [done,ahead], [6,1]);
  const byLink=total-done-ahead, byBal=remaining;
  eq('★★★ 還沒排的堂數＝1 → 不是最後一堂，不該跳收款提醒',
     [byLink, byBal, Math.min(byLink,byBal)>0], [1,1,true]);

  /* 修好之前的行為（釘住，避免有人「順手」把排除拿掉） */
  const bad=all.filter(b=>b&&b.ticket_id&&b.status!=='cancelled');
  const badDone=bad.filter(b=>b.status==='checked_in'||b.status==='completed').length;
  eq('★★★ 舊算法會算成 8/8、還沒排的堂數 0（＝誤判最後一堂的來源）',
     [bad.length, total-badDone-(bad.length-badDone)], [8, 0]);
}

console.log('\n③ 不能把該提醒的也擋掉');
{
  const LR=new Function('return '+src.slice(src.indexOf('function bkLeaveRefunded(b){'),
    src.indexOf('\n}\n', src.indexOf('function bkLeaveRefunded(b){'))+2)+';')();
  const b=(status,clv)=>({coach_leave:clv, status});
  eq('★★★ 只有「請假＋已結課」才排除', [
    LR(b('completed',true)), LR(b('checked_in',true)),
    LR(b('booked',true)),          // 請假但還沒結課 → 堂數還掛著，要算
    LR(b('completed',null)),       // 正常上完 → 當然要算
    LR(b('cancelled',true)),       // 取消：本來就被 status 那關擋掉，這裡不表態
    LR(null),
  ], [true,true,false,false,false,false]);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
