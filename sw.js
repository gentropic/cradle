// cradle service worker
//
// Implements SPEC-cradle.md §9 and §9.1:
// - Version-prefixed cache name (cradle-v<n>)
// - Pre-caches the bootloader, manifest, and icons on install
// - Renderers AND pako are embedded in the bootloader HTML, so no separate
//   fetches and no third-party origin in the install set (a CDN outage at
//   install time can no longer break the offline guarantee)
// - On activate, deletes all cradle-v* caches that don't match the current version
// - Serves cached assets offline; falls through to network for anything not cached
//
// Bump CACHE_VERSION on any cached-asset change.

const CACHE_VERSION = "cradle-v2";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith("cradle-v") && k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-only: relay POSTs (e.g., ntfy.sh), POSTs in general
  if (event.request.method !== "GET") return;

  // Network-only: capsule reference resolutions (gh:, zenodo:, etc.) that
  // happen at runtime — those are someone else's caching concern. We can't
  // know in advance what URLs renderers will request; if they're not in
  // CORE_ASSETS, just let them through with default semantics.

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Offline fallback for the bootloader: serve the cached root.
        if (event.request.mode === "navigate") {
          return caches.match("./index.html").then((r) => r || caches.match("./"));
        }
        // Otherwise: re-throw the fetch failure (which becomes a network error
        // visible to the renderer; appropriate for e.g. a doorbell POST that
        // couldn't go through).
        throw new Error("offline and not cached: " + url);
      });
    })
  );
});
