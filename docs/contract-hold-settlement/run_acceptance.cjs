#!/usr/bin/env node
/* 新票轉正整理：瀏覽器點擊驗收的「夾具建立＋驗證＋等待＋清除」（只碰測試庫 kucvxpjatptfckhlxptj）。
   一個程序、金鑰只輸入一次：  建夾具 → 用真正的預覽函式驗證每個夾具的預期清單（驗過才放行）→ 寫出登入工作階段 → 等待（此時做瀏覽器點擊）→ 按 Enter 清除並比對基準。
   用法（真正的終端機）：node docs/testdb/hold-settle/run_hold_settle_browser_seed.js --env <.env.test> --work <工作資料夾>
   保護層沿用已審查的 docs/testdb/renewal/harness.js（planned／created／unknown manifest、Auth 查證、SIGINT／SIGTERM 收尾、獨立清除、恢復流程、基準快照）。
   前置：測試庫已暫裝階段 06／08／11 實際版本＋本函式＋phase_install_hs_zz.sql（本程式一開始核對指紋，不符就停止、尚未建立任何東西）。
   工作階段檔（含測試登入的 token）寫在 --work（0600，不進版控），清除時一併刪除。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createHarness, rawHttp, checkServiceKey, is2xx, inList } = require('../testdb/renewal/harness.js');
const { REF, BASE, askHidden, makeApi, today, addDays } = require('../testdb/hold-settle/hs_common.js');
const {checkFingerprint,concurrentChecks}=require('./acceptance_common.cjs');

/* 夾具表（純資料；selftest 會檢查它與驗收清單一致）：kind 計數是「預覽函式必須回的清單」。 */
const FIXTURES = ['C0','C1','C2','C3'].map(key=>({key,step:key==='C1'?'桌機同合約卡位轉正':key==='C2'?'手機同合約卡位轉正':'真並行驗證',tickets:[{n:12,inst:6,valid_days:365}],holds:14,expect:{bind:6,hold:6,cancel:2,skip:0,defer:0}}));
const kinds = (rows) => rows.reduce((a, r) => (a[r.kind] = (a[r.kind] || 0) + 1, a), { bind: 0, hold: 0, cancel: 0, skip: 0, defer: 0 });
const sameCounts = (a, b) => ['bind', 'hold', 'cancel', 'skip', 'defer'].every(k => (a[k] || 0) === (b[k] || 0));
const cleanupSpec = H => [
    { name: 'ticket_logs by booking', table: 'ticket_logs', col: 'booking_id', ids: () => H.createdIds('bookings') },
    { name: 'ticket_logs by ticket', table: 'ticket_logs', col: 'ticket_id', ids: () => H.createdIds('member_tickets') },
    { name: 'ticket_deduct_ops', table: 'ticket_deduct_ops', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name: 'bookings', table: 'bookings', col: 'id', ids: () => H.createdIds('bookings') },
    { name: 'booking_op_rev', table: 'booking_op_rev', col: 'booking_id', ids: () => H.createdIds('bookings'), optional: true },
    { name:'contracts',table:'contracts',col:'id',ids:()=>H.createdIds('contracts') },
    { name: 'member_tickets', table: 'member_tickets', col: 'id', ids: () => H.createdIds('member_tickets') },
    { name: 'members', table: 'members', col: 'id', ids: () => H.createdIds('members') },
    { name: 'ticket_types', table: 'ticket_types', col: 'id', ids: () => H.createdIds('ticket_types') },
    { name: 'employees', table: 'employees', col: 'id', ids: () => H.createdIds('employees') },
    { name:'change_log by test employee',table:'change_log',col:'row_id',ids:()=>H.createdIds('employees') },
  ];
module.exports = { FIXTURES, kinds, sameCounts,cleanupSpec };
if (require.main !== module) return;

const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const WORK = path.resolve(opt('--work', path.join(process.env.TMPDIR || '/tmp', 'yugym-contract-acceptance')));
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
  const spec = () => cleanupSpec(H);
  const wipeSessions = () => { try { fs.rmSync(sessFile, { force: true }); } catch (_) {} };
  if (old) {
    log('⚠ 偵測到上次未完成的 manifest。進入查證／恢復流程（不建立任何新東西）。'); wipeSessions();
    if (old.corrupt) throw new Error('manifest 損毀，無法安全恢復；請把 ' + path.join(WORK, 'manifest.json') + ' 交給 Claude 檢查（不要手動刪）');
    const rr = await H.recover(apiClean, old); log('  查證：' + JSON.stringify(rr));
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
  const TT = id('TT'), deskId = 'CC-EMP-HS-D-' + runId, coachId = 'CC-EMP-HS-C-' + runId;
  const mail = (k) => 'cc-hs-' + k + '-' + runId + '@cc-test.yugym.local', pwd = () => crypto.randomBytes(18).toString('base64url') + 'aA1!';
  let before = null, after = null, cleanOk = false, stoppedBy = null; const seeded = {};
  try {
    log('═══ 0. 前置檢查 ═══');
    const p1 = await api.probe('zz_hs_call', { p_role: 'x', p_kind: 'x', p_args: {} }); ok('zz_hs_call 已安裝且匿名被拒', p1.status === 401 || p1.status === 403, rawHttp(p1));
    const p3 = await api.probe('zz_hs_fingerprint', {}); const fbad = p3.status === 200 ? checkFingerprint(p3.json) : ['無法取得指紋（HTTP ' + p3.status + '）'];
    ok('指紋核對：階段 06／08／11 齊備、本函式是審查版', fbad.length === 0, fbad);
    if (!(p1.status === 401 || p1.status === 403) || fbad.length) throw new Error('前置檢查不符，停止（尚未建立任何東西）');
    H.guard(); before = await H.snapshot(apiClean); ok('測前基準已建立：' + Object.keys(before.tables).length + ' 張表、' + before.authUsers.count + ' 個登入', true);
    log('═══ 1. 建立測試櫃檯與教練登入、共用夾具 ═══');
    const dPwd = pwd(), cPwd = pwd(); const ud = await H.trackedCreateUser(api, 'desk', mail('desk'), dPwd), uc = await H.trackedCreateUser(api, 'coach', mail('coach'), cPwd); const ins = (t, row) => H.trackedInsert(api, t, row);
    await ins('employees', { id: deskId, auth_id: ud.id, name: 'CC驗收櫃檯', role: 'front_desk', status: 'active' });
    await ins('employees', { id: coachId, auth_id: uc.id, name: 'CC驗收教練', role: 'coach', status: 'active' });
    await ins('ticket_types', { id: TT, name: 'CC驗收私教', category: '私人教練' });
    const sd = await api.signIn(mail('desk'), dPwd), sc = await api.signIn(mail('coach'), cPwd);
    if (!is2xx(sd) || !sd.json || !sd.json.access_token || !is2xx(sc) || !sc.json || !sc.json.access_token) throw new Error('測試登入失敗 HTTP ' + sd.status + '／' + sc.status);
    fs.writeFileSync(sessFile, JSON.stringify({ desk: sd.json, coach: sc.json, ref: REF }), { mode: 0o600 });
    const d0 = today(); const jwt = sd.json.access_token;
    for (const f of FIXTURES) {
      H.guard(); const m = id(f.key + 'M'); await ins('members', { id: m, name: 'CC驗收' + f.key, status: 'active' });
      const tids = []; let ti = 0;
      for (const t of f.tickets) { ti++; const tid = id(f.key + 'T' + ti); const row = { id: tid, member_id: m, ticket_type_id: TT, plan_name: 'CC驗收票' + f.key + (t.other ? '（舊票）' : ''), sessions_total: t.n, sessions_remaining: t.n, status: 'usable', payment_status: 'paid' };
        if (t.inst) { row.installment = {count:2,current:1,paid:[true,false],segments:[6,6],amounts:[7800,7800]}; row.unlocked_sessions = t.inst; } if (t.valid_days) row.valid_days = t.valid_days; await ins('member_tickets', row); tids.push({ id: tid, other: !!t.other }); }
      const ct=id(f.key+'CT');await ins('contracts',{id:ct,member_id:m,ticket_id:tids[0].id,ticket_type_id:TT,plan_name:'CC卡位合約',sessions:12,amount:15600,sign_type:'paper'});
      const bs = []; for (let i = 1; i <= f.holds; i++) { const b = id(f.key + 'H' + String(i).padStart(2, '0')); await ins('bookings', { id: b, member_id: m, ticket_type_id: TT, category: '私人教練', date: addDays(d0, i), start_time: '19:00', duration: 60, status: 'booked', pending_contract: true,contract_id:ct,coach_id:coachId }); bs.push(b); }
      seeded[f.key] = { member: m, tickets: tids, bookings: bs,contract:ct, main: tids.find(t => !t.other).id };
    }
    log('═══ 2. 用真正的預覽函式驗證每個夾具的預期清單（驗過才放行做瀏覽器點擊）═══');
    for (const f of FIXTURES) {
      const sdx = seeded[f.key]; const r = await api.rpcRaw('zz_hs_call', { p_role: 'plain', p_kind: 'settle', p_args: { ticket: sdx.main, dry: true }, p_expect_waiters: 0, p_poll_ms: 1000, p_extra_hold_ms: 0 }, jwt);
      const res = r.json && r.json.result; const got = res && res.ok ? kinds(res.rows) : null;
      ok(f.key + ' 預覽清單符合預期 ' + JSON.stringify(f.expect) + '（' + f.step.split(' ')[0] + '）', r.status === 200 && !!got && sameCounts(got, f.expect), { http: r.status, got, res: res && res.error_code });
    }
    ok('教練登入的工作階段已取得（供「教練看不到轉正簽約」與直接呼叫 RPC 被擋的驗收）', !!sc.json.access_token);
    const sample = await api.rpcRaw('fn_hold_settle_new_ticket', { p_ticket_id: seeded.C1.main, p_dry: true }, sc.json.access_token);
    ok('教練直接呼叫 fn_hold_settle_new_ticket 被擋（NOT_DESK 或 NOT_STAFF，沒有任何寫入）', sample.status === 200 && sample.json && sample.json.ok === false && ['NOT_DESK', 'NOT_STAFF'].includes(sample.json.error_code), rawHttp(sample));
    await concurrentChecks({api,jwt,seeded,check:ok,write:proofs=>{const r=H.saveReport(path.join(WORK,'concurrency_report.json'),proofs);if(!r.ok)throw Error('並行報告未保存');}});
    if (fail) throw new Error('夾具驗證未通過，不放行瀏覽器驗收（直接進入清除）');
    const map = { runId, d0, members: Object.fromEntries(Object.entries(seeded).map(([k, v]) => [k, v.member])), mainTickets: Object.fromEntries(Object.entries(seeded).map(([k, v]) => [k, v.main])), firstBooking: Object.fromEntries(Object.entries(seeded).map(([k, v]) => [k, v.bookings[0]])), steps: Object.fromEntries(FIXTURES.map(f => [f.key, f.step])) };
    fs.writeFileSync(path.join(WORK, 'browser_fixture_map.json'), JSON.stringify(map, null, 2), { mode: 0o600 });
    log('\n✔ 夾具就緒並驗證通過。對照表：' + path.join(WORK, 'browser_fixture_map.json') + '；登入工作階段：' + sessFile + '（0600）。');
    log('  現在請告訴 Codex「可以開始瀏覽器驗收」（或自行依 TEST_MAPPING_AND_PLAN.md 第 D 節操作）。全部做完後，回到這個視窗按 Enter → 自動清除並比對基準。');
    await Promise.race([new Promise(res => { process.stdin.setEncoding('utf8'); process.stdin.once('data', res); process.stdin.resume(); }), new Promise((_, rej) => { H.stopSignal.addEventListener('abort', () => rej(new Error('STOPPED'))); })]);
    process.stdin.pause();
    for(const key of ['C1','C2']){
      const z=seeded[key];
      const [br,lr,tr]=await Promise.all([api.rest('GET','bookings?select=id,status,ticket_id,pending_contract,contract_id&id='+inList(z.bookings)),api.rest('GET','ticket_logs?select=action,delta,booking_id&ticket_id=eq.'+z.main),api.rest('GET','member_tickets?select=sessions_remaining&id=eq.'+z.main)]);
      const b=br.json,l=lr.json,t=tr.json;
      ok(key+' 畫面送出後：6 轉正、6 保留、2 取消，原編號和合約保留',br.status===200&&Array.isArray(b)&&b.length===14&&b.every(x=>x.contract_id===z.contract)&&b.filter(x=>x.ticket_id===z.main).length===6&&b.filter(x=>x.status==='booked'&&!x.ticket_id&&x.pending_contract).length===6&&b.filter(x=>x.status==='cancelled').length===2);
      ok(key+' 只有 6 筆扣課且票餘額 6',lr.status===200&&Array.isArray(l)&&l.filter(x=>x.action==='deduct'&&x.delta===-1).length===6&&tr.status===200&&Array.isArray(t)&&t[0]?.sessions_remaining===6);
    }
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
    const overall = fail ? 'FAILED' : (!cleanOk ? 'CLEANUP_INCOMPLETE' : (stoppedBy ? 'STOPPED_CLEANED' : 'HS_BROWSER_SEED_CLEANED'));
    const rw = H.saveReport(path.join(WORK, 'hold_settle_browser_seed_report.json'), { finishedAt: new Date().toISOString(), overall, pass, fail, stoppedBy, cleanup: rep, pending, diff: d });
    log('\n整體判定：' + overall + '；' + pass + ' 通過／' + fail + ' 失敗；' + (rw.ok ? '報告已保存' : '報告未保存：' + rw.error)); process.exitCode = (rw.ok && overall === 'HS_BROWSER_SEED_CLEANED') ? 0 : 1;
  }
}
main().catch(e => { console.error('✗ ' + String(e.message || e)); process.exit(2); });
