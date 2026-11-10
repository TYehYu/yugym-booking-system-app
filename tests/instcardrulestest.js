/* 分期預約卡 Phase 2A（2026-11-10）：轉正 → 分期 → 儲值，與原分期票的安全判斷

   業務規則（負責人確認）：
   ① 有符合條件的已開通可用堂數 →「轉正」；否則同票種（含相容）原分期票尚有未開通堂數 →「分期」；都沒有 →「儲值」。
   ② 未標記且唯一嚴格符合：顯示「分期（待確認）」，點擊後顯示原票券資訊，櫃檯明確確認才標記並進入原票券下一期收款。
   ③ 多張嚴格符合：櫃檯從合格清單手動選，再確認；不可自動選最舊票。
   ④ 過期（仍有未開通堂數）：禁止直接開通，提示先處理效期，不得轉入新方案銷售。
   ⑤ 共享票券：只提示查核，不自動選票、不開通、不寫標記。
   ⑥ 只有真的沒有適用票券、也沒有分期候選時，預約卡才允許進入新方案銷售。
   ⑦ 分期繳費必須使用櫃檯確認的同一張 member_tickets.id，不建立新票券。
   ⑧ 確認時重讀預約與票券，變動／無法確定／寫入失敗都停止收款；標記保留原備註、不重複標記。

   ⚠ 讀的是本檔所在 repo 的 index.html（__dirname/..）。
   ⚠ 行為測試把真正的 bkInstCandidates／ashInstNext／bkInstConfirm／bkTopUpFromCard／bindHeldBookings 原始碼抽出來**實際執行**，
     資料層用記憶體假資料；不連任何資料庫。 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
function grabConst(name) {   // 'const NAME=...;' 到該陳述式結尾
  const i = src.indexOf('const ' + name + '=');
  if (i < 0) throw new Error('找不到 const ' + name);
  let d = 0, k = i;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') d--; else if (c === ';' && d === 0) break; }
  return src.slice(i, k + 1);
}
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

const TYPES = [
  { id: 'TT-A', name: '一般教練課', category: '私人教練' },
  { id: 'TT-F', name: '友善教練課', category: '私人教練' },
  { id: 'TT-VIP', name: 'VIP教練課', category: '私人教練' },
  { id: 'TT-G', name: '小班肌力', category: '小班肌力' },
  { id: 'tt-venue-rental', name: '場租', category: '場租' },
];
const bk = o => Object.assign({ id: 'BK1', member_id: 'M1', ticket_id: null, ticket_type_id: 'TT-A', category: '私人教練', date: '2026-11-11', start_time: '11:00', duration: 60,
  status: 'booked', pending_contract: true, note: null, trial_name: null, created_at: '2026-09-18T08:22:03.028+00:00' }, o || {});
const tk = (id, o) => Object.assign({ id, member_id: 'M1', ticket_type_id: 'TT-A', status: 'usable', plan_name: '分期方案', sessions_total: 12, sessions_remaining: 4, unlocked_sessions: 8,
  expire_date: '2027-09-15', created_at: '2026-08-08T06:56:56.856+00:00', installment: { count: 3, current: 2, paid: [true, true, false] } }, o || {});
const MARK = '分期待繳費保留（收款後自動補扣）';
const TODAY_STR = '2026-11-10';

const REAL = ['bkInstMs', 'bkInstTkSig', 'bkInstBkSig', 'bkInstCandidates', 'bkCardPayKind', 'bkEnsureTtCache', 'bkInstLoad', 'bkInstNames', 'bkTopUpFromCard', '_bkTopUpFromCard',
  'ashInstNext', '_ashInstNext', 'bkInstTkHtml', 'bkInstPickModal', 'bkInstInfoModal', 'bkInstConfirm', '_bkInstConfirm',
  'tkUsableBy', 'tkSharedIds', 'tkIsInstall', 'bkTypeIdOf', 'bkTicketTypeOk', 'bkIsMergedPT', 'bkIsPtVoucherType', 'bkIsInstHold', 'bkNoteSplit', 'bkNoteJoin', 'escH',
  'tkUnlockedLeft', 'bindHeldBookings'];

const ALL_UNKNOWN = [];   // 夾具沒提供、被當成「不做事」的全域名稱——應該是空的，否則代表測試漏了某個依賴
function mk(o) {
  o = Object.assign({ tickets: [], bookings: [], members: [{ id: 'M1', name: '測試會員' }, { id: 'M2', name: '另一位' }] }, o || {});
  const st = Object.assign({ desk: true, hasTk: false, hasTkThrows: false, putFails: false, putNoop: false, pick: null, ttMissing: false }, o.st || {});
  const log = { toasts: [], modals: [], puts: [], installNext: [], topUp: [], member: [], deducts: [], cacheClear: 0, unknown: ALL_UNKNOWN };
  const tables = { bookings: {}, member_tickets: {}, members: {}, ticket_types: {} };
  o.bookings.forEach(b => { tables.bookings[b.id] = clone(b); });
  o.tickets.forEach(t => { tables.member_tickets[t.id] = clone(t); });
  o.members.forEach(m => { tables.members[m.id] = clone(m); });
  const types = () => (st.ttMissing ? [] : TYPES);
  types().forEach(t => { tables.ticket_types[t.id] = clone(t); });
  const env = {
    window: { _ttCache: types().map(clone) }, SESSION: { id: 'E1', role: 'front_desk' },
    TODAY: new Date(TODAY_STR + 'T00:00:00'), ymd: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    isDeskLike: () => st.desk,
    dbGet: async (s, id) => (tables[s] && tables[s][id]) ? clone(tables[s][id]) : null,
    dbGetAll: async s => Object.values(tables[s] || {}).map(clone),
    dbPut: async (s, obj) => {
      if (st.putFails) throw new Error('write failed');
      log.puts.push({ store: s, obj: clone(obj) });
      if (!st.putNoop && tables[s]) tables[s][obj.id] = clone(obj);
      return obj;
    },
    dbCacheClear: () => { log.cacheClear++; },
    listUsableTickets: async () => { if (st.hasTkThrows) throw new Error('boom'); return st.hasTk ? [{ id: 'X' }] : []; },
    showToast: m => { log.toasts.push(String(m)); }, showModal: h => { log.modals.push(String(h)); }, closeModal: () => {},
    document: { querySelector: () => (st.pick ? { value: st.pick } : null) },
    openInstallNext: async id => { log.installNext.push(id); }, ppTopUp: mid => { log.topUp.push(mid); }, openMemberDetail: id => { log.member.push(id); },
    deductTicket: async (t, bid) => { log.deducts.push([t.id, bid]); return true; },
    _actBusy: {}, console: { log: console.log, warn: () => {}, error: () => {} },
    BK_NOTE_SEP: '｜備註：',
  };
  // onceAct：預設直通（讓同一個測試能連續呼叫同一個動作）；st.realOnce=true 時用真正的 onceAct（驗連點）
  const realOnce = instantiate(grabFn('onceAct'), env, log.unknown);
  env.onceAct = (k, fn) => (st.realOnce ? realOnce(k, fn) : fn());
  env.BK_INST_MARK = new Function(grabConst('BK_INST_MARK') + '; return BK_INST_MARK;')();
  env.BK_INST_REASON = new Function(grabConst('BK_INST_REASON') + '; return BK_INST_REASON;')();
  REAL.forEach(n => { env[n] = instantiate(grabFn(n), env, log.unknown); });
  return { env, st, log, tables, f: env };
}
const bookingOf = h => h.tables.bookings.BK1;

(async () => {
  console.log('\n═══ ① 候選判斷 bkInstCandidates（純函式，實際執行）═══');
  {
    const h = mk();
    const C = (b, tks) => h.f.bkInstCandidates(b, tks, TODAY_STR);
    const ids = a => a.map(t => t.id).sort().join(',');
    let r = C(bk(), [tk('TK-1')]);
    ok('★ 唯一嚴格符合：本人持有、票種相等、有效、未開通 4 堂', ids(r.strict) === 'TK-1' && r.review.length === 0, r);
    r = C(bk(), [tk('TK-1'), tk('TK-2', { created_at: '2026-08-20T00:00:00+00:00' })]);
    ok('★ 同票種兩張 → 兩張都是嚴格符合（不會只留一張）', ids(r.strict) === 'TK-1,TK-2', r);
    r = C(bk(), [tk('TK-S', { member_id: 'M2', shared_with: ['M1'] })]);
    ok('★★ 共享票券（持有人不是預約會員）→ 只在查核清單，原因 shared', r.strict.length === 0 && r.review[0].reasons.includes('shared'), r);
    r = C(bk(), [tk('TK-E', { expire_date: '2026-11-05' })]);
    ok('★★ 效期早於預約日（狀態仍 usable）→ 查核清單，原因 expired', r.strict.length === 0 && r.review[0].reasons.includes('expired'), r);
    r = C(bk(), [tk('TK-E2', { status: 'expired' })]);
    ok('　　狀態 expired 且仍有未開通堂數 → 也是查核（Q5：禁止直接開通）', r.strict.length === 0 && r.review[0].reasons.includes('expired'), r);
    r = C(bk(), [tk('TK-C', { ticket_type_id: 'TT-VIP' })]);
    ok('★★ 票種相容但不相等（VIP 票上一般課）→ 查核，原因 type_compatible（Q2 含相容）', r.strict.length === 0 && r.review[0].reasons.includes('type_compatible'), r);
    r = C(bk({ ticket_type_id: 'TT-F' }), [tk('TK-C2', { ticket_type_id: 'TT-A' })]);
    ok('　　友善課可用一般票 → 相容；', r.review.length === 1 && r.review[0].reasons.includes('type_compatible'), r);
    r = C(bk(), [tk('TK-F', { ticket_type_id: 'TT-F' })]);
    ok('★ 一般課不能用友善票（不相容）→ 不是候選，不擋儲值', r.strict.length === 0 && r.review.length === 0, r);
    r = C(bk(), [tk('TK-G', { ticket_type_id: 'TT-G' })]);
    ok('★ 不同票種且不相容 → 不是候選（Q2：不擋儲值）', r.strict.length + r.review.length === 0, r);
    r = C(bk(), [tk('TK-L', { unlocked_sessions: 12 }), tk('TK-N', { unlocked_sessions: null })]);
    ok('★ 沒有未開通堂數（已全開通／未開通欄位為空）→ 不是待處理分期票', r.strict.length + r.review.length === 0, r);
    r = C(bk(), [tk('TK-R', { status: 'refunded' }), tk('TK-V', { status: 'void' })]);
    ok('　　已退費／作廢 → 排除', r.strict.length + r.review.length === 0, r);
    r = C(bk(), [tk('TK-P', { installment: null })]);
    ok('　　非分期票 → 排除', r.strict.length + r.review.length === 0, r);
    r = C(bk(), [tk('TK-B', { installment: { count: 3, current: 3 } })]);
    ok('★ 分期資料異常（current>=count 但還有未開通堂數）→ 查核，原因 bad_structure', r.strict.length === 0 && r.review[0].reasons.includes('bad_structure'), r);
    r = C(bk(), [tk('TK-T', { created_at: '2026-10-01T00:00:00+00:00' })]);
    ok('★ 票券建立時間晚於預約 → 查核（不把候選唯一當成已證實綁定），原因 ticket_created_after_booking', r.strict.length === 0 && r.review[0].reasons.includes('ticket_created_after_booking'), r);
    r = C(bk({ ticket_type_id: null }), [tk('TK-U')]);
    ok('　　預約沒有票種（非場租）→ 查核，原因 type_unknown', r.strict.length === 0 && r.review[0].reasons.includes('type_unknown'), r);
    r = C(bk({ ticket_type_id: null, category: '場租' }), [tk('TK-W', { ticket_type_id: 'tt-venue-rental' })]);
    ok('　　場租預約沒寫票種 → 用 bkTypeIdOf 補回，比對得到', r.strict.length === 1, r);
    const before = JSON.stringify([bk(), [tk('TK-1')]]); const bb = bk(), tt = [tk('TK-1')]; C(bb, tt);
    ok('★ 純函式：不修改傳入的預約與票券（顯示時零寫入）', JSON.stringify([bb, tt]) === before);
  }

  console.log('\n═══ ② 「分期」：未標記＋唯一嚴格符合 → 先顯示原票券資訊，櫃檯確認後才標記並進入該票收款 ═══');
  for (const note of [null, '靠窗', '舊系統匯入', '第一行\n第二行']) {
    const h = mk({ bookings: [bk({ note })], tickets: [tk('TK-1')] });
    await h.f.ashInstNext('BK1');
    const html = h.log.modals[0] || '';
    ok('（備註 ' + JSON.stringify(note) + '）點擊後只顯示確認視窗：沒有寫入、沒有收款、沒有開銷售視窗',
       h.log.modals.length === 1 && h.log.puts.length === 0 && h.log.installNext.length === 0 && h.log.topUp.length === 0, [h.log.modals.length, h.log.puts.length, h.log.installNext, h.log.topUp]);
    if (note === null) {
      ok('★ 視窗列出：持有人、方案名稱、票券識別碼、已繳期數、總期數、未開通堂數、效期',
         /測試會員/.test(html) && /分期方案/.test(html) && /TK-1/.test(html) && /已繳期數/.test(html) && /總期數/.test(html) && /未開通堂數：<b>4<\/b>/.test(html) && /2027-09-15/.test(html), html.slice(0, 120));
      ok('　　視窗說明「還沒有標記」、「不會建立新票券」', /還沒有<\/b>分期保留標記/.test(html) && /不會建立新票券/.test(html));
    }
    h.st.pick = 'TK-1';
    await h.f.bkInstConfirm('BK1');
    const b2 = bookingOf(h);
    ok('　　確認後：只寫 1 次預約、只改備註、ticket_id 仍為空', h.log.puts.length === 1 && b2.ticket_id === null && b2.pending_contract === true && b2.status === 'booked' && b2.member_id === 'M1' && b2.date === '2026-11-11', h.log.puts.length);
    const expectNote = note === null ? MARK : note === '舊系統匯入' ? '舊系統匯入／' + MARK : MARK + '｜備註：' + note;
    ok('★★ 備註：標記寫入且保留原備註（' + JSON.stringify(b2.note) + '）', b2.note === expectNote && h.f.bkIsInstHold(b2), b2.note);
    ok('★★★ 進入收款傳入的是同一張票：openInstallNext(\'TK-1\')，沒有開銷售視窗', JSON.stringify(h.log.installNext) === '["TK-1"]' && h.log.topUp.length === 0, h.log.installNext);
    ok('　　票券完全沒被寫入（沒有新票券、沒有改既有票券）', !h.log.puts.some(p => p.store === 'member_tickets') && Object.keys(h.tables.member_tickets).length === 1);
  }

  console.log('\n═══ ③ 多張嚴格符合：櫃檯手動選，不自動選最舊票 ═══');
  {
    const mkTwo = () => mk({ bookings: [bk()], tickets: [tk('TK-OLD', { created_at: '2026-07-01T00:00:00+00:00' }), tk('TK-NEW', { created_at: '2026-08-20T00:00:00+00:00', plan_name: '新方案' })] });
    let h = mkTwo();
    await h.f.ashInstNext('BK1');
    const html = h.log.modals[0] || '';
    ok('★★ 顯示兩張，且都沒有預先勾選', /TK-OLD/.test(html) && /TK-NEW/.test(html) && !/checked/.test(html), html.length);
    ok('　　點擊當下沒有收款、沒有寫入', h.log.installNext.length === 0 && h.log.puts.length === 0 && h.log.topUp.length === 0);
    await h.f.bkInstConfirm('BK1');
    ok('★★ 兩張以上 → 只列清單、沒有確認鈕；直接呼叫確認也被擋（不寫入、不收款）', !/bkInstConfirm\(/.test(html) && h.log.puts.length === 0 && h.log.installNext.length === 0 && h.log.toasts.length > 0, h.log.toasts);
    h.st.pick = 'TK-NEW';
    await h.f.bkInstConfirm('BK1');
    ok('★★★ 即使指定 TK-NEW 直接呼叫確認 → 仍被擋，不收款、不寫入', h.log.installNext.length === 0 && h.log.puts.length === 0, h.log.installNext);
  }

  console.log('\n═══ ④ 已標記的保留課也要過同樣的安全檢查 ═══');
  {
    let h = mk({ bookings: [bk({ note: MARK })], tickets: [tk('TK-1')] });
    await h.f.ashInstNext('BK1');
    ok('★ 已標記＋唯一＋沒有其他疑點 → 直接進該票收款（不寫入、不彈視窗）', JSON.stringify(h.log.installNext) === '["TK-1"]' && h.log.puts.length === 0 && h.log.modals.length === 0, [h.log.installNext, h.log.modals.length]);
    h = mk({ bookings: [bk({ note: MARK })], tickets: [tk('TK-1'), tk('TK-2')] });
    await h.f.ashInstNext('BK1');
    ok('★★ 已標記但有兩張 → 不直接開通，只列清單（無確認鈕）', h.log.installNext.length === 0 && h.log.modals.length === 1 && !/bkInstConfirm\(/.test(h.log.modals[0]));
    h = mk({ bookings: [bk({ note: MARK })], tickets: [tk('TK-1'), tk('TK-S', { member_id: 'M2', shared_with: ['M1'] })] });
    await h.f.ashInstNext('BK1');
    ok('★★ 已標記＋唯一嚴格＋另有共享票 → 不算已確認，跳視窗（共享那張列為不可操作）',
       h.log.installNext.length === 0 && h.log.modals.length === 1 && /TK-S/.test(h.log.modals[0]) && /不可操作/.test(h.log.modals[0]));
    h.st.pick = 'TK-1';
    await h.f.bkInstConfirm('BK1');
    ok('　　已標記＋共享疑點：直接呼叫確認也被擋（不寫入、不收款）', h.log.puts.length === 0 && h.log.installNext.length === 0, [h.log.puts.length, h.log.installNext]);
    h = mk({ bookings: [bk({ note: '舊字樣 ' + MARK + ' 後面還有字' })], tickets: [tk('TK-1')] });
    await h.f.ashInstNext('BK1');
    ok('　　備註中間含標記字樣也視為已標記，不重複標記', h.log.puts.length === 0 && JSON.stringify(h.log.installNext) === '["TK-1"]');
  }

  console.log('\n═══ ⑤ 共享／過期／對應不明：只提示查核，不開通、不標記、不開新方案 ═══');
  {
    const cases = [
      ['只有共享票', [tk('TK-S', { member_id: 'M2', shared_with: ['M1'] })], /共享/],
      ['只有過期的票（效期早於預約日）', [tk('TK-E', { expire_date: '2026-11-01' })], /效期/],
      ['只有票種相容但不相等', [tk('TK-C', { ticket_type_id: 'TT-VIP' })], /相容/],
      ['票券比預約晚建立', [tk('TK-T', { created_at: '2026-10-05T00:00:00+00:00' })], /建立時間/],
    ];
    for (const [name, tks, re] of cases) for (const note of [null, MARK]) {
      const h = mk({ bookings: [bk({ note })], tickets: tks });
      await h.f.ashInstNext('BK1');
      ok('（' + name + '／' + (note ? '已標記' : '未標記') + '）出現查核視窗，沒有收款、沒有寫入、沒有開銷售視窗',
         h.log.modals.length === 1 && re.test(h.log.modals[0]) && h.log.installNext.length === 0 && h.log.puts.length === 0 && h.log.topUp.length === 0 && !/radio/.test(h.log.modals[0]), [h.log.modals.length, h.log.installNext]);
    }
    const h = mk({ bookings: [bk()], tickets: [tk('TK-E', { expire_date: '2026-11-01' })] });
    await h.f.ashInstNext('BK1');
    ok('★★ 過期：視窗明講「先處理效期」「不會轉入新方案銷售」', /先到會員票券處理效期/.test(h.log.modals[0]) && /不會轉入新方案/.test(h.log.modals[0]));
    h.st.pick = 'TK-E';
    await h.f.bkInstConfirm('BK1');
    ok('★★ 即使繞過畫面直接呼叫確認，也不會對過期票收款或標記', h.log.installNext.length === 0 && h.log.puts.length === 0, [h.log.installNext, h.log.puts.length]);
  }

  console.log('\n═══ ⑥ 其他停止條件（不收款）═══');
  {
    let h = mk({ bookings: [bk()], tickets: [] });
    await h.f.ashInstNext('BK1');
    ok('★★★ 找不到任何候選 → 只提示，不再自動退回儲值（不開銷售視窗）', h.log.topUp.length === 0 && h.log.modals.length === 0 && h.log.installNext.length === 0 && h.log.toasts.length === 1, h.log.toasts);
    h = mk({ bookings: [bk()], tickets: [tk('TK-1')], st: { hasTk: true } });
    await h.f.ashInstNext('BK1');
    ok('★ 點擊當下已有可用堂數 → 請改按轉正，不進收款、不寫入', h.log.installNext.length === 0 && h.log.puts.length === 0 && h.log.toasts.some(t => /轉正/.test(t)));
    h = mk({ bookings: [bk()], tickets: [tk('TK-1')], st: { desk: false } });
    await h.f.ashInstNext('BK1');
    ok('　　非櫃檯角色 → 擋下', h.log.modals.length === 0 && h.log.installNext.length === 0 && h.log.toasts.length === 1);
    h = mk({ bookings: [bk()], tickets: [tk('TK-1')], st: { hasTkThrows: true } });
    await h.f.ashInstNext('BK1');
    ok('★ 無法確認可用堂數（查詢拋例外）→ 停止，不進收款、不開銷售視窗', h.log.installNext.length === 0 && h.log.topUp.length === 0 && h.log.modals.length === 0 && h.log.toasts.length === 1);
    h = mk({ bookings: [bk()], tickets: [tk('TK-1')], st: { ttMissing: true } });
    await h.f.ashInstNext('BK1');
    ok('★ 票種資料載入不了（無法判斷相容）→ 停止，不進收款', h.log.installNext.length === 0 && h.log.modals.length === 0 && h.log.toasts.some(t => /票種資料/.test(t)), h.log.toasts);
    h = mk({ bookings: [bk({ status: 'cancelled' })], tickets: [tk('TK-1')] });
    await h.f.ashInstNext('BK1');
    ok('　　預約已不是待簽約卡（已取消）→ 停止', h.log.modals.length === 0 && h.log.installNext.length === 0 && h.log.toasts.some(t => /狀態已改變/.test(t)));
  }

  console.log('\n═══ ⑦ 確認時重新檢查最新狀態：變動就停止、寫入失敗就停止 ═══');
  {
    const open = async extra => { const h = mk(Object.assign({ bookings: [bk()], tickets: [tk('TK-1')] }, extra || {})); await h.f.ashInstNext('BK1'); h.st.pick = 'TK-1'; return h; };
    const stopped = h => h.log.installNext.length === 0 && h.log.puts.length === 0;
    let h = await open(); h.tables.bookings.BK1.status = 'cancelled'; await h.f.bkInstConfirm('BK1');
    ok('★ 預約在確認前被取消 → 停止（不寫入、不收款）', stopped(h), h.log.toasts);
    h = await open(); h.tables.bookings.BK1.note = '別人剛改的備註'; await h.f.bkInstConfirm('BK1');
    ok('★ 預約備註在確認前被別人改了 → 停止（不覆蓋別人的修改）', stopped(h) && h.tables.bookings.BK1.note === '別人剛改的備註', h.log.toasts);
    h = await open(); h.tables.bookings.BK1.ticket_id = 'TK-X'; await h.f.bkInstConfirm('BK1');
    ok('★ 預約在確認前已被綁票（轉正了）→ 停止', stopped(h));
    h = await open(); h.tables.member_tickets['TK-1'].sessions_remaining = 3; await h.f.bkInstConfirm('BK1');
    ok('★★ 票券堂數在確認前變動 → 停止', stopped(h), h.log.toasts);
    h = await open(); h.tables.member_tickets['TK-1'].unlocked_sessions = 12; await h.f.bkInstConfirm('BK1');
    ok('★ 票券在確認前已全部開通 → 停止（不再是候選）', stopped(h));
    h = await open(); h.tables.member_tickets['TK-1'].expire_date = '2026-11-02'; await h.f.bkInstConfirm('BK1');
    ok('★ 票券在確認前過期 → 停止', stopped(h));
    h = await open(); h.tables.member_tickets['TK-2'] = tk('TK-2'); await h.f.bkInstConfirm('BK1');
    ok('★★ 確認前多了另一張候選票 → 停止（候選集合變了，不能替櫃檯決定）', stopped(h), h.log.toasts);
    h = await open(); h.st.hasTk = true; await h.f.bkInstConfirm('BK1');
    ok('★ 確認前這位會員有了可用堂數 → 停止（改按轉正）', stopped(h));
    h = await open(); h.st.putFails = true; await h.f.bkInstConfirm('BK1');
    ok('★★★ 標記寫入失敗 → 停止收款（不進 openInstallNext）', h.log.installNext.length === 0 && h.log.toasts.some(t => /已停止/.test(t)), h.log.toasts);
    h = await open(); h.st.putNoop = true; await h.f.bkInstConfirm('BK1');
    ok('★★★ 寫入後重讀發現沒標上（資料庫沒反映）→ 停止收款', h.log.installNext.length === 0 && h.log.toasts.some(t => /標記寫入後檢查不符/.test(t)), h.log.toasts);
    h = await open(); h.st.pick = null; await h.f.bkInstConfirm('BK1');
    ok('　　沒選票就確認 → 停止', stopped(h));
    h = await open({ st: { realOnce: true } }); await Promise.all([h.f.bkInstConfirm('BK1'), h.f.bkInstConfirm('BK1')]);
    ok('★ 連點確認（真正的 onceAct 同鍵合併）→ 只標記一次、只進一次收款', h.log.puts.length === 1 && h.log.installNext.length === 1, [h.log.puts.length, h.log.installNext.length]);
    h = await open(); await h.f.bkInstConfirm('BK1'); await h.f.bkInstConfirm('BK1');
    ok('★ 分開兩次確認（超過防連點時間）→ 第二次看到預約已變動而停止：只標記一次、只進一次收款', h.log.puts.length === 1 && h.log.installNext.length === 1, [h.log.puts.length, h.log.installNext.length]);
  }

  console.log('\n═══ ⑧ 「儲值」：沒有可用堂數也沒有分期候選才可開新方案（點擊時再檢查）═══');
  {
    let h = mk({ bookings: [bk()], tickets: [] });
    await h.f.bkTopUpFromCard('BK1');
    ok('★★★ 完全沒有票券（一般新客）→ 照舊開銷售視窗，會員已預選', JSON.stringify(h.log.topUp) === '["M1"]', h.log.topUp);
    h = mk({ bookings: [bk()], tickets: [tk('TK-G', { ticket_type_id: 'TT-G' }), tk('TK-F', { ticket_type_id: 'TT-F' }), tk('TK-L', { unlocked_sessions: 12 })] });
    await h.f.bkTopUpFromCard('BK1');
    ok('★★ 只有「不同票種且不相容」或「已全開通」的分期票 → 不算待處理，仍可儲值（Q2 範圍）', JSON.stringify(h.log.topUp) === '["M1"]', h.log.topUp);
    for (const [name, tks] of [['同票種分期票尚有未開通', [tk('TK-1')]], ['共享票', [tk('TK-S', { member_id: 'M2', shared_with: ['M1'] })]], ['過期票', [tk('TK-E', { expire_date: '2026-11-01' })]], ['相容票種', [tk('TK-C', { ticket_type_id: 'TT-VIP' })]]]) {
      h = mk({ bookings: [bk()], tickets: tks });
      await h.f.bkTopUpFromCard('BK1');
      ok('★★★ ' + name + ' → 不開銷售視窗（不建立新方案）', h.log.topUp.length === 0 && h.log.toasts.length === 1 && /分期/.test(h.log.toasts[0]), h.log.toasts);
    }
    h = mk({ bookings: [bk()], tickets: [], st: { hasTk: true } });
    await h.f.bkTopUpFromCard('BK1');
    ok('★ 點擊當下已有可用堂數 → 不開銷售視窗', h.log.topUp.length === 0);
    h = mk({ bookings: [bk()], tickets: [], st: { hasTkThrows: true } });
    await h.f.bkTopUpFromCard('BK1');
    ok('★★ 查詢失敗 → 停止，不開銷售視窗（不能在不確定時開新方案）', h.log.topUp.length === 0 && h.log.toasts.length === 1);
    h = mk({ bookings: [bk()], tickets: [], st: { ttMissing: true } });
    await h.f.bkTopUpFromCard('BK1');
    ok('★★ 票種資料載入不了 → 停止', h.log.topUp.length === 0);
    h = mk({ bookings: [bk()], tickets: [], st: { desk: false } });
    await h.f.bkTopUpFromCard('BK1');
    ok('　　非櫃檯 → 擋下', h.log.topUp.length === 0 && h.log.toasts.length === 1);
    h = mk({ bookings: [bk({ ticket_id: 'TK-X' })], tickets: [] });
    await h.f.bkTopUpFromCard('BK1');
    ok('　　預約已被綁票 → 停止', h.log.topUp.length === 0);
  }

  console.log('\n═══ ⑨ 與 bindHeldBookings 的相容（實際執行 bindHeldBookings，函式本身沒被修改）═══');
  {
    const h = mk({ bookings: [bk()], tickets: [tk('TK-1', { sessions_remaining: 5 })] });   // 已用 7、已開通 8 → 可再約 1 堂
    await h.f.ashInstNext('BK1'); h.st.pick = 'TK-1'; await h.f.bkInstConfirm('BK1');
    const n = await h.f.bindHeldBookings('TK-1', 1);
    const b = bookingOf(h);
    ok('★★★ 櫃檯確認並標記的預約，付款後被綁到「同一張」票（ticket_id=TK-1、pending_contract=false、標記清除）', n === 1 && b.ticket_id === 'TK-1' && b.pending_contract === false && b.note === null, [n, b]);
    ok('　　綁定只扣 1 次，對象是這一堂', JSON.stringify(h.log.deducts) === '[["TK-1","BK1"]]', h.log.deducts);
    const h2 = mk({ bookings: [bk({ note: '靠窗' })], tickets: [tk('TK-1', { sessions_remaining: 5 })] });
    await h2.f.ashInstNext('BK1'); h2.st.pick = 'TK-1'; await h2.f.bkInstConfirm('BK1');
    await h2.f.bindHeldBookings('TK-1', 1);
    ok('★ 綁定後保留員工備註（只拿掉標記）', bookingOf(h2).note === '靠窗', bookingOf(h2).note);
    const h3 = mk({ bookings: [bk()], tickets: [tk('TK-1', { sessions_remaining: 5 })] });
    const n3 = await h3.f.bindHeldBookings('TK-1', 1);
    ok('★ 沒有經過確認、沒有標記的預約，付款後不會被綁（這正是不能不確認就收款的原因）', n3 === 0 && bookingOf(h3).ticket_id === null && bookingOf(h3).pending_contract === true, n3);
    const h4 = mk({ bookings: [bk({ id: 'BK-EARLY', date: '2026-11-10', note: MARK }), bk()], tickets: [tk('TK-1', { sessions_remaining: 5 })] });
    await h4.f.ashInstNext('BK1'); h4.st.pick = 'TK-1'; await h4.f.bkInstConfirm('BK1');
    const n4 = await h4.f.bindHeldBookings('TK-1', 1);
    ok('　　先綁最早日期的保留課（既有行為，未改）：目標卡可能不是第一張被綁的', n4 === 1 && h4.tables.bookings['BK-EARLY'].ticket_id === 'TK-1' && h4.tables.bookings.BK1.ticket_id === null, [n4]);
  }

  console.log('\n═══ ⑩ 不該被動到的函式與入口（以 cfee1ec 的雜湊釘住）═══');
  {
    const PIN = {
      bindHeldBookings: '136cc284a4ef8120aea33db3d8487d55', openInstallNext: 'c8c315b79b2ee277d08fab0161fac353', cancelBooking: '89e199065f169e0e2bcb1b3c0573e5b3',
      promoteHeldBooking: '828611bf1bf3122b5bfd978cc9035508', bkIsInstHold: '3cadde2f2bf02204a589182effeecfb2', ppTopUp: '7f2e88265b8b64e06220b302772ce271',
      openSalesModal: 'b6ebc7f95437bb9e27a7df1b6aae6024', confirmInstallNext: 'd6e92517058299f95bc32e070b7977f2', _confirmInstallNext: '65770d74cf14477beb8ab182c2c73bc4',
      listUsableTickets: 'a21acbcd007ba434afac1e388994944b', tkFitsBooking: 'b91a5391b91aa9d99ea6360256d359ef', tkUnlockedLeft: '5b12d837a22621e01010fb7c305f5eee',
      bkTicketTypeOk: '75a7e48d18102ab23f57d684320267de', bkTypeIdOf: 'e4ac63231970bb28856de15b7942b716', tkUsableBy: '9c13668958d941f589f385ba16777061',
    };
    const bad = Object.keys(PIN).filter(n => crypto.createHash('md5').update(grabFn(n)).digest('hex') !== PIN[n]);
    ok('★★★ bindHeldBookings／openInstallNext／cancelBooking／promoteHeldBooking／ppTopUp／openSalesModal／收款開通／票券判斷函式都與已上線版本（cfee1ec）逐字相同', bad.length === 0, bad);
    ok('★★ 已上線的取消 hotfix 沒被動到：全檔沒有 promoteHeldBooking 呼叫，cancelPromoteHeld 旗標不存在', !/await promoteHeldBooking\(/.test(src) && !/cancelPromoteHeld/.test(src));
    ok('★ 會員檔案的「＋儲值」鈕維持原樣（直接 ppTopUp，不經過分期檢查）', /onclick="ppTopUp\('\$\{PP\.id\}'\)">＋ 儲/.test(src));
    const chain = src.slice(src.indexOf('async function _ashInstNext'), src.indexOf('async function _bkInstConfirm'));
    ok('★★ 「分期」流程（_ashInstNext 到確認）沒有任何 ppTopUp 呼叫，也沒有建立 member_tickets 的寫入', !/ppTopUp\(/.test(chain) && !/dbPut\('member_tickets'/.test(chain) && !/openSalesModal/.test(chain));
  }

  ok('夾具完整：沒有任何依賴被當成「不做事」的未知全域名稱', ALL_UNKNOWN.length === 0, [...new Set(ALL_UNKNOWN)]);
  console.log('\n結果：' + pass + ' 通過 / ' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試本身出錯：', e); process.exit(2); });
