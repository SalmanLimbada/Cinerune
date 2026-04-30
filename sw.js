const STATIC_CACHE = "cinerune-static-v23";
const ASSETS = ["./", "./index.html", "./watch.html", "./lists.html", "./browse.html", "./search.html", "./top-rated.html", "./styles.css", "./app.js", "./watch.js", "./lists.js", "./browse.js", "./search.js", "./top-rated.js", "./shared-ui.js", "./auth-client.js", "./catalog.js", "./config.js", "./favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    const appShellPaths = new Set(["/", "/index.html", "/watch.html", "/lists.html", "/browse.html", "/search.html", "/top-rated.html", "/styles.css", "/app.js", "/watch.js", "/lists.js", "/browse.js", "/search.js", "/top-rated.js", "/shared-ui.js", "/auth-client.js", "/catalog.js", "/config.js", "/favicon.svg"]);
    const networkFirst = appShellPaths.has(url.pathname);

    if (networkFirst) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => caches.match(request))
      );
      return;
    }

    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);

        return cached || network;
      })
    );
  }
});
