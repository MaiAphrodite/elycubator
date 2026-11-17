/*
 * PinkEggs service worker.
 *
 * Strategy, deliberately conservative so a deploy can never leave someone
 * staring at a stale dashboard:
 *   - navigations are network first, so a fresh HTML always wins when online
 *   - hashed build assets are cache first, which is safe because the filename
 *     changes with the content
 *   - /api traffic is never cached, a cached reading would be a lie
 *   - the cached shell is only used when the network is actually gone
 */
const VERSION = "v1";
const SHELL = `pinkeggs-shell-${VERSION}`;
const ASSETS = `pinkeggs-assets-${VERSION}`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL && key !== ASSETS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match("/")) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(ASSETS).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
    }),
  );
});
