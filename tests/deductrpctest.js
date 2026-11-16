/* 櫃檯扣課走資料庫函式 fn_desk_deduct_ticket（2026-11-17，扣堂原子性）
   ⚠ 讀的是本 repo 的 index.html（__dirname/..）。不連任何資料庫：只驗「前端怎麼呼叫、怎麼處理回傳」。
   「同一交易鎖／扣／寫帳」「重複只扣一次」「搶最後一堂」「帳本寫入失敗堂數一併回復」「額度觸發器」是資料庫行為，
   由 docs/testdb/p0e/p0e_14_desk_deduct_tests.sql 在測試庫驗證（真並行連線本環境做不到，標未驗證）。 */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
function grab(name) {
  let i = src.indexOf('async function ' + name + '('); if (i < 0) i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k; for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
const CODE = grab('deductTicket');
function make(o) {
  o = o || {};
  const log = { rpcs: [], puts: [], logs: [], toasts: [], caches: 0 };
  const env = {
    sb: { rpc: async (n, a) => { log.rpcs.push([n, a]); return o.rpc ? o.rpc(n, a) : { data: { ok: true, remaining: 4 }, error: null }; } },
    isDeskLike: () => o.desk !== false, tkNetDeductOn: async () => o.net || 0,
    logTicket: async (tid, action, delta, bid, op, note) => { log.logs.push({ tid, action, delta, bid, note }); },
    dbPut: async (s, obj) => { log.puts.push([s, obj]); return obj; },
    dbCacheClear: () => { log.caches++; }, dbFriendlyError: (e) => Object.assign(new Error(e.message), { details: e.details }),
    tkQuotaMsg: (m) => (/INSTALLMENT_LOCKED/.test(String(m || '')) ? '額度滿' : ''), showToast: (m) => { log.toasts.push(m); },
    activateTicketIfNeeded: async () => null,
  };
  const names = Object.keys(env);
  const fn = new Function(...names, CODE + '\n;return deductTicket;')(...names.map(k => env[k]));
  return { fn, log };
}
const T = () => ({ id: 'T1', plan_name: '團課', sessions_remaining: 5 });

(async () => {
  console.log('═══ ① 櫃檯扣課：只呼叫 RPC，不再直接寫票券、不另外寫帳 ═══');
  let m = make(), t = T(), r = await m.fn(t, 'BK1', 'op');
  ok('回傳 true', r === true);
  ok('呼叫 fn_desk_deduct_ticket，帶票券、預約、備註、p_op_key 空（一般扣課）', m.log.rpcs.length === 1 && m.log.rpcs[0][0] === 'fn_desk_deduct_ticket' && m.log.rpcs[0][1].p_ticket_id === 'T1' && m.log.rpcs[0][1].p_booking_id === 'BK1' && m.log.rpcs[0][1].p_op_key === null && m.log.rpcs[0][1].p_note === '預約扣課', m.log.rpcs);
  ok('★★★ 前端沒有任何 member_tickets 寫入（dbPut）', m.log.puts.length === 0, m.log.puts);
  ok('★★★ 前端沒有另外寫帳（logTicket）——帳本由資料庫函式同交易寫入', m.log.logs.length === 0, m.log.logs);
  ok('記憶體餘額以資料庫回傳為準（4）、快取已丟', t.sessions_remaining === 4 && m.log.caches >= 1, [t.sessions_remaining, m.log.caches]);

  console.log('═══ ② 合法多堂：每一次扣課帶「穩定的操作識別」，原樣交給資料庫 ═══');
  m = make(); t = T(); r = await m.fn(t, 'BK1', 'op', { opKey: 'gcr:BK1:M1:2' });
  ok('p_op_key 原樣帶出（同一個名額每次呼叫都是同一把）', r === true && m.log.rpcs[0][1].p_op_key === 'gcr:BK1:M1:2', m.log.rpcs[0][1]);
  m = make(); t = T(); await m.fn(t, 'BK1', 'op', { opKey: 'gcr:BK1:M1:2' }); const t2 = T(); await m.fn(t2, 'BK1', 'op', { opKey: 'gcr:BK1:M1:2' });
  ok('★★★ 同一個操作重送：兩次呼叫的識別完全相同（不是每次重新產生）', m.log.rpcs.length === 2 && m.log.rpcs[0][1].p_op_key === m.log.rpcs[1][1].p_op_key);
  m = make(); t = T(); r = await m.fn(t, 'BK1', 'op', { multi: true });
  ok('★★★ 要求多堂卻沒帶操作識別：一律不扣（無法分辨重送）、不呼叫 RPC、餘額還原', r === false && m.log.rpcs.length === 0 && t.sessions_remaining === 5 && /缺少操作識別/.test(m.log.toasts.join()), [r, m.log.rpcs.length, m.log.toasts]);
  m = make({ net: 1 }); t = T(); r = await m.fn(t, 'BK1', 'op', { opKey: 'k1' });
  ok('帶識別時不做前端「已扣過」預檢（同預約本來就會多次扣），冪等交給資料庫的識別', r === true && m.log.rpcs.length === 1, m.log.rpcs.length);

  console.log('═══ ③ 資料庫拒絕（回傳 ok:false）：不當成扣成功、餘額還原、講清楚原因 ═══');
  for (const [code, re] of [['NO_REMAINING', /無剩餘堂數/], ['TICKET_NOT_USABLE', /退款、作廢或用畢/], ['NO_BOOKING', /找不到這筆預約/], ['BOOKING_CANCELLED', /已取消，不能扣課/], ['NOT_DESK', /沒有權限/]]) {
    m = make({ rpc: async () => ({ data: { ok: false, error_code: code }, error: null }) }); t = T(); r = await m.fn(t, 'BK1', 'op');
    ok(code + '：回傳 false、記憶體餘額還原 5、提示正確、沒有補償寫入', r === false && t.sessions_remaining === 5 && re.test(m.log.toasts.join()) && m.log.puts.length === 0 && m.log.logs.length === 0, [r, t.sessions_remaining, m.log.toasts]);
  }

  console.log('═══ ④ RPC 丟錯（額度觸發器／連線）：往上丟、餘額還原、不補償 ═══');
  m = make({ rpc: async () => ({ data: null, error: { message: 'TICKET.INSTALLMENT_LOCKED', details: 'used=9 unlocked=8' } }) }); t = T();
  let err = null; try { await m.fn(t, 'BK1', 'op'); } catch (e) { err = e; }
  ok('丟出含 TICKET.INSTALLMENT_LOCKED 的錯誤、記憶體餘額還原 5、沒有 dbPut／logTicket', !!err && /INSTALLMENT_LOCKED/.test(err.message) && t.sessions_remaining === 5 && m.log.puts.length === 0 && m.log.logs.length === 0, [err && err.message, t.sessions_remaining]);

  console.log('═══ ⑤ 不該動的路徑 ═══');
  m = make({ desk: false }); t = T(); r = await m.fn(t, 'BK1', 'op');
  ok('教練仍走舊的 fn_deduct_ticket', r === true && m.log.rpcs.length === 1 && m.log.rpcs[0][0] === 'fn_deduct_ticket', m.log.rpcs.map(x => x[0]));
  m = make({ net: 1 }); t = T(); r = await m.fn(t, 'BK1', 'op');
  ok('前端預檢已扣過（非 multi）：回 true、不呼叫 RPC、不動餘額（資料庫端仍有冪等把關）', r === true && m.log.rpcs.length === 0 && t.sessions_remaining === 5, [r, m.log.rpcs.length]);
  m = make(); t = { id: 'T1', plan_name: '團課', sessions_remaining: 0 }; r = await m.fn(t, 'BK1', 'op');
  ok('前端預檢餘額 0：不呼叫 RPC、回 false', r === false && m.log.rpcs.length === 0, [r, m.log.rpcs.length]);
  ok('原始碼不再含 tkCasRemaining／櫃檯直寫票券', !/tkCasRemaining/.test(src) && !/ticket\.sessions_remaining-=1;[\s\S]{0,2500}await dbPut\('member_tickets',ticket\)/.test(CODE));

  console.log('═══ ⑥ 原本由「雜湊釘住」保護的性質，改用行為／結構驗證（deductTicket 改版後仍成立）═══');
  ok('deductTicket 不碰分期保留預約（沒有 bindHeldBookings／promoteHeldBooking／pending_contract）', !/bindHeldBookings|promoteHeldBooking|pending_contract/.test(CODE));
  ok('保留既有護欄：已扣過不重複扣（tkNetDeductOn）、餘額 0 不扣、教練走 fn_deduct_ticket', /tkNetDeductOn/.test(CODE) && /fn_deduct_ticket/.test(CODE) && /已阻擋/.test(CODE));
  ok('預約扣課不啟用效期（P0-E）：不呼叫 activateTicketIfNeeded', !/await activateTicketIfNeeded/.test(CODE));

  console.log('═══ ⑦ 三條合法多堂路徑都經 tkDeductUnit（識別＝固定資料＋世代；完整生命週期見 deductlifecycletest.js）═══');
  ok('原始碼已沒有 {multi:true} 呼叫，也沒有繞過世代、直接帶 opKey 的呼叫', !/deductTicket\([^\n]*\{multi:true\}/.test(src) && !/deductTicket\([^\n]*\{opKey:'/.test(src));
  const bases = [...src.matchAll(/tkDeductUnit\([^\n]*?,\s*('(?:gcr|st|fol):'[^\n]*?)\)\)/g)].map(x => x[1]);
  ok('三處呼叫：團課建立 gcr、自主訓練時長 st、連續預約補位 fol', bases.length === 3 && bases.some(k => k.startsWith("'gcr:'+bk.id")) && bases.some(k => k.startsWith("'st:'")) && bases.some(k => k.startsWith("'fol:'")), bases);
  ok('識別基底不含 Date／Math.random／uid（重送不會變）', bases.every(k => !/Date|random|uid\(/.test(k)), bases);
  const gi = src.indexOf("tkDeductUnit(tk,bk.id,SESSION.id,'gcr:'");
  const seg = src.slice(Math.max(0, gi - 6000), gi);
  ok('團課建立：扣票之前已先 dbPut 預約（資料庫函式要求預約先存在才能鎖）', /await dbPut\('bookings',bk\);\s*\n\s*\/\* 先扣票再寫名單/.test(seg), seg.slice(-300));

  const TU = grab('tkDeductUnit');
  ok('tkDeductUnit 先讀預約版本（fn_desk_booking_rev）再帶 p_expect_rev 登記（fn_desk_op_begin），登記失敗不扣', /fn_desk_booking_rev/.test(TU) && /p_expect_rev/.test(TU) && /fn_desk_op_begin/.test(TU) && /REV_MISMATCH/.test(TU));
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
