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
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
