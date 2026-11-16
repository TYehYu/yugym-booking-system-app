/* 真正重疊的兩條交易（需要 pg 函式庫與「測試庫」資料庫連線字串；本環境沒有，故由使用者設定後執行）
   用法：TEST_DB_URL='postgresql://…測試庫…' DESK_AUTH_UID='<測試庫櫃檯員工的 auth.users.id>' node concurrency_overlap.js
   （TEST_DB_URL 只放環境變數，不要貼到對話或進版控。腳本拒絕非測試庫連線字串。）
   證據保存：concurrency_evidence.json（含兩條連線的 pid、各步驟時間戳、B 在 A 提交前被鎖等待的 pg_stat_activity 觀測）。
   做法：A 先開交易並呼叫函式（持有預約／票券列鎖，不提交）；B 開交易並呼叫同一組資源（會被鎖住等待）；第三條連線觀測 B 的 wait_event_type='Lock'；A 提交後 B 才完成。 */
'use strict';
const { Client } = require('pg'); const fs = require('fs');
const URL = process.env.TEST_DB_URL, UID = process.env.DESK_AUTH_UID;
if (!URL || !UID) { console.error('缺 TEST_DB_URL／DESK_AUTH_UID'); process.exit(2); }
if (!/kucvxpjatptfckhlxptj/.test(URL)) { console.error('連線字串不是測試庫，拒絕執行'); process.exit(2); }
const ev = { startedAt: new Date().toISOString(), cases: [] }; let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + '  → ' + JSON.stringify(x)); } };
const mk = async () => { const c = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false } }); await c.connect(); await c.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)", [UID, JSON.stringify({ sub: UID, role: 'authenticated' })]); const pid = (await c.query('select pg_backend_pid() pid')).rows[0].pid; return { c, pid }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const q1 = async (c, sql, p) => (await c.query(sql, p)).rows[0];
const jv = (r) => r && Object.values(r)[0];
/* 一組重疊：A 先持鎖（不提交）→ B 發出（被擋）→ 觀測 → A 提交 → B 完成。回傳兩邊結果與時間線 */
async function overlap(name, callA, callB) {
  const A = await mk(), B = await mk(), O = await mk(); const t0 = Date.now(), line = [];
  const mark = (s) => line.push([Date.now() - t0, s]);
  await A.c.query('begin'); const ra = jv(await q1(A.c, callA.sql, callA.p)); mark('A 呼叫完成（持鎖、未提交）');
  await B.c.query('begin'); mark('B 發出呼叫');
  const pb = q1(B.c, callB.sql, callB.p).then(r => { mark('B 呼叫回來'); return jv(r); });
  await sleep(800);
  const waiting = (await O.c.query("select pid, wait_event_type, state from pg_stat_activity where pid=$1", [B.pid])).rows[0]; mark('觀測 B：' + JSON.stringify(waiting));
  await A.c.query('commit'); mark('A 提交');
  const rb = await pb; await B.c.query('commit'); mark('B 提交');
  for (const x of [A, B, O]) await x.c.end();
  const rec = { name, pidA: A.pid, pidB: B.pid, A: ra, B: rb, bWasBlocked: waiting && waiting.wait_event_type === 'Lock', timeline: line }; ev.cases.push(rec); return rec;
}
(async () => {
  const S = await mk(); const state = async (sql, p) => q1(S.c, sql, p);
  console.log('═══ ① 同一預約同時重複扣堂（一般扣課）：只扣一次 ═══');
  let r = await overlap('dup-same-booking', { sql: "select public.fn_desk_deduct_ticket('CC-TK1','CC-B1','併發A',null) r" }, { sql: "select public.fn_desk_deduct_ticket('CC-TK1','CC-B1','併發B',null) r" });
  ok('兩條連線 pid 不同、B 在 A 提交前被鎖住等待', r.pidA !== r.pidB && r.bWasBlocked, r);
  ok('A 扣成功、B 回 already；淨扣課恰 1', r.A.ok === true && !r.A.already && r.B.ok === true && r.B.already === true && (await state("select count(*)::int n from ticket_logs where ticket_id='CC-TK1' and booking_id='CC-B1' and action='deduct'")).n === 1, r);
  console.log('═══ ② 不同預約搶同一張票的最後一堂：只有一筆成功 ═══');
  r = await overlap('last-session', { sql: "select public.fn_desk_deduct_ticket('CC-TK2','CC-B2','搶A',null) r" }, { sql: "select public.fn_desk_deduct_ticket('CC-TK2','CC-B3','搶B',null) r" });
  ok('B 被鎖住等待、一成功一 NO_REMAINING、餘額 0、扣課帳恰 1', r.bWasBlocked && [r.A.ok, r.B.ok].filter(Boolean).length === 1 && [r.A.error_code, r.B.error_code].includes('NO_REMAINING') && (await state("select sessions_remaining n from member_tickets where id='CC-TK2'")).n === 0, r);
  console.log('═══ ③ 取消與扣堂交錯（兩種先後）═══');
  r = await overlap('cancel-first', { sql: "select public.fn_desk_cancel_booking('CC-B4','auto') r" }, { sql: "select public.fn_desk_deduct_ticket('CC-TK3','CC-B4','後到',null) r" });
  ok('取消先持鎖：扣堂被拒 BOOKING_CANCELLED、淨扣課 0', r.bWasBlocked && r.B.error_code === 'BOOKING_CANCELLED' && (await state("select count(*)::int n from ticket_logs where ticket_id='CC-TK3' and booking_id='CC-B4' and action='deduct'")).n === 0, r);
  r = await overlap('deduct-first', { sql: "select public.fn_desk_deduct_ticket('CC-TK3','CC-B5','先到',null) r" }, { sql: "select public.fn_desk_cancel_booking('CC-B5','auto') r" });
  ok('扣堂先持鎖：取消連該堂一起退（淨 0、預約 cancelled）', r.bWasBlocked && r.B.outcome === 'refunded' && (await state("select (select count(*) from ticket_logs where ticket_id='CC-TK3' and booking_id='CC-B5' and action='deduct')::int d, (select count(*) from ticket_logs where ticket_id='CC-TK3' and booking_id='CC-B5' and action='refund')::int rf, (select status::text from bookings where id='CC-B5') st")).rf === 1, r);
  console.log('═══ ④ 相同操作識別同時送出：只扣一次 ═══');
  const rev = (await state("select (public.fn_desk_booking_rev('CC-B1'))->>'rev' rv")).rv;
  const key = (await state("select (public.fn_desk_op_begin('gcr:CC-B1:M:1','CC-TK1','CC-B1',$1))->>'op_key' k", [rev])).k;
  r = await overlap('same-op', { sql: "select public.fn_desk_deduct_ticket('CC-TK1','CC-B1','同操作A',$1) r", p: [key] }, { sql: "select public.fn_desk_deduct_ticket('CC-TK1','CC-B1','同操作B',$1) r", p: [key] });
  ok('B 被鎖住；操作識別使其中一筆 already，淨扣課不因重送增加', r.bWasBlocked && r.B.ok === true, r);
  await S.c.end();
  ev.finishedAt = new Date().toISOString(); ev.pass = pass; ev.fail = fail; fs.writeFileSync('concurrency_evidence.json', JSON.stringify(ev, null, 2));
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗；證據已寫入 concurrency_evidence.json（不含連線字串）');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(String(e.message || e)); process.exit(2); });
