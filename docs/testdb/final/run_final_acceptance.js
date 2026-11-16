#!/usr/bin/env node
/* 最終驗收執行器 rev2（只對測試庫 kucvxpjatptfckhlxptj；正式庫不碰）
   用法：node run_final_acceptance.js [--click-only：只跑「畫面按鈕扣堂→畫面取消」一條；報告 click_report.json；完整模式以 --click-report 帶入才可能 COMPLETE] --env <本機 .env.test（SB_URL／ANON_KEY；repo 之外、權限 600）> [--work <目錄>] [--no-ui] [--ui-timeout-min 40]
        node run_final_acceptance.js --selftest      （不連網、不用金鑰：檢查失敗路徑）
   接受的金鑰格式：**舊版 JWT 形式的 service_role 金鑰（eyJ… 三段）**，且其 ref 必須是測試庫、role 必須是 service_role。
   新版 secret key（sb_secret_…）**未驗證**是否支援 Auth 管理介面，一律拒絕——不與舊版 service_role 視為可互換。
   憑證存放：管理金鑰、隨機密碼、JWT 只在本程序記憶體（結束前清空）；但 /cc-login 會把「測試登入的 session」寫進**測試瀏覽器的 localStorage**
   （僅 127.0.0.1:8101／8102 兩個來源）；走查結束要先呼叫 /cc-logout 清除（ui_done 證據需回報 logoutConfirmed），帳號刪除後那些 session 也會失效。
   manifest／evidence／report 不含任何憑證。
   兩階段收尾：①本執行器清除（本輪帳號與資料，依精確 id）②Claude 另行執行 phase_remove_testdb.sql 移除 06／08／觀測函式並核對基準。兩者都完成才算收尾。
   前置：測試庫已暫時安裝階段 06＋08＋觀測函式（phase_install_testdb.sql）。 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), cp = require('child_process');
const REF = 'kucvxpjatptfckhlxptj', BASE = 'https://' + REF + '.supabase.co';
// 探測用參數：PostgREST 以「函式名＋參數名」比對簽章，參數對不上會回 404（看起來像沒安裝）；用真實參數名才分得出「已安裝但匿名被拒（401）」與「未安裝（404）」
const PROBE_ARGS = { fn_desk_booking_rev: { p_booking_id: 'x' }, fn_desk_cancel_booking: { p_booking_id: 'x', p_mode: 'auto' }, fn_desk_op_begin: { p_slot: 'x', p_ticket_id: 'x', p_booking_id: 'x', p_expect_rev: '0' }, fn_desk_deduct_ticket: { p_ticket_id: 'x', p_booking_id: 'x' }, zz_cc_overlap: { p_kind: 'x', p_a: 'x', p_b: null, p_c: null, p_role: 'x' } };
// OpenAPI 根目錄對 anon 不開放、對 service_role 通常可讀；若讀不到就改用「安裝時查得的公開表清單」（只讀、逐表嚴格；表缺或讀失敗一樣丟錯）。清單來源會寫進證據。
const FALLBACK_TABLES = { app_state: 'id', attendance: 'id', booking_op_rev: 'booking_id', bookings: 'id', category: 'id', contract_templates: 'id', contracts: 'id', course_plans: 'id', employees: 'id', exercises: 'id', leave_settlements: 'id', member_level: 'level', member_link_requests: 'id', member_tickets: 'id', members: 'id', notifications: 'id', punch_requests: 'id', purchase_applications: 'id', purchases: 'id', reward_rules: 'id', salary_templates: 'id', shifts: 'id', space_resources: 'id', spaces: 'id', ticket_deduct_ops: 'booking_id', ticket_grant_requests: 'id', ticket_logs: 'id', ticket_type_member_levels: 'ticket_type_id', ticket_types: 'id', training_logs: 'id', venues: 'id' };
const REQUIRED_UI_FLOWS = ['new:desk-login-load', 'new:deduct', 'new:cancel', 'old:desk-login-load', 'old:deduct', 'old:cancel'];
const argv = process.argv.slice(2); const flag = (n) => argv.includes(n); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const WORK = path.resolve(opt('--work', path.join(process.env.TMPDIR || '/tmp', 'yugym-final-acceptance')));
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const stable = (v) => Array.isArray(v) ? v.map(stable) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((a, k) => (a[k] = stable(v[k]), a), {}) : v;
const log = (...a) => console.log(...a);
const is2xx = (r) => r && r.status >= 200 && r.status < 300;
let pass = 0, fail = 0; const results = []; const unverified = [];
const ok = (n, c, x) => { if (c) { pass++; log('  ✓ ' + n); } else { fail++; log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); } results.push({ n, ok: !!c }); };
const unv = (why) => { unverified.push(why); log('  ? 未驗證：' + why); };

/* ───────── 中斷／逾時 ───────── */
const stopCtl = new AbortController(); let stopping = false;
const requestStop = (sig) => { if (!stopping) { stopping = true; log('\n收到 ' + sig + '：停止新增操作，進入安全收尾…'); stopCtl.abort(); } };
const guard = () => { if (stopping) throw new Error('STOPPED'); };
const TIMEOUT_MS = 20000;

/* ───────── manifest：只有「確定由本輪建立成功」才標 created；寫入前標 planned、結果不明標 unknown ───────── */
function newManifest(runId) { return { runId, startedAt: new Date().toISOString(), finished: false, users: [], tables: {}, extra: {} }; }
let MF = null;
const saveManifest = () => { try { fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(path.join(WORK, 'manifest.json'), JSON.stringify(MF, null, 2), { mode: 0o600 }); } catch (_) {} };
const createdIds = (t) => ((MF.tables[t] || []).filter(x => x.state === 'created').map(x => x.id));
const unresolved = () => [].concat(...Object.entries(MF.tables).map(([t, a]) => a.filter(x => x.state === 'planned' || x.state === 'unknown').map(x => t + ':' + x.id)), MF.users.filter(u => u.state === 'planned' || u.state === 'unknown').map(u => 'auth:' + u.email));

/* ───────── 金鑰核對 ───────── */
function checkServiceKey(key) {
  if (!key || key.length < 20) return '金鑰看起來不完整';
  if (/^sb_secret_/.test(key)) return '新版 secret key（sb_secret_…）尚未驗證可用於 Auth 管理介面，本執行器只接受舊版 JWT 形式的 service_role 金鑰（Dashboard → Project Settings → API Keys → Legacy → service_role）';
  if (key.split('.').length !== 3) return '金鑰格式不是 JWT（eyJ… 三段）；請用舊版 service_role 金鑰';
  try { const p = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    if (p.ref !== REF) return '這把金鑰不屬於測試庫（ref 不符）';
    if (p.role !== 'service_role') return '這不是 service_role 金鑰（請用 service_role，不是 anon）'; } catch (_) { return '金鑰無法解析'; }
  return '';
}

/* ───────── HTTP 層：所有請求都有逾時，且可被中斷（清除階段用 noStop 版本，不會被中斷取消）───────── */
function makeApi(serviceKey, anonKey, { fetchImpl, noStop } = {}) {
  const f = fetchImpl || fetch;
  async function req(method, p, { body, key, bearer, headers } = {}) {
    const h = Object.assign({ apikey: key || serviceKey, Authorization: 'Bearer ' + (bearer || key || serviceKey), 'Content-Type': 'application/json' }, headers || {});
    const sigs = [AbortSignal.timeout(TIMEOUT_MS)]; if (!noStop) sigs.push(stopCtl.signal);
    const r = await f(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any(sigs) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
    return { status: r.status, json: j, headers: r.headers };
  }
  return {
    rest: (m, p, body, headers) => req(m, '/rest/v1/' + p, { body, headers }),
    adminCreateUser: (email, password) => req('POST', '/auth/v1/admin/users', { body: { email, password, email_confirm: true } }),
    adminGetUser: (id) => req('GET', '/auth/v1/admin/users/' + id),
    adminDeleteUser: (id) => req('DELETE', '/auth/v1/admin/users/' + id),
    adminListUsers: (page, per) => req('GET', '/auth/v1/admin/users?page=' + page + '&per_page=' + per),
    signIn: (email, password) => req('POST', '/auth/v1/token?grant_type=password', { body: { email, password }, key: anonKey }),
    rpcAs: (fn, body, jwt) => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey, bearer: jwt || anonKey }),
    probe: (fn, body) => req('POST', '/rest/v1/rpc/' + fn, { body: body || {}, key: anonKey }),
  };
}
const inList = (ids) => 'in.(' + ids.map(i => '"' + i + '"').join(',') + ')';

/* ───────── 基準快照：任何必要讀取失敗就丟錯（不會拿錯誤當基準）；穩定排序；核對列數完整 ───────── */
async function snapshot(api) {
  const snap = { tables: {}, authUsers: null };
  const root = await api.rest('GET', '');
  let tables, defs = {};
  if (is2xx(root) && root.json && typeof root.json.paths === 'object' && Object.keys(root.json.paths).length > 1) {
    defs = root.json.definitions || {}; tables = Object.keys(root.json.paths).filter(p => p !== '/' && !p.startsWith('/rpc/')).map(p => p.slice(1)).sort(); snap.tableListSource = 'openapi';
  } else { tables = Object.keys(FALLBACK_TABLES).sort(); defs = Object.fromEntries(tables.map(t => [t, { properties: { [FALLBACK_TABLES[t]]: {} } }])); snap.tableListSource = 'fallback(OpenAPI HTTP ' + root.status + ')'; }
  if (!tables.length) throw new Error('沒有任何資料表可建立基準');
  for (const t of tables) {
    const cols = Object.keys((defs[t] && defs[t].properties) || {}); const orderCol = cols.includes('id') ? 'id' : (cols[0] || null);
    if (!orderCol) throw new Error('資料表 ' + t + ' 找不到可排序欄位，無法建立穩定基準');
    const rows = []; let total = null;
    for (let off = 0; ; off += 1000) {
      const r = await api.rest('GET', t + '?select=*&order=' + orderCol + '.asc&limit=1000&offset=' + off, undefined, { Prefer: 'count=exact' });
      if (!is2xx(r) || !Array.isArray(r.json)) throw new Error('讀取資料表 ' + t + ' 失敗（HTTP ' + r.status + '），無法建立基準');
      const cr = r.headers && r.headers.get && r.headers.get('content-range'); if (cr && /\/(\d+)$/.test(cr)) total = Number(cr.match(/\/(\d+)$/)[1]);
      rows.push(...r.json); if (r.json.length < 1000) break;
    }
    if (total !== null && total !== rows.length) throw new Error('資料表 ' + t + ' 列數不完整（讀到 ' + rows.length + '，伺服器回報 ' + total + '）');
    if (orderCol === 'id' && new Set(rows.map(x => x.id)).size !== rows.length) throw new Error('資料表 ' + t + ' 分頁讀到重複的 id（排序不穩定），無法建立基準');
    snap.tables[t] = { count: rows.length, orderCol, rows: Object.fromEntries(rows.map((x, i) => [x.id != null ? String(x.id) : '#' + i + ':' + sha(stable(x)), sha(stable(x))])), data: rows.length <= 5000 ? Object.fromEntries(rows.filter(x => x.id != null).map(x => [String(x.id), x])) : null, all: sha(rows.map(x => sha(stable(x))).sort()) };
  }
  const users = []; for (let page = 1; ; page++) {
    const u = await api.adminListUsers(page, 200); if (!is2xx(u) || !u.json) throw new Error('讀取登入帳號清單失敗（HTTP ' + u.status + '），無法建立基準');
    const arr = Array.isArray(u.json) ? u.json : u.json.users; if (!Array.isArray(arr)) throw new Error('登入帳號清單格式不符');
    users.push(...arr); if (arr.length < 200) break; if (page > 50) throw new Error('登入帳號分頁異常');
  }
  snap.authUsers = { count: users.length, ids: users.map(x => x.id).sort(), hash: sha(users.map(x => [x.id, x.email, x.updated_at, x.last_sign_in_at]).sort()) };
  return snap;
}
function diffSnap(a, b) {
  const out = { tablesChanged: [], authUsersChanged: false };
  for (const t of new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])) {
    const x = a.tables[t], y = b.tables[t]; if (!x || !y) { out.tablesChanged.push({ table: t, note: '一邊缺少此表' }); continue; }
    if (x.all !== y.all || x.count !== y.count) { const added = Object.keys(y.rows).filter(k => !(k in x.rows)), removed = Object.keys(x.rows).filter(k => !(k in y.rows)), changed = Object.keys(x.rows).filter(k => k in y.rows && x.rows[k] !== y.rows[k]); out.tablesChanged.push({ table: t, before: x.count, after: y.count, added, removed, changed }); }
  }
  out.authUsersChanged = a.authUsers.hash !== b.authUsers.hash || a.authUsers.count !== b.authUsers.count;
  return out;
}

/* ───────── 建立（先確認不存在→標 planned→建立→不明則查證）───────── */
async function trackedInsert(api, table, row) {
  guard();
  const ex = await api.rest('GET', table + '?id=eq.' + encodeURIComponent(row.id) + '&select=id');
  if (!is2xx(ex) || !Array.isArray(ex.json)) throw new Error(table + ' 無法確認 ' + row.id + ' 是否已存在（HTTP ' + ex.status + '），停止');
  if (ex.json.length) throw new Error(table + ' 的 id ' + row.id + ' 已存在，停止（不覆蓋、不當成本輪所有）');
  const ent = { id: row.id, state: 'planned', checkedAbsent: true }; (MF.tables[table] = MF.tables[table] || []).push(ent); saveManifest();
  let r = null, err = null; try { r = await api.rest('POST', table, row, { Prefer: 'return=minimal' }); } catch (e) { err = e; }
  if (r && is2xx(r)) { ent.state = 'created'; saveManifest(); return true; }
  // 結果不明或失敗：先查證，不可直接當成本輪所有或直接刪除
  ent.state = 'unknown'; saveManifest();
  try { const v = await api.rest('GET', table + '?id=eq.' + encodeURIComponent(row.id) + '&select=id');
    if (is2xx(v) && Array.isArray(v.json)) { if (v.json.length) { ent.state = 'created'; ent.verifiedAfterUnknown = true; } else { ent.state = 'absent'; } saveManifest(); } } catch (_) {}
  if (ent.state === 'created') return true;
  throw new Error(table + ' 建立 ' + row.id + ' 失敗（' + (err ? String(err.message || err) : 'HTTP ' + (r && r.status)) + '）；狀態：' + ent.state);
}
async function trackedCreateUser(api, role, email, password) {
  guard(); const ent = { role, email, state: 'planned' }; MF.users.push(ent); saveManifest();
  let r = null, err = null; try { r = await api.adminCreateUser(email, password); } catch (e) { err = e; }
  if (r && is2xx(r) && r.json && r.json.id) { ent.id = r.json.id; ent.state = 'created'; saveManifest(); return ent; }
  ent.state = 'unknown'; saveManifest();
  try { for (let page = 1; page < 20; page++) { const l = await api.adminListUsers(page, 200); const arr = is2xx(l) ? (Array.isArray(l.json) ? l.json : (l.json && l.json.users)) : null; if (!Array.isArray(arr)) break;
      const hit = arr.find(u => u.email === email); if (hit) { ent.id = hit.id; ent.state = 'created'; ent.verifiedAfterUnknown = true; saveManifest(); return ent; } if (arr.length < 200) { ent.state = 'absent'; saveManifest(); break; } } } catch (_) {}
  throw new Error('建立登入 ' + role + ' 失敗（' + (err ? String(err.message || err) : 'HTTP ' + (r && r.status)) + '）；狀態：' + ent.state);
}

/* ───────── 清除：只刪 state==='created'（含查證後確定的）；HTTP 非 2xx 也算失敗；刪後逐項確認已不存在 ───────── */
async function cleanup(api) {
  const rep = { steps: [], failures: [], notDeleted: unresolved() };
  const step = async (name, fn, verify) => {
    try { const r = await fn(); if (r === null) return; const bad = !is2xx(r); rep.steps.push({ name, status: r.status, ok: !bad }); if (bad) { rep.failures.push(name + ' HTTP ' + r.status); return; }
      if (verify) { const v = await verify(); if (!v) rep.failures.push(name + ' 刪除後仍存在或無法確認'); } }
    catch (e) { rep.steps.push({ name, error: String(e.message || e) }); rep.failures.push(name + ' ' + String(e.message || e)); } };
  const emptyCheck = (q) => async () => { const v = await api.rest('GET', q); return is2xx(v) && Array.isArray(v.json) && v.json.length === 0; };
  const tk = createdIds('member_tickets'), bk = [...new Set(createdIds('bookings').concat((MF.extra && MF.extra.bookings) || []))];   // 含畫面新建、已納入清除的預約（它們的扣課帳／操作登記／版本計數也要清）
  for (const [t, ids] of Object.entries(MF.extra || {})) { const a = ids.filter(Boolean); if (a.length) await step('adopted ' + t, () => api.rest('DELETE', t + '?id=' + inList(a)), emptyCheck(t + '?id=' + inList(a) + '&select=id')); }
  if (tk.length) await step('ticket_logs by ticket', () => api.rest('DELETE', 'ticket_logs?ticket_id=' + inList(tk)), emptyCheck('ticket_logs?ticket_id=' + inList(tk) + '&select=id&limit=1'));
  if (bk.length) {
    await step('ticket_logs by booking', () => api.rest('DELETE', 'ticket_logs?booking_id=' + inList(bk)), emptyCheck('ticket_logs?booking_id=' + inList(bk) + '&select=id&limit=1'));
    await step('ticket_deduct_ops', () => api.rest('DELETE', 'ticket_deduct_ops?booking_id=' + inList(bk)), emptyCheck('ticket_deduct_ops?booking_id=' + inList(bk) + '&select=booking_id&limit=1'));
    await step('bookings', () => api.rest('DELETE', 'bookings?id=' + inList(bk)), emptyCheck('bookings?id=' + inList(bk) + '&select=id'));
    await step('booking_op_rev', () => api.rest('DELETE', 'booking_op_rev?booking_id=' + inList(bk)), emptyCheck('booking_op_rev?booking_id=' + inList(bk) + '&select=booking_id&limit=1'));
  }
  if (tk.length) await step('member_tickets', () => api.rest('DELETE', 'member_tickets?id=' + inList(tk)), emptyCheck('member_tickets?id=' + inList(tk) + '&select=id'));
  for (const t of ['members', 'employees', 'ticket_types', 'venues']) { const ids = createdIds(t); if (ids.length) await step(t, () => api.rest('DELETE', t + '?id=' + inList(ids)), emptyCheck(t + '?id=' + inList(ids) + '&select=id')); }
  for (const u of MF.users.filter(x => x.state === 'created' && x.id)) {
    await step('auth user ' + u.id, () => api.adminDeleteUser(u.id), async () => { const g = await api.adminGetUser(u.id); return g.status === 404; });
  }
  return rep;
}

/* ───────── 啟動時若有未完成 manifest：進入查證／恢復，不覆蓋舊清單 ───────── */
function loadUnfinishedManifest() {
  const f = path.join(WORK, 'manifest.json'); if (!fs.existsSync(f)) return null;
  try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); return m && m.finished === false ? m : null; } catch (_) { return { corrupt: true }; }
}
async function recover(api, old) {
  MF = old; const rep = { resolved: [], stillUnknown: [] };
  for (const [t, a] of Object.entries(MF.tables || {})) for (const ent of a.filter(x => x.state === 'planned' || x.state === 'unknown')) {
    try { const v = await api.rest('GET', t + '?id=eq.' + encodeURIComponent(ent.id) + '&select=id');
      if (is2xx(v) && Array.isArray(v.json)) { if (v.json.length && ent.checkedAbsent) { ent.state = 'created'; ent.verifiedAfterUnknown = true; rep.resolved.push(t + ':' + ent.id + '→created（建立前已證實不存在，現在存在＝本輪所建）'); } else if (!v.json.length) { ent.state = 'absent'; rep.resolved.push(t + ':' + ent.id + '→absent'); } else rep.stillUnknown.push(t + ':' + ent.id); } else rep.stillUnknown.push(t + ':' + ent.id);
    } catch (_) { rep.stillUnknown.push(t + ':' + ent.id); } }
  for (const u of (MF.users || []).filter(x => x.state === 'planned' || x.state === 'unknown')) {
    try { for (let page = 1; page < 20; page++) { const l = await api.adminListUsers(page, 200); const arr = is2xx(l) ? (Array.isArray(l.json) ? l.json : (l.json && l.json.users)) : null; if (!Array.isArray(arr)) { rep.stillUnknown.push('auth:' + u.email); break; }
        const hit = arr.find(x => x.email === u.email); if (hit) { u.id = hit.id; u.state = 'created'; rep.resolved.push('auth:' + u.email + '→created'); break; } if (arr.length < 200) { u.state = 'absent'; rep.resolved.push('auth:' + u.email + '→absent'); break; } } } catch (_) { rep.stillUnknown.push('auth:' + u.email); } }
  saveManifest(); return rep;
}

/* ───────── UI 走查新建資料：只收「可歸屬於本輪測試身分」的新列，其餘列為未歸屬（不刪、列給使用者）───────── */
function adoptUiRows(before, after, ownIds, ownEmpIds) {
  const adopted = {}, unattributed = [];
  const own = new Set(ownIds), emp = new Set(ownEmpIds);
  const refsOwn = (row) => Object.values(row).some(v => typeof v === 'string' && (own.has(v) || [...own].some(id => id.length > 6 && v.includes(id)))) || JSON.stringify(row).split('"').some(s => own.has(s));
  for (const [t, y] of Object.entries(after.tables)) {
    const x = before.tables[t] || { rows: {} };
    for (const id of Object.keys(y.rows).filter(k => !(k in x.rows))) {
      const row = y.data && y.data[id]; const mine = row && (emp.has(row.created_by) || emp.has(row.operator) || emp.has(row.actor_id) || refsOwn(row));
      if (mine && !String(id).startsWith('#')) (adopted[t] = adopted[t] || []).push(id); else unattributed.push(t + ':' + id);
    }
  }
  return { adopted, unattributed };
}

/* ───────── 整體判定：缺任何一項證據就不是「完整通過」───────── */
function classifyOverall({ fail, unverified, noUi, cleanOk, concurrencyVerified, uiEvidenceOk, clickEvidenceOk }) {
  const reasons = [...unverified]; if (clickEvidenceOk !== true) reasons.push('缺「從畫面按鈕觸發扣堂→取消退款」的實際點擊證據（需另跑 --click-only 並通過，再以 --click-report 帶入）'); if (noUi) reasons.push('--no-ui：未做畫面走查'); if (!uiEvidenceOk && !noUi) reasons.push('畫面走查證據不完整');
  if (!concurrencyVerified) reasons.push('真並行有項目未證明鎖等待');
  if (!cleanOk) reasons.push('執行器清除未完全成功');
  if (fail) return { status: 'FAILED', reasons };
  return reasons.length ? { status: 'UNVERIFIED', reasons } : { status: 'COMPLETE', reasons: [] };
}
function validateUiEvidence(text) {
  try { const e = JSON.parse(text); const missing = REQUIRED_UI_FLOWS.filter(f => !(e.flows && e.flows[f] === 'pass')); const bad = [];
    if (e.complete !== true) bad.push('complete≠true'); if (e.logoutConfirmed !== true) bad.push('未確認清除測試瀏覽器登入資料'); if (missing.length) bad.push('缺流程：' + missing.join('、'));
    return { ok: bad.length === 0, problems: bad }; } catch (_) { return { ok: false, problems: ['ui_done 不是有效的證據 JSON'] }; }
}


/* ───────── 「實際點擊扣堂」證據（--click-only）：不接受只靠自述；執行器自己每秒讀帳本與餘額，記下狀態轉折，與點擊時間對照 ───────── */
const CLICK_PHASES = ['deduct', 'cancel'];
function validateClickTimeline(tl, startRem) {
  const bad = []; if (!Array.isArray(tl) || !tl.length) return { ok: false, problems: ['沒有時間線'], at: {} };
  if (tl[0].rem !== startRem || tl[0].deducts !== 0 || tl[0].refunds !== 0) bad.push('起點不是「餘額 ' + startRem + '、無扣課帳、無退款帳」');
  const dIdx = tl.findIndex(x => x.deducts === 1 && x.refunds === 0 && x.rem === startRem - 1);
  const rIdx = tl.findIndex(x => x.deducts === 1 && x.refunds === 1 && x.rem === startRem);
  if (dIdx < 0) bad.push('沒有看到「恰一筆扣課帳、餘額減一」的狀態'); if (rIdx < 0) bad.push('沒有看到「恰一筆退款帳、餘額恢復」的狀態'); if (dIdx >= 0 && rIdx >= 0 && rIdx < dIdx) bad.push('退款出現在扣課之前');
  if (tl.some(x => x.deducts > 1 || x.refunds > 1 || x.rem < startRem - 1 || x.rem > startRem)) bad.push('出現多扣、多退或餘額超出範圍的狀態');
  return { ok: !bad.length, problems: bad, at: { deduct: dIdx >= 0 ? tl[dIdx].t : null, refund: rIdx >= 0 ? tl[rIdx].t : null } };
}
function validateClickEvidence(text, tlv) {
  const bad = []; let e = null; try { e = JSON.parse(text); } catch (_) { return { ok: false, problems: ['click_done 不是有效的證據 JSON'] }; }
  if (e.complete !== true) bad.push('complete≠true'); if (e.logoutConfirmed !== true) bad.push('未確認清除測試瀏覽器登入資料'); if (e.consoleCallsUsed !== false) bad.push('未聲明「沒有用控制台呼叫應用函式」（consoleCallsUsed 必須為 false）');
  const steps = Array.isArray(e.clickSteps) ? e.clickSteps : []; if (steps.length < 4) bad.push('點擊步驟少於 4 步');
  if (steps.some(x => !['click', 'type', 'select'].includes(x.action) || !x.at || !x.target)) bad.push('步驟必須有 action（click／type／select）、at（時間）、target（畫面上的元件名稱）');
  for (const ph of CLICK_PHASES) if (!steps.some(x => x.phase === ph && x.action === 'click')) bad.push('缺「' + ph + '」階段的實際點擊');
  const near = (a, b) => a && b && Date.parse(b) >= Date.parse(a) - 1000 && Date.parse(b) <= Date.parse(a) + 30000;
  const dClick = steps.filter(x => x.phase === 'deduct' && x.action === 'click').map(x => x.at), cClick = steps.filter(x => x.phase === 'cancel' && x.action === 'click').map(x => x.at);
  if (tlv && tlv.at) { if (!dClick.some(a => near(a, tlv.at.deduct))) bad.push('資料庫看到扣課的時間，沒有落在任何「扣堂階段點擊」之後 30 秒內'); if (!cClick.some(a => near(a, tlv.at.refund))) bad.push('資料庫看到退款的時間，沒有落在任何「取消階段點擊」之後 30 秒內');
    if (!cClick.some(a => Date.parse(a) >= Date.parse(tlv.at.deduct))) bad.push('取消的點擊必須在執行器觀測到扣課之後才進行'); }
  return { ok: !bad.length, problems: bad };
}
function classifyClick({ fail, unverified, cleanOk, timelineOk, evidenceOk }) {
  const reasons = [...unverified]; if (!timelineOk) reasons.push('時間線不符（執行器自己觀測到的扣課／退款轉折）'); if (!evidenceOk) reasons.push('點擊證據不完整'); if (!cleanOk) reasons.push('執行器清除未完全成功');
  if (fail) return { status: 'FAILED', reasons }; return reasons.length ? { status: 'UNVERIFIED', reasons } : { status: 'CLICK_COMPLETE', reasons: [] };
}

/* ───────── 隱藏輸入 ───────── */
async function askHidden(q) {
  if (!process.stdin.isTTY) throw new Error('需要在真正的終端機執行（隱藏輸入）');
  process.stdout.write(q); cp.execSync('stty -echo', { stdio: 'inherit' });
  const restore = () => { try { cp.execSync('stty echo', { stdio: 'inherit' }); } catch (_) {} };
  process.once('exit', restore);
  try { return await new Promise((res) => { let s = ''; process.stdin.setEncoding('utf8'); const on = (d) => { s += d; if (s.includes('\n')) { process.stdin.off('data', on); process.stdin.pause(); res(s.split('\n')[0].trim()); } }; process.stdin.on('data', on); process.stdin.resume(); }); }
  finally { restore(); process.stdout.write('\n'); }
}

/* ───────── 真並行：持鎖者在 pg_stat_activity 親眼看到等候者被自己擋住，才算證明 ───────── */
async function overlap(api, jwt, name, holder, waiter) {
  const call = (c, role) => api.rpcAs('zz_cc_overlap', { p_kind: c.kind, p_a: c.a, p_b: c.b || null, p_c: c.c || null, p_role: role, p_poll_ms: 5000 }, jwt);   // 小於 authenticated 的 8 秒 statement_timeout，持鎖者不會被逾時取消
  const hp = call(holder, 'holder'); await new Promise(r => setTimeout(r, 250));      // 只用來排定誰先拿鎖，不是證據
  const t0 = Date.now(); const [hr, wr] = await Promise.all([hp, call(waiter, 'waiter')]); const h = hr.json, w = wr.json;
  const raw = { holder: { status: hr.status, body: h && h.pid ? undefined : JSON.stringify(h).slice(0, 300) }, waiter: { status: wr.status, body: w && w.pid ? undefined : JSON.stringify(w).slice(0, 300) }, totalMs: Date.now() - t0 };
  const ts = (s) => s ? Date.parse(s) : NaN;
  const ev = { name, raw, holderPid: h && h.pid, waiterPid: w && w.pid, holderTxid: h && h.txid, waiterTxid: w && w.txid, holderEnd: h && h.end, waiterStart: w && w.start, waiterLockAcquiredAt: w && w.locks_acquired_at, holderObservedBlocked: h && h.blocked_waiters, holderResult: h && h.result, waiterResult: w && w.result };
  ev.differentPids = !!(h && w && h.pid && w.pid && h.pid !== w.pid);
  ev.timeOverlap = ts(w && w.start) < ts(h && h.end) && ts(w && w.locks_acquired_at) >= ts(h && h.end) - 1;
  ev.lockWaitObserved = !!(h && Array.isArray(h.blocked_waiters) && h.blocked_waiters.some(b => b.pid === (w && w.pid) && b.blocked_by_me));
  ev.verified = ev.differentPids && ev.timeOverlap && ev.lockWaitObserved; return ev;
}

/* ───────── 主流程 ───────── */
async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const envPath = opt('--env'); if (!envPath) throw new Error('缺 --env <.env.test>');
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (env.SB_URL !== BASE) throw new Error('.env.test 的 SB_URL 不是測試庫'); const anon = env.ANON_KEY; if (!anon) throw new Error('.env.test 缺 ANON_KEY');
  process.on('SIGINT', () => requestStop('SIGINT')); process.on('SIGTERM', () => requestStop('SIGTERM'));
  const old = loadUnfinishedManifest();
  log('這支執行器只會碰測試庫 ' + REF + '。接受的金鑰：舊版 JWT 形式的 service_role（不接受新版 sb_secret_…）。');
  const serviceKey = await askHidden('測試庫 service_role 金鑰> '); const bad = checkServiceKey(serviceKey); if (bad) throw new Error(bad);
  const api = makeApi(serviceKey, anon), apiClean = makeApi(serviceKey, anon, { noStop: true });
  if (old) {            // ── 恢復模式：不建立任何新東西、不覆蓋舊清單 ──
    log('⚠ 偵測到上次未完成的 manifest（' + (old.runId || '損毀') + '）。進入查證／恢復流程：只查證並清除上次確定建立的項目，不建立任何新東西。');
    if (old.corrupt) throw new Error('manifest 損毀，無法安全恢復；請把 ' + path.join(WORK, 'manifest.json') + ' 交給 Claude 檢查（不要手動刪）');
    const rr = await recover(apiClean, old); log('  查證：' + JSON.stringify(rr));
    const rep = await cleanup(apiClean); const still = unresolved();
    log('  清除失敗：' + (rep.failures.length ? rep.failures.join('；') : '無') + '；仍無法確認：' + (still.length ? still.join('、') : '無'));
    if (!rep.failures.length && !still.length) { MF.finished = true; MF.recoveredAt = new Date().toISOString(); saveManifest(); fs.renameSync(path.join(WORK, 'manifest.json'), path.join(WORK, 'manifest.recovered-' + Date.now() + '.json')); log('✓ 恢復完成並已封存舊 manifest。請重新執行以進行新一輪驗收。'); process.exitCode = 0; }
    else { log('✗ 恢復未完成：舊 manifest 保留不動，請交給 Claude 檢視（不要手動刪）。'); process.exitCode = 1; } return;
  }
  const runId = crypto.randomBytes(3).toString('hex'); MF = newManifest(runId); saveManifest();
  const evidence = { runId, startedAt: new Date().toISOString(), cases: {} };
  let snapBefore = null, snapAfter = null, cleanRep = null, pwds = {}, jwts = {}, sessions = {}, servers = [], uiOk = false, concurrencyAll = true, adoptRep = { adopted: {}, unattributed: [] };
  const id = (s) => 'CC-' + s + '-' + runId, EMP = (r) => 'CC-EMP-' + runId + '-' + r;     // 每輪唯一；CC-EMP- 前綴是觀測函式的身分白名單
  const ids = { T: id('T'), M: id('M'), MEM: id('MEM'), TK: [1, 2, 3, 4, 5].map(n => id('TK' + n)), B: [1, 2, 3, 4, 5, 6].map(n => id('B' + n)), empDesk: EMP('DESK'), empCoach: EMP('COACH') };
  try {
    log('═══ 0. 核對專案身分（不符立即停止）═══');
    const emp = await api.rest('GET', 'employees?select=id'); if (!is2xx(emp) || !Array.isArray(emp.json)) throw new Error('身分核對讀取失敗（HTTP ' + emp.status + '），停止');
    if (!['e_admin', 'e_fd', 'e_coach'].every(i => emp.json.some(r => r.id === i))) throw new Error('這不像測試庫（缺特徵員工 e_admin／e_fd／e_coach），停止，尚未建立任何東西');
    ok('金鑰被測試庫接受，且測試庫特徵員工都在', true);
    log('═══ 1. 前置檢查（不符立即停止）═══');
    for (const [fn, pb] of Object.entries(PROBE_ARGS)) { const r = await api.probe(fn, pb); if (!(r.status === 401 || r.status === 403)) throw new Error(fn + ' 檢查不符（匿名呼叫應為 401／403；實得 HTTP ' + r.status + '）——階段 06／08／觀測函式尚未正確安裝或權限不符，停止，尚未建立任何東西'); ok(fn + ' 已安裝且匿名被拒（HTTP ' + r.status + '）', true); }
    log('═══ 2. 測前基準（任何必要讀取失敗就停止）═══'); guard(); snapBefore = await snapshot(api);
    log('  表數 ' + Object.keys(snapBefore.tables).length + '；登入帳號 ' + snapBefore.authUsers.count + ' 個（既有帳號不會被動到）；每輪唯一夾具 id 尾碼 ' + runId);
    log('═══ 3. 透過官方 Auth 管理介面建立 3 個專屬登入 ═══');
    const U = {}; for (const role of ['desk', 'coach', 'member']) { pwds[role] = crypto.randomBytes(18).toString('base64url') + 'aA1!'; U[role] = await trackedCreateUser(api, role, 'cc-' + role + '-' + runId + '@cc-test.yugym.local', pwds[role]); ok('建立 ' + role + ' 登入（已確認由本輪建立）', U[role].state === 'created'); }
    log('═══ 4. 連動資料與夾具（每個 id 建前確認不存在，建成才登記為可清除）═══');
    await trackedInsert(api, 'employees', { id: ids.empDesk, auth_id: U.desk.id, name: 'CC櫃檯', role: 'front_desk', status: 'active' });
    await trackedInsert(api, 'employees', { id: ids.empCoach, auth_id: U.coach.id, name: 'CC教練', role: 'coach', status: 'active' });
    await trackedInsert(api, 'members', { id: ids.MEM, name: 'CC會員(登入)', auth_id: U.member.id }); await trackedInsert(api, 'members', { id: ids.M, name: 'CC預約會員' });
    await trackedInsert(api, 'ticket_types', { id: ids.T, name: 'CC', category: '小班肌力' });
    const rems = [6, 1, 6, 6, 6]; for (let i = 0; i < 5; i++) await trackedInsert(api, 'member_tickets', { id: ids.TK[i], member_id: ids.M, ticket_type_id: ids.T, plan_name: 'CC票' + (i + 1), sessions_total: 8, sessions_remaining: rems[i], status: 'usable', unlocked_sessions: 8 });
    for (let i = 0; i < 6; i++) await trackedInsert(api, 'bookings', { id: ids.B[i], category: '小班肌力', date: new Date(Date.now() + (5 + i) * 864e5).toISOString().slice(0, 10), start_time: '19:00', duration: 60, status: 'booked', member_ids: [ids.M], attendance: {}, seat_tickets: {}, max_heads: 5 });
    ok('夾具建立完成（員工 2、會員 2、票種 1、票 5、預約 6）', true);
    log('═══ 5. 登入取得 JWT（只在記憶體）═══');
    for (const role of ['desk', 'coach', 'member']) { guard(); const r = await api.signIn(U[role].email, pwds[role]); if (!(is2xx(r) && r.json && r.json.access_token)) throw new Error(role + ' 登入失敗（HTTP ' + r.status + '）'); jwts[role] = r.json.access_token; sessions[role] = r.json; ok(role + ' 登入成功', true); }
    log('═══ 6. 匿名與角色 HTTP ═══');
    const child = (script, extra) => { const p = cp.spawnSync('node', [path.join(__dirname, script)], { env: Object.assign({}, process.env, { SB_URL: BASE, ANON_KEY: anon }, extra), encoding: 'utf8', timeout: 120000 }); const out = (p.stdout || '') + (p.stderr || ''); log(out.split('\n').map(l => '  ' + l).join('\n').replace(/\n\s*$/, '')); return { code: p.status, summary: (out.match(/結果：.*/) || [''])[0] }; };
    guard(); const a = child('http_anon_check.js'); ok('匿名邊界檢查通過', a.code === 0, a.summary);
    guard(); const rr = child('http_roles.js', { JWT_DESK: jwts.desk, JWT_COACH: jwts.coach, JWT_MEMBER: jwts.member, CC_BOOKING: ids.B[0], CC_TICKET: ids.TK[2] }); ok('角色 HTTP 檢查通過', rr.code === 0, rr.summary); evidence.http = { anon: a.summary, roles: rr.summary };
    log('═══ 7. 真並行（持鎖者在 pg_stat_activity 觀測到等候者被自己擋住才算證明；斷言同時核對餘額、扣退帳本、預約狀態）═══');
    const D = (c) => Object.assign({ kind: 'deduct' }, c);
    const read = async (t, q) => { const r = await api.rest('GET', t + '?' + q); if (!is2xx(r) || !Array.isArray(r.json)) throw new Error('讀取 ' + t + ' 失敗 HTTP ' + r.status); return r.json; };
    const st = async (tk, bk) => ({ rem: (await read('member_tickets', 'id=eq.' + tk + '&select=sessions_remaining'))[0].sessions_remaining,
      deducts: (await read('ticket_logs', 'ticket_id=eq.' + tk + '&booking_id=eq.' + bk + '&action=eq.deduct&select=id')).length, refunds: (await read('ticket_logs', 'ticket_id=eq.' + tk + '&booking_id=eq.' + bk + '&action=eq.refund&select=id')).length,
      status: (await read('bookings', 'id=eq.' + bk + '&select=status'))[0].status });
    const rec = (ev) => { evidence.cases[ev.name] = ev; if (!ev.verified) { concurrencyAll = false; unv('真並行「' + ev.name + '」未證明鎖等待（pid 不同=' + ev.differentPids + '、時間重疊=' + ev.timeOverlap + '、觀測到被擋=' + ev.lockWaitObserved + '）'); } };
    // 暖機：讓 PostgREST 先建好多條連線（對不存在的預約，立即回 NO_BOOKING；沒有任何寫入）
    for (let i = 0; i < 3; i++) { guard(); await Promise.all([1, 2, 3, 4].map(() => api.rpcAs('zz_cc_overlap', { p_kind: 'deduct', p_a: 'CC-WARM', p_b: 'CC-WARM', p_c: null, p_role: 'waiter' }, jwts.desk))); }
    guard(); let ev = await overlap(api, jwts.desk, 'dup-same-booking', D({ a: ids.TK[0], b: ids.B[0] }), D({ a: ids.TK[0], b: ids.B[0] })); rec(ev); let s = await st(ids.TK[0], ids.B[0]);
    ok('① 同預約同時重複扣：鎖等待已觀測（不同 pid、時間重疊）', ev.verified, ev);
    ok('① 餘額 6→5、扣課帳 1 筆、退款帳 0、預約仍 booked；一方 already', s.rem === 5 && s.deducts === 1 && s.refunds === 0 && s.status === 'booked' && [ev.holderResult, ev.waiterResult].filter(x => x && x.already === true).length === 1, { s, r: [ev.holderResult, ev.waiterResult] });
    guard(); ev = await overlap(api, jwts.desk, 'last-session', D({ a: ids.TK[1], b: ids.B[1] }), D({ a: ids.TK[1], b: ids.B[2] })); rec(ev);
    const s2a = await st(ids.TK[1], ids.B[1]), s2b = await st(ids.TK[1], ids.B[2]);
    ok('② 搶最後一堂：鎖等待已觀測', ev.verified, ev);
    ok('② 餘額 1→0、兩張預約合計扣課帳恰 1 筆、無退款、預約都仍 booked；一方 NO_REMAINING', s2a.rem === 0 && s2a.deducts + s2b.deducts === 1 && s2a.refunds + s2b.refunds === 0 && s2a.status === 'booked' && s2b.status === 'booked' && [ev.holderResult, ev.waiterResult].some(x => x && x.error_code === 'NO_REMAINING') && [ev.holderResult, ev.waiterResult].filter(x => x && x.ok === true).length === 1, { s2a, s2b, r: [ev.holderResult, ev.waiterResult] });
    guard(); ev = await overlap(api, jwts.desk, 'cancel-holds-then-deduct', { kind: 'cancel', a: ids.B[3], b: 'auto' }, D({ a: ids.TK[2], b: ids.B[3] })); rec(ev); s = await st(ids.TK[2], ids.B[3]);
    ok('③a 取消先持鎖、扣堂等候：鎖等待已觀測', ev.verified, ev);
    ok('③a 預約 cancelled、餘額不因該預約減少、無扣課帳、無退款帳；扣堂被拒 BOOKING_CANCELLED', s.status === 'cancelled' && s.deducts === 0 && s.refunds === 0 && (ev.waiterResult || {}).error_code === 'BOOKING_CANCELLED', { s, w: ev.waiterResult });
    const remBefore3b = (await st(ids.TK[3], ids.B[4])).rem;
    guard(); ev = await overlap(api, jwts.desk, 'deduct-holds-then-cancel', D({ a: ids.TK[3], b: ids.B[4] }), { kind: 'cancel', a: ids.B[4], b: 'auto' }); rec(ev); s = await st(ids.TK[3], ids.B[4]);
    ok('③b 扣堂先持鎖、取消等候：鎖等待已觀測', ev.verified, ev);
    ok('③b 預約 cancelled、扣課帳 1 筆且退款帳 1 筆（淨 0）、餘額回到 ' + remBefore3b + '；取消結果 refunded', s.status === 'cancelled' && s.deducts === 1 && s.refunds === 1 && s.rem === remBefore3b && (ev.waiterResult || {}).outcome === 'refunded', { s, w: ev.waiterResult });
    const rv = (await api.rpcAs('fn_desk_booking_rev', { p_booking_id: ids.B[5] }, jwts.desk)).json; const op = (await api.rpcAs('fn_desk_op_begin', { p_slot: 'cc:same-op', p_ticket_id: ids.TK[4], p_booking_id: ids.B[5], p_expect_rev: String(rv && rv.rev) }, jwts.desk)).json;
    if (!(op && op.ok && op.op_key)) throw new Error('操作登記失敗，無法測相同操作並行：' + JSON.stringify(op));
    guard(); ev = await overlap(api, jwts.desk, 'same-op-key', { kind: 'opdeduct', a: ids.TK[4], b: ids.B[5], c: op.op_key }, { kind: 'opdeduct', a: ids.TK[4], b: ids.B[5], c: op.op_key }); rec(ev); s = await st(ids.TK[4], ids.B[5]);
    ok('④ 相同操作識別同時送出：鎖等待已觀測', ev.verified, ev);
    ok('④ 餘額 6→5、扣課帳 1 筆、無退款、預約仍 booked；一方 ok、一方 already', s.rem === 5 && s.deducts === 1 && s.refunds === 0 && s.status === 'booked' && [ev.holderResult, ev.waiterResult].filter(x => x && x.ok === true && !x.already).length === 1 && [ev.holderResult, ev.waiterResult].some(x => x && x.already === true), { s, r: [ev.holderResult, ev.waiterResult] });
    evidence.concurrencyNote = '證明條件＝不同後端 pid＋等候者在持鎖者結束前開始且於其結束後才取得鎖＋持鎖者於 pg_stat_activity 觀測到等候者被自己擋住；缺一標未驗證。';
    // 8. 畫面走查
    if (flag('--no-ui')) unv('--no-ui：未做新舊前端畫面走查');
    else if (!stopping) {
      log('═══ 8. 新舊前端畫面走查（等待）═══');
      const siteDirs = {}; for (const d of ['new', 'old']) { siteDirs[d] = path.join(WORK, 'site', d); fs.mkdirSync(siteDirs[d], { recursive: true }); }
      const repo = cp.execSync('git rev-parse --show-toplevel', { cwd: __dirname, encoding: 'utf8' }).trim();
      for (const f of ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png']) { try { fs.copyFileSync(path.join(repo, f), path.join(siteDirs.new, f)); } catch (_) {} }
      fs.writeFileSync(path.join(siteDirs.old, 'index.html'), cp.execSync('git show origin/master:index.html', { cwd: repo, maxBuffer: 1 << 28 }));
      for (const d of ['new', 'old']) { fs.writeFileSync(path.join(siteDirs[d], 'config.js'), "window.YUGYM_CONFIG = { url: '" + BASE + "', anonKey: '" + anon + "', lineLiffId: '', lineLoginChannelId: '' };"); fs.writeFileSync(path.join(siteDirs[d], 'sw.js'), ''); }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
      const serve = (dir, port) => new Promise((res) => { const s = http.createServer((q, r) => {
        const u = new URL(q.url, 'http://x');
        if (u.pathname === '/cc-login') { const se = sessions[u.searchParams.get('role')]; if (!se) { r.writeHead(404); return r.end('no session'); } const val = JSON.stringify({ access_token: se.access_token, refresh_token: se.refresh_token, expires_at: se.expires_at, expires_in: se.expires_in, token_type: 'bearer', user: se.user });
          r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return r.end('<!doctype html><script>localStorage.setItem("sb-' + REF + '-auth-token", ' + JSON.stringify(val) + ');location.replace("/");</script>'); }
        if (u.pathname === '/cc-logout') { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return r.end('<!doctype html><body>logout<script>Object.keys(localStorage).filter(function(k){return k.indexOf("sb-")===0}).forEach(function(k){localStorage.removeItem(k)});sessionStorage.clear();document.body.setAttribute("data-cleared","1");document.title="cleared:"+Object.keys(localStorage).filter(function(k){return k.indexOf("sb-")===0}).length;</script>'); }
        const p = u.pathname === '/' ? '/index.html' : u.pathname; const fp = path.join(dir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
        fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream' }); r.end(b); }); }).listen(port, '127.0.0.1', () => res(s)); });
      servers.push(await serve(siteDirs.new, 8101), await serve(siteDirs.old, 8102));
      fs.writeFileSync(path.join(WORK, 'ui_ready.json'), JSON.stringify({ new: 'http://127.0.0.1:8101', old: 'http://127.0.0.1:8102', login: { desk: '/cc-login?role=desk', coach: '/cc-login?role=coach', member: '/cc-login?role=member' }, logout: '/cc-logout', fixtureIds: ids, requiredFlows: REQUIRED_UI_FLOWS, note: '/cc-login 會把測試登入 session 寫進測試瀏覽器的 localStorage；走查完必須先開 /cc-logout 清除。走查中新建的資料若可歸屬於本輪測試身分，收尾時會納入清除；無法歸屬者只列出、不刪。證據格式：ui_done 為 JSON {complete:true, logoutConfirmed:true, flows:{<requiredFlows>:"pass"}}' }, null, 2));
      log('  新前端 http://127.0.0.1:8101  舊前端 http://127.0.0.1:8102（登入 /cc-login?role=desk|coach|member；登出 /cc-logout）');
      log('  繼續步驟：走查完成並清除瀏覽器登入資料後，由 Claude 寫入 ' + path.join(WORK, 'ui_done') + '（證據 JSON）。在這裡按 Enter 只會提早結束並標為「未驗證」。');
      const doneFile = path.join(WORK, 'ui_done'); try { fs.unlinkSync(doneFile); } catch (_) {}
      const how = await new Promise((res) => { const t0 = Date.now(), lim = Number(opt('--ui-timeout-min', '40')) * 60000; const onKey = () => { clearInterval(iv); res('enter'); }; process.stdin.setEncoding('utf8'); process.stdin.once('data', onKey); process.stdin.resume();
        const iv = setInterval(() => { const fin = (w) => { process.stdin.off('data', onKey); process.stdin.pause(); clearInterval(iv); res(w); }; if (fs.existsSync(doneFile)) fin('file'); else if (stopping) fin('signal'); else if (Date.now() - t0 > lim) fin('timeout'); }, 1000); });
      if (how === 'file') { const txt = fs.readFileSync(doneFile, 'utf8'); const v = validateUiEvidence(txt); evidence.uiWalkthrough = txt.slice(0, 4000); uiOk = v.ok; if (!v.ok) unv('畫面走查證據不完整：' + v.problems.join('；')); else ok('新舊前端畫面走查證據完整（含清除測試瀏覽器登入資料）', true); }
      else unv('畫面走查未取得完成證據（結束方式：' + how + '）');
    }
    if (stopping) throw new Error('STOPPED');
  } catch (e) { if (String(e.message) === 'STOPPED') { unv('執行被中斷（SIGINT／SIGTERM）'); } else { fail++; log('✗ 流程中止：' + String(e.message || e)); } evidence.abortedBy = String(e.message || e); }
  finally {
    log('═══ 9. 執行器收尾：納入走查新建資料 → 依精確 id 清除 → 測前後基準比對 ═══');
    for (const s of servers) { try { s.close(); } catch (_) {} }
    pwds = {}; jwts = {};                                   // 憑證離開記憶體；session 物件在最後一步前保留給 /cc-login，這裡一併清空
    sessions = {};
    try {
      if (snapBefore) { const snapNow = await snapshot(apiClean); const ownIds = [ids.T, ids.M, ids.MEM, ids.empDesk, ids.empCoach, ...ids.TK, ...ids.B]; adoptRep = adoptUiRows(snapBefore, snapNow, ownIds, [ids.empDesk, ids.empCoach]);
        for (const [t, a] of Object.entries(adoptRep.adopted)) { MF.extra[t] = (MF.extra[t] || []).concat(a.filter(x => !createdIds(t).includes(x))); }
        const ex = {}; for (const [t, a] of Object.entries(MF.extra)) { const own2 = new Set(createdIds(t)); const rest = a.filter(x => !own2.has(x)); if (rest.length) ex[t] = rest; } MF.extra = ex; saveManifest();
        const n = Object.values(adoptRep.adopted).reduce((s, a) => s + a.length, 0); log('  納入本輪清除的走查新建資料（可歸屬於本輪測試身分）：' + n + ' 筆；無法歸屬（不刪、列出）：' + adoptRep.unattributed.length + ' 筆'); }
    } catch (e) { log('  ⚠ 無法計算走查新建資料：' + String(e.message || e)); }
    try { cleanRep = await cleanup(apiClean); } catch (e) { cleanRep = { steps: [], failures: ['清除程序錯誤：' + String(e.message || e)], notDeleted: unresolved() }; }
    let d = null; try { if (snapBefore) { snapAfter = await snapshot(apiClean); d = diffSnap(snapBefore, snapAfter); } } catch (e) { cleanRep.failures.push('測後快照失敗：' + String(e.message || e)); }
    const nd = unresolved(); const cleanOk = !!(d && d.tablesChanged.length === 0 && !d.authUsersChanged && cleanRep && cleanRep.failures.length === 0 && nd.length === 0);   // 無法歸屬的列若仍留在資料庫，會出現在「測後 vs 測前」的差異裡而判失敗；已被精確 id 清掉的（含 booking_op_rev／ticket_deduct_ops 這類無 id 列）不算
    log('  清除步驟：' + cleanRep.steps.map(s => s.name + (s.ok === false || s.error ? '×' : '✓')).join('、')); if (cleanRep.failures.length) log('  清除失敗：' + cleanRep.failures.join('；'));
    if (nd.length) log('  結果不明、未刪除：' + nd.join('、')); if (adoptRep.unattributed.length) log('  走查前後新增、無法以 id 歸屬的列：' + adoptRep.unattributed.length + ' 筆（若仍殘留會反映在下方「資料表差異」；已被精確 id 清除者不影響判定）');
    if (d) { log('  資料表差異：' + (d.tablesChanged.length ? JSON.stringify(d.tablesChanged) : '無（與測前逐列相同）')); log('  登入帳號：' + (d.authUsersChanged ? '與測前不同！' : '與測前相同（既有帳號未動）')); }
    ok('執行器清除後資料與登入帳號回到測前基準', cleanOk, { failures: cleanRep.failures, diff: d && d.tablesChanged.length });
    if (cleanOk) { MF.finished = true; MF.finishedAt = new Date().toISOString(); saveManifest(); }
    else { try { fs.writeFileSync(path.join(WORK, 'leftover_objects.json'), JSON.stringify({ note: '清除未完全成功；以下為本輪建立或不明的精確 id（不含憑證）。下次啟動會自動進入查證／恢復流程，只處理這些', manifest: MF, notDeleted: nd, unattributed: adoptRep.unattributed, diff: d }, null, 2), { mode: 0o600 }); } catch (_) {} log('  ⚠ 已保留 ' + path.join(WORK, 'leftover_objects.json') + '；請勿手動批次刪除，重新執行本執行器會先進入查證／恢復。'); }
    let clickOk = false; try { const cr = JSON.parse(fs.readFileSync(opt('--click-report', path.join(WORK, 'click_report.json')), 'utf8')); clickOk = !!(cr && cr.mode === 'click-only' && cr.overall && cr.overall.status === 'CLICK_COMPLETE'); evidence.clickReportStatus = cr.overall && cr.overall.status; } catch (_) {}
    const overall = classifyOverall({ fail, unverified, noUi: flag('--no-ui'), cleanOk, concurrencyVerified: concurrencyAll, uiEvidenceOk: uiOk, clickEvidenceOk: clickOk });
    const report = { finishedAt: new Date().toISOString(), overall, pass, fail, results, unverified, cleanup: cleanRep, diff: d, adoptRep, evidence, manifest: MF, phase2: '階段 06／08／觀測函式尚未移除——需另行執行 phase_remove_testdb.sql 並核對基準；兩個階段都完成才算收尾', nonRestorable: ['Auth 稽核紀錄（auth.audit_log_entries）會留下本輪登入／建立／刪除帳號事件，無法用管理介面還原；session 與 refresh token 隨帳號刪除一併消失', '測試瀏覽器 localStorage 的登入資料需由 /cc-logout 清除（ui_done 證據的 logoutConfirmed）'] };
    try { fs.writeFileSync(path.join(WORK, 'final_acceptance_report.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); } catch (_) {}
    log('\n整體判定：' + overall.status + (overall.reasons.length ? '（' + overall.reasons.join('；') + '）' : '') + '\n結果：' + pass + ' 通過／' + fail + ' 失敗／' + unverified.length + ' 項未驗證；報告：' + path.join(WORK, 'final_acceptance_report.json'));
    log('提醒：這只完成「執行器清除」。階段 06／08／觀測函式的移除與基準核對由 Claude 接著做，兩者都完成才算收尾。');
    process.exitCode = overall.status === 'COMPLETE' ? 0 : (overall.status === 'FAILED' ? 1 : 3);
  }
}


/* ───────── --click-only：只跑「畫面按鈕觸發扣堂→畫面取消退款」這一條；不跑並行、不跑舊前端、不跑函式整合 ───────── */
async function clickMain() {
  fs.mkdirSync(WORK, { recursive: true });
  const envPath = opt('--env'); if (!envPath) throw new Error('缺 --env <.env.test>');
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (env.SB_URL !== BASE) throw new Error('.env.test 的 SB_URL 不是測試庫'); const anon = env.ANON_KEY; if (!anon) throw new Error('.env.test 缺 ANON_KEY');
  process.on('SIGINT', () => requestStop('SIGINT')); process.on('SIGTERM', () => requestStop('SIGTERM'));
  if (loadUnfinishedManifest()) throw new Error('偵測到未完成的 manifest；請先用完整執行器（不帶 --click-only）進入恢復流程');
  log('【--click-only】只碰測試庫 ' + REF + '；只測一條畫面流程。接受的金鑰：舊版 JWT 形式的 service_role。');
  const serviceKey = await askHidden('測試庫 service_role 金鑰> '); const bad = checkServiceKey(serviceKey); if (bad) throw new Error(bad);
  const api = makeApi(serviceKey, anon), apiClean = makeApi(serviceKey, anon, { noStop: true });
  const runId = crypto.randomBytes(3).toString('hex'); MF = newManifest(runId); saveManifest();
  const evidence = { mode: 'click-only', runId, startedAt: new Date().toISOString() };
  let snapBefore = null, snapAfter = null, cleanRep = null, pwd = {}, sess = {}, servers = [], tlv = { ok: false, problems: ['未取得'] }, evOk = false, adoptRep = { adopted: {}, unattributed: [] }, timeline = [], pollStop = false;
  const id = (x) => 'CC-' + x + '-' + runId, EMP = (r) => 'CC-EMP-' + runId + '-' + r;
  const ids = { T: id('T'), M: id('M'), TK: id('TK1'), empDesk: EMP('DESK'), empCoach: EMP('COACH') };
  const START_REM = 6;
  try {
    log('═══ 0. 核對專案身分與前置（08 已安裝、匿名被拒）═══');
    const emp = await api.rest('GET', 'employees?select=id'); if (!is2xx(emp) || !Array.isArray(emp.json) || !['e_admin', 'e_fd', 'e_coach'].every(i => emp.json.some(r => r.id === i))) throw new Error('這不像測試庫，停止，尚未建立任何東西'); ok('金鑰被測試庫接受，且測試庫特徵員工都在', true);
    for (const fn of ['fn_desk_booking_rev', 'fn_desk_cancel_booking', 'fn_desk_op_begin', 'fn_desk_deduct_ticket']) { const r = await api.probe(fn, PROBE_ARGS[fn]); if (!(r.status === 401 || r.status === 403)) throw new Error(fn + ' 檢查不符（HTTP ' + r.status + '）——階段 08 尚未安裝，停止，尚未建立任何東西'); ok(fn + ' 已安裝且匿名被拒（HTTP ' + r.status + '）', true); }
    guard(); snapBefore = await snapshot(api); log('  表數 ' + Object.keys(snapBefore.tables).length + '；登入帳號 ' + snapBefore.authUsers.count + ' 個（既有帳號不會被動到）；夾具 id 尾碼 ' + runId);
    log('═══ 1. 建立 2 個專屬登入（櫃檯、教練）與夾具：1 位會員、1 張綁在該會員的票（尚未扣堂）═══');
    const U = {}; for (const role of ['desk', 'coach']) { pwd[role] = crypto.randomBytes(18).toString('base64url') + 'aA1!'; U[role] = await trackedCreateUser(api, role, 'cc-' + role + '-' + runId + '@cc-test.yugym.local', pwd[role]); ok('建立 ' + role + ' 登入（已確認由本輪建立）', U[role].state === 'created'); }
    await trackedInsert(api, 'employees', { id: ids.empDesk, auth_id: U.desk.id, name: 'CC櫃檯', role: 'front_desk', status: 'active' });
    await trackedInsert(api, 'employees', { id: ids.empCoach, auth_id: U.coach.id, name: 'CC教練', role: 'coach', status: 'active' });
    await trackedInsert(api, 'members', { id: ids.M, name: 'CC點擊會員', status: 'active' }); await trackedInsert(api, 'ticket_types', { id: ids.T, name: 'CC團課', category: '小班肌力' });
    // 測試庫的場地表只有「跑步機」（只排自主訓練），前端會用它覆寫內建場地 → 沒有團課教室就建不了團課。補一間（id 必須是 group：VENUE_BY_CAT 以此指定團課場地；建前確認不存在、建成才登記、清除時依精確 id 刪）
    await trackedInsert(api, 'venues', { id: 'group', name: '團課教室', active: true, capacity: 1, categories: ['小班肌力'], sort_order: 1 });
    await trackedInsert(api, 'member_tickets', { id: ids.TK, member_id: ids.M, ticket_type_id: ids.T, plan_name: 'CC點擊票', sessions_total: 8, sessions_remaining: START_REM, status: 'usable', unlocked_sessions: 8 });
    ok('夾具建立完成（員工 2、會員 1、票種 1、票 1＝餘額 ' + START_REM + '、團課教室 1、無任何預約與帳本）', true);
    const sr = await api.signIn(U.desk.email, pwd.desk); if (!(is2xx(sr) && sr.json && sr.json.access_token)) throw new Error('desk 登入失敗（HTTP ' + sr.status + '）'); sess.desk = sr.json; ok('desk 登入成功', true);
    log('═══ 2. 只啟動新前端（127.0.0.1:8101），等待畫面操作；執行器每秒獨立觀測帳本與餘額 ═══');
    const siteDir = path.join(WORK, 'site', 'new'); fs.mkdirSync(siteDir, { recursive: true }); const repo = cp.execSync('git rev-parse --show-toplevel', { cwd: __dirname, encoding: 'utf8' }).trim();
    for (const f of ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png']) { try { fs.copyFileSync(path.join(repo, f), path.join(siteDir, f)); } catch (_) {} }
    fs.writeFileSync(path.join(siteDir, 'config.js'), "window.YUGYM_CONFIG = { url: '" + BASE + "', anonKey: '" + anon + "', lineLiffId: '', lineLoginChannelId: '' };"); fs.writeFileSync(path.join(siteDir, 'sw.js'), '');
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
    servers.push(await new Promise((res) => { const sv = http.createServer((q, r) => { const u = new URL(q.url, 'http://x');
      if (u.pathname === '/cc-login') { const se = sess.desk; if (!se || u.searchParams.get('role') !== 'desk') { r.writeHead(404); return r.end('no session'); } const val = JSON.stringify({ access_token: se.access_token, refresh_token: se.refresh_token, expires_at: se.expires_at, expires_in: se.expires_in, token_type: 'bearer', user: se.user }); r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return r.end('<!doctype html><script>localStorage.setItem("sb-' + REF + '-auth-token", ' + JSON.stringify(val) + ');location.replace("/");</script>'); }
      if (u.pathname === '/cc-logout') { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return r.end('<!doctype html><body>logout<script>Object.keys(localStorage).filter(function(k){return k.indexOf("sb-")===0}).forEach(function(k){localStorage.removeItem(k)});sessionStorage.clear();document.title="cleared:"+Object.keys(localStorage).filter(function(k){return k.indexOf("sb-")===0}).length;</script>'); }
      const p = u.pathname === '/' ? '/index.html' : u.pathname; const fp = path.join(siteDir, path.normalize(p).replace(/^(\.\.[/\\])+/, '')); fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': mime[path.extname(fp)] || 'application/octet-stream' }); r.end(b); }); }).listen(8101, '127.0.0.1', () => res(sv)); }));
    const rd = async (t, q) => { const r = await api.rest('GET', t + '?' + q); if (!is2xx(r) || !Array.isArray(r.json)) throw new Error('讀取 ' + t + ' 失敗 HTTP ' + r.status); return r.json; };
    const observe = async () => { const rem = (await rd('member_tickets', 'id=eq.' + ids.TK + '&select=sessions_remaining'))[0].sessions_remaining; const lg = await rd('ticket_logs', 'ticket_id=eq.' + ids.TK + '&select=action,booking_id,delta,note,created_at&order=created_at.asc'); const bids = [...new Set(lg.map(x => x.booking_id).filter(Boolean))];
      const bks = bids.length ? await rd('bookings', 'id=' + inList(bids) + '&select=id,status,member_ids,seat_tickets') : [];
      return { rem, deducts: lg.filter(x => x.action === 'deduct').length, refunds: lg.filter(x => x.action === 'refund').length, ledger: lg.map(x => ({ a: x.action, d: x.delta, b: x.booking_id, n: x.note })), bookings: bks }; };
    const poller = (async () => { let last = ''; while (!pollStop && !stopping) { try { const o = await observe(); const key = JSON.stringify([o.rem, o.deducts, o.refunds, o.bookings.map(b => b.id + b.status + JSON.stringify(b.member_ids))]); if (key !== last) { last = key; timeline.push(Object.assign({ t: new Date().toISOString() }, o)); if (o.deducts === 1 && o.refunds === 0 && o.rem === START_REM - 1 && !fs.existsSync(path.join(WORK, 'deduct_observed.json'))) fs.writeFileSync(path.join(WORK, 'deduct_observed.json'), JSON.stringify({ observedAt: new Date().toISOString(), rem: o.rem, deducts: o.deducts, note: '執行器已觀測到「恰一筆扣課帳、餘額減一」；現在可以從畫面取消' })); } } catch (e) { timeline.push({ t: new Date().toISOString(), error: String(e.message || e).slice(0, 120) }); } await new Promise(r => setTimeout(r, 1000)); } })();
    fs.writeFileSync(path.join(WORK, 'click_ready.json'), JSON.stringify({ new: 'http://127.0.0.1:8101', login: '/cc-login?role=desk', logout: '/cc-logout', fixtureIds: ids, startRemaining: START_REM, handshake: '扣堂經畫面按鈕完成後，等 deduct_observed.json 出現（執行器已觀測到扣課）才可從畫面取消；補資料需列入 extra_ids.json（{表:[精確id]}），收尾時一併清除', note: '只用畫面操作（點擊／輸入／選擇）；禁止用控制台呼叫應用函式。證據：由 Claude 寫入 click_done（JSON：complete、logoutConfirmed、consoleCallsUsed:false、clickSteps[{at,action,target,phase:deduct|cancel}]）。' }, null, 2));
    log('  新前端 http://127.0.0.1:8101（登入 /cc-login?role=desk；登出 /cc-logout）。操作完成後由 Claude 寫入 ' + path.join(WORK, 'click_done') + '。在這裡按 Enter 只會提早結束並標為「未驗證」。');
    const doneFile = path.join(WORK, 'click_done'); try { fs.unlinkSync(doneFile); } catch (_) {}
    const how = await new Promise((res) => { const t0 = Date.now(), lim = Number(opt('--ui-timeout-min', '40')) * 60000; const onKey = () => { clearInterval(iv); res('enter'); }; process.stdin.setEncoding('utf8'); process.stdin.once('data', onKey); process.stdin.resume();
      const iv = setInterval(() => { const fin = (w) => { process.stdin.off('data', onKey); process.stdin.pause(); clearInterval(iv); res(w); }; if (fs.existsSync(doneFile)) fin('file'); else if (stopping) fin('signal'); else if (Date.now() - t0 > lim) fin('timeout'); }, 1000); });
    await new Promise(r => setTimeout(r, 2500)); pollStop = true; await poller; const fin = await observe(); timeline.push(Object.assign({ t: new Date().toISOString(), final: true }, fin));
    evidence.timeline = timeline; evidence.finalState = fin;
    tlv = validateClickTimeline(timeline.filter(x => !x.error), START_REM); ok('執行器獨立觀測：起點→恰一筆扣課＋餘額減一→恰一筆退款＋餘額恢復', tlv.ok, tlv.problems);
    if (how === 'file') { const txt = fs.readFileSync(doneFile, 'utf8'); const v = validateClickEvidence(txt, tlv); evidence.clickEvidence = txt.slice(0, 6000); evOk = v.ok; if (!v.ok) unv('點擊證據不完整：' + v.problems.join('；')); else ok('點擊步驟、無控制台呼叫聲明、登出確認齊全，且與資料庫轉折時間吻合', true); }
    else unv('未取得點擊完成證據（結束方式：' + how + '）');
    if (stopping) throw new Error('STOPPED');
  } catch (e) { if (String(e.message) === 'STOPPED') unv('執行被中斷（SIGINT／SIGTERM）'); else { fail++; log('✗ 流程中止：' + String(e.message || e)); } evidence.abortedBy = String(e.message || e); }
  finally {
    pollStop = true; for (const sv of servers) { try { sv.close(); } catch (_) {} } pwd = {}; sess = {};
    log('═══ 3. 執行器收尾：納入畫面新建資料 → 依精確 id 清除 → 測前後基準比對 ═══');
    try { const xf = path.join(WORK, 'extra_ids.json'); if (fs.existsSync(xf)) { const xi = JSON.parse(fs.readFileSync(xf, 'utf8')); for (const [t, a] of Object.entries(xi)) if (Array.isArray(a)) MF.extra[t] = (MF.extra[t] || []).concat(a.filter(Boolean)); saveManifest(); log('  extra_ids.json：納入清除 ' + Object.values(xi).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) + ' 筆精確 id'); } } catch (e) { log('  ⚠ extra_ids.json 讀取失敗：' + String(e.message || e)); }
    try { if (snapBefore) { const snapNow = await snapshot(apiClean); adoptRep = adoptUiRows(snapBefore, snapNow, [ids.T, ids.M, ids.TK, ids.empDesk, ids.empCoach], [ids.empDesk, ids.empCoach]);
        for (const [t, a] of Object.entries(adoptRep.adopted)) { MF.extra[t] = (MF.extra[t] || []).concat(a.filter(x => !createdIds(t).includes(x))); } saveManifest(); log('  納入清除：' + Object.values(adoptRep.adopted).reduce((s, a) => s + a.length, 0) + ' 筆；無法歸屬（不刪、列出）：' + adoptRep.unattributed.length + ' 筆'); } } catch (e) { log('  ⚠ 無法計算畫面新建資料：' + String(e.message || e)); }
    try { cleanRep = await cleanup(apiClean); } catch (e) { cleanRep = { steps: [], failures: ['清除程序錯誤：' + String(e.message || e)], notDeleted: unresolved() }; }
    let d = null; try { if (snapBefore) { snapAfter = await snapshot(apiClean); d = diffSnap(snapBefore, snapAfter); } } catch (e) { cleanRep.failures.push('測後快照失敗：' + String(e.message || e)); }
    const nd = unresolved(); const cleanOk = !!(d && d.tablesChanged.length === 0 && !d.authUsersChanged && cleanRep && cleanRep.failures.length === 0 && nd.length === 0);
    if (cleanRep.failures.length) log('  清除失敗：' + cleanRep.failures.join('；')); if (d) log('  資料表差異：' + (d.tablesChanged.length ? JSON.stringify(d.tablesChanged) : '無（與測前逐列相同）') + '；登入帳號：' + (d.authUsersChanged ? '與測前不同！' : '與測前相同'));
    ok('執行器清除後資料與登入帳號回到測前基準', cleanOk, { failures: cleanRep.failures, diff: d && d.tablesChanged.length });
    if (cleanOk) { MF.finished = true; MF.finishedAt = new Date().toISOString(); saveManifest(); } else { try { fs.writeFileSync(path.join(WORK, 'leftover_objects.json'), JSON.stringify({ manifest: MF, notDeleted: nd, unattributed: adoptRep.unattributed, diff: d }, null, 2), { mode: 0o600 }); } catch (_) {} log('  ⚠ 已保留 leftover_objects.json；重新執行完整執行器（不帶 --click-only）會先進入查證／恢復。'); }
    const overall = classifyClick({ fail, unverified, cleanOk, timelineOk: tlv.ok, evidenceOk: evOk });
    const report = { mode: 'click-only', finishedAt: new Date().toISOString(), overall, pass, fail, results, unverified, cleanup: cleanRep, diff: d, adoptRep, evidence, manifest: MF, phase2: '階段 08 尚未移除——需另行執行 phase_remove_testdb.sql 並核對基準' };
    try { fs.writeFileSync(path.join(WORK, 'click_report.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); } catch (_) {}
    log('\n整體判定：' + overall.status + (overall.reasons.length ? '（' + overall.reasons.join('；') + '）' : '') + '\n結果：' + pass + ' 通過／' + fail + ' 失敗／' + unverified.length + ' 項未驗證；報告：' + path.join(WORK, 'click_report.json')); process.exitCode = overall.status === 'CLICK_COMPLETE' ? 0 : (overall.status === 'FAILED' ? 1 : 3);
  }
}

/* ───────── selftest：不連網、不用金鑰；針對失敗路徑 ───────── */
async function selftest() {
  const t = (n, c, x) => { if (c) { pass++; log('  ✓ ' + n); } else { fail++; log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); } };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const hdr = (n) => ({ get: (k) => k.toLowerCase() === 'content-range' ? '0-' + (n - 1) + '/' + n : null });
  /* 假後端 */
  function fake(opts) {
    opts = opts || {}; const db = { tables: Object.assign({ employees: [{ id: 'e_fd' }], bookings: [], member_tickets: [], ticket_logs: [], members: [], ticket_types: [], ticket_deduct_ops: [], booking_op_rev: [] }, opts.tables || {}), users: opts.users || [{ id: 'u1', email: 'a@x' }] };
    const calls = [];
    const parse = (p) => { const m = p.match(/^([a-z_]+)\?(.*)$/); const t = m ? m[1] : p; const q = new URLSearchParams(m ? m[2] : ''); return { t, q }; };
    const idFilter = (q, col) => { const v = q.get(col); if (!v) return null; if (v.startsWith('eq.')) return [decodeURIComponent(v.slice(3))]; if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(s => s.replace(/"/g, '')); return null; };
    const api = {
      rest: async (m, p, body, headers) => { calls.push(m + ' ' + p); if (opts.failOn && opts.failOn(m, p)) { if (opts.throwOnFail) throw new Error('network'); return { status: opts.failStatus || 500, json: null, headers: hdr(0) }; }
        if (p === '') return opts.noOpenApi ? { status: 500, json: null } : { status: 200, json: { paths: Object.assign({ '/': {} }, Object.fromEntries(Object.keys(db.tables).map(k => ['/' + k, {}]))), definitions: Object.fromEntries(Object.keys(db.tables).map(k => [k, { properties: { id: {} } }])) }, headers: hdr(0) };
        const { t, q } = parse(p); const rows = db.tables[t]; if (!rows) return { status: 404, json: null, headers: hdr(0) };
        if (m === 'GET') { let out = rows; for (const col of ['id', 'ticket_id', 'booking_id']) { const ids = idFilter(q, col); if (ids) out = out.filter(r => ids.includes(r[col])); } const off = Number(q.get('offset') || 0), lim = Number(q.get('limit') || 1e9); return { status: 200, json: out.slice(off, off + lim), headers: hdr(opts.badCount ? rows.length + 5 : rows.length) }; }
        if (m === 'POST') { if (opts.postSucceedsButReportsError) { rows.push(body); return { status: 500, json: null }; } rows.push(body); return { status: 201, json: null }; }
        if (m === 'DELETE') { for (const col of ['id', 'ticket_id', 'booking_id']) { const ids = idFilter(q, col); if (ids) db.tables[t] = rows.filter(r => !ids.includes(r[col])); } return { status: 204, json: null }; }
        return { status: 400 }; },
      adminCreateUser: async (email) => { calls.push('AUTHCREATE ' + email); if (opts.createUserFails) return { status: 500, json: null }; if (opts.createUserThrowsButCreates) { db.users.push({ id: 'new-' + email, email }); throw new Error('timeout'); } const u = { id: 'new-' + email, email }; db.users.push(u); return { status: 200, json: u }; },
      adminGetUser: async (id) => ({ status: db.users.some(u => u.id === id) ? 200 : 404, json: null }),
      adminDeleteUser: async (id) => { calls.push('AUTHDEL ' + id); if (opts.deleteUserFails) return { status: 500, json: null }; db.users = db.users.filter(u => u.id !== id); return { status: 200, json: null }; },
      adminListUsers: async (page, per) => opts.listUsersFails ? { status: 500, json: null } : { status: 200, json: { users: db.users.slice((page - 1) * per, page * per) } },
    };
    return { api, db, calls };
  }
  log('═══ 金鑰格式與身分 ═══');
  t('他專案 JWT 被拒', /不屬於測試庫/.test(checkServiceKey('h.' + b64({ ref: 'x', role: 'service_role' }) + '.s')));
  t('anon JWT 被拒', /service_role/.test(checkServiceKey('h.' + b64({ ref: REF, role: 'anon' }) + '.s')));
  t('正確的舊版 service_role JWT 通過', checkServiceKey('h.' + b64({ ref: REF, role: 'service_role' }) + '.s') === '');
  t('新版 sb_secret_ 金鑰一律拒絕（未驗證支援）', /尚未驗證/.test(checkServiceKey('sb_secret_' + 'x'.repeat(30))));
  t('非 JWT 格式被拒', /不是 JWT/.test(checkServiceKey('x'.repeat(40))));
  log('═══ 基準：失敗即停止，不拿錯誤當基準 ═══');
  let sn; let f = fake({ noOpenApi: true }); let e1 = null; try { await snapshot(f.api); } catch (e) { e1 = e; } t('OpenAPI 讀不到且假後端缺少備援清單內的表→逐表嚴格讀取失敗而丟錯', !!e1 && /讀取資料表/.test(e1.message), e1 && e1.message);
  f = fake({ noOpenApi: true, tables: Object.fromEntries(Object.keys(FALLBACK_TABLES).map(k => [k, []])) }); sn = await snapshot(f.api); t('OpenAPI 讀不到：改用備援清單，來源記入快照（fallback）', /^fallback/.test(sn.tableListSource) && Object.keys(sn.tables).length === Object.keys(FALLBACK_TABLES).length, sn.tableListSource);
  f = fake({ failOn: (m, p) => p.startsWith('bookings?') }); e1 = null; try { await snapshot(f.api); } catch (e) { e1 = e; } t('某資料表讀取回 HTTP 500→丟錯（不是「前後相同的錯誤＝一致」）', !!e1 && /bookings/.test(e1.message), e1 && e1.message);
  f = fake({ listUsersFails: true }); e1 = null; try { await snapshot(f.api); } catch (e) { e1 = e; } t('登入帳號清單失敗→丟錯', !!e1 && /登入帳號/.test(e1.message));
  f = fake({ badCount: true }); e1 = null; try { await snapshot(f.api); } catch (e) { e1 = e; } t('伺服器回報總數與讀到的列數不符→丟錯（列數不完整）', !!e1 && /列數不完整/.test(e1.message));
  f = fake({ tables: { bookings: Array.from({ length: 2500 }, (_, i) => ({ id: 'b' + String(i).padStart(5, '0') })) } }); sn = await snapshot(f.api); t('分頁：2500 列完整讀完，且使用穩定排序 order=id.asc', sn.tables.bookings.count === 2500 && f.calls.filter(c => c.includes('bookings?') && c.includes('order=id.asc')).length === 3, f.calls.filter(c => c.includes('bookings?')).length);
  log('═══ 建立：防誤刪既有資料 ═══');
  MF = newManifest('t1'); f = fake({ tables: { members: [{ id: 'CC-M-t1' }] } }); e1 = null; try { await trackedInsert(f.api, 'members', { id: 'CC-M-t1' }); } catch (e) { e1 = e; }
  t('夾具 id 已存在→停止，且不登記為本輪可清除', !!e1 && /已存在/.test(e1.message) && !(MF.tables.members || []).length, MF.tables);
  MF = newManifest('t2'); f = fake(); await trackedInsert(f.api, 'members', { id: 'CC-M-t2' }); t('建立成功→才標 created', MF.tables.members[0].state === 'created');
  MF = newManifest('t3'); f = fake({ postSucceedsButReportsError: true }); await trackedInsert(f.api, 'members', { id: 'CC-M-t3' }).catch(() => {}); t('回應失敗但資料其實建成：查證後標 created（建立前已證實不存在）', MF.tables.members[0].state === 'created' && MF.tables.members[0].verifiedAfterUnknown === true, MF.tables);
  MF = newManifest('t4'); f = fake({ failOn: (m, p) => m === 'POST' }); e1 = null; await trackedInsert(f.api, 'members', { id: 'CC-M-t4' }).catch(e => { e1 = e; }); t('建立失敗且查證確認不存在：標 absent、不可清除', !!e1 && MF.tables.members[0].state === 'absent' && createdIds('members').length === 0, MF.tables);
  MF = newManifest('t5'); f = fake({ failOn: (m, p) => m === 'POST' || (m === 'GET' && p.includes('id=eq.CC-M-t5') && MF.tables.members && MF.tables.members[0]) }); e1 = null; await trackedInsert(f.api, 'members', { id: 'CC-M-t5' }).catch(e => { e1 = e; });
  t('結果不明且查證也失敗：標 unknown，清除時不會刪', MF.tables.members[0].state === 'unknown' && createdIds('members').length === 0 && unresolved().length === 1, MF.tables);
  MF = newManifest('t6'); f = fake({ createUserThrowsButCreates: true }); const ue = await trackedCreateUser(f.api, 'desk', 'cc-desk-t6@x', 'pw').catch(() => null); t('建立登入逾時但其實成功：以 email 查證後標 created 並取得 id', MF.users[0].state === 'created' && MF.users[0].id === 'new-cc-desk-t6@x', MF.users);
  MF = newManifest('t7'); f = fake({ createUserFails: true }); e1 = null; await trackedCreateUser(f.api, 'desk', 'cc-desk-t7@x', 'pw').catch(e => { e1 = e; }); t('建立登入失敗且查無此帳號：標 absent，不會被當成可刪除', MF.users[0].state === 'absent');
  log('═══ 清除：HTTP 非 2xx 也算失敗；只刪 created；既有資料不動 ═══');
  MF = newManifest('c1'); MF.users = [{ id: 'new-1', email: 'x', state: 'created' }, { id: 'u1', email: 'old', state: 'unknown' }]; MF.tables = { bookings: [{ id: 'CC-B1-c1', state: 'created' }, { id: 'CC-B2-c1', state: 'unknown' }], members: [{ id: 'CC-M-c1', state: 'created' }] };
  f = fake({ tables: { bookings: [{ id: 'CC-B1-c1' }, { id: 'CC-B2-c1' }, { id: 'real-1' }], members: [{ id: 'CC-M-c1' }, { id: 'real-m' }] }, users: [{ id: 'u1', email: 'old' }, { id: 'new-1', email: 'x' }] });
  let cr = await cleanup(f.api); t('只刪 created 的 id；unknown 的預約與既有帳號 u1、既有列 real-* 全部保留', f.db.tables.bookings.map(r => r.id).sort().join() === 'CC-B2-c1,real-1' && f.db.tables.members.map(r => r.id).join() === 'real-m' && f.db.users.map(u => u.id).join() === 'u1' && cr.failures.length === 0, { b: f.db.tables.bookings, u: f.db.users, cr });
  t('清除報告列出「結果不明、未刪除」項目', cr.notDeleted.includes('bookings:CC-B2-c1'), cr.notDeleted);
  MF = newManifest('c2'); MF.tables = { members: [{ id: 'CC-M-c2', state: 'created' }] }; f = fake({ tables: { members: [{ id: 'CC-M-c2' }] }, failOn: (m, p) => m === 'DELETE' });
  cr = await cleanup(f.api); t('DELETE 回 HTTP 500（沒有拋例外）→ 記為清除失敗', cr.failures.some(x => /members.*HTTP 500/.test(x)), cr);
  MF = newManifest('c3'); MF.users = [{ id: 'new-1', email: 'x', state: 'created' }]; f = fake({ users: [{ id: 'new-1', email: 'x' }], deleteUserFails: true }); cr = await cleanup(f.api); t('刪除登入回 HTTP 500→清除失敗', cr.failures.length === 1, cr);
  MF = newManifest('c4'); MF.tables = { members: [{ id: 'CC-M-c4', state: 'created' }] }; f = fake({ tables: { members: [{ id: 'CC-M-c4' }] } }); const origRest = f.api.rest; f.api.rest = async (m, p, b, h) => { if (m === 'DELETE') return { status: 204 }; return origRest(m, p, b, h); };
  cr = await cleanup(f.api); t('DELETE 回 204 但資料仍在→刪後驗證抓到並記為失敗', cr.failures.some(x => /仍存在/.test(x)), cr);
  log('═══ 中斷與恢復 ═══');
  stopping = true; let g = null; try { guard(); } catch (e) { g = e; } stopping = false; t('收到中斷後 guard() 丟 STOPPED，阻止新增操作', !!g && g.message === 'STOPPED');
  t('stopCtl 可中斷進行中的請求（AbortSignal.any 組合）', typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function');
  // 未完成 manifest 偵測（用實際函式讀 WORK；此處直接寫入暫存 WORK 的 manifest）
  const mfp = path.join(WORK, 'manifest.json'); const had = fs.existsSync(mfp); const bak = had ? fs.readFileSync(mfp) : null;
  fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(mfp, JSON.stringify({ runId: 'old', finished: false, users: [], tables: { members: [{ id: 'CC-M-old', state: 'planned', checkedAbsent: true }] }, extra: {} }));
  const un = loadUnfinishedManifest(); t('啟動時偵測到未完成 manifest（會進入恢復，不覆蓋）', !!un && un.runId === 'old');
  f = fake({ tables: { members: [{ id: 'CC-M-old' }] } }); const rr = await recover(f.api, un); t('恢復：planned 且建立前已證實不存在、現在存在→確認為本輪所建（才可清除）', un.tables.members[0].state === 'created' && rr.stillUnknown.length === 0, rr);
  f = fake({ tables: { members: [{ id: 'CC-M-old2' }] } }); const un2 = { runId: 'o2', finished: false, users: [], tables: { members: [{ id: 'CC-M-old2', state: 'planned' }] }, extra: {} }; const rr2 = await recover(f.api, un2);
  t('恢復：planned 但沒有「建立前已證實不存在」記錄且現在存在→仍不明、不刪', un2.tables.members[0].state === 'planned' && rr2.stillUnknown.length === 1, rr2);
  if (had) fs.writeFileSync(mfp, bak); else fs.unlinkSync(mfp);
  log('═══ UI 走查新建資料 ═══');
  const before = { tables: { bookings: { rows: { a: 'h' }, data: { a: { id: 'a' } } } } };
  const after = { tables: { bookings: { rows: { a: 'h', n1: 'x', n2: 'y' }, data: { a: { id: 'a' }, n1: { id: 'n1', created_by: 'CC-EMP-r-DESK' }, n2: { id: 'n2', created_by: 'someone-else' } } } } };
  const ad = adoptUiRows(before, after, ['CC-B1-r'], ['CC-EMP-r-DESK']); t('走查新建的預約：created_by 是本輪測試員工→納入清除；其他人建的→只列出不刪', ad.adopted.bookings && ad.adopted.bookings.join() === 'n1' && ad.unattributed.join() === 'bookings:n2', ad);
  log('═══ 整體判定與證據 ═══');
  const base = { fail: 0, unverified: [], noUi: false, cleanOk: true, concurrencyVerified: true, uiEvidenceOk: true, clickEvidenceOk: true };
  t('全部完整（含點擊扣堂證據）→COMPLETE', classifyOverall(base).status === 'COMPLETE');
  t('缺點擊扣堂證據→UNVERIFIED（不再自動 COMPLETE）', classifyOverall(Object.assign({}, base, { clickEvidenceOk: false })).status === 'UNVERIFIED' && classifyOverall(Object.assign({}, base, { clickEvidenceOk: undefined })).status === 'UNVERIFIED');
  log('═══ 點擊扣堂證據 ═══');
  const T0 = Date.parse('2026-11-16T10:00:00Z'), iso = (ms) => new Date(T0 + ms).toISOString();
  const tlGood = [{ t: iso(0), rem: 6, deducts: 0, refunds: 0 }, { t: iso(5000), rem: 5, deducts: 1, refunds: 0 }, { t: iso(20000), rem: 6, deducts: 1, refunds: 1 }];
  let tv = validateClickTimeline(tlGood, 6); t('時間線：扣一筆減一、再退一筆恢復→通過', tv.ok && tv.at.deduct === iso(5000) && tv.at.refund === iso(20000), tv);
  t('時間線：只有扣沒有退→不通過', !validateClickTimeline(tlGood.slice(0, 2), 6).ok);
  t('時間線：扣了兩筆→不通過', !validateClickTimeline([tlGood[0], { t: iso(1), rem: 4, deducts: 2, refunds: 0 }, tlGood[2]], 6).ok);
  t('時間線：起點已有帳本→不通過', !validateClickTimeline([{ t: iso(0), rem: 5, deducts: 1, refunds: 0 }, tlGood[2]], 6).ok);
  const steps = [{ at: iso(1000), action: 'click', target: '新增', phase: 'deduct' }, { at: iso(2000), action: 'select', target: '會員', phase: 'deduct' }, { at: iso(3000), action: 'click', target: '確認建立', phase: 'deduct' }, { at: iso(15000), action: 'click', target: '取消預約', phase: 'cancel' }];
  const ce = (o) => JSON.stringify(Object.assign({ complete: true, logoutConfirmed: true, consoleCallsUsed: false, clickSteps: steps }, o));
  t('點擊證據齊全且與時間線吻合→通過', validateClickEvidence(ce({}), tv).ok, validateClickEvidence(ce({}), tv));
  t('聲明用了控制台→不通過', !validateClickEvidence(ce({ consoleCallsUsed: true }), tv).ok); t('沒有聲明 consoleCallsUsed→不通過', !validateClickEvidence(ce({ consoleCallsUsed: undefined }), tv).ok);
  t('缺取消階段的點擊→不通過', !validateClickEvidence(ce({ clickSteps: steps.slice(0, 3) }), tv).ok);
  t('扣課時間與點擊對不上（點擊在 5 分鐘前）→不通過', !validateClickEvidence(ce({ clickSteps: steps.map(x => Object.assign({}, x, { at: iso(-300000) })) }), tv).ok);
  t('未登出→不通過', !validateClickEvidence(ce({ logoutConfirmed: false }), tv).ok);
  const early = steps.map(x => x.phase === 'cancel' ? Object.assign({}, x, { at: iso(4000) }) : x); t('取消點擊早於執行器觀測到扣課→不通過', !validateClickEvidence(ce({ clickSteps: early }), tv).ok);
  t('classifyClick：全齊→CLICK_COMPLETE；缺證據／未清乾淨→UNVERIFIED；失敗→FAILED', classifyClick({ fail: 0, unverified: [], cleanOk: true, timelineOk: true, evidenceOk: true }).status === 'CLICK_COMPLETE' && classifyClick({ fail: 0, unverified: [], cleanOk: true, timelineOk: true, evidenceOk: false }).status === 'UNVERIFIED' && classifyClick({ fail: 0, unverified: [], cleanOk: false, timelineOk: true, evidenceOk: true }).status === 'UNVERIFIED' && classifyClick({ fail: 1, unverified: [], cleanOk: true, timelineOk: true, evidenceOk: true }).status === 'FAILED');
  t('--no-ui→UNVERIFIED（不是 COMPLETE）', classifyOverall(Object.assign({}, base, { noUi: true, uiEvidenceOk: false })).status === 'UNVERIFIED');
  t('按 Enter／逾時（沒有走查證據）→UNVERIFIED', classifyOverall(Object.assign({}, base, { uiEvidenceOk: false, unverified: ['畫面走查未取得完成證據'] })).status === 'UNVERIFIED');
  t('並行未證明鎖等待→UNVERIFIED', classifyOverall(Object.assign({}, base, { concurrencyVerified: false })).status === 'UNVERIFIED');
  t('清除未完全成功→UNVERIFIED，且有失敗→FAILED', classifyOverall(Object.assign({}, base, { cleanOk: false })).status === 'UNVERIFIED' && classifyOverall(Object.assign({}, base, { fail: 1 })).status === 'FAILED');
  const good = JSON.stringify({ complete: true, logoutConfirmed: true, flows: Object.fromEntries(REQUIRED_UI_FLOWS.map(x => [x, 'pass'])) });
  t('走查證據完整（流程全 pass、已清除瀏覽器登入）→通過驗證', validateUiEvidence(good).ok);
  t('走查證據缺流程→不通過', !validateUiEvidence(JSON.stringify({ complete: true, logoutConfirmed: true, flows: { 'new:deduct': 'pass' } })).ok);
  t('走查證據未清除瀏覽器登入→不通過', !validateUiEvidence(JSON.stringify({ complete: true, logoutConfirmed: false, flows: Object.fromEntries(REQUIRED_UI_FLOWS.map(x => [x, 'pass'])) })).ok);
  t('ui_done 不是 JSON→不通過', !validateUiEvidence('done').ok);
  log('═══ 其他護欄 ═══');
  let refused = false; try { const orig = process.stdin.isTTY; Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true }); await askHidden('x'); Object.defineProperty(process.stdin, 'isTTY', { value: orig, configurable: true }); } catch (_) { refused = true; } t('非互動終端機拒絕（金鑰不能由管線或命令列帶入）', refused);
  const srcTxt = fs.readFileSync(__filename, 'utf8');
  t('原始碼沒有把 serviceKey／密碼／JWT 寫進檔案或 log', !/writeFileSync\([^)]*(serviceKey|pwds|jwts|sessions)/.test(srcTxt) && !/log\([^)]*(serviceKey|pwds\[|jwts\.|jwts\[)/.test(srcTxt));
  t('所有請求都只接在固定的測試庫網址（BASE）後面，BASE 由測試庫 ref 組成', BASE === 'https://kucvxpjatptfckhlxptj.supabase.co' && /f\(BASE \+ p,/.test(srcTxt) && !/f\((?!BASE)/.test(srcTxt.slice(srcTxt.indexOf('function makeApi'), srcTxt.indexOf('const inList'))));
  log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
}
(flag('--selftest') ? selftest() : flag('--click-only') ? clickMain() : main()).catch(e => { console.error('✗ ' + String(e.message || e)); process.exit(2); });
