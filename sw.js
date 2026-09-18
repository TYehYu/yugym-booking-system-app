// YUGYM PWA service worker
/* 策略：快取優先（stale-while-revalidate）＋ HEAD 把關。
   2026-09-18 使用者回報「會員跟教練都反應開啟介面很久才進入」。實測原因：
     ・GitHub 到台灣只有約 35 KB/s（同一台電腦連 Cloudflare／Google 都是 0.1 秒內完成，
       raw.githubusercontent 也一樣慢 → 是 GitHub 的線路，回應標頭顯示台灣走新加坡節點）
     ・index.html 壓縮後 1.72MB → 整份抓完要將近 48 秒
     ・而原本這裡是「網路優先」：每次開啟都**一定**先等那 48 秒，抓不到才用快取
   平常沒推新版時瀏覽器拿到 304（0.3 秒）還算順，但只要推一次版，
   所有人下一次開啟都要等那 48 秒 —— 那正是使用者聽到的抱怨。

   改成：
     ① 快取裡有 → 立刻回（0.3 秒進 App），不等網路
     ② 同時在背景發一個 HEAD（幾百 bytes）比對 ETag；只有真的換版才去抓完整檔案，
        存進快取給「下一次」用。沒換版就什麼都不抓，不浪費行動數據。
     ③ 快取裡沒有（第一次來）→ 照常走網路，抓到就存起來

   ⚠ 代價：推新版之後，客人那一次看到的還是舊版，下一次開啟才換新。
     員工端有現成的「系統已更新 → 重新整理」提示（verUpCheck，每 5 分鐘 HEAD 一次）
     不受影響；會員端則是靜默地下次生效。這是使用者 2026-09-18 權衡後選的。
   ⚠ 原本網路優先的理由是「避免更新後看到舊版」。那個需求現在由上面那個提示承擔，
     而且 verUpReload() 是用帶版本號的網址重新載入 —— 帶查詢字串的請求
     在下面會直接略過快取，所以「重新整理」一定拿得到新版。 */
const CACHE = 'yugym-v1';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(()=>{}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 背景更新的節流：一次開啟通常會有好幾個同網域請求（HTML、icon、manifest），
   沒有這道閘門就會各自發一輪 HEAD。 */
let _revalAt = 0;
const REVAL_MS = 60000;

/* 先用 HEAD 比對指紋，真的換版了才抓完整檔案。
   ⚠ 這裡刻意不比對 content-length —— 它在 gzip 前後意義不同，容易誤判成「沒變」。
     ETag 沒有就退回 last-modified；兩者都拿不到就當作有變（寧可多抓一次，
     也不要因為比不到而永遠停在舊版）。 */
async function freshen(req, cached) {
  try {
    if (Date.now() - _revalAt < REVAL_MS) return;
    _revalAt = Date.now();
    const head = await fetch(req.url, { method: 'HEAD', cache: 'no-store' });
    if (!head || !head.ok) return;
    const now = head.headers.get('etag') || head.headers.get('last-modified') || '';
    const was = cached ? (cached.headers.get('etag') || cached.headers.get('last-modified') || '') : '';
    if (now && was && now === was) return;          // 沒換版 → 不抓那 1.7MB
    const res = await fetch(req, { cache: 'reload' });
    if (res && res.ok && res.status === 200) {
      const c = await caches.open(CACHE);
      await c.put(req, res.clone());
    }
  } catch (_) {}
}

self.addEventListener('fetch', e => {
  const req = e.request;
  // 只處理 GET；Supabase API 等跨網域請求一律直接走網路，不快取
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部(含 Supabase)不攔截
  /* 帶查詢字串的完全不攔截：版本檢查的探針（?_vc=）與「重新整理」的 ?v=版本
     就是要繞過快取拿最新的，攔下來會讓那兩件事失效。順帶也避免每個
     時間戳都在快取裡留一份。 */
  if (url.search) return;

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      e.waitUntil(freshen(req, cached));   // 先回快取，更新留到背景
      return cached;
    }
    try {
      const res = await fetch(req);
      /* ⚠ 只快取「真的成功」的回應（2026-08-29 曾邦紅手機打不開頁面）——
         原本是抓到什麼就存什麼：GitHub Pages 偶發的 5xx／部署當下的 404、
         或行動網路中斷造成的部分回應，都會被存進快取。
         一旦存進去，之後每次都會拿那份壞的出來，而且**清不掉**。
         ⚠ res.ok 只涵蓋 200–299；type==='opaque' 的跨網域回應在這裡本來就被
           上面的 origin 檢查擋掉了，不會走到這裡。 */
      if (res && res.ok && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      }
      return res;
    } catch (_) {
      return (await caches.match('./index.html')) || offlinePage(req) || Response.error();
    }
  })());
});

/* 連線斷掉、而且快取裡也沒有 → 給一張「重新載入」的小頁，不要讓畫面一片空白
   （2026-09-16 使用者回報手機全白；index.html 有 4.8MB，行動網路很容易抓到一半就斷）。
   ⚠ 只對「開啟頁面」這種請求給：其他資源（圖片、JSON）拿到一份 HTML 只會更難查。
   ⚠ 這頁本身不可以被快取，也不要引用任何外部檔案 —— 它存在的前提就是網路有問題。
   ⚠ 回 503 而不是 200：狀態碼要誠實，而且能避免它被誤存成 index.html 的快取
     （上面那段只在 res.ok && status===200 時才寫入快取）。 */
function offlinePage(req){
  const wantsHtml = req.mode === 'navigate'
    || (req.headers.get('accept') || '').indexOf('text/html') >= 0;
  if (!wantsHtml) return undefined;
  const html = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>YUGYM 有肌訓練</title><style>'
    + 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
    + 'background:#F2EFE6;color:#2b2722;font-family:-apple-system,"PingFang TC","Noto Sans TC",sans-serif;}'
    + '.b{text-align:center;padding:32px 24px;max-width:320px;}'
    + 'h1{font-size:19px;margin:0 0 10px;color:#003d32;}'
    + 'p{font-size:14px;line-height:1.9;color:#6b635a;margin:0 0 22px;}'
    + 'button{font:inherit;font-size:16px;font-weight:700;color:#fff;background:#003d32;'
    + 'border:0;border-radius:12px;padding:14px 32px;cursor:pointer;}'
    + '</style></head><body><div class="b">'
    + '<h1>網路好像不太穩</h1>'
    + '<p>頁面沒有載入完整。<br>換到訊號好一點的地方，再按下面重新載入。</p>'
    + '<button onclick="location.reload()">重新載入</button>'
    + '</div></body></html>';
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
