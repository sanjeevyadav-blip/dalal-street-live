const CACHE = 'dsl-v1';
const SHELL = ['./', './index.html', './manifest.json'];
self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL).catch(function(){}); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
// Network-first for the page so prices are never stale; cache is only a fallback.
// Market data requests are never cached.
self.addEventListener('fetch', function(e){
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.indexOf('workers.dev') !== -1 || url.hostname.indexOf('yahoo') !== -1) return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function(res){
      const copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      return res;
    }).catch(function(){ return caches.match(e.request); })
  );
});