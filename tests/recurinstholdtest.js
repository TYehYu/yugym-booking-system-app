/* 分期待繳費保留：只限「連續預約」關閉，單堂維持原行為（2026-11-17）。
   ① 原始碼：_rrOpts.allowInstallHold 只有在 recurring 時才是 false
   ② 真的跑 runRecurringBooking（資料層用 stub）：有分期票（未開通期數）的會員，
      單堂 → 仍建立「分期待繳費保留」（待簽約、不綁票、不扣堂）；連續預約 → 不建任何保留（由有效票券額度決定）。
   ③ 其他呼叫端（不傳 allowInstallHold）維持原行為。 */
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const g = (a, b) => { const i = src.indexOf(a); if (i < 0) throw new Error('找不到：' + a); return src.slice(i, src.indexOf(b, i) + b.length); };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
(async () => {
  console.log('① 原始碼');
  ok('★ 只有連續預約才關閉分期保留（allowInstallHold:recurring?false:true），單堂不關', /allowInstallHold:recurring\?false:true,/.test(src) && !/allowInstallHold:false/.test(src));
  ok('　　引擎的判斷仍是「!== false 才允許」（沒傳＝允許，其他呼叫端不受影響）', /o\.allowInstallHold!==false/.test(src));
  console.log('\n② 真的跑建立引擎');
  const code = ['const RECUR_HOLD_MAX=2;', g('function recurHoldCheck(', '\n}\n'), g('function buildRecurringSlots(', '\n}\n'), g('function buildRecurringDates(', '\n}\n'), g('function bkHoldExpired(b){', '\n}\n'), g('async function runRecurringBooking(', '\n}\n')].join('\n');
  const names = ['SESSION', 'RECUR_MAX', 'parseYmd', 'ymd', 'addDays', 'TODAY', 'uid', 'listUsableTickets', 'tkUnlockedLeft', 'dbGetAll', 'tkUsableBy', 'tkIsInstall', 'bkTicketTypeOk', 'validateBooking', 'bkIsSelf', 'bkAddTreadmillUnits', 'dbPut', 'dbDel', 'deductTicket', 'createBookingViaRpc', 'FEATURE_FLAGS', 'CLOUD', 'window', 'console'];
  const instTicket = { id: 'TK-I', member_id: 'M1', status: 'usable', sessions_total: 6, sessions_remaining: 4, unlocked_sessions: 2, installment: { count: 3, current: 1 } };
  const mk = (overrides={}) => { const puts = []; let n = 0; const env = { SESSION: { id: 'e' }, RECUR_MAX: 12, parseYmd, ymd, addDays, TODAY: parseYmd('2026-11-16'), uid: (p) => p + '-' + (++n), listUsableTickets: async () => [], tkUnlockedLeft: () => 0, dbGetAll: async () => [instTicket], tkUsableBy: () => true, tkIsInstall: () => true, bkTicketTypeOk: () => true, validateBooking: async () => null, bkIsSelf: () => false, bkAddTreadmillUnits: async () => {}, dbPut: async (s, b) => { puts.push(b); return b; }, dbDel: async () => {}, deductTicket: async () => { throw new Error('保留不該扣堂'); }, createBookingViaRpc: async () => { throw new Error('保留不走 RPC'); }, FEATURE_FLAGS: {}, CLOUD: true, window: { FEATURE_FLAGS: {} }, console: { error() {}, log() {} } };
    Object.assign(env,overrides);return { puts, env, run: new Function(...names, code + '\nreturn runRecurringBooking;')(...names.map(k => env[k])) }; };
  const base = { member_id: 'M1', category: '私人教練', type_id: 'tt', time: '19:00', startDate: '2026-12-02', findTicketFn: async () => null, countRemainFn: async () => 0 };
  { const e = mk(); const r = await e.run(Object.assign({}, base, { dows: [], count: 1, allowInstallHold: true }));
    ok('★ 單堂（allowInstallHold:true）＋分期票有未開通期數 → 建立一堂「分期待繳費保留」', r.held === 1 && e.puts.length === 1, { ok: r.ok, held: r.held, puts: e.puts.length });
    ok('　　那一堂是待簽約、沒綁票、備註寫分期待繳費保留、沒扣堂', e.puts[0] && e.puts[0].pending_contract === true && !e.puts[0].ticket_id && /分期待繳費保留/.test(e.puts[0].note || ''), e.puts[0]); }
  { const e = mk(); const r = await e.run(Object.assign({}, base, { dows: [], count: 1 }));
    ok('　　其他呼叫端不傳 allowInstallHold → 維持原行為（一樣建立保留）', r.held === 1 && e.puts.length === 1, { held: r.held }); }
  { const e = mk(); const r = await e.run(Object.assign({}, base, { dows: [3], count: 2, allowInstallHold: false }));
    ok('★ 連續預約（allowInstallHold:false）＋同一張分期票 → 不建立任何保留（堂數由有效票券額度決定，額度 0）', e.puts.length === 0 && (r.held || 0) === 0 && r.ok === 0, { ok: r.ok, held: r.held, puts: e.puts.length }); }
  { let deducted=0;const e = mk({deductTicket:async()=>{deducted++;return true;}});
    // 直接執行引擎，驗證不是只有畫面放寬。
    const ticket={id:'TK18',plan_name:'18堂',left:18};
    const r=await e.run({...base,dows:[3],count:18,allowInstallHold:false,
      countRemainFn:async()=>18,findTicketFn:async()=>ticket,
      });
    ok('18堂實際建立並恰好扣18次，不截成12堂',r.total===18&&r.ok===18&&e.puts.length===18&&deducted===18,{total:r.total,ok:r.ok,puts:e.puts.length,deducted});
  }
  { let calls=0;const e=mk({FEATURE_FLAGS:{createBookingRpc:true},window:{FEATURE_FLAGS:{createBookingRpc:true}},createBookingViaRpc:async()=>({ok:true,booking_id:'RPC-'+(++calls)})});
    const r=await e.run({...base,dows:[3],count:18,allowInstallHold:false,countRemainFn:async()=>18,findTicketFn:async()=>({id:'T18'})});
    ok('RPC路徑亦完整建立18堂',r.ok===18&&calls===18&&e.puts.length===0,{ok:r.ok,calls});
  }
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})();
