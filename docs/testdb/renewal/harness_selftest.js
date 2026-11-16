#!/usr/bin/env node
/* 受控執行器保護層的失敗路徑自測：不連網、不用金鑰（用假的後端）。
   node docs/testdb/renewal/harness_selftest.js */
const fs = require('fs'), os = require('os'), path = require('path');
const { createHarness, verifyBlockedBy, rawHttp, checkServiceKey } = require('./harness.js');
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const hdr = (n) => ({ get: (k) => k.toLowerCase() === 'content-range' ? '0-' + Math.max(0, n - 1) + '/' + n : null });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rn-harness-'));

/* 假後端：資料表、Auth 使用者、可注入各種失敗 */
function fake(o) {
  o = o || {}; const db = { tables: Object.assign({ bookings: [], members: [], booking_op_rev: o.noOptional ? undefined : [] }, o.tables || {}), users: o.users || [{ id: 'u0', email: 'old@x' }] }; const calls = [];
  const parse = (p) => { const m = p.match(/^([a-z_]+)\?(.*)$/); return { t: m ? m[1] : p, q: new URLSearchParams(m ? m[2] : '') }; };
  const ids = (q, col) => { const v = q.get(col); if (!v) return null; if (v.startsWith('eq.')) return [decodeURIComponent(v.slice(3))]; if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map(s => s.replace(/"/g, '')); return null; };
  const api = {
    rest: async (m, p, body, h) => {
      calls.push(m + ' ' + p); if (o.failOn && o.failOn(m, p)) { if (o.throwOnFail) throw new Error('network'); return { status: o.failStatus || 500, json: null, headers: hdr(0) }; }
      if (p === '') return o.noOpenApi ? { status: 500, json: null } : { status: 200, json: { paths: Object.assign({ '/': {} }, Object.fromEntries(Object.keys(db.tables).filter(k => db.tables[k]).map(k => ['/' + k, {}]))), definitions: Object.fromEntries(Object.keys(db.tables).map(k => [k, { properties: { id: {} } }])) } };
      const { t: tb, q } = parse(p); const rows = db.tables[tb]; if (!rows) return { status: 404, json: { code: 'PGRST205' }, headers: hdr(0) };
      if (m === 'GET') { let out = rows; for (const col of ['id', 'booking_id']) { const x = ids(q, col); if (x) out = out.filter(r => x.includes(r[col])); } const off = Number(q.get('offset') || 0), lim = Number(q.get('limit') || 1e9);
        return { status: 200, json: out.slice(off, off + lim), headers: hdr(o.badCount ? out.length + 5 : out.length) }; }
      if (m === 'POST') { if (o.postCreatesButFails) { rows.push(body); return { status: 500, json: null }; } if (o.postTimeoutCreates) { rows.push(body); throw new Error('timeout'); } rows.push(body); return { status: 201, json: null }; }
      if (m === 'DELETE') { for (const col of ['id', 'booking_id']) { const x = ids(q, col); if (x) { if (o.deleteNoop && o.deleteNoop(tb)) return { status: 204, json: null }; db.tables[tb] = rows.filter(r => !x.includes(r[col])); } } return { status: 204, json: null }; }
      return { status: 400 }; },
    adminCreateUser: async (email) => { calls.push('AUTHCREATE ' + email); if (o.createUserFails) return { status: 500, json: null }; if (o.createUserTimeoutCreates) { db.users.push({ id: 'new-' + email, email }); throw new Error('timeout'); } const u = { id: 'new-' + email, email }; db.users.push(u); return { status: 200, json: u }; },
    adminGetUser: async (id) => ({ status: db.users.some(u => u.id === id) ? 200 : 404, json: null }),
    adminDeleteUser: async (id) => { calls.push('AUTHDEL ' + id); if (o.deleteUserFails) return { status: 500, json: null }; db.users = db.users.filter(u => u.id !== id); return { status: 200, json: null }; },
    adminListUsers: async (page, per) => o.listUsersFails ? { status: 500, json: null } : { status: 200, json: { users: db.users.slice((page - 1) * per, page * per) } },
  };
  return { api, db, calls };
}
const mk = () => createHarness({ work: tmp(), log: () => {} });

(async () => {
  console.log('① manifest：planned／created／unknown');
  { const H = mk(); H.newManifest('r1'); const f = fake({ tables: { members: [{ id: 'CC-M-r1' }] } }); let e = null; await H.trackedInsert(f.api, 'members', { id: 'CC-M-r1' }).catch(x => { e = x; });
    t('★ 精確 id 已存在 → 停止，且不登記為本輪所有（絕不會被清除）', !!e && /已存在/.test(e.message) && !(H.MF.tables.members || []).length && H.createdIds('members').length === 0, H.MF.tables); }
  { const H = mk(); H.newManifest('r2'); const f = fake(); await H.trackedInsert(f.api, 'members', { id: 'CC-M-r2' }); t('建立成功 → created', H.MF.tables.members[0].state === 'created' && H.MF.tables.members[0].checkedAbsent === true); }
  { const H = mk(); H.newManifest('r3'); const f = fake({ postTimeoutCreates: true }); await H.trackedInsert(f.api, 'members', { id: 'CC-M-r3' }).catch(() => {});
    t('★ POST 逾時但資料其實建成 → 查證後標 created（建立前已證實不存在）', H.MF.tables.members[0].state === 'created' && H.MF.tables.members[0].verifiedAfterUnknown === true, H.MF.tables); }
  { const H = mk(); H.newManifest('r4'); const f = fake({ failOn: (m) => m === 'POST' }); let e = null; await H.trackedInsert(f.api, 'members', { id: 'CC-M-r4' }).catch(x => { e = x; });
    t('POST 失敗且查證確定不存在 → absent、不可清除', !!e && H.MF.tables.members[0].state === 'absent' && H.createdIds('members').length === 0); }
  { const H = mk(); H.newManifest('r5'); const f = fake({ failOn: (m, p) => m === 'POST' || (m === 'GET' && p.includes('id=eq.CC-M-r5') && H.MF.tables.members && H.MF.tables.members[0]) }); let e = null; await H.trackedInsert(f.api, 'members', { id: 'CC-M-r5' }).catch(x => { e = x; });
    t('★ 結果不明且查證也失敗 → unknown：清除不會刪、列為待處理、不能宣稱完成', H.MF.tables.members[0].state === 'unknown' && H.createdIds('members').length === 0 && H.unresolved().length === 1, H.unresolved());
    const rep = await H.cleanup(fake({ tables: { members: [{ id: 'CC-M-r5' }] } }).api, [{ table: 'members', col: 'id', ids: () => H.createdIds('members') }]);
    t('　　對那一筆不發任何刪除（id 清單是空的）', rep.steps.length === 0 && rep.notDeleted.length === 1, rep); }

  console.log('\n② Auth 建立');
  { const H = mk(); H.newManifest('a1'); const f = fake({ createUserTimeoutCreates: true }); const u = await H.trackedCreateUser(f.api, 'desk', 'cc-a1@x', 'pw').catch(() => null);
    t('★ 建立逾時但其實成功 → 以本輪唯一信箱查證，記錄精確 id、標 created', H.MF.users[0].state === 'created' && H.MF.users[0].id === 'new-cc-a1@x' && H.MF.users[0].verifiedAfterUnknown === true, H.MF.users); }
  { const H = mk(); H.newManifest('a2'); const f = fake({ createUserFails: true }); await H.trackedCreateUser(f.api, 'desk', 'cc-a2@x', 'pw').catch(() => {}); t('建立失敗且查無此帳號 → absent（不會被刪）', H.MF.users[0].state === 'absent'); }
  { const H = mk(); H.newManifest('a3'); const f = fake({ createUserFails: true, listUsersFails: false }); const orig = f.api.adminListUsers; let n = 0; f.api.adminListUsers = async (...a) => (++n > 1 ? { status: 500, json: null } : orig(...a));
    let e = null; await H.trackedCreateUser(f.api, 'desk', 'cc-a3@x', 'pw').catch(x => { e = x; });
    t('★ 建立失敗而且查證也失敗 → unknown，列為待處理，絕不宣稱清除完成', !!e && H.MF.users[0].state === 'unknown' && H.unresolved().includes('auth:cc-a3@x'), H.unresolved()); }
  { const H = mk(); H.newManifest('a4'); const f = fake({ users: [{ id: 'old', email: 'cc-a4@x' }] }); let e = null; await H.trackedCreateUser(f.api, 'desk', 'cc-a4@x', 'pw').catch(x => { e = x; });
    t('信箱已存在 → 停止，不當成本輪所有', !!e && /已存在/.test(e.message) && H.MF.users.length === 0); }
  { const H = mk(); H.newManifest('a5'); const f = fake(); const big = Array.from({ length: 450 }, (_, i) => ({ id: 'u' + i, email: 'x' + i + '@x' })); big.push({ id: 'target', email: 'cc-a5@x' }); f.db.users = big;
    const v = await H.findUserByEmail(f.api, 'cc-a5@x'); t('★ 查證 Auth 要分頁到底（目標在第 3 頁也找得到）', v.id === 'target', v); }

  console.log('\n③ 清除：各步獨立、逐項確認');
  { const H = mk(); H.newManifest('c1'); const f = fake({ tables: { bookings: [{ id: 'B1' }], members: [{ id: 'M1' }] }, failOn: (m, p) => m === 'DELETE' && p.startsWith('bookings?') });
    ['B1'].forEach(x => H.MF.tables.bookings = [{ id: x, state: 'created' }]); H.MF.tables.members = [{ id: 'M1', state: 'created' }];
    const rep = await H.cleanup(f.api, [{ table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') }, { table: 'members', col: 'id', ids: () => H.createdIds('members') }]);
    t('★ 單步失敗（bookings HTTP 500）不阻斷其餘清除（members 仍被刪）', rep.failures.length >= 1 && /bookings/.test(rep.failures[0]) && f.db.tables.members.length === 0, rep.failures); }
  { const H = mk(); H.newManifest('c2'); const f = fake({ tables: { members: [{ id: 'M1' }] }, deleteNoop: () => true }); H.MF.tables.members = [{ id: 'M1', state: 'created' }];
    const rep = await H.cleanup(f.api, [{ table: 'members', col: 'id', ids: () => H.createdIds('members') }]);
    t('★ 刪除回 204 但資料還在 → 刪後確認抓到（算失敗）', rep.failures.some(x => /刪除後仍存在/.test(x)), rep.failures); }
  { const H = mk(); H.newManifest('c3'); const f = fake({ noOptional: true, tables: { bookings: [{ id: 'B1' }] } }); H.MF.tables.bookings = [{ id: 'B1', state: 'created' }];
    const rep = await H.cleanup(f.api, [{ name: 'booking_op_rev', table: 'booking_op_rev', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true }, { table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') }]);
    t('★ 選用表（測試庫沒有的 booking_op_rev）404 視為沒有東西可清，不算失敗、也不阻斷後面', rep.failures.length === 0 && f.db.tables.bookings.length === 0, rep); }
  { const H = mk(); H.newManifest('c4'); const f = fake({ deleteUserFails: true }); H.MF.users = [{ role: 'desk', email: 'e@x', state: 'created', id: 'uX' }]; f.db.users.push({ id: 'uX', email: 'e@x' });
    const rep = await H.cleanup(f.api, []); t('Auth 帳號刪除失敗 → 算失敗，帳號仍在', rep.failures.some(x => /auth user/.test(x)) && f.db.users.some(u => u.id === 'uX'), rep.failures); }
  { const H = mk(); H.newManifest('c5'); const f = fake({ tables: { members: [{ id: 'M1' }] } }); H.MF.tables.members = [{ id: 'M1', state: 'created' }]; H.MF.users = [{ role: 'desk', email: 'e@x', state: 'created', id: 'uX' }]; f.db.users.push({ id: 'uX', email: 'e@x' });
    const rep = await H.cleanup(f.api, [{ table: 'members', col: 'id', ids: () => H.createdIds('members') }]); t('清除成功：資料與帳號都不在了，並逐項確認', rep.failures.length === 0 && f.db.tables.members.length === 0 && !f.db.users.some(u => u.id === 'uX'), rep); }

  console.log('\n④ SIGINT／SIGTERM');
  { const H = mk(); H.newManifest('s1'); const f = fake(); H.requestStop('SIGINT'); let e = null; await H.trackedInsert(f.api, 'members', { id: 'CC-M-s1' }).catch(x => { e = x; });
    t('★ 收到中斷後：不再建立任何東西（guard 丟 STOPPED、沒有任何 POST）', !!e && e.message === 'STOPPED' && !f.calls.some(c => c.startsWith('POST')), f.calls); }
  { const H = mk(); H.newManifest('s2'); const f = fake({ tables: { members: [{ id: 'M1' }] } }); H.MF.tables.members = [{ id: 'M1', state: 'created' }]; H.requestStop('SIGTERM');
    const rep = await H.cleanup(f.api, [{ table: 'members', col: 'id', ids: () => H.createdIds('members') }]); t('★ 中斷後仍能完成收尾清除（清除不受中斷影響）', rep.failures.length === 0 && f.db.tables.members.length === 0, rep); }
  { const H = mk(); t('中斷訊號可傳給請求（stopSignal.aborted）', (H.requestStop('SIGINT'), H.stopSignal.aborted === true && H.stopping === true)); }

  console.log('\n⑤ 未完成 manifest 的恢復流程');
  { const dir = tmp(); const H0 = createHarness({ work: dir, log: () => {} }); H0.newManifest('x1'); H0.MF.tables.bookings = [{ id: 'B-created', state: 'created' }, { id: 'B-unk', state: 'unknown', checkedAbsent: true }, { id: 'B-plan', state: 'planned', checkedAbsent: true }, { id: 'B-nochk', state: 'unknown' }];
    H0.MF.users = [{ role: 'desk', email: 'cc-x1@x', state: 'unknown', checkedAbsent: true }]; H0.save();
    const H = createHarness({ work: dir, log: () => {} }); const old = H.loadUnfinished();
    t('找得到未完成的 manifest（不需要人工刪檔）', !!old && old.finished === false && old.runId === 'x1');
    const f = fake({ tables: { bookings: [{ id: 'B-created' }, { id: 'B-unk' }, { id: 'B-nochk' }, { id: 'KEEP-OTHER' }] }, users: [{ id: 'uX', email: 'cc-x1@x' }, { id: 'u0', email: 'old@x' }] });
    const rr = await H.recover(f.api, old);
    t('★ unknown＋建立前已證實不存在＋現在存在 → created；planned 查無 → absent；沒有「建立前不存在」證明的 → 仍待處理（不刪）', old.tables.bookings[1].state === 'created' && old.tables.bookings[2].state === 'absent' && old.tables.bookings[3].state === 'unknown' && rr.stillUnknown.some(x => /B-nochk/.test(x)), rr);
    t('★ Auth：以本輪唯一信箱查到 → created，記錄精確 id', old.users[0].state === 'created' && old.users[0].id === 'uX', old.users);
    const rep = await H.cleanup(f.api, [{ table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') }]);
    t('★ 恢復後只刪確定本輪建立的（B-created、B-unk）；不認得的 B-nochk 與其他資料完全不動；本輪登入帳號被刪、舊帳號不動',
      f.db.tables.bookings.map(x => x.id).sort().join() === 'B-nochk,KEEP-OTHER' && !f.db.users.some(u => u.id === 'uX') && f.db.users.some(u => u.id === 'u0'), { bookings: f.db.tables.bookings, users: f.db.users });
    t('　　仍有待處理項目 → 不能標 finished（unresolved 不為空）', H.unresolved().length === 1 && H.unresolved()[0] === 'bookings:B-nochk', H.unresolved());
    H.archiveManifest('test'); t('封存舊 manifest 後不再被當成未完成', createHarness({ work: dir, log: () => {} }).loadUnfinished() === null); }
  { const dir = tmp(); fs.writeFileSync(path.join(dir, 'manifest.json'), '{壞掉'); t('manifest 損毀 → 回報 corrupt（不覆蓋、不猜）', createHarness({ work: dir, log: () => {} }).loadUnfinished().corrupt === true); }

  console.log('\n⑥ 基準快照：分頁、核對總筆數、Auth 分頁');
  { const H = mk(); const rows = Array.from({ length: 2500 }, (_, i) => ({ id: 'b' + String(i).padStart(5, '0') })); const f = fake({ tables: { bookings: rows, booking_op_rev: [{ id: 'r1' }] } }); const s = await H.snapshot(f.api);
    t('★ 2500 列分 3 頁讀完（不是 limit=5000 一次當完整）、核對總筆數', s.tables.bookings.count === 2500 && f.calls.filter(c => c.startsWith('GET bookings?') && c.includes('limit=1000')).length === 3, f.calls.filter(c => c.startsWith('GET bookings?')).length);
    t('★ 納入所有資料表（含可能連動產生資料的 booking_op_rev）', 'booking_op_rev' in s.tables && s.tables.booking_op_rev.count === 1, Object.keys(s.tables)); }
  { const H = mk(); const f = fake({ badCount: true }); let e = null; await H.snapshot(f.api).catch(x => { e = x; }); t('★ 伺服器回報總數與讀到的列數不符 → 丟錯（列數不完整）', !!e && /列數不完整/.test(e.message), e && e.message); }
  { const H = mk(); const f = fake({ noOpenApi: true }); let e = null; await H.snapshot(f.api).catch(x => { e = x; }); t('讀不到資料表清單 → 停止，不猜表名', !!e && /資料表清單/.test(e.message)); }
  { const H = mk(); const f = fake({ listUsersFails: true }); let e = null; await H.snapshot(f.api).catch(x => { e = x; }); t('登入帳號清單失敗 → 丟錯（不拿錯誤當基準）', !!e && /登入帳號/.test(e.message)); }
  { const H = mk(); const f = fake(); f.db.users = Array.from({ length: 450 }, (_, i) => ({ id: 'u' + i, email: 'x' + i })); const s = await H.snapshot(f.api); t('★ Auth 帳號分頁到底（450 個，不是只讀第一頁 200 個）', s.authUsers.count === 450, s.authUsers.count); }
  { const H = mk(); const f = fake({ tables: { members: [{ id: 'M1', name: 'a' }] } }); const a = await H.snapshot(f.api); f.db.tables.members[0].name = 'b'; const b = await H.snapshot(f.api); const d = H.diffSnap(a, b);
    t('基準比對抓得到「同筆數但內容被改」', d.tablesChanged.length === 1 && d.tablesChanged[0].changed.length === 1, d); }

  console.log('\n⑦ 真並行判定（嚴格）與原始 HTTP 保存');
  const holder = { pid: 1, txid: 5000, end: '2026-11-16T05:00:05.000Z', blocked_waiters: [{ pid: 2, application_name: 'cc:renewadopt:waiter:C1', waits_on_my_txid: true, waits_on: [{ locktype: 'transactionid', transactionid: '5000' }] }] };
  const waiter = { pid: 2, end: '2026-11-16T05:00:05.100Z' };
  t('等的 transactionid 就是持鎖者的 txid → 通過', verifyBlockedBy(holder, waiter, 'cc:renewadopt:waiter:C1').verified);
  t('★ 等的是別人的 transactionid（不是持鎖者）→ 不通過', !verifyBlockedBy(Object.assign({}, holder, { blocked_waiters: [{ pid: 2, application_name: 'cc:renewadopt:waiter:C1', waits_on_my_txid: false, waits_on: [{ locktype: 'transactionid', transactionid: '9999' }] }] }), waiter, 'cc:renewadopt:waiter:C1').verified);
  t('★ 只是「正在等某個 tuple 鎖」→ 不通過（不能憑任意 tuple／transactionid 等待）', !verifyBlockedBy(Object.assign({}, holder, { blocked_waiters: [{ pid: 2, application_name: 'cc:renewadopt:waiter:C1', waits_on_my_txid: false, waits_on: [{ locktype: 'tuple' }] }] }), waiter, 'cc:renewadopt:waiter:C1').verified);
  t('★ waits_on_my_txid 為 true 但 waits_on 裡沒有對應的 transactionid → 不通過（兩邊要互相印證）', !verifyBlockedBy(Object.assign({}, holder, { blocked_waiters: [{ pid: 2, application_name: 'cc:renewadopt:waiter:C1', waits_on_my_txid: true, waits_on: [] }] }), waiter, 'cc:renewadopt:waiter:C1').verified);
  t('持鎖者沒回報 txid → 不通過', !verifyBlockedBy(Object.assign({}, holder, { txid: undefined }), waiter, 'cc:renewadopt:waiter:C1').verified);
  t('沒看到對手 → 不通過；案例標記不符 → 不通過；等候者比持鎖者早結束 → 不通過',
    !verifyBlockedBy(Object.assign({}, holder, { blocked_waiters: [] }), waiter, 'cc:renewadopt:waiter:C1').verified && !verifyBlockedBy(holder, waiter, 'cc:renewadopt:waiter:ZZ').verified && !verifyBlockedBy(holder, Object.assign({}, waiter, { end: '2026-11-16T05:00:01.000Z' }), 'cc:renewadopt:waiter:C1').verified);
  { const raw = rawHttp({ status: 502, error: 'timeout', json: null, text: '<html>bad gateway</html>'.repeat(100) });
    t('★ 原始 HTTP 狀態、錯誤、原文（截斷）都保存，不只留解析後 json', raw.status === 502 && raw.error === 'timeout' && raw.text.length <= 600 && /bad gateway/.test(raw.text), raw); }
  t('金鑰檢查：他專案／anon／新版格式／格式錯誤都被拒；正確的測試庫 service_role 通過', (() => { const b = (o) => 'a.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.c';
    return checkServiceKey('x', 'R') !== '' && checkServiceKey(b({ ref: 'Z', role: 'service_role' }), 'R') !== '' && checkServiceKey(b({ ref: 'R', role: 'anon' }), 'R') !== '' && checkServiceKey('sb_secret_' + 'x'.repeat(30), 'R') !== '' && checkServiceKey(b({ ref: 'R', role: 'service_role' }), 'R') === ''; })());
  { const src = fs.readFileSync(path.join(__dirname, 'run_renewal_concurrency.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
    t('原始碼沒有把金鑰寫進檔案或 log', !/console\.log\([^)]*serviceKey/.test(src) && !/writeFileSync\([^)]*serviceKey/.test(src));
    t('執行器的所有請求都只接在固定的測試庫網址後面', /BASE \+ p/.test(src) && !/https:\/\/[a-z0-9]+\.supabase\.co/.test(src.replace(/kucvxpjatptfckhlxptj/g, ''))); }

  console.log('\n⑧ 追蹤檔（manifest）寫入失敗：失敗前不建立資料、失敗後仍收尾、報告檔不吞錯');
  {
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;   // root 不受唯讀目錄限制，這幾項改用其他方式造成失敗
    const ro = (dir) => fs.chmodSync(dir, 0o500), rw = (dir) => fs.chmodSync(dir, 0o700);
    const leftovers = (dir) => fs.readdirSync(dir).filter(x => x.includes('.tmp-'));
    const posts = (f) => f.calls.filter(c => c.startsWith('POST') || c.startsWith('AUTHCREATE')).length;

    // 8a 路徑不可寫（--work 指到一個「檔案底下」）
    { const base = tmp(); const blocker = path.join(base, 'iam-a-file'); fs.writeFileSync(blocker, 'x'); const H = createHarness({ work: path.join(blocker, 'sub'), log: () => {} }); const f = fake(); let e = null;
      try { H.newManifest('w1'); } catch (x) { e = x; }
      t('★ 路徑不可寫：建立追蹤檔就失敗（MANIFEST_WRITE_FAILED），尚未發出任何新增請求', !!e && /MANIFEST_WRITE_FAILED/.test(e.message) && /尚未發出任何新增請求/.test(e.message) && posts(f) === 0 && H.persistFailed === true && H.canClaimComplete() === false, e && e.message);
      let e2 = null; await H.trackedInsert(f.api, 'members', { id: 'CC-M-w1' }).catch(x => { e2 = x; });
      t('　　失敗後再嘗試建立資料也被擋下（STOPPED），仍然沒有任何新增請求', !!e2 && e2.message === 'STOPPED' && posts(f) === 0, e2 && e2.message); }

    // 8b 寫入失敗（目錄唯讀）發生在「建立前」：planned 落盤失敗 → 不發 POST、不留紀錄
    if (!isRoot) { const dir = tmp(); const H = createHarness({ work: dir, log: () => {} }); H.newManifest('w2'); const f = fake(); ro(dir); let e = null;
      await H.trackedInsert(f.api, 'members', { id: 'CC-M-w2' }).catch(x => { e = x; }); rw(dir);
      t('★ 寫入失敗（planned 無法落盤）→ 沒有發出任何 POST；記憶體的紀錄也撤掉（不會有「planned 但其實沒建」的待處理）', !!e && /建立前/.test(e.message) && posts(f) === 0 && !(H.MF.tables.members || []).length && H.persistFailed, { msg: e && e.message, calls: f.calls });
      t('　　原本落盤的舊追蹤檔完整可讀（不是半份 JSON），沒有暫存檔殘留', (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).runId === 'w2'; } catch (_) { return false; } })() && leftovers(dir).length === 0, fs.readdirSync(dir)); }
    else t('（root 身分：略過唯讀目錄的寫入失敗案例）', true);

    // 8c Auth：planned 落盤失敗 → 不發建立登入請求
    if (!isRoot) { const dir = tmp(); const H = createHarness({ work: dir, log: () => {} }); H.newManifest('w3'); const f = fake(); ro(dir); let e = null;
      await H.trackedCreateUser(f.api, 'desk', 'cc-w3@x', 'pw').catch(x => { e = x; }); rw(dir);
      t('★ Auth：追蹤檔寫失敗 → 沒有發出建立登入請求（AUTHCREATE 0）', !!e && /建立登入前/.test(e.message) && posts(f) === 0 && H.MF.users.length === 0, { msg: e && e.message, calls: f.calls }); }

    // 8d 「遠端已建立成功、之後紀錄寫入失敗」：立即停止新增、用記憶體的精確 id 收尾、不得判完成
    if (!isRoot) { const dir = tmp(); const H = createHarness({ work: dir, log: () => {} }); H.newManifest('w4'); const f = fake(); const origRest = f.api.rest;
      f.api.rest = async (m, p, body, h) => { const r = await origRest(m, p, body, h); if (m === 'POST' && p === 'members') ro(dir); return r; };   // 建立成功的那一刻，追蹤檔目錄變唯讀
      let e = null; await H.trackedInsert(f.api, 'members', { id: 'CC-M-w4' }).catch(x => { e = x; });
      t('★ 建立成功但「建立後」落盤失敗 → 丟 MANIFEST_WRITE_FAILED、立即停止新增（stopping）、記憶體仍標 created 並保有精確 id', !!e && /建立後/.test(e.message) && /CC-M-w4/.test(e.message) && H.stopping === true && H.MF.tables.members[0].state === 'created', { msg: e && e.message, st: H.MF.tables.members });
      let e2 = null; await H.trackedInsert(f.api, 'members', { id: 'CC-M-w4b' }).catch(x => { e2 = x; });
      t('　　之後的新增被擋（STOPPED），沒有再發 POST', !!e2 && e2.message === 'STOPPED' && f.calls.filter(c => c === 'POST members').length === 1, { e2: e2 && e2.message, calls: f.calls });
      const rep = await H.cleanup(f.api, [{ table: 'members', col: 'id', ids: () => H.createdIds('members') }]); rw(dir);
      t('★ 收尾仍用記憶體中的精確 id 刪掉那一筆（追蹤檔寫不進去也能收尾）、刪後確認不存在', rep.failures.length === 0 && f.db.tables.members.length === 0, { rep, db: f.db.tables.members });
      t('★ 追蹤檔曾寫失敗 → canClaimComplete 為 false（清除成功也不能判完成）', H.canClaimComplete() === false && H.persistError && /EACCES|permission/i.test(H.persistError), H.persistError); }

    // 8e Auth 建立成功但紀錄寫入失敗：記得精確 id、可收尾
    if (!isRoot) { const dir = tmp(); const H = createHarness({ work: dir, log: () => {} }); H.newManifest('w5'); const f = fake(); const orig = f.api.adminCreateUser;
      f.api.adminCreateUser = async (...a) => { const r = await orig(...a); ro(dir); return r; }; let e = null;
      await H.trackedCreateUser(f.api, 'desk', 'cc-w5@x', 'pw').catch(x => { e = x; });
      t('★ 登入建立成功但紀錄寫入失敗 → 錯誤訊息帶出精確 id，記憶體標 created', !!e && /建立登入後/.test(e.message) && /new-cc-w5@x/.test(e.message) && H.MF.users[0].state === 'created' && H.MF.users[0].id === 'new-cc-w5@x', e && e.message);
      const rep = await H.cleanup(f.api, []); rw(dir);
      t('　　收尾刪掉這個登入並確認不存在', rep.failures.length === 0 && !f.db.users.some(u => u.id === 'new-cc-w5@x'), rep); }

    // 8f 重新命名失敗（manifest.json 位置被一個目錄佔住）：不留半份、不留暫存檔、不能繼續
    { const dir = tmp(); fs.mkdirSync(path.join(dir, 'manifest.json')); const H = createHarness({ work: dir, log: () => {} }); const f = fake(); let e = null;
      try { H.newManifest('w6'); } catch (x) { e = x; }
      t('★ 重新命名失敗 → 建立追蹤檔失敗（MANIFEST_WRITE_FAILED）、沒有發出新增請求、沒有暫存檔殘留', !!e && /MANIFEST_WRITE_FAILED/.test(e.message) && posts(f) === 0 && leftovers(dir).length === 0, { msg: e && e.message, files: fs.readdirSync(dir) }); }
    { const dir = tmp(); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ runId: 'old', finished: false })); fs.mkdirSync(path.join(dir, 'manifest.test-1'), { recursive: true }); const H = createHarness({ work: dir, log: () => {} });
      const orig = fs.renameSync; fs.renameSync = () => { throw new Error('EXDEV 模擬：封存重新命名失敗'); }; let e = null; try { H.archiveManifest('test'); } catch (x) { e = x; } finally { fs.renameSync = orig; }
      t('★ 封存（重新命名）失敗 → 丟錯，不吞（呼叫端不得宣稱已封存）；舊追蹤檔仍在', !!e && /封存重新命名失敗/.test(e.message) && fs.existsSync(path.join(dir, 'manifest.json')), e && e.message); }

    // 8g 原子寫入：中途失敗不會留下半份 JSON（直接測 atomicWrite）
    { const { atomicWrite } = require('./harness.js'); const dir = tmp(); const file = path.join(dir, 'm.json'); atomicWrite(file, JSON.stringify({ a: 1 }));
      const origWrite = fs.writeSync; fs.writeSync = () => { throw new Error('ENOSPC 模擬：磁碟滿了'); }; let e = null; try { atomicWrite(file, JSON.stringify({ a: 2, big: 'x'.repeat(1000) })); } catch (x) { e = x; } finally { fs.writeSync = origWrite; }
      t('★ 寫到一半失敗（磁碟滿）→ 丟錯、舊內容完整保留、暫存檔已清掉（沒有半份 JSON）', !!e && /ENOSPC/.test(e.message) && JSON.parse(fs.readFileSync(file, 'utf8')).a === 1 && leftovers(dir).length === 0, { e: e && e.message, files: fs.readdirSync(dir) });
      atomicWrite(file, JSON.stringify({ a: 3 })); t('　　正常寫入：完整、可解析、沒有暫存檔', JSON.parse(fs.readFileSync(file, 'utf8')).a === 3 && leftovers(dir).length === 0); }

    // 8h 完成狀態寫不進去：不得宣稱完成
    if (!isRoot) { const dir = tmp(); const H = createHarness({ work: dir, log: () => {} }); H.newManifest('w7'); H.MF.finished = true; ro(dir); const pe = H.trySave(); if (pe) H.persistFail(pe); rw(dir);
      t('★ 清除完成後「finished」寫不進追蹤檔 → trySave 回報錯誤、canClaimComplete 為 false（不判 COMPLETE）', !!pe && H.canClaimComplete() === false, pe && pe.message); }

    // 8i 報告檔寫入失敗：不吞掉、不宣稱已有報告
    { const dir = tmp(); const H = createHarness({ work: dir, log: () => {} });
      const bad = H.saveReport(path.join(dir, 'no-such-dir-is-a-file', 'x', 'r.json'), { a: 1 }); fs.writeFileSync(path.join(dir, 'blocker'), 'x'); const bad2 = H.saveReport(path.join(dir, 'blocker', 'r.json'), { a: 1 });
      t('★ 報告檔寫入失敗 → 回傳 ok=false＋錯誤原因（不吞掉）', bad2.ok === false && !!bad2.error, bad2);
      const good = H.saveReport(path.join(dir, 'r.json'), { a: 1 }); t('　　寫入成功 → ok=true，檔案完整可解析', good.ok === true && JSON.parse(fs.readFileSync(path.join(dir, 'r.json'), 'utf8')).a === 1);
      const src = fs.readFileSync(path.join(__dirname, 'run_renewal_concurrency.js'), 'utf8');
      t('★ 執行器：報告寫入失敗時判定為 REPORT_NOT_SAVED、印出「沒有報告檔」與摘要，且退出碼非 0', /REPORT_NOT_SAVED/.test(src) && /沒有報告檔/.test(src) && /if \(!rw\.ok\) process\.exitCode = 1/.test(src));
      t('★ 執行器：追蹤檔寫入失敗過就不能判 RENEWAL_CONC_COMPLETE（cleanOk 含 canClaimComplete）、完成狀態寫不進去也不判完成', /H\.canClaimComplete\(\)\);/.test(src) && /無法把完成狀態寫入追蹤檔/.test(src)); }

    // 8j 恢復流程中追蹤檔寫失敗：回報、不丟、記憶體狀態仍可用於收尾
    if (!isRoot) { const dir = tmp(); const H0 = createHarness({ work: dir, log: () => {} }); H0.newManifest('w8'); H0.MF.tables.bookings = [{ id: 'B-unk', state: 'unknown', checkedAbsent: true }]; H0.save();
      const H = createHarness({ work: dir, log: () => {} }); const old = H.loadUnfinished(); const f = fake({ tables: { bookings: [{ id: 'B-unk' }] } }); ro(dir); const rr = await H.recover(f.api, old); rw(dir);
      t('★ 恢復時追蹤檔寫不進去：回報 persistError（不丟、不吞），查證結果仍在記憶體可收尾，且不能判完成', !!rr.persistError && old.tables.bookings[0].state === 'created' && H.canClaimComplete() === false, rr); }
  }

  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})();
