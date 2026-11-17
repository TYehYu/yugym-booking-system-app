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
// 2026-11-16：轉正前會先問「這筆卡位是否已過期」（bkHoldExpired）。這支測試的主題是分期保留與退回遞補，不是到期——
// 這裡的卡位日期都在今天以後，所以固定回 false；真正的到期判斷由 tests/renewalholdtest.js 抽真的函式測。
const bkHoldExpired = () => false;

/* 2026-11-21：Fix C（舊的前端「整串轉正／超出範圍保留原狀」）已被「新票轉正整理」取代——
   使用者改規則：超額卡位取消釋出、不再保留等下一次續約；整串邏輯移到資料庫 fn_hold_settle_new_ticket（單一交易）。
   舊的動態驗證（前端迴圈、保留原狀、整串轉正入口鏈路）整段移除；新規則的驗證見 tests/holdsettletest.js 與 docs/testdb/hold-settle/。
   下面只保留與轉正無關的 Fix B（submitPendingHold 建立卡位時依鎖定額度標記分期保留）。 */
console.log('\n═══ Fix C 已由 tests/holdsettletest.js 取代（略過）═══');
runFixB();

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
      bkIsInstHold, bkHoldExpired,
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

    console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 累計通過 / ' + fail + ' 累計失敗');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error('Fix B 測試中止：', e.message, e.stack); process.exit(1); });
}
