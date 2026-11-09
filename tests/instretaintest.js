/* 施佩怡案例（2026-11-09）Fix B／Fix C 動態驗證

   Fix B（submitPendingHold）：建立待簽約卡位時，若會員已有分期合約且還有鎖定中
   （已簽約但未開通）的額度，在額度範圍內才標記「分期待繳費保留」；超過額度的
   維持一般待簽約（不猜測）。
   Fix C（_doConvertPending）：整串轉正時，超出目前這張票容量的卡位改成「保留
   原狀」，不再自動取消、不寫 status/note，完全不呼叫 dbPut。

   兩支都用 grabFn 逐字抽出真正的函式去跑（不是重寫一份），模擬 dbGetAll/dbGet/
   dbPut 計算施佩怡的真實數字：12堂合約、已開通8堂、已用7堂 → avail=1、
   lockedLeft=4；series=14（1堂被點的分期保留＋13堂未標記的待續約卡位，3堂
   已標記的分期保留手足被排除）。

   2026-11-09 部署前複查三修：只要偵測到現成手足存在，lockedLeft 整個歸零，
   不嘗試分配差額——確保13堂一筆都不會被動到。預期：扣課1、轉保留0、保留原狀13。

   部署前複查額外新增（⑤~⑧）：
     ⑤ 重複執行「整串轉正」兩次，確認不會重複扣課、不會把第二次的差額誤分給
        之前已保留原狀的卡位（非同步時序重現用，不是真的並行）。
     ⑥ 取消狀態的分期保留手足不應該被誤算進「現成手足」（已處理過，帳已結）。
     ⑦ 重複資料（同一天同時段兩筆都標記分期保留）不會讓計算當機或爆出負數。
     ⑧ 這支測試檔案不驗證「兩個分頁同時操作」的真實並行競態——那需要資料庫層
        的交易/鎖，純前端測試模擬不出來，已經在報告裡列為部署阻擋風險，這裡
        只負責把現有、可以用同步程式碼驗證的部分釘住。 */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

function grabFn(name) {
  const i = src.indexOf('async function ' + name + '(') >= 0 ? src.indexOf('async function ' + name + '(') : src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
// bkIsInstHold 直接抽真的來用（兩支修法都依賴它，必須是同一份定義）
const SRC_bkIsInstHold = grabFn('bkIsInstHold');
const bkIsInstHold = new Function('return ' + SRC_bkIsInstHold)();

console.log('\n═══ Fix C：_doConvertPending 整串轉正，超出範圍保留原狀 ═══');
{
  const SRC = grabFn('_doConvertPending');
  const TODAY = new Date('2026-11-09');
  const ymd = d => d.toISOString().slice(0, 10);
  const clickedId = 'BK-1120';
  const bookingsDb = {};
  const mk = (id, date, note) => { bookingsDb[id] = { id, member_id: 'MEM-SPY', date, start_time: '21:00', status: 'booked', pending_contract: true, ticket_id: null, ticket_type_id: 'tt-pt', note: note || null, trial_name: null, trial_phone: null }; };
  mk(clickedId, '2026-11-20', '分期待繳費保留（收款後自動補扣）');
  mk('BK-1127', '2026-11-27', '分期待繳費保留（收款後自動補扣）');
  mk('BK-1204', '2026-12-04', '分期待繳費保留（收款後自動補扣）');
  mk('BK-1211', '2026-12-11', '分期待繳費保留（收款後自動補扣）');
  const futureDates = ['2026-12-18', '2026-12-25', '2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29', '2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26', '2027-03-05', '2027-03-12'];
  futureDates.forEach((d, i) => mk('BK-UNT' + i, d, null));   // 13堂未標記的待續約卡位

  const tk = { id: 'TK-SPY', member_id: 'MEM-SPY', plan_name: '一般教練課1V1', sessions_total: 12, sessions_remaining: 5, unlocked_sessions: 8, installment: { count: 3, segments: [4, 4, 4], current: 2, paid: [true, true, false] } };
  const dbPutCalls = [];
  const env = {
    cxBusy: () => () => {},
    dbGet: async (table, id) => (table === 'bookings' ? bookingsDb[id] : null),
    dbGetAll: async (table) => table === 'bookings' ? Object.values(bookingsDb) : [],
    listUsableTickets: async () => [tk],
    bkTypeIdOf: b => b.ticket_type_id,
    tkUnlockedLeft: t => Math.max(0, Math.min(Number(t.sessions_remaining) || 0, (t.unlocked_sessions != null ? Number(t.unlocked_sessions) : Number(t.sessions_total) || 0) - (Math.max(0, (Number(t.sessions_total) || 0) - (Number(t.sessions_remaining) || 0))))),
    deductTicket: async (t) => { t.sessions_remaining = Math.max(0, (Number(t.sessions_remaining) || 0) - 1); return true; },
    dbPut: async (table, obj) => { dbPutCalls.push({ table, id: obj.id, status: obj.status, note: obj.note }); if (table === 'bookings') bookingsDb[obj.id] = { ...bookingsDb[obj.id], ...obj }; },
    dbCacheClear: () => {},
    showModal: () => {},
    closeModal: () => {},
    navTo: () => {},
    showToast: (msg) => { env._lastToast = msg; },
    bkIsInstHold,
    ymd, TODAY,
    SESSION: { id: 'c-staff' },
    CUR_PAGE: 'member_detail',
    window: { _cpBid: clickedId },
  };
  const names = Object.keys(env);
  const fn = new Function(...names, SRC + '\nreturn _doConvertPending;')(...names.map(k => env[k]));

  fn('MEM-SPY', 'TK-SPY', 'series').then(async () => {
    const clicked = bookingsDb[clickedId];
    const siblings = ['BK-1127', 'BK-1204', 'BK-1211'];
    const untouchedSiblings = siblings.every(id => bookingsDb[id].status === 'booked' && bookingsDb[id].note === '分期待繳費保留（收款後自動補扣）' && !bookingsDb[id].ticket_id);
    const heldCount = dbPutCalls.filter(c => c.table === 'bookings' && c.note === '分期待繳費保留（收款後自動補扣）' && c.id !== clickedId).length;
    const keptCount = futureDates.filter((_, i) => bookingsDb['BK-UNT' + i].status === 'booked' && !bookingsDb['BK-UNT' + i].note).length;
    const neverWrittenKeptCount = futureDates.filter((_, i) => !dbPutCalls.some(c => c.id === 'BK-UNT' + i)).length;

    console.log('[toast]', env._lastToast);
    ok('★★★ 被點擊的 11/20 扣課成功：綁票、pending_contract 變 false',
      clicked.pending_contract === false && clicked.ticket_id === 'TK-SPY');
    ok('★★★ 11/27、12/04、12/11（已標記分期保留的手足）完全沒被這次操作碰到',
      untouchedSiblings, siblings.map(id => bookingsDb[id]));
    /* 三修（部署前複查才定案）：只要偵測到這個會員這個票種已經有任何一筆現成的
       分期保留手足，lockedLeft 就整個歸零——不嘗試把差額分給 series 裡的其他
       候選，確保13堂一筆都不會被動到（二修版本會分出1堂給其中一筆，違反
       「不得修改既有13堂預約」這條鐵則，已經改掉）。
       代價：1(扣課)+0(轉保留)+3(既有手足，未動)=4，比 sessions_remaining(5) 少1——
       這1堂目前沒有對應到任何卡位（4堂鎖定額度原本就只對得到3筆手足紀錄，
       差額是資料本身既有的落差，不是這次操作造成的），已列入報告「無法確認
       的業務規則」，不是程式自己猜出一個去向。 */
    ok('★★★ 轉分期保留＝0堂（偵測到現成手足就整個歸零，不把差額分給別人）',
      heldCount === 0, { heldCount });
    ok('★★★ 13堂全部保留原狀：仍是booked、note仍是null，完全沒被dbPut寫過（一筆都不動）',
      keptCount === 13 && neverWrittenKeptCount === 13, { keptCount, neverWrittenKeptCount });
    ok('★★★ 這次操作只動到被點擊的這1堂，其餘16堂（3手足＋13待續約）完全沒被dbPut碰過',
      dbPutCalls.filter(c => c.table === 'bookings').every(c => c.id === clickedId));

    console.log('\n⑤ 再對其中一堂「保留原狀」的卡位按一次轉正（模擬之後再點一次）：不會重複扣課、不會分配差額給別人');
    {
      const dbPutCallsBefore = dbPutCalls.length;
      env.window._cpBid = 'BK-UNT0';   // 模擬使用者後來改點另一堂（12/18）按轉正
      await fn('MEM-SPY', 'TK-SPY', 'series');
      const afterUNT0 = bookingsDb['BK-UNT0'];
      ok('★★★ 第一堂（11/20）沒有被重複扣課（sessions_remaining 只少1次）', tk.sessions_remaining === 4, { remaining: tk.sessions_remaining });
      ok('★★★ 這次點的 BK-UNT0 因為票已經沒有 avail、lockedLeft 又因現成手足歸零，結果也是保留原狀，不是誤扣或誤標分期',
        afterUNT0.status === 'booked' && !afterUNT0.note);
      ok('★★★ 其餘沒被點到的卡位（含3手足）這一輪完全沒有新的 dbPut', dbPutCalls.length === dbPutCallsBefore || dbPutCalls.slice(dbPutCallsBefore).every(c => c.id === 'BK-UNT0'));
    }

    console.log('\n⑥ 已取消的分期保留手足不應該被算進「現成手足」（帳已經結掉了）');
    {
      const TODAY2 = new Date('2026-11-09');
      const ymd2 = d => d.toISOString().slice(0, 10);
      const db2 = {};
      const mk2 = (id, date, note, status) => { db2[id] = { id, member_id: 'MEM-X', date, start_time: '21:00', status: status || 'booked', pending_contract: true, ticket_id: null, ticket_type_id: 'tt-pt', note: note || null, trial_name: null, trial_phone: null }; };
      mk2('BK-X1', '2026-11-20', '分期待繳費保留（收款後自動補扣）');
      mk2('BK-X2', '2026-11-27', '分期待繳費保留（收款後自動補扣）', 'cancelled');   // 已取消，不該被算進現成手足
      const futureX = ['2026-12-04', '2026-12-11', '2026-12-18'];
      futureX.forEach((d, i) => mk2('BK-XU' + i, d, null));
      const tk2 = { id: 'TK-X', member_id: 'MEM-X', sessions_total: 12, sessions_remaining: 5, unlocked_sessions: 8, installment: { count: 3 } };
      const dbPutCalls2 = [];
      const env2 = { ...env, dbGet: async (t2, id) => (t2 === 'bookings' ? db2[id] : null), dbGetAll: async (t2) => t2 === 'bookings' ? Object.values(db2) : [], listUsableTickets: async () => [tk2], dbPut: async (t2, obj) => { dbPutCalls2.push({ id: obj.id, note: obj.note }); if (t2 === 'bookings') db2[obj.id] = { ...db2[obj.id], ...obj }; }, window: { _cpBid: 'BK-X1' } };
      const names2 = Object.keys(env2);
      const fn2 = new Function(...names2, SRC + '\nreturn _doConvertPending;')(...names2.map(k => env2[k]));
      await fn2('MEM-X', 'TK-X', 'series');
      const heldCount2 = dbPutCalls2.filter(c => c.note === '分期待繳費保留（收款後自動補扣）' && c.id !== 'BK-X1').length;
      ok('★★★ 已取消的 BK-X2 不算進現成手足，lockedLeft 正常分配給待續約卡位（不會誤判成0）',
        heldCount2 > 0, { heldCount2, calls: dbPutCalls2.map(c => c.id) });
    }

    console.log('\n⑦ 重複資料（同一天同時段兩筆都標記分期保留）不會讓計算當機或出現負數');
    {
      const db3 = {};
      const mk3 = (id, date, note) => { db3[id] = { id, member_id: 'MEM-Y', date, start_time: '21:00', status: 'booked', pending_contract: true, ticket_id: null, ticket_type_id: 'tt-pt', note: note || null, trial_name: null, trial_phone: null }; };
      mk3('BK-Y1', '2026-11-20', '分期待繳費保留（收款後自動補扣）');
      mk3('BK-Y1DUP', '2026-11-20', '分期待繳費保留（收款後自動補扣）');   // 同一天同時段的重複資料
      const futureY = ['2026-11-27'];
      futureY.forEach((d, i) => mk3('BK-YU' + i, d, null));
      const tk3 = { id: 'TK-Y', member_id: 'MEM-Y', sessions_total: 12, sessions_remaining: 11, unlocked_sessions: 8, installment: { count: 3 } };
      const dbPutCalls3 = [];
      const env3 = { ...env, dbGet: async (t3, id) => (t3 === 'bookings' ? db3[id] : null), dbGetAll: async (t3) => t3 === 'bookings' ? Object.values(db3) : [], listUsableTickets: async () => [tk3], dbPut: async (t3, obj) => { dbPutCalls3.push({ id: obj.id, note: obj.note }); if (t3 === 'bookings') db3[obj.id] = { ...db3[obj.id], ...obj }; }, window: { _cpBid: 'BK-Y1' } };
      const names3 = Object.keys(env3);
      const fn3 = new Function(...names3, SRC + '\nreturn _doConvertPending;')(...names3.map(k => env3[k]));
      let threw = false;
      try { await fn3('MEM-Y', 'TK-Y', 'series'); } catch (e) { threw = true; }
      ok('★★ 重複資料不會讓函式丟例外', !threw);
      const afterYU0 = db3['BK-YU0'];
      ok('★★ 重複資料情境下，待續約卡位（BK-YU0）仍然保留原狀，不會被誤扣或誤標', afterYU0.status === 'booked' && !afterYU0.note);
    }

    console.log('\n⑧ 2026-11-09 業務規則最終確認，逐條點名驗證（用上面同一組施佩怡資料重算一次）');
    {
      const dbPutCalls4 = [];
      const bookingsDb4 = {};
      const mk4 = (id, date, note) => { bookingsDb4[id] = { id, member_id: 'MEM-SPY2', date, start_time: '21:00', status: 'booked', pending_contract: true, ticket_id: null, ticket_type_id: 'tt-pt', note: note || null, trial_name: null, trial_phone: null }; };
      const clickedId4 = 'BK-1120-R2';
      mk4(clickedId4, '2026-11-20', '分期待繳費保留（收款後自動補扣）');
      mk4('BK-1127-R2', '2026-11-27', '分期待繳費保留（收款後自動補扣）');
      mk4('BK-1204-R2', '2026-12-04', '分期待繳費保留（收款後自動補扣）');
      mk4('BK-1211-R2', '2026-12-11', '分期待繳費保留（收款後自動補扣）');
      const future4 = ['2026-12-18', '2026-12-25', '2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29', '2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26', '2027-03-05', '2027-03-12'];
      future4.forEach((d, i) => mk4('BK-UNT4-' + i, d, null));
      const tk4 = { id: 'TK-SPY2', member_id: 'MEM-SPY2', sessions_total: 12, sessions_remaining: 5, unlocked_sessions: 8, installment: { count: 3, segments: [4, 4, 4], current: 2, paid: [true, true, false] } };
      const env4 = { ...env, dbGet: async (t, id) => (t === 'bookings' ? bookingsDb4[id] : null), dbGetAll: async (t) => t === 'bookings' ? Object.values(bookingsDb4) : [], listUsableTickets: async () => [tk4], deductTicket: async (t) => { t.sessions_remaining = Math.max(0, (Number(t.sessions_remaining) || 0) - 1); return true; }, dbPut: async (t, obj) => { dbPutCalls4.push({ table: t, id: obj.id, note: obj.note, ticket_id: obj.ticket_id, pending_contract: obj.pending_contract }); if (t === 'bookings') bookingsDb4[obj.id] = { ...bookingsDb4[obj.id], ...obj }; }, window: { _cpBid: clickedId4 } };
      const names4 = Object.keys(env4);
      const fn4 = new Function(...names4, SRC + '\nreturn _doConvertPending;')(...names4.map(k => env4[k]));
      await fn4('MEM-SPY2', 'TK-SPY2', 'series');

      const kept13_4 = future4.filter((_, i) => bookingsDb4['BK-UNT4-' + i].status === 'booked' && !bookingsDb4['BK-UNT4-' + i].note);
      const heldBookings4 = dbPutCalls4.filter(c => c.note === '分期待繳費保留（收款後自動補扣）' && c.id !== clickedId4);
      const siblings4 = ['BK-1127-R2', 'BK-1204-R2', 'BK-1211-R2'];

      ok('規則1（未繳費分期堂數可以提前保留、也可以完全不預約）：3堂既有手足不受影響，系統不強制一定要補到4堂',
        siblings4.every(id => bookingsDb4[id].status === 'booked' && bookingsDb4[id].note === '分期待繳費保留（收款後自動補扣）'));
      ok('規則2（未預約的分期額度維持未分配，不得自動補到其他預約）：13堂待續約卡位沒有任何一堂被拿去填補那1堂差額',
        heldBookings4.length === 0 && kept13_4.length === 13);
      ok('規則3（分期保留預約不等於已開通票券，不得提前扣課）：轉分期保留的分支完全沒有呼叫 deductTicket，票券餘額只因為被點擊的那1堂而減少',
        tk4.sessions_remaining === 4);   // 5 - 1(扣課) - 0(轉保留不扣課)
      ok('規則4（施佩怡第三期4堂：已保留3堂，剩餘1堂未分配，屬正常狀態，不需要補預約）：3堂手足維持原狀，沒有第4堂被補出來',
        siblings4.length === 3 && heldBookings4.length === 0);
      ok('規則5（12/18起13堂超出原12堂合約，維持原狀，不自動取消、不自動分配第三期額度）：13堂status仍是booked、note仍是null、完全沒被dbPut碰過',
        kept13_4.length === 13 && future4.every((_, i) => !dbPutCalls4.some(c => c.id === 'BK-UNT4-' + i)));
      ok('規則6a（lockedLeft計算不會把未分配額度當作已開通票券）：真正扣課綁票的只有被點擊那1堂（avail分支），held分支（lockedLeft）這次沒有任何一筆被寫入ticket_id或pending_contract=false',
        dbPutCalls4.filter(c => c.ticket_id || c.pending_contract === false).every(c => c.id === clickedId4)
        && heldBookings4.every(c => !c.ticket_id && c.pending_contract !== false));
      ok('規則6b（不會重複分配已保留額度）：偵測到3堂現成手足就讓series可用的lockedLeft歸零，不會把同一份4堂額度算第二次',
        heldBookings4.length === 0);
    }

    console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通過 / ' + fail + ' 失敗（Fix C 部分）');
    runFixB();
  }).catch(e => { console.error('Fix C 測試中止：', e.message, e.stack); process.exit(1); });
}

function runFixB() {
  console.log('\n═══ Fix B：submitPendingHold 建立卡位時，依剩餘鎖定額度標記 ═══');
  const SRC = grabFn('submitPendingHold');

  function buildEnv(memberTkts, existingBookings, domVals) {
    const createdBookings = [];
    const dom = { 'ph-name': '測試客', 'ph-phone': '0900', 'ph-mid': '', ...domVals };
    return {
      window: { _phSubmitting: false },
      _bkWizard: { type_id: 'tt-pt', t: { category: '私人教練', format: null }, coach_id: 'c-1', date: '2026-12-18', time: '21:00' },
      document: { getElementById: (id) => ({ value: dom[id] != null ? dom[id] : '' }), querySelector: () => null },
      bkReadRecurBk: () => ({ on: true, dows: [5], times: ['21:00'], count: 6 }),
      bizOffHoursHardBlock: () => null,
      confirmOffHours: async () => true,
      buildRecurringSlots: (date, time, dows, times, count) => {
        const out = []; let d = new Date(date);
        for (let i = 0; i < count; i++) { d = new Date(d.getTime() + 7 * 86400000); out.push({ date: d.toISOString().slice(0, 10), time }); }
        return out;
      },
      addDays: (d, n) => new Date(d.getTime() + n * 86400000),
      parseYmd: s => new Date(s),
      ymd: d => d.toISOString().slice(0, 10),
      RECUR_MAX: 60,
      uid: p => p + '-' + Math.random().toString(36).slice(2, 8),
      validateBooking: async () => null,
      bkWizVenue: () => null,
      dbGetAll: async (table) => table === 'member_tickets' ? memberTkts : existingBookings,
      dbPut: async (table, obj) => { if (table === 'bookings') createdBookings.push(obj); },
      tkUsableBy: (t, mid) => t.member_id === mid,
      tkIsInstall: t => !!(t && t.installment && typeof t.installment === 'object'),
      bkTicketTypeOk: (t, typeId) => t.ticket_type_id === typeId,
      bkIsInstHold,
      closeModal: () => {},
      showToast: () => {},
      navTo: () => {},
      console: { warn: () => {} },
      SESSION: { id: 'c-1' },
      _created: createdBookings,
    };
  }

  (async () => {
    console.log('\n① 會員已有分期合約、鎖定額度4堂、目前0堂已標記 → 建6堂，前4標記、後2不標記');
    {
      const tk = { id: 'TK-A', member_id: 'MEM-A', ticket_type_id: 'tt-pt', status: 'usable', sessions_total: 12, unlocked_sessions: 8, installment: { count: 3 } };
      const env = buildEnv([tk], [], { 'ph-mid': 'MEM-A' });
      const names = Object.keys(env);
      const fn = new Function(...names, SRC + '\nreturn submitPendingHold;')(...names.map(k => env[k]));
      await fn();
      const held = env._created.filter(b => b.note === '分期待繳費保留（收款後自動補扣）').length;
      const plain = env._created.filter(b => !b.note).length;
      ok('★★★ 共建立6堂', env._created.length === 6, { n: env._created.length });
      ok('★★★ 前4堂標記分期保留、後2堂維持一般待簽約（不猜測、不超標）', held === 4 && plain === 2, { held, plain });
    }

    console.log('\n② 會員已有2堂既有分期保留（已占用額度） → 新建6堂只剩2堂配額可標記');
    {
      const tk = { id: 'TK-B', member_id: 'MEM-B', ticket_type_id: 'tt-pt', status: 'usable', sessions_total: 12, unlocked_sessions: 8, installment: { count: 3 } };
      const existing = [
        { id: 'BK-E1', member_id: 'MEM-B', status: 'booked', pending_contract: true, ticket_id: null, ticket_type_id: 'tt-pt', note: '分期待繳費保留（收款後自動補扣）' },
        { id: 'BK-E2', member_id: 'MEM-B', status: 'booked', pending_contract: true, ticket_id: null, ticket_type_id: 'tt-pt', note: '分期待繳費保留（收款後自動補扣）' },
      ];
      const env = buildEnv([tk], existing, { 'ph-mid': 'MEM-B' });
      const names = Object.keys(env);
      const fn = new Function(...names, SRC + '\nreturn submitPendingHold;')(...names.map(k => env[k]));
      await fn();
      const held = env._created.filter(b => b.note === '分期待繳費保留（收款後自動補扣）').length;
      ok('★★★ 既有2堂已佔額度，新建的6堂只有2堂能標記（4-2=2）', held === 2, { held });
    }

    console.log('\n③ 一般待簽約（trial_name，無會員、無合約） → 不得誤判為分期保留');
    {
      const env = buildEnv([], [], { 'ph-mid': '' });
      const names = Object.keys(env);
      const fn = new Function(...names, SRC + '\nreturn submitPendingHold;')(...names.map(k => env[k]));
      await fn();
      const held = env._created.filter(b => b.note === '分期待繳費保留（收款後自動補扣）').length;
      ok('★★★ 沒有會員、沒有分期合約，全部維持一般待簽約（note全部是null）', held === 0 && env._created.length === 6, { held, n: env._created.length });
    }

    console.log('\n④ 會員沒有任何分期票（純一般待簽約會員） → 不得誤判為分期保留');
    {
      const env = buildEnv([], [], { 'ph-mid': 'MEM-C' });
      const names = Object.keys(env);
      const fn = new Function(...names, SRC + '\nreturn submitPendingHold;')(...names.map(k => env[k]));
      await fn();
      const held = env._created.filter(b => b.note === '分期待繳費保留（收款後自動補扣）').length;
      ok('★★★ 查無分期票，全部維持一般待簽約', held === 0, { held });
    }

    console.log('\n⑤ 已知限制（不修，列入報告）：會員同時有2張同課程類型的分期票（兩份合約）');
    {
      /* .find() 只會挑到陣列裡第一張符合的分期票，不會合併兩張的鎖定額度，
         也不會判斷「這堂到底該算哪一份合約」——這是故意不展開的範圍（兩個人
         同時有兩份進行中的同課程分期合約是極少數情境，要做對需要先定義
         「新卡位該算舊合約還是新合約」這個業務規則，不是程式能猜的）。
         這裡只驗證：不會crash、不會把兩張票的額度加在一起產生超額配額。 */
      const tkOld = { id: 'TK-OLD', member_id: 'MEM-D', ticket_type_id: 'tt-pt', status: 'usable', sessions_total: 12, unlocked_sessions: 8, installment: { count: 3 } };
      const tkNew = { id: 'TK-NEW', member_id: 'MEM-D', ticket_type_id: 'tt-pt', status: 'usable', sessions_total: 12, unlocked_sessions: 4, installment: { count: 3 } };
      const env = buildEnv([tkOld, tkNew], [], { 'ph-mid': 'MEM-D' });
      const names = Object.keys(env);
      const fn = new Function(...names, SRC + '\nreturn submitPendingHold;')(...names.map(k => env[k]));
      await fn();
      const held = env._created.filter(b => b.note === '分期待繳費保留（收款後自動補扣）').length;
      ok('★ 不會crash，且配額不超過單一張票自己的鎖定額度上限（4或8，不會疊加成12）',
        held === 4 || held === 8, { held });
    }

    await runChainTest();

    console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 累計通過 / ' + fail + ' 累計失敗');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error('Fix B 測試中止：', e.message, e.stack); process.exit(1); });
}

/* 2026-11-09 部署前最後確認：Fix C 跟 2026-11-03（孫怡敏案例）那個前置修復的
   「入口」接不接得起來——之前的測試都直接呼叫 _doConvertPending(mode='series')，
   跳過了真正的使用者路徑（點按鈕 → openConvertPending/openConvertPendingAsk →
   doConvertPending → mode 怎麼傳下去）。這裡改成從使用者實際點的入口開始跑，
   驗證：①一般「轉正」按鈕絕對不會自動彈整串視窗，即使這個會員有14堂待簽約；
   ②只有「整串轉正」(openConvertPendingAsk) 這個明確入口才會彈視窗；③彈出視窗
   當下只是預覽，還沒呼叫 dbPut（要再按一次「整串轉正」鈕才會真的執行）。 */
async function runChainTest() {
  console.log('\n═══ 入口鏈路：openConvertPending／openConvertPendingAsk → doConvertPending → _doConvertPending ═══');
  const fs = require('fs');
  const src = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/index.html', 'utf8');
  function grabFn(name) {
    const i = src.indexOf('async function ' + name + '(') >= 0 ? src.indexOf('async function ' + name + '(') : src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('找不到 ' + name);
    let d = 0, k;
    for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
    return src.slice(i, k + 1);
  }
  const CHAIN_SRC = [grabFn('openConvertPending'), grabFn('openConvertPendingAsk'), grabFn('cpRenderList'), grabFn('doConvertPending'), grabFn('_doConvertPending')].join('\n');
  /* openConvertPending 的「已綁定會員」分支是 `doConvertPending(b.member_id); return;`——
     刻意不 await（原本就是給 onclick 用，UI 不需要等它）。測試裡如果只 await
     openConvertPending 本身，會在 doConvertPending/_doConvertPending 真正跑完
     （呼叫到 showModal／dbPut）之前就判讀結果，看起來像「沒有彈窗」但其實是
     還沒跑到那一步。用多次 microtask flush 把整條鏈路的 await 都排空再判讀。 */
  const flush = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
  const bkIsInstHold = new Function('return ' + grabFn('bkIsInstHold'))();
  const ymd = d => d.toISOString().slice(0, 10);
  const TODAY = new Date('2026-11-09');

  function buildScenario() {
    const bookingsDb = {};
    const mk = (id, date, note, memberId) => { bookingsDb[id] = { id, member_id: memberId, date, start_time: '21:00', status: 'booked', pending_contract: true, ticket_id: null, ticket_type_id: 'tt-pt', note: note || null, trial_name: null, trial_phone: null }; };
    const clickedId = 'BK-CHAIN-CLICK';
    mk(clickedId, '2026-11-20', '分期待繳費保留（收款後自動補扣）', 'MEM-CHAIN');
    ['2026-11-27', '2026-12-04', '2026-12-11'].forEach((d, i) => mk('BK-CHAIN-HELD' + i, d, '分期待繳費保留（收款後自動補扣）', 'MEM-CHAIN'));
    const future = ['2026-12-18', '2026-12-25', '2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29', '2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26', '2027-03-05', '2027-03-12'];
    future.forEach((d, i) => mk('BK-CHAIN-UNT' + i, d, null, 'MEM-CHAIN'));   // 共14堂series（含clicked）
    const tk = { id: 'TK-CHAIN', member_id: 'MEM-CHAIN', plan_name: '一般教練課1V1', ticket_type_id: 'tt-pt', status: 'usable', sessions_total: 12, sessions_remaining: 5, unlocked_sessions: 8, installment: { count: 3, segments: [4, 4, 4], current: 2, paid: [true, true, false] } };
    const dbPutCalls = [];
    let showModalCalls = 0, lastModalHtml = '';
    const windowObj = {};
    const env = {
      window: windowObj,
      document: { getElementById: () => null },
      dbGet: async (t, id) => (t === 'bookings' ? bookingsDb[id] : null),
      dbGetAll: async (t) => t === 'bookings' ? Object.values(bookingsDb) : (t === 'members' ? [{ id: 'MEM-CHAIN', name: '測試會員', status: 'active' }] : []),
      listUsableTickets: async () => [tk],
      bkTypeIdOf: b => b.ticket_type_id,
      tkUnlockedLeft: t => Math.max(0, Math.min(Number(t.sessions_remaining) || 0, (Number(t.unlocked_sessions) || 0) - (Math.max(0, (Number(t.sessions_total) || 0) - (Number(t.sessions_remaining) || 0))))),
      deductTicket: async (t) => { t.sessions_remaining = Math.max(0, (Number(t.sessions_remaining) || 0) - 1); return true; },
      dbPut: async (t, obj) => { dbPutCalls.push({ table: t, id: obj.id, note: obj.note }); if (t === 'bookings') bookingsDb[obj.id] = { ...bookingsDb[obj.id], ...obj }; },
      dbCacheClear: () => {},
      showModal: (html) => { showModalCalls++; lastModalHtml = html; },
      closeModal: () => {},
      navTo: () => {},
      cxBusy: () => () => {},
      showToast: () => {},
      onceAct: (key, f) => f(),   // 防連點機制本身已有獨立測試，這裡直接放行看業務邏輯
      bkIsInstHold, ymd, TODAY,
      SESSION: { id: 'c-staff' }, CUR_PAGE: 'member_detail',
      fmtPhone: p => p,
    };
    const names = Object.keys(env);
    const fns = new Function(...names, CHAIN_SRC + '\nreturn {openConvertPending,openConvertPendingAsk,doConvertPending,_doConvertPending};')(...names.map(k => env[k]));
    return { fns, env, bookingsDb, dbPutCalls, clickedId, future, getModalCalls: () => showModalCalls, getLastModalHtml: () => lastModalHtml };
  }

  {
    const s = buildScenario();
    s.bookingsDb[s.clickedId].member_id = 'MEM-CHAIN';
    await s.fns.openConvertPending(s.clickedId); await flush();   // 一般「轉正」按鈕，沒有帶 mode
    ok('① 一般「轉正」按鈕：即使這個會員有14堂待簽約（series.length>1），也不會自動彈整串視窗',
      s.getModalCalls() === 0, { modalCalls: s.getModalCalls() });
    ok('① 一般「轉正」只處理被點的這1堂，其餘13堂待續約與3堂既有手足完全不受影響',
      s.dbPutCalls.filter(c => c.table === 'bookings').every(c => c.id === s.clickedId)
      && s.future.every((_, i) => !s.dbPutCalls.some(c => c.id === 'BK-CHAIN-UNT' + i)));
  }
  {
    const s = buildScenario();
    s.bookingsDb[s.clickedId].member_id = 'MEM-CHAIN';
    await s.fns.openConvertPendingAsk(s.clickedId); await flush();   // 使用者主動按「整串轉正」
    ok('② 按〔整串轉正〕才會彈出視窗（series.length>1 且 mode=\'ask\'）',
      s.getModalCalls() === 1, { modalCalls: s.getModalCalls() });
    ok('② 彈出的視窗內容是 Fix C 的新措辭（保留原狀），不是舊的「取消」',
      /超出目前票券範圍 → 保留原狀/.test(s.getLastModalHtml())
      && !/超出簽約堂數 → 取消/.test(s.getLastModalHtml()));
    ok('② 只是預覽：彈窗當下完全沒有呼叫 dbPut，要使用者再按一次〔整串轉正〕鈕才會真的執行',
      s.dbPutCalls.length === 0, { dbPutCalls: s.dbPutCalls });
  }
  {
    // 從預覽視窗再按一次〔整串轉正〕（doConvertPending(memberId,tkId,'series')），
    // 確認最終落地的行為跟直接呼叫 _doConvertPending 版本一致：13堂維持原狀。
    const s = buildScenario();
    s.bookingsDb[s.clickedId].member_id = 'MEM-CHAIN';
    s.env.window._cpBid = s.clickedId;
    await s.fns.doConvertPending('MEM-CHAIN', 'TK-CHAIN', 'series');
    const kept13 = s.future.filter((_, i) => s.bookingsDb['BK-CHAIN-UNT' + i].status === 'booked' && !s.bookingsDb['BK-CHAIN-UNT' + i].note).length;
    ok('③ 從預覽視窗按下〔整串轉正〕執行後，13堂既有待續約卡位仍然完全不受影響',
      kept13 === 13, { kept13 });
    ok('③ 3堂既有分期保留手足同樣完全不受影響（不取消、不扣課、不重複標記）',
      ['BK-CHAIN-HELD0', 'BK-CHAIN-HELD1', 'BK-CHAIN-HELD2'].every(id =>
        s.bookingsDb[id].status === 'booked' && s.bookingsDb[id].note === '分期待繳費保留（收款後自動補扣）'));
  }
}
