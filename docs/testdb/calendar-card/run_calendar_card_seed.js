#!/usr/bin/env node
/* 課卡（行事曆預約小卡）視覺驗收夾具：只碰測試庫 kucvxpjatptfckhlxptj。
   6 位教練（顏色各異）、各種會員姓名長度、同一天內由寬到窄／由高到矮的課卡（同時段 1／2／3／5 張疊在一起、30 分鐘矮卡、
   自主訓練跑步機），其中數張帶「分期」（分期票開通區最後一堂）與「續約」（票券最後一堂）。
   保護層沿用已審查的 docs/testdb/renewal/harness.js（planned／created manifest、Auth 查證、SIGINT 收尾、基準快照與比對）。
   用法：node docs/testdb/calendar-card/run_calendar_card_seed.js --env <.env.test> --work <工作資料夾>
   做完瀏覽器截圖後回這個視窗按 Enter → 清除並比對基準。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createHarness, rawHttp, checkServiceKey, is2xx, inList } = require('../renewal/harness.js');
const { REF, BASE, askHidden, makeApi, today, addDays } = require('../hold-settle/hs_common.js');

const COACHES = [['MANGO', '教練甲'], ['RANDY', '教練乙'], ['SANDY', '教練丙'], ['BARRY', '教練丁'], ['ROCKY', '教練戊'], ['ANN', '安安']];
/* 夾具表：key、開始時間、分鐘數、教練序號（null＝沒有教練）、場地、課別、會員姓名、旗標（inst＝分期票開通區最後一堂、renew＝票券最後一堂） */
const SPEC = [
  ['A1', '09:00', 60, 0, 'multi', '私人教練', '王小明', 'inst'],
  ['B1', '10:00', 60, 1, 'multi', '私人教練', '林怡君', 'renew'], ['B2', '10:00', 60, 2, 'group', '私人教練', '陳大文'],
  ['C1', '11:00', 60, 3, 'multi', '私人教練', '張雅婷'], ['C2', '11:00', 60, 4, 'multi', '私人教練', '李國華'], ['C3', '11:00', 60, 5, 'group', '私人教練', '歐陽志豪', 'inst'],
  ['D1', '12:00', 60, 0, 'multi', '私人教練', '黃'], ['D2', '12:00', 60, 1, 'multi', '私人教練', '吳佳穎'], ['D3', '12:00', 60, 2, 'multi', '私人教練', '蔡宗翰', 'renew'],
  ['D4', '12:00', 60, 3, 'group', '私人教練', '鄭雅文'], ['D5', '12:00', 60, 4, 'multi', '私人教練', '許志強'],
  ['E1', '14:00', 30, 1, 'multi', '私人教練', '周子瑜', 'renew'],
  ['F1', '15:00', 30, 1, 'multi', '私人教練', '朱'], ['F2', '15:00', 30, 2, 'multi', '私人教練', '蕭嘉怡', 'inst'], ['F3', '15:00', 30, 3, 'multi', '私人教練', '賴冠宇'], ['F4', '15:00', 30, 4, 'group', '私人教練', '梁'],
  ['G1', '16:00', 60, null, 'treadmill_1', '自主訓練', '宋美玲'],
];
module.exports = { SPEC, COACHES };
if (require.main !== module) return;

const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const WORK = path.resolve(opt('--work', path.join(process.env.TMPDIR || '/tmp', 'yugym-card-seed')));
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
  /* 刪 bookings 會觸發 booking_op_rev 之類的登記表（若存在）；本批測試庫沒有裝階段 08，所以不需要，有的話基準比對會發現 */
  const spec = () => [
    { name: 'ticket_logs by ticket', table: 'ticket_logs', col: 'ticket_id', ids: () => H.createdIds('member_tickets') },
    { name: 'bookings', table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') },
    { name: 'member_tickets', table: 'member_tickets', col: 'id', ids: () => H.createdIds('member_tickets') },
    { name: 'members', table: 'members', col: 'id', ids: () => H.createdIds('members') },
    { name: 'ticket_types', table: 'ticket_types', col: 'id', ids: () => H.createdIds('ticket_types') },
    { name: 'employees', table: 'employees', col: 'id', ids: () => H.createdIds('employees') },
    { name: 'venues', table: 'venues', col: 'id', ids: () => H.createdIds('venues') },
  ];
  const wipeSessions = () => { try { fs.rmSync(sessFile, { force: true }); } catch (_) {} };
  if (old) {
    log('⚠ 偵測到上次未完成的 manifest。進入查證／恢復流程（不建立任何新東西）。'); wipeSessions();
    if (old.corrupt) throw new Error('manifest 損毀，無法安全恢復；請把 ' + path.join(WORK, 'manifest.json') + ' 交給 Claude 檢查（不要手動刪）');
    const rr = await H.recover(apiClean, old); log('  查證：' + JSON.stringify(rr));
    const rep = await H.cleanup(apiClean, spec()); const still = H.unresolved();
    log('  清除失敗：' + (rep.failures.length ? rep.failures.join('；') : '無') + '；仍無法確認：' + (still.length ? still.join('、') : '無'));
    if (!rep.failures.length && !still.length && H.canClaimComplete()) { H.MF.finished = true; H.MF.recoveredAt = new Date().toISOString(); const pe = H.trySave(); if (pe) { H.persistFail(pe); process.exitCode = 1; return; } try { H.archiveManifest('recovered'); } catch (e) { process.exitCode = 1; return; } log('✓ 恢復完成並已封存舊 manifest。請重新執行。'); return; }
    log('✗ 恢復未完成：舊 manifest 保留，請交給 Claude 檢視（不要手動刪）。'); process.exitCode = 1; return;
  }
  const runId = crypto.randomBytes(3).toString('hex'); H.newManifest(runId); const id = (s) => 'CC-CARD-' + s + '-' + runId;
  const deskId = 'CC-EMP-CARD-D-' + runId, mail = 'cc-card-' + runId + '@cc-test.yugym.local', pwd = crypto.randomBytes(18).toString('base64url') + 'aA1!';
  let before = null, after = null, cleanOk = false, stoppedBy = null;
  try {
    log('═══ 0. 測前基準 ═══'); H.guard(); before = await H.snapshot(apiClean); ok('測前基準已建立：' + Object.keys(before.tables).length + ' 張表、' + before.authUsers.count + ' 個登入', true);
    log('═══ 1. 建立測試櫃檯登入、場地、票種、教練 ═══');
    const ud = await H.trackedCreateUser(api, 'desk', mail, pwd); const ins = (t, row) => H.trackedInsert(api, t, row);
    await ins('employees', { id: deskId, auth_id: ud.id, name: 'CC卡片櫃檯', role: 'front_desk', status: 'active' });
    const ven = await api.rest('GET', 'venues?select=id'); const have = new Set(is2xx(ven) && Array.isArray(ven.json) ? ven.json.map(v => v.id) : []);
    if (!have.has('multi')) await ins('venues', { id: 'multi', name: '史密斯訓練架', capacity: 3, categories: ['私人教練', '體驗'], active: true, sort_order: 1 });
    if (!have.has('group')) await ins('venues', { id: 'group', name: '團課教室', capacity: 1, categories: ['小班肌力'], active: true, sort_order: 3 });
    const TT = id('TT'), TS = id('TS'); await ins('ticket_types', { id: TT, name: 'CC卡片私教', category: '私人教練' }); await ins('ticket_types', { id: TS, name: 'CC卡片自主', category: '自主訓練' });
    const coachIds = []; for (let i = 0; i < COACHES.length; i++) { const c = 'CC-EMP-CARD-C' + (i + 1) + '-' + runId; await ins('employees', { id: c, name: COACHES[i][1], name_en: COACHES[i][0], role: 'coach', status: 'active', can_teach: true }); coachIds.push(c); }
    const sd = await api.signIn(mail, pwd); if (!is2xx(sd) || !sd.json || !sd.json.access_token) throw new Error('測試登入失敗 HTTP ' + sd.status);
    fs.writeFileSync(sessFile, JSON.stringify({ desk: sd.json, ref: REF }), { mode: 0o600 });
    const d0 = today(), d1 = addDays(d0, 1), dPast = addDays(d0, -1);
    log('═══ 2. 建立會員、票券、課卡（看的那一天＝' + d1 + '）═══');
    const map = { runId, day: d1, cards: {} };
    for (const r of SPEC) {
      H.guard(); const [key, time, dur, co, venue, cat, name, flag] = r;
      const m = id(key + 'M'); await ins('members', { id: m, name: 'CC' + name, status: 'active' });
      const tid = id(key + 'T'); const isInst = flag === 'inst', isRenew = flag === 'renew';
      const trow = { id: tid, member_id: m, ticket_type_id: cat === '自主訓練' ? TS : TT, plan_name: 'CC卡片票' + key, sessions_total: isInst ? 6 : (isRenew ? 2 : 10), sessions_remaining: isInst ? 4 : (isRenew ? 0 : 9), status: 'usable', payment_status: 'paid', purchase_date: dPast };
      if (isInst) { trow.installment = { count: 3, current: 1 }; trow.unlocked_sessions = 2; }
      await ins('member_tickets', trow);
      const mk = (bid, date, st) => ins('bookings', { id: bid, member_id: m, ticket_id: tid, ticket_type_id: trow.ticket_type_id, category: cat, date, start_time: st, duration: dur, status: 'booked', coach_id: co == null ? null : coachIds[co], venue_unit: venue, pending_contract: false });
      if (isInst || isRenew) await mk(id(key + 'P'), dPast, '10:00');           // 前一堂（過去），讓目標這堂成為「開通區最後一堂／票券最後一堂」
      const bid = id(key + 'B'); await mk(bid, d1, time);
      map.cards[key] = { booking: bid, name, time, dur, coach: co == null ? '—' : COACHES[co][0], venue, flag: flag || '' };
    }
    fs.writeFileSync(path.join(WORK, 'card_fixture_map.json'), JSON.stringify(map, null, 2), { mode: 0o600 });
    const cnt = await api.rest('GET', 'bookings?id=' + inList(Object.values(map.cards).map(c => c.booking)) + '&select=id'); ok('課卡 ' + SPEC.length + ' 張已建立', is2xx(cnt) && cnt.json.length === SPEC.length, rawHttp(cnt));
    if (fail) throw new Error('夾具驗證未通過');
    log('\n✔ 夾具就緒。對照表：' + path.join(WORK, 'card_fixture_map.json') + '；登入工作階段：' + sessFile + '（0600）。請告訴 Claude「可以開始」。全部做完後回到這個視窗按 Enter → 清除並比對基準。');
    await Promise.race([new Promise(res => { process.stdin.setEncoding('utf8'); process.stdin.once('data', res); process.stdin.resume(); }), new Promise((_, rej) => { H.stopSignal.addEventListener('abort', () => rej(new Error('STOPPED'))); })]);
    process.stdin.pause();
  } catch (e) { if (String(e.message) === 'STOPPED') { stoppedBy = 'SIGINT／SIGTERM'; log('  ? 被中斷：進入收尾'); } else { fail++; log('✗ 流程中止：' + String(e.message || e)); } }
  finally {
    log('═══ 3. 清除 → 逐項確認不存在 → 與測前基準比對 ═══'); wipeSessions();
    let rep = { failures: ['清除程序未執行'] }, d = null; const extra = [];
    try { rep = await H.cleanup(apiClean, spec()); } catch (e) { rep = { failures: ['清除程序錯誤：' + String(e.message || e)] }; }
    try { if (before) { after = await H.snapshot(apiClean); d = H.diffSnap(before, after); } } catch (e) { extra.push('測後基準讀取失敗：' + String(e.message || e)); }
    const pending = H.unresolved();
    cleanOk = !!(d && d.tablesChanged.length === 0 && !d.authUsersChanged && !rep.failures.length && !extra.length && pending.length === 0 && H.canClaimComplete());
    if (rep.failures.length) log('  清除失敗：' + rep.failures.join('；')); if (pending.length) log('  ⚠ 待處理：' + pending.join('、'));
    ok('清除後資料與登入帳號回到測前基準、沒有待處理、追蹤檔全程寫入成功', cleanOk, { failures: rep.failures.concat(extra), pending, diff: d });
    if (cleanOk && H.MF) { H.MF.finished = true; H.MF.finishedAt = new Date().toISOString(); const pe = H.trySave(); if (pe) { H.persistFail(pe); cleanOk = false; } }
    const overall = fail ? 'FAILED' : (!cleanOk ? 'CLEANUP_INCOMPLETE' : (stoppedBy ? 'STOPPED_CLEANED' : 'CARD_SEED_CLEANED'));
    const rw = H.saveReport(path.join(WORK, 'calendar_card_seed_report.json'), { finishedAt: new Date().toISOString(), overall, pass, fail, stoppedBy, cleanup: rep, pending, diff: d });
    log('\n整體判定：' + overall + '；' + pass + ' 通過／' + fail + ' 失敗；' + (rw.ok ? '報告已保存' : '報告未保存：' + rw.error)); process.exitCode = (rw.ok && overall === 'CARD_SEED_CLEANED') ? 0 : 1;
  }
}
main().catch(e => { console.error('✗ ' + String(e.message || e)); process.exit(2); });
