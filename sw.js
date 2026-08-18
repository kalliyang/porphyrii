/**
 * sw.js — Porphyrii service worker (PRD R-F10, SPEC §9).
 *
 * Strategy:
 *   - App shell + fonts + icons: precached at install (offline-capable).
 *   - Navigations: network-first, fall back to the cached shell offline.
 *   - Other same-origin GETs: cache-first with background refill.
 *   - /api/* (both endpoints are POST-only): network-first by nature —
 *     nothing is ever cached (R-NF5: user text must not persist); when the
 *     network is unreachable we synthesize a 503 with the same JSON shape
 *     the backend uses, so the UI's error path shows the offline copy
 *     instead of a bare TypeError.
 *
 * C7 (2026-08-17): vendor/espeak-ng/ landed (espeak-ng-wasm v0.1.1) — the
 * engine artifacts and the driver modules are precached below, so recitation
 * works offline after the first visit (R-NF6).
 */

const VERSION = "porphyrii-2026-08-18-w7c"; // main.js changed (verify_codes display) — precached content rule
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

self.addEventListener("install", (event) => {
  // cache: "reload" bypasses the browser HTTP cache: Pages serves assets
  // with max-age=14400, and a plain addAll could otherwise precache STALE
  // module versions after a deploy (mixed-version app shell). The VERSION
  // bump must always fetch fresh bytes.
  event.waitUntil(
    caches
      .open(PRECACHE_NAME)
      .then((cache) =>
        cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))
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
            .filter((k) => k !== PRECACHE_NAME && k !== RUNTIME_NAME)
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
    // Network-first by definition: POSTs are never cached (R-NF5).
    event.respondWith(fetch(event.request).catch(apiOfflineResponse));
    return;
  }

  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(RUNTIME_NAME).then((c) => c.put("/index.html", copy));
          return resp;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets: cache-first, refill from network when missing.
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ??
        fetch(event.request).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(RUNTIME_NAME).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
    )
  );
});
