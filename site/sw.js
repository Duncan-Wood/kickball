const CACHE_NAME = 'kickball-shell';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(fetch(request).then(
    async (response) => {
      if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    },
    async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached === undefined) throw new Error('Offline and not cached');
      return cached;
    },
  ));
});
