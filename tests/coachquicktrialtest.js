/* 教練手機「快速預約」選不到體驗課（2026-11-16 Mango／黃美蓉回報）
   原因（Codex 已確認）：快速預約立的旗標 window._bkCoachCourseOnly 在 openBookingModal 的課別過濾只留 私人教練，把體驗課一起藏掉。
   ⚠ 這支測試執行的是 index.html 裡**真正的** openBookingModal（課別過濾）、_bkStep2（選了課之後走到哪一步）、_submitBookingInner（體驗課建立），
     資料庫端用替身；不是只比對文字。讀的是本 repo 的 index.html（相對路徑，不是主工作區）。 */
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
function grabFn(name, asyncFn) {
  const key = (asyncFn === false ? 'function ' : 'async function ') + name + '('; let i = src.indexOf(key); if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k; for (k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
const TYPES = [
  { id: 'tt-pt', name: '教練課', category: '私人教練', active: true }, { id: 'tt-fr', name: '友善教練課', category: '私人教練', active: true },
  { id: 'tt-gp', name: '團體課', category: '小班肌力', active: true }, { id: 'tt-ms', name: '運動按摩', category: '運動按摩', active: true },
  { id: 'tt-tr', name: '體驗課', category: '體驗', active: true, format: null }, { id: 'tt-st', name: '自主訓練', category: '自主訓練', active: true },
  { id: 'tt-vr', name: '場地租借', category: '場租', active: true }, { id: 'tt-trX', name: '停用的體驗課', category: '體驗', active: false },
];
function make(o) {
  o = o || {};
  const log = { modals: [], toasts: [], puts: [], rpcs: [], opens: [], after: 0 };
  const els = {}; const el = (id, v) => { els[id] = { value: v }; };
  const env = {
    window: { _bkCoachCourseOnly: !!o.flag, _calMineOnly: false }, _prefill: o.prefill || null, _bkWizard: {}, _bkMembers: [], _bkSubmitting: false,
    SESSION: o.session || { id: 'c-mango', role: 'coach', is_manager: false }, CLOUD: true, document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [] },
    isMobileLayout: () => o.mobile !== false,
    dbGetAll: async (t) => (t === 'ticket_types' ? TYPES.map(x => Object.assign({}, x)) : t === 'coaches' ? [{ id: 'c-mango', name: 'Mango', role: 'coach', status: 'active' }] : t === 'members' ? [{ id: 'm1', name: '王小明', status: 'active' }] : []),
    isTeachable: () => true, bkIsMergedPT: (t) => !!t && t.category === '私人教練' && /VIP|限定/.test(t.name || ''),
    showModal: (h) => { log.modals.push(String(h)); }, bkStep1Html: () => '<step1/>', renderBkTypeCards: () => {}, bkSummaryCard: () => '<sum/>', bkCoachOptsHTML: () => '', bkMemberOptsHTML: () => '',
    TODAY: new Date('2026-11-16T00:00:00'), console: { log() {}, warn() {}, error() {} },
    showToast: (m) => { log.toasts.push(String(m)); }, closeModal: () => {}, bkAfterSubmit: () => { log.after++; },
    dbGet: async () => null, coachName: async () => 'Mango', parseYmd: (s) => new Date(s + 'T00:00:00'), ymd: (d) => d.toISOString().slice(0, 10),
    tkMoneyHtml: () => '', readRecur: () => ({ on: false }), recurTkInfoGate: async () => true, recurTkInfoRefresh: () => {}, recurContractChoices: () => {}, recurTkInputs: () => ({ cid: '' }), tkFitsBooking: () => false, tkBookedCountMap: async () => ({}), tkUnlockedLeft: () => 0, bkOpenHoldCreate: async () => { log.hold = true; },
    bkNeedCoach: (t) => !!t && ['體驗', '小班肌力', '私人教練'].includes(t.category), BK_COACH_REQUIRED_CATS: ['體驗', '小班肌力'],
    bizOffHoursHardBlock: () => '', bkSelfOffHoursBlock: () => '', confirmOffHours: async () => true, memNameErr: () => '', normPhone: (s) => String(s || ''),
    validateBooking: async (vbk) => { vbk.venue_unit = 'multi_1'; return null; }, bkWizVenue: () => 'multi', confirmVenueOverflow: async () => true, uid: (p) => p + '-t1',
    dbPut: async (t, x) => { log.puts.push([t, x]); }, dbCacheClear: () => {},
    sb: { rpc: async (n, a) => { log.rpcs.push([n, a]); return { data: { ok: true, id: 'M-new', name: a.p_name, created: true }, error: null }; } },
    openBookingModal: null,
  };
  const scope = new Proxy(env, { has: () => true, get: (t, k) => { if (k === Symbol.unscopables) return undefined; if (k in t) return t[k]; if (typeof k === 'string' && k in globalThis) return globalThis[k]; return undefined; }, set: (t, k, v) => { t[k] = v; return true; } });
  const mk = (code, name) => new Function('scope', 'with(scope){ ' + code + '; return ' + name + '; }')(scope);
  return { env, log, el, mk, types: () => (env.window._bkTypes || []).map(t => t.name) };
}

(async () => {
  console.log('═══ ① 快速預約（旗標開）：教練看得到教練課與體驗課，其餘課別仍被擋 ═══');
  let m = make({ flag: true }); const open = m.mk(grabFn('openBookingModal'), 'openBookingModal'); await open();
  let names = m.types();
  ok('★★★ 手機教練從快速預約開建立預約：課別清單有「體驗課」', names.includes('體驗課'), names);
  ok('　　也有教練課、友善教練課', names.includes('教練課') && names.includes('友善教練課'), names);
  ok('★★ 團體課、運動按摩、自主訓練、場地租借仍然不給（快速預約的原限制保留）', !['團體課', '運動按摩', '自主訓練', '場地租借'].some(n => names.includes(n)), names);
  ok('停用的體驗課不出現', !names.includes('停用的體驗課'), names);
  ok('一次性旗標：開窗過濾完就清掉', m.env.window._bkCoachCourseOnly === false);

  console.log('═══ ② 對照：一般「＋新增」（旗標關）行為不變 ═══');
  m = make({ flag: false }); await m.mk(grabFn('openBookingModal'), 'openBookingModal')(); names = m.types();
  ok('教練（手機）：教練課、友善教練課、體驗課、場地租借；沒有團體課／按摩／自主訓練', ['教練課', '友善教練課', '體驗課', '場地租借'].every(n => names.includes(n)) && !['團體課', '運動按摩', '自主訓練'].some(n => names.includes(n)), names);
  m = make({ flag: true, session: { id: 'e-fd', role: 'front_desk', is_manager: false }, mobile: false }); await m.mk(grabFn('openBookingModal'), 'openBookingModal')(); names = m.types();
  ok('櫃檯從快速預約進來：現在是 教練課＋體驗課（不再被藏掉體驗課），團體課／自主訓練／按摩／場租仍不給', names.includes('體驗課') && names.includes('教練課') && !['團體課', '自主訓練', '運動按摩', '場地租借'].some(n => names.includes(n)), names);

  console.log('═══ ③ 入口：快速預約按鈕與首頁時段都帶旗標，之後 openBookingModal 才過濾 ═══');
  m = make({}); let flagAtOpen = null; m.env.openBookingModal = async () => { flagAtOpen = m.env.window._bkCoachCourseOnly; }; await m.mk(grabFn('openQuickBookCoach'), 'openQuickBookCoach')();
  ok('openQuickBookCoach：呼叫 openBookingModal 當下旗標已立', flagAtOpen === true, flagAtOpen);
  m = make({}); let flag2 = null; m.env.dtlAddAt = () => { flag2 = m.env.window._bkCoachCourseOnly; }; m.env.closeModal = () => {}; m.env._chvQsDate = '2026-11-18'; m.env.window._chvQsDate = '2026-11-18'; m.mk(grabFn('chvQuickPick', false), 'chvQuickPick')('19:00');
  ok('首頁快速預約點時段（chvQuickPick）：帶旗標去建立預約', flag2 === true, flag2);

  console.log('═══ ④ 選了體驗課之後：真的走得到「客戶姓名」表單（不是被擋或卡在中途）═══');
  m = make({ flag: true }); await m.mk(grabFn('openBookingModal'), 'openBookingModal')();
  const tr = m.env.window._bkTypes.find(t => t.name === '體驗課'); m.el('bk-type', tr.id); m.el('bk-coach', ''); m.el('bk-date', '2026-11-18'); m.el('bk-time', '19:00'); m.el('bk-mem-pre', '');
  m.env.window._bkSelfCoach = 'c-mango'; m.env.window._bkTypes = m.env.window._bkTypes;
  await m.mk(grabFn('_bkStep2'), '_bkStep2')();
  const html = m.log.modals[m.log.modals.length - 1] || '';
  ok('★★★ 選體驗課→下一步：出現體驗課表單（客戶姓名＋手機＋確認預約），沒有錯誤提示', /id="bk-trial-name"/.test(html) && /id="bk-trial-phone"/.test(html) && /submitBooking\(\)/.test(html) && m.log.toasts.length === 0, { html: html.slice(0, 160), toasts: m.log.toasts });
  ok('　　精靈暫存記下課別＝體驗、教練＝自己', m.env._bkWizard && m.env._bkWizard.t && m.env._bkWizard.t.category === '體驗' && m.env._bkWizard.coach_id === 'c-mango', m.env._bkWizard && { cat: m.env._bkWizard.t && m.env._bkWizard.t.category, coach: m.env._bkWizard.coach_id });

  console.log('═══ ⑤ 建立：只填姓名（不留手機）→ 真的寫入一筆體驗課預約 ═══');
  m.el('bk-trial-name', '體驗客'); m.el('bk-trial-phone', ''); const submit = m.mk(grabFn('_submitBookingInner'), '_submitBookingInner'); m.env._bkWizard = m.env._bkWizard; await submit();
  const put = m.log.puts.filter(p => p[0] === 'bookings');
  ok('★★★ dbPut(bookings) 一筆：體驗課、教練＝自己、客戶姓名、沒有票券、狀態 booked、日期時間正確', put.length === 1 && put[0][1].category === '體驗' && put[0][1].coach_id === 'c-mango' && put[0][1].trial_name === '體驗客' && put[0][1].ticket_id === null && put[0][1].status === 'booked' && put[0][1].date === '2026-11-18' && put[0][1].start_time === '19:00' && put[0][1].created_by === 'c-mango', put);
  ok('　　沒填手機：不呼叫 fn_trial_member（member_id 空）；提示已建立', m.log.rpcs.length === 0 && put[0][1].member_id === null && m.log.toasts.some(t => /體驗課已建立/.test(t)) && m.log.after === 1, { rpcs: m.log.rpcs, toasts: m.log.toasts });
  console.log('═══ ⑥ 建立：有留手機 → 走 fn_trial_member（教練專用窄門）建／綁會員 ═══');
  m = make({ flag: true }); await m.mk(grabFn('openBookingModal'), 'openBookingModal')(); m.el('bk-type', m.env.window._bkTypes.find(t => t.name === '體驗課').id); m.el('bk-date', '2026-11-18'); m.el('bk-time', '19:00'); m.el('bk-mem-pre', ''); m.el('bk-coach', ''); m.env.window._bkSelfCoach = 'c-mango';
  await m.mk(grabFn('_bkStep2'), '_bkStep2')(); m.el('bk-trial-name', '體驗客'); m.el('bk-trial-phone', '0912345678'); await m.mk(grabFn('_submitBookingInner'), '_submitBookingInner')();
  const put2 = m.log.puts.filter(p => p[0] === 'bookings');
  ok('★★ 呼叫 fn_trial_member（姓名、手機、教練 id），並把回傳的會員綁到預約', m.log.rpcs.length === 1 && m.log.rpcs[0][0] === 'fn_trial_member' && m.log.rpcs[0][1].p_phone === '0912345678' && m.log.rpcs[0][1].p_coach_id === 'c-mango' && put2.length === 1 && put2[0][1].member_id === 'M-new' && put2[0][1].category === '體驗', { rpcs: m.log.rpcs, put2 });

  console.log('═══ ⑦ 原始碼層面 ═══');
  ok('過濾條件只多放行「體驗」，沒有改成放行所有課別', /if\(window\._bkCoachCourseOnly && t\.category!=='私人教練' && t\.category!=='體驗'\) return false;/.test(src));
  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
