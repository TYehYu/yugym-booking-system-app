#!/usr/bin/env node
/* 新票轉正整理：「實際發票入口」點擊驗收的夾具建立＋等待＋清除（只碰測試庫 kucvxpjatptfckhlxptj）。
   與 run_hold_settle_browser_seed.js 同一套保護（renewal/harness.js：planned／created manifest、Auth 查證、SIGINT 收尾、基準快照），
   差別：①沿用測試庫既有票種 tt_pt／方案 PL-SEED21-PT（10 堂），夾具只建會員＋卡位；
         ②發票是在畫面上由櫃檯點出來的，所以新票／合約／發放單／購買紀錄等「畫面建立的列」在清除前，
           只依「本輪建立的會員」精確收進 manifest（不是 LIKE 掃描），再依序刪除，最後比對基準。
   用法：node docs/testdb/hold-settle/run_hold_settle_sale_seed.js --env <.env.test> --work <工作資料夾> */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createHarness, rawHttp, checkServiceKey, is2xx, inList } = require('../renewal/harness.js');
const { REF, BASE, askHidden, makeApi, today, addDays } = require('./hs_common.js');
const { checkFingerprint } = require('./run_hold_settle_concurrency.js');

const TT = 'tt_pt', PLAN = 'PL-SEED21-PT';
/* 每位會員 13 堂卡位（教練課、待簽約）；新票 10 堂 → 最近 10 堂轉正、最遠 3 堂取消 */
const FIXTURES = [
  { key: 'S1', step: '入口 A：會員明細 ＋儲值（後台直接發放）→ 發放完成 → 卡位整理清單 → 確認', holds: 13, expect: { bind: 10, cancel: 3 } },
  { key: 'S2', step: '入口 B：銷售建約 →（不納入既有卡位）→ 待審核發放 → 簽署／收款 → 核准發放 → 卡位整理清單 → 確認', holds: 13, expect: { bind: 10, cancel: 3 } },
  { key: 'S3', step: '備用：任一入口第一次操作失敗時重來用', holds: 13, expect: { bind: 10, cancel: 3 } },
  { key: 'S4', step: '共享票：會員有 3 堂卡位、別人名下有共享給他的同票種票（5 堂）；入口 A 賣單堂票後，最近 1 堂轉正、其餘 2 堂「先不動」，送出後卡位仍在、共享票餘額與帳本不變', holds: 3, shared: 5, expect: { bind: 1, defer: 2, cancel: 0 } },
];
module.exports = { FIXTURES, TT, PLAN };
if (require.main !== module) return;

const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ONLY = opt('--only', null); const FIX = FIXTURES.filter(f => !ONLY || f.key === ONLY);
const WORK = path.resolve(opt('--work', path.join(process.env.TMPDIR || '/tmp', 'yugym-hs-sale')));
const log = (...a) => console.log(...a); let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; log('  ✓ ' + n); } else { fail++; log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); } };
async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const envPath = opt('--env'); if (!envPath) throw new Error('缺 --env <.env.test>');
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (env.SB_URL !== BASE) throw new Error('.env.test 的 SB_URL 不是測試庫'); const anon = env.ANON_KEY; if (!anon) throw new Error('.env.test 缺 ANON_KEY');
  const H = createHarness({ work: WORK, log });
  process.on('SIGINT', () => H.requestStop('SIGINT')); process.on('SIGTERM', () => H.requestStop('SIGTERM'));
  const old = H.loadUnfinished();
  log('這支程式只會碰測試庫 ' + REF + '。接受的金鑰：舊版 JWT 形式的 service_role。');
  const serviceKey = await askHidden('測試庫 service_role 金鑰> '); const bad = checkServiceKey(serviceKey, REF); if (bad) throw new Error(bad);
  const api = makeApi(serviceKey, anon, { stopSignal: H.stopSignal }), apiClean = makeApi(serviceKey, anon, { noStop: true });
  const sessFile = path.join(WORK, 'sessions.json');
  /* 子表先、父表後。畫面建立的列由 adoptUiRows() 先精確收進 manifest */
  const spec = () => [
    { name: 'ticket_logs by booking', table: 'ticket_logs', col: 'booking_id', ids: () => H.createdIds('bookings') },
    { name: 'ticket_logs by ticket', table: 'ticket_logs', col: 'ticket_id', ids: () => H.createdIds('member_tickets') },
    { name: 'ticket_deduct_ops', table: 'ticket_deduct_ops', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name: 'training_logs', table: 'training_logs', col: 'member_id', ids: () => H.createdIds('members'), optional: true },
    { name: 'bookings', table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') },
    /* ⚠ 刪 bookings 會觸發 trg_booking_op_rev 寫下刪除紀錄，所以 booking_op_rev 要排在 bookings「之後」才清得乾淨 */
    { name: 'booking_op_rev', table: 'booking_op_rev', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name: 'purchases', table: 'purchases', col: 'id', ids: () => H.createdIds('purchases') },
    { name: 'purchase_applications', table: 'purchase_applications', col: 'id', ids: () => H.createdIds('purchase_applications'), optional: true },
    { name: 'ticket_grant_requests', table: 'ticket_grant_requests', col: 'id', ids: () => H.createdIds('ticket_grant_requests') },
    { name: 'contracts', table: 'contracts', col: 'id', ids: () => H.createdIds('contracts') },
    { name: 'notifications', table: 'notifications', col: 'recipient_id', ids: () => H.createdIds('members'), optional: true },
    { name: 'member_tickets', table: 'member_tickets', col: 'id', ids: () => H.createdIds('member_tickets') },
    { name: 'members', table: 'members', col: 'id', ids: () => H.createdIds('members') },
    { name: 'employees', table: 'employees', col: 'id', ids: () => H.createdIds('employees') },
  ];
  const wipeSessions = () => { try { fs.rmSync(sessFile, { force: true }); } catch (_) {} };
  /* 只依本輪建立的會員，把畫面建立的列精確收進 manifest（state=created），之後由 cleanup 一併刪、逐項確認 */
  const adoptUiRows = async () => {
    const members = H.createdIds('members'); if (!members.length) return;
    const add = (t, id) => { const a = (H.MF.tables[t] = H.MF.tables[t] || []); if (!a.some(x => x.id === id)) a.push({ id, state: 'created', adopted: 'ui' }); };
    const get = async (t, col, ids, sel) => { const r = await apiClean.rest('GET', t + '?' + col + '=' + inList(ids) + '&select=' + sel); return is2xx(r) && Array.isArray(r.json) ? r.json : null; };
    for (const [t, col] of [['member_tickets', 'member_id'], ['bookings', 'member_id'], ['contracts', 'member_id'], ['ticket_grant_requests', 'member_id'], ['purchases', 'member_id'], ['purchase_applications', 'member_id']]) {
      const rows = await get(t, col, members, 'id'); if (rows) rows.forEach(r => add(t, r.id));
    }
    const tks = H.createdIds('member_tickets'); if (tks.length) { const rows = await get('contracts', 'ticket_id', tks, 'id'); if (rows) rows.forEach(r => add('contracts', r.id)); const p = await get('purchases', 'ticket_id', tks, 'id'); if (p) p.forEach(r => add('purchases', r.id)); const g = await get('ticket_grant_requests', 'ticket_id', tks, 'id'); if (g) g.forEach(r => add('ticket_grant_requests', r.id)); }
    H.trySave();
  };
  if (old) {
    log('⚠ 偵測到上次未完成的 manifest。進入查證／恢復流程（不建立任何新東西）。'); wipeSessions();
    if (old.corrupt) throw new Error('manifest 損毀，無法安全恢復；請把 ' + path.join(WORK, 'manifest.json') + ' 交給 Claude 檢查（不要手動刪）');
    const rr = await H.recover(apiClean, old); log('  查證：' + JSON.stringify(rr));
    await adoptUiRows();
    const rep = await H.cleanup(apiClean, spec()); const still = H.unresolved();
    log('  清除失敗：' + (rep.failures.length ? rep.failures.join('；') : '無') + '；仍無法確認：' + (still.length ? still.join('、') : '無'));
    if (!rep.failures.length && !still.length && H.canClaimComplete()) {
      H.MF.finished = true; H.MF.recoveredAt = new Date().toISOString(); const pe = H.trySave();
      if (pe) { H.persistFail(pe); log('✗ 無法把完成狀態寫入追蹤檔：不宣稱恢復完成。'); process.exitCode = 1; return; }
      try { H.archiveManifest('recovered'); } catch (e) { log('✗ 封存舊 manifest 失敗：不宣稱完成。'); process.exitCode = 1; return; }
      log('✓ 恢復完成並已封存舊 manifest。請重新執行。'); return;
    }
    log('✗ 恢復未完成：舊 manifest 保留，請交給 Claude 檢視（不要手動刪）。'); process.exitCode = 1; return;
  }
  const runId = crypto.randomBytes(3).toString('hex'); H.newManifest(runId); const id = (s) => 'CC-HS-' + s + '-' + runId;
  const deskId = 'CC-EMP-HS-D-' + runId, coachId = 'CC-EMP-HS-C-' + runId;
  const mail = (k) => 'cc-hs-' + k + '-' + runId + '@cc-test.yugym.local', pwd = () => crypto.randomBytes(18).toString('base64url') + 'aA1!';
  let before = null, after = null, cleanOk = false, stoppedBy = null; const seeded = {};
  try {
    log('═══ 0. 前置檢查 ═══');
    const p1 = await api.probe('zz_hs_call', { p_role: 'x', p_kind: 'x', p_args: {} }); ok('zz_hs_call 已安裝且匿名被拒', p1.status === 401 || p1.status === 403, rawHttp(p1));
    const p3 = await api.probe('zz_hs_fingerprint', {}); const fbad = p3.status === 200 ? checkFingerprint(p3.json) : ['無法取得指紋（HTTP ' + p3.status + '）'];
    ok('指紋核對：階段 06／08／11 齊備、本函式是審查版', fbad.length === 0, fbad);
    const pl = await api.rest('GET', 'course_plans?id=eq.' + PLAN + '&select=id,ticket_type_id,sessions_base,sessions_bonus');
    ok('方案 ' + PLAN + ' 存在、票種 ' + TT + '、10 堂', is2xx(pl) && pl.json && pl.json.length === 1 && pl.json[0].ticket_type_id === TT && pl.json[0].sessions_base + (pl.json[0].sessions_bonus || 0) === 10, rawHttp(pl));
    if (!(p1.status === 401 || p1.status === 403) || fbad.length || fail) throw new Error('前置檢查不符，停止（尚未建立任何東西）');
    H.guard(); before = await H.snapshot(apiClean); ok('測前基準已建立：' + Object.keys(before.tables).length + ' 張表、' + before.authUsers.count + ' 個登入', true);
    log('═══ 1. 建立測試櫃檯與教練登入、會員與卡位 ═══');
    const dPwd = pwd(), cPwd = pwd(); const ud = await H.trackedCreateUser(api, 'desk', mail('desk'), dPwd), uc = await H.trackedCreateUser(api, 'coach', mail('coach'), cPwd); const ins = (t, row) => H.trackedInsert(api, t, row);
    await ins('employees', { id: deskId, auth_id: ud.id, name: 'CC驗收櫃檯', role: 'front_desk', status: 'active' });
    await ins('employees', { id: coachId, auth_id: uc.id, name: 'CC驗收教練', role: 'coach', status: 'active', can_teach: true });
    const sd = await api.signIn(mail('desk'), dPwd), sc = await api.signIn(mail('coach'), cPwd);
    if (!is2xx(sd) || !sd.json || !sd.json.access_token || !is2xx(sc) || !sc.json || !sc.json.access_token) throw new Error('測試登入失敗 HTTP ' + sd.status + '／' + sc.status);
    fs.writeFileSync(sessFile, JSON.stringify({ desk: sd.json, coach: sc.json, ref: REF }), { mode: 0o600 });
    const d0 = today();
    for (const f of FIX) {
      H.guard(); const m = id(f.key + 'M'); await ins('members', { id: m, name: 'CC發票' + f.key, status: 'active' });
      const bs = []; for (let i = 1; i <= f.holds; i++) { const b = id(f.key + 'H' + String(i).padStart(2, '0')); await ins('bookings', { id: b, member_id: m, ticket_type_id: TT, category: '私人教練', date: addDays(d0, i), start_time: '19:00', duration: 60, status: 'booked', pending_contract: true }); bs.push(b); }
      if (f.shared) { const o = id(f.key + 'O'); await ins('members', { id: o, name: 'CC發票' + f.key + '共享票主', status: 'active' }); const st = id(f.key + 'ST'); await ins('member_tickets', { id: st, member_id: o, ticket_type_id: TT, plan_name: 'CC共享票' + f.key, sessions_total: f.shared, sessions_remaining: f.shared, status: 'usable', payment_status: 'paid', shared_with: [m] }); seeded[f.key] = { member: m, bookings: bs, owner: o, sharedTicket: st }; }
      else seeded[f.key] = { member: m, bookings: bs };
    }
    const cnt = await api.rest('GET', 'bookings?member_id=' + inList(Object.values(seeded).map(s => s.member)) + '&select=id');
    ok('夾具：各會員的卡位筆數正確、尚未有任何票券', is2xx(cnt) && cnt.json.length === FIX.reduce((n, f) => n + f.holds, 0), rawHttp(cnt));
    const nt = await api.rest('GET', 'member_tickets?member_id=' + inList(Object.values(seeded).map(s => s.member)) + '&select=id');
    ok('夾具會員起始沒有任何 member_tickets', is2xx(nt) && nt.json.length === 0, rawHttp(nt));
    if (fail) throw new Error('夾具驗證未通過，不放行驗收（直接進入清除）');
    const map = { runId, d0, plan: PLAN, ticketType: TT, members: Object.fromEntries(Object.entries(seeded).map(([k, v]) => [k, v.member])), bookings: Object.fromEntries(Object.entries(seeded).map(([k, v]) => [k, v.bookings])), steps: Object.fromEntries(FIX.map(f => [f.key, f.step])), expect: Object.fromEntries(FIX.map(f => [f.key, f.expect])) };
    fs.writeFileSync(path.join(WORK, 'sale_fixture_map.json'), JSON.stringify(map, null, 2), { mode: 0o600 });
    log('\n✔ 夾具就緒。對照表：' + path.join(WORK, 'sale_fixture_map.json') + '；登入工作階段：' + sessFile + '（0600）。');
    log('  現在請告訴 Claude「可以開始驗收」。全部做完後，回到這個視窗按 Enter → 自動收進畫面建立的列、清除並比對基準。');
    await Promise.race([new Promise(res => { process.stdin.setEncoding('utf8'); process.stdin.once('data', res); process.stdin.resume(); }), new Promise((_, rej) => { H.stopSignal.addEventListener('abort', () => rej(new Error('STOPPED'))); })]);
    process.stdin.pause();
  } catch (e) { if (String(e.message) === 'STOPPED') { stoppedBy = 'SIGINT／SIGTERM'; log('  ? 被中斷：進入收尾'); } else { fail++; log('✗ 流程中止：' + String(e.message || e)); } }
  finally {
    log('═══ 3. 收進畫面建立的列 → 清除 → 逐項確認不存在 → 與測前基準比對 ═══'); wipeSessions();
    let rep = { failures: ['清除程序未執行'] }, d = null; const extra = [];
    try { await adoptUiRows(); } catch (e) { extra.push('收進畫面建立的列失敗：' + String(e.message || e)); }
    try { rep = await H.cleanup(apiClean, spec()); } catch (e) { rep = { failures: ['清除程序錯誤：' + String(e.message || e)] }; }
    try { if (before) { after = await H.snapshot(apiClean); d = H.diffSnap(before, after); } } catch (e) { extra.push('測後基準讀取失敗：' + String(e.message || e)); }
    const pending = H.unresolved();
    cleanOk = !!(d && d.tablesChanged.length === 0 && !d.authUsersChanged && !rep.failures.length && !extra.length && pending.length === 0 && H.canClaimComplete());
    if (rep.failures.length) log('  清除失敗：' + rep.failures.join('；')); if (pending.length) log('  ⚠ 待處理：' + pending.join('、'));
    ok('清除後資料與登入帳號回到測前基準、沒有待處理、追蹤檔全程寫入成功', cleanOk, { failures: rep.failures.concat(extra), pending, diff: d });
    if (cleanOk && H.MF) { H.MF.finished = true; H.MF.finishedAt = new Date().toISOString(); const pe = H.trySave(); if (pe) { H.persistFail(pe); cleanOk = false; } }
    const overall = fail ? 'FAILED' : (!cleanOk ? 'CLEANUP_INCOMPLETE' : (stoppedBy ? 'STOPPED_CLEANED' : 'HS_SALE_SEED_CLEANED'));
    const rw = H.saveReport(path.join(WORK, 'hold_settle_sale_seed_report.json'), { finishedAt: new Date().toISOString(), overall, pass, fail, stoppedBy, cleanup: rep, pending, diff: d });
    log('\n整體判定：' + overall + '；' + pass + ' 通過／' + fail + ' 失敗；' + (rw.ok ? '報告已保存' : '報告未保存：' + rw.error)); process.exitCode = (rw.ok && overall === 'HS_SALE_SEED_CLEANED') ? 0 : 1;
  }
}
main().catch(e => { console.error('✗ ' + String(e.message || e)); process.exit(2); });
