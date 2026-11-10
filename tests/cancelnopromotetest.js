/* Phase 5A／5A.1（2026-11-10，業務規則 B）：取消後不再自動把退回的額度補給分期保留預約

   規則：
   ・取消課程仍依原有規則退票。
   ・取消成功後，不再呼叫 promoteHeldBooking——**不靠旗標**（5A 曾用 FEATURE_FLAGS.cancelPromoteHeld，
     旗標可被前端覆寫，5A.1 已整個移除；函式本體保留、全檔沒有任何呼叫點）。
   ・收款開通後的 bindHeldBookings 維持不變。
   ・不更動會員已存在的分期保留資料。
   ・要恢復自動補扣必須改程式並重新通過測試，不能只切換設定——所以這裡**沒有**「打開旗標就恢復」的測試。

   ⚠ 這支測試**明確指向本檔所在 repo 的 index.html**（__dirname/..），
     不是 $HOME/Projects/yugym-booking-system-app（原專案）——
     其他舊測試讀的是寫死的 $HOME 路徑，在 worktree 裡直接跑會驗到原專案的檔案。
   ⚠ 行為測試是把真正的 cancelBooking／bindHeldBookings 原始碼抽出來**實際執行**，
     資料層（dbGet／dbPut／refundTicket…）用記憶體假資料；不連任何資料庫。
   ⚠ 不驗「兩個分頁同時操作」的真實並行——那需要資料庫層鎖，這裡模擬不出來。
   ⚠ 這份是移植到「正式版基準（origin/master 7c72289）」的版本：預期值已對照**基準實際的 cancelBooking 行為**
     調整（基準是先寫預約再退票、沒有「已取消過」提前返回、退票失敗不標 refund_waived），
     不是照整合分支（sync）的行為。 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC_PATH = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(SRC_PATH, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));

function grabFn(name) {
  let i = src.indexOf('async function ' + name + '(');
  if (i < 0) i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
// 把原始碼放進「以 env 為範圍」的環境執行：env 沒有、全域也沒有的名字，一律當成「不做事」的函式
function instantiate(code, env, unknownLog) {
  const scope = new Proxy({}, {
    has: () => true,
    get: (_t, key) => {
      if (key === Symbol.unscopables) return undefined;
      if (key in env) return env[key];
      if (key in globalThis) return globalThis[key];
      return (...a) => { if (unknownLog) unknownLog.push(String(key)); return undefined; };
    },
    set: (_t, key, val) => { env[key] = val; return true; }
  });
  return new Function('scope', 'with(scope){ return (' + code + '); }')(scope);
}

// ── ① 旗標與呼叫位置（靜態）──
console.log('\n═══ ① 呼叫點（靜態）：全檔沒有任何 promoteHeldBooking 呼叫，也沒有旗標 ═══');
{
  const m = src.match(/window\.FEATURE_FLAGS = Object\.assign\(\{[\s\S]*?\}, window\.FEATURE_FLAGS\|\|\{\}\);/);
  ok('找得到 FEATURE_FLAGS 預設區塊', !!m);
  let flags = null;
  try { flags = new Function('window', m[0] + '; return window.FEATURE_FLAGS;')({}); } catch (e) { flags = { _err: String(e) }; }
  ok('★★★ 不再有 cancelPromoteHeld 旗標（行為不由可覆寫的設定控制）', flags && !('cancelPromoteHeld' in flags), flags);
  ok('　　其他旗標維持原值（createBookingRpc／cancelBookingRpc／checkinBookingRpc 皆 true）',
     flags && flags.createBookingRpc === true && flags.cancelBookingRpc === true && flags.checkinBookingRpc === true, flags);
  ok('★★★ 全檔不含 cancelPromoteHeld 這個名字', !/cancelPromoteHeld/.test(src));
  const defs = src.match(/promoteHeldBooking\s*\(/g) || [];
  ok('★★★ 全檔 promoteHeldBooking( 只出現一次，就是函式定義本身（沒有任何呼叫點）', defs.length === 1 && /async function promoteHeldBooking\(memberId, ticketId\)\{/.test(src), defs.length);
  ok('★★★ 沒有 await／傳參考／字串索引等間接呼叫',
     !/await promoteHeldBooking/.test(src) && !/=\s*promoteHeldBooking\b/.test(src) && !/\[\s*['"]promoteHeldBooking['"]\s*\]/.test(src) && !/window\.promoteHeldBooking/.test(src));
  ok('★★ promoteHeldBooking 函式本體保留（只停呼叫，不刪函式）', /async function promoteHeldBooking\(memberId, ticketId\)\{/.test(src));
  const CB = grabFn('cancelBooking');
  const CBcode = CB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok('★★★ cancelBooking 的程式碼（去掉註解）不含 promoteHeldBooking', !/promoteHeldBooking/.test(CBcode));
  const seq = ["b.status='cancelled';", "await dbPut('bookings',b);", 'await revokeRewardOnCancel(b)', 'await revokeMakeupOnCancel(b)', 'showToast(`已取消預約，退回'];
  const ps = seq.map(s => CB.indexOf(s));
  ok('★★ 取消流程順序不變：狀態→寫入→收回贈點→收回補課券→提示', ps.every(p => p >= 0) && ps.every((p, i) => i === 0 || p > ps[i - 1]), ps);
  ok('★★ 退票邏輯沒被動到（refundTicket 呼叫與 refundedCount 賦值都還在）',
     /refundedCount=\(await refundTicket\(b\.ticket_id,b\.id,SESSION\.id\)\)\?1:0;/.test(CB));
  ok('★★★ 收款開通後仍會呼叫 bindHeldBookings（_confirmInstallNext 沒被動到）',
     /try\{ bound=await bindHeldBookings\(t\.id, n\); \}/.test(src));
}

// ── 行為測試的資料夾具與環境 ──
const NOTE = '分期待繳費保留（收款後自動補扣）';
function makeEnv(o) {
  o = Object.assign({ legacyFlag: false, refundOk: true, net: 1, putFailsOn: null, role: 'front_desk', rpc: null, bookings: [], tickets: [] }, o || {});
  const log = { toasts: [], puts: [], refunds: [], promotes: [], deducts: [], rpcs: [], modals: [], navs: 0, unknown: [] };
  const tables = { bookings: {}, member_tickets: {} };
  o.bookings.forEach(b => { tables.bookings[b.id] = clone(b); });
  o.tickets.forEach(t => { tables.member_tickets[t.id] = clone(t); });
  const flags = { createBookingRpc: true, cancelBookingRpc: true, checkinBookingRpc: true };
  if (o.legacyFlag) flags.cancelPromoteHeld = true;   // 模擬有人在前端硬塞舊的 5A 旗標：5A.1 之後它必須完全沒有作用
  const env = {
    window: { FEATURE_FLAGS: flags }, FEATURE_FLAGS: flags, CLOUD: !!o.rpc,
    sb: o.rpc ? { rpc: async (name, args) => { log.rpcs.push([name, args]); return o.rpc(name, args); } } : null,
    cancelTooLateModal: () => { log.modals.push('too_late'); }, cancelDeskOnlyModal: () => { log.modals.push('desk_only'); },
    SESSION: { id: 'E1', role: o.role }, CUR_PAGE: 'calendar',
    TODAY: new Date('2026-11-10T00:00:00'), ymd: d => d.toISOString().slice(0, 10),
    BK_NOTE_SEP: '｜備註：',
    console: { log: console.log, warn: () => {}, error: () => {} },
    dbGet: async (s, id) => (tables[s] && tables[s][id]) ? clone(tables[s][id]) : null,
    dbGetAll: async s => Object.values(tables[s] || {}).map(clone),
    dbPut: async (s, obj) => {
      if (o.putFailsOn === s) throw new Error('write failed');
      log.puts.push({ store: s, obj: clone(obj) });
      if (tables[s]) tables[s][obj.id] = clone(obj);
      return obj;
    },
    bkIsGroup: () => false, hoursUntilStart: () => 200,
    bkNetDeductDB: async () => o.net, bkWasDeducted: async () => true,
    refundTicket: async (tid, bid, op) => { log.refunds.push([tid, bid, op]); return o.refundOk; },
    logTicket: async () => {}, revokeRewardOnCancel: async () => ({}), revokeMakeupOnCancel: async () => 0,   // RPC 成功路徑會讀 _rv.removed，所以回傳物件
    rewardToastText: () => '', showToast: m => { log.toasts.push(String(m)); },
    closeModal: () => {}, navTo: () => { log.navs++; }, dbCacheClear: () => {},
    promoteHeldBooking: async (m, t) => { log.promotes.push([m, t]); },
    bkTicketTypeOk: (t, type) => t.ticket_type_id === type,
    deductTicket: async (tk, bid) => { log.deducts.push([tk.id, bid]); return true; },
  };
  return { env, log, tables };
}
const instReal = (name, env, log) => instantiate(grabFn(name), env, log.unknown);

const TK = { id: 'TK-A', member_id: 'M1', ticket_type_id: 'TT-A', category: '私人教練', status: 'usable',
             sessions_total: 12, sessions_remaining: 4, unlocked_sessions: 8, installment: { count: 3, current: 2, paid: [true, true, false] } };
const target = () => ({ id: 'BK-C', member_id: 'M1', ticket_id: 'TK-A', ticket_type_id: 'TT-A', category: '私人教練',
                        date: '2026-11-20', start_time: '10:00', duration: 60, status: 'booked', pending_contract: false });
const hold = (id, date, note) => ({ id, member_id: 'M1', ticket_id: null, ticket_type_id: 'TT-A', category: '私人教練',
                                    date, start_time: '11:00', duration: 60, status: 'booked', pending_contract: true, note: note === undefined ? NOTE : note });
const holdUntouched = (tables, id, note) => {
  const h = tables.bookings[id];
  return !!h && h.note === (note === undefined ? NOTE : note) && h.pending_contract === true && h.ticket_id === null && h.status === 'booked';
};

(async () => {
  console.log('\n═══ ② 取消成功＋退票成功：不觸發 promoteHeldBooking（執行真正的 cancelBooking）═══');
  {
    const { env, log, tables } = makeEnv({ bookings: [target(), hold('BK-H1', '2026-11-27'), hold('BK-H2', '2026-12-04')], tickets: [TK] });
    const cancelBooking = instReal('cancelBooking', env, log);
    let err = null; try { await cancelBooking('BK-C', 'force', {}); } catch (e) { err = e; }
    ok('（確認夾具真的跑完取消流程）沒有拋例外', err === null, err && String(err));
    const written = log.puts.filter(p => p.store === 'bookings').map(p => p.obj);
    ok('預約狀態更新為 cancelled，且只寫了這一筆', written.length === 1 && written[0].id === 'BK-C' && written[0].status === 'cancelled', written.map(w => [w.id, w.status]));
    ok('票券照常退回（refundTicket 1 次，對象是這堂的票與預約）', log.refunds.length === 1 && log.refunds[0][0] === 'TK-A' && log.refunds[0][1] === 'BK-C', log.refunds);
    ok('★★★ promoteHeldBooking 沒被呼叫', log.promotes.length === 0, log.promotes);
    ok('★★★ 兩張分期保留預約維持原狀（沒被寫入；備註、旗標、ticket_id 都沒變）',
       !log.puts.some(p => p.obj.id === 'BK-H1' || p.obj.id === 'BK-H2') && holdUntouched(tables, 'BK-H1') && holdUntouched(tables, 'BK-H2'));
    ok('提示「已取消預約，退回 1 堂票券」並重繪畫面', log.toasts.some(t => /已取消預約，退回 1 堂票券/.test(t)) && log.navs === 1, [log.toasts, log.navs]);
    ok('取消流程沒有任何對 member_tickets 的直接寫入（退票只走 refundTicket）', !log.puts.some(p => p.store === 'member_tickets'));
    ok('夾具沒有漏掉未知的全域函式呼叫（只允許不影響結果的）', log.unknown.every(n => ['dbCacheClear'].includes(n)), log.unknown);
  }

  console.log('\n═══ ③ 退票失敗：照常取消，不觸發 promoteHeldBooking ═══');
  {
    const { env, log, tables } = makeEnv({ bookings: [target(), hold('BK-H1', '2026-11-27')], tickets: [TK], refundOk: false });
    const cancelBooking = instReal('cancelBooking', env, log);
    let err = null; try { await cancelBooking('BK-C', 'force', {}); } catch (e) { err = e; }
    const w = log.puts.filter(p => p.store === 'bookings').map(p => p.obj)[0] || {};
    ok('沒有拋例外', err === null, err && String(err));
    ok('預約仍被取消；基準在 doRefund 為真時 refund_waived 為 false（基準行為，與本修改無關）', w.status === 'cancelled' && w.refund_waived === false, w);
    ok('確實嘗試過退票（refundTicket 1 次，回傳 false）', log.refunds.length === 1, log.refunds);
    ok('★★★ promoteHeldBooking 沒被呼叫', log.promotes.length === 0);
    ok('分期保留預約維持原狀', holdUntouched(tables, 'BK-H1'));
    ok('提示不是「退回 1 堂票券」', !log.toasts.some(t => /退回 1 堂票券/.test(t)), log.toasts);
  }

  console.log('\n═══ ④ 取消失敗：不觸發 promoteHeldBooking ═══');
  {
    let r = makeEnv({ bookings: [hold('BK-H1', '2026-11-27')], tickets: [TK] });
    await instReal('cancelBooking', r.env, r.log)('BK-NOPE', 'force', {});
    ok('預約不存在 → 直接返回、沒有遞補、沒有任何寫入', r.log.promotes.length === 0 && r.log.puts.length === 0 && r.log.refunds.length === 0);

    r = makeEnv({ bookings: [Object.assign(target(), { status: 'cancelled' }), hold('BK-H1', '2026-11-27')], tickets: [TK] });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'force', {});
    ok('已經取消過 → 沒有遞補（基準沒有「已取消過」提前返回，會再走一次流程；那是基準既有行為，不是本修改造成）', r.log.promotes.length === 0, r.log.promotes);

    r = makeEnv({ bookings: [target(), hold('BK-H1', '2026-11-27')], tickets: [TK], putFailsOn: 'bookings' });
    let err = null; try { await instReal('cancelBooking', r.env, r.log)('BK-C', 'force', {}); } catch (e) { err = e; }
    ok('寫入預約失敗（拋例外）→ 沒有遞補', err !== null && r.log.promotes.length === 0, err && String(err));
    ok('　　分期保留預約維持原狀', holdUntouched(r.tables, 'BK-H1'));
  }

  console.log('\n═══ ⑤ 一般會員取消課程不受影響 ═══');
  {
    // 會員身分（無分期保留的人）取消有票的課：照常退票、照常取消
    let r = makeEnv({ role: 'member', bookings: [Object.assign(target(), { member_id: 'M9', ticket_id: 'TK-N' })],
                      tickets: [{ id: 'TK-N', member_id: 'M9', ticket_type_id: 'TT-A', category: '私人教練', status: 'usable', sessions_total: 10, sessions_remaining: 3 }] });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'force', {});
    const w = r.log.puts.filter(p => p.store === 'bookings').map(p => p.obj)[0] || {};
    ok('會員取消：狀態 cancelled、退票 1 次、沒有遞補', w.status === 'cancelled' && r.log.refunds.length === 1 && r.log.promotes.length === 0, [w.status, r.log.refunds.length, r.log.promotes.length]);
    ok('　　提示與重繪照舊', r.log.toasts.some(t => /退回 1 堂票券/.test(t)) && r.log.navs === 1, r.log.toasts);

    // 沒綁票的課：沒有退票，也沒有遞補
    r = makeEnv({ bookings: [Object.assign(target(), { ticket_id: null })], tickets: [TK] });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'auto', {});
    const w2 = r.log.puts.filter(p => p.store === 'bookings').map(p => p.obj)[0] || {};
    ok('沒綁票的課：照常取消、沒有退票、沒有遞補', w2.status === 'cancelled' && r.log.refunds.length === 0 && r.log.promotes.length === 0, [w2.status, r.log.refunds, r.log.promotes]);
  }

  console.log('\n═══ ⑥ 分期保留預約自己被取消：只動這一筆，不遞補其他保留 ═══');
  {
    const r = makeEnv({ bookings: [hold('BK-H1', '2026-11-27'), hold('BK-H2', '2026-12-04')], tickets: [TK] });
    await instReal('cancelBooking', r.env, r.log)('BK-H1', 'auto', {});
    const ids = r.log.puts.filter(p => p.store === 'bookings').map(p => p.obj.id);
    ok('只寫了被取消的那一筆；沒有退票、沒有遞補', JSON.stringify(ids) === '["BK-H1"]' && r.log.refunds.length === 0 && r.log.promotes.length === 0, [ids, r.log.refunds, r.log.promotes]);
    ok('另一張分期保留（BK-H2）維持原狀', holdUntouched(r.tables, 'BK-H2'));
  }

  console.log('\n═══ ⑦ 沒有任何開關能恢復：就算前端硬塞舊旗標，退票成功／失敗都不呼叫 ═══');
  {
    let r = makeEnv({ legacyFlag: true, bookings: [target(), hold('BK-H1', '2026-11-27')], tickets: [TK] });
    ok('（確認夾具有把舊旗標塞進去）window.FEATURE_FLAGS.cancelPromoteHeld === true', r.env.window.FEATURE_FLAGS.cancelPromoteHeld === true);
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'force', {});
    ok('★★★ 舊旗標 true＋退票成功 → 仍不呼叫 promoteHeldBooking；退票與取消照常',
       r.log.promotes.length === 0 && r.log.refunds.length === 1 && r.tables.bookings['BK-C'].status === 'cancelled', [r.log.promotes, r.log.refunds.length]);
    ok('　　分期保留預約維持原狀', holdUntouched(r.tables, 'BK-H1'));
    r = makeEnv({ legacyFlag: true, bookings: [target(), hold('BK-H1', '2026-11-27')], tickets: [TK], refundOk: false });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'force', {});
    ok('★★★ 舊旗標 true＋退票失敗 → 不呼叫', r.log.promotes.length === 0, r.log.promotes);
    r = makeEnv({ legacyFlag: true, bookings: [target(), hold('BK-H1', '2026-11-27')], tickets: [TK], net: 0 });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'force', {});
    ok('★★★ 舊旗標 true＋帳本查不到扣課（沒有退票）→ 不呼叫', r.log.promotes.length === 0, r.log.promotes);
  }

  console.log('\n═══ ⑧ 收款開通後仍進入 bindHeldBookings（執行真正的 bindHeldBookings）═══');
  {
    const tk = Object.assign(clone(TK), { sessions_remaining: 5 });    // 已用 7、已開通 8 → 可再約 1 堂
    const H1 = hold('BK-H1', '2026-11-27', NOTE + '｜備註：靠窗');
    const H2 = hold('BK-H2', '2026-12-04');
    const { env, log, tables } = makeEnv({ bookings: [H1, H2], tickets: [tk] });
    ['bkIsInstHold', 'tkUnlockedLeft', 'bkNoteSplit', 'bkNoteJoin'].forEach(n => { env[n] = instReal(n, env, log); });
    const bind = instReal('bindHeldBookings', env, log);
    const n = await bind('TK-A', 1);
    ok('補綁 1 堂（maxN=1）', n === 1, n);
    ok('扣票 1 次，對象是最早的保留課 BK-H1', log.deducts.length === 1 && log.deducts[0][1] === 'BK-H1', log.deducts);
    const b1 = tables.bookings['BK-H1'];
    ok('BK-H1 轉成正式預約：綁票、pending_contract=false、保留員工備註只拿掉標記', b1.ticket_id === 'TK-A' && b1.pending_contract === false && b1.note === '靠窗', b1);
    ok('BK-H2 維持分期保留原狀（額度只夠 1 堂）', holdUntouched(tables, 'BK-H2'));
  }

  console.log('\n═══ ⑨ UI 取消按鈕實際傳入的模式，與 force／plain／none／RPC／RPC 備援各路徑 ═══');
  {
    // 靜態：UI 只傳 force／none／plain（從不傳 auto，也不省略模式）
    const modes = new Set();
    const re = /askSeriesCancel\('\$\{id\}','(\$\{_hasTk\?'force':'none'\}|force|none|plain)'\)/g;
    let mm; while ((mm = re.exec(src))) modes.add(mm[1]);
    ok('★★ confirmCancelBooking 的按鈕只傳 force／none／plain', modes.size >= 3 && [...modes].every(x => ['force', 'none', 'plain', "${_hasTk?'force':'none'}"].includes(x)), [...modes]);
    const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ok('★★ 沒有任何單參數或帶 auto 的 cancelBooking 呼叫——UI 取消一律走明確模式（也就是前端舊邏輯路徑）',
       !/cancelBooking\(\s*[A-Za-z_.]+\s*\)/.test(noComments) && !/cancelBooking\([^)]*'auto'/.test(noComments));

    const mk = (extra) => makeEnv(Object.assign({ bookings: [target(), hold('BK-H1', '2026-11-27')], tickets: [TK] }, extra || {}));
    const noPromoteAndHoldKept = r => r.log.promotes.length === 0 && holdUntouched(r.tables, 'BK-H1');

    let r = mk();
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'force', { silent: true });
    ok('force（調課／連續取消／整堂取消用，silent）：取消並退 1 堂，不遞補', r.tables.bookings['BK-C'].status === 'cancelled' && r.log.refunds.length === 1 && noPromoteAndHoldKept(r), [r.log.refunds, r.log.promotes]);

    r = mk({ net: 1 });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'plain', {});
    ok('plain（有扣過就退）＋帳本淨扣 1：取消並退 1 堂，不遞補', r.tables.bookings['BK-C'].status === 'cancelled' && r.log.refunds.length === 1 && noPromoteAndHoldKept(r), [r.log.refunds, r.log.promotes]);

    r = mk({ net: 0 });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'plain', {});
    ok('plain＋帳本淨扣 0：取消、不退票、不遞補', r.tables.bookings['BK-C'].status === 'cancelled' && r.log.refunds.length === 0 && noPromoteAndHoldKept(r), [r.log.refunds, r.log.promotes]);

    r = mk();
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'none', {});
    ok('none（扣掉這一堂）：取消、不退票、標 refund_waived，不遞補',
       r.tables.bookings['BK-C'].status === 'cancelled' && r.tables.bookings['BK-C'].refund_waived === true && r.log.refunds.length === 0 && noPromoteAndHoldKept(r), [r.tables.bookings['BK-C'].refund_waived, r.log.refunds, r.log.promotes]);

    // RPC 路徑（只有 mode 不是 force／none／plain、CLOUD、有票、非團課才會進；UI 目前不會傳這種模式）
    r = mk({ rpc: async () => ({ data: { ok: true, cancellation_result: 'refunded' }, error: null }) });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'auto', {});
    ok('RPC 成功：只呼叫 fn_cancel_booking 一次，前端不寫預約、不退票、不遞補',
       r.log.rpcs.length === 1 && r.log.rpcs[0][0] === 'fn_cancel_booking' && r.log.puts.length === 0 && r.log.refunds.length === 0 && noPromoteAndHoldKept(r), [r.log.rpcs.length, r.log.puts.length, r.log.refunds.length, r.log.promotes]);

    r = mk({ rpc: async () => ({ data: { ok: false, error_code: 'CANCEL.TOO_LATE' }, error: null }) });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'auto', {});
    ok('RPC 業務拒絕（太晚取消）：跳提示、不回退、不寫入、不遞補', r.log.modals.includes('too_late') && r.log.puts.length === 0 && r.log.refunds.length === 0 && noPromoteAndHoldKept(r), r.log.modals);

    r = mk({ rpc: async () => ({ data: null, error: { message: 'net' } }) });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'auto', {});
    ok('RPC 傳輸層失敗（重試 2 次）：整個不做、不寫入、不遞補', r.log.rpcs.length === 2 && r.log.puts.length === 0 && r.log.refunds.length === 0 && noPromoteAndHoldKept(r), [r.log.rpcs.length, r.log.puts.length]);

    r = mk({ rpc: async () => ({ data: { ok: false, error_code: 'X.UNKNOWN' }, error: null }) });
    await instReal('cancelBooking', r.env, r.log)('BK-C', 'auto', {});
    ok('RPC 回未知業務錯誤 → 回退前端舊邏輯：取消並退 1 堂，仍不遞補',
       r.tables.bookings['BK-C'].status === 'cancelled' && r.log.refunds.length === 1 && noPromoteAndHoldKept(r), [r.log.refunds, r.log.promotes]);
  }

  console.log('\n結果：' + pass + ' 通過 / ' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試本身出錯：', e); process.exit(2); });
