#!/usr/bin/env node
/* 不需要金鑰的自測：run_hold_settle_concurrency.js 的判定邏輯與失敗路徑（不連任何資料庫）。
   harness 本身（manifest／Auth 查證／中斷收尾／清除／恢復）已由 docs/testdb/renewal/harness_selftest.js 驗過，這裡不重測、也不複製。 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { verifyAdvisory, invariants, overallOf, checkFingerprint, evalCC4Final, evalCC4Mid, PINS } = require('./run_hold_settle_concurrency.js');
const { checkServiceKey } = require('../renewal/harness.js');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const runner = path.join(__dirname, 'run_hold_settle_concurrency.js'); const src = fs.readFileSync(runner, 'utf8'); const zz = fs.readFileSync(path.join(__dirname, 'phase_install_hs_zz.sql'), 'utf8');

console.log('verifyAdvisory（等 advisory 鎖的真並行判定）');
{
  const adv = { classid: '1', objid: '99', objsubid: '2' };
  const holder = (over) => Object.assign({ pid: 10, end: '2026-11-20T10:00:00.500Z', advisory_held: [adv], blocked_waiters: [{ pid: 20, application_name: 'cc:hs:waiter:settle:T', waits_on: [Object.assign({ locktype: 'advisory' }, adv)] }] }, over || {});
  const waiter = (over) => Object.assign({ pid: 20, end: '2026-11-20T10:00:00.900Z' }, over || {});
  const T = 'cc:hs:waiter:settle:T';
  ok('★ 持鎖者看到對手、等的是持鎖者持有的 advisory 鎖、標記相符、對手後完成 → 通過', verifyAdvisory(holder(), waiter(), T).verified === true);
  ok('★ 對手等的是別把 advisory 鎖 → 不通過', verifyAdvisory(holder({ blocked_waiters: [{ pid: 20, application_name: T, waits_on: [{ locktype: 'advisory', classid: '1', objid: '123', objsubid: '2' }] }] }), waiter(), T).verified === false);
  ok('★ 對手在等 transactionid 而不是 advisory（不是本批的關係）→ 不通過', verifyAdvisory(holder({ blocked_waiters: [{ pid: 20, application_name: T, waits_on: [{ locktype: 'transactionid', transactionid: '5' }] }] }), waiter(), T).verified === false);
  ok('★ 案例標記不符（可能看到別的請求）→ 不通過', verifyAdvisory(holder(), waiter(), 'cc:hs:waiter:settle:OTHER').verified === false);
  ok('★ 同一個 pid（沒有真的兩條連線）→ 不通過', verifyAdvisory(holder({ pid: 20 }), waiter(), T).verified === false);
  ok('★ 對手比持鎖者先完成（不可能被擋住）→ 不通過', verifyAdvisory(holder(), waiter({ end: '2026-11-20T10:00:00.100Z' }), T).verified === false);
  ok('　　持鎖者沒看到任何被擋的人 → 不通過', verifyAdvisory(holder({ blocked_waiters: [] }), waiter(), T).verified === false);
  ok('　　空輸入不丟例外', verifyAdvisory(null, null, T).verified === false);
}
console.log('\ninvariants（資料庫不變量）');
{
  const tk = (id, tot, rem) => ({ id, sessions_total: tot, sessions_remaining: rem });
  const lg = (t, b, a) => ({ ticket_id: t, booking_id: b, action: a, delta: a === 'deduct' ? -1 : 1 });
  ok('★ 正常：綁票的各扣 1、取消的沒扣、餘額相符 → 無違規', invariants([{ id: 'b1', status: 'booked', ticket_id: 'T' }, { id: 'b2', status: 'cancelled', ticket_id: null }], [lg('T', 'b1', 'deduct')], [tk('T', 3, 2)]).length === 0);
  ok('★ 重複扣（同一堂同一張票淨扣 2）→ 違規', invariants([{ id: 'b1', status: 'booked', ticket_id: 'T' }], [lg('T', 'b1', 'deduct'), lg('T', 'b1', 'deduct')], [tk('T', 3, 1)]).length > 0);
  ok('★ 已取消卻有淨扣課（沒退）→ 違規', invariants([{ id: 'b1', status: 'cancelled', ticket_id: null }], [lg('T', 'b1', 'deduct')], [tk('T', 3, 2)]).length > 0);
  ok('★ 取消且已退（扣−退＝0）→ 無違規', invariants([{ id: 'b1', status: 'cancelled', ticket_id: null }], [lg('T', 'b1', 'deduct'), lg('T', 'b1', 'refund')], [tk('T', 3, 3)]).length === 0);
  ok('★ 沒綁票卻有扣課 → 違規', invariants([{ id: 'b1', status: 'booked', ticket_id: null }], [lg('T', 'b1', 'deduct')], [tk('T', 3, 2)]).length > 0);
  ok('★ 綁票但沒有扣課 → 違規', invariants([{ id: 'b1', status: 'booked', ticket_id: 'T' }], [], [tk('T', 3, 3)]).length > 0);
  ok('★ 一堂對兩張票都有淨扣 → 違規', invariants([{ id: 'b1', status: 'booked', ticket_id: 'T' }], [lg('T', 'b1', 'deduct'), lg('U', 'b1', 'deduct')], [tk('T', 3, 2), tk('U', 3, 2)]).length > 0);
  ok('★ 票券餘額與總堂數−淨扣不符 → 違規', invariants([{ id: 'b1', status: 'booked', ticket_id: 'T' }], [lg('T', 'b1', 'deduct')], [tk('T', 3, 3)]).length > 0);
  ok('　　delta 0 的「已阻擋」帳不算扣課', invariants([{ id: 'b1', status: 'booked', ticket_id: 'T' }], [lg('T', 'b1', 'deduct'), { ticket_id: 'T', booking_id: 'b1', action: 'deduct', delta: 0 }], [tk('T', 3, 2)]).length === 0);
}
console.log('\nCC4a 矛盾案例（中間狀態 vs 完整流程）：修正後的案例與預期要能同時成立');
{
  const tk = (rem) => [{ id: 'T', sessions_total: 2, sessions_remaining: rem }];
  const dd = { ticket_id: 'T', booking_id: 'X', action: 'deduct', delta: -1 };
  const bks = (xBound) => [{ id: 'X', status: 'booked', ticket_id: xBound ? 'T' : null }, { id: 'Y', status: 'booked', ticket_id: null }, { id: 'Z', status: 'booked', ticket_id: null }];
  const mid = invariants(bks(false), [dd], tk(1)), fin = invariants(bks(true), [dd], tk(1));
  ok('★ 矛盾本身：只扣堂、尚未綁票時，invariants 必然違規（這就是舊 CC4a 不可能通過的原因）', mid.length === 1 && /沒綁票/.test(mid[0]), mid);
  ok('★ 中間狀態判定（evalCC4Mid）：只允許「指定那一筆沒綁票卻有扣課」→ 通過', evalCC4Mid(mid, 'X').length === 0);
  ok('★ 中間狀態判定：違規的是別筆預約 → 不通過', evalCC4Mid(invariants([{ id: 'X', status: 'booked', ticket_id: null }, { id: 'Y', status: 'booked', ticket_id: null }], [dd, { ticket_id: 'T', booking_id: 'Y', action: 'deduct', delta: -1 }], tk(0)), 'X').length > 0);
  ok('★ 中間狀態判定：除了預期那一筆還有別的違規（例如餘額不符）→ 不通過', evalCC4Mid(invariants(bks(false), [dd], tk(2)), 'X').length > 0);
  ok('★ 中間狀態判定：沒有任何違規（其實已綁票）→ 也不通過（中間狀態必須真的是半套，否則測的不是這個範圍）', evalCC4Mid(fin, 'X').length > 0);
  ok('★ 完整流程判定（evalCC4Final）：扣堂＋綁票後 invariants 全成立 → 通過；補完綁票後的最終狀態同樣通過', evalCC4Final(fin).length === 0);
  ok('★ 完整流程判定：最終仍有半套（沒綁票卻有扣課）→ 不通過（不能靠刪掉一致性斷言來通過）', evalCC4Final(mid).length > 0);
  ok('★ 執行器對中間狀態的程式碼：標明範圍、之後必須補完綁票並驗最終一致、不宣稱完整流程安全', /不宣稱完整流程安全/.test(src) && /desk_bind/.test(src) && /CC4a-補完後 最終狀態一致/.test(src) && !/invariants\(s\.b, s\.l, s\.t\)\.length === 0, s\)\;\s*\}\s*\n\s*\{ const m = await mkMember\('M4m'\)/.test(src));
  ok('★ CC4 每個請求都有 HTTP 200 斷言並保存原始回應（完整／中間／補完／取消）', (src.match(/http200\('CC4/g) || []).length >= 4 && /rawHttp\(h\), waiter: rawHttp\(w\)/.test(src));
}
console.log('\n前置指紋（06／08／11 與本函式必須齊備；不再略過案例）');
{
  const good = Object.assign({}, PINS, { quota_trigger: true, desk_deduct: true, desk_cancel: true, refund_fn: true });
  ok('★ 全部齊備且指紋相符 → 無不符', checkFingerprint(good).length === 0);
  ok('★ 階段 08 沒裝（desk_deduct 缺）→ 不符、執行器會在建立任何東西之前停止', checkFingerprint(Object.assign({}, good, { desk_deduct: false })).length > 0);
  ok('★ 階段 06 沒裝（quota 觸發器缺）→ 不符', checkFingerprint(Object.assign({}, good, { quota_trigger: false })).length > 0);
  ok('★ 階段 11 函式不是審查版（state 指紋不同／缺少）→ 不符', checkFingerprint(Object.assign({}, good, { state_md5: 'x' })).length > 0 && checkFingerprint(Object.assign({}, good, { adopt_md5: null })).length > 0);
  ok('★ 本函式不是審查版／權限不對 → 不符', checkFingerprint(Object.assign({}, good, { settle_md5: 'deadbeef' })).length > 0 && checkFingerprint(Object.assign({}, good, { settle_acl: '{=X/postgres}' })).length > 0);
  ok('　　沒有取得指紋 → 不符', checkFingerprint(null).length > 0 && checkFingerprint(undefined).length > 0);
  ok('★ 執行器：指紋不符就丟錯停止（在 trackedCreateUser／任何新增之前），沒有略過案例的分支', src.indexOf('checkFingerprint(fp)') > 0 && src.indexOf('checkFingerprint(fp)') < src.indexOf('trackedCreateUser') && /不會略過任何案例/.test(src) && !/has08/.test(src));
}
console.log('\n觀測函式的物件限制（含錨點）');
{
  ok('★ 票券、預約、錨點預約都必須是 CC-HS- 開頭（空值放行）；鎖列／改時間／扣堂／取消／補綁都只用這幾個參數', /coalesce\(v_tk, 'CC-HS-'\) not like 'CC-HS-%'/.test(zz) && /coalesce\(v_bk, 'CC-HS-'\) not like 'CC-HS-%'/.test(zz) && /coalesce\(p_args->>'anchor', 'CC-HS-'\) not like 'CC-HS-%'/.test(zz));
  const kinds = [...zz.matchAll(/p_kind = '([a-z_]+)'/g)].map(m => m[1]); const used = [...zz.matchAll(/p_args->>'([a-z_]+)'/g)].map(m => m[1]);
  ok('★ 觀測函式只讀 ticket／booking／anchor／dry／set_start_time／set_remaining 這幾個參數（set_remaining 只轉成整數、且只作用在 CC-HS- 票券）（沒有別的物件參數能繞過限制）：' + [...new Set(used)].join('、'), used.every(k => ['ticket', 'booking', 'anchor', 'dry', 'set_start_time', 'set_remaining'].includes(k)), used);
  ok('　　支援的動作：' + kinds.join('、'), ['settle', 'lockrow', 'desk_deduct', 'desk_deduct_bind', 'desk_bind', 'desk_cancel'].every(k => kinds.includes(k)));
  ok('　　指紋函式唯讀、授權 anon／authenticated；移除檔兩支都移除', /zz_hs_fingerprint/.test(zz) && /grant execute on function public\.zz_hs_fingerprint\(\) to anon, authenticated/.test(zz) && /drop function if exists public\.zz_hs_fingerprint\(\)/.test(fs.readFileSync(path.join(__dirname, 'phase_remove_hs_zz.sql'), 'utf8')));
}
console.log('\n整體判定（失敗優先、清除未完成不算完成、略過案例不算完成）');
{
  ok('有失敗 → FAILED', overallOf({ fail: 1, cleanOk: true }) === 'FAILED');
  ok('清除未完成 → CLEANUP_INCOMPLETE', overallOf({ fail: 0, cleanOk: false }) === 'CLEANUP_INCOMPLETE');
  ok('被中斷但已清除 → STOPPED_CLEANED', overallOf({ fail: 0, cleanOk: true, stoppedBy: 'SIGINT' }) === 'STOPPED_CLEANED');
  ok('★ 略過了 CC4（階段 08 沒裝）→ 不是 COMPLETE', overallOf({ fail: 0, cleanOk: true, skipped: ['CC4'] }) === 'PARTIAL_CC4');
  ok('全部通過且清乾淨 → HS_CONC_COMPLETE', overallOf({ fail: 0, cleanOk: true, skipped: [] }) === 'HS_CONC_COMPLETE');
}
console.log('\n失敗路徑（不連網）');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-selftest-')); const run = (envText, args) => { const e = path.join(tmp, 'e.env'); if (envText !== null) fs.writeFileSync(e, envText); return cp.spawnSync(process.execPath, [runner, ...(args || ['--env', e]), '--work', path.join(tmp, 'w')], { encoding: 'utf8', input: '', timeout: 15000 }); };
  let r = run(null, []); ok('★ 缺 --env → 結束碼 2、說明缺參數（沒有任何請求）', r.status === 2 && /缺 --env/.test(r.stderr), { s: r.status, e: r.stderr });
  r = run('SB_URL=https://rlpiomzplckzqnqrvrwc.supabase.co\nANON_KEY=x\n'); ok('★ SB_URL 是正式庫 → 拒絕（結束碼 2、說明不是測試庫），不會往下問金鑰', r.status === 2 && /不是測試庫/.test(r.stderr) && !/金鑰>/.test(r.stdout), { s: r.status, e: r.stderr });
  r = run('SB_URL=https://kucvxpjatptfckhlxptj.supabase.co\n'); ok('　　缺 ANON_KEY → 拒絕', r.status === 2 && /缺 ANON_KEY/.test(r.stderr));
  r = run('SB_URL=https://kucvxpjatptfckhlxptj.supabase.co\nANON_KEY=x\n'); ok('★ 不是真正的終端機 → 拒絕輸入金鑰（隱藏輸入只在 TTY），結束碼 2', r.status === 2 && /真正的終端機/.test(r.stderr), { s: r.status, e: r.stderr });
  ok('★ 金鑰檢查：正式庫 ref、非 service_role、格式不對都被擋', !!checkServiceKey('x'.repeat(30), 'kucvxpjatptfckhlxptj') && !!checkServiceKey('eyJ.' + Buffer.from(JSON.stringify({ ref: 'rlpiomzplckzqnqrvrwc', role: 'service_role' })).toString('base64url') + '.sig', 'kucvxpjatptfckhlxptj') && !!checkServiceKey('eyJ.' + Buffer.from(JSON.stringify({ ref: 'kucvxpjatptfckhlxptj', role: 'anon' })).toString('base64url') + '.sig', 'kucvxpjatptfckhlxptj'));
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('\n原始碼保護');
{
  ok('★ 執行器只寫死測試庫、完全沒有正式庫識別', /kucvxpjatptfckhlxptj/.test(src) && !/rlpiomzplckzqnqrvrwc/.test(src) && !/7637215626725903220/.test(src));
  ok('★ 前置檢查先於任何新增：觀測函式／整理函式未安裝或權限不符 → 丟錯停止（尚未建立任何東西）', src.indexOf('尚未建立任何東西') > 0 && src.indexOf("probe('zz_hs_call'") < src.indexOf("trackedCreateUser") && src.indexOf("probe('fn_hold_settle_new_ticket'") < src.indexOf("trackedCreateUser"));
  ok('★ 所有新增都走 harness 的 trackedInsert／trackedCreateUser（planned→created 登記），清除只刪確定建立的（createdIds）', !/api\.rest\('POST'/.test(src) && /trackedInsert/.test(src) && /createdIds\('bookings'\)/.test(src));
  ok('★ 金鑰只用隱藏輸入，不寫檔、不進命令列、不進報告', /askHidden\('測試庫 service_role 金鑰> '\)/.test(src) && !/serviceKey\s*[,}]\s*[^)]*evidence/.test(src) && !/writeFileSync[^;]*serviceKey/.test(src));
  ok('★ 觀測函式：測試庫識別守門、只允許 CC-EMP- 身分與 CC-HS- 物件、只授權 authenticated', /7662742571317219726/.test(zz) && /not like 'CC-EMP-%'/.test(zz) && /not like 'CC-HS-%'/.test(zz) && /grant execute on function public\.zz_hs_call\(text, text, jsonb, int, int, int\) to authenticated/.test(zz) && /revoke all on function public\.zz_hs_call\(text, text, jsonb, int, int, int\) from public, anon/.test(zz));
  ok('　　觀測函式只呼叫正式函式（整理、櫃檯扣堂、櫃檯取消），不改它們的行為', /public\.fn_hold_settle_new_ticket\(/.test(zz) && /public\.fn_desk_deduct_ticket\(/.test(zz) && /public\.fn_desk_cancel_booking\(/.test(zz));
}
console.log('\n瀏覽器驗收工具（夾具表、本機前端轉接）');
{
  const { FIXTURES, kinds, sameCounts } = require('./run_hold_settle_browser_seed.js'); const sv = require('./serve_test_frontend.js');
  ok('★ 夾具表涵蓋驗收清單 D1–D6（含新票發放入口 D1′），每個都有預期清單與步驟說明', ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'].every(k => FIXTURES.some(f => f.key === k && f.step && f.expect)) && /D1 /.test(FIXTURES[0].step) && /D2 /.test(FIXTURES[1].step) && /D3 /.test(FIXTURES[2].step) && /D4 /.test(FIXTURES[3].step) && /D5 /.test(FIXTURES[4].step) && /D6 /.test(FIXTURES[5].step));
  ok('★ 夾具的預期清單自洽：卡位數＝轉正＋保留＋取消＋不動＋可由其他票承接', FIXTURES.every(f => Object.values(f.expect).reduce((a, b) => a + b, 0) === f.holds));
  ok('　　kinds／sameCounts 純函式', sameCounts(kinds([{ kind: 'bind' }, { kind: 'bind' }, { kind: 'cancel' }]), { bind: 2, cancel: 1 }) && !sameCounts(kinds([{ kind: 'bind' }]), { bind: 2 }));
  ok('★ 本機前端：只接受測試庫網址、config 只含網址與 anon 金鑰', (() => { try { sv.configJs('https://rlpiomzplckzqnqrvrwc.supabase.co', 'x'); return false; } catch (_) { return true; } })() && /^window\.YUGYM_CONFIG=\{"url":"https:\/\/kucvxpjatptfckhlxptj\.supabase\.co","anonKey":"a"\};$/.test(sv.configJs('https://kucvxpjatptfckhlxptj.supabase.co', 'a')));
  const html = sv.injectSession('<html><head><title>x</title></head><body></body></html>', { access_token: 'T</script>', refresh_token: 'R' });
  ok('★ 工作階段注入在 <head> 之後、key＝sb-<ref>-auth-token、內容跳脫（不會被 </script> 截斷）', /<head><script>try\{localStorage\.setItem\("sb-kucvxpjatptfckhlxptj-auth-token"/.test(html) && !/T<\/script>/.test(html) && /\\u003c\/script>/.test(html));
  ok('　　沒有工作階段時不改動 html', sv.injectSession('<head></head>', null) === '<head></head>');
  ok('★ 路徑穿越防護：../ 與編碼後的 ../ 都回 null', sv.safeFile('/r', '/../etc/passwd') === null && sv.safeFile('/r', '/%2e%2e/etc/passwd') === null && sv.safeFile('/r', '/index.html') === '/r/index.html');
  const sseed = fs.readFileSync(path.join(__dirname, 'run_hold_settle_browser_seed.js'), 'utf8'); const ssrv = fs.readFileSync(path.join(__dirname, 'serve_test_frontend.js'), 'utf8');
  ok('★ 兩支都只寫死測試庫、完全沒有正式庫識別；夾具驗證不過就不放行（直接清除）；工作階段檔 0600 且清除時刪除', !/rlpiomzplckzqnqrvrwc/.test(sseed.replace(/正式庫/g, '')) && /夾具驗證未通過，不放行瀏覽器驗收/.test(sseed) && /mode: 0o600/.test(sseed) && /wipeSessions\(\)/.test(sseed) && /listen\(port, '127\.0\.0\.1'/.test(ssrv));
  ok('★ 教練直接呼叫整理函式被擋的檢查（NOT_DESK／NOT_STAFF）在夾具驗證裡', /NOT_DESK', 'NOT_STAFF'/.test(sseed));
}
console.log('\n階段 12 套用／回復／驗證檔結構（防止像「函式本體被插進註解」這種產生錯誤）');
{
  const pr = path.join(__dirname, '..', '..', 'prod-release'); const rd = (f) => fs.readFileSync(path.join(pr, f), 'utf8'); const ap = rd('12_hold_settle_apply_prod.sql'), rb = rd('12_hold_settle_rollback_prod.sql'), vf = rd('12_hold_settle_verify_readonly.sql'), mig = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '20261121_hold_settle_new_ticket.sql'), 'utf8');
  const code = (t) => t.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
  const body = (t) => t.slice(t.indexOf('$fn$') + 4, t.indexOf('$fn$', t.indexOf('$fn$') + 4));
  ok('★ 套用檔：第一行程式是 begin;、最後是 commit;，註解行裡沒有 SQL 本體', code(ap)[0] === 'begin;' && code(ap).slice(-1)[0] === 'commit;' && !ap.split('\n').some(l => l.startsWith('--') && /create function public\.fn_hold|returns jsonb|language plpgsql/.test(l)));
  ok('★ 套用檔的函式本體＝migration 的函式本體（逐字），且指紋＝550c28a8…', body(ap) === body(mig) && require('crypto').createHash('md5').update(body(ap)).digest('hex') === '550c28a816b6e46f636287d7fa33405a');
  ok('★ 套用檔只有一個 create function（不用 or replace）、一個 begin、一個 commit；守門在 create 之前、核對在 create 之後', (ap.match(/create function public\.fn_hold_settle_new_ticket/g) || []).length === 1 && !/create or replace function public\.fn_hold_settle/.test(ap) && ap.indexOf('$guard$') < ap.indexOf('create function public.fn_hold_settle') && ap.indexOf('create function public.fn_hold_settle') < ap.indexOf('$post$'));
  ok('★ 套用檔守門：正式庫叢集識別、06／08／11 物件、階段 11 指紋、名稱未占用；提交前核對：本體指紋、權限、其餘物件指紋', /7637215626725903220/.test(ap) && /trg_tk_quota_guard/.test(ap) && /05c51530e595cf296f9b8da951f66093/.test(ap) && /HS\.POST: 本體指紋不是審查版/.test(ap) && /HS\.POST: 其餘函式指紋變了/.test(ap));
  ok('★ 回復檔：精確簽名、本體指紋、security definer＋search_path＋ACL、前端已退版設定、授權紀錄設定、無引用，且明寫設定不能代替授權', /to_regprocedure\('public\.fn_hold_settle_new_ticket\(text,boolean,text,jsonb\)'\)/.test(rb) && /550c28a816b6e46f636287d7fa33405a/.test(rb) && /app\.hs_frontend_reverted/.test(rb) && /app\.hs_removal_authorization/.test(rb) && /不能代替授權/.test(rb) && /code\(rb\)/.test('code(rb)') && code(rb)[0] === 'begin;' && code(rb).slice(-1)[0] === 'commit;');
  ok('★ 唯讀驗證檔只有 SELECT／union（沒有 insert／update／delete／drop／create／alter），本體指紋與套用檔一致', !/\b(insert|update|delete|drop|create|alter|grant|revoke)\b/i.test(code(vf).join('\n')) && /550c28a816b6e46f636287d7fa33405a/.test(vf));
  const reh = path.join(__dirname, 'rehearsal'); if (fs.existsSync(reh)) { const ra = fs.readFileSync(path.join(reh, '12_hold_settle_apply_TESTDB_REHEARSAL.sql'), 'utf8'), rr = fs.readFileSync(path.join(reh, '12_hold_settle_rollback_TESTDB_REHEARSAL.sql'), 'utf8');
    ok('★ 演練版與正式版只差叢集識別（測試庫 7662742571317219726 取代正式庫 7637215626725903220），其餘逐字相同', ra.replace(/7662742571317219726/g, '7637215626725903220') === ap && rr.replace(/7662742571317219726/g, '7637215626725903220') === rb && !/7637215626725903220/.test(ra + rr)); }
}
console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
