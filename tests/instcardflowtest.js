/* 分期預約卡 Phase 2B：端到端驗收（實際執行 expandBkCard → 模擬點擊 → 確認 → 收款入口 → 綁票）

   與 instcardrulestest.js（函式層）不同：這裡把**真正的 expandBkCard** 抽出來執行，攔截它交給 bkCardPop 的按鈕 HTML，
   照按鈕上的 onclick 字串「點下去」（在同一個環境裡執行），再走真正的 ashInstNext／bkInstConfirm／bkTopUpFromCard／ppTopUp／
   bindHeldBookings。可用堂數由**真正的 listUsableTickets／tkFitsBooking** 算出來，不是寫死。
   只有資料層（dbGet／dbGetAll／dbPut）、畫面（showModal／bkCardPop）與跨頁入口（openInstallNext／openSalesModal／openConvertPending…）
   用假的並記錄呼叫。不連任何資料庫。

   ⚠ 讀的是本檔所在 repo 的 index.html（__dirname/..）。 */
'use strict';
const fs = require('fs');
const path = require('path');
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
function grabConst(name) {
  const i = src.indexOf('const ' + name + '=');
  if (i < 0) throw new Error('找不到 const ' + name);
  let d = 0, k = i;
  for (; k < src.length; k++) { const c = src[k]; if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') d--; else if (c === ';' && d === 0) break; }
  return src.slice(i, k + 1);
}
function makeScope(env, unknownLog) {
  return new Proxy({}, {
    has: () => true,
    get: (_t, key) => {
      if (key === Symbol.unscopables) return undefined;
      if (key in env) return env[key];
      if (key in globalThis) return globalThis[key];
      return (...a) => { if (unknownLog) unknownLog.push(String(key)); return undefined; };
    },
    set: (_t, key, val) => { env[key] = val; return true; }
  });
}
const instantiate = (code, env, unknownLog) => new Function('scope', 'with(scope){ return (' + code + '); }')(makeScope(env, unknownLog));

const TYPES = [
  { id: 'TT-A', name: '一般教練課', category: '私人教練' },
  { id: 'TT-F', name: '友善教練課', category: '私人教練' },
  { id: 'TT-VIP', name: 'VIP教練課', category: '私人教練' },
  { id: 'TT-G', name: '小班肌力', category: '小班肌力' },
];
const MARK = '分期待繳費保留（收款後自動補扣）';
const bk = o => Object.assign({ id: 'BK1', member_id: 'M1', member_ids: [], ticket_id: null, ticket_type_id: 'TT-A', category: '私人教練', coach_id: 'C1', date: '2026-11-11', start_time: '11:00',
  duration: 60, status: 'booked', pending_contract: true, note: null, trial_name: null, created_at: '2026-09-18T08:22:03.028+00:00' }, o || {});
// 預設：12 堂、已開通 8、剩 4 → 已用 8 = 已開通 8 → 沒有已開通可用堂數，未開通 4
const tk = (id, o) => Object.assign({ id, member_id: 'M1', ticket_type_id: 'TT-A', status: 'usable', plan_name: '分期方案', sessions_total: 12, sessions_remaining: 4, unlocked_sessions: 8,
  expire_date: '2027-09-15', created_at: '2026-08-08T06:56:56.856+00:00', installment: { count: 3, current: 2, paid: [true, true, false] } }, o || {});
const normalTk = (id, o) => Object.assign({ id, member_id: 'M1', ticket_type_id: 'TT-A', status: 'usable', plan_name: '一般票', sessions_total: 10, sessions_remaining: 5, unlocked_sessions: null,
  expire_date: '2027-09-15', created_at: '2026-08-01T00:00:00+00:00', installment: null }, o || {});

const REAL = ['expandBkCard', 'evoBtn', 'bkIsInstHold', 'mids', 'bkIsCoachLeave', 'bkCanSub',
  'tkUsableBy', 'tkSharedIds', 'tkIsInstall', 'bkTypeIdOf', 'bkTicketTypeOk', 'bkIsMergedPT', 'bkIsPtVoucherType', 'categoryOfTypeId', 'ticketCategoryOf', 'tkTimeOk', 'tkOverBooked',
  'tkTypeOkFor', 'tkFitsBooking', 'tkUnlockedLeft', 'tkIsTimeRestricted', 'parseYmd', 'timeToMin', 'listUsableTickets',
  'bkInstMs', 'bkInstTkSig', 'bkInstBkSig', 'bkInstCandidates', 'bkCardPayKind', 'bkEnsureTtCache', 'bkInstLoad', 'bkInstNames', 'bkTopUpFromCard', '_bkTopUpFromCard',
  'ashInstNext', '_ashInstNext', 'bkInstDotsOf', 'bkInstTkHtml', 'bkInstPickModal', 'bkInstInfoModal', 'bkInstConfirm', '_bkInstConfirm',
  'ppTopUp', 'bkIsInstHold', 'bkNoteSplit', 'bkNoteJoin', 'escH', 'bindHeldBookings', 'bkIsOpenHold'];
const ALL_UNKNOWN = [];

function mk(o) {
  o = Object.assign({ tickets: [], bookings: [], members: [{ id: 'M1', name: '測試會員' }, { id: 'M2', name: '另一位' }], role: 'front_desk' }, o || {});
  const st = Object.assign({ putFails: false, putNoop: false, pick: null }, o.st || {});
  const log = { toasts: [], modals: [], puts: [], installNext: [], sales: [], convert: [], member: [], deducts: [], promote: [], cap: null };
  const tables = { bookings: {}, member_tickets: {}, members: {}, ticket_types: {} };
  o.bookings.forEach(b => { tables.bookings[b.id] = clone(b); });
  o.tickets.forEach(t => { tables.member_tickets[t.id] = clone(t); });
  o.members.forEach(m => { tables.members[m.id] = clone(m); });
  TYPES.forEach(t => { tables.ticket_types[t.id] = clone(t); });
  const isDesk = () => ['admin', 'front_desk'].includes(env.SESSION.role) || !!env.SESSION.is_manager;
  const env = {
    window: { _ttCache: TYPES.map(clone) }, SESSION: { id: 'E1', role: o.role, is_manager: false },
    TODAY: new Date('2026-11-10T00:00:00'), ymd: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), TK_TIME_END_MIN: 1080, EVO_IC: {}, _calCtxFlag: false, _actBusy: {},
    isDeskLike: isDesk, bkIsGroup: b => !!(b && b.category === '小班肌力'), isMobileLayout: () => false,   // bkIsGroup 真正的版本要整個課別口袋表，這裡只看團課類別（本測試只用私教卡）
     ashCardMode: () => 0, bkIsCoach: () => true, bkIsSelf: () => false,
    collapseBkCard: () => {}, ashBackArm: () => {}, event: { stopPropagation() {} },   // onclick 字串開頭的 event.stopPropagation()
    document: { querySelector: () => (st.pick ? { value: st.pick } : null), getElementById: () => null, querySelectorAll: () => [] },
    dbGet: async (s, id) => (tables[s] && tables[s][id]) ? clone(tables[s][id]) : null,
    dbGetAll: async s => Object.values(tables[s] || {}).map(clone),
    dbPut: async (s, obj) => {
      if (st.putFails) throw new Error('write failed');
      log.puts.push({ store: s, obj: clone(obj) });
      if (!st.putNoop && tables[s]) tables[s][obj.id] = clone(obj);
      return obj;
    },
    dbCacheClear: () => {}, tkBookedCountMap: async () => ({}),
    bkCardPop: async (el, b, btns, acts) => { log.cap = { btns, acts }; },
    showToast: m => { log.toasts.push(String(m)); }, showModal: h => { log.modals.push(String(h)); }, closeModal: () => {},
    openInstallNext: async id => { log.installNext.push(id); },
    openSalesModal: () => { log.sales.push({ pre: env.window._salesPreMember }); },
    openConvertPending: id => { log.convert.push(id); }, confirmCancelBooking: () => {}, bkAddMemberOpen: () => {}, bindPendingFromCard: () => {},
    openMemberDetail: id => { log.member.push(id); },
    promoteHeldBooking: async () => { log.promote.push(1); },
    deductTicket: async (t, bid) => { log.deducts.push([t.id, bid]); return true; },
    console: { log: console.log, warn: () => {}, error: () => {} }, BK_NOTE_SEP: '｜備註：',
    /* 圓形卡（與會員票券頁同源）夾具：walletCtx／buildWallet／ticketTokens 以可檢查的標記取代，驗證 UI 有呼叫、且傳的是這張票 */
    walletCtx: async () => ({ typeMap: {} }),
    buildWallet: () => ({ of: id => ({ used: 3 }), stampsOf: () => [], useDatesOf: () => [], selfBk: new Set() }),
    ticketTokens: (t, stamps, tm, used) => `<span class="mck-dots-stub" data-tk="${t.id}" data-used="${used}" data-total="${t.sessions_total}" data-unlocked="${t.unlocked_sessions}"></span>`,
  };
  env.BK_INST_MARK = new Function(grabConst('BK_INST_MARK') + '; return BK_INST_MARK;')();
  env.BK_INST_REASON = new Function(grabConst('BK_INST_REASON') + '; return BK_INST_REASON;')();
  const realOnce = instantiate(grabFn('onceAct'), env, ALL_UNKNOWN);
  env.onceAct = (k, fn) => (st.realOnce ? realOnce(k, fn) : fn());
  REAL.forEach(n => { env[n] = instantiate(grabFn(n), env, ALL_UNKNOWN); });
  const el = { classList: { add() {}, remove() {} }, style: {}, isConnected: true };
  const h = { env, st, log, tables, f: env, el };
  // 把按鈕 HTML 拆成 [{label,onclick}]
  h.buttons = () => { const out = []; const re = /<button class="evo-btn[^"]*" onclick="([^"]*)">\s*<span class="evo-ic">[\s\S]*?<\/span><span class="evo-lb">([\s\S]*?)<\/span><\/button>/g; let m; const html = (log.cap && log.cap.btns) || ''; while ((m = re.exec(html))) out.push({ onclick: m[1], label: m[2] }); return out; };
  h.labels = () => h.buttons().map(b => b.label);
  h.render = async (id) => { log.cap = null; await env.expandBkCard(el, id || 'BK1'); return h.labels(); };
  h.click = async label => {
    const b = h.buttons().find(x => x.label === label);
    if (!b) throw new Error('畫面上沒有「' + label + '」鈕，現有：' + h.labels().join('、'));
    // onclick 是「陳述式;陳述式;…」：逐句執行並等待（瀏覽器不會等，但測試要等非同步的最後一句做完）
    const stmts = b.onclick.split(';').map(x => x.trim()).filter(Boolean);
    const fn = new Function('scope', 'with(scope){ return (async()=>{ ' + stmts.map(x => 'await (' + x + ');').join(' ') + ' })(); }');
    return fn(makeScope(env, ALL_UNKNOWN));
  };
  h.noEffect = () => h.log.installNext.length === 0 && h.log.sales.length === 0 && h.log.puts.length === 0;
  h.noNewPlan = () => h.log.sales.length === 0 && !h.log.puts.some(p => p.store === 'member_tickets') && Object.keys(h.tables.member_tickets).length === o.tickets.length;
  return h;
}
const PAY = ['轉正', '分期', '分期（待確認）', '儲值'];
const payLabels = h => h.labels().filter(l => PAY.includes(l));
const bookingOf = h => h.tables.bookings.BK1;

(async () => {
  console.log('\n═══ 情境 1：有已開通可用堂數，另有未開通分期堂數 → 轉正優先（含已標記的保留課）═══');
  for (const note of [null, MARK]) {
    const h = mk({ bookings: [bk({ note })], tickets: [tk('TK-1', { sessions_remaining: 6 })] });   // 已用 6、已開通 8 → 可再約 2
    await h.render();
    ok('（' + (note ? '已標記' : '未標記') + '）只有「轉正」，沒有分期、沒有儲值', JSON.stringify(payLabels(h)) === '["轉正"]', h.labels());
    await h.click('轉正');
    ok('　　點「轉正」→ 進轉正流程（openConvertPending），沒有收款、沒有銷售視窗、沒有寫入', JSON.stringify(h.log.convert) === '["BK1"]' && h.noEffect(), [h.log.convert, h.log.installNext, h.log.sales]);
  }

  console.log('\n═══ 情境 2＋12＋15＋16：無可用堂數、唯一有效原分期票 → 分期（待確認）→ 確認後用同一張票 ═══');
  {
    const h = mk({ bookings: [bk()], tickets: [tk('TK-1')] });
    await h.render();
    ok('★ 只顯示「分期（待確認）」，沒有「儲值」、沒有「轉正」', JSON.stringify(payLabels(h)) === '["分期（待確認）"]', h.labels());
    ok('　　渲染本身零寫入', h.log.puts.length === 0);
    await h.click('分期（待確認）');
    ok('★ 點擊 → 顯示原票券資訊視窗；此時沒有寫入、沒有收款、沒有銷售視窗', h.log.modals.length === 1 && /TK-1/.test(h.log.modals[0]) && /分期方案/.test(h.log.modals[0]) && h.noEffect(), h.log.modals.length);
    // 情境 12：櫃檯在確認前取消（關掉視窗）→ 什麼都不會發生
    h.env.closeModal();
    ok('★ 櫃檯在確認前取消（關閉視窗）→ 沒有備註寫入、沒有收款', bookingOf(h).note === null && h.noEffect());
    h.st.pick = 'TK-1';
    await h.f.bkInstConfirm('BK1');
    ok('★★★ 確認後：標記寫入（只改備註），進入收款的票券 id 就是確認的 TK-1', JSON.stringify(h.log.installNext) === '["TK-1"]' && bookingOf(h).note === MARK && bookingOf(h).ticket_id === null, [h.log.installNext, bookingOf(h).note]);
    ok('★★★ 沒有建立新 member_tickets，也沒有開銷售視窗', h.noNewPlan() && h.log.sales.length === 0);
  }

  console.log('\n═══ 情境 3：已標記分期保留＋唯一有效原票 → 「分期」，不進新方案銷售 ═══');
  {
    const h = mk({ bookings: [bk({ note: MARK })], tickets: [tk('TK-1')] });
    await h.render();
    ok('★ 只顯示「分期」（不是待確認），沒有儲值', JSON.stringify(payLabels(h)) === '["分期"]', h.labels());
    await h.click('分期');
    ok('★★★ 直接進 TK-1 的下一期收款：沒有銷售視窗、沒有確認視窗、沒有寫入', JSON.stringify(h.log.installNext) === '["TK-1"]' && h.log.sales.length === 0 && h.log.modals.length === 0 && h.log.puts.length === 0, [h.log.installNext, h.log.modals.length]);
  }

  console.log('\n═══ 情境 4：同票種多張有效分期票 → 清單、手動選擇並再次確認，不自動挑第一張 ═══');
  {
    const h = mk({ bookings: [bk()], tickets: [tk('TK-OLD', { created_at: '2026-07-01T00:00:00+00:00' }), tk('TK-NEW', { created_at: '2026-08-20T00:00:00+00:00', plan_name: '較新方案' })] });
    await h.render();
    ok('★ 顯示「分期（待確認）」，沒有儲值', JSON.stringify(payLabels(h)) === '["分期（待確認）"]', h.labels());
    await h.click('分期（待確認）');
    ok('★ 清單列出兩張，且沒有預先勾選；點擊當下沒有收款', /TK-OLD/.test(h.log.modals[0]) && /TK-NEW/.test(h.log.modals[0]) && !/checked/.test(h.log.modals[0]) && h.log.installNext.length === 0);
    await h.f.bkInstConfirm('BK1');
    ok('★ 兩張以上：清單沒有確認鈕；直接呼叫確認 → 擋下，沒有寫入、沒有收款', !/bkInstConfirm\(/.test(h.log.modals[0]) && h.log.installNext.length === 0 && h.log.puts.length === 0);
    h.st.pick = 'TK-NEW';
    await h.f.bkInstConfirm('BK1');
    ok('★★★ 指定 TK-NEW 直接呼叫確認 → 仍被擋：不收款、不寫標記', h.log.installNext.length === 0 && h.log.puts.length === 0 && bookingOf(h).note !== MARK, h.log.installNext);
  }

  console.log('\n═══ 情境 5：已過期但 status 仍是 usable → 阻擋開通，不自動儲值 ═══');
  for (const [name, o2] of [['效期早於預約日', { expire_date: '2026-11-05' }], ['狀態 expired', { status: 'expired' }]]) {
    const h = mk({ bookings: [bk()], tickets: [tk('TK-E', o2)] });
    await h.render();
    ok('（' + name + '）顯示「分期（待確認）」而不是「儲值」', JSON.stringify(payLabels(h)) === '["分期（待確認）"]', h.labels());
    await h.click('分期（待確認）');
    ok('　　點擊 → 查核視窗，明講先處理效期、不會轉入新方案；沒有收款、沒有寫入、沒有銷售視窗',
       h.log.modals.length === 1 && /先到會員票券處理效期/.test(h.log.modals[0]) && /不會轉入新方案/.test(h.log.modals[0]) && h.noEffect(), h.log.modals.length);
    h.st.pick = 'TK-E';
    await h.f.bkInstConfirm('BK1');
    ok('　　即使直接呼叫確認，也不會對過期票收款或標記', h.noEffect());
  }

  console.log('\n═══ 情境 6：家庭共享票券 → 提示查核，不自動選擇 ═══');
  for (const note of [null, MARK]) {
    const h = mk({ bookings: [bk({ note })], tickets: [tk('TK-S', { member_id: 'M2', shared_with: ['M1'] })] });
    await h.render();
    ok('（' + (note ? '已標記' : '未標記') + '）顯示「分期（待確認）」，沒有儲值', JSON.stringify(payLabels(h)) === '["分期（待確認）"]', h.labels());
    await h.click('分期（待確認）');
    ok('　　查核視窗註明共享、不可操作；沒有選票、沒有收款、沒有標記、沒有銷售視窗', /共享/.test(h.log.modals[0]) && !/radio/.test(h.log.modals[0]) && h.noEffect());
  }

  console.log('\n═══ 情境 7：票種不同 → 不擋儲值也不開通；僅相容 → 不自動選擇、不自動開通 ═══');
  {
    let h = mk({ bookings: [bk()], tickets: [tk('TK-G', { ticket_type_id: 'TT-G' }), tk('TK-F', { ticket_type_id: 'TT-F' })] });
    await h.render();
    ok('★ 不同且不相容票種（團課票、友善票不能上一般課）→ 不是候選：顯示「儲值」', JSON.stringify(payLabels(h)) === '["儲值"]', h.labels());
    await h.click('儲值');
    ok('　　且沒有對那兩張票開通任何一期', h.log.installNext.length === 0 && h.log.sales.length === 1);
    h = mk({ bookings: [bk()], tickets: [tk('TK-C', { ticket_type_id: 'TT-VIP' })] });
    await h.render();
    ok('★ 僅相容（VIP 票上一般課）→ 顯示「分期（待確認）」，不是儲值', JSON.stringify(payLabels(h)) === '["分期（待確認）"]', h.labels());
    await h.click('分期（待確認）');
    ok('　　不自動選、不自動開通：查核視窗＋沒有收款／標記／銷售', /相容/.test(h.log.modals[0]) && !/radio/.test(h.log.modals[0]) && h.noEffect());
  }

  console.log('\n═══ 情境 8：期數異常、未開通為 0、void／refunded → 不進入下一期收款 ═══');
  {
    let h = mk({ bookings: [bk()], tickets: [tk('TK-B', { installment: { count: 3, current: 3 } })] });
    await h.render(); await h.click('分期（待確認）');
    ok('★ current>=count 但還有未開通堂數 → 查核視窗，不收款、不寫入、不開銷售', /分期資料不完整或期數異常/.test(h.log.modals[0]) && h.noEffect());
    for (const [name, o2] of [['未開通堂數為 0（已全開通）', { unlocked_sessions: 12 }], ['void', { status: 'void' }], ['refunded', { status: 'refunded' }]]) {
      h = mk({ bookings: [bk()], tickets: [tk('TK-X', o2)] });
      await h.render();
      ok('（' + name + '）不是候選，沒有「分期」鈕；不會進任何一期收款', !payLabels(h).some(l => /分期/.test(l)) && h.log.installNext.length === 0, h.labels());
      h.st.pick = 'TK-X';
      await h.f.ashInstNext('BK1');
      ok('　　即使直接呼叫「分期」入口，也只提示並停止（沒有收款、沒有銷售視窗、沒有寫入）', h.noEffect());
    }
  }

  console.log('\n═══ 情境 9：未標記歷史預約有候選 → 「分期（待確認）」，不得直接 ppTopUp ═══');
  {
    const h = mk({ bookings: [bk({ note: null })], tickets: [tk('TK-1')] });
    await h.render();
    ok('★★★ 畫面上完全沒有「儲值」鈕', !h.labels().includes('儲值') && h.labels().includes('分期（待確認）'), h.labels());
    // 即使舊畫面殘留一顆儲值鈕（展開後票券狀態才改變），點下去也不會開銷售視窗
    await h.f.bkTopUpFromCard('BK1');
    ok('★★★ 直接呼叫儲值入口（模擬殘留的舊按鈕）→ 提示改按「分期」，沒有開銷售視窗', h.log.sales.length === 0 && h.log.toasts.some(t => /不會開新方案/.test(t)), h.log.toasts);
  }

  console.log('\n═══ 情境 9b：展開卡片後狀態才改變（畫面上的按鈕已經過期）→ 點擊時重新檢查 ═══');
  {
    let h = mk({ bookings: [bk()], tickets: [] });
    await h.render();
    ok('（先決）展開時沒有票 → 顯示「儲值」', JSON.stringify(payLabels(h)) === '["儲值"]');
    h.tables.member_tickets['TK-1'] = tk('TK-1');                // 展開之後，有人替這位會員開了分期票
    await h.click('儲值');
    ok('★★★ 點「儲值」時發現已有同票種分期票 → 不開銷售視窗（不能建立新方案），提示改按分期', h.log.sales.length === 0 && h.log.toasts.some(t => /不會開新方案/.test(t)), h.log.toasts);
    h = mk({ bookings: [bk()], tickets: [tk('TK-1')] });
    await h.render();
    ok('（先決）展開時只有「分期（待確認）」', JSON.stringify(payLabels(h)) === '["分期（待確認）"]');
    h.tables.member_tickets['TK-1'].sessions_remaining = 6;      // 展開之後，這位會員有了已開通可用堂數（已用 6、已開通 8）
    await h.click('分期（待確認）');
    ok('★ 點「分期」時發現已有可用堂數 → 提示改按轉正，不跳確認視窗、不收款', h.log.modals.length === 0 && h.noEffect() && h.log.toasts.some(t => /轉正/.test(t)), h.log.toasts);
    h = mk({ bookings: [bk()], tickets: [tk('TK-1')] });
    await h.render();
    h.tables.member_tickets['TK-1'].unlocked_sessions = 12;      // 展開之後，票券被別人全部開通（未開通 0）
    await h.click('分期（待確認）');
    ok('★ 點「分期」時發現票券已不是待處理分期票 → 只提示，不收款、不寫入、不開銷售視窗', h.noEffect() && h.log.modals.length === 0, h.log.toasts);
  }

  console.log('\n═══ 情境 10：完全沒有適用票券的新客戶 → 儲值，正常進入銷售 ═══');
  {
    for (const tks of [[], [normalTk('TK-N', { sessions_remaining: 0 })]]) {
      const h = mk({ bookings: [bk()], tickets: tks });
      await h.render();
      ok('（' + (tks.length ? '有票但已用完' : '沒有任何票') + '）顯示「儲值」，沒有分期、沒有轉正', JSON.stringify(payLabels(h)) === '["儲值"]', h.labels());
      await h.click('儲值');
      ok('　　點擊 → 真正的 ppTopUp → openSalesModal，會員已預選 M1', h.log.sales.length === 1 && h.log.sales[0].pre === 'M1' && h.log.installNext.length === 0, h.log.sales);
    }
  }

  console.log('\n═══ 情境 11：找不到原分期票 → 提示並停止，不從 ashInstNext 退回 ppTopUp ═══');
  {
    const h = mk({ bookings: [bk({ note: MARK })], tickets: [] });
    await h.f.ashInstNext('BK1');
    ok('★★★ 已標記但找不到票：只有提示；沒有銷售視窗、沒有收款、沒有寫入、沒有視窗', h.log.sales.length === 0 && h.noEffect() && h.log.modals.length === 0 && h.log.toasts.length === 1, h.log.toasts);
    const h2 = mk({ bookings: [bk({ note: MARK })], tickets: [] });
    await h2.render();
    ok('　　footer 在沒有任何候選時才給「儲值」（規則 7），且點擊時仍會再檢查一次', JSON.stringify(payLabels(h2)) === '["儲值"]');
  }

  console.log('\n═══ 情境 13：確認後資料變動、標記寫入失敗 → 停止收款 ═══');
  {
    const open = async extra => { const h = mk(Object.assign({ bookings: [bk()], tickets: [tk('TK-1')] }, extra || {})); await h.render(); await h.click('分期（待確認）'); h.st.pick = 'TK-1'; return h; };
    const stopped = h => h.log.installNext.length === 0 && h.log.puts.length === 0 && h.log.sales.length === 0;
    let h = await open(); h.tables.bookings.BK1.status = 'cancelled'; await h.f.bkInstConfirm('BK1');
    ok('預約在確認前被取消 → 停止', stopped(h));
    h = await open(); h.tables.bookings.BK1.note = '別人剛改的'; await h.f.bkInstConfirm('BK1');
    ok('預約備註在確認前被別人改了 → 停止，且不覆蓋', stopped(h) && h.tables.bookings.BK1.note === '別人剛改的');
    h = await open(); h.tables.bookings.BK1.ticket_id = 'TK-X'; await h.f.bkInstConfirm('BK1');
    ok('預約在確認前已被綁票 → 停止', stopped(h));
    h = await open(); h.tables.member_tickets['TK-1'].unlocked_sessions = 10; await h.f.bkInstConfirm('BK1');
    ok('票券堂數在確認前變動 → 停止', stopped(h));
    h = await open(); h.tables.member_tickets['TK-1'].expire_date = '2026-11-02'; await h.f.bkInstConfirm('BK1');
    ok('票券在確認前過期 → 停止', stopped(h));
    h = await open(); h.tables.member_tickets['TK-2'] = tk('TK-2'); await h.f.bkInstConfirm('BK1');
    ok('確認前多了另一張候選票 → 停止', stopped(h));
    h = await open(); h.tables.member_tickets['TK-1'].sessions_remaining = 6; await h.f.bkInstConfirm('BK1');
    ok('確認前票券有了已開通可用堂數（改按轉正）→ 停止', stopped(h));
    h = await open(); h.st.putFails = true; await h.f.bkInstConfirm('BK1');
    ok('★★★ 標記寫入失敗 → 停止收款', h.log.installNext.length === 0 && h.log.sales.length === 0 && h.log.toasts.some(t => /已停止/.test(t)), h.log.toasts);
    h = await open(); h.st.putNoop = true; await h.f.bkInstConfirm('BK1');
    ok('★★★ 寫入後重讀發現沒標上 → 停止收款', h.log.installNext.length === 0 && h.log.toasts.some(t => /標記寫入後檢查不符/.test(t)), h.log.toasts);
  }

  console.log('\n═══ 情境 14：備註完整保留、重複操作不產生重複標記 ═══');
  {
    for (const [note, expected] of [[null, MARK], ['靠窗', MARK + '｜備註：靠窗'], ['舊系統匯入', '舊系統匯入／' + MARK], ['第一行\n第二行', MARK + '｜備註：第一行\n第二行']]) {
      const h = mk({ bookings: [bk({ note })], tickets: [tk('TK-1')] });
      await h.render(); await h.click('分期（待確認）'); h.st.pick = 'TK-1'; await h.f.bkInstConfirm('BK1');
      ok('備註 ' + JSON.stringify(note) + ' → ' + JSON.stringify(bookingOf(h).note), bookingOf(h).note === expected && (bookingOf(h).note.match(/分期待繳費保留/g) || []).length === 1, bookingOf(h).note);
    }
    let h = mk({ bookings: [bk()], tickets: [tk('TK-1')], st: { realOnce: true } });
    await h.render(); await h.click('分期（待確認）'); h.st.pick = 'TK-1';
    await Promise.all([h.f.bkInstConfirm('BK1'), h.f.bkInstConfirm('BK1')]);
    ok('★ 連點確認（真正的 onceAct）→ 只寫一次標記、只進一次收款', h.log.puts.length === 1 && h.log.installNext.length === 1);
    h = mk({ bookings: [bk()], tickets: [tk('TK-1')] });
    await h.render(); await h.click('分期（待確認）'); h.st.pick = 'TK-1';
    await h.f.bkInstConfirm('BK1'); await h.f.bkInstConfirm('BK1');
    ok('★ 分開兩次確認 → 第二次因預約已變動而停止：標記只有一個', h.log.puts.length === 1 && h.log.installNext.length === 1 && (bookingOf(h).note.match(/分期待繳費保留/g) || []).length === 1);
    h = mk({ bookings: [bk({ note: MARK })], tickets: [tk('TK-1'), tk('TK-2')] });
    await h.render(); await h.click('分期（待確認）'); h.st.pick = 'TK-2'; await h.f.bkInstConfirm('BK1');
    ok('★ 已標記的卡（多張時）：確認被擋，不寫入、不收款', h.log.puts.length === 0 && h.log.installNext.length === 0);
  }

  console.log('\n═══ 情境 15＋16：確認的票券 id ＝ 收款入口收到的 id；整個分期流程不建新票、不開銷售視窗 ═══');
  {
    const picks = [['單張', [tk('TK-ONLY')], 'TK-ONLY']];
    for (const [name, tks, pick] of picks) {
      const h = mk({ bookings: [bk()], tickets: tks });
      await h.render(); await h.click('分期（待確認）'); h.st.pick = pick; await h.f.bkInstConfirm('BK1');
      ok('（' + name + '）選 ' + pick + ' → openInstallNext 收到同一個 id；沒有新 member_tickets、沒有銷售視窗、沒有寫入 member_tickets',
         JSON.stringify(h.log.installNext) === JSON.stringify([pick]) && h.noNewPlan() && h.log.sales.length === 0, h.log.installNext);
    }
  }

  console.log('\n═══ 情境 17：非櫃檯權限不得操作 ═══');
  for (const role of ['coach', 'member']) {
    const h = mk({ role, bookings: [bk()], tickets: [tk('TK-1')] });
    await h.render();
    ok('（' + role + '）預約卡上沒有轉正／分期／儲值任何一顆', payLabels(h).length === 0, h.labels());
    await h.f.ashInstNext('BK1'); await h.f.bkTopUpFromCard('BK1'); h.st.pick = 'TK-1'; await h.f.bkInstConfirm('BK1');
    ok('　　直接呼叫三個入口也全部擋下：沒有收款、沒有銷售視窗、沒有寫入、沒有視窗', h.noEffect() && h.log.modals.length === 0, h.log.toasts);
  }
  {
    // 確認視窗開著時，使用者權限被降成非櫃檯（或換了人）→ 確認不得執行
    const h = mk({ bookings: [bk()], tickets: [tk('TK-1')] });
    await h.render(); await h.click('分期（待確認）');
    h.env.SESSION.role = 'coach'; h.st.pick = 'TK-1';
    await h.f.bkInstConfirm('BK1');
    ok('★ 確認視窗開著時角色變成非櫃檯 → 確認被擋：不寫入、不收款', h.noEffect() && bookingOf(h).note === null, h.log.toasts);
  }

  console.log('\n═══ 情境 18：既有行為無回歸 ═══');
  {
    // 會員檔案「＋儲值」：直接 ppTopUp → openSalesModal，不經過分期檢查（即使會員有分期候選）
    let h = mk({ bookings: [bk()], tickets: [tk('TK-1')] });
    h.f.ppTopUp('M1');
    ok('★ 會員檔案「＋儲值」維持原樣：直接開銷售視窗，會員已預選（不被分期檢查擋）', h.log.sales.length === 1 && h.log.sales[0].pre === 'M1');
    h = mk({ role: 'coach', bookings: [], tickets: [] });
    h.f.ppTopUp('M1');
    ok('　　非櫃檯仍被 ppTopUp 的權限守門擋下', h.log.sales.length === 0 && h.log.toasts.some(t => /櫃檯以上/.test(t)));
    // 一般預約卡（已綁票、非待簽約）：不走這段付款按鈕
    h = mk({ bookings: [bk({ ticket_id: 'TK-1', pending_contract: false })], tickets: [normalTk('TK-1')] });
    let err = null; try { await h.render(); } catch (e) { err = e; }
    ok('★ 一般預約卡（已綁票、不是待簽約）：可正常展開，且沒有分期／儲值／轉正鈕', err === null && payLabels(h).length === 0, err && String(err));
    // 付款後綁定：確認並標記的卡在收款開通後，被綁到同一張票（bindHeldBookings 本身未修改）
    h = mk({ bookings: [bk({ note: '靠窗' })], tickets: [tk('TK-1')] });
    await h.render(); await h.click('分期（待確認）'); h.st.pick = 'TK-1'; await h.f.bkInstConfirm('BK1');
    h.tables.member_tickets['TK-1'].unlocked_sessions = 12;   // 模擬櫃檯在收款視窗完成收款：已開通 8 → 12
    const n = await h.f.bindHeldBookings('TK-1', 1);
    ok('★★★ 收款後：確認過的預約被綁到同一張票 TK-1，標記清除、員工備註保留', n === 1 && bookingOf(h).ticket_id === 'TK-1' && bookingOf(h).pending_contract === false && bookingOf(h).note === '靠窗', [n, bookingOf(h)]);
    h = mk({ bookings: [bk()], tickets: [tk('TK-1', { sessions_remaining: 5 })] });
    ok('★ 沒經過確認（沒標記）的預約，付款後不會被綁——所以不能不確認就收款', (await h.f.bindHeldBookings('TK-1', 1)) === 0 && bookingOf(h).ticket_id === null);
    ok('★ 整個過程沒有呼叫 promoteHeldBooking（取消 hotfix 沒被碰）', h.log.promote.length === 0 && !/await promoteHeldBooking\(/.test(src) && !/cancelPromoteHeld/.test(src));
  }

  const unk = [...new Set(ALL_UNKNOWN)];
  console.log('\n（夾具以「不做事」處理的未知全域名稱：' + (unk.join('、') || '無') + '）');
  ok('夾具沒有漏掉會影響結果的依賴（未知名稱只能是畫面用函式）', unk.every(n => !/^(dbPut|dbGet|dbGetAll|listUsableTickets|openInstallNext|openSalesModal|ppTopUp|bindHeldBookings|deductTicket)$/.test(n)), unk);
  console.log('\n結果：' + pass + ' 通過 / ' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試本身出錯：', e); process.exit(2); });
