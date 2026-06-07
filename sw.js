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

const CACHE_VERSION = "cradle-v10";   // v10: recipe timer pause-confirm; v9: serving scaler field+multipliers; v8: shared social zoo

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

  // Bootloader: NETWORK-FIRST — fetch fresh, refresh the cached copy, fall back to
  // cache only when offline (the bootloader must reflect the latest renderers + dicts).
  // CRUCIAL: match ONLY this SW's own scope root / index.html, NOT the sub-tool editors
  // (bio/, contact/, doorbell/, arcr/) that share this scope but aren't this app — a
  // bare endsWith("/index.html") matched /cradle/bio/index.html and cached IT under the
  // bootloader key ("./index.html" → /cradle/index.html), poisoning the offline copy.
  const scope = new URL("./", self.location.href).pathname;   // "/cradle/" for /cradle/sw.js
  const isBootloader = url.origin === self.location.origin &&
    (url.pathname === scope || url.pathname === scope + "index.html");
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

  // Everything else: CACHE-FIRST. Static assets (manifest, icons) are version-gated.
  // The separately-cached `doc/` engine is RUNTIME-cached on first fetch (so it's offline
  // after the first doc render, without pre-caching its ~130 KB into every cold-start).
  // Runtime capsule resolutions (gh:, zenodo:, …) aren't in CORE_ASSETS and fall through.
  const isDocEngine = url.origin === self.location.origin && url.pathname.includes("/doc/");
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (isDocEngine && res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // Re-throw the fetch failure (becomes a network error visible to the
        // renderer; appropriate for e.g. a doorbell POST that couldn't go through).
        throw new Error("offline and not cached: " + url);
      });
    })
  );
});
