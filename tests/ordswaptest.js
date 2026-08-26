/* 2026-08-18 三項排課修正的測試：
   ① 扣課順序挪移（江念恩案例）：臨時課扣到後面的票 → 把順位票最晚一堂挪過來（純換指向）
   ② 更換場地後殘留的同行第二台（蘇美帆案例）：要跳出詢問、可一併取消
   ③ 連續預約改時間（教練手機一堂一堂調案例）：同系列後續統一改 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const g=(a,b)=>{const i=src.indexOf(a);if(i<0)return '';return src.slice(i,src.indexOf(b,i)+b.length);};

/* ── ① _bkDoOrderSwap：實跑，驗證「純換指向＋成對帳目、不動餘額」 ── */
{
  const puts=[], logs=[];
  const bookings={
    'BK-NEW':{id:'BK-NEW', ticket_id:'TK-B'},
    'BK-LAST':{id:'BK-LAST', ticket_id:'TK-A'},
  };
  const fn=new Function('window','dbGet','dbPut','logTicket','cxBusy','showToast','navTo','SESSION','CUR_PAGE','CUR_GROUP',
    g('async function _bkDoOrderSwap(){','\n}\n')+'\nreturn _bkDoOrderSwap;')(
    {_ordSwap:{bkId:'BK-NEW', L:'BK-LAST', A:'TK-A', B:'TK-B', An:'付費票', Bn:'加贈票', Ld:'2026-10-05', Lt:'20:30'}},
    async(t,id)=>bookings[id]||null,
    async(t,o)=>{ puts.push(o); },
    async(...a)=>{ logs.push(a); },
    ()=>()=>{}, ()=>{}, ()=>{}, {id:'op-1'}, 'x', 'y');
  fn().then(()=>{
    console.log('① 扣課順序挪移');
    eq('　臨時課改指到順位票', bookings['BK-NEW'].ticket_id, 'TK-A');
    eq('　最晚一堂改指到後面的票', bookings['BK-LAST'].ticket_id, 'TK-B');
    eq('　寫回兩筆課卡', puts.length, 2);
    eq('　帳目四筆（兩退兩扣）', logs.length, 4);
    const net={}; logs.forEach(([tid,act,d])=>{ net[tid]=(net[tid]||0)+d; });
    eq('　兩張票淨額都是 0（餘額不動）', net, {'TK-B':0,'TK-A':0});
    ok('　沒有動到任何票券欄位（效期/餘額只在 bookings 與 logs）', puts.every(p=>p.id&&p.id.indexOf('BK')===0));

    /* ── ③ bkOfferSeriesMove 的同系列篩選：實跑到 showModal 前 ── */
    const shown=[];
    const mk=(id,date,time,over)=>Object.assign({id,date,start_time:time,status:'booked',category:'私人教練',coach_id:'c1',member_id:'m1',member_ids:[],sibling_of:null},over||{});
    const all=[
      mk('b0','2026-08-20','19:00'),                    // 本堂（被改的那堂）
      mk('b1','2026-08-27','19:00'),                    // ✓ 系列
      mk('b2','2026-09-03','19:00'),                    // ✓ 系列
      mk('b3','2026-09-10','19:00',{status:'checked_in'}), // ✗ 已簽到
      mk('b4','2026-09-04','19:00'),                    // ✗ 星期不同（週五）
      mk('b5','2026-08-27','18:00'),                    // ✗ 原時間不同
      mk('b6','2026-08-27','19:00',{coach_id:'c2'}),    // ✗ 教練不同
      mk('b7','2026-08-13','19:00'),                    // ✗ 在本堂之前
    ];
    const win={};
    /* 2026-08-26：簽章從 (b, ot, nt) 變成 (b, od, ot, nd, nt) —— 日期也能一起平移了
       （原本只有「同一天改時間」才問，見 tests/seriesmovetest.js）。
       這裡驗的是同系列的篩選條件，那部分沒變，只是要多帶原/新日期進去。 */
    const _pymd=s=>{ const[y,m,d]=String(s).split('-').map(Number); return new Date(y,m-1,d); };
    const _ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const fn3=new Function('window','dbGetAll','parseYmd','ymd','addDays','showModal','escH','calMoveDiff','SM_WDN',
      g('async function bkOfferSeriesMove(b, od, ot, nd, nt){','\n}\n')+'\nreturn bkOfferSeriesMove;')(
      win, async()=>all, _pymd, _ymd,
      (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; },
      h=>{ shown.push(h); }, t=>String(t==null?'':t), ()=>'提前 5 小時',
      ['日','一','二','三','四','五','六']);
    fn3(all[0],'2026-08-20','19:00','2026-08-20','14:00').then(()=>{
      console.log('③ 連續預約改時間');
      eq('　同系列抓到 2 堂（b1、b2）', win._smSeries&&win._smSeries.ids, ['b1','b2']);
      eq('　新時間帶入', win._smSeries&&win._smSeries.nt, '14:00');
      ok('　有跳出詢問視窗', shown.length===1 && /後續課程要一起改嗎/.test(shown[0]));

      /* ── ② 換場地同行第二台：來源掛載點 ── */
      console.log('② 換場地殘留同行');
      ok('　doVenueChange 有偵測不同場地類型的同行卡',
        src.includes("x.sibling_of===b.id&&x.status!=='cancelled'"));
      ok('　詢問視窗（保留／一併取消）', /同行第二台還掛著/.test(src) && /vcCancelSibs/.test(src));
      ok('　一併取消走 cancelled＋備註，不碰票務',
        /s\.status='cancelled'; s\.cancelled_at=new Date\(\)\.toISOString\(\);/.test(src));
      console.log('① 掛載點');
      ok('　單堂成功後才提示、僅教練課',
        src.includes("results[0].ok && !results[0].held && results[0].bkId && results[0].tkId && t.category==='私人教練'"));
      ok('　分期票不參與（B.installment 擋掉）', src.includes('if(!B||B.installment) return false;'));
      ok('　候選票要通過 tkFitsBooking（效期/起始日/限時段）', /fit\(a,date,time\)/.test(src) && /fit\(B,L\.date,L\.start_time\)/.test(src));
      console.log(`\n${pass} 過 / ${fail} 敗`);
      process.exit(fail?1:0);
    });
  });
}
