#!/usr/bin/env node
/* 續約承接卡位 v2：並行驗證（只碰測試庫 kucvxpjatptfckhlxptj）。
   用法（需要真正的終端機；金鑰只用隱藏輸入，不會出現在命令列或檔案）：
     node docs/testdb/renewal/run_renewal_concurrency.js --env <.env.test> --work <工作資料夾>
   不需要金鑰的失敗路徑自測：node docs/testdb/renewal/harness_selftest.js
   做什麼：建一個測試櫃檯登入與三份合約夾具，用「同時送出的 HTTP 請求」呼叫真正的承接函式 fn_contract_adopt_holds（經 zz_rn_adopt 多做觀測）：
     S1 額度競爭：合約 4 堂，兩個人同時各承接 3 堂 → 恰好一方成功、另一方被擋（堂數不足），合約占用 3 堂、沒有超過 4。
     S2 重送競爭：同一批 3 堂同時送兩次 → 一次承接、另一次 already，額度只占 3 堂（不是 6）。
     S3 暫定期間競爭：合約有效 10 天，兩個人同時各承接相距 12 天的一堂 → 恰好一方成功、另一方被擋（超出暫定期間）。
   「真並行」證據：持鎖者在交易內以 pid＋阻擋關係看到對手被擋，且對手等的 transactionid 就是持鎖者的 txid（不看 query 文字、不接受「等任意鎖」）；
   原始 HTTP 狀態／錯誤／原文一併保存。保護層見 harness.js（planned／created／unknown manifest、Auth 查證、中斷收尾、獨立清除、未完成 manifest 的恢復、分頁完整快照）。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const { createHarness, verifyBlockedBy, rawHttp, checkServiceKey, is2xx, inList } = require('./harness.js');
const REF = 'kucvxpjatptfckhlxptj', BASE = 'https://' + REF + '.supabase.co', TIMEOUT_MS = 20000;
const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const WORK = path.resolve(opt('--work', path.join(process.env.TMPDIR || '/tmp', 'yugym-renewal-conc')));
const log = (...a) => console.log(...a); const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; let pass = 0, fail = 0;
const ok = (n, c, x) => { results.push({ n, ok: !!c, x: c ? undefined : x }); if (c) { pass++; log('  ✓ ' + n); } else { fail++; log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); } };

async function askHidden(q) {
  if (!process.stdin.isTTY) throw new Error('需要在真正的終端機執行（隱藏輸入）');
  process.stdout.write(q); cp.execSync('stty -echo', { stdio: 'inherit' });
  const restore = () => { try { cp.execSync('stty echo', { stdio: 'inherit' }); } catch (_) {} };
  process.once('exit', restore);
  try { return await new Promise((res) => { let s = ''; process.stdin.setEncoding('utf8'); const on = (d) => { s += d; if (s.includes('\n')) { process.stdin.off('data', on); process.stdin.pause(); res(s.split('\n')[0].trim()); } }; process.stdin.on('data', on); process.stdin.resume(); }); }
  finally { restore(); process.stdout.write('\n'); }
}
/* HTTP 層：所有請求都有逾時；一般 API 可被 SIGINT／SIGTERM 中斷，收尾用的 API（noStop）不會被中斷。回傳含 headers 與原文。 */
function makeApi(serviceKey, anonKey, { stopSignal, noStop } = {}) {
  async function req(method, p, { body, key, bearer, headers } = {}) {
    const h = Object.assign({ apikey: key || serviceKey, Authorization: 'Bearer ' + (bearer || key || serviceKey), 'Content-Type': 'application/json' }, headers || {});
    const sigs = [AbortSignal.timeout(TIMEOUT_MS)]; if (!noStop && stopSignal) sigs.push(stopSignal);
    const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any(sigs) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
    return { status: r.status, json: j, text: t, headers: r.headers };
  }
  const safe = async (f) => { try { return await f(); } catch (e) { return { status: 0, json: null, text: '', error: String(e && e.message || e) }; } };   // 並行案例：網路錯誤也要原樣保存，不丟掉
  return {
    rest: (m, p, body, headers) => req(m, '/rest/v1/' + p, { body, headers }),
    adminCreateUser: (email, password) => req('POST', '/auth/v1/admin/users', { body: { email, password, email_confirm: true } }),
    adminGetUser: (id) => req('GET', '/auth/v1/admin/users/' + id),
    adminDeleteUser: (id) => req('DELETE', '/auth/v1/admin/users/' + id),
    adminListUsers: (page, per) => req('GET', '/auth/v1/admin/users?page=' + page + '&per_page=' + per),
    signIn: (email, password) => req('POST', '/auth/v1/token?grant_type=password', { body: { email, password }, key: anonKey }),
    rpcAs: (fn, body, jwt) => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey, bearer: jwt }),
    rpcRaw: (fn, body, jwt) => safe(() => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey, bearer: jwt })),
    probe: (fn, body) => safe(() => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey })),
  };
}

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
  const spec = () => [   // 清除順序（各步獨立；選用表在測試庫可能不存在＝404 視為沒有東西可清）
    { name: 'ticket_logs by booking', table: 'ticket_logs', col: 'booking_id', ids: () => H.createdIds('bookings') },
    { name: 'ticket_deduct_ops', table: 'ticket_deduct_ops', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name: 'bookings', table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') },
    { name: 'booking_op_rev', table: 'booking_op_rev', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name: 'ticket_grant_requests', table: 'ticket_grant_requests', col: 'id', ids: () => H.createdIds('ticket_grant_requests') },
    { name: 'contracts', table: 'contracts', col: 'id', ids: () => H.createdIds('contracts') },
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
    if (rr.persistError) log('  ✗ 恢復過程追蹤檔寫入失敗：' + rr.persistError);
    if (!rep.failures.length && !still.length && H.canClaimComplete()) {
      H.MF.finished = true; H.MF.recoveredAt = new Date().toISOString(); const pe = H.trySave();
      if (pe) { H.persistFail(pe); log('✗ 清除已完成，但無法把完成狀態寫入追蹤檔（' + String(pe.message || pe) + '）：不宣稱恢復完成，舊 manifest 保留。'); process.exitCode = 1; return; }
      try { H.archiveManifest('recovered'); } catch (e) { log('✗ 恢復清除完成，但封存舊 manifest 失敗（' + String(e.message || e) + '）：不宣稱完成。'); process.exitCode = 1; return; }
      log('✓ 恢復完成並已封存舊 manifest。請重新執行以進行新一輪驗證。'); process.exitCode = 0;
    } else { log('✗ 恢復未完成：舊 manifest 保留，請交給 Claude 檢視（不要手動刪）。'); process.exitCode = 1; }
    return;
  }
  const runId = crypto.randomBytes(3).toString('hex'); H.newManifest(runId); const id = (s) => 'CC-RN-' + s + '-' + runId;
  const M = id('M'), TT = id('TT'), empId = 'CC-EMP-RN-' + runId, email = 'cc-rn-' + runId + '@cc-test.yugym.local', pwd = crypto.randomBytes(18).toString('base64url') + 'aA1!';
  const CT = { s1: id('CT1'), s2: id('CT2'), s3: id('CT3') }, GR = (c) => c.replace('-CT', '-GR');
  let before = null, after = null, cleanOk = false, stoppedBy = null; const evidence = { runId, cases: {} };
  try {
    log('═══ 0. 前置檢查 ═══');
    const pr = await api.probe('zz_rn_adopt', { p_role: 'x', p_contract: 'x', p_ids: ['x'] });
    ok('zz_rn_adopt 已安裝且匿名被拒（HTTP 401／403）', pr.status === 401 || pr.status === 403, rawHttp(pr));
    if (!(pr.status === 401 || pr.status === 403)) throw new Error('觀測函式未安裝或權限不符，停止（尚未建立任何東西）');
    const pr2 = await api.probe('fn_contract_adopt_holds', { p_contract_id: 'x', p_booking_ids: ['x'], p_dry: true });
    ok('fn_contract_adopt_holds 已安裝且匿名被拒（HTTP 401／403）', pr2.status === 401 || pr2.status === 403, rawHttp(pr2));
    if (!(pr2.status === 401 || pr2.status === 403)) throw new Error('承接函式未安裝或權限不符，停止（尚未建立任何東西）');
    H.guard(); before = await H.snapshot(apiClean); ok('測前基準已建立（所有資料表分頁讀完並核對總筆數；登入帳號分頁到底）：' + Object.keys(before.tables).length + ' 張表、' + before.authUsers.count + ' 個登入', true);
    log('═══ 1. 建立測試櫃檯登入與夾具（每筆先確認 id 不存在、確定建立成功才登記為本輪所有）═══');
    const u = await H.trackedCreateUser(api, 'desk', email, pwd);
    const ins = (t, row) => H.trackedInsert(api, t, row);
    await ins('employees', { id: empId, auth_id: u.id, name: 'CC續約測試櫃檯', role: 'front_desk', status: 'active' });
    await ins('ticket_types', { id: TT, name: 'CC承接私教', category: '私人教練' }); await ins('members', { id: M, name: 'CC承接會員', status: 'active' });
    const mkContract = async (cid, sessions, valid) => { await ins('contracts', { id: cid, member_id: M, member_name: 'CC承接會員', plan_name: 'CC合約', sessions, ticket_type_id: TT });
      await ins('ticket_grant_requests', { id: GR(cid), member_id: M, plan_name: 'CC合約', sessions, payload: { plan: { ticket_type_id: TT, valid_days: valid } }, contract_id: cid, status: 'pending' }); };
    const mkHold = async (k, date) => { const bid = id(k); await ins('bookings', { id: bid, member_id: M, ticket_type_id: TT, category: '私人教練', date, start_time: '19:00', duration: 60, status: 'booked', pending_contract: true }); return bid; };
    await mkContract(CT.s1, 4, 60); await mkContract(CT.s2, 4, 60); await mkContract(CT.s3, 8, 10);
    const A = [await mkHold('A1', '2027-03-02'), await mkHold('A2', '2027-03-03'), await mkHold('A3', '2027-03-04')];
    const B = [await mkHold('B1', '2027-03-09'), await mkHold('B2', '2027-03-10'), await mkHold('B3', '2027-03-11')];
    const G = [await mkHold('G1', '2027-04-01'), await mkHold('G2', '2027-04-02'), await mkHold('G3', '2027-04-03')];
    const K1 = await mkHold('K1', '2027-05-01'), K2 = await mkHold('K2', '2027-05-13');
    ok('夾具建立完成（3 份合約、1 位櫃檯登入、11 堂待簽約卡位），全部由本輪確定建立', H.unresolved().length === 0, H.unresolved());
    H.guard(); const si = await api.signIn(email, pwd); if (!is2xx(si) || !si.json || !si.json.access_token) throw new Error('測試登入失敗 HTTP ' + si.status); const jwt = si.json.access_token;
    const call = (role, c, ids, expect) => api.rpcRaw('zz_rn_adopt', { p_role: role, p_contract: c, p_ids: ids, p_expect_waiters: expect || 1, p_poll_ms: 2000 }, jwt);
    const holdsOf = async (c) => { const r = await api.rest('GET', 'bookings?select=id,date,contract_id,status,pending_contract,ticket_id&contract_id=eq.' + c + '&status=neq.cancelled'); return is2xx(r) && Array.isArray(r.json) ? r.json : null; };
    const pair = async (name, hold, wait, tag) => {   // 持鎖者先送、對手 250ms 後送；兩個請求真的同時在途
      const p1 = call('holder', hold.c, hold.ids, 1); await sleep(250); const p2 = call('waiter', wait.c, wait.ids); const [h, w] = await Promise.all([p1, p2]);
      const hj = h.json || {}, wj = w.json || {}; const v = verifyBlockedBy(hj, wj, 'cc:renewadopt:waiter:' + wait.c);
      evidence.cases[name] = { holderHttp: rawHttp(h), waiterHttp: rawHttp(w), verified: v }; return { hj, wj, v, h, w };
    };
    await Promise.all([1, 2, 3].map(() => api.rpcRaw('zz_rn_adopt', { p_role: 'waiter', p_contract: 'CC-RN-WARM', p_ids: ['x'] }, jwt)));   // 熱身

    log('═══ 2. S1 額度競爭：合約 4 堂，兩人同時各承接 3 堂 ═══'); H.guard();
    { const { hj, wj, v, h, w } = await pair('S1', { c: CT.s1, ids: A }, { c: CT.s1, ids: B });
      ok('S1 兩個請求 HTTP 都是 200（不是網路錯誤或 5xx）', h.status === 200 && w.status === 200, { holder: rawHttp(h), waiter: rawHttp(w) });
      ok('S1 持鎖者承接 3 堂成功', hj.result && hj.result.ok === true && (hj.result.adopted || []).length === 3, hj.result);
      const wr = wj.result || {}; ok('S1 等候者被擋：堂數不足（剩 1 堂、想承接 3 堂），整批不動', wr.ok === false && wr.error_code === 'ADOPT.PROBLEMS' && (wr.problems || []).some(p => p.reason === 'QUOTA_EXCEEDED' && p.left === 1 && p.adopting === 3), wr);
      ok('S1 真並行：持鎖者以 pid／阻擋關係看到等候者被擋（案例標記相符、等的 transactionid 就是持鎖者的 txid、等候者在持鎖者結束後才完成）', v.verified, v);
      const c = await holdsOf(CT.s1); ok('S1 合約占用剛好 3 堂（沒有超過合約 4 堂；對手那批 3 堂一堂都沒被承接）', c && c.length === 3 && A.every(x => c.some(y => y.id === x)) && !B.some(x => c.some(y => y.id === x)), c); }
    log('═══ 3. S2 重送競爭：同一批 3 堂同時送兩次 ═══'); H.guard();
    { const { hj, wj, v, h, w } = await pair('S2', { c: CT.s2, ids: G }, { c: CT.s2, ids: G });
      ok('S2 兩個請求 HTTP 都是 200', h.status === 200 && w.status === 200, { holder: rawHttp(h), waiter: rawHttp(w) });
      ok('S2 先到的一次承接 3 堂', hj.result && hj.result.ok === true && (hj.result.adopted || []).length === 3, hj.result);
      const wr = wj.result || {}; ok('S2 重送的一次：ok、adopted 空、already 3 堂（不重複占額）', wr.ok === true && (wr.adopted || []).length === 0 && (wr.already || []).length === 3, wr);
      ok('S2 真並行：持鎖者以 pid／阻擋關係看到重送的那一筆被擋（等的是持鎖者的 txid）', v.verified, v);
      const c = await holdsOf(CT.s2); ok('S2 合約占用剛好 3 堂（不是 6 堂）、沒有新增或重複預約', c && c.length === 3, c); }
    log('═══ 4. S3 暫定期間競爭：有效 10 天，兩人同時各承接相距 12 天的一堂 ═══'); H.guard();
    { const { hj, wj, v, h, w } = await pair('S3', { c: CT.s3, ids: [K1] }, { c: CT.s3, ids: [K2] });
      ok('S3 兩個請求 HTTP 都是 200', h.status === 200 && w.status === 200, { holder: rawHttp(h), waiter: rawHttp(w) });
      ok('S3 先到的承接成功（5/1）', hj.result && hj.result.ok === true && (hj.result.adopted || []).length === 1, hj.result);
      const wr = wj.result || {}; ok('S3 後到的被擋：超出暫定使用期間（5/1 起 10 天至 5/10），5/13 被列為超出', wr.ok === false && (wr.problems || []).some(p => p.reason === 'OUT_OF_WINDOW' && (p.offending || []).some(o => o.booking_id === K2)), wr);
      ok('S3 真並行：持鎖者以 pid／阻擋關係看到對手被擋（等的是持鎖者的 txid）', v.verified, v);
      const c = await holdsOf(CT.s3); ok('S3 合約只占用 1 堂（不會留下超出期間的課）', c && c.length === 1 && c[0].id === K1, c); }
    log('═══ 5. 其他保證 ═══');
    const bk = H.createdIds('bookings');
    const tk = await api.rest('GET', 'member_tickets?select=id&member_id=eq.' + M); const lg = await api.rest('GET', 'ticket_logs?select=id&booking_id=' + inList(bk));
    ok('承接全程沒有產生任何票券或帳本（不扣堂、不扣舊票）', is2xx(tk) && Array.isArray(tk.json) && tk.json.length === 0 && is2xx(lg) && Array.isArray(lg.json) && lg.json.length === 0, { tickets: rawHttp(tk).status, ledger: rawHttp(lg).status });
    const all = await api.rest('GET', 'bookings?select=id,status,pending_contract,ticket_id&member_id=eq.' + M); ok('每一堂都沿用原預約（預約總數仍是 11 堂，全是待簽約、沒綁票）', is2xx(all) && Array.isArray(all.json) && all.json.length === 11 && all.json.every(b => b.pending_contract === true && !b.ticket_id), all.json && all.json.length);
  } catch (e) { if (String(e.message) === 'STOPPED') { stoppedBy = 'SIGINT／SIGTERM'; log('  ? 執行被中斷：進入收尾'); } else { fail++; log('✗ 流程中止：' + String(e.message || e)); } evidence.abortedBy = String(e.message || e); }
  finally {
    log('═══ 6. 收尾：各步獨立清除 → 逐項確認不存在 → 與測前基準比對 ═══');
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
    if (cleanOk && H.MF) { H.MF.finished = true; H.MF.finishedAt = new Date().toISOString(); const pe = H.trySave(); if (pe) { H.persistFail(pe); cleanOk = false; log('  ✗ 無法把完成狀態寫入追蹤檔（' + String(pe.message || pe) + '）：不判定完成。'); } }
    if (!cleanOk) log('  ⚠ manifest 保留（未完成）；重新執行本程式會自動進入恢復流程（追蹤檔若無法寫入，請先修好 --work 目錄權限）。');
    let overall = fail ? 'FAILED' : (!cleanOk ? 'CLEANUP_INCOMPLETE' : (stoppedBy ? 'STOPPED_CLEANED' : 'RENEWAL_CONC_COMPLETE'));
    const report = { finishedAt: new Date().toISOString(), overall, pass, fail, stoppedBy, persistError: H.persistError, results, evidence, cleanup: rep, pending, diff: d, before: before && { tables: Object.fromEntries(Object.entries(before.tables).map(([t, x]) => [t, x.count])), authUsers: before.authUsers }, after: after && { tables: Object.fromEntries(Object.entries(after.tables).map(([t, x]) => [t, x.count])), authUsers: after.authUsers } };
    const repFile = path.join(WORK, 'renewal_conc_report.json'); const rw = H.saveReport(repFile, report);
    if (!rw.ok) { overall = 'REPORT_NOT_SAVED'; log('  ✗ 報告檔寫入失敗（' + rw.error + '）：**沒有報告檔**，不判定完成。以下是摘要（請複製保存）：'); log(JSON.stringify({ overall, pass, fail, persistError: H.persistError, cleanOk, pending, failures: rep.failures, evidence: Object.fromEntries(Object.entries(evidence.cases || {}).map(([k, v]) => [k, v.verified && v.verified.verified])) })); }
    log('\n整體判定：' + overall + '；結果：' + pass + ' 通過／' + fail + ' 失敗；' + (rw.ok ? '報告：' + repFile : '報告：未保存'));
    if (!rw.ok) process.exitCode = 1; else
    process.exitCode = overall === 'RENEWAL_CONC_COMPLETE' ? 0 : 1;
  }
}
main().catch(e => { console.error('✗ ' + String(e.message || e)); process.exit(2); });
