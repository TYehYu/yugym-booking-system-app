/* 2026-08-08 使用者定案，補課券的兩條新規則：
     ②「補課券不得退費也不能再請假」
     ③「課程如果是因為\"教練請假\"該堂課該方案期限延長一週，如果是會員請假才給補課券」

   補課券是「會員自己請假」換來的一次補課機會（2026-07-26 定案，只屬團課）。
   在那之前它跟一般票券一樣：補課那堂可以再請假（再換一張券）、取消還會退回去 ——
   等於一次請假可以無限展延，而且教練沒來時櫃檯也只能整堂取消再補發補課券，
   讓會員自己的補課額度替店家的疏失買單。

   新規則整理成一句話：
     會員自己不能來 → 補課券（一次，用完為止）
     教練不能來     → 票券退回，方案期限延長一週（不動補課額度） */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

/* ── ② 補課券：不得退費、不能再請假 ─────────────────────────────── */
console.log('② 補課券不得退費也不能再請假');

console.log('  這一格用的是哪一張票（認得出來才擋得住）');
{
  const env={
    dbGet:async(t,id)=>({id, source:id==='TK-MK'?'makeup':'purchase'}),
    seatMid:k=>{const s=String(k),i=s.indexOf('#');return i<0?s:s.slice(0,i);},
    grpNetDeductTicket:async()=>'TK-LOG',
  };
  const F=new Function(...Object.keys(env), grabFn('seatTicketOf')+'\n'+grabFn('tkIsMakeup')
    +'\nreturn {seatTicketOf,tkIsMakeup};')(...Object.values(env));
  (async()=>{
    const b={id:'G1',seat_tickets:{'M1':'TK-MK','M1#2':'TK-A'}};
    eq('★★ 先看課卡上逐名額記下的事實（seat_tickets）',
       (await F.seatTicketOf(b,'M1')).id, 'TK-MK');
    eq('★ 同一人的第 2 個名額是另一張（逐名額、不是逐人）',
       (await F.seatTicketOf(b,'M1#2')).id, 'TK-A');
    eq('★ 沒記名額歸屬時退回「還有淨扣課的那張」',
       (await F.seatTicketOf({id:'G2'},'M1')).id, 'TK-LOG');
    eq('　　補課券認得出來', [F.tkIsMakeup({source:'makeup'}), F.tkIsMakeup({source:'purchase'}), F.tkIsMakeup(null)],
       [true,false,false]);
  })();
}

console.log('  不能再請假');
{
  const F=grabFn('_groupToggleLeave');
  ok('★★ 標請假之前先問這一格用的是不是補課券',
     /const _seatTk=await seatTicketOf\(b, sk\);\n\s*if\(tkIsMakeup\(_seatTk\)\)\{/.test(F));
  ok('★ 擋下來，而且說得出原因（不是只說「失敗」）',
     /showToast\('這一格是用補課券補的課，不能再請假（補課券只補一次）'\);\n\s*return;/.test(F));
  ok('★★ 擋在發券之前（不會先發了才發現）', (()=>{
    const a=F.indexOf('tkIsMakeup(_seatTk)'), b=F.indexOf('grantMakeupTicket');
    return a>0 && b>a;
  })());
  ok('　　為什麼不能再請假，寫在原地',
     /補課券本來就是「請假換來的一次補課機會」，再請假等於無限展延。/.test(F));
  ok('　　一般票券照舊可以請假（沒有被一起擋掉）',
     /const tk=await grantMakeupTicket\(b,mid,sk\);/.test(F));
}

console.log('  取消退回（2026-08-11 使用者定案：「補課券有期限，所以補課券退課還是要退回票券」，推翻 8/8 不退規則）');
{
  const F=grabFn('doGroupCancelSeat');
  ok('★★ 補課券取消照一般票券退回 1 堂（不再有 tkIsMakeup 沒收分支）',
     /tk\.sessions_remaining=\(Number\(tk\.sessions_remaining\)\|\|0\)\+1;/.test(F)
     && !/依規定不退回/.test(F));
  ok('★ 帳本備註分得出補課券（對帳可辨識）',
     /tkIsMakeup\(tk\)\?'團體課取消預約退回（補課券，效期不變）':'團體課取消預約退回'/.test(F));
  ok('　　為什麼改退，寫在原地（效期防線移到「不能再請假」）',
     /效期不重算，過期防線在「不能再請假」/.test(F));
}

console.log('  取消視窗要先講清楚（不能按下去才發現）');
{
  const F=grabFn('_groupCancelSeat');
  ok('★★ 視窗開之前先查這一格的票', /const _seatTk=await seatTicketOf\(b, sk\);\n\s*const _isMk=tkIsMakeup\(_seatTk\);/.test(F));
  ok('★★ 紅底警示只跟 24 小時內有關（補課券取消會退回，不再紅底）',
     /background:\$\{within24\?'#fbeceb':'#eef5f1'\}/.test(F));
  ok('★ 明講「補課券退回」與「效期不變」',
     /\$\{tkChip\('back','補課券退回'\)\}/.test(F)
     && /效期不變<\/b>（仍以券上原效期為準，請在效期內重新預約）/.test(F));
  ok('★ 補課券的情況不建議「改用請假」（補課券不能再請假）',
     /\$\{_isMk\?'':`<div style="font-size:12px;color:var\(--t2\);margin-top:10px;line-height:2\.2;">/.test(F));
}

/* ── ③ 教練請假 → 期限延長一週；會員請假才給補課券 ────────────────── */
console.log('\n③ 教練請假延長效期一週，會員請假才給補課券');

console.log('  兩種做法分得清楚');
ok('★★ 口袋直接寫出做法（教練課改自主訓練、團課整堂取消）',
   /coachLeave:'self',        \/\/ 教練請假 → 退票＋展延效期＋改成自主訓練（bkCoachLeaveMode）/.test(src)
   && /coachLeave:'cancel',      \/\/ 教練請假 → 整堂取消、逐名額退票＋效期＋7 天（grpCoachLeave，不發補課券）/.test(src));
ok('★ 使用者的原話寫在程式裡',
   /課程如果是因為"教練請假"該堂課該方案期限延長一週，\s*\n\s*如果是會員請假才給補課券/.test(src));
ok('★★ 明講「兩種都不發補課券」以及為什麼',
   /兩種都\*\*不發補課券\*\*：補課券是「會員自己請假」換來的一次補課機會（2026-07-26 定案），\s*\n\s*教練沒來是店家的事，該還的是一週的使用期限，不是消耗會員的補課額度。/.test(src));

console.log('  團課：整堂取消 → 逐名額退票 → 效期各 +7 天');
{
  const F=grabFn('_doGrpCoachLeave');
  ok('★ 重複標記擋下', /if\(bkIsCoachLeave\(b\)\)\{ showToast\('這堂已經標記過教練請假'\); return; \}/.test(F));
  ok('★★ 走既有的整堂取消（force 退票），不另寫一套退票邏輯',
     /await cancelBooking\(id,'force',\{silent:true\}\);/.test(F));
  ok('★★ 只延「這次退的」那幾張票 —— 取消前先記下既有的 refund 帳本，事後做差集',
     /const before=new Set\(\);/.test(F)
     && /if\(l&&l\.booking_id===b\.id&&l\.action==='refund'\) before\.add\(l\.id\);/.test(F)
     && /\.filter\(l=>l&&l\.booking_id===b\.id&&l\.action==='refund'&&!before\.has\(l\.id\)\)/.test(F));
  ok('★ 為什麼要做差集（先前個別取消過的名額不能跟著延）',
     /先前個別取消過的名額不能跟著延（那是會員自己取消的，不是教練請假）。/.test(F));
  ok('★★ 逐張延 7 天，走與教練課同一支 extendForCoachLeave',
     /for\(const tid of tkIds\)\{ if\(await extendForCoachLeave\(tid,b,SESSION\.id\)\) extN\+\+; \}/.test(F));
  ok('★ 旗標與備註寫在 cancelBooking 之前（它會重讀這一筆，寫在後面會被蓋掉）', (()=>{
    const a=F.indexOf('b.coach_leave=true;'), b=F.indexOf("await dbPut('bookings',b);"), c=F.indexOf("cancelBooking(id,'force'");
    return a>0 && b>a && c>b;
  })());
  ok('★★ 逐位通知（團課沒有 member_id，cancelBooking 的通知發不出去）',
     /for\(const mid of mids\)\{[\s\S]{0,260}await pushNotification\(mid,'cancel','教練請假通知',/.test(F));
  ok('★ 通知講的是「退回＋延長一週」，不是補課券',
     /因教練請假取消，票券已退回，使用期限延長 \$\{COACH_LEAVE_EXTEND_DAYS\} 天。/.test(F));
  ok('　　延不到效期時照實說（不宣稱延了）',
     /extN\?`，\$\{extN\} 張票效期各延長 \$\{COACH_LEAVE_EXTEND_DAYS\} 天`:'（沒有可延長效期的票券）'/.test(F));
  ok('　　寫入後清快取（bookings / 票券 / 帳本 / 通知）',
     /dbCacheClear\(\['bookings','member_tickets','ticket_logs','notifications'\]\);/.test(F));
  ok('　　防連點（同一筆還在跑就跟著等同一個結果）',
     /async function doGrpCoachLeave\(id\)\{ return onceAct\('grpcleave:'\+id, \(\)=>_doGrpCoachLeave\(id\)\); \}/.test(src));
}

console.log('  按之前看得到會發生什麼');
{
  const F=grabFn('grpCoachLeave');
  ok('★★ 逐位列出：姓名／方案／效期會從哪天延到哪天',
     /rows\.push\(\{name:\(m&&m\.name\)\|\|'會員', plan:\(t&&t\.plan_name\)\|\|'（查不到票券，取消時會再找一次）', from, to\}\);/.test(F));
  ok('★ 預覽的日期用同一個天數常數算（不會與實際延的天數不一致）',
     /d\.setDate\(d\.getDate\(\)\+COACH_LEAVE_EXTEND_DAYS\); to=ymd\(d\);/.test(F));
  ok('★ 綠底（票券退回）＋明講不發補課券',
     /background:#eef5f1;border:1\.5px solid #cfe3d8/.test(F)
     && /<b>不發補課券<\/b>（補課券是會員自己請假的補償）/.test(F));
  ok('★ 沒有到期日的票照實顯示「無到期日」', /:'無到期日'/.test(F));
  ok('　　先提醒「找得到代課就改用代課」', /找得到代課教練的話請改用「代課」，這堂就照常上。/.test(F));
  ok('　　沒有人報名時不必走這一套', /if\(!ids\.length\)\{ showToast\('這堂還沒有人報名，直接取消即可'\); return; \}/.test(F));
}

console.log('  取消原因記在課卡上（狀態分不出來）');
ok('★★ 團課教練請假的 status 是 cancelled → 靠 coach_leave 旗標記錄原因',
   /function bkIsCoachLeave\(b\)\{ return !!b && \(b\.status==='coach_leave' \|\| b\.coach_leave===true\); \}/.test(src));
ok('★ 教練課那條也寫同一個旗標（兩種做法用同一個欄位查得到）',
   /b\.status='coach_leave';\n\s*b\.coach_leave=true;/.test(src));
ok('★ 資料庫欄位有加上，且註解說明用途',
   fs.existsSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260808_booking_coach_leave_flag.sql'));

console.log('  教練請假取消的課不補發補課券');
ok('★★ 按鈕條件多一條 !b.coach_leave',
   /b\.status==='cancelled'&&b\.member_id&&bkIsGroup\(b\)&&!b\.makeup_granted&&!b\.coach_leave\?/.test(src));
ok('★★ 函式本身也擋一次（深連結／程式呼叫繞不過去）',
   /if\(b\.coach_leave\)\{ showToast\('這堂是教練請假取消：已退票並延長效期，依規定不補發補課券'\); return; \}/.test(src));
ok('★ 明細上寫明為什麼取消、票券怎麼處理',
   /因<b>教練請假<\/b>整堂取消：票券已退回，使用期限各延長 \$\{COACH_LEAVE_EXTEND_DAYS\} 天。依規定<b>不補發補課券<\/b>/.test(src));
ok('　　為什麼不補發，寫在原地',
   /2026-08-08 使用者定案再加一條：因「教練請假」取消的那堂也不補發 —— 那邊改成延長效期，\s*\n\s*兩種補償同時給等於補兩次。/.test(src));

console.log('\n既有規則沒被破壞');
ok('　　會員自己請假仍是「本堂照扣＋發補課券」', /memberLeave:'makeup',     \/\/ 逐人請假 → 本堂照扣、另發補課券（groupToggleLeave）/.test(src));
ok('　　教練課的教練請假仍是「退票＋展延＋改自主訓練」',
   /b\.category='自主訓練';/.test(src) && /const COACH_LEAVE_EXTEND_DAYS=7;/.test(src));
ok('　　補課券仍只屬團課（教練課沒有補課機制）', /補課券只屬於團課的四週方案（2026-07-26 使用者指示/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
