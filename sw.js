const scope = self.registration.scope;
const prefix = 'turbo-mare:' + scope + ':';
const cacheName = prefix + '25f603c12f75699097cb';
const shell = new URL('index.html', scope).href;
const assets = ["index.html","manifest.webmanifest","icons/piloto-192.png","icons/piloto-512.png","icons/piloto-maskable.png","icons/apple-touch-icon.png"].map(file => new URL(file, scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(assets.map(url => new Request(url, {cache: 'reload'})))
  ).then(() => self.skipWaiting()));
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
