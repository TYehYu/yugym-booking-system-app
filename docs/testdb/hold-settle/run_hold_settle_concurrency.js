#!/usr/bin/env node
/* 新票轉正整理 fn_hold_settle_new_ticket：CC1–CC5 真並行驗證（只碰測試庫 kucvxpjatptfckhlxptj）。
   用法（需要真正的終端機；金鑰只用隱藏輸入，不會出現在命令列或檔案）：
     node docs/testdb/hold-settle/run_hold_settle_concurrency.js --env <.env.test> --work <工作資料夾>
   不需要金鑰的失敗路徑與判定邏輯自測：node docs/testdb/hold-settle/run_hold_settle_selftest.js
   前置（測試庫）：已暫裝階段 06／08／11 實際版本＋本函式＋phase_install_hs_zz.sql（zz_hs_call、zz_hs_fingerprint）；執行器一開始就核對指紋，缺任何一項直接停止（不略過案例）；測完全部拆除並核對基準。
   保護層沿用已審查的 docs/testdb/renewal/harness.js（planned／created／unknown manifest、Auth 查證、SIGINT／SIGTERM 收尾、獨立清除、恢復流程、基準快照）；
   這支只新增：本批的案例、等 advisory 鎖的判定（verifyAdvisory）、資料庫不變量檢查（invariants）。
   案例（全部用「同時送出的 HTTP 請求」，真並行證據＝持鎖者在交易內以 pid＋阻擋關係看到對手被擋）：
     CC1 重送競爭：同一份確認清單同時送兩次 → 恰一次成功、另一次 already；扣課帳＝N 筆（不是 2N）。
     CC2 鎖等待期間新增候選：持鎖者鎖住一筆候選；對手執行；持鎖者握住期間，第三個請求新增更近的卡位並提交 → 對手回 CANDIDATES_CHANGED，沒有任何預約被轉正／取消。
     CC3 鎖等待期間候選被改：持鎖者改了清單內一筆的時間 → 對手回 PLAN_CHANGED，沒有任何動作。
     CC4 與櫃檯扣堂／取消競爭：a-完整＝扣堂＋綁票（最終必須一致）；a-中間＝只扣堂的半套狀態（範圍僅限觀察，之後補完綁票再驗最終一致，不宣稱完整流程安全）；b＝取消。對手整理同一堂都不執行。
     CC6 共享票並行（rev6）：櫃檯確認整理時，另一個交易正鎖著並用掉同一張共享票 → 整理端等票券列鎖（txid 等待證據），之後依最新額度重判 → PLAN_CHANGED、整批停止、不照舊清單取消。
     CC5 同會員同票種兩張票同時整理：advisory 鎖排隊，後到者看到最新狀態（PLAN_CHANGED），沒有重複綁定／重複扣堂。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const { createHarness, verifyBlockedBy, rawHttp, checkServiceKey, is2xx, inList } = require('../renewal/harness.js');
const REF = 'kucvxpjatptfckhlxptj', BASE = 'https://' + REF + '.supabase.co', TIMEOUT_MS = 20000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── 純函式（selftest 會測）──────────────────────────────────────────── */
/* 等 advisory 鎖的真並行判定：持鎖者在交易內看到對手被自己擋住，且對手等的 advisory 鎖就是持鎖者持有的那把。 */
function verifyAdvisory(holder, waiter, expectTag) {
  const ts = (x) => x ? Date.parse(x) : NaN; const o = {};
  const b = holder && Array.isArray(holder.blocked_waiters) ? holder.blocked_waiters.find(x => x && x.pid === (waiter && waiter.pid)) : null;
  o.differentPids = !!(holder && waiter && holder.pid && waiter.pid && holder.pid !== waiter.pid);
  o.lockWaitObserved = !!b;
  o.caseTagOk = !!(b && expectTag && b.application_name === expectTag);
  const held = holder && Array.isArray(holder.advisory_held) ? holder.advisory_held : [];
  o.relationOk = !!(b && Array.isArray(b.waits_on) && b.waits_on.some(x => x && x.locktype === 'advisory' && held.some(h => h && h.classid === x.classid && h.objid === x.objid && h.objsubid === x.objsubid)));
  o.finishedAfterHolder = ts(waiter && waiter.end) >= ts(holder && holder.end) - 1;
  o.verified = o.differentPids && o.lockWaitObserved && o.caseTagOk && o.relationOk && o.finishedAfterHolder; return o;
}
/* 資料庫不變量：bookings＝[{id,status,ticket_id,pending_contract}]、logs＝[{ticket_id,booking_id,action,delta}]、tickets＝[{id,sessions_total,sessions_remaining}]
   ① 每筆已綁票的預約，在那張票上恰好淨扣 1 堂 ② 沒綁票或已取消的預約，不得對任何票有淨扣課 ③ 票券餘額＝總堂數−淨扣課（只看本輪建立的票）。回傳違規清單（空陣列＝全部成立）。 */
function invariants(bookings, logs, tickets) {
  const net = {}; for (const l of logs || []) { if (!l || !l.booking_id || !l.ticket_id || Number(l.delta) === 0) continue; const d = l.action === 'deduct' ? 1 : (l.action === 'refund' ? -1 : 0); if (!d) continue; const k = l.booking_id + '|' + l.ticket_id; net[k] = (net[k] || 0) + d; }
  const bad = [];
  for (const b of bookings || []) {
    const mine = Object.keys(net).filter(k => k.startsWith(b.id + '|') && net[k] !== 0);
    if (b.status !== 'cancelled' && b.ticket_id) { const k = b.id + '|' + b.ticket_id; if (net[k] !== 1) bad.push('綁票預約 ' + b.id + ' 在票 ' + b.ticket_id + ' 的淨扣課是 ' + (net[k] || 0) + '，應為 1'); if (mine.length !== 1) bad.push('預約 ' + b.id + ' 對 ' + mine.length + ' 張票有淨扣課'); }
    else if (mine.length) bad.push('預約 ' + b.id + '（' + (b.status === 'cancelled' ? '已取消' : '沒綁票') + '）卻有淨扣課：' + mine.join(','));
  }
  for (const t of tickets || []) { const used = Object.keys(net).filter(k => k.endsWith('|' + t.id)).reduce((s, k) => s + net[k], 0); if (Number(t.sessions_total) - used !== Number(t.sessions_remaining)) bad.push('票 ' + t.id + ' 餘額 ' + t.sessions_remaining + ' ≠ 總 ' + t.sessions_total + ' − 淨扣 ' + used); }
  return bad;
}
/* 前置指紋：06／08／11 與本函式必須齊備且是審查過的版本；回傳不符清單（空＝全部相符）。缺任何一項＝整個執行器停止（不再略過案例）。 */
const PINS = { settle_md5: '550c28a816b6e46f636287d7fa33405a', adopt_md5: '05c51530e595cf296f9b8da951f66093', state_md5: '22edb0f9a4893e9d891a420ba4588440', month_md5: 'e7152b65fbb7d6c5d494cc938757caeb', settle_acl: '{postgres=X/postgres,authenticated=X/postgres}' };
function checkFingerprint(fp) {
  const bad = []; if (!fp || typeof fp !== 'object') return ['沒有取得指紋'];
  for (const k of Object.keys(PINS)) if (fp[k] !== PINS[k]) bad.push(k + ' 不符（' + (fp[k] === null || fp[k] === undefined ? '缺少' : fp[k]) + '）');
  for (const k of ['quota_trigger', 'desk_deduct', 'desk_cancel', 'refund_fn']) if (fp[k] !== true) bad.push(k + ' 缺少（階段 06／08 未齊備）');
  return bad;
}
/* CC4a 的兩種結果判定（純函式）：
   ・完整流程（扣堂＋綁票）：最終狀態必須完全一致（invariants 無違規）。
   ・中間狀態（只扣堂、尚未綁票）：這是刻意觀察的「半套」，invariants 必然只抱怨這一筆「沒綁票卻有扣課」——只允許這一個、且必須是指定那筆；
     這個判定只證明「整理在這個中間狀態下不動它、不重複扣」，**不宣稱完整流程安全**；之後必須補完（綁票）再用 invariants 驗最終一致。 */
function evalCC4Final(inv) { return inv.length === 0 ? [] : inv; }
function evalCC4Mid(inv, bookingId) { const exp = inv.filter(x => x.includes('預約 ' + bookingId) && x.includes('沒綁票')); return (inv.length === exp.length && exp.length === 1) ? [] : ['中間狀態的違規不是預期的那一筆：' + JSON.stringify(inv)]; }
function overallOf({ fail, cleanOk, stoppedBy, skipped }) { return fail ? 'FAILED' : (!cleanOk ? 'CLEANUP_INCOMPLETE' : (stoppedBy ? 'STOPPED_CLEANED' : ((skipped && skipped.length) ? 'PARTIAL_' + skipped.join('_') : 'HS_CONC_COMPLETE'))); }
module.exports = { verifyAdvisory, invariants, overallOf, checkFingerprint, evalCC4Final, evalCC4Mid, PINS };
if (require.main !== module) return;

/* ── 執行器 ──────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const WORK = path.resolve(opt('--work', path.join(process.env.TMPDIR || '/tmp', 'yugym-hs-conc')));
const log = (...a) => console.log(...a);
const results = []; let pass = 0, fail = 0;
const ok = (n, c, x) => { results.push({ n, ok: !!c, x: c ? undefined : x }); if (c) { pass++; log('  ✓ ' + n); } else { fail++; log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 400) : '')); } };
async function askHidden(q) {
  if (!process.stdin.isTTY) throw new Error('需要在真正的終端機執行（隱藏輸入）');
  process.stdout.write(q); cp.execSync('stty -echo', { stdio: 'inherit' });
  const restore = () => { try { cp.execSync('stty echo', { stdio: 'inherit' }); } catch (_) {} };
  process.once('exit', restore);
  try { return await new Promise((res) => { let s = ''; process.stdin.setEncoding('utf8'); const on = (d) => { s += d; if (s.includes('\n')) { process.stdin.off('data', on); process.stdin.pause(); res(s.split('\n')[0].trim()); } }; process.stdin.on('data', on); process.stdin.resume(); }); }
  finally { restore(); process.stdout.write('\n'); }
}
/* 與 run_renewal_concurrency.js 的 makeApi 同一份行為（那份沒有匯出，這裡逐字沿用：所有請求有逾時；一般 API 可被中斷，收尾 API（noStop）不會被中斷） */
function makeApi(serviceKey, anonKey, { stopSignal, noStop } = {}) {
  async function req(method, p, { body, key, bearer, headers } = {}) {
    const h = Object.assign({ apikey: key || serviceKey, Authorization: 'Bearer ' + (bearer || key || serviceKey), 'Content-Type': 'application/json' }, headers || {});
    const sigs = [AbortSignal.timeout(TIMEOUT_MS)]; if (!noStop && stopSignal) sigs.push(stopSignal);
    const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any(sigs) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
    return { status: r.status, json: j, text: t, headers: r.headers };
  }
  const safe = async (f) => { try { return await f(); } catch (e) { return { status: 0, json: null, text: '', error: String(e && e.message || e) }; } };
  return {
    rest: (m, p, body, headers) => req(m, '/rest/v1/' + p, { body, headers }),
    adminCreateUser: (email, password) => req('POST', '/auth/v1/admin/users', { body: { email, password, email_confirm: true } }),
    adminGetUser: (id) => req('GET', '/auth/v1/admin/users/' + id),
    adminDeleteUser: (id) => req('DELETE', '/auth/v1/admin/users/' + id),
    adminListUsers: (page, per) => req('GET', '/auth/v1/admin/users?page=' + page + '&per_page=' + per),
    signIn: (email, password) => req('POST', '/auth/v1/token?grant_type=password', { body: { email, password }, key: anonKey }),
    rpcRaw: (fn, body, jwt) => safe(() => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey, bearer: jwt })),
    probe: (fn, body) => safe(() => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey })),
  };
}
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const envPath = opt('--env'); if (!envPath) throw new Error('缺 --env <.env.test>');
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (env.SB_URL !== BASE) throw new Error('.env.test 的 SB_URL 不是測試庫'); const anon = env.ANON_KEY; if (!anon) throw new Error('.env.test 缺 ANON_KEY');
  const H = createHarness({ work: WORK, log });
  process.on('SIGINT', () => H.requestStop('SIGINT')); process.on('SIGTERM', () => H.requestStop('SIGTERM'));
  const old = H.loadUnfinished();
  log('這支執行器只會碰測試庫 ' + REF + '。接受的金鑰：舊版 JWT 形式的 service_role。');
  const serviceKey = await askHidden('測試庫 service_role 金鑰> '); const bad = checkServiceKey(serviceKey, REF); if (bad) throw new Error(bad);
  const api = makeApi(serviceKey, anon, { stopSignal: H.stopSignal }), apiClean = makeApi(serviceKey, anon, { noStop: true });
  const spec = () => [
    { name: 'ticket_logs by booking', table: 'ticket_logs', col: 'booking_id', ids: () => H.createdIds('bookings') },
    { name: 'ticket_logs by ticket', table: 'ticket_logs', col: 'ticket_id', ids: () => H.createdIds('member_tickets') },
    { name: 'ticket_deduct_ops', table: 'ticket_deduct_ops', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name: 'bookings', table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') },
    { name: 'booking_op_rev', table: 'booking_op_rev', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name: 'member_tickets', table: 'member_tickets', col: 'id', ids: () => H.createdIds('member_tickets') },
    { name: 'members', table: 'members', col: 'id', ids: () => H.createdIds('members') },
    { name: 'ticket_types', table: 'ticket_types', col: 'id', ids: () => H.createdIds('ticket_types') },
    { name: 'employees', table: 'employees', col: 'id', ids: () => H.createdIds('employees') },
  ];
  if (old) {   // ── 恢復模式：不建立任何新東西，只查證並清除上次確定建立的項目 ──
    log('⚠ 偵測到上次未完成的 manifest。進入查證／恢復流程（不建立任何新東西）。');
    if (old.corrupt) throw new Error('manifest 損毀，無法安全恢復；請把 ' + path.join(WORK, 'manifest.json') + ' 交給 Claude 檢查（不要手動刪）');
    const rr = await H.recover(apiClean, old); log('  查證：' + JSON.stringify(rr));
    const rep = await H.cleanup(apiClean, spec()); const still = H.unresolved();
    log('  清除失敗：' + (rep.failures.length ? rep.failures.join('；') : '無') + '；仍無法確認：' + (still.length ? still.join('、') : '無'));
    if (!rep.failures.length && !still.length && H.canClaimComplete()) {
      H.MF.finished = true; H.MF.recoveredAt = new Date().toISOString(); const pe = H.trySave();
      if (pe) { H.persistFail(pe); log('✗ 清除已完成，但無法把完成狀態寫入追蹤檔：不宣稱恢復完成，舊 manifest 保留。'); process.exitCode = 1; return; }
      try { H.archiveManifest('recovered'); } catch (e) { log('✗ 恢復清除完成，但封存舊 manifest 失敗：不宣稱完成。'); process.exitCode = 1; return; }
      log('✓ 恢復完成並已封存舊 manifest。請重新執行以進行新一輪驗證。'); process.exitCode = 0;
    } else { log('✗ 恢復未完成：舊 manifest 保留，請交給 Claude 檢視（不要手動刪）。'); process.exitCode = 1; }
    return;
  }
  const runId = crypto.randomBytes(3).toString('hex'); H.newManifest(runId); const id = (s) => 'CC-HS-' + s + '-' + runId;
  const TT = id('TT'), empId = 'CC-EMP-HS-' + runId, email = 'cc-hs-' + runId + '@cc-test.yugym.local', pwd = crypto.randomBytes(18).toString('base64url') + 'aA1!';
  let before = null, after = null, cleanOk = false, stoppedBy = null; const evidence = { runId, cases: {} }; const skipped = [];   // 保留欄位但不再略過任何案例（缺依賴＝前置檢查就停止）
  try {
    log('═══ 0. 前置檢查 ═══');
    const p1 = await api.probe('zz_hs_call', { p_role: 'x', p_kind: 'x', p_args: {} });
    ok('zz_hs_call 已安裝且匿名被拒（HTTP 401／403）', p1.status === 401 || p1.status === 403, rawHttp(p1));
    if (!(p1.status === 401 || p1.status === 403)) throw new Error('觀測函式未安裝或權限不符，停止（尚未建立任何東西）');
    const p2 = await api.probe('fn_hold_settle_new_ticket', { p_ticket_id: 'x', p_dry: true });
    ok('fn_hold_settle_new_ticket 已安裝且匿名被拒（HTTP 401／403）', p2.status === 401 || p2.status === 403, rawHttp(p2));
    if (!(p2.status === 401 || p2.status === 403)) throw new Error('整理函式未安裝或權限不符，停止（尚未建立任何東西）');
    const p3 = await api.probe('zz_hs_fingerprint', {}); const fp = p3.json;
    const fbad = p3.status === 200 ? checkFingerprint(fp) : ['無法取得指紋（HTTP ' + p3.status + '）'];
    ok('指紋核對：階段 06／08／11 齊備、本函式與階段 11 函式都是審查過的版本', fbad.length === 0, { bad: fbad, fp });
    if (fbad.length) throw new Error('指紋核對不符：' + fbad.join('；') + '。停止（尚未建立任何東西）；不會略過任何案例。');
    H.guard(); before = await H.snapshot(apiClean); ok('測前基準已建立：' + Object.keys(before.tables).length + ' 張表、' + before.authUsers.count + ' 個登入', true);
    log('═══ 1. 建立測試櫃檯登入與共用夾具（每筆先確認 id 不存在、確定建立成功才登記為本輪所有）═══');
    const u = await H.trackedCreateUser(api, 'desk', email, pwd); const ins = (t, row) => H.trackedInsert(api, t, row);
    await ins('employees', { id: empId, auth_id: u.id, name: 'CC整理測試櫃檯', role: 'front_desk', status: 'active' });
    await ins('ticket_types', { id: TT, name: 'CC整理私教', category: '私人教練' });
    H.guard(); const si = await api.signIn(email, pwd); if (!is2xx(si) || !si.json || !si.json.access_token) throw new Error('測試登入失敗 HTTP ' + si.status); const jwt = si.json.access_token;
    const d0 = today();
    const mkMember = async (k) => { const m = id(k); await ins('members', { id: m, name: 'CC整理會員' + k, status: 'active' }); return m; };
    const mkTicket = async (k, m, n) => { const t = id(k); await ins('member_tickets', { id: t, member_id: m, ticket_type_id: TT, plan_name: 'CC整理票', sessions_total: n, sessions_remaining: n, status: 'usable', payment_status: 'paid' }); return t; };
    const mkHold = async (k, m, off, time) => { const b = id(k); await ins('bookings', { id: b, member_id: m, ticket_type_id: TT, category: '私人教練', date: addDays(d0, off), start_time: time || '19:00', duration: 60, status: 'booked', pending_contract: true }); return b; };
    const call = (role, kind, args, expect, extra) => api.rpcRaw('zz_hs_call', { p_role: role, p_kind: kind, p_args: args, p_expect_waiters: expect || 1, p_poll_ms: 2500, p_extra_hold_ms: extra || 0 }, jwt);
    const preview = async (t) => { const r = await call('plain', 'settle', { ticket: t, dry: true }, 0); return r.json && r.json.result && r.json.result.ok ? r.json.result.plan : null; };
    const tag = (role, kind, k) => 'cc:hs:' + role + ':' + kind + ':' + k;
    const rows = async (q) => { const r = await api.rest('GET', q); return is2xx(r) && Array.isArray(r.json) ? r.json : null; };
    const state = async (ids, tks) => ({ b: await rows('bookings?select=id,status,ticket_id,pending_contract,start_time&id=' + inList(ids)), l: await rows('ticket_logs?select=ticket_id,booking_id,action,delta&ticket_id=' + inList(tks)), t: await rows('member_tickets?select=id,sessions_total,sessions_remaining&id=' + inList(tks)) });
    const untouched = (s, ids) => (s.b || []).filter(x => ids.includes(x.id)).every(x => x.status === 'booked' && !x.ticket_id && x.pending_contract === true);
    const deducts = (s, t) => (s.l || []).filter(x => x.ticket_id === t && x.action === 'deduct' && Number(x.delta) !== 0).length;
    const allBk = []; const allTk = [];
    const http200 = (name, ...rs) => ok(name + ' 每個請求 HTTP 都是 200（原始回應已存入報告）', rs.every(r => r.status === 200), rs.map(rawHttp));

    log('═══ 2. CC1 重送競爭：同一份確認清單同時送兩次 ═══'); H.guard();
    { const m = await mkMember('M1'); const t = await mkTicket('T1', m, 3); allTk.push(t); const bs = []; for (let i = 1; i <= 5; i++) bs.push(await mkHold('A' + i, m, i)); allBk.push(...bs);
      const plan = await preview(t); ok('CC1 預覽：轉正 3、取消 2', plan && plan.bind.length === 3 && plan.cancel.length === 2, plan);
      const p1h = call('holder', 'settle', { ticket: t, dry: false, expect: plan }, 1); await sleep(250); const p2w = call('waiter', 'settle', { ticket: t, dry: false, expect: plan });
      const [h, w] = await Promise.all([p1h, p2w]); const hj = h.json || {}, wj = w.json || {}; const v = verifyAdvisory(hj, wj, tag('waiter', 'settle', t)); evidence.cases.CC1 = { holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      ok('CC1 兩個請求 HTTP 都是 200', h.status === 200 && w.status === 200, { h: rawHttp(h), w: rawHttp(w) });
      ok('CC1 先到的整理成功：轉正 3、取消 2', hj.result && hj.result.ok === true && (hj.result.bound || []).length === 3 && (hj.result.cancelled || []).length === 2, hj.result);
      ok('CC1 重送的一次：already（不重複扣、不重複取消）', wj.result && wj.result.ok === true && wj.result.already === true, wj.result);
      ok('CC1 真並行：持鎖者看到對手被自己擋住，等的就是持鎖者持有的 advisory 鎖，對手在持鎖者結束後才完成', v.verified, v);
      const s = await state(bs, [t]); ok('CC1 扣課帳恰 3 筆（不是 6）、餘額 0、不變量成立', deducts(s, t) === 3 && s.t && s.t[0].sessions_remaining === 0 && invariants(s.b, s.l, s.t).length === 0, { d: deducts(s, t), inv: invariants(s.b || [], s.l || [], s.t || []) }); }

    log('═══ 3. CC2 鎖等待期間新增候選 ═══'); H.guard();
    { const m = await mkMember('M2'); const t = await mkTicket('T2', m, 2); allTk.push(t); const bs = []; for (let i = 0; i < 3; i++) bs.push(await mkHold('B' + (i + 1), m, 2 + i)); allBk.push(...bs);
      const plan = await preview(t); ok('CC2 預覽：轉正 2、取消 1', plan && plan.bind.length === 2 && plan.cancel.length === 1, plan);
      const ph = call('holder', 'lockrow', { booking: bs[0] }, 1, 1800); await sleep(250); const pw = call('waiter', 'settle', { ticket: t, dry: false, expect: plan });
      await sleep(900); let nId = null; try { nId = await mkHold('N', m, 1); allBk.push(nId); } catch (e) { evidence.cases.CC2_insertError = String(e.message || e); }
      const [h, w] = await Promise.all([ph, pw]); const hj = h.json || {}, wj = w.json || {}; const v = verifyBlockedBy(hj, wj, tag('waiter', 'settle', t)); evidence.cases.CC2 = { holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      ok('CC2 第三個請求在鎖等待期間確實新增了更近的卡位', !!nId, evidence.cases.CC2_insertError);
      ok('CC2 對手回 CANDIDATES_CHANGED（安全停止，要求重新預覽）', wj.result && wj.result.ok === false && wj.result.error_code === 'CANDIDATES_CHANGED', wj.result);
      ok('CC2 真並行：持鎖者看到對手被擋，等的是持鎖者的 txid', v.verified, v);
      const s = await state([...bs, ...(nId ? [nId] : [])], [t]); ok('CC2 沒有任何預約被轉正或取消（含新增的那筆）、沒有扣課、餘額仍 2', untouched(s, [...bs, ...(nId ? [nId] : [])]) && deducts(s, t) === 0 && s.t[0].sessions_remaining === 2, s); }

    log('═══ 4. CC3 鎖等待期間候選被改 ═══'); H.guard();
    { const m = await mkMember('M3'); const t = await mkTicket('T3', m, 2); allTk.push(t); const bs = []; for (let i = 0; i < 3; i++) bs.push(await mkHold('C' + (i + 1), m, 1 + i)); allBk.push(...bs);
      const plan = await preview(t); ok('CC3 預覽有清單', !!plan, plan);
      const ph = call('holder', 'lockrow', { booking: bs[0], set_start_time: '07:15' }, 1); await sleep(250); const pw = call('waiter', 'settle', { ticket: t, dry: false, expect: plan });
      const [h, w] = await Promise.all([ph, pw]); const hj = h.json || {}, wj = w.json || {}; const v = verifyBlockedBy(hj, wj, tag('waiter', 'settle', t)); evidence.cases.CC3 = { holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      ok('CC3 對手回 PLAN_CHANGED（改了時間的那筆讓指紋不同）', wj.result && wj.result.ok === false && wj.result.error_code === 'PLAN_CHANGED', wj.result);
      ok('CC3 真並行：持鎖者看到對手被擋，等的是持鎖者的 txid', v.verified, v);
      const s = await state(bs, [t]); ok('CC3 沒有任何轉正／取消／扣課；時間改動保留（07:15）', untouched(s, bs) && deducts(s, t) === 0 && (s.b.find(x => x.id === bs[0]) || {}).start_time && String(s.b.find(x => x.id === bs[0]).start_time).startsWith('07:15'), s); }

    log('═══ 5. CC4 與櫃檯扣堂／取消競爭 ═══'); H.guard();
    { // CC4a-完整：真實櫃檯流程＝扣堂＋綁票；最終狀態必須一致
      const m = await mkMember('M4'); const t = await mkTicket('T4', m, 2); allTk.push(t); const bs = []; for (let i = 1; i <= 3; i++) bs.push(await mkHold('D' + i, m, i)); allBk.push(...bs);
      const plan = await preview(t); ok('CC4a 預覽有清單（轉正 2、取消 1）', plan && plan.bind.length === 2 && plan.cancel.length === 1, plan);
      const ph = call('holder', 'desk_deduct_bind', { ticket: t, booking: bs[0] }, 1); await sleep(250); const pw = call('waiter', 'settle', { ticket: t, dry: false, expect: plan });
      const [h, w] = await Promise.all([ph, pw]); const hj = h.json || {}, wj = w.json || {}; const v = verifyBlockedBy(hj, wj, tag('waiter', 'settle', t)); evidence.cases.CC4a_full = { holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      http200('CC4a-完整', h, w);
      ok('CC4a-完整 櫃檯扣堂＋綁票成功', hj.result && hj.result.ok === true, hj.result);
      ok('CC4a-完整 整理不執行（PLAN_CHANGED：那一堂已被櫃檯綁票、不再是候選）', wj.result && wj.result.ok === false && wj.result.error_code === 'PLAN_CHANGED', wj.result);
      ok('CC4a-完整 真並行：持鎖者看到對手被擋，等的是持鎖者的 txid', v.verified, v);
      const s = await state(bs, [t]); const inv = invariants(s.b || [], s.l || [], s.t || []); const fl = evalCC4Final(inv);
      ok('CC4a-完整 最終狀態一致：那一堂綁在這張票且恰淨扣 1、其餘沒被動、餘額 1、不變量全成立', fl.length === 0 && (s.b.find(x => x.id === bs[0]) || {}).ticket_id === t && deducts(s, t) === 1 && s.t[0].sessions_remaining === 1 && untouched(s, [bs[1], bs[2]]), { fl, s }); }
    { // CC4a-中間：刻意觀察「只扣堂、尚未綁票」的半套狀態——範圍僅限於此，不宣稱完整流程安全；之後補完並驗最終一致
      const m = await mkMember('M4m'); const t = await mkTicket('T4m', m, 2); allTk.push(t); const bs = []; for (let i = 1; i <= 3; i++) bs.push(await mkHold('G' + i, m, i)); allBk.push(...bs);
      const plan = await preview(t);
      const ph = call('holder', 'desk_deduct', { ticket: t, booking: bs[0] }, 1); await sleep(250); const pw = call('waiter', 'settle', { ticket: t, dry: false, expect: plan });
      const [h, w] = await Promise.all([ph, pw]); const hj = h.json || {}, wj = w.json || {}; const v = verifyBlockedBy(hj, wj, tag('waiter', 'settle', t)); evidence.cases.CC4a_mid = { scope: '只觀察半套中間狀態，不宣稱完整流程安全', holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      http200('CC4a-中間', h, w);
      ok('CC4a-中間 櫃檯扣堂成功（尚未綁票）', hj.result && hj.result.ok === true, hj.result);
      ok('CC4a-中間 整理不執行（PLAN_CHANGED 或 SETTLE.FAILED），不重複扣、不綁、不取消', wj.result && wj.result.ok === false && ['PLAN_CHANGED', 'SETTLE.FAILED'].includes(wj.result.error_code), wj.result);
      ok('CC4a-中間 真並行：持鎖者看到對手被擋，等的是持鎖者的 txid', v.verified, v);
      let s = await state(bs, [t]); const invMid = invariants(s.b || [], s.l || [], s.t || []);
      ok('CC4a-中間（範圍：半套狀態）扣課帳恰 1 筆、沒有預約被整理綁票或取消，不變量只抱怨這一筆「沒綁票卻有扣課」', deducts(s, t) === 1 && (s.b || []).every(x => x.status === 'booked' && !x.ticket_id) && evalCC4Mid(invMid, bs[0]).length === 0, { invMid, s });
      const fin = await call('plain', 'desk_bind', { ticket: t, booking: bs[0] }, 0); http200('CC4a-補完（綁票）', fin);
      s = await state(bs, [t]); const invFin = invariants(s.b || [], s.l || [], s.t || []);
      ok('CC4a-補完後 最終狀態一致（那一堂綁票、恰淨扣 1、不變量全成立）——這才是完整操作的結果', evalCC4Final(invFin).length === 0 && (s.b.find(x => x.id === bs[0]) || {}).ticket_id === t, { invFin, s }); }
    { const m = await mkMember('M5'); const t = await mkTicket('T5', m, 2); allTk.push(t); const bs = []; for (let i = 1; i <= 3; i++) bs.push(await mkHold('E' + i, m, i)); allBk.push(...bs);
      const plan = await preview(t);
      const ph = call('holder', 'desk_cancel', { booking: bs[0] }, 1); await sleep(250); const pw = call('waiter', 'settle', { ticket: t, dry: false, expect: plan });
      const [h, w] = await Promise.all([ph, pw]); const hj = h.json || {}, wj = w.json || {}; const v = verifyBlockedBy(hj, wj, tag('waiter', 'settle', t)); evidence.cases.CC4b = { holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      http200('CC4b', h, w);
      ok('CC4b 櫃檯取消成功一次', hj.result && hj.result.ok === true, hj.result);
      ok('CC4b 整理不執行（PLAN_CHANGED），被取消的那堂不會被轉正', wj.result && wj.result.ok === false && wj.result.error_code === 'PLAN_CHANGED', wj.result);
      ok('CC4b 真並行：持鎖者看到對手被擋，等的是持鎖者的 txid', v.verified, v);
      const s = await state(bs, [t]); ok('CC4b 取消的一堂維持已取消、其餘沒被動到、沒有扣課、不變量成立', (s.b.find(x => x.id === bs[0]) || {}).status === 'cancelled' && untouched(s, [bs[1], bs[2]]) && deducts(s, t) === 0 && invariants(s.b || [], s.l || [], s.t || []).length === 0, s); } 

    log('═══ 6. CC5 同會員同票種兩張票同時整理 ═══'); H.guard();
    { const m = await mkMember('M6'); const ta = await mkTicket('TA', m, 2), tb = await mkTicket('TB', m, 2); allTk.push(ta, tb); const bs = []; for (let i = 1; i <= 5; i++) bs.push(await mkHold('F' + i, m, i)); allBk.push(...bs);
      const pa = await preview(ta), pb = await preview(tb); ok('CC5 兩張票各有預覽清單', !!pa && !!pb, { pa, pb });
      const ph = call('holder', 'settle', { ticket: ta, dry: false, expect: pa }, 1); await sleep(250); const pw = call('waiter', 'settle', { ticket: tb, dry: false, expect: pb });
      const [h, w] = await Promise.all([ph, pw]); const hj = h.json || {}, wj = w.json || {}; const v = verifyAdvisory(hj, wj, tag('waiter', 'settle', tb)); evidence.cases.CC5 = { holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      ok('CC5 先到的整理成功', hj.result && hj.result.ok === true, hj.result);
      ok('CC5 後到的看到最新狀態而不執行（PLAN_CHANGED）', wj.result && wj.result.ok === false && wj.result.error_code === 'PLAN_CHANGED', wj.result);
      ok('CC5 真並行：持鎖者看到對手被擋，等的是同一把 advisory 鎖', v.verified, v);
      const s = await state(bs, [ta, tb]); ok('CC5 不變量成立：沒有重複綁定、沒有重複扣堂；B 票未被動用（餘額 2）', invariants(s.b, s.l, s.t).length === 0 && (s.t.find(x => x.id === tb) || {}).sessions_remaining === 2, { inv: invariants(s.b || [], s.l || [], s.t || []), t: s.t }); }

    log('═══ 6b. CC6 共享票並行：櫃檯確認整理時，另一個交易正在使用同一張共享票 ═══'); H.guard();
    { const m = await mkMember('M7'), mo = await mkMember('M7O'); const t = await mkTicket('T7', m, 1); allTk.push(t);
      const ts = id('T7S'); await ins('member_tickets', { id: ts, member_id: mo, ticket_type_id: TT, plan_name: 'CC整理共享票', sessions_total: 5, sessions_remaining: 2, status: 'usable', payment_status: 'paid', shared_with: [m] });
      const bs = []; for (let i = 1; i <= 3; i++) bs.push(await mkHold('SHR' + i, m, i)); allBk.push(...bs);
      const plan = await preview(t); ok('CC6 預覽（共享票還有 2 堂）：1 轉正、2 先不動（defer）、0 取消', plan && plan.bind.length === 1 && (plan.defer || []).length === 2 && plan.cancel.length === 0, plan);
      const ph = call('holder', 'lockticket', { ticket: ts, set_remaining: 0 }, 1, 1800); await sleep(250); const pw = call('waiter', 'settle', { ticket: t, dry: false, expect: plan });
      const [h, w] = await Promise.all([ph, pw]); const hj = h.json || {}, wj = w.json || {}; const v = verifyBlockedBy(hj, wj, tag('waiter', 'settle', t)); evidence.cases.CC6 = { holder: rawHttp(h), waiter: rawHttp(w), verified: v };
      http200('CC6', h, w);
      ok('CC6 另一個交易鎖住共享票並把它用到 0 堂（提交）', hj.result && hj.result.locked_ticket === ts, hj.result);
      ok('CC6 整理端依最新額度重新判定：清單變了 → PLAN_CHANGED、整批停止（不能照舊清單取消）', wj.result && wj.result.ok === false && wj.result.error_code === 'PLAN_CHANGED', wj.result);
      ok('CC6 真並行：持鎖者（持有共享票列鎖）在交易內看到整理端被擋，等的是持鎖者的 txid', v.verified, v);
      const s = await state(bs, [t, ts]); ok('CC6 沒有任何預約被轉正或取消、沒有扣課；新票餘額仍 1；共享票餘額 0（另一交易用掉的）、帳本無新紀錄', untouched(s, bs) && deducts(s, t) === 0 && (s.t.find(x => x.id === t) || {}).sessions_remaining === 1 && (s.t.find(x => x.id === ts) || {}).sessions_remaining === 0 && !(s.l || []).some(x => x.ticket_id === ts), s);
      const p2 = await preview(t); ok('CC6 重新預覽才是最新判定：共享票已 0 堂 → 1 轉正、2 取消、0 先不動', p2 && p2.bind.length === 1 && p2.cancel.length === 2 && (p2.defer || []).length === 0, p2); }

    log('═══ 7. 全程不變量 ═══');
    { const s = await state(allBk, allTk); const inv = invariants(s.b || [], s.l || [], s.t || []); ok('本輪所有預約／票券／帳本：每筆綁票恰淨扣 1、沒綁票或已取消者無淨扣、餘額＝總堂數−淨扣', s.b && s.l && s.t && inv.length === 0, inv); }
  } catch (e) { if (String(e.message) === 'STOPPED') { stoppedBy = 'SIGINT／SIGTERM'; log('  ? 執行被中斷：進入收尾'); } else { fail++; log('✗ 流程中止：' + String(e.message || e)); } evidence.abortedBy = String(e.message || e); }
  finally {
    log('═══ 8. 收尾：各步獨立清除 → 逐項確認不存在 → 與測前基準比對 ═══');
    let rep = { steps: [], failures: ['清除程序未執行'], notDeleted: [] }; let d = null; const extraFails = [];
    try { rep = await H.cleanup(apiClean, spec()); } catch (e) { rep = { steps: [], failures: ['清除程序錯誤：' + String(e.message || e)], notDeleted: H.unresolved() }; }
    try { if (before) { after = await H.snapshot(apiClean); d = H.diffSnap(before, after); } } catch (e) { extraFails.push('測後基準讀取失敗：' + String(e.message || e)); }
    const pending = H.unresolved();
    cleanOk = !!(d && d.tablesChanged.length === 0 && !d.authUsersChanged && !rep.failures.length && !extraFails.length && pending.length === 0 && H.canClaimComplete());
    if (rep.failures.length) log('  清除失敗：' + rep.failures.join('；')); if (extraFails.length) log('  ' + extraFails.join('；'));
    if (pending.length) log('  ⚠ 待處理（結果不明、沒有證明是本輪所建，不會被刪）：' + pending.join('、'));
    if (H.persistFailed) log('  ✗ 追蹤檔曾寫入失敗（' + H.persistError + '）：證據不完整，不能判定完成。');
    if (d) log('  資料表差異：' + (d.tablesChanged.length ? JSON.stringify(d.tablesChanged) : '無（與測前逐列相同）') + '；登入帳號：' + (d.authUsersChanged ? '與測前不同！' : '與測前相同'));
    ok('清除後資料與登入帳號回到測前基準，沒有待處理項目，且追蹤檔全程寫入成功', cleanOk, { failures: rep.failures.concat(extraFails), pending, persistError: H.persistError, diff: d });
    if (cleanOk && H.MF) { H.MF.finished = true; H.MF.finishedAt = new Date().toISOString(); const pe = H.trySave(); if (pe) { H.persistFail(pe); cleanOk = false; log('  ✗ 無法把完成狀態寫入追蹤檔：不判定完成。'); } }
    if (!cleanOk) log('  ⚠ manifest 保留（未完成）；重新執行本程式會自動進入恢復流程。');
    let overall = overallOf({ fail, cleanOk, stoppedBy, skipped });
    const report = { finishedAt: new Date().toISOString(), overall, pass, fail, stoppedBy, skipped, persistError: H.persistError, results, evidence, cleanup: rep, pending, diff: d };
    const repFile = path.join(WORK, 'hold_settle_conc_report.json'); const rw = H.saveReport(repFile, report);
    if (!rw.ok) { overall = 'REPORT_NOT_SAVED'; log('  ✗ 報告檔寫入失敗（' + rw.error + '）：沒有報告檔，不判定完成。摘要：' + JSON.stringify({ overall, pass, fail })); }
    log('\n整體判定：' + overall + '；結果：' + pass + ' 通過／' + fail + ' 失敗；' + (rw.ok ? '報告：' + repFile : '報告：未保存'));
    process.exitCode = (rw.ok && overall === 'HS_CONC_COMPLETE') ? 0 : 1;
  }
}
main().catch(e => { console.error('✗ ' + String(e.message || e)); process.exit(2); });
