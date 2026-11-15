// Service worker: serve solo a rendere l'app installabile e ad aprirla
// anche senza rete. Mette in cache i FILE dell'app, non i dati
// (i dati li gestisce Firebase, online).
// Quando modifichi l'app, cambia il numero di versione qui sotto.
const VERSION = "canto-ore-v2";
const FILES = [
  "./", "index.html", "css/style.css",
  "js/app.js", "js/store.js", "js/utils.js", "js/config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Prima prova la rete (così vedi sempre l'ultima versione), se manca usa la cache
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
