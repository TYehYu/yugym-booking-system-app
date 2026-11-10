/* 待簽約／分期保留預約卡：原分期票圓形卡備援顯示（2026-11-11，溫怡婷 11/11 11:00 案例）
   ⚠ 讀的是本檔所在 repo 的 index.html（__dirname/..）。不連任何資料庫。
   行為測試把真正的 bkHoldCircleCard／bkInstCandidates 原始碼抽出來實際執行；ticketTokens／W 用可檢查的假物件
   （驗證傳進去的 curId、used、stamps 來源），並用雜湊釘住「不該動的函式」。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
function grabFn(name) {
  let i = src.indexOf('async function ' + name + '(');
  if (i < 0) i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const unknown = [];
function instantiate(code, env) {
  const scope = new Proxy({}, { has: () => true, get: (_t, key) => { if (key === Symbol.unscopables) return undefined; if (key in env) return env[key]; if (key in globalThis) return globalThis[key]; return (...a) => { unknown.push(String(key)); }; } });
  return new Function('scope', 'with(scope){ return (' + code + '); }')(scope);
}
const TYPES = [{ id: 'TT-A', name: '一般教練課', category: '私人教練' }, { id: 'TT-VIP', name: 'VIP教練課', category: '私人教練' }];
const TODAY = '2026-11-10';
const bk = o => Object.assign({ id: 'BK1', member_id: 'M1', ticket_id: null, ticket_type_id: 'TT-A', category: '私人教練', date: '2026-11-11', start_time: '11:00', duration: 60, status: 'booked', pending_contract: true, note: null, created_at: '2026-09-18T08:22:03.028+00:00' }, o || {});
const tk = (id, o) => Object.assign({ id, member_id: 'M1', ticket_type_id: 'TT-A', status: 'usable', plan_name: '私人教練 12 堂（分期）', sessions_total: 12, sessions_remaining: 8, unlocked_sessions: 8, expire_date: '2027-09-15', created_at: '2026-08-08T06:56:56Z', installment: { count: 3, current: 2, amounts: [10000, 8000, 6000] } }, o || {});
const MARK = '分期待繳費保留（收款後自動補扣）';

function mk(over) {
  over = over || {};
  const calls = [];
  const env = {
    window: { _ttCache: over.noTT ? [] : TYPES.map(t => Object.assign({}, t)) }, escH: s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])),
    ticketTokens: (t, stamps, tm, used, curId, mid, selfBk) => { calls.push({ t, stamps, used, curId, mid }); return '<span class="tok-stub" data-tk="' + t.id + '" data-used="' + used + '" data-cur="' + String(curId) + '"></span>'; },
  };
  ['bkInstMs', 'bkInstCandidates', 'bkTypeIdOf', 'bkTicketTypeOk', 'tkUsableBy', 'tkSharedIds', 'tkIsInstall', 'bkIsMergedPT', 'bkIsPtVoucherType', 'tkUnlockedLeft', 'bkHoldCircleCard', 'bkCardPayKind'].forEach(n => { env[n] = instantiate(grabFn(n), env); });
  const W = over.noW ? null : { of: id => (over.noOf ? null : { used: 5 }), stampsOf: id => ['STAMP-' + id], selfBk: new Set() };
  const wctx = over.noCtx ? null : { tickets: over.tickets || [], typeMap: {} };
  return { f: env.bkHoldCircleCard, calls, W, wctx, env };
}
const run = (o, b) => { const h = mk(o); return Object.assign(h, { r: h.f(b || bk(), h.wctx, h.W, TODAY, true) }); };

console.log('\n═══ ① 唯一安全候選 → 顯示原票券圓形卡 ═══');
for (const note of [null, MARK, '員工備註']) {
  const before = JSON.stringify([bk({ note }), [tk('TK-1')]]);
  const b = bk({ note }), tks = [tk('TK-1')];
  const h = mk({ tickets: tks }); const r = h.f(b, h.wctx, h.W, TODAY, true);
  const tag = note === null ? '未標記' : note === MARK ? '已標記' : '一般備註';
  ok('（' + tag + '）state=single，圓形卡來自 TK-1、已用堂數取 W.of(id).used(=5)、stamps 取 W.stampsOf', r.state === 'single' && /data-tk="TK-1"/.test(r.html) && /data-used="5"/.test(r.html) && h.calls.length === 1 && h.calls[0].stamps[0] === 'STAMP-TK-1', r);
  ok('（' + tag + '）curId 傳 null：本次預約不會被畫成已扣／已轉正／已簽到', h.calls[0].curId === null && /data-cur="null"/.test(r.html));
  ok('（' + tag + '）副標「原分期票券・尚有 4 堂未開通」（取自票券既有資料）', r.sub === '原分期票券・尚有 4 堂未開通', r.sub);
  ok('（' + tag + '）預約與票券資料完全不變（只產生 HTML）', JSON.stringify([b, tks]) === before);
  ok('（' + tag + '）HTML 沒有「已扣」「已轉正」「已簽到」字樣', !/已扣|已轉正|已簽到|客人尚未購票/.test(r.html + r.sub));
}
{
  const h = mk({ tickets: [tk('TK-N', { sessions_total: 24, unlocked_sessions: 6 })] }); const r = h.f(bk(), h.wctx, h.W, TODAY, true);
  ok('未開通堂數隨票券資料變（24 堂已開通 6 → 18），不寫死', r.state === 'single' && r.sub === '原分期票券・尚有 18 堂未開通', r.sub);
}

console.log('\n═══ ② 多候選／待查核候選 → 不畫任何票券圓形卡 ═══');
for (const [name, tickets] of [
  ['兩張同票種', [tk('TK-1'), tk('TK-2')]],
  ['唯一嚴格符合＋一張共享（review）', [tk('TK-1'), tk('TK-S', { member_id: 'M2', shared_with: ['M1'] })]],
  ['只有共享票', [tk('TK-S', { member_id: 'M2', shared_with: ['M1'] })]],
  ['只有過期票（review）', [tk('TK-E', { expire_date: '2026-11-05' })]],
  ['只有相容票（VIP 票上一般課）', [tk('TK-C', { ticket_type_id: 'TT-VIP' })]],
  ['狀態可疑', [tk('TK-X', { status: 'frozen' })]],
  ['分期結構異常（current>=count）', [tk('TK-B', { installment: { count: 3, current: 3 } })]],
]) {
  const h = mk({ tickets }); const r = h.f(bk(), h.wctx, h.W, TODAY, true);
  ok('（' + name + '）state=multi、提示「有多張或待查核的分期票券，請確認」，沒有任何圓形卡', r.state === 'multi' && r.sub === '有多張或待查核的分期票券，請確認' && !r.html && h.calls.length === 0, r);
}

console.log('\n═══ ③ 沒候選且資料完整 → 維持原提示（skip／none）═══');
{
  let h = mk({ tickets: [] }); ok('沒有任何票 → none（呼叫端維持「客人尚未購票」）', h.f(bk(), h.wctx, h.W, TODAY, true).state === 'none');
  h = mk({ tickets: [tk('TK-1', { unlocked_sessions: 12 })] }); ok('分期已全數開通（無未開通堂數）→ none', h.f(bk(), h.wctx, h.W, TODAY, true).state === 'none');
  h = mk({ tickets: [tk('TK-1', { installment: null })] }); ok('不是分期票 → none', h.f(bk(), h.wctx, h.W, TODAY, true).state === 'none');
  h = mk({ tickets: [tk('TK-1')] });
  ok('不是私人教練（isPT=false）→ skip', h.f(bk(), h.wctx, h.W, TODAY, false).state === 'skip');
  ok('已綁票（ticket_id 有值）→ skip', h.f(bk({ ticket_id: 'TK-1' }), h.wctx, h.W, TODAY, true).state === 'skip');
  ok('不是待簽約（pending_contract=false）→ skip', h.f(bk({ pending_contract: false }), h.wctx, h.W, TODAY, true).state === 'skip');
  ok('沒綁會員 → skip', h.f(bk({ member_id: null }), h.wctx, h.W, TODAY, true).state === 'skip');
}

console.log('\n═══ ④ 票券資料讀不到 → 「票券狀態暫時無法確認」（不是「客人尚未購票」）═══');
for (const [name, o] of [['票券夾沒載入（wctx=null）', { noCtx: true }], ['票種快取是空的', { noTT: true, tickets: [tk('TK-1')] }], ['該會員票券夾建不出來（W=null）', { noW: true, tickets: [tk('TK-1')] }], ['票券夾裡查不到這張票（W.of=null）', { noOf: true, tickets: [tk('TK-1')] }]]) {
  const h = mk(o); const r = h.f(bk(), h.wctx, h.W, TODAY, true);
  ok('（' + name + '）state=unknown，副標「票券狀態暫時無法確認」，不畫圓形卡', r.state === 'unknown' && r.sub === '票券狀態暫時無法確認' && !r.html && h.calls.length === 0, r);
}
{
  const h = mk({ tickets: 'oops' }); const r = h.f(bk(), { tickets: 'oops' }, h.W, TODAY, true);
  ok('票券清單格式不對 → unknown，不丟例外', r.state === 'unknown');
}

console.log('\n═══ ⑤ bkCardPop 接線（原始碼檢查）═══');
{
  const pop = grabFn('bkCardPop');
  ok('★ 只有「沒有票（_noTkSub）＋待簽約」分支呼叫備援；有可用堂數（_n>0）時不啟用（轉正優先）', /const _hc=\(_n>0\)\?\{state:'skip'\}:bkHoldCircleCard\(b, _wctx, _walOf\(r\.mid\), ymd\(TODAY\), b\.category==='私人教練'\);/.test(pop) && !/bkHoldCircleCard\([^)]*cc==='pt'/.test(pop));
  ok('★ single 才改 _tk 並用副標；multi／unknown 只換提示；其他維持原本三種提示', /if\(_hc\.state==='single'\)\{ _tk=_hc\.html; _noTkSub=escH\(_hc\.sub\); \}\s*else if\(_hc\.state==='multi' \|\| _hc\.state==='unknown'\)\{ _noTkSub=escH\(_hc\.sub\); \}\s*else\s*_noTkSub=/.test(pop) && /待簽約・客人尚未購票（收款後按「轉正」）/.test(pop) && /分期待繳費・尚未綁定票券/.test(pop));
  const helper = grabFn('bkHoldCircleCard');
  ok('★ helper 沒有任何寫入／呼叫資料層（dbPut／dbGet／dbDel／sb.from／deductTicket／bindHeldBookings）', !/dbPut|dbGet|dbDel|sb\.from|deductTicket|bindHeldBookings|ticket_id\s*=[^=]/.test(helper));
  ok('★ helper 呼叫 ticketTokens 時 curId 固定 null', /ticketTokens\(t, W\.stampsOf\(t\.id\), wctx\.typeMap\|\|\{\}, sl\.used\|\|0, null, b\.member_id, W\.selfBk\)/.test(helper));
}

console.log('\n═══ ⑤b 分類判斷：用預約 category==="私人教練"（一般／友善／VIP 都涵蓋；自主／團課／體驗／場租排除）═══');
{
  const pop = grabFn('bkCardPop');
  const m = pop.match(/bkHoldCircleCard\(b, _wctx, _walOf\(r\.mid\), ymd\(TODAY\), ([^)]*)\)/);
  ok('取得 bkCardPop 實際傳給 helper 的第五個參數運算式', !!m && m[1] === "b.category==='私人教練'", m && m[1]);
  const isPT = b => new Function('b', 'return (' + m[1] + ');')(b);
  const cats = { '私人教練': true, '自主訓練': false, '小班肌力': false, '體驗': false, '場租': false };
  for (const c in cats) ok('category=' + c + ' → isPT=' + cats[c], isPT({ category: c }) === cats[c]);
  // 票種：一般／友善／VIP 的教練課預約 category 都是「私人教練」→ 都啟用
  const TY = [{ id: 'TT-A', name: '一般教練課', category: '私人教練', color: 'pt' }, { id: 'TT-F', name: '友善教練課', category: '私人教練', color: 'friendly' }, { id: 'TT-VIP', name: 'VIP教練課', category: '私人教練', color: 'vip' }];
  const bkCC = src => { /* 舊判斷：看票種顏色 */ const t = TY.find(x => x.id === src); return t && t.color === 'pt' ? 'pt' : 'other'; };
  for (const [name, tt] of [['一般教練課', 'TT-A'], ['友善教練課', 'TT-F'], ['VIP教練課', 'TT-VIP']]) {
    const tkts = [tk('TK-1', { ticket_type_id: tt })];
    const b = bk({ ticket_type_id: tt });
    const h = mk({ tickets: tkts }); h.env.window._ttCache = TY.map(x => Object.assign({}, x));
    const r = h.f(b, h.wctx, h.W, TODAY, isPT(b));
    const cls = h.env.bkInstCandidates(b, tkts, TODAY);
    ok('（' + name + '）唯一安全候選 → 畫原票圓形卡（舊的顏色判斷對非一般票種會跳過：' + (bkCC(tt) === 'pt' ? '此票種舊判斷本來就通過' : '舊判斷會 skip') + '）', r.state === 'single' && cls.strict.length === 1 && cls.review.length === 0, r);
    if (name === '友善教練課') ok('★ 溫怡婷情境（友善教練課、唯一原分期票）：舊判斷 cc!=="pt" 會跳過，新判斷畫圓形卡', bkCC(tt) !== 'pt' && r.state === 'single' && /data-tk="TK-1"/.test(r.html));
    const h2 = mk({ tickets: [tk('TK-1', { ticket_type_id: tt }), tk('TK-2', { ticket_type_id: tt })] }); h2.env.window._ttCache = TY.map(x => Object.assign({}, x));
    const r2 = h2.f(b, h2.wctx, h2.W, TODAY, isPT(b));
    ok('（' + name + '）兩張候選 → 不任挑一張，不畫任何圓形卡', r2.state === 'multi' && !r2.html && h2.calls.length === 0, r2);
    const h3 = mk({ tickets: [tk('TK-1', { ticket_type_id: tt }), tk('TK-S', { ticket_type_id: tt, member_id: 'M2', shared_with: ['M1'] })] }); h3.env.window._ttCache = TY.map(x => Object.assign({}, x));
    const r3 = h3.f(b, h3.wctx, h3.W, TODAY, isPT(b));
    ok('（' + name + '）有 review（共享）候選 → 不畫圓形卡', r3.state === 'multi' && !r3.html && h3.calls.length === 0, r3);
    // 與「分期」按鈕一致：按鈕為分期 ⇔ 有候選；有候選時圓形卡一定不是舊的 none/skip
    const kind = (() => { const f = h.env.bkCardPayKind; return f ? f(false, false, cls).label : null; })();
    ok('（' + name + '）按鈕為「分期」時，圓形卡不會落回舊提示（state 不是 none/skip）', kind === '分期' && r.state !== 'none' && r.state !== 'skip', [kind, r.state]);
  }
  for (const c of ['自主訓練', '小班肌力', '體驗', '場租']) {
    const b = bk({ category: c }); const h = mk({ tickets: [tk('TK-1')] });
    ok('（' + c + '）isPT=false → skip，維持原本卡片行為', h.f(b, h.wctx, h.W, TODAY, isPT(b)).state === 'skip');
  }
}

console.log('\n═══ ⑥ 不該被動到的函式（以正式版 2e53f78 的雜湊釘住）═══');
{
  const pins = { findRefundTargetTicket: 'f1788b71501afa7ffb259d1cb5555ff0', bindHeldBookings: '136cc284a4ef8120aea33db3d8487d55', deductTicket: '8597b36ae0a8d9c1158955cc1c5fcd97', cancelBooking: '89e199065f169e0e2bcb1b3c0573e5b3', promoteHeldBooking: '828611bf1bf3122b5bfd978cc9035508', confirmInstallNext: 'd6e92517058299f95bc32e070b7977f2', _confirmInstallNext: '65770d74cf14477beb8ab182c2c73bc4', openInstallNext: 'c8c315b79b2ee277d08fab0161fac353', bkInstCandidates: '97626eb30efc9faec10845cd892feb75', bkCardPayKind: 'fa59c97db3672a082cf118cb990f9016', ticketTokens: '4f27f68a696f2548a0cddeeb8ad7127d', _ashInstNext: '0b354b4d1fb5e42d2804d094de209e1e', _bkInstConfirm: 'f1d6f6024cccb60faf169aeb61916a44', expandBkCard: 'b4b7aafb30dbe157c70a9a7d1e6cd31f' };
  const bad = Object.keys(pins).filter(n => md5(grabFn(n)) !== pins[n]);
  ok('★★★ 收款／轉正／扣票／綁票／取消／遞補／分期確認／findRefundTargetTicket／預約明細(expandBkCard，含 tkCircleHtml)／ticketTokens 都與正式版逐字相同', bad.length === 0, bad);
}
ok('夾具沒有漏掉會影響結果的依賴', unknown.length === 0, [...new Set(unknown)]);
console.log('\n結果：' + pass + ' 通過 / ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
