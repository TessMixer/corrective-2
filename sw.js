// NOC Incident - Main Service Worker (Cache / Offline)
const CACHE_NAME = "noc-v1";

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/styles/enterprise-theme.css",
  "/symphony-logo.jpg",
  "/manifest.json",
];

// Install — cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — Network first, fallback to cache
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, cross-origin (Firebase/CDN), and Netlify functions
  if (event.request.method !== "GET") return;
  if (!url.origin.includes(self.location.hostname)) return;
  if (url.pathname.startsWith("/.netlify/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful HTML/CSS/JS/image responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        // Network failed — serve from cache
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Fallback to index.html for navigation requests
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
          return new Response("Offline", { status: 503 });
        })
      )
  );
});

// Listen for messages from the app
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
