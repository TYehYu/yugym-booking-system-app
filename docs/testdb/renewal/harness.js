/* 測試庫受控執行器的共用保護層（只服務 docs/testdb/renewal/run_renewal_concurrency.js；做法沿用 docs/testdb/final/run_final_acceptance.js 的成熟版本）。
   重點：
   ① manifest 區分 planned／created／unknown／absent：建立前先確認精確 id 不存在、標 planned；確定建立成功才標 created；結果不明先查證，
      查不到結論就留在 unknown——清除只刪 created，unknown／planned 一律列為「待處理」，不能宣稱清除完成。
   ② Auth 登入建立逾時可能其實成功：以本輪唯一信箱查證（分頁）並記錄精確 id；查證不了就是待處理。
   ③ SIGINT／SIGTERM：停止新增操作（guard 丟 STOPPED）、進入收尾；收尾用不可被中斷的 API。
   ④ 清除各步獨立（單步失敗不阻斷其餘）、HTTP 非 2xx 算失敗、刪後逐項確認不存在；選用表（例如測試庫沒有的 booking_op_rev）404 視為「表不存在＝沒有東西可清」。
   ⑤ 未完成 manifest → 恢復流程：只查證並清除上次確定建立的項目，不建立任何新東西、不要人工刪檔。
   ⑥ 基準快照：所有資料表（OpenAPI 列表）、分頁 1000 筆、核對伺服器回報總筆數、核對 id 不重複；Auth 帳號分頁到底。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const stable = (v) => Array.isArray(v) ? v.map(stable) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((a, k) => (a[k] = stable(v[k]), a), {}) : v;
const is2xx = (r) => !!(r && r.status >= 200 && r.status < 300);
const inList = (ids) => 'in.(' + ids.map(i => '"' + String(i).replace(/"/g, '') + '"').join(',') + ')';

/* 原子寫入：同目錄暫存檔（先寫滿、fsync）→ 重新命名。中途失敗不會留下半份 JSON，舊檔原封不動；失敗一律丟錯（絕不吞掉）。 */
function atomicWrite(file, text, mode) {
  const dir = path.dirname(file); fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + Date.now()); let fd = null;
  try { fd = fs.openSync(tmp, 'w', mode || 0o600); fs.writeSync(fd, text); fs.fsyncSync(fd); fs.closeSync(fd); fd = null; fs.renameSync(tmp, file); }
  catch (e) { try { if (fd !== null) fs.closeSync(fd); } catch (_) {} try { fs.unlinkSync(tmp); } catch (_) {} throw e; }
}

function createHarness(opts) {
  const WORK = opts.work, log = opts.log || (() => {}); let MF = null, stopping = false, persistErr = null;
  const ctl = new AbortController();
  const H = {
    get MF() { return MF; }, get stopping() { return stopping; }, stopSignal: ctl.signal, sha, stable, inList, is2xx,
    requestStop(sig) { if (!stopping) { stopping = true; log('\n收到 ' + sig + '：停止新增操作，進入安全收尾…'); ctl.abort(); } },
    guard() { if (stopping) throw new Error('STOPPED'); },
    /* 追蹤檔必須成功落盤，否則不能繼續（沒有它，中斷後就無法恢復）。save() 失敗一律丟錯；trySave() 回傳錯誤物件或 null。 */
    save() { atomicWrite(path.join(WORK, 'manifest.json'), JSON.stringify(MF, null, 2), 0o600); },
    trySave() { try { H.save(); return null; } catch (e) { return e; } },
    /* 追蹤檔寫失敗：記下、立刻停止新增（之後的 guard 都丟 STOPPED），收尾改用記憶體裡的精確 id */
    persistFail(e) { if (!persistErr) persistErr = e; if (!stopping) { stopping = true; ctl.abort(); log('\n✗ 追蹤檔寫入失敗（' + String(e && e.message || e) + '）：立即停止新增，改用記憶體中的精確 id 收尾。'); } },
    get persistFailed() { return !!persistErr; }, get persistError() { return persistErr ? String(persistErr.message || persistErr) : null; },
    canClaimComplete() { return !persistErr; },
    /* 報告檔：寫失敗不吞，回傳 {ok, error}；呼叫端不得在 ok=false 時宣稱已有報告 */
    saveReport(file, obj) { try { atomicWrite(file, JSON.stringify(obj, null, 2), 0o600); return { ok: true }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; } },
    newManifest(runId) {
      MF = { runId, startedAt: new Date().toISOString(), finished: false, users: [], tables: {} };
      const e = H.trySave(); if (e) { H.persistFail(e); throw new Error('MANIFEST_WRITE_FAILED（建立追蹤檔）：' + String(e.message || e) + '；尚未發出任何新增請求'); }
      return MF;
    },
    createdIds(t) { return ((MF.tables[t] || []).filter(x => x.state === 'created').map(x => x.id)); },
    unresolved() { return [].concat(...Object.entries(MF.tables).map(([t, a]) => a.filter(x => x.state === 'planned' || x.state === 'unknown').map(x => t + ':' + x.id)), MF.users.filter(u => u.state === 'planned' || u.state === 'unknown').map(u => 'auth:' + u.email)); },
    loadUnfinished() {
      const f = path.join(WORK, 'manifest.json'); if (!fs.existsSync(f)) return null;
      try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); return m && m.finished === false ? m : null; } catch (_) { return { corrupt: true }; }
    },
    archiveManifest(tag) { const f = path.join(WORK, 'manifest.json'); if (fs.existsSync(f)) fs.renameSync(f, path.join(WORK, 'manifest.' + tag + '-' + Date.now() + '.json')); },   // 失敗會丟錯（呼叫端要回報，不得宣稱已封存）

    /* 建立：先確認不存在 → 標 planned → 建立 → 結果不明就查證（不直接當成本輪所有、也不直接刪） */
    async trackedInsert(api, table, row) {
      H.guard();
      const ex = await api.rest('GET', table + '?id=eq.' + encodeURIComponent(row.id) + '&select=id');
      if (!is2xx(ex) || !Array.isArray(ex.json)) throw new Error(table + ' 無法確認 ' + row.id + ' 是否已存在（HTTP ' + ex.status + '），停止');
      if (ex.json.length) throw new Error(table + ' 的 id ' + row.id + ' 已存在，停止（不覆蓋、不當成本輪所有）');
      const ent = { id: row.id, state: 'planned', checkedAbsent: true }; (MF.tables[table] = MF.tables[table] || []).push(ent);
      const e1 = H.trySave();                                            // planned 必須先落盤，才准發出新增請求
      if (e1) { MF.tables[table].pop(); H.persistFail(e1); throw new Error('MANIFEST_WRITE_FAILED（建立前）：' + String(e1.message || e1) + '；沒有發出新增請求'); }
      let r = null, err = null; try { r = await api.rest('POST', table, row, { Prefer: 'return=minimal' }); } catch (e) { err = e; }
      if (r && is2xx(r)) {
        ent.state = 'created'; const e2 = H.trySave();
        if (e2) { H.persistFail(e2); throw new Error('MANIFEST_WRITE_FAILED（建立後）：' + String(e2.message || e2) + '；' + table + ':' + row.id + ' 已建立，只記在記憶體，立即停止新增並以此 id 收尾'); }
        return true;
      }
      ent.state = 'unknown'; { const e3 = H.trySave(); if (e3) H.persistFail(e3); }
      try { const v = await api.rest('GET', table + '?id=eq.' + encodeURIComponent(row.id) + '&select=id');
        if (is2xx(v) && Array.isArray(v.json)) { if (v.json.length) { ent.state = 'created'; ent.verifiedAfterUnknown = true; } else ent.state = 'absent'; { const e4 = H.trySave(); if (e4) H.persistFail(e4); } } } catch (_) {}
      if (persistErr) throw new Error('MANIFEST_WRITE_FAILED（結果不明時）：' + H.persistError + '；' + table + ':' + row.id + ' 狀態（記憶體）：' + ent.state);
      if (ent.state === 'created') return true;
      throw new Error(table + ' 建立 ' + row.id + ' 失敗（' + (err ? String(err.message || err) : 'HTTP ' + (r && r.status)) + '）；狀態：' + ent.state);
    },
    /* Auth 建立逾時可能其實成功：以本輪唯一信箱查證（分頁）並記錄精確 id */
    async findUserByEmail(api, email) {
      for (let page = 1; page < 50; page++) {
        const l = await api.adminListUsers(page, 200); const arr = is2xx(l) ? (Array.isArray(l.json) ? l.json : (l.json && l.json.users)) : null;
        if (!Array.isArray(arr)) return { error: true };
        const hit = arr.find(u => u.email === email); if (hit) return { id: hit.id };
        if (arr.length < 200) return { absent: true };
      }
      return { error: true };
    },
    async trackedCreateUser(api, role, email, password) {
      H.guard(); const ex = await H.findUserByEmail(api, email);
      if (ex.error) throw new Error('無法確認信箱 ' + email + ' 是否已存在，停止');
      if (ex.id) throw new Error('信箱 ' + email + ' 已存在，停止（不當成本輪所有）');
      const ent = { role, email, state: 'planned', checkedAbsent: true }; MF.users.push(ent);
      const e1 = H.trySave();                                            // planned 必須先落盤，才准發出建立登入請求
      if (e1) { MF.users.pop(); H.persistFail(e1); throw new Error('MANIFEST_WRITE_FAILED（建立登入前）：' + String(e1.message || e1) + '；沒有發出建立登入請求'); }
      let r = null, err = null; try { r = await api.adminCreateUser(email, password); } catch (e) { err = e; }
      if (r && is2xx(r) && r.json && r.json.id) {
        ent.id = r.json.id; ent.state = 'created'; const e2 = H.trySave();
        if (e2) { H.persistFail(e2); throw new Error('MANIFEST_WRITE_FAILED（建立登入後）：' + String(e2.message || e2) + '；登入 ' + email + '（id ' + ent.id + '）已建立，只記在記憶體，立即停止新增並以此 id 收尾'); }
        return ent;
      }
      ent.state = 'unknown'; { const e3 = H.trySave(); if (e3) H.persistFail(e3); }
      try { const v = await H.findUserByEmail(api, email); if (v.id) { ent.id = v.id; ent.state = 'created'; ent.verifiedAfterUnknown = true; } else if (v.absent) ent.state = 'absent'; { const e4 = H.trySave(); if (e4) H.persistFail(e4); } } catch (_) {}
      if (persistErr) throw new Error('MANIFEST_WRITE_FAILED（結果不明時）：' + H.persistError + '；登入 ' + email + ' 狀態（記憶體）：' + ent.state + (ent.id ? '（id ' + ent.id + '）' : ''));
      if (ent.state === 'created') return ent;
      throw new Error('建立登入 ' + role + ' 失敗（' + (err ? String(err.message || err) : 'HTTP ' + (r && r.status)) + '）；狀態：' + ent.state);
    },

    /* 清除：spec＝[{name, table, col, ids:()=>[…], optional?}…]，依序各自獨立；刪後逐項確認；最後刪本輪確定建立的登入 */
    async cleanup(api, spec) {
      const rep = { steps: [], failures: [], notDeleted: H.unresolved() };
      const step = async (name, fn, verify, optional) => {
        try { const r = await fn();
          if (optional && r && r.status === 404) { rep.steps.push({ name, status: 404, ok: true, note: '選用表不存在（沒有東西可清）' }); return; }
          const bad = !is2xx(r); rep.steps.push({ name, status: r && r.status, ok: !bad }); if (bad) { rep.failures.push(name + ' HTTP ' + (r && r.status)); return; }
          if (verify) { const v = await verify(); if (!v) rep.failures.push(name + ' 刪除後仍存在或無法確認'); } }
        catch (e) { rep.steps.push({ name, error: String(e.message || e) }); rep.failures.push(name + ' ' + String(e.message || e)); } };
      for (const sp of spec) {
        const ids = [...new Set((sp.ids() || []).filter(Boolean))]; if (!ids.length) continue;
        const q = sp.table + '?' + sp.col + '=' + inList(ids);
        await step(sp.name || sp.table, () => api.rest('DELETE', q), async () => { const v = await api.rest('GET', q + '&select=' + sp.col + '&limit=1'); return is2xx(v) && Array.isArray(v.json) && v.json.length === 0; }, sp.optional);
      }
      for (const u of MF.users.filter(x => x.state === 'created' && x.id)) {
        await step('auth user ' + u.id, () => api.adminDeleteUser(u.id), async () => { const g = await api.adminGetUser(u.id); return g.status === 404; });
      }
      return rep;
    },
    /* 恢復：只查證並把 planned／unknown 解成 created／absent；不建立任何東西 */
    async recover(api, old) {
      MF = old; const rep = { resolved: [], stillUnknown: [] };
      for (const [t, a] of Object.entries(MF.tables || {})) for (const ent of a.filter(x => x.state === 'planned' || x.state === 'unknown')) {
        try { const v = await api.rest('GET', t + '?id=eq.' + encodeURIComponent(ent.id) + '&select=id');
          if (is2xx(v) && Array.isArray(v.json)) {
            if (!v.json.length) { ent.state = 'absent'; rep.resolved.push(t + ':' + ent.id + '→absent'); }
            else if (ent.checkedAbsent) { ent.state = 'created'; ent.verifiedAfterUnknown = true; rep.resolved.push(t + ':' + ent.id + '→created（建立前已證實不存在，現在存在＝本輪所建）'); }
            else rep.stillUnknown.push(t + ':' + ent.id + '（無「建立前不存在」的證明，不刪）');
          } else rep.stillUnknown.push(t + ':' + ent.id);
        } catch (_) { rep.stillUnknown.push(t + ':' + ent.id); } }
      for (const u of (MF.users || []).filter(x => x.state === 'planned' || x.state === 'unknown')) {
        try { const v = await H.findUserByEmail(api, u.email);
          if (v.id && u.checkedAbsent) { u.id = v.id; u.state = 'created'; u.verifiedAfterUnknown = true; rep.resolved.push('auth:' + u.email + '→created'); }
          else if (v.absent) { u.state = 'absent'; rep.resolved.push('auth:' + u.email + '→absent'); }
          else rep.stillUnknown.push('auth:' + u.email); } catch (_) { rep.stillUnknown.push('auth:' + u.email); } }
      { const pe = H.trySave(); if (pe) { H.persistFail(pe); rep.persistError = String(pe.message || pe); } } return rep;
    },

    /* 基準快照：所有資料表、分頁、核對總筆數；Auth 帳號分頁到底。任何必要讀取失敗就丟錯（不拿錯誤當基準） */
    async snapshot(api) {
      const snap = { tables: {}, authUsers: null };
      const root = await api.rest('GET', '');
      if (!(is2xx(root) && root.json && typeof root.json.paths === 'object' && Object.keys(root.json.paths).length > 1)) throw new Error('讀不到資料表清單（OpenAPI HTTP ' + (root && root.status) + '），無法建立完整基準，停止');
      const defs = root.json.definitions || {}; const tables = Object.keys(root.json.paths).filter(p => p !== '/' && !p.startsWith('/rpc/')).map(p => p.slice(1)).sort();
      for (const t of tables) {
        const cols = Object.keys((defs[t] && defs[t].properties) || {}); const orderCol = cols.includes('id') ? 'id' : (cols[0] || null);
        if (!orderCol) throw new Error('資料表 ' + t + ' 找不到可排序欄位，無法建立穩定基準');
        const rows = []; let total = null;
        for (let off = 0; ; off += 1000) {
          const r = await api.rest('GET', t + '?select=*&order=' + orderCol + '.asc&limit=1000&offset=' + off, undefined, { Prefer: 'count=exact' });
          if (!is2xx(r) || !Array.isArray(r.json)) throw new Error('讀取資料表 ' + t + ' 失敗（HTTP ' + (r && r.status) + '），無法建立基準');
          const cr = r.headers && r.headers.get && r.headers.get('content-range'); if (cr && /\/(\d+)$/.test(cr)) total = Number(cr.match(/\/(\d+)$/)[1]);
          rows.push(...r.json); if (r.json.length < 1000) break;
        }
        if (total === null) throw new Error('資料表 ' + t + ' 伺服器沒有回報總筆數，無法核對是否讀完整');
        if (total !== rows.length) throw new Error('資料表 ' + t + ' 列數不完整（讀到 ' + rows.length + '，伺服器回報 ' + total + '）');
        if (orderCol === 'id' && new Set(rows.map(x => x.id)).size !== rows.length) throw new Error('資料表 ' + t + ' 分頁讀到重複的 id（排序不穩定），無法建立基準');
        snap.tables[t] = { count: rows.length, orderCol, rows: Object.fromEntries(rows.map((x, i) => [x.id != null ? String(x.id) : '#' + i + ':' + sha(stable(x)), sha(stable(x))])), all: sha(rows.map(x => sha(stable(x))).sort()) };
      }
      const users = []; for (let page = 1; ; page++) {
        const u = await api.adminListUsers(page, 200); if (!is2xx(u) || !u.json) throw new Error('讀取登入帳號清單失敗（HTTP ' + (u && u.status) + '），無法建立基準');
        const arr = Array.isArray(u.json) ? u.json : u.json.users; if (!Array.isArray(arr)) throw new Error('登入帳號清單格式不符');
        users.push(...arr); if (arr.length < 200) break; if (page > 50) throw new Error('登入帳號分頁異常');
      }
      if (new Set(users.map(x => x.id)).size !== users.length) throw new Error('登入帳號分頁讀到重複，無法建立基準');
      snap.authUsers = { count: users.length, hash: sha(users.map(x => [x.id, x.email, x.updated_at, x.last_sign_in_at]).sort()) };
      return snap;
    },
    diffSnap(a, b) {
      const out = { tablesChanged: [], authUsersChanged: false };
      for (const t of new Set([...Object.keys(a.tables), ...Object.keys(b.tables)])) {
        const x = a.tables[t], y = b.tables[t]; if (!x || !y) { out.tablesChanged.push({ table: t, note: '一邊缺少此表' }); continue; }
        if (x.all !== y.all || x.count !== y.count) { const added = Object.keys(y.rows).filter(k => !(k in x.rows)), removed = Object.keys(x.rows).filter(k => !(k in y.rows)), changed = Object.keys(x.rows).filter(k => k in y.rows && x.rows[k] !== y.rows[k]); out.tablesChanged.push({ table: t, before: x.count, after: y.count, added, removed, changed }); }
      }
      out.authUsersChanged = a.authUsers.hash !== b.authUsers.hash || a.authUsers.count !== b.authUsers.count;
      return out;
    },
  };
  return H;
}

/* 判定（純函式）：持鎖者以 pid＋阻擋關係看到等候者，且**等待的對象確實是持鎖者的交易**。
   關係成立的唯一條件：等候者有一個「沒拿到的 transactionid 鎖」，而且那個 transactionid 就是持鎖者回報的 txid。
   「正在等任意 transactionid／tuple」不算（可能在等別人）。 */
function verifyBlockedBy(holder, waiter, expectTag) {
  const ts = (x) => x ? Date.parse(x) : NaN; const o = {};
  const b = holder && Array.isArray(holder.blocked_waiters) ? holder.blocked_waiters.find(x => x && x.pid === (waiter && waiter.pid)) : null;
  o.differentPids = !!(holder && waiter && holder.pid && waiter.pid && holder.pid !== waiter.pid);
  o.lockWaitObserved = !!b;
  o.caseTagOk = !!(b && expectTag && b.application_name === expectTag);
  const hx = holder && holder.txid != null ? String(holder.txid) : null;
  o.relationOk = !!(b && hx && b.waits_on_my_txid === true && Array.isArray(b.waits_on) && b.waits_on.some(x => x && x.locktype === 'transactionid' && String(x.transactionid) === hx));
  o.finishedAfterHolder = ts(waiter && waiter.end) >= ts(holder && holder.end) - 1;
  o.verified = o.differentPids && o.lockWaitObserved && o.caseTagOk && o.relationOk && o.finishedAfterHolder; return o;
}
/* 原始 HTTP 結果（狀態、解析後內容、前 600 字原文）一併保存，不只留解析後的 json */
function rawHttp(r) { return { status: r && r.status, error: r && r.error ? String(r.error) : undefined, json: r && r.json, text: r && r.text ? String(r.text).slice(0, 600) : undefined }; }

function checkServiceKey(key, ref) {
  if (!key || key.length < 20) return '金鑰看起來不完整';
  if (/^sb_secret_/.test(key)) return '新版 secret key（sb_secret_…）尚未驗證可用於 Auth 管理介面；請用舊版 JWT 形式的 service_role 金鑰';
  if (key.split('.').length !== 3) return '金鑰格式不是 JWT（eyJ… 三段）';
  try { const p = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    if (p.ref !== ref) return '這把金鑰不屬於測試庫（ref 不符）';
    if (p.role !== 'service_role') return '這不是 service_role 金鑰'; } catch (_) { return '金鑰無法解析'; }
  return '';
}

module.exports = { createHarness, atomicWrite, verifyBlockedBy, rawHttp, checkServiceKey, is2xx, inList, sha, stable };
