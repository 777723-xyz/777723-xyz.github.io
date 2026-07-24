const CACHE_NAME = "portal-cache-v7";
const NAVIGATION_TIMEOUT_MS = 900;
const SHELL_URLS = [
  "/",
  "/index.html",
  "/styles.css?v=loader-20260721",
  "/app.js?v=playable-chinese-sort-20260724",
  "/game-sort.js?v=playable-chinese-sort-20260724",
  "/config.json",
  "/ads.json",
  "/assets/webrpg-background-mobile.webp",
  "/assets/loading-placeholder.jpg",
  "/assets/brand-avatar.webp",
  "/favicon.ico",
];
const JSON_PATHS = new Set(["/config.json", "/ads.json", "/games.json"]);
const SHELL_PATHS = new Set([
  "/styles.css",
  "/app.js",
  "/game-sort.js",
  "/assets/webrpg-background-mobile.webp",
  "/assets/webrpg-background-mobile.jpg",
  "/assets/loading-placeholder.jpg",
  "/assets/brand-avatar.webp",
  "/favicon.ico",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
    )),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithTimeout(request, "/index.html", event));
    return;
  }

  if (JSON_PATHS.has(url.pathname)) {
    event.respondWith(request.cache === "no-store"
      ? networkAndCache(request)
      : staleWhileRevalidate(request, event));
    return;
  }

  if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(networkFirstWithTimeout(request, request, event));
  }
});

async function networkFirstWithTimeout(request, fallbackPath, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request) || await cache.match(fallbackPath);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  if (!cached) return network;
  event.waitUntil(network.then(() => undefined));
  return Promise.race([
    network,
    new Promise((resolve) => setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS)),
  ]);
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  if (!cached) return network;
  event.waitUntil(network.then(() => undefined));
  return cached;
}

async function networkAndCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
