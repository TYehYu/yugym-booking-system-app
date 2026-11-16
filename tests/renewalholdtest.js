/* 2026-11-16 續約銜接卡位 v2（前端部分）。資料庫規則本身的行為驗證在 docs/testdb/renewal/（SQL 與並行執行器，測試庫實測）。
   這支測試跑「真正的」runRecurringBooking／bkHoldExpired／dbFriendlyError／承接視窗的文字函式，只替換資料存取。 */
const fs = require('fs');
const src = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/index.html', 'utf8');
const mig = fs.readFileSync(process.env.HOME + '/Projects/yugym-booking-system-app/docs/migrations/20261120_renewal_hold_slots.sql', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const g = (a, b) => { const i = src.indexOf(a); if (i < 0) throw new Error('找不到：' + a); return src.slice(i, src.indexOf(b, i) + b.length); };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

(async () => {
  console.log('舊設計已退場');
  ok('★ 前端與 migration 都沒有舊設計的「最多兩堂」代碼（RENEWAL_LIMIT／fn_renewal_hold_check）', !/RENEWAL_LIMIT|fn_renewal_hold_check/.test(src) && !/RENEWAL_LIMIT|fn_renewal_hold_check/.test(mig));

  console.log('\n到期判斷（沒有合約的卡位只保留到該堂課當天）');
  {
    const TODAY = parseYmd('2026-11-16');
    const f = new Function('ymd', 'TODAY', g('function bkHoldExpired(b){', '\n}\n') + '\nreturn bkHoldExpired;')(ymd, TODAY);
    const hold = { pending_contract: true, ticket_id: null, contract_id: null, member_id: 'M', status: 'booked', date: '2026-11-15' };
    ok('★ 昨天的卡位 → 已到期', f(hold) === true);
    ok('★ 今天的卡位 → 仍有效（保留到當天）', f(Object.assign({}, hold, { date: '2026-11-16' })) === false);
    ok('　　未來的卡位 → 有效', f(Object.assign({}, hold, { date: '2026-12-01' })) === false);
    ok('　　已取消的 → 不算（歷史資料，不是到期卡位）', f(Object.assign({}, hold, { status: 'cancelled' })) === false);
    ok('　　已綁票（已轉正）→ 不算', f(Object.assign({}, hold, { ticket_id: 'T' })) === false);
    ok('★ 已屬合約的卡位 → 不適用「到期」（走合約自己的流程）', f(Object.assign({}, hold, { contract_id: 'C' })) === false);
    ok('　　沒有會員的空堂 → 不適用', f(Object.assign({}, hold, { member_id: null })) === false);
    ok('　　不是待簽約 → 不算', f(Object.assign({}, hold, { pending_contract: false })) === false);
  }
  console.log('\n每次操作七天範圍：最早一堂 D 起，D～D+6（真的跑建立引擎）');
  {
    const code = [g('function buildRecurringSlots(', '\n}\n'), g('function buildRecurringDates(', '\n}\n'), g('function bkHoldExpired(b){', '\n}\n'), g('async function runRecurringBooking(', '\n}\n')].join('\n');
    const names = ['SESSION', 'RECUR_MAX', 'parseYmd', 'ymd', 'addDays', 'TODAY', 'uid', 'listUsableTickets', 'tkUnlockedLeft', 'dbGetAll', 'tkUsableBy', 'tkIsInstall', 'bkTicketTypeOk', 'validateBooking', 'bkIsSelf', 'bkAddTreadmillUnits', 'dbPut', 'dbDel', 'deductTicket', 'createBookingViaRpc', 'FEATURE_FLAGS', 'CLOUD', 'window', 'console'];
    const mk = () => { const puts = []; let n = 0; const env = { SESSION: { id: 'e' }, RECUR_MAX: 12, parseYmd, ymd, addDays, TODAY: parseYmd('2026-11-16'), uid: (p) => p + '-' + (++n), listUsableTickets: async () => [], tkUnlockedLeft: () => 0, dbGetAll: async () => [], tkUsableBy: () => false, tkIsInstall: () => false, bkTicketTypeOk: () => true, validateBooking: async () => null, bkIsSelf: () => false, bkAddTreadmillUnits: async () => {}, dbPut: async (s, b) => { puts.push(b); return b; }, dbDel: async () => {}, deductTicket: async () => { throw new Error('卡位不該扣堂'); }, createBookingViaRpc: async () => { throw new Error('卡位不走 RPC'); }, FEATURE_FLAGS: {}, CLOUD: true, window: { FEATURE_FLAGS: {} }, console: { error() {}, log() {} } };
      return { puts, run: new Function(...names, code + '\nreturn runRecurringBooking;')(...names.map(k => env[k])) }; };
    const base = { openHold: true, member_id: 'M1', category: '私人教練', type_id: 'tt', time: '19:00', findTicketFn: async () => null, countRemainFn: async () => 0 };
    const go = async (extra) => { const e = mk(); const r = await e.run(Object.assign({}, base, extra)); return { r, puts: e.puts }; };
    // 本週二（2026-12-01）上完本期最後一堂 → 先卡本週五（12/04）＋下週二（12/08）：同在 12/01 起七天內？D＝12/04（這次最早一堂），D+6＝12/10 → 12/08 在內
    { const { r, puts } = await go({ startDate: '2026-12-04', dows: [5, 2], count: 2 });
      ok('★ 本週五＋下週二（同次）→ 成功建立兩堂，仍是待簽約、沒綁票、沒扣堂（deductTicket 被呼叫就會丟錯）', r.ok === 2 && puts.length === 2 && puts.every(b => b.pending_contract === true && !b.ticket_id && b.member_id === 'M1') && puts.map(b => b.date).join() === '2026-12-04,2026-12-08', { ok: r.ok, dates: puts.map(b => b.date) }); }
    { const { r, puts } = await go({ startDate: '2027-03-03', dows: [3, 2], count: 2 });          // 週三 3/3 與下週二 3/9（= D+6）
      ok('★ D+6（3/3 起，3/9 是第 7 天）→ 成功，兩堂都建立', r.ok === 2 && puts.length === 2 && puts[1].date === '2027-03-09', puts.map(b => b.date)); }
    { const { r, puts } = await go({ startDate: '2027-03-03', dows: [3], count: 2 });              // 3/3 與 3/10（= D+7）
      ok('★ D+7（3/3 與 3/10）→ 送出前整批拒絕，一堂都不建（dbPut 沒被呼叫）', r.ok === 0 && r.skipped === 2 && puts.length === 0 && r.rangeRejected === true, { ok: r.ok, puts: puts.length });
      ok('★ 列出超出的日期（03/10）、說明七天範圍（03/03～03/09）並請分次操作', /03\/10/.test(r.results[0].reason) && /03\/03 起，到 03\/09 止/.test(r.results[0].reason) && /分次操作/.test(r.results[0].reason) && JSON.stringify(r.overDates) === JSON.stringify(['2027-03-10']), r.results[0].reason);
      ok('　　每一堂都有原因（不靜默漏掉）', r.results.length === 2 && r.results.every(x => !x.ok && x.reason)); }
    { const { r, puts } = await go({ startDate: '2027-03-03', dows: [3, 5], count: 4 });           // 3/3、3/5、3/10、3/12：後兩堂超出
      ok('★ 部分超出（3/10、3/12）→ 兩個超出日期都列出，整批不建（不是先建 3/3、3/5 才報錯）', r.ok === 0 && puts.length === 0 && /03\/10、03\/12/.test(r.results[0].reason), { puts: puts.length, why: r.results[0].reason }); }
    { const { r, puts } = await go({ startDate: '2027-03-29', dows: [1, 0], count: 2 });          // 週一 3/29 與週日 4/4（跨月，= D+6）
      ok('★ 跨月（3/29 與 4/4＝第 7 天）→ 成功', r.ok === 2 && puts.map(b => b.date).join() === '2027-03-29,2027-04-04', puts.map(b => b.date)); }
    { const { r, puts } = await go({ startDate: '2027-03-29', dows: [1], count: 2 });             // 3/29 與 4/5（= D+7，跨月）
      ok('★ 跨月但第 8 天（3/29 與 4/5）→ 拒絕並列出 04/05', r.ok === 0 && puts.length === 0 && /04\/05/.test(r.results[0].reason), r.results[0].reason); }
    { const { r, puts } = await go({ startDate: '2026-12-29', dows: [2, 1], count: 2 });          // 週二 12/29 與週一 1/4（跨年，= D+6）
      ok('★ 跨年（12/29 與隔年 1/4＝第 7 天）→ 成功', r.ok === 2 && puts.map(b => b.date).join() === '2026-12-29,2027-01-04', puts.map(b => b.date)); }
    { const { r, puts } = await go({ startDate: '2026-12-29', dows: [2], count: 2 });             // 12/29 與 1/5（= D+7，跨年）
      ok('★ 跨年但第 8 天（12/29 與 1/5）→ 拒絕並列出 01/05', r.ok === 0 && puts.length === 0 && /01\/05/.test(r.results[0].reason), r.results[0].reason); }
    { const { r, puts } = await go({ startDate: '2028-02-26', dows: [6, 5], count: 2 });          // 閏年：週六 2/26 與週五 3/3（2/26＋6＝3/3，2028 有 2/29）
      ok('　　閏年也對：2028-02-26 起第 7 天是 3/3（中間有 2/29）→ 成功', r.ok === 2 && puts.map(b => b.date).join() === '2028-02-26,2028-03-03', puts.map(b => b.date)); }
    { const e = mk();
      const r1 = await e.run(Object.assign({}, base, { startDate: '2027-03-03', dows: [3, 5], count: 2 })); const r2 = await e.run(Object.assign({}, base, { startDate: '2027-03-17', dows: [3, 5], count: 2 })); const r3 = await e.run(Object.assign({}, base, { startDate: '2027-03-10', dows: [3], count: 1 }));
      ok('★ 分次操作：不同七天範圍的卡位同時存在（共 5 堂，沒有總共兩堂上限）', r1.ok === 2 && r2.ok === 2 && r3.ok === 1 && e.puts.length === 5, e.puts.map(b => b.date)); }
    { const { r, puts } = await go({ startDate: '2027-03-03', dows: [], count: 1 });
      ok('　　單一堂（不連續預約）→ 不受影響', r.ok === 1 && puts.length === 1); }
    { const { r, puts } = await go({ member_id: null, startDate: '2027-03-03', dows: [3], count: 3 });
      ok('　　沒有綁會員的空堂不受這條限制（維持原行為）', r.ok === 3 && puts.length === 3, { ok: r.ok }); }
    ok('★ 畫面有說明：卡位只保留到該堂課當天、一次最多排七天（含頭尾、可跨月跨年）、想排更久請分次', /卡位只保留到該堂課當天；一次操作最多排七天（從這次最早一堂算起到第 7 天，含頭尾，可跨月、跨年），想排更久請分次操作/.test(src));
    ok('　　程式裡不再有「週一～週日」的界線', !/bkWeekStartYmd/.test(src));
  }

  console.log('\n錯誤轉譯');
  {
    const fe = new Function('DB_LABEL', 'tbl', 'authExpired', 'console', g('function tkQuotaMsg(raw){', '\n}\n') + '\n' + g('function dbFriendlyError(', '\n}\n') + '\nreturn dbFriendlyError;')({ bookings: '預約' }, s => s, () => {}, { error() {} });
    const pg = (m, c) => ({ message: m, code: c || 'P0001', details: null });
    { const e = fe(pg('HOLD.EXPIRED:2026-11-10'), 'bookings', '儲存'); ok('★ 到期卡位：講出日期與「只保留到該堂課當天」、下一步（取消後重新預約）', /11\/10/.test(e.message) && /只保留到該堂課當天/.test(e.message) && /重新預約/.test(e.message) && e.code === 'HOLD.EXPIRED', e.message); }
    { const e = fe(pg('CONTRACT.OUT_OF_WINDOW:2027-05-02:2027-05-11'), 'bookings', '儲存'); ok('★ 超出暫定使用期間：講出區間，並說明首次實際簽到才正式起算', /2027\/05\/02 起到 2027\/05\/11/.test(e.message) && /首次實際簽到後才正式起算/.test(e.message) && e.code === 'CONTRACT.OUT_OF_WINDOW', e.message); }
    { const e = fe(pg('CONTRACT.VALID_DAYS_INVALID:'), 'bookings', '儲存'); ok('★ 方案沒有有效天數：明講算不出暫定期間、不是靜默當成不限期', /沒有設定有效天數/.test(e.message) && /算不出暫定使用期間/.test(e.message) && e.code === 'CONTRACT.VALID_DAYS_INVALID', e.message); }
    { const e = fe(pg('HOLD.UNPAID_CHECKIN'), 'bookings', '儲存'); ok('★ 待簽約卡位簽到被擋：說要先轉正', /待簽約卡位/.test(e.message) && /轉正/.test(e.message) && e.code === 'HOLD.UNPAID_CHECKIN', e.message); }
    { const e = fe(pg('HOLD.MONTH_LIMIT:2026-11-30'), 'bookings', '儲存'); ok('月份限制訊息維持原樣（沒有舊設計補的那一句）', /2026\/11\/30/.test(e.message) && !/最多 2 堂/.test(e.message), e.message); }
    { const e = fe(pg('boom', 'XX000'), 'bookings', '儲存'); ok('其他錯誤不受影響：仍是通用訊息', /操作未完成/.test(e.message)); }
    const raised = [...mig.matchAll(/raise exception '((?:HOLD|CONTRACT)\.[A-Z_]+)/g)].map(m => m[1]);
    ok('★ migration 實際丟出的規則代碼，前端都有對應的人話', raised.length >= 4 && raised.every(c => src.includes(c)), raised);
  }

  console.log('\n承接既有卡位（前端視窗與資料庫 RPC 對得上）');
  {
    const adoptSrc = g('const ADOPT_REASON={', '\nasync function adoptOfferAfterCreate').replace(/\nasync function adoptOfferAfterCreate$/, '');
    const f = new Function(adoptSrc + '\nreturn { ADOPT_REASON, adoptProblemsHtml };')();
    const reasons = [...mig.matchAll(/v_why := '([A-Z_]+)'/g)].map(m => m[1]).concat('NOT_FOUND');
    ok('★ 資料庫會回的每一種不能承接的原因，視窗都有繁中說明（不會顯示成代碼）', reasons.length >= 8 && reasons.every(r => f.ADOPT_REASON[r]), reasons.filter(r => !f.ADOPT_REASON[r]));
    const label = () => '07/09 19:00';
    const q = f.adoptProblemsHtml({ problems: [{ reason: 'QUOTA_EXCEEDED', sessions: 4, already_used: 3, adopting: 3, left: 1 }] }, label);
    ok('★ 堂數不足：講出合約幾堂、已占幾堂、想承接幾堂、還剩幾堂、要少選幾堂', /共 4 堂/.test(q) && /已占用 3 堂/.test(q) && /再承接 3 堂/.test(q) && /只剩 1 堂/.test(q) && /少選 2 堂/.test(q), q);
    const w = f.adoptProblemsHtml({ problems: [{ reason: 'OUT_OF_WINDOW', window_start: '2027-05-02', window_end: '2027-05-11', valid_days: 10, offending: [{ booking_id: 'X', date: '2027-05-16' }] }] }, label);
    ok('★ 超出暫定期間：講出起訖、天數、超出的是哪幾天，並說明首次實際簽到才正式起算', /05\/02 起 10 天（至 05\/11）/.test(w) && /05\/16/.test(w) && /首次實際簽到後才正式起算/.test(w), w);
    const vd = f.adoptProblemsHtml({ problems: [{ reason: 'VALID_DAYS_INVALID', raw: null }] }, label);
    ok('★ 有效天數缺漏：承接視窗說明原因並停止承接（資料庫會回的這個問題也有人話）', /沒有設定有效天數/.test(vd) && /不承接任何卡位/.test(vd), vd);
    ok('　　資料庫端確實會回 VALID_DAYS_INVALID 問題（與視窗對得上）', /'reason', 'VALID_DAYS_INVALID'/.test(mig));
    const o = f.adoptProblemsHtml({ problems: [{ booking_id: 'B', reason: 'EXPIRED' }, { booking_id: 'C', reason: 'OWNED_BY_OTHER' }] }, label);
    ok('　　逐筆原因：已過期、已屬其他合約', /已過期/.test(o) && /已屬於其他合約/.test(o), o);
    ok('★ 前端呼叫的 RPC 名稱與參數就是 migration 的 fn_contract_adopt_holds(p_contract_id, p_booking_ids, p_dry)', /sb\.rpc\('fn_contract_adopt_holds',\{p_contract_id:A\.contractId,p_booking_ids:ids,p_dry:true\}\)/.test(src) && /sb\.rpc\('fn_contract_adopt_holds',\{p_contract_id:A\.contractId,p_booking_ids:ids,p_dry:false\}\)/.test(src) && /create function public\.fn_contract_adopt_holds\(p_contract_id text, p_booking_ids text\[\], p_dry boolean/.test(mig));
    ok('★ 確定承接前先 dry-run 檢查、有問題按鈕不亮；送出走 onceAct 防連點；結果不確定時不自動重送', /if\(go\) go\.disabled=true; if\(pr\)/.test(src) && /if\(res\.ok\)\{[\s\S]{0,500}go\.disabled=false/.test(src) && /onceAct\('adoptrun'/.test(src) && /承接結果不確定[\s\S]{0,60}不要重複按/.test(src));
    ok('　　視窗只列「待簽約、沒綁票、已預約、今天以後、票種相符、尚無合約（或就是這份合約）」的卡位', /b\.pending_contract && !b\.ticket_id && b\.status==='booked'\s*\n\s*&& b\.date>=ymd\(TODAY\) && \(!type\|\|b\.ticket_type_id===type\) && \(!b\.contract_id\|\|b\.contract_id===r\.contract_id\)/.test(src));
    ok('　　入口有兩個：建立合約後自動問、核准視窗的「承接卡位」鈕', /adoptOfferAfterCreate\(_gid\)/.test(src) && /onclick="openAdoptHolds\('\$\{r\.id\}'\)"/.test(src));
  }

  console.log('\n日常畫面：待簽約卡位顯示暫定起訖日期／只保留到當天');
  {
    const fnSrc = g('async function bkFillHoldInfo(b){', '\n}\n');
    const TODAY = parseYmd('2026-11-16');
    const run = async (b, o) => { const el = { innerHTML: '', textContent: '' }; const doc = { getElementById: (id) => id === 'bd-holdinfo' ? el : null };
      const f = new Function('document', 'dbGetAll', 'ymd', 'addDays', 'parseYmd', 'TODAY', 'bkHoldExpired', fnSrc + '\nreturn bkFillHoldInfo;')(doc, async (t) => (o[t] || []), ymd, addDays, parseYmd, TODAY, (x) => !!(x && x.pending_contract && !x.ticket_id && !x.contract_id && x.member_id && x.status !== 'cancelled' && String(x.date) < ymd(TODAY)));
      await f(b); return el.innerHTML || el.textContent; };
    const mkReq = (vd) => ({ contract_id: 'C1', status: 'pending', payload: { plan: { valid_days: vd } } });
    const bks = [{ id: 'a', contract_id: 'C1', date: '2027-05-02', status: 'booked' }, { id: 'b', contract_id: 'C1', date: '2027-05-08', status: 'booked' }, { id: 'c', contract_id: 'C1', date: '2027-05-01', status: 'cancelled' }];
    const hold = { pending_contract: true, ticket_id: null, member_id: 'M', contract_id: 'C1', date: '2027-05-08', status: 'booked' };
    { const h = await run(hold, { ticket_grant_requests: [mkReq(10)], bookings: bks });
      ok('★ 已承接進合約：顯示暫定起訖（最早一堂 05/02 起 10 天 → 05/02～05/11），明寫「暫定」、首次實際簽到才正式起算（已取消的不算最早一堂）', /05\/02～05\/11/.test(h) && /暫定/.test(h) && /首次實際簽到後才正式起算效期/.test(h), h); }
    { const h = await run(hold, { ticket_grant_requests: [mkReq(30)], bookings: bks }); ok('　　天數換成 30 → 起訖跟著算（05/02～05/31）', /05\/02～05\/31/.test(h), h); }
    { const h = await run(hold, { ticket_grant_requests: [mkReq(null)], bookings: bks }); ok('★ 有效天數缺漏：明講算不出暫定使用期間，不顯示成不限期', /沒有設定有效天數/.test(h) && !/～/.test(h), h); }
    { const h = await run(hold, { ticket_grant_requests: [mkReq('三十天')], bookings: bks }); ok('　　有效天數是文字也一樣', /沒有設定有效天數/.test(h), h); }
    { const h = await run(Object.assign({}, hold, { contract_id: null, date: '2026-12-01' }), {}); ok('★ 沒有合約的卡位：顯示「只保留到 12/01 當天；仍是待簽約」', /只保留到 <b>12\/01<\/b> 當天/.test(h), h); }
    { const h = await run(Object.assign({}, hold, { contract_id: null, date: '2026-11-10' }), {}); ok('　　已過期的卡位：顯示「已過期、不能再轉正」', /卡位已過期/.test(h) && /不能再轉正/.test(h), h); }
    { const h = await run(Object.assign({}, hold, { ticket_id: 'T1' }), { ticket_grant_requests: [mkReq(10)], bookings: bks }); ok('　　已綁票（已轉正）→ 不顯示', h === '', h); }
    ok('★ 明細視窗有放這個說明的位置，並在視窗畫完後填入（不等它、失敗也不影響明細）', /<span id="bd-holdinfo"/.test(src) && /try\{ bkFillHoldInfo\(b\); \}catch\(_\)\{\}/.test(src));
  }

  console.log('\n轉正、占用與畫面一致');
  {
    const cp = g('async function _doConvertPending(memberId, tkId, mode){', '\n}\n');
    ok('★ 轉正：已過期卡位不能由一般流程轉正（畫面先擋，資料庫也擋）', /if\(bkHoldExpired\(b\)\)\{ _clr\(\); showToast\('這筆卡位已過期/.test(cp));
    ok('　　轉正沿用原預約列、先扣新票成功才寫回（沒有新建預約）', /for\(const hb of series\)\{[\s\S]*await dbPut\('bookings',hb\)/.test(cp) && !/uid\('BK'\)/.test(cp) && /if\(await deductTicket\(tk,hb\.id,SESSION\.id\)\)\{ await dbPut\('bookings',hb\)/.test(cp));
    ok('★ 場地占用與衝堂判斷都排除到期卡位（與畫面一致）', /x\.status!=='cancelled' && !bkHoldExpired\(x\) && !skip\.has\(x\.id\)/.test(src) && /x\.status!=='cancelled' && !bkHoldExpired\(x\) && x\.date===date/.test(src));
    ok('★ 課卡：到期卡位不再畫紅框（改灰）、首頁卡不再標「尚未收款」', /_isUnpaid   = !!b\.pending_contract && !_isExpHold/.test(src) && /cal-ev-expiredhold/.test(src) && /const _pend = !!b\.pending_contract && !bkHoldExpired\(b\)/.test(src));
    const bind = g('async function bindHeldBookings(ticket_id, maxN){', '\n}\n');
    ok('　　自動補綁只認「分期待繳費保留」標記且只處理今天以後的卡位（承接／無合約卡位不會被自動扣堂）', /bkIsInstHold\(b\)/.test(bind) && /String\(b\.date\)>=today/.test(bind));
  }
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})();
