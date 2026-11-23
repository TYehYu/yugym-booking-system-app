#!/usr/bin/env node
/* 人事權限修補（2a／2b）真實 HTTP 驗收＋瀏覽器驗收夾具（只碰測試庫 kucvxpjatptfckhlxptj）。
   一個程序、金鑰只輸入一次（隱藏輸入）：
     建立 6 個測試員工登入（管理員／櫃檯／一般教練／主管／被管教練／薪資人員）＋夾具
     → 以各角色的真實 JWT 打 PostgREST（/rest/v1）做「真實 HTTP」驗收 → 寫出各角色登入工作階段（給瀏覽器驗收）
     → 等你按 Enter → 清除所有本輪資料與登入 → 與測前基準比對。
   前置：測試庫已套 2a＋2b（目前就是）。保護層沿用已審查的 docs/testdb/renewal/harness.js（planned／created manifest、SIGINT 收尾、獨立清除、基準比對）。
   用法：node docs/hr-perm/acceptance/run_hr_acceptance.js --env <.env.test> --work <工作資料夾>
   工作階段檔 sessions.json（含測試登入 token）寫在 --work（0600，不進版控），清除時一併刪除。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createHarness, is2xx } = require('../../testdb/renewal/harness.js');
const { REF, BASE, askHidden, makeApi } = require('../../testdb/hold-settle/hs_common.js');
const { checkServiceKey } = require('../../testdb/renewal/harness.js');
const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const WORK = path.resolve(opt('--work', path.join(process.env.TMPDIR || '/tmp', 'yugym-hr-accept')));
const log = (...a) => console.log(...a); let pass = 0, fail = 0; const rows = [];
const T = (n, c, x) => { rows.push({ n, ok: !!c, x }); if (c) { pass++; log('  ✓ ' + n); } else { fail++; log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 260) : '')); } };
const tpeHM = (d = 0) => new Date(Date.now() + 8 * 3600e3 + d * 60e3).toISOString().slice(11, 16);
const tpeDate = (n = 0) => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const minOf = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const nearNow = (hm) => { if (!hm) return false; let d = Math.abs(minOf(hm) - minOf(tpeHM())); d = Math.min(d, 1440 - d); return d <= 2; };

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const envPath = opt('--env'); if (!envPath) throw new Error('缺 --env <.env.test>');
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  if (env.SB_URL !== BASE) throw new Error('.env.test 的 SB_URL 不是測試庫'); const anon = env.ANON_KEY; if (!anon) throw new Error('.env.test 缺 ANON_KEY');
  const H = createHarness({ work: WORK, log });
  process.on('SIGINT', () => H.requestStop('SIGINT')); process.on('SIGTERM', () => H.requestStop('SIGTERM'));
  const old = H.loadUnfinished(); if (old) throw new Error('偵測到上次未完成的 manifest（' + path.join(WORK, 'manifest.json') + '）。請先交給 Claude 處理，不要手動刪。');
  log('這支程式只會碰測試庫 ' + REF + '。接受的金鑰：舊版 JWT 形式的 service_role。');
  const serviceKey = await askHidden('測試庫 service_role 金鑰> '); const bad = checkServiceKey(serviceKey, REF); if (bad) throw new Error(bad);
  const api = makeApi(serviceKey, anon, { stopSignal: H.stopSignal }), apiClean = makeApi(serviceKey, anon, { noStop: true });
  const sessFile = path.join(WORK, 'sessions.json');
  const U = async (jwt, method, p, body, headers) => { const r = await fetch(BASE + '/rest/v1/' + p, { method, headers: Object.assign({ apikey: anon, Authorization: 'Bearer ' + (jwt || anon), 'Content-Type': 'application/json' }, headers || {}), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, json: j, text: t }; };
  const REP = { Prefer: 'return=representation' };
  const runId = crypto.randomBytes(3).toString('hex'); H.newManifest(runId); const startIso = new Date(Date.now() - 5000).toISOString();
  const P = { adm: 'CC-EMP-HR-ADM-' + runId, dsk: 'CC-EMP-HR-DSK-' + runId, cch: 'CC-EMP-HR-CCH-' + runId, mgr: 'CC-EMP-HR-MGR-' + runId, mch: 'CC-EMP-HR-MCH-' + runId, hrp: 'CC-EMP-HR-HRP-' + runId };
  const ROLE = { adm: 'admin', dsk: 'front_desk', cch: 'coach', mgr: 'coach', mch: 'coach', hrp: 'front_desk' };
  const NAME = { adm: 'CC驗收管理員', dsk: 'CC驗收櫃檯', cch: 'CC驗收教練', mgr: 'CC驗收主管', mch: 'CC驗收被管教練', hrp: 'CC驗收薪資人員' };
  const mail = (k) => 'cc-hr-' + k + '-' + runId + '@cc-test.yugym.local', pwd = () => crypto.randomBytes(18).toString('base64url') + 'aA1!';
  const spec = () => [
    { name: 'attendance', table: 'attendance', col: 'emp_id', ids: () => H.createdIds('employees') },
    { name: 'punch_requests', table: 'punch_requests', col: 'emp_id', ids: () => H.createdIds('employees') },
    { name: 'salary_history', table: 'salary_history', col: 'id', ids: () => H.createdIds('salary_history') },
    { name: 'employees（hr_grants／manager_scope 隨之 cascade）', table: 'employees', col: 'id', ids: () => H.createdIds('employees') },
  ];
  let before = null, cleanOk = false, stoppedBy = null, settingTouched = false;
  const tok = {};
  try {
    log('═══ 0. 前置：確認 2a／2b 已套用、基準快照 ═══');
    const probe = await api.rest('GET', 'hr_settings?select=key,value'); T('hr_settings 存在（2a 已套用）', is2xx(probe) && Array.isArray(probe.json), { http: probe.status });
    if (!is2xx(probe)) throw new Error('2a 未套用，停止（尚未建立任何東西）');
    H.guard(); before = await H.snapshot(apiClean); T('測前基準已建立：' + Object.keys(before.tables).length + ' 張表、' + before.authUsers.count + ' 個登入', true);
    log('═══ 1. 建立 6 個測試員工登入與夾具 ═══');
    const pw = {}, uid = {};
    for (const k of Object.keys(P)) { pw[k] = pwd(); const u = await H.trackedCreateUser(api, k, mail(k), pw[k]); uid[k] = u.id || (u.json && u.json.id) || u; }
    const emp = (k, extra) => Object.assign({ id: P[k], auth_id: uid[k], name: NAME[k], role: ROLE[k], status: 'active', need_punch: true }, extra || {});
    await H.trackedInsert(api, 'employees', emp('adm', { phone: '0900' + runId.slice(0, 3) + '001', id_number: 'Z000000001', bank_account: '000-000-001', base_salary: 90000 }));
    await H.trackedInsert(api, 'employees', emp('dsk', { phone: '0900' + runId.slice(0, 3) + '002', id_number: 'Z000000002', bank_account: '000-000-002', base_salary: 30000 }));
    await H.trackedInsert(api, 'employees', emp('cch', { phone: '0900' + runId.slice(0, 3) + '003', id_number: 'Z000000003', bank_account: '000-000-003', base_salary: 40000, pt_rate: 700 }));
    await H.trackedInsert(api, 'employees', emp('mgr', { phone: '0900' + runId.slice(0, 3) + '004', is_manager: true, base_salary: 50000 }));
    await H.trackedInsert(api, 'employees', emp('mch', { phone: '0900' + runId.slice(0, 3) + '005', id_number: 'Z000000005', bank_account: '000-000-005', base_salary: 35000, hire_date: '2021-05-01' }));
    await H.trackedInsert(api, 'employees', emp('hrp', { phone: '0900' + runId.slice(0, 3) + '006', id_number: 'Z000000006', bank_account: '000-000-006' }));
    const r1 = await api.rest('POST', 'manager_scope', { manager_id: P.mgr, employee_id: P.mch }, { Prefer: 'return=minimal' }); T('夾具：主管所管名單', is2xx(r1), { http: r1.status });
    const r2 = await api.rest('POST', 'hr_grants', { employee_id: P.hrp, duty: 'pay_view' }, { Prefer: 'return=minimal' }); T('夾具：薪資人員職責 pay_view', is2xx(r2), { http: r2.status });
    await H.trackedInsert(api, 'salary_history', { id: 'CC-SH-' + runId + '-C', emp_id: P.cch, ym: '2026-10', net: 41000 });
    await H.trackedInsert(api, 'salary_history', { id: 'CC-SH-' + runId + '-M', emp_id: P.mch, ym: '2026-10', net: 36000 });
    const sess = {}; for (const k of Object.keys(P)) { const s = await api.signIn(mail(k), pw[k]); if (!is2xx(s) || !s.json || !s.json.access_token) throw new Error('測試登入失敗 ' + k + ' HTTP ' + s.status); sess[k] = s.json; tok[k] = s.json.access_token; }
    fs.writeFileSync(sessFile, JSON.stringify(Object.assign({ ref: REF, ids: P }, sess)), { mode: 0o600 });
    const base = await api.rest('GET', 'employees?select=id'); const N = base.json.length; log('  員工總數（含本輪 6 位）：' + N);

    log('═══ 2. 真實 HTTP：員工表讀取 ═══');
    for (const k of Object.keys(P)) { const r = await U(tok[k], 'GET', 'employees?select=id'); T('基表可見列數 ' + k + (k === 'adm' ? '（過渡期管理員全員）' : '（只有自己）'), is2xx(r) && Array.isArray(r.json) && r.json.length === (k === 'adm' ? N : 1), { http: r.status, n: r.json && r.json.length }); }
    for (const k of ['dsk', 'cch', 'mgr', 'hrp']) { const r = await U(tok[k], 'GET', 'employees?select=base_salary,id_number,bank_account&id=eq.' + P.mch); T('他人底薪／證件／銀行：' + k + ' 讀不到', is2xx(r) && Array.isArray(r.json) && r.json.length === 0, r.json); }
    { const r = await U(tok.adm, 'GET', 'employees?select=base_salary,id_number&id=eq.' + P.mch); T('管理員讀得到他人底薪／證件', is2xx(r) && r.json && r.json[0] && r.json[0].base_salary == 35000 && r.json[0].id_number === 'Z000000005', r.json); }
    { const r = await U(tok.cch, 'GET', 'employees?select=base_salary,pt_rate&id=eq.' + P.cch); T('教練讀自己的底薪／單價（本人薪資頁來源）', is2xx(r) && r.json && r.json[0] && r.json[0].base_salary == 40000 && r.json[0].pt_rate == 700, r.json); }
    const SENS = ['base_salary', 'pay_rate', 'pt_rate', 'group_rate', 'duty_hourly', 'pay_rules', 'id_number', 'id_no', 'bank_account', 'insured_grade', 'insured_unit', 'email', 'birthday', 'hire_date', 'invite_token', 'line_user_id', 'line_bind_token', 'address'];
    for (const k of ['dsk', 'cch', 'mgr', 'hrp', 'adm']) { const r = await U(tok[k], 'GET', 'employees_public?select=*'); const keys = r.json && r.json[0] ? Object.keys(r.json[0]) : []; T('教練名單 employees_public（' + k + '）列數＝全員、無敏感欄', is2xx(r) && r.json.length === N && SENS.every(c => !keys.includes(c)), { http: r.status, n: r.json && r.json.length, leak: SENS.filter(c => keys.includes(c)) }); }
    { const a = await U(tok.dsk, 'GET', 'employees_public?select=id,phone&id=eq.' + P.mch), b = await U(tok.cch, 'GET', 'employees_public?select=id,phone&id=eq.' + P.mch), c = await U(tok.mgr, 'GET', 'employees_public?select=id,phone&id=eq.' + P.mch); T('電話：櫃檯、店長看得到，一般教練為空', a.json[0].phone && c.json[0].phone && b.json[0].phone === null, { dsk: a.json[0], cch: b.json[0], mgr: c.json[0] }); }
    { const r = await U(tok.mgr, 'GET', 'employees_manager_scope?select=id,hire_date'); T('主管只看所管人員到職日', is2xx(r) && r.json.length === 1 && r.json[0].id === P.mch && r.json[0].hire_date === '2021-05-01', r.json); }
    { const r = await U(tok.dsk, 'GET', 'employees_manager_scope?select=id'); T('櫃檯看不到主管範圍檢視', is2xx(r) && r.json.length === 0, r.json); }
    { const a = await U(tok.hrp, 'GET', 'employees_pay?select=*'); const keys = a.json && a.json[0] ? Object.keys(a.json[0]) : []; T('薪資人員 employees_pay 全員、只含必要欄（無證件／銀行／電話／Email）', is2xx(a) && a.json.length === N && ['id_number', 'bank_account', 'phone', 'email', 'address', 'insured_unit'].every(c => !keys.includes(c)) && keys.includes('base_salary'), { n: a.json && a.json.length, keys: keys.length }); const b = await U(tok.cch, 'GET', 'employees_pay?select=id'); T('一般教練讀 employees_pay＝0 列', is2xx(b) && b.json.length === 0, b.json); const c = await U(tok.hrp, 'GET', 'employees_insure?select=id'); T('薪資人員沒有 insure 職責＝employees_insure 0 列', is2xx(c) && c.json.length === 0, c.json); }
    { const a = await U(tok.adm, 'GET', 'employees_account?select=*'); const keys = a.json && a.json[0] ? Object.keys(a.json[0]) : []; T('帳號管理檢視（管理員）全員、無薪資／證件', is2xx(a) && a.json.length === N && ['base_salary', 'id_number', 'bank_account', 'insured_grade', 'birthday', 'hire_date'].every(c => !keys.includes(c)) && keys.includes('invite_token'), { n: a.json && a.json.length }); const b = await U(tok.dsk, 'GET', 'employees_account?select=id'); T('櫃檯讀帳號管理檢視＝0 列', is2xx(b) && b.json.length === 0, b.json); }
    { const a = await U(null, 'GET', 'employees?select=id'), b = await U(null, 'GET', 'employees_public?select=id'); T('匿名（未登入）讀員工基表／名單＝無資料', (a.status === 401 || (is2xx(a) && a.json.length === 0)) && (b.status === 401 || b.status === 403 || (is2xx(b) && b.json.length === 0)), { a: a.status, b: b.status }); }

    log('═══ 3. 真實 HTTP：櫃檯改一般欄位／不能改敏感欄位 ═══');
    { const a = await U(tok.dsk, 'POST', 'rpc/fn_employee_update_general', { p_id: P.mch, p_patch: { name_en: 'HR-Accept' } }); T('櫃檯 RPC 改 name_en → ok', a.status === 200 && a.json && a.json.ok === true, a.json); const chk = await api.rest('GET', 'employees?select=name_en&id=eq.' + P.mch); T('  確認已寫入', chk.json[0].name_en === 'HR-Accept', chk.json); }
    for (const f of ['base_salary', 'id_number', 'bank_account', 'role']) { const r = await U(tok.dsk, 'POST', 'rpc/fn_employee_update_general', { p_id: P.mch, p_patch: { [f]: f === 'role' ? 'admin' : 'X' } }); T('櫃檯 RPC 改 ' + f + ' → 拒絕', r.status === 200 && r.json && r.json.ok === false && /FIELD_NOT_ALLOWED/.test(r.json.error_code), r.json); }
    { const r = await U(tok.dsk, 'PATCH', 'employees?id=eq.' + P.mch, { base_salary: 1 }, REP); T('櫃檯直接 PATCH 他人底薪 → 0 列', is2xx(r) && Array.isArray(r.json) && r.json.length === 0, { http: r.status, body: r.json }); const chk = await api.rest('GET', 'employees?select=base_salary&id=eq.' + P.mch); T('  資料庫值沒變（35000）', chk.json[0].base_salary == 35000, chk.json); }
    { const r = await U(tok.cch, 'PATCH', 'employees?id=eq.' + P.cch, { base_salary: 99999 }, REP); T('教練直接改自己的底薪 → 被守衛擋下（4xx）', r.status >= 400 && r.status < 500 && /EMP\.GUARD|base_salary/.test(r.text), { http: r.status, text: r.text.slice(0, 120) }); const r2 = await U(tok.cch, 'PATCH', 'employees?id=eq.' + P.cch, { name_en: 'Me' }, REP); T('教練改自己的 name_en → 可', is2xx(r2) && r2.json.length === 1, r2.json); const r3 = await U(tok.cch, 'POST', 'rpc/fn_employee_update_general', { p_id: P.mch, p_patch: { name_en: 'x' } }); T('教練呼叫櫃檯 RPC → FORBIDDEN', r3.status === 200 && r3.json && r3.json.error_code === 'AUTH.FORBIDDEN', r3.json); }

    log('═══ 4. 真實 HTTP：薪資歷史 ═══');
    { const g = async (k) => { const r = await U(tok[k], 'GET', 'salary_history?select=id,emp_id'); return r.json && r.json.filter(x => String(x.id).indexOf('CC-SH-' + runId) === 0).length; };
      T('薪資歷史：管理員 2（過渡期）', (await g('adm')) === 2); T('薪資歷史：薪資人員(pay_view) 2', (await g('hrp')) === 2); T('薪資歷史：教練只有自己 1', (await g('cch')) === 1); T('薪資歷史：櫃檯 0', (await g('dsk')) === 0); T('薪資歷史：主管 0', (await g('mgr')) === 0); }

    log('═══ 5. 真實 HTTP：補打卡 ═══');
    const d1 = tpeDate(-3), id = (s) => 'CC-PR-' + runId + '-' + s;
    { const a = await U(tok.cch, 'POST', 'punch_requests', { id: id('own'), emp_id: P.cch, emp_name: NAME.cch, date: d1, clock_in: '09:00', reason: 't', status: 'pending', created_at: new Date().toISOString() }); T('本人送出申請（pending）→ 201', a.status === 201, { http: a.status, text: a.text.slice(0, 100) });
      const b = await U(tok.cch, 'POST', 'punch_requests', { id: id('own2'), emp_id: P.cch, emp_name: NAME.cch, date: d1, clock_in: '09:00', reason: 't', status: 'approved' }); T('本人送出時直接填「已核准」→ 403（RLS）', b.status === 403, { http: b.status });
      const c = await U(tok.cch, 'POST', 'punch_requests', { id: id('fake'), emp_id: P.mch, emp_name: NAME.mch, date: d1, clock_in: '09:00', reason: 't', status: 'pending' }); T('教練幫別人送申請 → 403', c.status === 403, { http: c.status });
      const d = await U(tok.dsk, 'POST', 'punch_requests', { id: id('proxy'), emp_id: P.mch, emp_name: NAME.mch, date: d1, clock_in: '09:00', clock_out: '18:00', reason: '代登', status: 'pending', requested_by: P.dsk }); T('櫃檯代登（pending＋requested_by）→ 201', d.status === 201, { http: d.status, text: d.text.slice(0, 100) });
      const e = await U(tok.dsk, 'POST', 'punch_requests', { id: id('proxy2'), emp_id: P.mch, emp_name: NAME.mch, date: tpeDate(-4), clock_in: '09:00', reason: '代登', status: 'approved', requested_by: P.dsk }); T('櫃檯代登但填已核准 → 403', e.status === 403, { http: e.status });
      for (const k of ['dsk', 'adm', 'cch', 'mgr']) { const r = await U(tok[k], 'PATCH', 'punch_requests?id=eq.' + id('own'), { status: 'approved' }, REP); T('直接 PATCH 狀態為已核准（' + k + '）→ 0 列', is2xx(r) && Array.isArray(r.json) && r.json.length === 0, { http: r.status, body: r.json }); }
      const chk = await api.rest('GET', 'punch_requests?select=id,status&emp_id=in.(' + P.cch + ',' + P.mch + ')'); T('  資料庫狀態都仍是 pending', chk.json.every(x => x.status === 'pending'), chk.json);
      const v = async (k, pid, ap) => (await U(tok[k], 'POST', 'rpc/fn_punch_decide', { p_id: pid, p_approve: ap })).json;
      let j; j = await v('cch', id('own'), true); T('RPC：本人核准自己 → PR.SELF', j && j.error_code === 'PR.SELF', j);
      j = await v('adm', id('own'), true); T('RPC：管理員核准別人（教練）→ ok', j && j.ok === true, j);
      j = await v('dsk', id('proxy'), true); T('RPC：櫃檯核准 → NOT_IN_SCOPE', j && j.error_code === 'AUTH.NOT_IN_SCOPE', j);
      j = await v('hrp', id('proxy'), true); T('RPC：薪資人員核准 → NOT_IN_SCOPE', j && j.error_code === 'AUTH.NOT_IN_SCOPE', j);
      j = await v('mgr', id('proxy'), true); T('RPC：所管主管核准代登的申請 → ok', j && j.ok === true, j);
      j = await v('mgr', id('proxy'), true); T('RPC：重複核准 → NOT_PENDING', j && j.error_code === 'PR.NOT_PENDING', j);
      const at = await api.rest('GET', 'attendance?select=clock_in,clock_out,work_hours&emp_id=eq.' + P.mch + '&date=eq.' + d1); T('  核准後寫入出勤 09:00~18:00＝9 小時', at.json && at.json[0] && at.json[0].clock_in === '09:00' && at.json[0].clock_out === '18:00' && Number(at.json[0].work_hours) === 9, at.json);
      const own = await U(tok.mgr, 'POST', 'punch_requests', { id: id('mgrown'), emp_id: P.mgr, emp_name: NAME.mgr, date: d1, clock_in: '09:00', reason: 't', status: 'pending' }); j = await v('mgr', id('mgrown'), true); T('RPC：主管核准自己 → PR.SELF', own.status === 201 && j && j.error_code === 'PR.SELF', j);
      const adown = await U(tok.adm, 'POST', 'punch_requests', { id: id('admown'), emp_id: P.adm, emp_name: NAME.adm, date: d1, clock_in: '09:00', reason: 't', status: 'pending' }); j = await v('adm', id('admown'), true); T('RPC：管理員核准自己 → PR.SELF', adown.status === 201 && j && j.error_code === 'PR.SELF', j);
      const mo = await U(tok.cch, 'POST', 'punch_requests', { id: id('o2'), emp_id: P.cch, emp_name: NAME.cch, date: tpeDate(-5), clock_in: '09:00', reason: 't', status: 'pending' }); j = await v('mgr', id('o2'), true); T('RPC：主管核准非所管教練 → NOT_IN_SCOPE', mo.status === 201 && j && j.error_code === 'AUTH.NOT_IN_SCOPE', j);
      const vis = async (k) => { const r = await U(tok[k], 'GET', 'punch_requests?select=id,emp_id&emp_id=in.(' + Object.values(P).join(',') + ')'); return r.json ? r.json.length : -1; };
      const total = (await api.rest('GET', 'punch_requests?select=id&emp_id=in.(' + Object.values(P).join(',') + ')')).json.length;
      T('可見範圍：管理員、櫃檯＝全部 ' + total, (await vis('adm')) === total && (await vis('dsk')) === total, { adm: await vis('adm'), dsk: await vis('dsk') });
      T('可見範圍：主管只看所管＋自己', (await vis('mgr')) === (await U(tok.mgr, 'GET', 'punch_requests?select=id&emp_id=in.(' + P.mch + ',' + P.mgr + ')')).json.length && (await vis('mgr')) < total, { mgr: await vis('mgr') });
    }

    log('═══ 6. 真實 HTTP：出勤（時間由伺服器決定、既有時間不可自改）═══');
    { const day = tpeDate(0), aid = 'CC-AT-' + runId;
      const a = await U(tok.mch, 'POST', 'attendance', { id: aid, emp_id: P.mch, emp_name: NAME.mch, date: day, clock_in: '03:33', created_at: new Date().toISOString() }, REP); T('第一次打卡：前端傳 03:33 → 201，回傳的是伺服器時間', a.status === 201 && a.json && a.json[0] && nearNow(a.json[0].clock_in) && a.json[0].clock_in !== '03:33', { http: a.status, got: a.json && a.json[0] && a.json[0].clock_in, now: tpeHM() });
      const dup = await U(tok.mch, 'POST', 'attendance', { id: aid + 'b', emp_id: P.mch, emp_name: NAME.mch, date: day, clock_in: '04:00' }, REP); T('同員工同日第二筆 → 409（既有唯一限制）', dup.status === 409, { http: dup.status });
      const withOut = await U(tok.mgr, 'POST', 'attendance', { id: aid + 'm', emp_id: P.mgr, emp_name: NAME.mgr, date: day, clock_in: '09:00', clock_out: '10:00' }, REP); T('第一次打卡就帶下班時間 → 被擋（4xx）', withOut.status >= 400 && /ATT\.LOCKED/.test(withOut.text), { http: withOut.status, text: withOut.text.slice(0, 100) });
      const yest = await U(tok.mgr, 'POST', 'attendance', { id: aid + 'y', emp_id: P.mgr, emp_name: NAME.mgr, date: tpeDate(-1), clock_in: '09:00' }, REP); T('新增昨天的卡 → 被擋（走補打卡申請）', yest.status >= 400 && /ATT\.DATE_WINDOW/.test(yest.text), { http: yest.status, text: yest.text.slice(0, 100) });
      const out = await U(tok.mch, 'PATCH', 'attendance?id=eq.' + aid, { clock_out: '04:44', work_hours: 99 }, REP); T('補打下班：傳 04:44＋工時 99 → 201／200，下班時間改伺服器時間、工時由伺服器算', is2xx(out) && out.json && out.json[0] && nearNow(out.json[0].clock_out) && Number(out.json[0].work_hours) !== 99, { http: out.status, got: out.json && out.json[0] });
      for (const [nm, patch] of [['改既有上班時間', { clock_in: '05:00' }], ['改既有下班時間', { clock_out: '23:00' }], ['單獨改工時', { work_hours: 12 }], ['改日期', { date: tpeDate(-1) }], ['改備註', { note: 'x' }], ['改更正人', { fixed_by: P.adm }]]) { const r = await U(tok.mch, 'PATCH', 'attendance?id=eq.' + aid, patch, REP); T(nm + ' → 被擋（4xx）', r.status >= 400 && r.status < 500 && /ATT\./.test(r.text), { http: r.status, text: r.text.slice(0, 100) }); }
      const up = await U(tok.mch, 'POST', 'attendance', { id: aid, emp_id: P.mch, emp_name: NAME.mch, date: day, clock_in: '01:00', clock_out: '23:59', work_hours: 15 }, Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' })); T('前端 dbPut 式整筆 upsert 想改上班時間 → 被擋', up.status >= 400 && /ATT\.LOCKED/.test(up.text), { http: up.status, text: up.text.slice(0, 100) });
      const undo = await U(tok.mch, 'PATCH', 'attendance?id=eq.' + aid, { clock_out: null, work_hours: null }, REP); T('下班後 10 分鐘內取消下班 → 可（按錯的情況）', is2xx(undo) && undo.json && undo.json[0] && undo.json[0].clock_out === null, { http: undo.status, body: undo.json });
      const adm = await U(tok.adm, 'PATCH', 'attendance?id=eq.' + aid, { clock_in: '08:30' }, REP); T('管理員直接更正既有上班時間 → 可', is2xx(adm) && adm.json && adm.json[0] && adm.json[0].clock_in === '08:30', { http: adm.status, body: adm.json });
      const mine = await U(tok.mch, 'GET', 'attendance?select=id&emp_id=eq.' + P.mch + '&limit=50'); T('本人讀自己的出勤正常', is2xx(mine) && mine.json.length >= 1, { n: mine.json && mine.json.length });
      const others = await U(tok.cch, 'GET', 'attendance?select=id&emp_id=eq.' + P.mch); T('一般教練讀不到別人出勤', is2xx(others) && others.json.length === 0, others.json);
    }

    log('═══ 6b. 真實 HTTP：主管出勤範圍、到班狀態、舊頁面保護、change_log／簽章、fn_set_employment_type ═══');
    { const day = tpeDate(0), d6 = tpeDate(-6), IDS = Object.values(P).join(',');
      const ac = await U(tok.cch, 'POST', 'attendance', { id: 'CC-AT-' + runId + '-c', emp_id: P.cch, emp_name: NAME.cch, date: day, clock_in: '09:00' }, REP);
      const am = await U(tok.mgr, 'POST', 'attendance', { id: 'CC-AT-' + runId + '-m', emp_id: P.mgr, emp_name: NAME.mgr, date: day, clock_in: '09:00' }, REP);
      T('準備：教練、主管本人各打一筆今天的上班卡 → 201', ac.status === 201 && am.status === 201, { cch: ac.status, mgr: am.status });
      const mine = async (k) => { const r = await U(tok[k], 'GET', 'attendance?select=emp_id&emp_id=in.(' + IDS + ')'); return r.json ? [...new Set(r.json.map(x => x.emp_id))].sort() : null; };
      const mgrSee = await mine('mgr'); T('主管只讀得到本人＋所管（被管教練、主管本人），讀不到其他教練', JSON.stringify(mgrSee) === JSON.stringify([P.mch, P.mgr].sort()), mgrSee);
      { const r = await U(tok.mgr, 'GET', 'attendance?select=work_hours,clock_in&emp_id=eq.' + P.cch); T('主管讀非所管教練的上下班與工時 → 0 列', is2xx(r) && r.json.length === 0, r.json); }
      const dskSee = await mine('dsk'), admSee = await mine('adm'); T('櫃檯、管理員讀得到全員出勤', dskSee.includes(P.cch) && dskSee.includes(P.mgr) && dskSee.includes(P.mch) && admSee.length === dskSee.length, { dsk: dskSee.length, adm: admSee.length });
      { const r = await U(tok.mgr, 'GET', 'attendance_presence?select=*&emp_id=in.(' + IDS + ')'); const keys = r.json && r.json[0] ? Object.keys(r.json[0]).sort() : []; const hasC = r.json && r.json.some(x => x.emp_id === P.cch && x.has_in === true);
        T('主管讀到班狀態：含非所管教練「已到班」，欄位只有 emp_id／date／has_in／has_out（沒有時間、工時）', is2xx(r) && hasC && JSON.stringify(keys) === JSON.stringify(['date', 'emp_id', 'has_in', 'has_out']), { keys, n: r.json && r.json.length }); }
      { const r = await U(tok.cch, 'GET', 'attendance_presence?select=emp_id'); T('一般教練讀到班狀態 → 0 列', is2xx(r) && r.json.length === 0, r.json); const r2 = await U(null, 'GET', 'attendance_presence?select=emp_id'); T('匿名讀到班狀態 → 無資料', r2.status === 401 || r2.status === 403 || (is2xx(r2) && r2.json.length === 0), { http: r2.status }); }
      { const r = await U(tok.mgr, 'GET', 'punch_requests?select=emp_id&emp_id=in.(' + IDS + ')'); const who = r.json ? [...new Set(r.json.map(x => x.emp_id))] : []; T('主管讀補打卡申請：只有所管＋自己', who.every(x => x === P.mch || x === P.mgr), who); }
      // ── 舊頁面保護：重現舊版核准（先直接寫出勤、再直接改申請狀態）
      const rq = 'CC-PR-' + runId + '-old';
      const mk = await U(tok.dsk, 'POST', 'punch_requests', { id: rq, emp_id: P.mch, emp_name: NAME.mch, date: d6, clock_in: '09:00', clock_out: '18:00', reason: '舊頁面保護', status: 'pending', requested_by: P.dsk }); T('準備：櫃檯代登被管教練 ' + d6 + ' 的待審申請 → 201', mk.status === 201, { http: mk.status, text: mk.text.slice(0, 100) });
      { const s1 = await U(tok.adm, 'POST', 'attendance', { id: 'CC-AT-' + runId + '-old', emp_id: P.mch, emp_name: NAME.mch, date: d6, clock_in: '09:00', clock_out: '18:00', work_hours: 9 }, REP);
        T('舊版核准第 1 步（管理員直接寫那天的出勤）→ 整筆拒絕 ATT.PENDING_REQUEST', s1.status >= 400 && s1.status < 500 && /ATT\.PENDING_REQUEST/.test(s1.text), { http: s1.status, text: s1.text.slice(0, 120) });
        const s2 = await U(tok.adm, 'PATCH', 'punch_requests?id=eq.' + rq, { status: 'approved' }, REP); T('舊版核准第 2 步（直接改申請狀態）→ 0 列', is2xx(s2) && Array.isArray(s2.json) && s2.json.length === 0, { http: s2.status, body: s2.json });
        const chk = await api.rest('GET', 'attendance?select=id&emp_id=eq.' + P.mch + '&date=eq.' + d6), st = await api.rest('GET', 'punch_requests?select=status&id=eq.' + rq);
        T('  舊請求沒有留下任何部分變更：出勤 0 列、申請仍 pending', chk.json.length === 0 && st.json[0].status === 'pending', { att: chk.json.length, st: st.json[0] }); }
      { const j = (await U(tok.mgr, 'POST', 'rpc/fn_punch_decide', { p_id: rq, p_approve: true })).json; const chk = await api.rest('GET', 'attendance?select=clock_in,clock_out,work_hours&emp_id=eq.' + P.mch + '&date=eq.' + d6);
        T('新版核准（RPC）完整成功，出勤 09:00~18:00＝9 小時', j && j.ok === true && chk.json.length === 1 && chk.json[0].clock_in === '09:00' && chk.json[0].clock_out === '18:00' && Number(chk.json[0].work_hours) === 9, { j, att: chk.json }); }
      { const own = await U(tok.mgr, 'POST', 'punch_requests', { id: 'CC-PR-' + runId + '-mown', emp_id: P.mgr, emp_name: NAME.mgr, date: day, clock_out: '18:00', reason: 't', status: 'pending' });
        const out = await U(tok.mgr, 'PATCH', 'attendance?id=eq.' + 'CC-AT-' + runId + '-m', { clock_out: '04:00', work_hours: 99 }, REP);
        T('新版正常打卡不被擋：本人當天有待審申請時照樣補下班，時間為伺服器時間', own.status === 201 && is2xx(out) && out.json && out.json[0] && nearNow(out.json[0].clock_out) && Number(out.json[0].work_hours) !== 99, { own: own.status, http: out.status, got: out.json && out.json[0] }); }
      { const r = await U(tok.dsk, 'PATCH', 'attendance?id=eq.' + 'CC-AT-' + runId + '-c', { clock_in: '07:00' }, REP); T('櫃檯直接寫別人出勤 → 仍被擋（0 列）', is2xx(r) && Array.isArray(r.json) && r.json.length === 0, { http: r.status, body: r.json }); const r2 = await U(tok.mgr, 'PATCH', 'attendance?id=eq.CC-AT-' + runId + '-old', { clock_in: '07:00' }, REP); T('主管直接寫所管者出勤 → 被擋（0 列或 4xx）', (is2xx(r2) && r2.json.length === 0) || (r2.status >= 400 && r2.status < 500), { http: r2.status }); }
      // ── change_log／簽章並存
      { const a = await U(tok.cch, 'GET', 'change_log?select=seq,tbl&order=seq.desc&limit=5'); T('員工可讀 change_log（增量補資料用）且有新紀錄', is2xx(a) && a.json.length > 0, { http: a.status, n: a.json && a.json.length });
        const b = await U(tok.cch, 'POST', 'rpc/fn_table_sigs', {}); T('員工呼叫 fn_table_sigs：含 attendance／employees／_log', b.status === 200 && b.json && 'attendance' in b.json && 'employees' in b.json && '_log' in b.json, { http: b.status, keys: b.json && Object.keys(b.json).length });
        const c = await U(null, 'POST', 'rpc/fn_table_sigs', {}); T('匿名呼叫 fn_table_sigs → 401／403', c.status === 401 || c.status === 403, { http: c.status });
        const log1 = await api.rest('GET', 'change_log?select=tbl,op&tbl=eq.attendance&order=seq.desc&limit=30'); T('觸發器並存：出勤寫入（含被守衛改成伺服器時間的）都有進 change_log', is2xx(log1) && log1.json.length >= 3, { n: log1.json && log1.json.length }); }
      // ── fn_set_employment_type（主管調整僱用別；定義者函式，靠旗標通過員工表守衛）
      { const call = async (k, who, ty) => (await U(tok[k], 'POST', 'rpc/fn_set_employment_type', { p_emp_id: who, p_type: ty })).json;
        let j = await call('mgr', P.mch, 'part_time'); T('主管調整被管教練僱用別 → ok', j && j.ok === true && j.employment_type === 'part_time', j);
        const e = await api.rest('GET', 'employees?select=employment_type&id=eq.' + P.mch); T('  資料庫已更新', e.json[0].employment_type === 'part_time', e.json);
        j = await call('cch', P.mch, 'full_time'); T('一般教練呼叫 → AUTH.NOT_MANAGER', j && j.error_code === 'AUTH.NOT_MANAGER', j);
        j = await call('mgr', P.mgr, 'part_time'); T('主管對自己 → EMP.SELF', j && j.error_code === 'EMP.SELF', j);
        j = await call('mgr', P.adm, 'part_time'); T('主管對管理員 → EMP.IS_ADMIN', j && j.error_code === 'EMP.IS_ADMIN', j);
        const r = await U(tok.mgr, 'PATCH', 'employees?id=eq.' + P.mch, { base_salary: 1 }, REP); T('呼叫後旗標已熄滅：主管直接改別人底薪 → 0 列', is2xx(r) && Array.isArray(r.json) && r.json.length === 0, { http: r.status, body: r.json }); }
    }

    log('═══ 7. 真實 HTTP：關閉「管理員自動人事權限」（系統管理員另外授予）═══');
    { settingTouched = true; const s = await api.rest('PATCH', 'hr_settings?key=eq.admin_implicit_hr', { value: 'false' }, { Prefer: 'return=minimal' }); T('設定 admin_implicit_hr=false', is2xx(s), { http: s.status });
      const a = await U(tok.adm, 'GET', 'employees?select=id'); T('關閉後：管理員讀員工基表只剩自己 1 列', is2xx(a) && a.json.length === 1, { n: a.json && a.json.length });
      const b = await U(tok.adm, 'GET', 'employees?select=base_salary,id_number&id=eq.' + P.mch); T('關閉後：管理員讀不到他人底薪／證件', is2xx(b) && b.json.length === 0, b.json);
      const c = await U(tok.adm, 'GET', 'employees_account?select=id,phone,invite_token'); T('關閉後：帳號管理檢視仍有全員（帳號管理不受影響）', is2xx(c) && c.json.length === N, { n: c.json && c.json.length });
      const d = await U(tok.adm, 'GET', 'employees_pay?select=id'); T('關閉後：管理員讀 employees_pay＝0', is2xx(d) && d.json.length === 0, d.json);
      const e = await U(tok.adm, 'GET', 'salary_history?select=id'); T('關閉後：管理員讀薪資歷史＝0', is2xx(e) && e.json.filter(x => String(x.id).indexOf('CC-SH-' + runId) === 0).length === 0, { n: e.json && e.json.length });
      const f = await U(tok.hrp, 'GET', 'employees_pay?select=id'); T('關閉後：有 pay_view 的人不受影響', is2xx(f) && f.json.length === N, { n: f.json && f.json.length });
      const g = await U(tok.adm, 'POST', 'rpc/fn_my_hr_access', {}); T('fn_my_hr_access：admin_full_hr=false', g.status === 200 && g.json && g.json.admin_full_hr === false, g.json);
      const r = await api.rest('PATCH', 'hr_settings?key=eq.admin_implicit_hr', { value: 'true' }, { Prefer: 'return=minimal' }); T('還原 admin_implicit_hr=true', is2xx(r), { http: r.status }); settingTouched = false;
      const h = await U(tok.adm, 'GET', 'employees?select=id'); T('還原後：管理員基表全員', is2xx(h) && h.json.length === N, { n: h.json && h.json.length }); }

    if (fail) log('\n⚠ 真實 HTTP 有失敗項（見上），仍保留工作階段供你與 Claude 判斷；不影響清除。');
    fs.writeFileSync(path.join(WORK, 'http_results.json'), JSON.stringify({ runId, at: new Date().toISOString(), pass, fail, rows }, null, 2), { mode: 0o600 });
    log('\n✔ 真實 HTTP 結果：' + pass + ' 通過／' + fail + ' 失敗；結果檔：' + path.join(WORK, 'http_results.json'));
    log('  各角色登入工作階段：' + sessFile + '（0600）。現在請告訴 Claude「可以開始瀏覽器驗收」。');
    log('  全部做完後，回到這個視窗按 Enter → 自動清除並比對測前基準。');
    await Promise.race([new Promise(res => { process.stdin.setEncoding('utf8'); process.stdin.once('data', res); process.stdin.resume(); }), new Promise((_, rej) => { H.stopSignal.addEventListener('abort', () => rej(new Error('STOPPED'))); })]);
    process.stdin.pause();
  } catch (e) { if (String(e.message) === 'STOPPED') { stoppedBy = 'SIGINT／SIGTERM'; log('  ? 被中斷：進入收尾'); } else { fail++; log('✗ 流程中止：' + String(e.message || e)); } }
  finally {
    log('═══ 8. 清除 → 逐項確認不存在 → 與測前基準比對 ═══'); try { fs.rmSync(sessFile, { force: true }); } catch (_) {}
    if (settingTouched) { try { await apiClean.rest('PATCH', 'hr_settings?key=eq.admin_implicit_hr', { value: 'true' }, { Prefer: 'return=minimal' }); log('  已還原 admin_implicit_hr=true'); } catch (_) { log('  ✗ 還原 admin_implicit_hr 失敗，請手動確認'); } }
    let rep = { failures: ['清除程序未執行'] }, d = null; const extra = [];
    const ownLogIds={employees:H.createdIds('employees'),salary_history:H.createdIds('salary_history')};
    try {
      const employees=H.createdIds('employees');
      for(const table of ['attendance','punch_requests']){
        ownLogIds[table]=[];
        if(!employees.length) continue;
        const response=await apiClean.rest('GET',table+'?select=id&emp_id=in.('+employees.map(encodeURIComponent).join(',')+')');
        if(!is2xx(response)||!Array.isArray(response.json)) throw new Error(table+' 清除範圍查詢失敗');
        ownLogIds[table]=response.json.map(row=>row.id);
      }
    } catch(e){extra.push(String(e.message||e));}
    try { rep = await H.cleanup(apiClean, spec()); } catch (e) { rep = { failures: ['清除程序錯誤：' + String(e.message || e)] }; }
    // 只清除本輪精確資料 ID 的日誌，保留其他測試者的紀錄。
    for(const [table,ids] of Object.entries(ownLogIds)){
      if(!ids.length) continue;
      try{
        const response=await apiClean.rest('DELETE','change_log?at=gte.'+encodeURIComponent(startIso)+'&tbl=eq.'+table+'&row_id=in.('+ids.map(encodeURIComponent).join(',')+')');
        if(!is2xx(response)) rep.failures.push('change_log '+table+' 清除 HTTP '+response.status);
      }catch(e){rep.failures.push('change_log '+table+' 清除錯誤：'+String(e.message||e));}
    }
    try { if (before) { const after = await H.snapshot(apiClean); d = H.diffSnap(before, after); } } catch (e) { extra.push('測後基準讀取失敗：' + String(e.message || e)); }
    const pending = H.unresolved();
    cleanOk = !!(d && d.tablesChanged.length === 0 && !d.authUsersChanged && !rep.failures.length && !extra.length && pending.length === 0 && H.canClaimComplete());
    if (rep.failures.length) log('  清除失敗：' + rep.failures.join('；')); if (pending.length) log('  ⚠ 待處理：' + pending.join('、'));
    T('清除後資料與登入帳號回到測前基準、沒有待處理、追蹤檔全程寫入成功', cleanOk, { failures: rep.failures.concat(extra), pending, diff: d });
    if (cleanOk && H.MF) { H.MF.finished = true; H.MF.finishedAt = new Date().toISOString(); const pe = H.trySave(); if (pe) { H.persistFail(pe); cleanOk = false; } }
    const overall = fail ? 'FAILED' : (!cleanOk ? 'CLEANUP_INCOMPLETE' : (stoppedBy ? 'STOPPED_CLEANED' : 'HR_ACCEPT_CLEANED'));
    const rw = H.saveReport(path.join(WORK, 'hr_acceptance_report.json'), { finishedAt: new Date().toISOString(), overall, pass, fail, stoppedBy, cleanup: rep, pending, diff: d, rows });
    log('\n整體判定：' + overall + '；' + pass + ' 通過／' + fail + ' 失敗；' + (rw.ok ? '報告已保存' : '報告未保存：' + rw.error)); process.exitCode = (rw.ok && overall === 'HR_ACCEPT_CLEANED') ? 0 : 1;
  }
}
main().catch(e => { console.error('✗ ' + String(e.message || e)); process.exit(2); });
