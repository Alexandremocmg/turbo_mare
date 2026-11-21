const scope = self.registration.scope;
const prefix = 'turbo-mare:' + scope + ':';
const cacheName = prefix + '__BUILD_HASH__';
const shell = new URL('index.html', scope).href;
const assets = __PRECACHE_FILES__.map(file => new URL(file, scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(assets.map(url => new Request(url, {cache: 'reload'})))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  const isEntry = event.request.mode === 'navigate' && (url.href === scope || url.href === shell);
  if (!isEntry && !assets.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(isEntry ? shell : url.href) || fetch(event.request);
  })());
});
