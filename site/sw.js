const CACHE_NAME = 'kickball-shell';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function cacheKeyFor(request) {
  const { pathname } = new URL(request.url);
  const isTeamPage = request.mode === 'navigate' && (pathname.endsWith('/') || pathname.endsWith('/index.html'));
  return isTeamPage ? new URL('index.html', self.registration.scope).href : request;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  const key = cacheKeyFor(request);
  event.respondWith(fetch(request).then(
    async (response) => {
      if (response.ok) (await caches.open(CACHE_NAME)).put(key, response.clone());
      return response;
    },
    async () => {
      const cached = await caches.match(key);
      if (cached === undefined) throw new Error('Offline and not cached');
      return cached;
    },
  ));
});
