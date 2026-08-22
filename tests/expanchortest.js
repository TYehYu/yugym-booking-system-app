/* 2026-08-14 魏婉倫案例：「啟用日是 8/25 為什麼到期日只有 9/14」——
   效期從首堂起算，但首堂取消後錨點沒跟著挪。
   修正：單人課（refundTicket）與團課名額取消兩條路，取消首堂時效期改依最早剩餘預約重算。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(i<0)return '';if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 單人課：refundTicket');
{
  const F=grabFn('refundTicket');
  /* 0822：查詢搬到 tkHoldingBookings（單人課看 bookings.ticket_id、團課看帳本），
     回傳的是照日期排好的清單，所以「最早剩餘預約」＝ rest[0]。 */
  ok('★★ 拿最早的剩餘預約（rest 已照日期排序）而不只查有沒有',
     /const rest=await tkHoldingBookings\(ticket_id, booking_id\);/.test(F)
     && /const ns=String\(rest\[0\]\.date\)\.slice\(0,10\);/.test(F)
     && /\.sort\(\(a,b\)=>String\(a\.date\)\.localeCompare\(String\(b\.date\)\)\)/.test(src));
  ok('★★ 團課的帳在 ticket_logs：只看 bookings.ticket_id 會把每張團課票都當成「沒有其他預約」'
     +'（0817 TK-mspz5ykbdrav：ticket_id 命中 0 筆、帳本 5 筆扣課，效期被誤退回未開通）',
     /const lg=await sb\.from\('ticket_logs'\)\.select\('booking_id,action'\)\.eq\('ticket_id',ticket_id\)/.test(src)
     && /const q2=await sb\.from\('bookings'\)\.select\('id,date,status'\)\.in\('id',ids\);/.test(src));
  ok('★★ 反過來問「哪幾筆已取消」，讀不到的算成還掛著（RLS 擋住時站在不誤清效期那一邊）',
     /if\(b && b\.status==='cancelled'\) return;/.test(src)
     && /out\[id\]=String\(\(b&&b\.date\)\|\|'9999-12-31'\);/.test(src));
  ok('　　查詢失敗回傳 null → 呼叫端什麼都不動（寧可不退效期，也不要誤清）',
     /if\(!q \|\| q\.error\) return null;/.test(src)
     && /if\(!lg \|\| lg\.error\) return null;/.test(src)
     && /\}catch\(_\)\{ return null; \}/.test(src)
     && /if\(rest && rest\.length===0\)\{/.test(F));
  ok('　　排除正在取消的那一筆（它通常還沒被寫成 cancelled）',
     /const ex=String\(excludeId\|\|''\), out=\{\};/.test(src)
     && /if\(String\(b\.id\)!==ex\) out\[b\.id\]=String\(b\.date\|\|''\);/.test(src));
  ok('★★ 取消的是首堂且新首堂較晚 → 重錨（start_date＋valid_days−1）',
     /String\(cb\.date\)\.slice\(0,10\)===String\(t\.start_date\)\.slice\(0,10\) && ns>String\(t\.start_date\)\.slice\(0,10\)/.test(F)
     && /de\.setDate\(de\.getDate\(\)\+\(Number\(t\.valid_days\)\|\|0\)-1\)/.test(F));
  ok('★ 全取消仍退回未開通（原行為不變）', /t\.activated_at=null; t\.start_date=null; t\.expire_date=null; reverted=true;/.test(F));
  ok('　　票上留一行說明', /首堂取消，效期改依新首堂/.test(F));
}
console.log('\n② 團課名額取消');
ok('★★ 用帳本淨扣課回推剩餘堂的日期、取消首堂時重錨',
   /const dcnt=\{\}; lgs\.forEach\(l=>\{ dcnt\[l\.booking_id\]=\(dcnt\[l\.booking_id\]\|\|0\)\+\(l\.action==='deduct'\?1:l\.action==='refund'\?-1:0\); \}\);/.test(src)
   && /if\(ds\.length && ds\[0\]>String\(fresh\.start_date\)\.slice\(0,10\)\)/.test(src));
ok('★ 補課券不套（效期不變的既有規則）', /tk\.valid_days && tk\.start_date && !tkIsMakeup\(tk\)/.test(src));
ok('★ 全取消退回未開通', /fresh\.activated_at=null; fresh\.start_date=null; fresh\.expire_date=null;/.test(src));
console.log('\n③ 反向：改約更早的課（2026-08-14 魏婉倫「可用 0 堂」案例）');
ok('★★ 已開通的票不套「起始日前不能用」防線（那條只擋談好未來開課日的票）',
   /String\(t\.start_date\)\.slice\(0,10\)>bookDate && !t\.activated_at\) return false;/.test(src));
ok('★★ 扣課時預約日早於起算日 → 錨點往前挪、效期重算',
   /if\(b && b\.date && String\(b\.date\)\.slice\(0,10\)<String\(ticket\.start_date\)\.slice\(0,10\)\)/.test(src)
   && /ticket\.start_date=ymd\(d\); ticket\.expire_date=termExpire\(d,ticket\.valid_days\);/.test(src));


/* ═══ 實跑 tkHoldingBookings（2026-08-22）══════════════════════════════════════
   規格斷言看不出「團課到底有沒有被算進來」，這裡用假的 sb 真的跑一次三種情境。 */
{
  const grab=n=>{let i=src.indexOf('async function '+n+'(');
    let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
  const mkSb=(byTicketId, logs, byId)=>({
    from(tb){
      const st={tb, ids:null};
      const res=()=>{
        if(tb==='ticket_logs') return {data:logs, error:null};
        if(st.ids) return {data:byId.filter(b=>st.ids.includes(b.id)), error:null};
        return {data:byTicketId, error:null};
      };
      const api={ select:()=>api, eq:()=>api, neq:()=>api, not:()=>api,
        in:(_c,v)=>{ st.ids=v; return api; },
        then:(f,r)=>Promise.resolve(res()).then(f,r) };
      return api;
    }
  });
  const run=async(byTicketId,logs,byId)=>{
    const f=new Function('CLOUD','sb', grab('tkHoldingBookings')+'\nreturn tkHoldingBookings;')(true, mkSb(byTicketId,logs,byId));
    return await f('TK-1','bCancelling');
  };
  const D=(r)=>r===null?null:r.map(x=>x.id+'@'+x.date).join(',');
  (async()=>{
    console.log('\n④ 實跑 tkHoldingBookings');
    /* 單人課：帳全在 bookings.ticket_id 上 */
    ok('★ 單人課：只剩一筆 → 回傳那一筆（正在取消的那筆已排除）',
       D(await run([{id:'b2',date:'2026-09-01'},{id:'bCancelling',date:'2026-08-25'}], [], []))==='b2@2026-09-01');
    /* 團課：bookings.ticket_id 全空，帳只在 ticket_logs —— 這就是 0817 的洞 */
    ok('★★ 團課：ticket_id 命中 0 筆，仍要從帳本找出 3 筆（0817 TK-mspz5ykbdrav 的情境）',
       D(await run([], [
          {booking_id:'g1',action:'deduct'},{booking_id:'g2',action:'deduct'},
          {booking_id:'g3',action:'deduct'},{booking_id:'bCancelling',action:'deduct'},
          {booking_id:'g4',action:'deduct'},{booking_id:'g4',action:'refund'},   // 扣完又退＝不算
        ], [
          {id:'g1',date:'2026-08-17',status:'checked_in'},
          {id:'g2',date:'2026-09-07',status:'booked'},
          {id:'g3',date:'2026-08-31',status:'booked'},
          {id:'g4',date:'2026-09-21',status:'booked'},
        ]))==='g1@2026-08-17,g3@2026-08-31,g2@2026-09-07');
    ok('★ 已簽到的課也算「還掛著」（0817 誤判的正是這一段）',
       (await run([], [{booking_id:'g1',action:'deduct'}], [{id:'g1',date:'2026-08-17',status:'checked_in'}])).length===1);
    ok('★ 團課名額全取消 → 空陣列（該退回未開通的情況仍然退）',
       (await run([], [{booking_id:'g1',action:'deduct'}], [{id:'g1',date:'2026-08-17',status:'cancelled'}])).length===0);
    ok('★★ 帳本有、但那一筆讀不到（RLS）→ 算成還掛著，不誤清效期',
       (await run([], [{booking_id:'gX',action:'deduct'}], [])).length===1);
    console.log(`\n${fail?'✗ ':'✓ '}${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
