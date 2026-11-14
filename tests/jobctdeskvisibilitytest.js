/* 櫃檯可查看／列印「兼職教練聘僱契約書」(id='part')與「承攬契約書」(id='coop'，2026-11-14 加入) 空白範本 回歸測試（2026-11-13）

   需求：櫃檯（front_desk）可查看、列印、另存 PDF 兼職教練契約；不可新增／修改／刪除；
         其他職務契約的權限維持不變；不動 isManagerUp／isDeskLike；不動會員服務合約。
   ⚠ 前端角色判斷只限制正常 UI，不是伺服器端安全邊界（契約全文是前端常數、隨公開的 index.html 發佈）。

   全部用 mock/stub，不連 Supabase。真函式一律由 index.html 逐字抽出。 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const BASE_SHA = '35fdef60cb3ca5a4962ea0936b65877695408a7c';   // 這次功能的正式基準（P0-1 之後）
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + x : '')); } };
const info = (n) => console.log('  ℹ ' + n);

let baseSrc = null;
try { baseSrc = execSync('git show ' + BASE_SHA + ':index.html', { cwd: ROOT, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8'); } catch (_) { baseSrc = null; }

function grabFrom(text, name) {
  const a = text.indexOf('async function ' + name + '(');
  const i = a >= 0 ? a : text.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到 ' + name);
  let d = 0, k;
  for (k = text.indexOf('{', i); k < text.length; k++) { if (text[k] === '{') d++; else if (text[k] === '}') { d--; if (d === 0) break; } }
  return text.slice(i, k + 1);
}
const grabFn = (n) => grabFrom(src, n);
function grabJobArr(text) {   // 從 JOB_CT_VERSION 到 jobCtGet 之前＝版本常數＋整個 JOB_CONTRACTS 陣列
  const a = text.indexOf('const JOB_CT_VERSION');
  const b = text.indexOf('function jobCtGet(');
  if (a < 0 || b < 0 || b < a) throw new Error('抓不到 JOB_CONTRACTS 區段');
  return text.slice(a, b);
}

const BUILTIN = new Set(['Date', 'Promise', 'Object', 'Array', 'Math', 'Set', 'Number', 'String', 'JSON', 'Error', 'undefined', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Boolean', 'Map', 'RegExp', 'Symbol', 'Infinity', 'NaN']);
function sandbox(env) {
  const stub = function () { return undefined; };
  return new Proxy(env, {
    has: (t, k) => typeof k === 'string' && !BUILTIN.has(k),
    get: (t, k) => { if (k === Symbol.unscopables) return undefined; if (k in t) return t[k]; return stub; },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const FN_NAMES = ['jobCtGet', 'jobCtCanView', 'jobCtSumHTML', 'jobCtSignBlock', 'ctBodyHTML', 'ctPdfName', 'openContractQuickView', 'openJobContractView', 'openJobContractPrint', 'openMemberContractView', 'isManagerUp', 'isDeskLike'];
function mkApp(role) {
  const calls = { modal: [], toast: [], print: [], member: 0 };
  const env = {
    SESSION: role, CONTRACT_VERSION: 'v-test', CONTRACT_TEXT: '【會員服務合約全文】', contractFillBlockHTML: () => '',
    showModal: (h) => calls.modal.push(h), showToast: (t) => calls.toast.push(t), closeModal() {},
    ctPrintOpen: (title, html) => calls.print.push({ title, html }),
    console, Date, JSON,
  };
  env.openMemberContractView = undefined;   // 下面用真函式覆蓋，但要計次
  const deskIds = (src.match(/const JOB_CT_DESK_IDS=\[[^\]]*\];/) || [''])[0];   // 名單常數（不是函式，要另外抽）
  const code = [grabJobArr(src), deskIds, ...FN_NAMES.map(grabFn)].join('\n');
  const api = new Function('__sb', 'with(__sb){ ' + code + '\n return {JOB_CONTRACTS, jobCtCanView, jobCtGet, openContractQuickView, openJobContractView, openJobContractPrint, openMemberContractView, isManagerUp, isDeskLike}; }')(sandbox(env));
  return { api, calls, env };
}
const ROLES = {
  admin: { role: 'admin', id: 'a1' }, manager: { role: 'coach', is_manager: true, id: 'm1' },
  front_desk: { role: 'front_desk', id: 'f1' }, coach: { role: 'coach', id: 'c1' }, member: { role: 'member', id: 'u1' },
};
const ALL_IDS = ['full', 'desk', 'part', 'intern', 'coop', 'mgr', 'quit'];
const optLabels = (html) => [...html.matchAll(/<b class="bk-opt-t">([^<]+)<\/b>/g)].map(m => m[1]);

(async () => {
  const probe = mkApp(ROLES.admin).api;
  const NAME = { part: probe.jobCtGet('part').name, coop: probe.jobCtGet('coop').name };

  console.log('\nT8／T9 草稿與條文');
  {
    const j = probe.JOB_CONTRACTS;
    ok('★ T8 其他 draft 契約仍標 draft:true（full、desk、intern、mgr）', ['full', 'desk', 'intern', 'mgr'].every(id => probe.jobCtGet(id).draft === true));
    ok('  coop、quit 本來就上架（沒有 draft）', !probe.jobCtGet('coop').draft && !probe.jobCtGet('quit').draft);
    ok('★ part 已解除 draft', !probe.jobCtGet('part').draft);
    if (baseSrc) {
      const bj = new Function(grabJobArr(baseSrc) + '\nreturn JOB_CONTRACTS;')();
      const strip = (c) => { const x = Object.assign({}, c); delete x.draft; return JSON.stringify(x); };
      ok('★★★ T9 part 契約全部欄位（名稱／摘要／條文）逐字不變（只差 draft 旗標）', strip(bj.find(c => c.id === 'part')) === strip(j.find(c => c.id === 'part')));
      ok('★ T9 其他六份契約整份不變（含 draft 旗標）', ALL_IDS.filter(id => id !== 'part').every(id => JSON.stringify(bj.find(c => c.id === id)) === JSON.stringify(j.find(c => c.id === id))));
      ok('  契約數量不變（7）', bj.length === 7 && j.length === 7);
      ok('  JOB_CT_VERSION 不變', new Function(grabJobArr(baseSrc) + '\nreturn JOB_CT_VERSION;')() === new Function(grabJobArr(src) + '\nreturn JOB_CT_VERSION;')());
    } else info('T9：取不到基準 ' + BASE_SHA.slice(0, 7) + ' 的 git 物件（暫存副本／淺 clone）——基準對照略過；在有 git 歷史的 worktree 內直接跑會完整檢查');
  }

  console.log('\nT1 櫃檯的選單');
  {
    const { api, calls } = mkApp(ROLES.front_desk);
    api.openContractQuickView();
    const html = calls.modal[0] || '';
    ok('★ T1 前台按［查看合約］出現選單（不是直接開會員合約）', calls.modal.length === 1 && /<div class="modal-title">查看合約/.test(html));
    ok('★★ T1 選單只有「會員服務合約」「兼職教練聘僱契約書」「承攬契約書」', JSON.stringify(optLabels(html)) === JSON.stringify(['會員服務合約', NAME.part, NAME.coop]), JSON.stringify(optLabels(html)));
    ok('  沒有「人事表單」分組（櫃檯看不到離職申請書）', !/人事表單/.test(html));
    ok('  選單裡只有 part、coop 的職務契約入口', (html.match(/openJobContractView\('([a-z]+)'\)/g) || []).join() === "openJobContractView('part'),openJobContractView('coop')");
  }

  console.log('\nT2／T3 櫃檯查看與列印 part');
  {
    const { api, calls } = mkApp(ROLES.front_desk);
    api.openJobContractView('part');
    ok('★ T2 可查看 part（彈窗顯示契約名稱與條文）', calls.modal.length === 1 && calls.modal[0].includes(NAME.part) && calls.modal[0].includes('公司：筋實堂'), calls.toast.join());
    ok('  查看畫面按鈕只有「換一份」「下載 PDF / 列印」', (calls.modal[0].match(/<button[^>]*>([^<]*)<\/button>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('|') === '← 換一份|下載 PDF / 列印');
    api.openJobContractPrint('part');
    ok('★ T3 可列印 part（呼叫 ctPrintOpen，內容含條文與簽名區）', calls.print.length === 1 && calls.print[0].html.includes(NAME.part) && /ct-sign|sig-line/.test(calls.print[0].html));
    ok('★ T3 另存 PDF：列印視窗的檔名含契約名稱與版本（瀏覽器「另存 PDF」用它當檔名）', /兼職教練聘僱契約書/.test(calls.print[0].title) && /2026-v1/.test(calls.print[0].title), calls.print[0].title);
    ok('  沒有任何 toast 拒絕訊息', calls.toast.length === 0);
  }

  console.log('\nT2c／T3c 櫃檯查看與列印 coop（承攬契約書，合作教練；2026-11-14 加入）');
  {
    const { api, calls } = mkApp(ROLES.front_desk);
    api.openJobContractView('coop');
    ok('★ T2c 可查看 coop（彈窗顯示契約名稱與條文）', calls.modal.length === 1 && calls.modal[0].includes(NAME.coop) && calls.modal[0].includes('公司：筋實堂'), calls.toast.join());
    ok('  查看畫面按鈕只有「換一份」「下載 PDF / 列印」（沒有新增／編輯／刪除）', (calls.modal[0].match(/<button[^>]*>([^<]*)<\/button>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join('|') === '← 換一份|下載 PDF / 列印');
    api.openJobContractPrint('coop');
    ok('★ T3c 可列印 coop（呼叫 ctPrintOpen，內容含條文與簽名區）', calls.print.length === 1 && calls.print[0].html.includes(NAME.coop) && /ct-sign|sig-line/.test(calls.print[0].html));
    ok('★ T3c 另存 PDF：檔名含「承攬契約書」與版本', /承攬契約書/.test(calls.print[0].title) && /2026-v1/.test(calls.print[0].title), calls.print[0].title);
    ok('  沒有任何 toast 拒絕訊息', calls.toast.length === 0);
    const app2 = mkApp(ROLES.front_desk); app2.api.openContractQuickView();
    ok('  櫃檯選單沒有「人事表單」分組（離職申請書 quit 仍看不到）', !/人事表單/.test(app2.calls.modal[0]) && !/openJobContractView\('quit'\)/.test(app2.calls.modal[0]));
  }

  console.log('\nT4 櫃檯不可看／印其他契約');
  for (const id of ['full', 'desk', 'intern', 'mgr', 'quit']) {
    const { api, calls } = mkApp(ROLES.front_desk);
    api.openJobContractView(id); api.openJobContractPrint(id);
    ok('★ T4 櫃檯 ' + id + '：查看與列印都被擋（不彈窗、不開列印、有拒絕訊息）', calls.modal.length === 0 && calls.print.length === 0 && calls.toast.length === 2, JSON.stringify({ m: calls.modal.length, p: calls.print.length, t: calls.toast }));
  }

  console.log('\nT5／T6 管理員與店長');
  for (const who of ['admin', 'manager']) {
    const { api, calls } = mkApp(ROLES[who]);
    for (const id of ['part', 'coop', 'quit']) { api.openJobContractView(id); api.openJobContractPrint(id); }
    ok('★ ' + (who === 'admin' ? 'T5 管理員' : 'T6 店長') + '：part、coop、quit 都能查看與列印', calls.modal.length === 3 && calls.print.length === 3 && calls.toast.length === 0, JSON.stringify(calls.toast));
    const m = mkApp(ROLES[who]); m.api.openContractQuickView();
    const labels = optLabels(m.calls.modal[0]);
    ok('  ' + who + ' 選單：會員服務合約＋part＋coop＋quit（草稿不列）', JSON.stringify(labels) === JSON.stringify(['會員服務合約', NAME.part, probe.jobCtGet('coop').name, probe.jobCtGet('quit').name]), JSON.stringify(labels));
    ok('  ' + who + ' 草稿契約 full／desk／intern／mgr 仍被擋', ['full', 'desk', 'intern', 'mgr'].every(id => { const t = mkApp(ROLES[who]); t.api.openJobContractView(id); return t.calls.modal.length === 0; }));
  }

  console.log('\nT7 教練與會員');
  for (const who of ['coach', 'member']) {
    const { api, calls } = mkApp(ROLES[who]);
    for (const id of ALL_IDS) { api.openJobContractView(id); api.openJobContractPrint(id); }
    ok('★ T7 ' + who + '：七份契約的查看與列印全被擋', calls.modal.length === 0 && calls.print.length === 0 && calls.toast.length === 14);
  }

  console.log('\nT11 會員服務合約入口');
  {
    for (const who of ['coach', 'member']) {
      const { api, calls } = mkApp(ROLES[who]); api.openContractQuickView();
      ok('★ T11 ' + who + ' 按［查看合約］：照舊直接開會員服務合約（沒有選單）', calls.modal.length === 1 && calls.modal[0].includes('會員服務合約全文') && !/bk-opt/.test(calls.modal[0]));
    }
    const fd = mkApp(ROLES.front_desk); fd.api.openContractQuickView();
    ok('  櫃檯選單的「會員服務合約」列呼叫 openMemberContractView()', /closeModal\(\);openMemberContractView\(\)/.test(fd.calls.modal[0]));
    fd.api.openMemberContractView();
    ok('  會員服務合約本體可開（含全文、列印鈕）', fd.calls.modal.length === 2 && fd.calls.modal[1].includes('【會員服務合約全文】') && /openContractPrint\(\)/.test(fd.calls.modal[1]));
    if (baseSrc) ok('  openMemberContractView／openContractPrint／ctBodyHTML 本體與基準相同', ['openMemberContractView', 'openContractPrint', 'ctBodyHTML', 'ctSignBlock', 'ctPrintOpen', 'ctPdfName'].every(n => grabFrom(baseSrc, n) === grabFn(n)));
  }

  console.log('\nT10 權限核心函式本體不變');
  {
    if (baseSrc) ok('★★★ T10 isManagerUp 本體與基準逐字相同', grabFrom(baseSrc, 'isManagerUp') === grabFn('isManagerUp')); else info('T10：基準取不到，略過逐字比對');
    if (baseSrc) ok('★★★ T10 isDeskLike 本體與基準逐字相同', grabFrom(baseSrc, 'isDeskLike') === grabFn('isDeskLike'));
    if (baseSrc) ok('  jobCtGet／jobCtSumHTML／jobCtSignBlock 本體不變', ['jobCtGet', 'jobCtSumHTML', 'jobCtSignBlock'].every(n => grabFrom(baseSrc, n) === grabFn(n)));
  }

  console.log('\nT12 不存在新增／修改／刪除職務契約的 UI');
  {
    const body = grabJobArr(src).length ? '' : '';
    const sect = [grabFn('jobCtCanView'), grabFn('openContractQuickView'), grabFn('openJobContractView'), grabFn('openJobContractPrint')].join('\n');
    ok('★ 沒有改寫 JOB_CONTRACTS 的程式（push／splice／賦值／刪除）', !/JOB_CONTRACTS\s*(\.(push|splice|pop|shift|unshift|sort\(\s*\)\s*=)|\[[^\]]*\]\s*=[^=])/.test(src) && !/delete\s+JOB_CONTRACTS/.test(src));
    ok('★ 沒有任何職務契約寫入資料的呼叫（dbPut／dbDel／sb.from 出現在這四支裡）', !/dbPut|dbDel|sb\.from|sb\.rpc|storage/.test(sect));
    ok('★ 沒有 jobCt* 的 Save／Edit／Delete／Add／Create 函式', !/function jobCt(Save|Edit|Delete|Del|Add|Create|New|Update|Remove)\w*\(/.test(src));
    const fd = mkApp(ROLES.front_desk); fd.api.openContractQuickView(); fd.api.openJobContractView('part');
    ok('★ 櫃檯看到的選單與契約畫面沒有「新增／編輯／刪除／修改」', fd.calls.modal.every(h => !/新增|編輯|刪除|修改/.test(h.replace(/[^<>]*條文[^<>]*/g, '').replace(/<div class="ctr-a4">[\s\S]*?<\/div>\s*<div class="modal-foot"/, '<div class="modal-foot"'))), 'modal');
    ok('  櫃檯可見性名單只有 part、coop', /const JOB_CT_DESK_IDS=\['part','coop'\];/.test(src));
  }

  console.log('\nT13 語法');
  {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m, n = 0, bad = [];
    while ((m = re.exec(src))) { n++; try { new Function(m[1]); } catch (e) { bad.push(n + ':' + e.message); } }
    ok('★ T13 三個 <script> 區塊語法正確', n === 3 && bad.length === 0, n + ' blocks ' + bad.join());
  }

  console.log('\nT14 建置後版本與 B 模式');
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yugym-jobct-'));
    fs.mkdirSync(path.join(tmp, 'build'));
    fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(tmp, 'index.html'));
    for (const f of fs.readdirSync(path.join(ROOT, 'build'))) fs.copyFileSync(path.join(ROOT, 'build', f), path.join(tmp, 'build', f));
    let built = '', err = null;
    try { execSync('node build/slim.js index.html out.html', { cwd: tmp, stdio: 'ignore' }); built = fs.readFileSync(path.join(tmp, 'out.html'), 'utf8'); } catch (e) { err = e; }
    ok('★ T14 build/slim.js（Pages 正式流程）建置成功', !err && built.length > 0);
    const ver = (src.match(/const APP_VERSION = '([\d.]+)'/) || [])[1];
    ok('★ T14 原始檔 APP_VERSION 與 label 一致、且已更新（≠ 基準 261113.1918）', ver && src.includes("const APP_VERSION_LABEL = 'v" + ver + "'") && ver !== '261113.1918', ver);
    ok('★ T14 建置後版本號正確', built.includes("const APP_VERSION = '" + ver + "'"), ver);
    ok('★ T14 建置後沒有混入 B 模式（contractHoldB／grantCancelRpc／fn_grant_cancel）', !/contractHoldB|grantCancelRpc|fn_grant_cancel/.test(built));
    ok('  建置後仍含 jobCtCanView 與 part（上架）', built.includes('function jobCtCanView(') && /\{id:'part',name:/.test(built));
    ok('  建置後 part 不再帶 draft', !/\{id:'part',draft/.test(built));
    ok('  建置後 coop 上架（不帶 draft）且櫃檯名單含 coop', !/\{id:'coop',draft/.test(built) && /const JOB_CT_DESK_IDS=\['part','coop'\];/.test(built));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('\nT15／T16 既有修復保留');
  {
    ok('★ T15 P0-1 _calDiag 宣告 1 份', (src.match(/function _calDiag\s*\(/g) || []).length === 1);
    ok('★ T15 P0-1 _calDiag 呼叫 13 處', (src.match(/(?<![\w$.])_calDiag\s*\((?!stage)/g) || []).length === 13);
    const v2 = grabFn('coachCalV2').replace(/\/\*[\s\S]*?\*\//g, '');
    const hasP02 = /clearInterval\(window\._calPollTimer\)/.test(grabFn('coachCalV2'));
    if (hasP02) {
      ok('★ T16 P0-2：coachCalV2 不再呼叫 startCalPoll()', !/startCalPoll\s*\(/.test(v2));
      ok('★ T16 P0-2：進入 V2 會清除殘留 _calPollTimer', /if\(window\._calPollTimer\)\{ clearInterval\(window\._calPollTimer\); window\._calPollTimer=null; \}/.test(grabFn('coachCalV2')));
    } else {
      info('T16：本基準（' + BASE_SHA.slice(0, 7) + '）不含 P0-2（coachCalV2 仍呼叫 startCalPoll）——略過；合併 P0-2 後此段自動生效');
      if (baseSrc) ok('  T16 前提：本分支沒有誤動 coachCalV2（與基準逐字相同）', grabFrom(baseSrc, 'coachCalV2') === grabFn('coachCalV2'));
    }
  }

  console.log('\n結果：' + pass + ' 通過／' + fail + ' 失敗');
  process.exit(fail ? 1 : 0);
})();
