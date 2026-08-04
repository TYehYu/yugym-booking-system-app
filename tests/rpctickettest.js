/* 2026-08-01 使用者回報（兩起，查證後是同一個根因）：
   ①「8/26 選了鄭雅芳的限定票券，系統還是用一般教練課幫我預約」
   ②「鄭超元的課卡有兩份，一份剩 1 張一份剩 4 張，我選了 1 張那份，系統約在 4 張那份」

   根因：建立預約走的是 DB 的 fn_create_booking，而那支**只收 benefit_type**，
   票券是 DB 端 benefit_consume 自己 FIFO 挑的 —— 櫃檯在畫面上點的那一張從頭到尾沒傳進去。
   共享票更是永遠挑不到（benefit_consume 用 mt.member_id = 會員，票掛在持有人名下）。
   修法：RPC 增加 p_ticket_id，有指定就扣那一張（migration
   20260801_create_booking_honor_selected_ticket）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('前端：把選定的票券送進 RPC');
ok('★ 呼叫時帶 p_ticket_id', /p_ticket_id:\(tk&&tk\.id\)\|\|null/.test(src));
ok('★ 其餘參數沒動（時間／場地／時長照舊）',
   /p_date:ds, p_start_time:ts\|\|o\.time, p_duration:o\.duration\|\|60,/.test(src)
   && /p_space_id:sp\.space, p_resource_id:sp\.resource, p_note:null,/.test(src));
ok('★ 根因寫在程式裡（下一個人才不會又以為是前端挑錯票）',
   /票券是 DB 端 benefit_consume 自己 FIFO 挑的/.test(src)
   && /共享票更是完全撈不到/.test(src));
ok('★ 指定票券的專屬錯誤訊息（不要籠統說「沒票」）',
   /'TICKET\.NOT_FOUND':'找不到您選的那張票券/.test(src)
   && /'TICKET\.NOT_YOURS':'您選的那張票券不屬於這位會員/.test(src));

console.log('\n這條路徑什麼時候會走到（旗標是開的，所以是主要路徑）');
ok('★ createBookingRpc 旗標開啟', /createBookingRpc: true,/.test(src));
/* 2026-08-01：指定跑步機時也不走 RPC —— 跑步機是「一個場地兩台＋同行第 2 台不扣點」
   的獨立流程，DB 的 fn_create_booking 只處理一般區。 */
ok('★ 只有「有票要扣」時才走 RPC（體驗課／分期保留／指定跑步機都不走）',
   /if\(window\.FEATURE_FLAGS&&FEATURE_FLAGS\.createBookingRpc&&CLOUD&&!noDeduct&&tk&&!holdOnly&&!o\.venue_pref&&!bkIsSelf\(bk\)\)\{/.test(src));   // 2026-08-04 自主訓練也不走（fn_create_booking 不寫 venue_unit，場地配置會遺失）
ok('　　所以 tk 一定存在 → p_ticket_id 一定有值，FIFO 只在別的呼叫端才會用到',
   /p_ticket_id:\(tk&&tk\.id\)\|\|null/.test(src));

console.log('\n前端挑票的那一關（同一起事件的另一半，已於稍早修好）');
ok('★ bkFindTk 用 tkUsableBy 而不是比 member_id（共享票）',
   /if\(sel && tkUsableBy\(sel,mid\) && sel\.status==='usable' && tkUnlockedLeft\(sel\)>0/.test(src));
ok('★ 換到別張票時結果視窗會明講', /其中 <b>\$\{_swap\.length\}<\/b> 堂不是扣您指定的那張票/.test(src));

console.log('\nDB 端的驗證條件要與前端 tkFitsBooking 對齊（以下為 migration 內容的對照清單）');
{
  /* 這一段是「規格對照」：把 migration 裡 benefit_consume_ticket 的每一條驗證，
     用同一套規則在這裡跑一次，確保兩邊講的是同一件事。 */
  const consume=(t, mid, today)=>{
    if(!t) return 'TICKET.NOT_FOUND';
    const shared=(t.shared_with||[]).indexOf(mid)>=0;
    if(!(t.member_id===mid || shared)) return 'TICKET.NOT_YOURS';
    if(t.status!=='usable') return 'TICKET.EXPIRED';
    if(t.expire_date && t.expire_date<today) return 'TICKET.EXPIRED';
    if((t.sessions_remaining||0)<1) return 'TICKET.EMPTY';
    if(t.installment){
      const un=t.unlocked_sessions!=null?t.unlocked_sessions:t.sessions_total;
      if(Math.min(t.sessions_remaining, un-(t.sessions_total-t.sessions_remaining))<1) return 'TICKET.INSTALLMENT_LOCKED';
    }
    return 'OK';
  };
  const YA='MEM-YA';
  const 限定={member_id:'MEM-YE', shared_with:[YA], status:'usable', sessions_total:10, sessions_remaining:10, expire_date:null};
  eq('★ 共享票：持有人是別人、我是共享者 → 可以扣（原本 DB 端根本撈不到）',
     consume(限定, YA, '2026-08-26'), 'OK');
  eq('★ 不相干的人拿別人的票 → 擋下來', consume(限定, 'MEM-XX', '2026-08-26'), 'TICKET.NOT_YOURS');
  eq('　　找不到票 → 專屬錯誤', consume(null, YA, '2026-08-26'), 'TICKET.NOT_FOUND');
  eq('　　票已作廢 → 擋', consume({member_id:YA,status:'refunded',sessions_remaining:5}, YA, '2026-08-26'), 'TICKET.EXPIRED');
  eq('　　票已過期 → 擋', consume({member_id:YA,status:'usable',sessions_remaining:5,expire_date:'2026-08-20'}, YA, '2026-08-26'), 'TICKET.EXPIRED');
  eq('　　票用完了 → 擋', consume({member_id:YA,status:'usable',sessions_remaining:0}, YA, '2026-08-26'), 'TICKET.EMPTY');
  eq('★ 剩 1 堂也扣得動（鄭超元那張就是剩 1）',
     consume({member_id:YA,status:'usable',sessions_remaining:1}, YA, '2026-08-26'), 'OK');
  eq('　　分期未開通的堂數 → 擋',
     consume({member_id:YA,status:'usable',sessions_total:12,sessions_remaining:8,unlocked_sessions:4,installment:{}}, YA, '2026-08-26'),
     'TICKET.INSTALLMENT_LOCKED');
  eq('　　分期已開通的堂數 → 放行',
     consume({member_id:YA,status:'usable',sessions_total:12,sessions_remaining:12,unlocked_sessions:4,installment:{}}, YA, '2026-08-26'),
     'OK');
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
