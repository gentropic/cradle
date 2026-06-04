// cradle service worker
//
// Implements SPEC-cradle.md §9 and §9.1:
// - Version-prefixed cache name (cradle-v<n>)
// - Pre-caches the bootloader, manifest, and icons on install
// - Renderers AND pako are embedded in the bootloader HTML, so no separate
//   fetches and no third-party origin in the install set (a CDN outage at
//   install time can no longer break the offline guarantee)
// - On activate, deletes all cradle-v* caches that don't match the current version
//
// Caching strategy (deliberately split — see the fetch handler):
// - The BOOTLOADER (navigation / index.html) is **network-first** with a cache
//   fallback. The bootloader is the one asset that keeps gaining renderers and
//   dictionaries, so serving it cache-first silently breaks every newly-added
//   capsule type on already-installed clients (e.g. "unknown dict-id 'bio'") until
//   the cache version happens to change. Network-first keeps it current online and
//   still works offline (falls back to the last cached bootloader).
// - Static assets (manifest, icons) stay **cache-first** — they're version-gated and
//   rarely change. Runtime capsule resolutions (gh:, zenodo:, …) pass through.
//
// Bump CACHE_VERSION on any cached-asset change (still belt-and-suspenders for the
// static set; the bootloader self-updates regardless now).

const CACHE_VERSION = "cradle-v3";

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

  // Bootloader: NETWORK-FIRST. A navigation, or a direct hit on the root /
  // index.html, must reflect the latest curated renderers + dictionaries. Fetch
  // fresh, refresh the cached copy, and fall back to cache only when offline.
  const isBootloader =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/cradle/") ||
    url.pathname === "/";
  if (isBootloader) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Everything else: CACHE-FIRST. Static assets (manifest, icons) are version-gated;
  // runtime capsule resolutions (gh:, zenodo:, …) aren't in CORE_ASSETS, so they
  // simply fall through to the network with default semantics.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        // Re-throw the fetch failure (becomes a network error visible to the
        // renderer; appropriate for e.g. a doorbell POST that couldn't go through).
        throw new Error("offline and not cached: " + url);
      });
    })
  );
});
