/* 櫃檯取消走伺服器單一交易 fn_desk_cancel_booking（2026-11-18，上線阻擋 B1）
   ⚠ 讀的是本 repo 的 index.html。執行的是真正的 cancelBooking 原始碼，伺服器端用替身回傳；
   資料庫函式本身（單一交易、部分退款、故障回滾、與扣堂交錯）由 docs/testdb/p0e/p0e_14_desk_deduct_tests.sql 在測試庫驗證。 */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
function grab(name) {
  let i = src.indexOf('async function ' + name + '('); if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k; for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
function make(o) {
  const log = { rpcs: [], puts: [], refunds: [], toasts: [], reward: 0, makeup: 0, modals: [], navs: 0, logs: [] };
  const booking = Object.assign({ id: 'B1', member_id: 'M1', ticket_id: null, category: '小班肌力', date: '2026-12-01', start_time: '19:00', duration: 60, status: 'booked' }, o.booking || {});
  let attempt = 0;
  const env = {
    bookingAccountErrMsg: new Function('return ('+src.slice(src.indexOf('function bookingAccountErrMsg('),src.indexOf('\n}\n',src.indexOf('function bookingAccountErrMsg('))+3)+');')(),
    window: { FEATURE_FLAGS: { cancelBookingRpc: true } }, FEATURE_FLAGS: { cancelBookingRpc: true }, CLOUD: o.cloud !== false,
    sb: { rpc: async (n, a) => { log.rpcs.push([n, a]); attempt++; return o.rpc(n, a, attempt); } },
    isDeskLike: () => o.desk !== false, SESSION: { id: 'E1', role: o.desk === false ? 'coach' : 'front_desk' }, CUR_PAGE: 'calendar',
    dbGet: async () => Object.assign({}, booking), dbPut: async (s, x) => { log.puts.push([s, x]); }, dbCacheClear: () => {},
    refundTicket: async (t, b) => { log.refunds.push([t, b]); return true; }, logTicket: async () => {},
    bkIsGroup: (b) => b.category === '小班肌力',
    revokeRewardOnCancel: async () => { log.reward++; return {}; }, revokeMakeupOnCancel: async () => { log.makeup++; return 0; }, rewardToastText: () => '',
    showToast: (m) => { log.toasts.push(String(m)); }, closeModal: () => {}, navTo: () => { log.navs++; },
    cancelTooLateModal: () => log.modals.push('late'), cancelDeskOnlyModal: () => log.modals.push('desk_only'),
    hoursUntilStart: () => 200, console: { log() {}, warn() {}, error() {} }, setTimeout: (f) => { f(); return 0; },
  };
  const scope = new Proxy({}, { has: () => true, get: (_t, k) => { if (k === Symbol.unscopables) return undefined; if (k in env) return env[k]; if (typeof k === 'string' && k in globalThis) return globalThis[k]; return undefined; } });
  const fn = new Function('scope', 'with(scope){ return (' + grab('cancelBooking') + '); }')(scope);
  return { fn, log };
}
const D = (d) => async () => ({ data: d, error: null });

(async () => {
  console.log('═══ ① 櫃檯取消只呼叫 fn_desk_cancel_booking，前端不再自己退票或寫狀態 ═══');
  let m = make({ rpc: D({ ok: true, outcome: 'refunded', refunded: 3, failed: 0, failed_tickets: [] }) });
  await m.fn('B1', 'force', {});
  ok('一次 RPC、模式 force 原樣帶出', m.log.rpcs.length === 1 && m.log.rpcs[0][0] === 'fn_desk_cancel_booking' && m.log.rpcs[0][1].p_mode === 'force' && m.log.rpcs[0][1].p_booking_id === 'B1', m.log.rpcs);
  ok('★★★ 前端沒有 refundTicket、沒有 dbPut（沒有兩步寫入）', m.log.refunds.length === 0 && m.log.puts.length === 0, [m.log.refunds, m.log.puts]);
  ok('提示「退回 3 堂票券」；贈點與補課券照常收回；重繪', m.log.toasts.some(t => /退回 3 堂票券/.test(t)) && m.log.reward === 1 && m.log.makeup === 1 && m.log.navs === 1, m.log.toasts);
  m = make({ rpc: D({ ok: true, outcome: 'operator_waived', refunded: 0, failed: 0, failed_tickets: [] }) }); await m.fn('B1', 'none', {});
  ok('none（人員選擇扣課不退）：p_mode=none、提示「扣課不退」', m.log.rpcs[0][1].p_mode === 'none' && m.log.toasts.some(t => /扣課不退/.test(t)), [m.log.rpcs[0][1], m.log.toasts]);
  m = make({ rpc: D({ ok: true, outcome: 'refunded', refunded: 1, failed: 0, failed_tickets: [] }) }); await m.fn('B1', undefined, {});
  ok('沒指定模式＝auto', m.log.rpcs[0][1].p_mode === 'auto');

  console.log('═══ ② 部分退款不能默默算全部成功 ═══');
  m = make({ rpc: D({ ok: true, outcome: 'refund_partial', refunded: 2, failed: 1, failed_tickets: ['TK-F'] }) }); await m.fn('B1', 'force', {});
  ok('★★★ 提示「部分退款…尚有待處理」，含已退 2 堂與 1 張失敗，不是「退回 2 堂」就結束', m.log.toasts.some(t => /部分退款/.test(t) && /尚有待處理/.test(t) && /已退回 2 堂/.test(t) && /1 張票/.test(t)) && !m.log.toasts.some(t => /^已取消預約，退回/.test(t)), m.log.toasts);
  m = make({ rpc: D({ ok: true, outcome: 'refund_failed', refunded: 0, failed: 1, failed_tickets: ['TK-F'] }) }); await m.fn('B1', 'force', {});
  ok('全部退不掉：提示「退款未成功…取消未退」', m.log.toasts.some(t => /退款未成功/.test(t) && /取消未退/.test(t)), m.log.toasts);

  console.log('═══ ③ 連線失敗／業務拒絕：不落回前端兩步 ═══');
  m = make({ rpc: async () => ({ data: null, error: { message: 'fetch failed' } }) }); await m.fn('B1', 'force', {});
  ok('傳輸失敗重試 2 次後：不取消、不退票、不寫入、不收回贈點、提示請重按', m.log.rpcs.length === 2 && m.log.puts.length === 0 && m.log.refunds.length === 0 && m.log.reward === 0 && m.log.toasts.some(t => /連線不穩/.test(t)), [m.log.rpcs.length, m.log.toasts]);
  m = make({ rpc: D({ ok: false, error_code: 'X.WHATEVER' }) }); await m.fn('B1', 'force', {});
  ok('★★★ 業務拒絕：只呼叫一次、沒有任何前端寫入或退票、提示「沒有任何資料被更動」', m.log.rpcs.length === 1 && m.log.puts.length === 0 && m.log.refunds.length === 0 && m.log.toasts.some(t => /沒有任何資料被更動/.test(t)), [m.log.rpcs.length, m.log.toasts]);
  m = make({ rpc: async (n, a, i) => i === 1 ? { data: null, error: { message: 'timeout' } } : { data: { ok: true, already: true }, error: null } }); await m.fn('B1', 'force', {});
  ok('第一次回應遺失、重試時伺服器回「已取消」：視為成功並補做贈點／補課券收回（不當成使用者重複點擊）', m.log.rpcs.length === 2 && m.log.reward === 1 && !m.log.toasts.some(t => /已經取消過了/.test(t)), [m.log.rpcs.length, m.log.reward, m.log.toasts]);
  m = make({ rpc: D({ ok: true, already: true }) }); await m.fn('B1', 'force', {});
  ok('使用者重複點擊（第一次就回已取消）：提示「已經取消過了」，不再收回贈點', m.log.toasts.some(t => /已經取消過了/.test(t)) && m.log.reward === 0, m.log.toasts);

  console.log('═══ ④ 團課與單人課都走同一支；教練不能走（不落回前端兩步）═══');
  m = make({ booking: { category: '小班肌力' }, rpc: D({ ok: true, outcome: 'refunded', refunded: 2, failed: 0, failed_tickets: [] }) }); await m.fn('B1', 'auto', {});
  ok('團課：一次 RPC、沒有逐票 refundTicket 迴圈', m.log.rpcs.length === 1 && m.log.refunds.length === 0);
  m = make({ desk: false, booking: { category: '小班肌力' }, rpc: D({ ok: true }) }); await m.fn('B1', 'force', {});
  ok('教練取消團課／強制退：只顯示「櫃檯才能處理」，不呼叫任何 RPC、不寫入', m.log.modals.includes('desk_only') && m.log.rpcs.length === 0 && m.log.puts.length === 0 && m.log.refunds.length === 0, [m.log.modals, m.log.rpcs.length]);
  m = make({ desk: false, booking: { category: '私人教練', ticket_id: 'TK1' }, rpc: D({ ok: true, cancellation_result: 'refunded' }) }); await m.fn('B1', 'auto', {});
  ok('教練取消單人課自動政策：仍走既有 fn_cancel_booking（單一交易）', m.log.rpcs.length === 1 && m.log.rpcs[0][0] === 'fn_cancel_booking', m.log.rpcs.map(x => x[0]));
  m = make({ desk: false, booking: { category: '私人教練', ticket_id: 'TK1' }, rpc: D({ ok: false, error_code: 'X.UNKNOWN' }) }); await m.fn('B1', 'auto', {});
  ok('★★★ 教練路徑業務失敗也不回退前端兩步：沒有 dbPut、沒有 refundTicket', m.log.puts.length === 0 && m.log.refunds.length === 0 && m.log.toasts.some(t => /沒有任何資料被更動/.test(t)), [m.log.puts.length, m.log.refunds.length, m.log.toasts]);

  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
