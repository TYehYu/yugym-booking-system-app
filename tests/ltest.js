const fs=require('fs');
const h=fs.readFileSync('index.html','utf8');
const grab=n=>{
  let i=h.indexOf('function '+n+'(');
  if(h.slice(i-6,i)==='async ') i-=6;
  let d=0;
  for(let k=h.indexOf('{',i);k<h.length;k++){ if(h[k]==='{')d++; else if(h[k]==='}'){d--; if(!d) return h.slice(i,k+1);} }
};
/* 2026-07-31：補課券改用「名額鍵」防重複（同一人兩個名額要兩張），一併抽進來 */
/* 2026-08-01：groupToggleLeave 包了防連點鎖（onceAct），實作改名為 _groupToggleLeave */
const src=[grab('seatNo'),grab('makeupKey'),grab('grantMakeupTicket'),grab('revokeMakeupTicket'),grab('_groupToggleLeave')].join('\n');

let DB={bookings:{},member_tickets:{}}, LOGS=[], TOASTS=[], REOPENED=[];
const reset=()=>{DB={bookings:{},member_tickets:{}};LOGS=[];TOASTS=[];REOPENED=[];};
const env={
  dbGet:async(t,id)=>DB[t][id]?JSON.parse(JSON.stringify(DB[t][id])):null,
  dbPut:async(t,o)=>{DB[t][o.id]=JSON.parse(JSON.stringify(o));},
  dbDel:async(t,id)=>{delete DB[t][id];},
  dbGetAll:async t=>Object.values(DB[t]||{}).map(x=>JSON.parse(JSON.stringify(x))),
  logTicket:async(...a)=>{LOGS.push(a);},
  showToast:m=>TOASTS.push(m),
  openBookingDetail:id=>REOPENED.push(id),
  attObj:b=>b.attendance||{},
  seatMid:k=>{const x=String(k),i=x.indexOf('#');return i<0?x:x.slice(0,i);},
  uid:p=>p+'-'+(Object.keys(DB.member_tickets).length+1),
  ymd:d=>d.toISOString().slice(0,10),
  addDays:(d,n)=>new Date(d.getTime()+n*86400000),
  TODAY:new Date('2026-07-26T00:00:00Z'),
  SESSION:{id:'staff1'},
  window:{_ttCache:[{id:'tt-g',name:'團體課',category:'小班肌力'}]},
};
const api=new Function(...Object.keys(env), src+'; return {groupToggleLeave:_groupToggleLeave,grantMakeupTicket,revokeMakeupTicket,makeupKey};')(...Object.values(env));

let pass=0,fail=0;
const chk=(n,c)=>{c?pass++:fail++;console.log(`  ${c?'✓':'✗'} ${n}`);};
const mkBooking=()=>({id:'G1',category:'小班肌力',format:'團體',ticket_type_id:'tt-g',
  member_id:null,member_ids:['M1','M2'],attendance:{},status:'booked'});
const mkTicket=()=>({id:'T1',member_id:'M1',ticket_type_id:'tt-g',sessions_total:4,sessions_remaining:2,status:'usable'});

(async()=>{
  console.log('請假：');
  reset(); DB.bookings.G1=mkBooking(); DB.member_tickets.T1=mkTicket();
  await api.groupToggleLeave('G1','M1');
  chk('attendance 標成 leave', DB.bookings.G1.attendance.M1==='leave');
  const mk=Object.values(DB.member_tickets).find(t=>t.source==='makeup');
  chk('有發補課券', !!mk);
  chk('補課券 1 堂', mk && mk.sessions_total===1 && mk.sessions_remaining===1);
  chk('效期 14 天（8/09）', mk && mk.expire_date==='2026-08-09');
  chk('綁定本堂與本人', mk && mk.makeup_for_booking==='G1' && mk.member_id==='M1');
  chk('★ 原票券餘額不變（不重複扣課）', DB.member_tickets.T1.sessions_remaining===2);
  chk('不設整堂的 makeup_granted', !DB.bookings.G1.makeup_granted);
  chk('未影響其他學員', DB.bookings.G1.attendance.M2===undefined);
  chk('狀態維持 booked', DB.bookings.G1.status==='booked');

  /* 2026-07-31 使用者回報：同一堂團課一個人報了兩個名額、兩個名額都請假，只發一張。
     成因：防重複用（課卡 × 會員）當鍵，但團體課是逐名額的（TK_POCKETS.group.perSeat）。 */
  console.log('同一人兩個名額都請假 → 兩張補課券：');
  {
    reset();
    DB.bookings.G1=Object.assign(mkBooking(),{member_ids:['M1','M1','M2']});
    DB.member_tickets.T1=mkTicket();
    await api.groupToggleLeave('G1','M1');
    await api.groupToggleLeave('G1','M1#2');
    const mks=Object.values(DB.member_tickets).filter(t=>t.source==='makeup');
    chk('★ 兩個名額各一張（不是一張）', mks.length===2);
    chk('★ 兩張都給同一位會員', mks.every(t=>t.member_id==='M1'));
    chk('★ 鍵分得出是哪一個名額', mks.map(t=>t.makeup_for_booking).sort().join(',')==='G1,G1#2');
    chk('　　兩個名額的出席都標成 leave',
        DB.bookings.G1.attendance['M1']==='leave' && DB.bookings.G1.attendance['M1#2']==='leave');
    // 只取消第 2 個名額的請假 → 只收回那一張
    await api.groupToggleLeave('G1','M1#2');
    const left=Object.values(DB.member_tickets).filter(t=>t.source==='makeup');
    chk('★ 只取消第 2 個名額 → 只收回第 2 張', left.length===1 && left[0].makeup_for_booking==='G1');
    chk('　　第 1 個名額仍是請假', DB.bookings.G1.attendance['M1']==='leave');
  }

  console.log('重複點請假不會重複發券：');
  await api.grantMakeupTicket(DB.bookings.G1,'M1');
  chk('補課券仍只有一張', Object.values(DB.member_tickets).filter(t=>t.source==='makeup').length===1);

  console.log('取消請假：');
  await api.groupToggleLeave('G1','M1');
  chk('attendance 回到 booked', DB.bookings.G1.attendance.M1==='booked');
  chk('未使用的補課券被收回', !Object.values(DB.member_tickets).some(t=>t.source==='makeup'));
  chk('原票券仍不變', DB.member_tickets.T1.sessions_remaining===2);

  console.log('已使用的補課券不收回：');
  reset(); DB.bookings.G1=mkBooking(); DB.member_tickets.T1=mkTicket();
  await api.groupToggleLeave('G1','M1');
  const used=Object.values(DB.member_tickets).find(t=>t.source==='makeup');
  DB.member_tickets[used.id].sessions_remaining=0;      // 假設已拿去補課
  await api.groupToggleLeave('G1','M1');
  chk('用過的券保留', !!DB.member_tickets[used.id]);
  chk('仍解除請假狀態', DB.bookings.G1.attendance.M1==='booked');

  console.log('保護：');
  reset(); DB.bookings.G1=Object.assign(mkBooking(),{status:'cancelled'});
  await api.groupToggleLeave('G1','M1');
  chk('已取消的課擋下', DB.bookings.G1.attendance.M1===undefined && TOASTS.some(t=>t.includes('不可標記請假')));
  reset(); DB.bookings.G1=Object.assign(mkBooking(),{status:'checked_in',attendance:{M2:'checked_in'}});
  DB.member_tickets.T1=mkTicket();
  await api.groupToggleLeave('G1','M1');
  chk('有人已簽到時整堂狀態維持 checked_in', DB.bookings.G1.status==='checked_in');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();
