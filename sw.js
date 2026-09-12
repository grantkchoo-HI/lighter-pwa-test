const CACHE = "lighter-v0.1.0-security1";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.json",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./js/app.js", "./js/state.js", "./js/storage.js", "./js/engine.js",
  "./js/strategies.js", "./js/backup.js", "./js/format.js"
];
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
const INDEX_URL = new URL("./index.html", self.registration.scope).href;
const SCOPE_PATH = new URL(self.registration.scope).pathname;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  const isAppNavigation = event.request.mode === "navigate" && (url.pathname === SCOPE_PATH || url.pathname === `${SCOPE_PATH}index.html`);
  const cacheKey = isAppNavigation ? INDEX_URL : url.href;
  if (!isAppNavigation && !ASSET_URLS.has(cacheKey)) return;

  event.respondWith(caches.match(cacheKey).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(cacheKey, response.clone()));
    return response;
  }).catch(() => isAppNavigation ? caches.match(INDEX_URL) : Response.error())));
});
