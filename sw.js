const STATIC_CACHE = "cinerune-static-v40-20260522-watch-notifications";
const ASSETS = [
  "./",
  "./index.html",
  "./watch.html",
  "./lists.html",
  "./browse.html",
  "./search.html",
  "./top-rated.html",
  "./recommended.html",
  "./trending.html",
  "./popular.html",
  "./airing-today.html",
  "./inbox.html",
  "./styles.css",
  "./app.js",
  "./watch.js",
  "./lists.js",
  "./browse.js",
  "./search.js",
  "./top-rated.js",
  "./recommended.js",
  "./trending.js",
  "./popular.js",
  "./airing-today.js",
  "./inbox.js",
  "./notifications.js",
  "./drag-scroll.js",
  "./shared-ui.js",
  "./shared-state.js",
  "./shared-utils.js",
  "./bookmark-sync.js",
  "./progress-sync.js",
  "./ui-toast.js",
  "./auth-client.js",
  "./catalog.js",
  "./config.js",
  "./favicon.svg",
  "./avatars/ironman.png",
  "./avatars/goku.jpg",
  "./avatars/darthvader.jpg",
  "./avatars/tonysoprano.jpg",
  "./avatars/luffy.jpg",
  "./avatars/walterwhite.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS).catch(() => undefined))
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
    const appShellPaths = new Set([
      "/",
      "/index.html",
      "/watch.html",
      "/lists.html",
      "/browse.html",
      "/search.html",
      "/top-rated.html",
      "/recommended.html",
      "/trending.html",
      "/popular.html",
      "/airing-today.html",
      "/inbox.html",
      "/styles.css",
      "/app.js",
      "/watch.js",
      "/lists.js",
      "/browse.js",
      "/search.js",
      "/top-rated.js",
      "/recommended.js",
      "/trending.js",
      "/popular.js",
      "/airing-today.js",
      "/inbox.js",
      "/notifications.js",
      "/drag-scroll.js",
      "/shared-ui.js",
      "/shared-state.js",
      "/shared-utils.js",
      "/bookmark-sync.js",
      "/progress-sync.js",
      "/ui-toast.js",
      "/auth-client.js",
      "/catalog.js",
      "/config.js",
      "/favicon.svg"
    ]);
    const networkFirst = appShellPaths.has(url.pathname);

    if (networkFirst) {
      event.respondWith(
        fetch(request, { cache: "no-store" })
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
        const network = fetch(request, { cache: "no-store" })
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
