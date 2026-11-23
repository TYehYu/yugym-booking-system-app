#!/usr/bin/env node
/* 瀏覽器驗收用的本機前端（只綁 127.0.0.1，只指向測試庫）：提供指定分支的 index.html，
   ① /config.js 改成測試庫網址與 anon key（SB_URL 不是測試庫就拒絕）② 在 index.html 最前面注入「測試登入工作階段」：?as=adm|dsk|cch|mgr|mch|hrp
   （讀 --work/sessions.json，由 run_hr_acceptance.js 產生）③ /sw.js 一律 404。token 不寫進日誌。
   用法：node docs/hr-perm/acceptance/serve_hr_frontend.js --env <.env.test> --work <工作資料夾> --root <分支工作目錄> [--port 8766] */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const REF = 'kucvxpjatptfckhlxptj', BASE = 'https://' + REF + '.supabase.co';
const argv = process.argv.slice(2); const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(opt('--root', '.')), work = path.resolve(opt('--work', '')), port = Number(opt('--port', '8766'));
const env = Object.fromEntries(fs.readFileSync(opt('--env'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
if (env.SB_URL !== BASE || !env.ANON_KEY) { console.error('✗ .env.test 不是測試庫或缺 ANON_KEY'); process.exit(2); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const cfg = 'window.YUGYM_CONFIG=' + JSON.stringify({ url: BASE, anonKey: env.ANON_KEY }) + ';';
const inject = (html, s) => { if (!s || !s.access_token) return html; const key = 'sb-' + REF + '-auth-token'; const js = '<script>try{localStorage.setItem(' + JSON.stringify(key) + ',' + JSON.stringify(JSON.stringify(s)).replace(/</g, '\\u003c') + ')}catch(e){}</script>'; return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + js) : js + html; };
http.createServer((req, res) => {
  try {
    const u = req.url || '/', p = u.split('?')[0];
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }); return res.end(cfg); }
    if (p === '/sw.js') { res.writeHead(404); return res.end(); }
    const f = path.normalize(path.join(ROOT, p === '/' ? '/index.html' : decodeURIComponent(p)));
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end('not found'); }
    if (path.basename(f) === 'index.html' && path.dirname(f) === ROOT) {
      let s = null; try { const all = JSON.parse(fs.readFileSync(path.join(work, 'sessions.json'), 'utf8')); const m = /[?&]as=(\w+)/.exec(u); s = all[(m && m[1]) || 'dsk']; } catch (_) {}
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); return res.end(inject(fs.readFileSync(f, 'utf8'), s));
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end('error'); }
}).listen(port, '127.0.0.1', () => console.log('本機前端（測試庫）：http://127.0.0.1:' + port + '/?as=<adm|dsk|cch|mgr|mch|hrp>'));
