/* 2026-11-16 蔡佳音：連續預約排到 12/8，卡位超過可開放日期被資料庫擋下（HOLD.MONTH_LIMIT），
   畫面卻只寫「寫入失敗」。成因：引擎單堂寫入的 catch 把已經轉譯好的錯誤整個丟掉、固定寫「寫入失敗」。
   這支測試跑「真正的」runRecurringBooking（只替換資料存取與票券查詢），確認三種結果分得開：
     ① 規則擋下（卡位月份限制）→ 寫出卡位截止日與開放規則
     ② 餘額不足／沒票 → 仍是原本的票券不足說法，不被誤認成月份限制
     ③ 真正的系統錯誤 → 才寫「系統寫入失敗」，不會假裝是規則 */
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const g = (a, b) => { const i = src.indexOf(a); if (i < 0) throw new Error('找不到：' + a); return src.slice(i, src.indexOf(b, i) + b.length); };

let code; try { code = [
  g('function buildRecurringSlots(', '\n}\n'), g('function buildRecurringDates(', '\n}\n'),
  g('function tkQuotaMsg(raw){', '\n}\n'), g('function dbFriendlyError(', '\n}\n'), g('function rpcBookingErrMsg(', '\n}\n'),
  g('function recurringWriteErrReason(', '\n}\n'), g('function recurringResultMsg(', '\n}\n'),
  g('async function runRecurringBooking(', '\n}\n')
].join('\n'); } catch (e) { console.log('  ✗ ' + e.message + '（修正前沒有這支函式）'); console.log('\n結果：0 通過／1 失敗'); process.exit(1); }

console.log('結構');
ok('★ 引擎的 catch 不再把錯誤吞掉、固定寫「寫入失敗」（改交 recurringWriteErrReason）',
  /catch\(e\)\{ skipped\+\+;[^\n]*reason:recurringWriteErrReason\(e\)/.test(src) && !/reason:'寫入失敗'/.test(src));
ok('★ 原始錯誤仍進 console（除錯用）', /console\.error\('\[連續預約\] 這一堂寫入沒成功'/.test(src));

const INST = { id: 'T1', status: 'usable', sessions_total: 8, unlocked_sessions: 4 };   // 分期票：還有未開通的堂數 → 可以「待繳費保留」
function mkEnv(o) {
  const calls = { dbPut: [], dbDel: [], rpc: [] };
  const env = {
    SESSION: { id: 'e_fd' }, RECUR_MAX: 12, DB_LABEL: { bookings: '預約' }, tbl: (s) => s, authExpired() {},
    parseYmd: (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    ymd: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    addDays: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    uid: (p) => p + '-' + (calls.dbPut.length + 1),
    listUsableTickets: async () => [], tkUnlockedLeft: () => 0,
    dbGetAll: async () => o.tickets || [], tkUsableBy: () => true, tkIsInstall: () => true, bkTicketTypeOk: () => true,
    validateBooking: async () => null, bkIsSelf: () => false, bkAddTreadmillUnits: async () => {},
    dbPut: async (store, bk) => { calls.dbPut.push(bk); if (o.dbPut) return o.dbPut(bk); return bk; },
    dbDel: async (s, id) => { calls.dbDel.push(id); },
    deductTicket: async () => (o.deduct === undefined ? true : o.deduct),
    createBookingViaRpc: async (...a) => { calls.rpc.push(a); return o.rpc(...a); },
    FEATURE_FLAGS: { createBookingRpc: !!o.rpc }, CLOUD: true, window: { FEATURE_FLAGS: { createBookingRpc: !!o.rpc } }, console: { error() {}, log() {} }
  };
  return { env, calls };
}
const names = ['SESSION', 'RECUR_MAX', 'DB_LABEL', 'tbl', 'authExpired', 'parseYmd', 'ymd', 'addDays', 'uid', 'listUsableTickets', 'tkUnlockedLeft', 'dbGetAll', 'tkUsableBy', 'tkIsInstall', 'bkTicketTypeOk', 'validateBooking', 'bkIsSelf', 'bkAddTreadmillUnits', 'dbPut', 'dbDel', 'deductTicket', 'createBookingViaRpc', 'FEATURE_FLAGS', 'CLOUD', 'window', 'console'];
const build = (env) => new Function(...names, code + '\nreturn { runRecurringBooking, recurringResultMsg, recurringWriteErrReason, rpcBookingErrMsg, dbFriendlyError };')(...names.map(n => env[n]));
// PostgREST 風格的錯誤（trigger 的 raise exception）
const pgErr = (message, code) => ({ message, code: code || 'P0001', details: null });

(async () => {
  console.log('\n① 卡位月份限制（蔡佳音：本期票用完，之後的堂數以「待繳費保留」卡位，超過可開放日期被 trigger 擋下）');
  {
    const { env, calls } = mkEnv({ tickets: [INST], dbPut: function (bk) { if (bk.date > '2026-11-30') throw build({ ...mkEnv({}).env }).dbFriendlyError(pgErr('HOLD.MONTH_LIMIT:2026-11-30'), 'bookings', '儲存'); return bk; } });
    const E = build(env);
    const r = await E.runRecurringBooking({ member_id: 'M1', category: '私人教練', type_id: 'tt', startDate: '2026-11-25', time: '19:00', dows: [0, 1, 2, 3, 4, 5, 6], count: 12, findTicketFn: async () => null, countRemainFn: async () => 0 });
    ok('11/25–11/30 共 6 堂以待繳費保留建立成功', r.held === 6 && r.ok === 0, { held: r.held, ok: r.ok, skipped: r.skipped });
    ok('12/01–12/06 共 6 堂被規則擋下（skipped 6）', r.skipped === 6, r.skipped);
    const reasons = [...new Set(r.results.filter(x => !x.ok).map(x => x.reason))];
    ok('★ 原因寫出卡位截止日 2026/11/30', reasons.length === 1 && /2026\/11\/30/.test(reasons[0]), reasons);
    ok('★ 原因寫出開放規則（每月最後一個星期一起開放下個月）', /每月最後一個星期一起開放下個月/.test(reasons[0]), reasons);
    ok('★ 不再是模糊的「寫入失敗」', !/寫入失敗/.test(reasons.join('')), reasons);
    const msg = E.recurringResultMsg(r);
    ok('★ 給櫃檯的總訊息也看得到截止日與次數', /6 筆未建立/.test(msg) && /2026\/11\/30/.test(msg) && /×6/.test(msg), msg);
    ok('規則沒有被放寬：被擋的日期沒有任何一筆寫進去（dbPut 都有嘗試、但只有 ≤11/30 成功）', calls.dbPut.filter(b => b.date <= '2026-11-30').length === 6 && calls.dbPut.length === 12, calls.dbPut.length);
  }
  console.log('\n　 原始訊息沒帶日期、或已轉譯過的錯誤：仍能還原日期');
  {
    const { env } = mkEnv({}); const E = build(env);
    ok('只有代碼沒有日期 → 講本月底／已開放的下個月，不亂編日期', /本月底（或已開放的下個月）/.test(E.recurringWriteErrReason(pgErr('HOLD.MONTH_LIMIT'))), E.recurringWriteErrReason(pgErr('HOLD.MONTH_LIMIT')));
    const friendly = E.dbFriendlyError(pgErr('HOLD.MONTH_LIMIT:2026-11-30'), 'bookings', '儲存'); delete friendly.rawMessage;
    ok('已轉譯錯誤（code 在、rawMessage 沒了）→ 從轉譯後訊息的日期還原', /2026\/11\/30/.test(E.recurringWriteErrReason(friendly)), E.recurringWriteErrReason(friendly));
    ok('RPC 路徑的錯誤碼帶日期 → 訊息帶日期', /2026\/11\/30/.test(E.rpcBookingErrMsg('HOLD.MONTH_LIMIT:2026-11-30')) && /最後一個星期一/.test(E.rpcBookingErrMsg('HOLD.MONTH_LIMIT:2026-11-30')));
    ok('RPC 路徑的錯誤碼沒帶日期 → 維持原本說法', /只能預約當月/.test(E.rpcBookingErrMsg('HOLD.MONTH_LIMIT')));
  }

  console.log('\n② 餘額不足：不被誤認成月份限制');
  {
    const { env, calls } = mkEnv({ tickets: [] }); const E = build(env);
    const r = await E.runRecurringBooking({ member_id: 'M1', category: '私人教練', type_id: 'tt', startDate: '2026-12-08', time: '19:00', dows: [], findTicketFn: async () => null, countRemainFn: async () => 0 });
    ok('沒票也不能卡位（非分期）→ noTicket、原因是票券不足', r.noTicket === 1 && r.results[0].reason === '票券不足或已過期' && calls.dbPut.length === 0, r);
    ok('原因不含月份限制字樣', !/卡位|星期一/.test(r.results[0].reason));
  }
  {
    const { env, calls } = mkEnv({ deduct: false }); const E = build(env);
    const r = await E.runRecurringBooking({ member_id: 'M1', category: '私人教練', type_id: 'tt', startDate: '2026-12-08', time: '19:00', dows: [], findTicketFn: async () => ({ id: 'T1', ticket_type_id: 'tt' }), countRemainFn: async () => 1 });
    ok('有票但扣課被護欄擋下（餘額 0）→ 預約收回、原因是扣課失敗（票券未被扣）', r.skipped === 1 && /扣課失敗/.test(r.results[0].reason) && calls.dbDel.length === 1, r);
  }
  {
    const { env } = mkEnv({ rpc: async () => ({ ok: false, reason: 'x' }) }); const E0 = build(env);
    const { env: env2 } = mkEnv({ rpc: async () => ({ ok: false, reason: E0.rpcBookingErrMsg('TICKET.EMPTY') }) }); const E = build(env2);
    const r = await E.runRecurringBooking({ member_id: 'M1', category: '私人教練', type_id: 'tt', startDate: '2026-12-08', time: '19:00', dows: [], findTicketFn: async () => ({ id: 'T1', ticket_type_id: 'tt' }), countRemainFn: async () => 1 });
    ok('RPC 路徑：會員無可用票券 → 原因是票券問題（不是月份限制、也不是系統錯誤）', r.results[0].reason === '會員無可用票券', r.results[0]);
  }
  {
    const { env } = mkEnv({}); const E = build(env);
    const e = E.dbFriendlyError(pgErr('TICKET.INSTALLMENT_LOCKED', 'P0001'), 'bookings', '儲存');
    ok('分期額度用完 → 講開通堂數／先收款', /開通|收款/.test(E.recurringWriteErrReason(e)) && !/系統寫入失敗/.test(E.recurringWriteErrReason(e)), E.recurringWriteErrReason(e));
    ok('預約窗口 → 講最晚可預約日', /最晚 2026\/12\/31/.test(E.recurringWriteErrReason(E.dbFriendlyError(pgErr('TKWIN.OUT_OF_WINDOW:2026-12-01:2026-12-31'), 'bookings', '儲存'))));
  }

  console.log('\n③ 真正的系統錯誤：才叫系統寫入失敗');
  {
    const { env } = mkEnv({ tickets: [INST], dbPut: function () { throw build({ ...mkEnv({}).env }).dbFriendlyError(pgErr('internal server error', 'XX000'), 'bookings', '儲存'); } });
    const E = build(env);
    const r = await E.runRecurringBooking({ member_id: 'M1', category: '私人教練', type_id: 'tt', startDate: '2026-11-25', time: '19:00', dows: [], findTicketFn: async () => null, countRemainFn: async () => 0 });
    ok('★ 原因是「系統寫入失敗」並附已轉譯訊息', /^系統寫入失敗（/.test(r.results[0].reason), r.results[0]);
    ok('★ 沒有假裝成規則（不含截止日／星期一／開放）', !/卡位|星期一|開放|2026\//.test(r.results[0].reason), r.results[0]);
    const msg = E.recurringResultMsg(r); ok('總訊息有帶系統寫入失敗', /系統寫入失敗/.test(msg), msg);
  }
  {
    const { env } = mkEnv({}); const E = build(env);
    const reason = E.recurringWriteErrReason(E.dbFriendlyError(new Error('Failed to fetch'), 'bookings', '儲存'));
    ok('★ 連線失敗 → 明講「不確定有沒有建立」，要先重新整理確認（避免重排出重複課）', /不確定有沒有建立/.test(reason) && /重新整理/.test(reason), reason);
    ok('不吃例外：傳 null／字串也不炸', typeof E.recurringWriteErrReason(null) === 'string' && /系統寫入失敗/.test(E.recurringWriteErrReason('boom')));
  }
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})();
