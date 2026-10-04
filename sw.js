/* Grocery Map service worker.
   - Our own pages/files: network first (updates show up right away), cache as the offline fallback.
   - Firebase/fonts from Google's CDNs: cache first (their URLs are versioned).
   - Only touches caches that start with "grocery-map-", so it never wipes other apps on the same domain.
   Bump CACHE (v3 -> v4) to force old caches out on the next visit. */
const PREFIX = "grocery-map-";
const CACHE = PREFIX + "v3";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const CDN = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  return caches.open(CACHE).then(cache => {
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
    const cached = () => cache.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === "navigate" ? cache.match("./") : undefined));
    return new Promise(resolve => {
      let done = false;
      const finish = r => { if (!done && r) { done = true; resolve(r); } };
      net.then(finish).catch(() => cached().then(hit => {
        if (hit) finish(hit); else if (!done) { done = true; resolve(Response.error()); }
      }));
      setTimeout(() => cached().then(finish), 3000); // weak signal: use the saved copy after 3 seconds
    });
  });
}

function cacheFirst(req) {
  return caches.open(CACHE).then(cache =>
    cache.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    }))
  );
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
  else if (CDN.includes(url.hostname)) e.respondWith(cacheFirst(req));
  // everything else (Firestore's live traffic) goes straight to the network
});
