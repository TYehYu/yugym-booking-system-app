/* 真實 HTTP：櫃檯成功、教練／會員／匿名的權限邊界（需要測試庫 anon key 與三種登入 JWT；JWT 由使用者在本機取得後放環境變數，不貼到對話）
   用法：set -a; . <本機 .env.test>; set +a; JWT_DESK=… JWT_COACH=… JWT_MEMBER=… node docs/testdb/final/http_roles.js
   前置：已跑 fixtures_CC.sql（CC- 夾具）。護欄：SB_URL 必須是測試庫。 */
'use strict';
const { SB_URL, ANON_KEY, JWT_DESK, JWT_COACH, JWT_MEMBER } = process.env;
if (!SB_URL || !ANON_KEY || !JWT_DESK || !JWT_COACH || !JWT_MEMBER) { console.error('缺 SB_URL／ANON_KEY／JWT_DESK／JWT_COACH／JWT_MEMBER'); process.exit(2); }
if (!/kucvxpjatptfckhlxptj\.supabase\.co/.test(SB_URL)) { console.error('SB_URL 不是測試庫，拒絕執行'); process.exit(2); }
const BK = process.env.CC_BOOKING || 'CC-B1', TK = process.env.CC_TICKET || 'CC-TK3';   // 執行器每輪帶入唯一 id
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + '  → ' + JSON.stringify(x)); } };
async function rpc(fn, body, jwt) { const h = { apikey: ANON_KEY, 'Content-Type': 'application/json' }; if (jwt) h.Authorization = 'Bearer ' + jwt; const r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: h, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; }
(async () => {
  console.log('═══ 櫃檯（JWT_DESK）：完整流程成功 ═══');
  let r = await rpc('fn_desk_booking_rev', { p_booking_id: BK }, JWT_DESK); ok('取預約版本 ok', r.status === 200 && r.j && r.j.ok === true, r.status);
  const rev = r.j && r.j.rev;
  r = await rpc('fn_desk_op_begin', { p_slot: 'http:1', p_ticket_id: TK, p_booking_id: BK, p_expect_rev: String(rev) }, JWT_DESK); ok('登記操作 ok', r.status === 200 && r.j && r.j.ok === true, r.j);
  const key = r.j && r.j.op_key;
  r = await rpc('fn_desk_deduct_ticket', { p_ticket_id: TK, p_booking_id: BK, p_note: 'HTTP', p_op_key: key }, JWT_DESK); ok('帶識別扣課 ok', r.status === 200 && r.j && r.j.ok === true, r.j);
  r = await rpc('fn_desk_deduct_ticket', { p_ticket_id: TK, p_booking_id: BK, p_note: 'HTTP', p_op_key: key }, JWT_DESK); ok('同識別重送回 already', r.j && r.j.already === true, r.j);
  console.log('═══ 教練（JWT_COACH）：四支函式一律 NOT_DESK ═══');
  for (const [fn, b] of [['fn_desk_booking_rev', { p_booking_id: BK }], ['fn_desk_op_begin', { p_slot: 's', p_ticket_id: TK, p_booking_id: BK, p_expect_rev: '0' }], ['fn_desk_deduct_ticket', { p_ticket_id: TK, p_booking_id: BK, p_note: null, p_op_key: null }], ['fn_desk_cancel_booking', { p_booking_id: BK, p_mode: 'auto' }]]) { r = await rpc(fn, b, JWT_COACH); ok(fn + '：教練被拒（' + (r.j && r.j.error_code) + '）', r.j && r.j.error_code === 'NOT_DESK', r); }
  console.log('═══ 會員（JWT_MEMBER）：一律 NOT_STAFF ═══');
  for (const [fn, b] of [['fn_desk_booking_rev', { p_booking_id: BK }], ['fn_desk_deduct_ticket', { p_ticket_id: TK, p_booking_id: BK, p_note: null, p_op_key: null }], ['fn_desk_cancel_booking', { p_booking_id: BK, p_mode: 'auto' }]]) { r = await rpc(fn, b, JWT_MEMBER); ok(fn + '：會員被拒（' + (r.j && r.j.error_code) + '）', r.j && r.j.error_code === 'NOT_STAFF', r); }
  console.log('═══ 匿名：拒絕（見 http_anon_check.js）═══');
  r = await rpc('fn_desk_cancel_booking', { p_booking_id: BK, p_mode: 'auto' }, null); ok('匿名取消被拒（HTTP ' + r.status + '）', [401, 403].includes(r.status), r.status);
  console.log('═══ 操作表：登入者也不能直接讀寫 ═══');
  for (const t of ['ticket_deduct_ops', 'booking_op_rev']) {
    const g = await fetch(SB_URL + '/rest/v1/' + t + '?select=*&limit=1', { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + JWT_DESK } }); const gj = await g.json().catch(() => null);
    ok(t + ' 櫃檯直接讀：沒有資料列（RLS 無 policy）', g.status === 200 ? Array.isArray(gj) && gj.length === 0 : [401, 403].includes(g.status), g.status);
    const p = await fetch(SB_URL + '/rest/v1/' + t, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + JWT_DESK, 'Content-Type': 'application/json' }, body: JSON.stringify(t === 'booking_op_rev' ? { booking_id: 'HTTP-X', rev: 9 } : { booking_id: 'a', ticket_id: 'b', slot: 'c', epoch: 1, booking_rev: '0', refunds_at_begin: 0 }) });
    ok(t + ' 櫃檯直接寫：被拒（HTTP ' + p.status + '）', [401, 403].includes(p.status), p.status);
  }
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(String(e.message || e)); process.exit(2); });
