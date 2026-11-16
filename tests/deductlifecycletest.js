/* 多堂扣課的操作識別「完整生命週期」（2026-11-18 rev3：伺服器端操作登記）
   ⚠ 讀的是本 repo 的 index.html（__dirname/..）。不連任何資料庫。
   執行的是真正的 deductTicket／tkDeductUnit 原始碼；三條多堂流程的識別字串，是從 index.html 呼叫端原始碼
   「原樣抽出算式」後代入實際變數求值——不是測試自己手寫識別。
   伺服器端用記憶體替身，語意與 docs/migrations/20261117_fn_desk_deduct_ticket.sql 逐條對應（該函式本身由
   docs/testdb/p0e/p0e_14_desk_deduct_tests.sql 在測試庫驗證，含相同的退款後重加案例）。 */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
function grab(name) {
  let i = src.indexOf('async function ' + name + '('); if (i < 0) i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k; for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
/* 從呼叫端原始碼抽出識別算式（第三個流程是 'fol:'…，第一個 'gcr:'…，第二個 'st:'…）*/
function keyExpr(prefix) {
  let from = 0;
  for (;;) {
    const i = src.indexOf('tkDeductUnit(', from); if (i < 0) throw new Error('抽不到 ' + prefix + ' 的識別算式');
    from = i + 1; if (src.slice(Math.max(0, i - 15), i).includes('function')) continue;
    let d = 0, k = i + 'tkDeductUnit'.length, start = k + 1, args = [], q = null;
    for (; k < src.length; k++) { const c = src[k];
      if (q) { if (c === q && src[k - 1] !== '\\') q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; continue; }
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') { d--; if (d === 0) { args.push(src.slice(start, k)); break; } }
      else if (c === ',' && d === 1) { args.push(src.slice(start, k)); start = k + 1; } }
    if (args[3] && args[3].trim().startsWith("'" + prefix + ":'")) return args[3].trim();
  }
}
const E = { gcr: keyExpr('gcr'), st: keyExpr('st'), fol: keyExpr('fol') };

/* 伺服器替身：fn_desk_booking_rev／fn_desk_op_begin／fn_desk_deduct_ticket 的語意（與 docs/migrations/20261117_fn_desk_deduct_ticket.sql 逐條對應；該 SQL 本身由測試庫驗證）*/
function world(o) {
  o = o || {};
  const db = { tk: { id: 'T1', plan_name: '票', sessions_remaining: o.rem == null ? 6 : o.rem, status: 'usable' }, ledger: [], ops: [], rev: 'r0', booking: { id: 'B1', status: 'booked' }, calls: [], toasts: [] };
  let revN = 0; const bump = () => { db.rev = 'r' + (++revN); };            // 預約被更新（名單／座位票／時長／狀態）→ 預約版本改變
  const refunds = () => db.ledger.filter(l => l.action === 'refund').length;
  const net = () => db.ledger.filter(l => l.action === 'deduct' && l.delta !== 0).length - refunds();
  const revRpc = () => db.booking.status === 'cancelled' ? { ok: false, error_code: 'BOOKING_CANCELLED' } : { ok: true, rev: db.rev };
  const begin = (a) => {
    if (db.booking.status === 'cancelled') return { ok: false, error_code: 'BOOKING_CANCELLED' };
    if (a.p_expect_rev !== db.rev) return { ok: false, error_code: 'REV_MISMATCH' };
    const last = db.ops.filter(x => x.slot === a.p_slot && x.ticket === a.p_ticket_id).sort((x, y) => y.epoch - x.epoch)[0];
    if (last && last.rev === db.rev && last.refunds_at_begin === refunds()) return { ok: true, op_key: last.op_key, epoch: last.epoch, reused: true };
    const epoch = (last ? last.epoch : 0) + 1, key = a.p_slot + ':e' + epoch;
    db.ops.push({ op_key: key, slot: a.p_slot, ticket: a.p_ticket_id, epoch, rev: db.rev, refunds_at_begin: refunds() });
    return { ok: true, op_key: key, epoch, reused: false };
  };
  const deduct = (a) => {
    if (db.booking.status === 'cancelled') return { ok: false, error_code: 'BOOKING_CANCELLED' };
    if (db.tk.status !== 'usable') return { ok: false, error_code: 'TICKET_NOT_USABLE' };
    if (a.p_op_key == null) { if (net() > 0) return { ok: true, already: true, remaining: db.tk.sessions_remaining }; }
    else {
      const m = /^(.*):e([0-9]+)$/.exec(a.p_op_key); const op = m && db.ops.find(x => x.slot === m[1] && x.epoch === +m[2] && x.ticket === a.p_ticket_id);
      if (!op) return { ok: false, error_code: 'UNKNOWN_OP' };
      const mk = '｜op:' + a.p_op_key;
      if (db.ledger.some(l => l.action === 'deduct' && l.delta === -1 && l.note.endsWith(mk))) return { ok: true, already: true, remaining: db.tk.sessions_remaining };
      if (op.rev !== db.rev || refunds() > op.refunds_at_begin) return { ok: false, error_code: 'STALE_OP' };
    }
    if (db.tk.sessions_remaining <= 0) return { ok: false, error_code: 'NO_REMAINING' };
    db.tk.sessions_remaining--;
    db.ledger.push({ action: 'deduct', delta: -1, note: (a.p_note || '預約扣課') + (a.p_op_key == null ? '' : '｜op:' + a.p_op_key) });
    return { ok: true, remaining: db.tk.sessions_remaining };
  };
  const env = {
    sb: { rpc: async (n, a) => {
      db.calls.push([n, a]);
      if (o.failBegin && n === 'fn_desk_op_begin') return { data: null, error: { message: '連線中斷' } };
      if (o.mutateBeforeBegin && n === 'fn_desk_op_begin' && !o.mutated) { o.mutated = true; bump(); }   // 登記請求在網路上時，名額被移除
      if (o.failKey && n === 'fn_desk_deduct_ticket' && a.p_op_key && a.p_op_key.startsWith(o.failKey) && !o.failDone) { o.failDone = true; return { data: null, error: { message: '連線中斷（整筆回滾，沒有寫入）' } }; }
      return { data: n === 'fn_desk_booking_rev' ? revRpc() : n === 'fn_desk_op_begin' ? begin(a) : deduct(a), error: null }; } },
    isDeskLike: () => true, tkNetDeductOn: async () => 0, logTicket: async () => {}, dbPut: async () => {}, dbCacheClear: () => {},
    dbFriendlyError: (e) => new Error(e.message), tkQuotaMsg: () => '', showToast: (m) => { db.toasts.push(m); }, activateTicketIfNeeded: async () => null,
  };
  const names = Object.keys(env);
  const fns = new Function(...names, grab('deductTicket') + '\n' + grab('tkDeductUnit') + '\n;return {deductTicket,tkDeductUnit};')(...names.map(k => env[k]));
  const refund = () => { db.ledger.push({ action: 'refund', delta: 1, note: '取消退課' }); db.tk.sessions_remaining++; };
  const beginOp = (slot, rev) => begin({ p_slot: slot, p_ticket_id: 'T1', p_expect_rev: rev == null ? db.rev : rev });
  return { db, fns, refund, net, beginOp, bump, tk: () => Object.assign({}, db.tk), refunds };
}

(async () => {
  console.log('═══ 前置：識別基底是從呼叫端原始碼抽出的 ═══');
  ok('三個算式都抽到了', E.gcr && E.st && E.fol, E);
  const keyGcr = (bk, mid, n) => new Function('bk', 'mid', '_okCnt', 'return ' + E.gcr)({ id: bk }, mid, { [mid]: n - 1 });
  const keySt = (b, ndur, k) => new Function('b', 'ndur', 'k', 'return ' + E.st)({ id: b }, ndur, k);
  const keyFol = (x, w, mine, added) => new Function('x', 'w', '_mine', 'addedSeats', 'return ' + E.fol)({ id: x }, { mid: w }, mine, added);
  ok('基底範例：gcr:B1:M1:2、st:B1:120:1、fol:B1:M1:2', keyGcr('B1', 'M1', 2) === 'gcr:B1:M1:2' && keySt('B1', 120, 0) === 'st:B1:120:1' && keyFol('B1', 'M1', 1, 0) === 'fol:B1:M1:2');

  console.log('═══ ① 自主訓練時長 120→60→120：第二次 120 要正確補扣 ═══');
  {
    const w = world(); await w.fns.deductTicket(w.tk(), 'B1', 'op');
    const a1 = await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keySt('B1', 120, 0));
    ok('120 分鐘：總共扣 2 點', a1 === true && w.net() === 2 && w.db.tk.sessions_remaining === 4, [a1, w.net()]);
    w.refund();
    const a2 = await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keySt('B1', 120, 0));
    ok('★★★ 縮短到 60 再延長到 120：正確補扣（淨 2 點、餘額 4）', a2 === true && w.net() === 2 && w.db.tk.sessions_remaining === 4, [a2, w.net(), w.db.tk.sessions_remaining]);
    ok('伺服器發了第 2 世代：st:B1:120:1:e1 與 :e2 各扣一筆', w.db.ledger.filter(l => /｜op:st:B1:120:1:e1$/.test(l.note)).length === 1 && w.db.ledger.filter(l => /｜op:st:B1:120:1:e2$/.test(l.note)).length === 1, w.db.ledger.map(l => l.note));
    const a3 = await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keySt('B1', 120, 0));
    ok('同一次操作重送：登記回傳同一把識別（e2）、不重扣', a3 === true && w.net() === 2 && w.db.ops.length === 2, [w.net(), w.db.ops.length]);
  }

  console.log('═══ ② 從未成功寫過帳的舊請求，退款後延遲到達：不得扣 ═══');
  {
    const w = world(); await w.fns.deductTicket(w.tk(), 'B1', 'op');
    // 使用者把時長 60→120：真實呼叫端的第一步（登記操作）已完成、伺服器已持久化 e1；扣課請求卻在網路上延遲
    const opKey = w.beginOp(keySt('B1', 120, 0)).op_key;
    w.refund();                                   // 這段時間使用者縮短時長，退款
    const rep = await w.fns.deductTicket(w.tk(), 'B1', 'op', { opKey });   // 延遲到達的舊請求
    ok('★★★ 退款之後才到的舊請求（從未寫過帳）被拒：不扣、淨 0、餘額沒被動', rep === false && w.net() === 0 && w.db.tk.sessions_remaining === 6, [rep, w.net(), w.db.tk.sessions_remaining, w.db.toasts]);
    ok('提示是「操作已過期（期間有退款）」', (w.db.toasts || []).some(t => /已過期/.test(t)), w.db.toasts);
    const fresh = await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keySt('B1', 120, 0));
    ok('新的合法操作（真實呼叫端）：登記新世代 e2 並扣成功', fresh === true && w.net() === 1 && w.db.ops.some(x => x.op_key === 'st:B1:120:1:e2'), [fresh, w.net(), w.db.ops.map(x => x.op_key)]);
  }

  console.log('═══ ③ 團課同名額：移除並退款後再加入要重新扣；舊世代重送不重扣 ═══');
  {
    const w = world(); const tk = () => w.tk();
    const k1 = keyFol('B1', 'M1', 0, 0), k2 = keyFol('B1', 'M1', 1, 0);
    await w.fns.tkDeductUnit(tk(), 'B1', 'op', k1); await w.fns.tkDeductUnit(tk(), 'B1', 'op', k2);
    ok('加入兩個名額：扣 2 堂', w.net() === 2 && w.db.tk.sessions_remaining === 4);
    w.refund();
    const re = await w.fns.tkDeductUnit(tk(), 'B1', 'op', k2);
    ok('★★★ 同名額再加入：重新扣堂（淨 2、餘額 4）', re === true && w.net() === 2 && w.db.tk.sessions_remaining === 4, [re, w.net()]);
    const rp = await w.fns.deductTicket(tk(), 'B1', 'op', { opKey: k2 + ':e1' });
    ok('★★★ 第一次加入（e1）已套用的舊請求延遲重送：回 already、不重扣', rp === true && w.net() === 2, [rp, w.net()]);
    await w.fns.tkDeductUnit(tk(), 'B1', 'op', k2);
    ok('同一次（再加入）操作重送：不重扣', w.net() === 2 && w.db.tk.sessions_remaining === 4);
  }

  console.log('═══ ④ 團課建立：整組重送仍三堂；第 2 堂失敗後重試恰好三堂 ═══');
  {
    const w = world({ rem: 8 }); const tk = () => w.tk(); const ks = [1, 2, 3].map(n => keyGcr('BK9', 'M1', n));
    for (const k of ks) await w.fns.tkDeductUnit(tk(), 'B1', 'op', k); for (const k of ks) await w.fns.tkDeductUnit(tk(), 'B1', 'op', k);
    ok('整組重送：仍是三堂', w.net() === 3 && w.db.tk.sessions_remaining === 5, [w.net()]);
  }
  {
    const w = world({ rem: 8, failKey: 'gcr:BK9:M1:2' }); const tk = () => w.tk(); const ks = [1, 2, 3].map(n => keyGcr('BK9', 'M1', n));
    let err = null; try { for (const k of ks) await w.fns.tkDeductUnit(tk(), 'B1', 'op', k); } catch (e) { err = e; }
    ok('第 2 堂失敗（注入）：只完成第 1 堂', !!err && w.net() === 1, [err && err.message, w.net()]);
    for (const k of ks) await w.fns.tkDeductUnit(tk(), 'B1', 'op', k);
    ok('★★★ 重試後合計恰好三堂（登記沿用同一把、第 1 堂不重扣）', w.net() === 3 && w.db.tk.sessions_remaining === 5, [w.net(), w.db.ops.length]);
  }

  console.log('═══ ④b 沒有退款帳也要作廢：名額移除／時長縮短（預約版本改變）═══');
  {
    const w = world({ rem: 8 });
    const opKey = w.beginOp(keyFol('B1', 'M1', 0, 0)).op_key;     // 名額登記完成、扣課請求還在路上
    w.bump();                                                      // 這時名額被移除（只改名單，沒有任何退款帳）
    const rep = await w.fns.deductTicket(w.tk(), 'B1', 'op', { opKey });
    ok('★★★ 移除名額後（無退款帳）延遲到達的扣課被拒：不扣、無退款帳', rep === false && w.net() === 0 && w.refunds() === 0 && (w.db.toasts || []).some(t => /已過期/.test(t)), [rep, w.net(), w.refunds(), w.db.toasts]);
    const oldRev = w.db.rev; w.bump();
    const lateBegin = w.beginOp(keyFol('B1', 'M1', 0, 0), 'r0');
    ok('★★★ 舊的登記請求（帶移除前版本）在移除後才到達：被拒（REV_MISMATCH），不產生新登記', lateBegin.ok === false && lateBegin.error_code === 'REV_MISMATCH' && w.db.ops.length === 1, [lateBegin, w.db.ops.length]);
    const fresh = await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keyFol('B1', 'M1', 0, 0));
    ok('新的合法操作（真實呼叫端重新讀版本）：登記新世代並扣成功', fresh === true && w.net() === 1 && w.db.ops.length === 2, [fresh, w.net(), w.db.ops.length]);
    void oldRev;
  }
  {
    const w = world({ rem: 8 });
    const k1 = w.beginOp(keySt('B1', 120, 0)).op_key;               // 60→120：額外 1 點，登記完成、尚未扣
    w.bump();                                                       // 使用者又把時長縮回 60（只改時長，沒有退款帳）
    const rep = await w.fns.deductTicket(w.tk(), 'B1', 'op', { opKey: k1 });
    ok('★★★ 時長縮短後，尚未成功扣除的額外點數被拒（無退款帳）', rep === false && w.net() === 0 && w.refunds() === 0, [rep, w.net()]);
    const w2 = world({ rem: 8, mutateBeforeBegin: true });          // 登記請求在網路上時時長被改
    const r2 = await w2.fns.tkDeductUnit(w2.tk(), 'B1', 'op', keySt('B1', 120, 0));
    ok('真實呼叫端：登記請求途中預約被更動 → 不扣、提示「剛被更動，請重新整理」', r2 === false && w2.net() === 0 && (w2.db.toasts || []).some(t => /剛被更動/.test(t)), [r2, w2.db.toasts]);
  }
  {
    const w = world({ rem: 8 });
    await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keyGcr('B1', 'M1', 1));
    w.bump();                                                       // 整個動作完成後預約被寫入名單
    const again = await w.fns.deductTicket(w.tk(), 'B1', 'op', { opKey: 'gcr:B1:M1:1:e1' });
    ok('已套用的操作，預約其後被更新：重送仍 already、不重扣（不因版本改變而誤判）', again === true && w.net() === 1, [again, w.net()]);
  }

  console.log('═══ ④c 內容改回原樣（A→B→A）：版本是單調計數，舊操作不復活 ═══');
  {
    const w = world({ rem: 8 });
    const rev0 = w.db.rev;
    const k = w.beginOp(keySt('B1', 120, 0)).op_key;      // 第一個 120 分鐘時登記，尚未扣
    w.bump(); w.bump();                                   // 120→60→120：內容回到原樣，期間沒有任何退款帳
    ok('前置：版本前進（不是回到原值），且沒有退款帳', w.db.rev !== rev0 && w.refunds() === 0, [rev0, w.db.rev]);
    const rep = await w.fns.deductTicket(w.tk(), 'B1', 'op', { opKey: k });
    ok('★★★ 舊的扣課請求此時才到達：被拒、不扣', rep === false && w.net() === 0 && (w.db.toasts || []).some(t => /已過期/.test(t)), [rep, w.net(), w.db.toasts]);
    const late = w.beginOp(keySt('B1', 120, 1), rev0);
    ok('★★★ 舊的登記請求（帶第一個 120 時的版本）此時才到達：被拒，不產生登記', late.ok === false && late.error_code === 'REV_MISMATCH' && w.db.ops.length === 1, [late, w.db.ops.length]);
    const fresh = await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keySt('B1', 120, 0));
    ok('新的合法操作（真實呼叫端重新讀版本）可登記並扣', fresh === true && w.net() === 1 && w.db.ops.length === 2, [fresh, w.net()]);
    const again = await w.fns.deductTicket(w.tk(), 'B1', 'op', { opKey: w.db.ops[1].op_key });
    ok('已成功的新操作重送：already，不重扣', again === true && w.net() === 1);
  }
  {
    const w = world({ rem: 8 });
    const rev0 = w.db.rev, k = w.beginOp(keyFol('B1', 'M1', 0, 0)).op_key;   // 名額登記、尚未扣
    w.bump(); w.bump();                                    // 名額移除、再加入，名單恢復原樣，沒有退款帳
    const rep = await w.fns.deductTicket(w.tk(), 'B1', 'op', { opKey: k });
    ok('★★★ 名額移除後再加入（內容恢復）：舊操作不復活', rep === false && w.net() === 0, [rep, w.net()]);
    ok('舊登記請求同樣被拒', w.beginOp(keyFol('B1', 'M1', 0, 0), rev0).error_code === 'REV_MISMATCH');
  }

  console.log('═══ ⑤ 取消之後、登記失敗：不扣 ═══');
  {
    const w = world(); w.db.booking.status = 'cancelled';
    const r = await w.fns.tkDeductUnit(w.tk(), 'B1', 'op', keyGcr('B1', 'M1', 1));
    ok('預約已取消：不登記、不扣、提示「已取消」', r === false && w.net() === 0 && w.db.ops.length === 0 && (w.db.toasts || []).some(t => /已取消/.test(t)), [r, w.db.toasts]);
    const w2 = world({ failBegin: true }); const r2 = await w2.fns.tkDeductUnit(w2.tk(), 'B1', 'op', keyGcr('B1', 'M1', 1));
    ok('登記失敗（連線）：不扣、提示請重試，沒有呼叫扣課', r2 === false && w2.net() === 0 && !w2.db.calls.some(c => c[0] === 'fn_desk_deduct_ticket'), [r2, w2.db.calls.map(c => c[0])]);
  }
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
