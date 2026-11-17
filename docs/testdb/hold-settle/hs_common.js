/* 瀏覽器驗收工具共用：與 run_hold_settle_concurrency.js 同一份行為的 askHidden／makeApi（已審查的那支不改動，這裡獨立一份）。只碰測試庫。 */
'use strict';
const cp = require('child_process');
const REF = 'kucvxpjatptfckhlxptj', BASE = 'https://' + REF + '.supabase.co', TIMEOUT_MS = 20000;
async function askHidden(q) {
  if (!process.stdin.isTTY) throw new Error('需要在真正的終端機執行（隱藏輸入）');
  process.stdout.write(q); cp.execSync('stty -echo', { stdio: 'inherit' });
  const restore = () => { try { cp.execSync('stty echo', { stdio: 'inherit' }); } catch (_) {} };
  process.once('exit', restore);
  try { return await new Promise((res) => { let s = ''; process.stdin.setEncoding('utf8'); const on = (d) => { s += d; if (s.includes('\n')) { process.stdin.off('data', on); process.stdin.pause(); res(s.split('\n')[0].trim()); } }; process.stdin.on('data', on); process.stdin.resume(); }); }
  finally { restore(); process.stdout.write('\n'); }
}
function makeApi(serviceKey, anonKey, { stopSignal, noStop } = {}) {
  async function req(method, p, { body, key, bearer, headers } = {}) {
    const h = Object.assign({ apikey: key || serviceKey, Authorization: 'Bearer ' + (bearer || key || serviceKey), 'Content-Type': 'application/json' }, headers || {});
    const sigs = [AbortSignal.timeout(TIMEOUT_MS)]; if (!noStop && stopSignal) sigs.push(stopSignal);
    const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any(sigs) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
    return { status: r.status, json: j, text: t, headers: r.headers };
  }
  const safe = async (f) => { try { return await f(); } catch (e) { return { status: 0, json: null, text: '', error: String(e && e.message || e) }; } };
  return {
    rest: (m, p, body, headers) => req(m, '/rest/v1/' + p, { body, headers }),
    adminCreateUser: (email, password) => req('POST', '/auth/v1/admin/users', { body: { email, password, email_confirm: true } }),
    adminGetUser: (id) => req('GET', '/auth/v1/admin/users/' + id),
    adminDeleteUser: (id) => req('DELETE', '/auth/v1/admin/users/' + id),
    adminListUsers: (page, per) => req('GET', '/auth/v1/admin/users?page=' + page + '&per_page=' + per),
    signIn: (email, password) => req('POST', '/auth/v1/token?grant_type=password', { body: { email, password }, key: anonKey }),
    rpcRaw: (fn, body, jwt) => safe(() => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey, bearer: jwt })),
    probe: (fn, body) => safe(() => req('POST', '/rest/v1/rpc/' + fn, { body, key: anonKey })),
  };
}
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
module.exports = { REF, BASE, askHidden, makeApi, today, addDays };
