/* Service worker « réseau d'abord » :
   - En ligne : sert toujours la dernière version des fichiers (pas de cache figé).
   - Hors-ligne : sert la dernière copie mise en cache.
   Les requêtes vers d'autres origines (Firebase, polices, CDN, OpenFoodFacts)
   ne sont pas interceptées. */
const CACHE = "dici-cache-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // laisse passer Firebase/CDN/etc.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
