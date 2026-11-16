/* 真實 HTTP（PostgREST）匿名邊界檢查——只需要測試庫的公開 publishable／anon key（不是登入 JWT）。
   用法：set -a; . <本機 .env.test>; set +a; node docs/testdb/final/http_anon_check.js
   .env.test 放在 repo 之外、權限 600，內容：SB_URL=https://<測試庫>.supabase.co 與 ANON_KEY=…（不進版控、不印出）。
   安全護欄：SB_URL 必須是測試庫，否則拒絕執行。只讀取狀態碼與錯誤代碼。 */
'use strict';
const { SB_URL, ANON_KEY } = process.env;
if (!SB_URL || !ANON_KEY) { console.error('缺 SB_URL／ANON_KEY'); process.exit(2); }
if (!/kucvxpjatptfckhlxptj\.supabase\.co/.test(SB_URL)) { console.error('SB_URL 不是測試庫，拒絕執行'); process.exit(2); }
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
async function call(method, path, body) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { method, headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, code: j && (j.code || j.error_code || (j.message && j.message.slice(0, 40))) };
}
const denied = (x) => [401, 403].includes(x.status) || x.code === '42501';
(async () => {
  console.log('═══ 匿名（只有 apikey、沒有登入）呼叫階段 08 函式：必須被拒 ═══');
  for (const [fn, body] of [
    ['fn_desk_deduct_ticket', { p_ticket_id: 'X', p_booking_id: 'Y', p_note: null, p_op_key: null }],
    ['fn_desk_cancel_booking', { p_booking_id: 'Y', p_mode: 'auto' }],
    ['fn_desk_op_begin', { p_slot: 's', p_ticket_id: 'X', p_booking_id: 'Y', p_expect_rev: '0' }],
    ['fn_desk_booking_rev', { p_booking_id: 'Y' }],
  ]) { const x = await call('POST', 'rpc/' + fn, body); ok(fn + '：匿名被拒（HTTP ' + x.status + '／' + x.code + '）', denied(x), x); }
  console.log('═══ 內部函式不暴露給 API ═══');
  { const x = await call('POST', 'rpc/fn_booking_rev_of', { p_booking_id: 'Y' }); ok('fn_booking_rev_of：匿名被拒或不存在（HTTP ' + x.status + '）', denied(x) || x.status === 404, x); }
  { const x = await call('POST', 'rpc/trg_booking_op_rev', {}); ok('trg_booking_op_rev：匿名被拒或不存在（HTTP ' + x.status + '）', denied(x) || x.status === 404, x); }
  console.log('═══ 兩張操作表：匿名不可讀寫 ═══');
  for (const t of ['ticket_deduct_ops', 'booking_op_rev']) {
    const g = await call('GET', t + '?select=*&limit=1'); ok(t + ' 讀取：匿名被拒（HTTP ' + g.status + '）', denied(g), g);
    const p = await call('POST', t, t === 'booking_op_rev' ? { booking_id: 'HTTP-ANON', rev: 99 } : { booking_id: 'a', ticket_id: 'b', slot: 'c', epoch: 1, booking_rev: '0', refunds_at_begin: 0 }); ok(t + ' 寫入：匿名被拒（HTTP ' + p.status + '）', denied(p), p);
  }
  console.log('═══ 對照：不存在的函式回 404（確認上面的拒絕不是「找不到」）═══');
  { const x = await call('POST', 'rpc/fn_no_such_function_xyz', {}); ok('不存在函式：HTTP ' + x.status, x.status === 404, x); }
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(String(e.message || e)); process.exit(2); });
