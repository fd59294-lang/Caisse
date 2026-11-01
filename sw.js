/* Fonctionnement hors ligne : toute l'appli est gardée sur la tablette.
   Copie locale d'abord (démarrage instantané même sans réseau), mise à jour en arrière-plan. */
const VERSION = "caisse-v1.0.0";
const FICHIERS = ["./", "index.html", "style.css", "db.js", "escpos.js", "app.js", "xlsx.full.min.js",
  "manifest.webmanifest", "icone-192.png", "icone-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const garde = await cache.match(e.request, { ignoreSearch: true });
    const reseau = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
    if (garde) { e.waitUntil(reseau); return garde; }
    return (await reseau) || (await cache.match("index.html")) || new Response("Hors ligne", { status: 503 });
  }));
});
