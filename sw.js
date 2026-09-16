// YUGYM PWA service worker
// 策略：網路優先(network-first)。一律先抓最新檔，抓不到(離線)才用快取。
// 這樣可避免「更新後看到舊版」的快取問題。
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

self.addEventListener('fetch', e => {
  const req = e.request;
  // 只處理 GET；Supabase API 等跨網域請求一律直接走網路，不快取
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部(含 Supabase)不攔截

  e.respondWith(
    fetch(req)
      .then(res => {
        /* ⚠ 只快取「真的成功」的回應（2026-08-29 曾邦紅手機打不開頁面）——
           原本是抓到什麼就存什麼：GitHub Pages 偶發的 5xx／部署當下的 404、
           或行動網路中斷造成的部分回應（opaque/partial），都會被存進快取。
           一旦存進去，之後每次離線或連線不穩都會拿那份壞的出來，
           畫面就一直打不開，而且**清不掉**（下次成功前都不會被覆蓋）。
           index.html 有 4MB，手機在外面很容易抓一半。
           ⚠ res.ok 只涵蓋 200–299；type==='opaque' 的跨網域回應在這裡本來就被
             上面的 origin 檢查擋掉了，不會走到這裡。 */
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))
        .then(r => r || offlinePage(req)))
  );
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
