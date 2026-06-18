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
        // 同源檔案抓到就更新快取
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
