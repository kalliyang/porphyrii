

const VERSION = "porphyrii-cache-8";
const RELEASE = "2026-09-19.1";
const PRECACHE_NAME = `precache-${VERSION}`;
const RUNTIME_NAME = `runtime-${VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/tokens.css",
  "/style.css",
  "/main.js",
  "/app/audio.js",
  "/app/db.js",
  "/app/ipa.js",
  "/app/scansion-view.js",
  "/app/turnstile.js",
  "/services/text-integrity.js",
  "/core/latin-g2p.js",
  "/core/latin-quantity.js",
  "/core/latin-scansion.js",
  "/core/syllable-overrides.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/fonts/Cardo-Regular.woff2",
  "/fonts/Cardo-Bold.woff2",
  "/fonts/Cardo-Italic.woff2",
  "/fonts/Inter-Variable.woff2",
  // Recitation engine (espeak-ng-wasm v0.1.1, ~1.1 MB pre-gzip total)
  "/core/espeak-wasm-driver.js",
  "/vendor/espeak-ng/espeak-wasm-driver.js",
  "/vendor/espeak-ng/espeak-ng.js",
  "/vendor/espeak-ng/espeak-ng.wasm",
  "/vendor/espeak-ng/espeak-ng.data",
  "/vendor/espeak-ng/la.json",
];
// Distinct request URLs escape earlier workers' unversioned module caches.
// Keep these aliases precached so the versioned HTML also works offline.
const RELEASE_ASSETS = PRECACHE.filter((path) => /\.(js|css)$/.test(path))
  .map((path) => `${path}?release=${RELEASE}`);

self.addEventListener("install", (event) => {
  // cache: "reload" bypasses the browser HTTP cache so an application update
  // cannot precache a mixed-version app shell. A VERSION bump must always
  // fetch fresh bytes.
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) =>
        cache.addAll([...PRECACHE, ...RELEASE_ASSETS].map((u) => new Request(u, { cache: "reload" })))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => /^(precache|runtime)-porphyrii-cache-/.test(k) && k !== PRECACHE_NAME && k !== RUNTIME_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Synthetic offline response for API calls (same shape as the backend). */
function apiOfflineResponse() {
  return new Response(
    JSON.stringify({
      ok: false,
      reject_reason:
        "You appear to be offline. Analysis needs a network connection; your saved history is still available.",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // Turnstile & co. pass through

  if (url.pathname.startsWith("/api/")) {
    // Analysis POST requests are network-only and are never cached.
    event.respondWith(fetch(event.request).catch(apiOfflineResponse));
    return;
  }

  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    // HTML and its module graph must come from the same installed release.
    event.respondWith(
      caches.open(PRECACHE_NAME).then((cache) => cache.match("/index.html"))
        .then((hit) => hit ?? fetch(event.request))
    );
    return;
  }

  // Static assets: cache-first, refill from network when missing.
  event.respondWith(
    Promise.all([PRECACHE_NAME, RUNTIME_NAME].map((name) => caches.open(name).then((cache) => cache.match(event.request)))).then(([precache, runtime]) => precache ?? runtime).then(
      (hit) =>
        hit ??
        fetch(event.request).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            event.waitUntil(caches.open(RUNTIME_NAME).then((c) => c.put(event.request, copy)));
          }
          return resp;
        })
    )
  );
});
