/* 團課取消單一名額走伺服器單一交易 fn_cancel_group_seat（2026-11-19；Codex 複審後補強重送保護）
   ⚠ 讀的是本 repo 的 index.html，執行真正的 doGroupCancelSeat／_doGroupCancelSeatRpc／_groupCancelSeat 原始碼。
   伺服器端是「有狀態的伪伺服器」，實作與資料庫函式相同的語意（預約版本、名額鍵依 member_ids 出現順序、移除後同會員名額遞補重編、依座位票退款、版本不符＝REV_MISMATCH），
   用來證明：連點、延遲送出、過期視窗、結果不明時，都只能取消「確認視窗當下指定的那一格」，不會取消遞補後的另一個名額。
   資料庫函式本身由 docs/testdb/grpcancel/grpcancel_tests.sql 在測試庫驗證。 */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
function grabFn(name) {
  let i = src.indexOf('async function ' + name + '('); if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k; for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
function grabConst(name) { const i = src.indexOf('const ' + name + '='); if (i < 0) throw new Error('找不到 ' + name); const j = src.indexOf('\n};', i); return src.slice(i, j + 3); }
const GCS = grabConst('GCS_MSG');

/* ── 伪伺服器：與 fn_cancel_group_seat／fn_group_seat_rev 同語意 ── */
function server(o) {
  o = o || {};
  const S = { rev: 1, ids: (o.ids || ['M', 'M']).slice(), tk: Object.assign({}, o.tk || { 'M': 'A', 'M#2': 'B' }), bal: Object.assign({ A: 5, B: 5 }, o.bal || {}), refunds: [], status: 'booked', calls: [], gate: null };
  const keys = (ids) => { const c = {}; return ids.map(m => { c[m] = (c[m] || 0) + 1; return c[m] > 1 ? m + '#' + c[m] : m; }); };
  S.keys = () => keys(S.ids);
  S.snapshot = () => ({ id: 'B1', category: '小班肌力', date: '2026-12-01', start_time: '19:00', member_ids: S.ids.slice(), seat_tickets: Object.assign({}, S.tk) });
  S.removeSeat = (sk, refund) => {                                       // 與資料庫函式相同：依位置移除、同會員剩下的名額往前遞補
    const ks = keys(S.ids), i = ks.indexOf(sk); if (i < 0) return null;
    const tks = ks.map(k => S.tk[k]); const tkRemoved = tks[i]; tks.splice(i, 1); S.ids.splice(i, 1);
    const nk = keys(S.ids); S.tk = {}; nk.forEach((k, j) => { if (tks[j]) S.tk[k] = tks[j]; });
    if (refund && tkRemoved) { S.bal[tkRemoved]++; S.refunds.push(tkRemoved); }
    S.rev++; return tkRemoved;
  };
  S.rpc = async (n, a) => {
    S.calls.push([n, a]);
    if (n === 'fn_group_seat_rev') return { data: { ok: true, rev: String(S.rev) }, error: null };
    if (n === 'fn_cancel_group_seat') {
      if (o.dropRequest && !S.dropped) { S.dropped = true; return { data: null, error: { message: 'network down' } }; }   // 請求沒送到：伺服器完全沒動
      if (S.gate) await S.gate;
      let res;
      if (String(a.p_expect_rev) !== String(S.rev)) res = { ok: false, error_code: 'REV_MISMATCH' };
      else if (S.keys().indexOf(a.p_seat_key) < 0) res = { ok: false, error_code: 'NO_SEAT' };
      else { const t = S.removeSeat(a.p_seat_key, true); res = { ok: true, outcome: 'refunded', ticket_id: t, refunded: 1 }; }
      if (o.loseResponse && !S.lost) { S.lost = true; return { data: null, error: { message: 'response lost' } }; }   // 伺服器做了，但回應沒到
      return { data: res, error: null };
    }
    throw new Error('未預期的 RPC ' + n);
  };
  return S;
}
function make(S, o) {
  o = o || {};
  const log = { puts: [], refunds: [], logs: [], toasts: [], opens: 0, modals: [], cleared: 0 };
  const win = {};
  const env = {
    window: win, CLOUD: o.cloud !== false, sb: o.cloud === false ? null : { rpc: S.rpc },
    dbGet: async (t, id) => { if (t === 'bookings') { if (o.bumpOnRead) { S.rev++; if (o.bumpOnRead === 'once') o.bumpOnRead = false; } return S.snapshot(); } if (t === 'members') return { id, name: '王小明' }; if (t === 'member_tickets') return { id, plan_name: '票' + id }; return null; },
    dbPut: async (t, x) => { log.puts.push([t, x]); }, refundTicket: async (t, b) => { log.refunds.push([t, b]); return true; }, logTicket: async (...a) => { log.logs.push(a); },
    dbCacheClear: () => { log.cleared++; }, closeModal: () => {}, showModal: (h) => { log.modals.push(String(h)); }, openBookingDetail: () => { log.opens++; },
    showToast: (m) => { log.toasts.push(String(m)); }, hoursUntilStart: () => 200,
    seatTicketOf: async (b, k) => { const id = b.seat_tickets && b.seat_tickets[k]; return id ? { id, plan_name: '票' + id } : null; }, tkIsMakeup: () => false, tkChip: () => '', escH: (x) => String(x),
    seatMid: (k) => String(k).split('#')[0], seatNo: (k) => (String(k).includes('#') ? Number(String(k).split('#')[1]) : 1), console: { log() {}, warn() {}, error() {} },
  };
  const scope = new Proxy({}, { has: () => true, get: (_t, k) => { if (k === Symbol.unscopables) return undefined; if (k in env) return env[k]; if (typeof k === 'string' && k in globalThis) return globalThis[k]; return undefined; } });
  const mk = (code, name) => new Function('scope', 'with(scope){ ' + code + '; return ' + name + '; }')(scope);
  const api = { log, win,
    doCancel: mk(GCS + '\n' + grabFn('_doGroupCancelSeatRpc') + '\n' + grabFn('doGroupCancelSeat'), 'doGroupCancelSeat'),
    open: mk(GCS + '\n' + grabFn('_groupCancelSeat'), '_groupCancelSeat') };
  // 開確認視窗並取得「按鈕上寫的」操作上下文 id（與畫面上實際會送出的完全一樣）
  api.openAndCtx = async (bid, sk) => { const before = log.modals.length; await api.open(bid, sk); if (log.modals.length === before) return null; const m = log.modals[log.modals.length - 1].match(/doGroupCancelSeat\('([^']*)','([^']*)','([^']*)'\)/); return m ? { bid: m[1], sk: m[2], id: m[3], html: log.modals[log.modals.length - 1] } : null; };
  return api;
}
const cancels = (S) => S.calls.filter(c => c[0] === 'fn_cancel_group_seat');
const revReads = (S) => S.calls.filter(c => c[0] === 'fn_group_seat_rev');
const noFrontWrites = (m) => m.log.puts.length === 0 && m.log.refunds.length === 0 && m.log.logs.length === 0;

(async () => {
  console.log('═══ ① 同會員兩個名額：快速連點第 2 個名額的「確定取消」═══');
  let S = server(), m = make(S);
  let c = await m.openAndCtx('B1', 'M#2');
  ok('確認視窗按鈕帶操作上下文（預約、名額鍵、視窗 id），且視窗顯示會員、第 2 個名額、這個名額的票券（同一份資料）', c && c.bid === 'B1' && c.sk === 'M#2' && /^gcs\d+$/.test(c.id) && /王小明/.test(c.html) && /第 2 個/.test(c.html) && /票B/.test(c.html), c && c.html.slice(0, 200));
  const p1 = m.doCancel(c.bid, c.sk, c.id), p2 = m.doCancel(c.bid, c.sk, c.id), p3 = m.doCancel(c.bid, c.sk, c.id); await Promise.all([p1, p2, p3]);
  ok('★★★ 連點 3 下只送出 1 次取消（執行中防連點），帶的是開窗當下的名額鍵與版本', cancels(S).length === 1 && cancels(S)[0][1].p_seat_key === 'M#2' && cancels(S)[0][1].p_expect_rev === '1', cancels(S));
  ok('★★★ 結果：只取消了第 2 個名額（票B 退 1 堂）；第 1 個名額與票A 原封不動；沒有取消遞補後的名額', JSON.stringify(S.ids) === '["M"]' && S.tk.M === 'A' && S.bal.A === 5 && S.bal.B === 6 && S.refunds.join() === 'B', { ids: S.ids, tk: S.tk, bal: S.bal });
  ok('前端沒有任何其他寫入（沒有 dbPut／refundTicket／logTicket）', noFrontWrites(m));

  console.log('═══ ② 第一筆完成後，第二筆延遲送出 ═══');
  const before = S.calls.length; await m.doCancel(c.bid, c.sk, c.id);
  ok('★★★ 延遲的第二次按下被擋（這個視窗已用過）：完全沒有送出任何請求，也沒有取消遞補後的名額', S.calls.length === before && JSON.stringify(S.ids) === '["M"]' && S.tk.M === 'A' && S.bal.A === 5 && m.log.toasts.some(t => /已經用過了/.test(t)), { calls: S.calls.length - before, ids: S.ids });
  // 另一個視窗（開在第 1 個名額、同一個舊版本）也在第一筆之前開好：第一筆完成後才按
  S = server(); m = make(S); const cA = await m.openAndCtx('B1', 'M#2'), cB = await m.openAndCtx('B1', 'M');
  await m.doCancel(cA.bid, cA.sk, cA.id); const readsBefore = revReads(S).length; await m.doCancel(cB.bid, cB.sk, cB.id);
  ok('★★★ 開在舊版本的另一個視窗（第 1 個名額）：伺服器以 REV_MISMATCH 擋下，第 1 個名額與票A 不動；送出時沒有重讀版本', JSON.stringify(S.ids) === '["M"]' && S.tk.M === 'A' && S.bal.A === 5 && cancels(S).length === 2 && cancels(S)[1][1].p_expect_rev === '1' && revReads(S).length === readsBefore && m.log.toasts.some(t => /名單剛剛有變動/.test(t)), { calls: cancels(S), ids: S.ids });

  console.log('═══ ③ 版本讀取失敗／缺少確認上下文：停止並要求重新開啟，不在送出時自動讀最新版本 ═══');
  S = server(); S.rpc0 = S.rpc; S.rpc = async (n, a) => (n === 'fn_group_seat_rev' ? { data: { ok: false, error_code: 'FORBIDDEN' }, error: null } : S.rpc0(n, a)); m = make(S);
  c = await m.openAndCtx('B1', 'M#2');
  ok('開窗時讀不到版本：不開確認視窗、提示沒有更動', c === null && m.log.modals.length === 0 && m.log.toasts.some(t => /沒有/.test(t)), m.log.toasts);
  S = server(); m = make(S); const n0 = S.calls.length; await m.doCancel('B1', 'M#2', undefined); await m.doCancel('B1', 'M#2', 'gcs999');
  ok('★★★ 沒有上下文（直接呼叫／不存在的視窗 id）：不送出任何請求、也不去讀最新版本，提示重新開啟', S.calls.length === n0 && m.log.toasts.filter(t => /已失效.*重新開啟/.test(t)).length === 2, { calls: S.calls.length, toasts: m.log.toasts });
  m.win._gcsCtx = { gcsX: { bid: 'B1', sk: 'M#2', mid: 'M', rev: null, state: 'norev' } }; await m.doCancel('B1', 'M#2', 'gcsX');
  ok('★★★ 上下文裡版本是空的：不送出、不自動讀版本，提示重新開啟', S.calls.length === n0 && m.log.toasts.some(t => /沒有讀到預約版本.*重新開啟/.test(t)), m.log.toasts);
  { const S2 = server(), m2 = make(S2, { cloud: false }); await m2.doCancel('B1', 'M#2', 'x'); ok('沒有雲端連線（本機 demo／測試替身）才走舊邏輯：不呼叫任何 RPC', S2.calls.length === 0); }

  console.log('═══ ④ 過期的確認視窗（開窗之後名單被別的操作改了）═══');
  S = server(); m = make(S); c = await m.openAndCtx('B1', 'M#2');
  S.removeSeat('M', true);   // 別的操作取消了第 1 個名額 → 原本的第 2 個名額遞補成 M、票B 跟著搬、版本前進
  const revReadsBefore = revReads(S).length, balB = S.bal.B; await m.doCancel(c.bid, c.sk, c.id);
  ok('★★★ 過期視窗按下去：伺服器 REV_MISMATCH；遞補成 M 的那個名額（原第 2 個）沒有被取消、票B 沒有被多退；送出時沒有重讀版本來「刷新」', JSON.stringify(S.ids) === '["M"]' && S.tk.M === 'B' && S.bal.B === balB && cancels(S).length === 1 && cancels(S)[0][1].p_expect_rev === '1' && revReads(S).length === revReadsBefore && m.log.toasts.some(t => /名單剛剛有變動/.test(t)), { ids: S.ids, tk: S.tk, bal: S.bal });
  S = server(); m = make(S); await m.open('B1', 'M#2'); S.removeSeat('M#2', true); const b4 = S.calls.length; const miss = await m.openAndCtx('B1', 'M#2');
  ok('名額已被取消後再開確認視窗：不開視窗、提示「名額已不在名單中」', miss === null && m.log.toasts.some(t => /已不在名單中/.test(t)), m.log.toasts);

  console.log('═══ ⑤ 網路結果不明：保留原版本、先查明、不換版本重送 ═══');
  S = server({ loseResponse: true }); m = make(S); c = await m.openAndCtx('B1', 'M#2'); await m.doCancel(c.bid, c.sk, c.id);
  ok('回應遺失但伺服器其實已取消：提示「不確定」、重新整理；查明時版本已變 → 不重送', cancels(S).length === 1 && m.log.toasts.some(t => /不確定這次取消有沒有完成/.test(t)) && m.log.opens >= 1 && JSON.stringify(S.ids) === '["M"]' && S.bal.B === 6, { n: cancels(S).length, toasts: m.log.toasts });
  const k0 = S.calls.length; await m.doCancel(c.bid, c.sk, c.id);
  ok('★★★ 之後再按：完全不送出（狀態 unknown）；名單只被取消過一次，第 1 個名額仍在', S.calls.length === k0 && JSON.stringify(S.ids) === '["M"]' && S.tk.M === 'A' && S.bal.A === 5 && S.bal.B === 6 && m.log.toasts.some(t => /結果還不確定.*沒有再送出/.test(t)), { ids: S.ids, bal: S.bal });
  S = server({ dropRequest: true }); m = make(S); c = await m.openAndCtx('B1', 'M#2'); await m.doCancel(c.bid, c.sk, c.id);
  ok('請求根本沒送到：查明時版本沒變 → 回到可再按（提示「沒有送達」），伺服器沒有任何變動', cancels(S).length === 1 && m.log.toasts.some(t => /沒有送達.*再按一次/.test(t)) && JSON.stringify(S.ids) === '["M","M"]' && S.bal.B === 5, { n: cancels(S).length, ids: S.ids, toasts: m.log.toasts });
  await m.doCancel(c.bid, c.sk, c.id);
  ok('★★★ 再按一次：用的是「原本的版本」與原名額鍵（不是重新讀的），成功且只取消第 2 個名額', cancels(S).length === 2 && cancels(S)[1][1].p_expect_rev === '1' && cancels(S)[1][1].p_seat_key === 'M#2' && JSON.stringify(S.ids) === '["M"]' && S.tk.M === 'A' && S.bal.B === 6 && S.bal.A === 5, { calls: cancels(S), ids: S.ids });
  S = server(); let thrown = 0; S.rpc1 = S.rpc; S.rpc = async (n, a) => { if (n === 'fn_cancel_group_seat') { thrown++; throw new Error('boom'); } return S.rpc1(n, a); }; m = make(S); c = await m.openAndCtx('B1', 'M#2'); await m.doCancel(c.bid, c.sk, c.id);
  ok('例外（丟出錯誤）：當成結果不明處理；版本沒變→可再按，不自動重送（只丟出 1 次）', thrown === 1 && m.log.toasts.some(t => /沒有送達/.test(t)) && noFrontWrites(m) && JSON.stringify(S.ids) === '["M","M"]', { thrown, toasts: m.log.toasts });

  console.log('═══ ⑥ 執行中防連點（伺服器還沒回應時）═══');
  S = server(); let release; S.gate = new Promise(r => { release = r; }); m = make(S); c = await m.openAndCtx('B1', 'M#2');
  const f1 = m.doCancel(c.bid, c.sk, c.id); await Promise.resolve(); await m.doCancel(c.bid, c.sk, c.id); await m.doCancel(c.bid, c.sk, c.id);
  ok('★★★ 第一次還在等伺服器時，後面的點擊都不送出（只有 1 次取消請求在路上）', cancels(S).length === 1, cancels(S).length);
  release(); await f1;
  ok('放行後只完成 1 次取消、只取消第 2 個名額', cancels(S).length === 1 && JSON.stringify(S.ids) === '["M"]' && S.tk.M === 'A' && S.bal.B === 6);

  console.log('═══ ⑦ 開窗時「版本—名單—版本」夾擊：顯示與版本必須是同一份資料 ═══');
  S = server(); m = make(S, { bumpOnRead: 'once' }); c = await m.openAndCtx('B1', 'M#2');
  ok('名單讀取當下版本被改了一次：重試後採用夾擊一致的那一組（版本＝重試時的版本）', c && m.win._gcsCtx[c.id].rev === String(S.rev) && revReads(S).length === 4, { rev: m.win._gcsCtx[c.id] && m.win._gcsCtx[c.id].rev, now: S.rev, reads: revReads(S).length });
  S = server(); m = make(S, { bumpOnRead: true }); c = await m.openAndCtx('B1', 'M#2');
  ok('★★ 每次讀名單版本都在變（一直對不上）：連試 3 次後不開視窗、提示稍後再按、沒有任何更動，也不拿任一份去賭', c === null && m.log.modals.length === 0 && m.log.toasts.some(t => /名單正在變動/.test(t)) && cancels(S).length === 0 && revReads(S).length === 6, { reads: revReads(S).length, toasts: m.log.toasts });
  S = server(); m = make(S); c = await m.openAndCtx('B1', 'M#2');
  ok('穩定時：上下文版本 ＝ 夾擊的兩次讀值；上下文記下名額鍵與票券', m.win._gcsCtx[c.id].rev === '1' && m.win._gcsCtx[c.id].sk === 'M#2' && m.win._gcsCtx[c.id].ticketId === 'B' && m.win._gcsCtx[c.id].state === 'ready' && revReads(S).length === 2);
  { const S2 = server(), m2 = make(S2); const a = await m2.openAndCtx('B1', 'M'), b = await m2.openAndCtx('B1', 'M#2'); ok('每個確認視窗各有獨立的上下文 id（舊視窗不會被新視窗刷新）', a.id !== b.id && m2.win._gcsCtx[a.id] && m2.win._gcsCtx[b.id]); }

  console.log('═══ ⑧ 原始碼層面的護欄 ═══');
  const body = grabFn('_doGroupCancelSeatRpc');
  ok('★★★ 取消請求用的版本一律是 ctx.rev；原始碼裡沒有 delete window._gcsCtx（上下文不會被用掉就消失）', /p_expect_rev:ctx\.rev/.test(body) && !/delete window\._gcsCtx/.test(body));
  const sendIdx = body.indexOf("sb.rpc('fn_cancel_group_seat'"), readIdx = body.indexOf("sb.rpc('fn_group_seat_rev'");
  ok('★★★ 版本只在「結果不明、查明結果」時才讀（出現在取消請求之前的是 unsure 函式定義，而且它只比對、不拿來送出）', readIdx > 0 && /const unsure=async\(\)=>\{[\s\S]*fn_group_seat_rev[\s\S]*\};/.test(body) && (body.match(/p_expect_rev/g) || []).length === 1);
  ok('沒有 dbPut／refundTicket／logTicket／sessions_remaining', !/dbPut\(|refundTicket\(|logTicket\(|sessions_remaining/.test(body));
  ok('取消請求只有一個呼叫點（沒有迴圈、沒有自動重試）', (body.match(/sb\.rpc\('fn_cancel_group_seat'/g) || []).length === 1 && !/for\s*\(|while\s*\(/.test(body));
  ok('doGroupCancelSeat 在雲端時分流並把 ctxId 帶下去', /async function doGroupCancelSeat\(bid,seatKey,ctxId\)\{[\s\S]{0,500}if\(CLOUD && sb\) return _doGroupCancelSeatRpc\(bid,seatKey,ctxId\);/.test(grabFn('doGroupCancelSeat')));

  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
