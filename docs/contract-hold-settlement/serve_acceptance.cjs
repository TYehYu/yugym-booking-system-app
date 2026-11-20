#!/usr/bin/env node
/* 瀏覽器驗收用的本機前端（只綁 127.0.0.1）：提供目前分支的 index.html，但
   ① /config.js 改成測試庫的網址與 anon 金鑰（讀 --env；SB_URL 不是測試庫就拒絕啟動）
   ② 在 index.html 最前面注入「測試登入工作階段」（讀 --work/sessions.json，由 run_hold_settle_browser_seed.js 產生；?as=coach 用教練），讓瀏覽器自動登入，不需要輸入任何密碼
   ③ /sw.js 一律 404（避免 Service Worker 快取舊版）。token 不寫進日誌、不寫進任何會進版控的檔案。
   用法：node docs/testdb/hold-settle/serve_test_frontend.js --env <.env.test> --work <工作資料夾> [--port 8765] [--root <分支工作目錄>]   然後開 http://127.0.0.1:8765/ （教練：?as=coach） */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REF = 'kucvxpjatptfckhlxptj', BASE = 'https://' + REF + '.supabase.co';
let ROOT = path.resolve(__dirname, '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
/* 純函式（selftest 會測） */
function configJs(url, anon) { if (url !== BASE) throw new Error('SB_URL 不是測試庫'); return 'window.YUGYM_CONFIG=' + JSON.stringify({ url, anonKey: anon }) + ';'; }
function injectSession(html, session) {
  if (!session || !session.access_token) return html;
  const key = 'sb-' + REF + '-auth-token'; const js = '<script>try{localStorage.setItem(' + JSON.stringify(key) + ',' + JSON.stringify(JSON.stringify(session)).replace(/</g, '\\u003c') + ');}catch(e){}</script>';
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + js) : js + html;
}
function safeFile(root, urlPath) { const p = path.normalize(path.join(root, decodeURIComponent(urlPath.split('?')[0]))); return p.startsWith(root + path.sep) || p === root ? p : null; }
module.exports = { configJs, injectSession, safeFile, REF };
if (require.main !== module) return;
const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
if (opt('--root')) ROOT = path.resolve(opt('--root'));   // 指定要提供哪個分支工作目錄的 index.html（預設＝本分支）
const envPath = opt('--env'); const work = path.resolve(opt('--work', '')); const port = Number(opt('--port', '8765'));
if (!envPath) { console.error('缺 --env'); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
let cfg; try { cfg = configJs(env.SB_URL, env.ANON_KEY); } catch (e) { console.error('✗ ' + e.message); process.exit(2); } if (!env.ANON_KEY) { console.error('✗ 缺 ANON_KEY'); process.exit(2); }
http.createServer((req, res) => {
  try {
    const u = req.url || '/'; const p = u.split('?')[0];
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }); return res.end(cfg); }
    if (p === '/sw.js') { res.writeHead(404); return res.end(); }
    const f = safeFile(ROOT, p === '/' ? '/index.html' : p); if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('not found'); }
    if (path.basename(f) === 'index.html' && path.dirname(f) === ROOT) {
      let sess = null; try { const all = JSON.parse(fs.readFileSync(path.join(work, 'sessions.json'), 'utf8')); sess = /[?&]as=coach/.test(u) ? all.coach : all.desk; } catch (_) {}
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); let html=injectSession(fs.readFileSync(f,'utf8'),sess);
      const map=JSON.parse(fs.readFileSync(path.join(work,'browser_fixture_map.json'),'utf8'));
      const buttons=['C1','C2'].map(k=>{const bid=map.firstBooking[k];if(!/^CC-HS-[A-Za-z0-9-]+$/.test(bid))throw Error('bad fixture');return `<button type="button" onclick="document.getElementById('cc-ch-panel').hidden=true;openConvertPending('${bid}')">${k==='C1'?'桌機':'手機'}：轉正同合約卡位</button>`;}).join(' ');
      const panel='<aside id="cc-ch-panel" style="position:fixed;right:8px;bottom:80px;z-index:99999;background:#fff4d9;padding:10px;border:1px solid #9a762c;border-radius:10px;max-width:90vw;font-size:14px">假資料驗收 '+buttons+'</aside>';
      const end=html.lastIndexOf('</body>');if(end<0)throw Error('missing body');html=html.slice(0,end)+panel+html.slice(end);return res.end(html);
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end('error'); }
}).listen(port, '127.0.0.1', () => console.log('本機前端（測試庫）：http://127.0.0.1:' + port + '/  （教練：?as=coach）；Ctrl+C 結束'));
