/* 教練手機 V2 不啟動行事曆輪詢 回歸測試（2026-11-13 P0-2）

   背景：MANGO 取消課程後上下滑動 → 整個 PWA 全黑、關掉 App 再開才恢復（疑為 iOS 記憶體被系統砍掉）。
   coachCalV2 啟動的 startCalPoll 每次簽章變動就 dbGetAll('bookings'/'member_tickets')：
   冷快取或增量補失敗時是整表下載（11MB＋4.5MB），且 _calRevalidate 在 V2 既無 _calDataCache、
   也無 .cal-body，永遠不會重繪 → 純無效下載（還連帶 IndexedDB 整表寫入）。

   本測試全用 mock/stub，不連任何資料庫；真函式一律由 index.html 逐字抽出，不 stub 被測物：
     ① V2 不啟動輪詢、殘留計時器被收掉
     ② 冷快取／增量補失敗／熱快取：V2 之後輪詢零下載（對照組：舊行為確實會整表下載，證明測試守得住）
     ③ 日期／週切換仍查最新預約
     ④ 取消後重進正常重繪（預約少一筆、不丟錯）
     ⑤ 票券提示：取消／重進用「已驗證」的最新票券；翻頁沿用快取的既有行為（特徵紀錄）
     ⑥ 管理員輪詢不受影響、V2 清掉計時器後管理員仍能重新啟動 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + x : '')); } };
const info = (n) => console.log('  ℹ ' + n);

function grabFn(name) {
  const a = src.indexOf('async function ' + name + '(');
  const i = a >= 0 ? a : src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
const SRC = {
  v2: grabFn('coachCalV2'), ag: grabFn('renderCoachAgenda'), poll: grabFn('startCalPoll'),
  reval: grabFn('_calRevalidate'), diag: grabFn('_calDiag'), sigBk: grabFn('_calSigBk'), sigTk: grabFn('_calSigTk'),
  cancel: grabFn('cancelBooking'),
};

const BUILTIN = new Set(['Date', 'Promise', 'Object', 'Array', 'Math', 'Set', 'Number', 'String', 'JSON', 'Error', 'undefined', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Boolean', 'Map', 'RegExp', 'Symbol', 'ReferenceError', 'TypeError', 'Infinity', 'NaN', 'WeakMap', 'WeakSet']);
function sandbox(env) {
  const stub = function () { return undefined; };
  return new Proxy(env, {
    has: (t, k) => typeof k === 'string' && !BUILTIN.has(k),
    get: (t, k) => { if (k === Symbol.unscopables) return undefined; if (k in t) return t[k]; return stub; },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
function load(srcs, name, env) {
  return new Function('__sb', 'with(__sb){ ' + srcs.join('\n') + '\n return ' + name + '; }')(sandbox(env));
}

/* ── 共用環境：假伺服器＋假快取＋假計時器 ── */
function mkEnv(opt) {
  opt = opt || {};
  const server = { bookings: [{ id: 'b1', date: '2026-11-13', ticket_id: 't1', status: 'booked' }, { id: 'b2', date: '2026-11-13', ticket_id: 't1', status: 'booked' }], tickets: [{ id: 't1', remaining: 5 }] };
  const cache = { member_tickets: opt.cacheTickets === undefined ? [{ id: 't1', remaining: 5 }] : opt.cacheTickets };
  const timers = [];
  const log = { dl: [], validated: [], ranges: [], marks: [], navTo: 0, clearIv: [], startPoll: 0 };
  const win = { _navSeqNo: 0 };
  const env = {
    window: win, C: { innerHTML: '' }, SESSION: { id: 'c-mango', role: 'coach' }, CUR_PAGE: opt.page || 'coach_calendar',
    TODAY: new Date('2026-11-13T12:00:00Z'), Date, performance: { now: () => 1 }, console: { log() {}, error() {} },
    document: { hidden: false, getElementById: (id) => id === 'wtl-page' ? { innerHTML: '', querySelectorAll: () => [] } : null, querySelector: () => (opt.calBody ? {} : null) },
    ymd: (d) => d.toISOString().slice(0, 10), parseYmd: (s) => new Date(s + 'T12:00:00Z'),
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: (id) => { log.clearIv.push(id); if (id && timers[id - 1]) timers[id - 1] = null; },
    dbGet: async (t, id) => ({ id }),
    admCalHeaderHTML: async () => '<hdr/>', admCalMultiHTML: async () => '<multi/>', cagPositionWrap() {},
    dbPeek: (t) => t === 'member_tickets' ? (cache.member_tickets ? { data: cache.member_tickets.slice() } : null) : { data: [] },
    /* dbGetAll 的模型：member_tickets 讀一次＝驗證後更新快取（等同簽章＋增量補）；
       輪詢模式（env.pollMode）決定「簽章變更時」是便宜的增量、還是整表下載 */
    dbGetAll: async (t) => {
      if (t === 'bookings' || t === 'member_tickets') {
        log.validated.push(t);
        log.dl.push({ t, full: env.pollMode === 'cold' || env.pollMode === 'deltafail' });
      }
      if (t === 'member_tickets') { cache.member_tickets = server.tickets.map(x => Object.assign({}, x)); return cache.member_tickets.slice(); }
      if (t === 'bookings') return server.bookings.slice();
      return [];
    },
    dbBookingsRange: async (a, b) => { log.ranges.push([a, b]); return server.bookings.filter(x => x.date >= a && x.date <= b).map(x => Object.assign({}, x)); },
    dbBookingsForCoach: async () => [], _tkRowsIn: async () => [],
    computeLastBkMarks(tk, bks) { log.marks.push({ tickets: tk, bookings: bks }); win._cagAgendaGen = -1; /* 讓世代檢查直接 return，不跑畫面組字 */ },
    startCalPoll() { log.startPoll++; },
    remoteSigChanged: async () => true, dbCacheClear() {}, uiBusyReason: () => '', navTo() { log.navTo++; },
    pollMode: opt.pollMode || 'warm',
  };
  env._calDiag = new Function('window', 'console', 'performance', SRC.diag + '\nreturn _calDiag;')(win, env.console, env.performance);
  env.server = server; env.cache = cache; env.timers = timers; env.log = log;
  return env;
}
const tickAll = async (env, n) => { for (let i = 0; i < n; i++) { for (const f of env.timers.slice()) if (f) await f(); await new Promise(r => setImmediate(r)); /* _calRevalidate 在 tick 內是不等待的 */ } };
const bigDl = (env) => env.log.dl.filter(x => x.full).length;

(async () => {
  /* ① V2 不啟動輪詢 */
  console.log('\n① V2 不啟動舊輪詢');
  {
    const body = SRC.v2;
    ok('★ coachCalV2 本體不再呼叫 startCalPoll()', !/(?<![\w$.])startCalPoll\s*\(/.test(body.replace(/\/\*[\s\S]*?\*\//g, '')));
    const e = mkEnv(); const f = load([SRC.v2, SRC.ag], 'coachCalV2', e);
    let err = null; try { await f(); } catch (x) { err = x; }
    ok('★★ 真 coachCalV2 執行不丟錯', !err, err && err.message);
    ok('★★ 執行後沒有任何計時器、startCalPoll 零次', e.timers.length === 0 && e.log.startPoll === 0);
  }

  /* ② 殘留計時器（退回路徑／先前頁面啟動、以 coach_calendar 為 key）被收掉；其後輪詢零下載 */
  console.log('\n② 冷快取／增量補失敗／熱快取：V2 之後輪詢零下載（含殘留計時器）');
  for (const mode of ['cold', 'deltafail', 'warm']) {
    const e = mkEnv({ pollMode: mode });
    const startPoll = load([SRC.poll, SRC.reval, SRC.sigBk, SRC.sigTk], 'startCalPoll', e);
    startPoll();   // 模擬「退回路徑」先啟動了輪詢（同 key）
    ok('  [' + mode + '] 前置：殘留計時器已存在', e.timers.length === 1 && !!e.window._calPollTimer);
    const f = load([SRC.v2, SRC.ag], 'coachCalV2', e);
    await f();
    ok('★★ [' + mode + '] 進 V2 後殘留計時器被 clearInterval 並歸 null', e.window._calPollTimer === null && e.timers.every(x => !x));
    e.log.dl.length = 0; e.log.validated.length = 0;
    await tickAll(e, 10);
    ok('★★★ [' + mode + '] 之後 10 輪輪詢：bookings／member_tickets 讀取 0 次', e.log.validated.length === 0, JSON.stringify(e.log.dl));
  }
  console.log('  — 對照組：把 V2 的收計時器那行換回舊的 startCalPoll()，證明測試守得住 —');
  {
    const oldV2 = SRC.v2.replace('if(window._calPollTimer){ clearInterval(window._calPollTimer); window._calPollTimer=null; }', 'startCalPoll();');
    ok('  對照組已成功還原舊行為', oldV2 !== SRC.v2 && /startCalPoll\(\);/.test(oldV2));
    for (const mode of ['cold', 'deltafail']) {
      const e = mkEnv({ pollMode: mode });
      e.startCalPoll = load([SRC.poll, SRC.reval, SRC.sigBk, SRC.sigTk], 'startCalPoll', e);
      const f = load([oldV2, SRC.ag], 'coachCalV2', e);
      await f(); e.log.dl.length = 0; e.log.validated.length = 0;
      await tickAll(e, 3);
      ok('  （舊行為）[' + mode + '] 會整表下載 bookings＋member_tickets（每輪 2 張）', bigDl(e) === 6, 'full=' + bigDl(e));
    }
    const e = mkEnv({ pollMode: 'warm' });
    e.startCalPoll = load([SRC.poll, SRC.reval, SRC.sigBk, SRC.sigTk], 'startCalPoll', e);
    const f = load([oldV2, SRC.ag], 'coachCalV2', e); await f(); e.log.dl.length = 0; await tickAll(e, 3);
    ok('  （舊行為）[warm] 熱快取：有讀取但不是整表（full=0）', e.log.dl.length === 6 && bigDl(e) === 0);
  }

  /* ③ 日期／週切換仍查最新預約 */
  console.log('\n③ 日期與週切換：仍即時查最新預約（不吃快取）');
  {
    const e = mkEnv(); const f = load([SRC.v2, SRC.ag], 'coachCalV2', e);
    e.window._cagSelDate = '2026-11-13'; await f();
    e.window._calStepping = true; e.window._cagSelDate = '2026-11-14'; await f();          // 切日
    e.window._calStepping = true; e.window._cagSelDate = '2026-11-21'; await f();          // 切週
    const r = e.log.ranges;
    ok('★ 每次切換都重新呼叫 dbBookingsRange（共 3 次）', r.length === 3, JSON.stringify(r));
    ok('★ 範圍是選定日前後各 3 天（11/10–11/16、11/11–11/17、11/18–11/24）',
      JSON.stringify(r) === JSON.stringify([['2026-11-10', '2026-11-16'], ['2026-11-11', '2026-11-17'], ['2026-11-18', '2026-11-24']]), JSON.stringify(r));
    e.server.bookings.push({ id: 'b9', date: '2026-11-14', ticket_id: 't1', status: 'booked' });
    e.window._calStepping = true; e.window._cagSelDate = '2026-11-14'; await f();
    const last = e.log.marks[e.log.marks.length - 1];
    ok('★★ 伺服器剛多出的預約，下一次切換立刻看得到（不靠輪詢）', last.bookings.some(b => b.id === 'b9'));
    ok('  整段切換沒有啟動任何計時器', e.timers.length === 0);
  }

  /* ④ 取消後重繪 */
  console.log('\n④ 取消成功後重繪');
  {
    const cancelSrc = SRC.cancel;
    ok('取消成功分支仍以 navTo(CUR_PAGE) 重建頁面（未被本次修改影響）', /closeModal\(\);[\s\S]{0,260}navTo\(CUR_PAGE\)/.test(cancelSrc));
    const e = mkEnv(); const f = load([SRC.v2, SRC.ag], 'coachCalV2', e);
    await f();
    ok('  取消前：畫面拿到 b1、b2', e.log.marks[0].bookings.map(b => b.id).sort().join() === 'b1,b2');
    e.server.bookings = e.server.bookings.filter(b => b.id !== 'b2');          // 模擬取消 b2
    e.server.tickets = [{ id: 't1', remaining: 6 }];                           // 退回 1 堂
    let err = null; try { await f(); } catch (x) { err = x; }                   // navTo(CUR_PAGE) → coachCalV2（非翻頁）
    ok('★★★ 取消後重進不丟錯', !err, err && err.message);
    const m = e.log.marks[e.log.marks.length - 1];
    ok('★★ 取消後畫面只剩 b1', m.bookings.map(b => b.id).join() === 'b1', JSON.stringify(m.bookings.map(b => b.id)));
    ok('  取消後仍沒有任何計時器', e.timers.length === 0);
  }

  /* ⑤ 票券提示 */
  console.log('\n⑤ 票券提示使用的資料');
  {
    const e = mkEnv({ cacheTickets: [{ id: 't1', remaining: 5 }] }); const f = load([SRC.v2, SRC.ag], 'coachCalV2', e);
    e.server.tickets = [{ id: 't1', remaining: 6 }];
    e.log.validated.length = 0; await f();                                       // 重新進入（非翻頁）
    const m = e.log.marks[e.log.marks.length - 1];
    ok('★★ 重進／取消後：member_tickets 走 dbGetAll（簽章校驗＋增量補），不是只吃舊快取', e.log.validated.includes('member_tickets'));
    ok('★★★ 重進／取消後：最後一堂與票券提示拿到伺服器最新票券（remaining=6）', m.tickets.find(t => t.id === 't1').remaining === 6, JSON.stringify(m.tickets));
    ok('  票券讀取是一般 dbGetAll（沒有 fresh 旗標＝沿用既有增量機制，不整表）', /dbGetAll\('member_tickets'\)/.test(SRC.v2) && !/dbGetAll\('member_tickets',\s*\{\s*fresh/.test(SRC.v2));
    // 特徵紀錄：翻頁（_calStepping）2 分鐘內沿用快取，這是既有設計（2026-11-08），本次未動
    e.server.tickets = [{ id: 't1', remaining: 7 }];
    e.log.validated.length = 0; e.window._calStepping = true; await f();
    const m2 = e.log.marks[e.log.marks.length - 1];
    info('翻頁（2 分鐘內）不重新驗證票券：validated=' + JSON.stringify(e.log.validated) + '，畫面 remaining=' + m2.tickets.find(t => t.id === 't1').remaining + '（伺服器 7）— 既有設計，見回報');
  }

  /* ⑥ 管理員輪詢不受影響 */
  console.log('\n⑥ 管理員行事曆輪詢不受影響');
  {
    const callSites = (src.match(/(?<![\w$.])startCalPoll\s*\(\s*\)\s*;/g) || []).length;
    ok('startCalPoll() 呼叫點共 2 處（管理員 PAGES.calendar＋教練桌機退回路徑）', callSites === 2, 'sites=' + callSites);
    ok('  兩處都不在 coachCalV2 內', !/startCalPoll\s*\(\s*\)\s*;/.test(SRC.v2.replace(/\/\*[\s\S]*?\*\//g, '')));
    const e = mkEnv({ page: 'calendar', calBody: true, pollMode: 'warm' });
    e.window._calDataCache = { bookings: [{ id: 'b1', status: 'booked', date: '2026-11-13' }], allTickets: [{ id: 't1', remaining: 5 }], coaches: [], members: [], types: [], _t: 0 };
    e.server.bookings = [{ id: 'b1', status: 'cancelled', date: '2026-11-13' }];
    const startPoll = load([SRC.poll, SRC.reval, SRC.sigBk, SRC.sigTk], 'startCalPoll', e);
    startPoll(); e.log.dl.length = 0; e.log.validated.length = 0;
    await tickAll(e, 1);
    ok('★★ 管理員頁：簽章變更時仍讀 bookings＋member_tickets', e.log.validated.filter(t => t === 'bookings').length >= 1 && e.log.validated.includes('member_tickets'), JSON.stringify(e.log.validated));
    ok('★★ 管理員頁：資料有變且有 .cal-body → 仍 navTo 重繪', e.log.navTo === 1, 'navTo=' + e.log.navTo);
    // V2 清掉計時器後，管理員頁之後進場仍可重新啟動
    const e2 = mkEnv({ page: 'calendar' }); e2.window._calPollTimer = 7;
    const v2 = load([SRC.v2, SRC.ag], 'coachCalV2', e2); await v2();
    const sp2 = load([SRC.poll, SRC.reval], 'startCalPoll', e2); sp2();
    ok('★ V2 收掉計時器後，管理員進場 startCalPoll 能重新啟動', e2.timers.length === 1 && !!e2.window._calPollTimer);
  }

  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})();
