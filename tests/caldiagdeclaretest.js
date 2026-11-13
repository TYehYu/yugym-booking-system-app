/* _calDiag 缺宣告回歸測試（2026-11-13 P0）

   事故：正式版 261112.1512 的 coachCalV2／renderCoachAgenda 共 13 處呼叫 _calDiag，
   但函式從未進版控 → 手機教練行事曆 ReferenceError（Safari：Can't find variable: _calDiag）。
   舊測試（coachcaltktest.js）在 sandbox 裡塞 `_calDiag: () => {}`，所以抓不到。

   這支測試「不 stub _calDiag」：
     ① 靜態：所有診斷類 helper（名稱含 Diag）凡被呼叫就必須有宣告，且宣告與呼叫在同一個 <script> 區塊。
     ② _calDiag 本身：環狀緩衝、console.log 丟錯、window 異常時都不得丟錯。
     ③ 真的跑 coachCalV2（用逐字抽出的真 _calDiag）：初次載入、連續切日期，都不丟錯。
     ④ 真的跑 renderCoachAgenda：有宣告 → 「最後一堂」標記（computeLastBkMarks）有被執行；
        拿掉宣告 → 重現舊 bug（標記被靜默跳過），證明這支測試真的守得住。
     ⑤ 舊版 fallback（coachCalV2 失敗 → renderCoachAgenda）流程。 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + x : '')); } };

function grabFn(name) {
  const a = src.indexOf('async function ' + name + '(');
  const i = a >= 0 ? a : src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}

/* ① 靜態：診斷類 helper 宣告齊全 */
console.log('\n① 靜態：診斷 helper 宣告');
const scripts = [];
{ const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m; while ((m = re.exec(src))) scripts.push(m[1]); }
const calls = new Set();
{ const re = /(?<![\w$.])(_\w*[Dd]iag\w*)\s*\(/g; let m; while ((m = re.exec(src))) calls.add(m[1]); }
ok('找得到診斷類呼叫（_calDiag 在內）', calls.has('_calDiag'), [...calls].join(','));
calls.forEach(name => {
  const declRe = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(|(?:const|let|var)\\s+' + name + '\\s*=');
  ok('★★★ ' + name + ' 有宣告', declRe.test(src));
  const callRe = new RegExp('(?<![\\w$.])' + name + '\\s*\\(', 'g');
  scripts.forEach((s, idx) => {
    const withoutDecl = s.replace(new RegExp('function\\s+' + name + '\\s*\\(', 'g'), '');
    if (callRe.test(withoutDecl)) ok('  ' + name + ' 的呼叫與宣告在同一個 <script>（第 ' + idx + ' 區塊）', declRe.test(s));
    callRe.lastIndex = 0;
  });
});
ok('★ _calDiag 呼叫共 13 處（coachCalV2 11＋renderCoachAgenda 2）', (src.match(/(?<![\w$.])_calDiag\s*\((?!stage)/g) || []).length === 13);
ok('★ _calDiag 宣告只有一份', (src.match(/function _calDiag\s*\(/g) || []).length === 1);
const SRC_diag = grabFn('_calDiag');
ok('★ _calDiag 本體整段包在 try/catch', /^function _calDiag\(stage, extra\)\{\s*try\{[\s\S]*\}\s*catch\s*\(_\)\s*\{\s*\}\s*\}$/.test(SRC_diag));

/* ② _calDiag 本身 */
console.log('\n② _calDiag 本身永遠不丟錯');
function mkDiag(win, cons, perf) {
  return new Function('window', 'console', 'performance', SRC_diag + '\nreturn _calDiag;')(win, cons, perf);
}
{
  const win = {}; const logs = [];
  const d = mkDiag(win, { log: (...a) => logs.push(a) }, { now: () => 12.6 });
  d('a'); d('b', { x: 1 });
  ok('寫進 window._calDiagLog', win._calDiagLog.length === 2 && win._calDiagLog[1].stage === 'b' && win._calDiagLog[1].x === 1 && win._calDiagLog[0].t === 13);
  ok('同時 console.log', logs.length === 2 && logs[0][1] === 'a');
  for (let i = 0; i < 300; i++) d('n' + i);
  ok('環狀緩衝上限 200', win._calDiagLog.length === 200 && win._calDiagLog[199].stage === 'n299');
  const d2 = mkDiag({}, { log: () => { throw new Error('console 壞了'); } }, { now: () => 1 });
  let threw = false; try { d2('x'); } catch (_) { threw = true; }
  ok('★★ console.log 丟錯也不外洩', !threw);
  const d3 = mkDiag(null, console, { now: () => 1 });
  threw = false; try { d3('x'); } catch (_) { threw = true; }
  ok('★★ window 異常（null）也不外洩', !threw);
  const d4 = mkDiag({}, { log() {} }, { now: () => { throw new Error('perf 壞了'); } });
  threw = false; try { d4('x'); } catch (_) { threw = true; }
  ok('★★ performance.now 丟錯也不外洩', !threw);
}

/* 寬鬆沙盒：未列出的全域一律給無害 stub；只有 _calDiag 由呼叫端決定要不要提供 */
const BUILTIN = new Set(['Date','Promise','Object','Array','Math','Set','Number','String','JSON','Error','undefined','parseInt','parseFloat','isNaN','Boolean','Map','RegExp','Symbol','ReferenceError','TypeError','console','arguments','NaN','Infinity']);
function sandbox(overrides, provideDiag) {
  const store = Object.assign({}, overrides);
  if (provideDiag) store._calDiag = mkDiag(store.window, { log() {} }, { now: () => 1 });
  const stub = function () { return undefined; };
  return new Proxy(store, {
    has: (t, k) => typeof k === 'string' && !BUILTIN.has(k) || (typeof k === 'string' && k in t),
    get: (t, k) => {
      if (k === Symbol.unscopables) return undefined;
      if (k in t) return t[k];
      if (k === '_calDiag') throw new ReferenceError("Can't find variable: _calDiag");
      return stub;
    }
  });
}
function runWith(fnSrc, name, sb) {
  return new Function('__sb', 'with(__sb){ ' + fnSrc + '\n return ' + name + '; }')(sb);
}

(async () => {
  /* ③ 真的跑 coachCalV2 */
  console.log('\n③ 真 coachCalV2（不 stub _calDiag）：初次載入＋連續切換');
  const SRC_v2 = grabFn('coachCalV2');
  function v2Env() {
    const win = { _navSeqNo: 0 };
    return {
      window: win, C: { innerHTML: '' }, SESSION: { id: 'c-mango' },
      startCalPoll() {}, dbGet: async (t, id) => ({ id }), dbGetAll: async () => [],
      ymd: () => '2026-11-13', TODAY: new Date('2026-11-13'),
      admCalHeaderHTML: async () => '<hdr/>', admCalMultiHTML: async () => '<multi/>',
      renderCoachAgenda: async () => { win._agenda = (win._agenda || 0) + 1; }, cagPositionWrap() {},
      performance: { now: () => 5 }, Date,
    };
  }
  {
    const e = v2Env(); const f = runWith(SRC_v2, 'coachCalV2', sandbox(e, true));
    let err = null; try { await f(); } catch (x) { err = x; }
    ok('★★★ 初次載入不丟錯', !err, err && err.message);
    ok('★★ 診斷紀錄有寫（enter 與 exit）', e.window._calDiagLog && e.window._calDiagLog.some(x => x.stage === 'coachCalV2:enter') && e.window._calDiagLog.some(x => /exit/.test(x.stage)), JSON.stringify((e.window._calDiagLog || []).map(x => x.stage)));
    err = null; try { for (let i = 0; i < 5; i++) { e.window._calStepping = true; await f(); } } catch (x) { err = x; }
    ok('★★★ 連續切換 5 次不丟錯', !err, err && err.message);
  }
  {
    const e = v2Env(); const f = runWith(SRC_v2, 'coachCalV2', sandbox(e, false));
    let err = null; try { await f(); } catch (x) { err = x; }
    ok('（對照）拿掉宣告 → 重現舊 bug：ReferenceError', err instanceof ReferenceError && /_calDiag/.test(err.message), err && err.message);
  }

  /* ④ 真的跑 renderCoachAgenda */
  console.log('\n④ 真 renderCoachAgenda：「最後一堂」標記不得被診斷呼叫吃掉');
  const SRC_ag = grabFn('renderCoachAgenda');
  function agEnv(rowsOk) {
    const win = {};
    const env = {
      window: win, SESSION: { id: 'c-mango' }, TODAY: new Date('2026-11-13'),
      document: { getElementById: (id) => id === 'wtl-page' ? { innerHTML: '' } : null },
      ymd: (d) => d.toISOString().slice(0, 10), parseYmd: (s) => new Date(s),
      dbPeek: (t) => ({ data: t === 'member_tickets' ? [{ id: 't1' }] : [{ id: 'x' }] }),
      dbGetAll: async () => [],
      dbBookingsRange: async () => [{ id: 'b1', ticket_id: 't1', status: 'booked' }],
      dbBookingsForCoach: async () => [],
      _tkRowsIn: async () => { if (!rowsOk) throw new Error('RPC 失敗'); return [{ id: 'b1', ticket_id: 't1' }]; },
      computeLastBkMarks() { env.marksCalled = (env.marksCalled || 0) + 1; win._cagAgendaGen = -1; /* 讓後面的世代檢查直接 return，不跑畫面組字 */ },
      performance: { now: () => 1 }, Date,
    };
    return env;
  }
  for (const rowsOk of [true, false]) {
    const e = agEnv(rowsOk); const f = runWith(SRC_ag, 'renderCoachAgenda', sandbox(e, true));
    let err = null; try { await f(); } catch (x) { err = x; }
    ok('★★★ [' + (rowsOk ? '補抓成功' : '補抓失敗') + '] 有宣告：不丟錯且 computeLastBkMarks 有被執行', !err && e.marksCalled === 1, err ? err.message : 'marksCalled=' + e.marksCalled);
    const stages = (e.window._calDiagLog || []).map(x => x.stage);
    ok('  診斷階段 ' + (rowsOk ? 'agenda:lastbk-fullrows-ok' : 'agenda:lastbk-fullrows-error') + ' 有被記錄', stages.includes(rowsOk ? 'agenda:lastbk-fullrows-ok' : 'agenda:lastbk-fullrows-error'), stages.join(','));
  }
  {
    const e = agEnv(true); const f = runWith(SRC_ag, 'renderCoachAgenda', sandbox(e, false));
    let err = null; try { await f(); } catch (x) { err = x; }
    ok('（對照）拿掉宣告 → 重現舊 bug：標記被靜默跳過', e.marksCalled !== 1);
  }

  /* ⑤ 舊版 fallback：coachCalV2 失敗 → 退回 renderCoachAgenda（比照 PAGES.coach_calendar 手機分支） */
  console.log('\n⑤ 舊版 fallback 流程（coachCalV2 失敗時退回 renderCoachAgenda）');
  {
    const callerSrc = src.slice(src.indexOf("return await coachCalV2();") - 200, src.indexOf("return await coachCalV2();") + 520);
    ok('fallback 結構：try{ return await coachCalV2() } catch → toast → 後續 renderCoachAgenda', /try\{\s*return await coachCalV2\(\);\s*\}\s*catch\(e\)\{[\s\S]*退回教練原本的行事曆[\s\S]*showToast/.test(callerSrc));
    const e = v2Env(); e.admCalHeaderHTML = async () => { throw new Error('模擬 v2 失敗'); };
    const f = runWith(SRC_v2, 'coachCalV2', sandbox(e, true));
    let v2err = null; try { await f(); } catch (x) { v2err = x; }
    ok('coachCalV2 失敗時丟出的是原始錯誤（不是 ReferenceError，診斷碼沒有搶先爆）', v2err && !(v2err instanceof ReferenceError) && /模擬 v2 失敗/.test(v2err.message), v2err && v2err.message);
    const a = agEnv(true); const g = runWith(SRC_ag, 'renderCoachAgenda', sandbox(a, true));
    let err = null; try { await g(); } catch (x) { err = x; }
    ok('接著退回 renderCoachAgenda 可正常執行', !err && a.marksCalled === 1, err && err.message);
  }

  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})();
