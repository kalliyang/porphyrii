import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

function worker() {
  const origin = "https://porphyrii.org";
  const listeners = {};
  const stores = new Map();
  const key = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async match(request) { return entries.get(key(request))?.clone(); },
      async put(request, response) { entries.set(key(request), response.clone()); },
      async addAll(requests) {
        for (const request of requests) {
          assert.equal(request.cache, "reload");
          const path = new URL(request.url).pathname;
          assert.ok(existsSync(new URL(`../..${path === "/" ? "/index.html" : path}`, import.meta.url)), `missing precache asset: ${path}`);
          entries.set(key(request), new Response(path === "/index.html" ? "installed-html" : "installed-asset"));
        }
      },
    };
  };
  const caches = { async open(name) { return cache(name); }, async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); } };
  let offline = false;
  const context = vm.createContext({
    URL, Response,
    Request: class extends Request { constructor(url, options) { super(new URL(url, origin), options); } },
    caches,
    fetch: async () => { if (offline) throw new Error("offline"); return new Response("newer-network-release"); },
    self: { location: { origin }, clients: { async claim() {} }, async skipWaiting() {}, addEventListener(name, fn) { listeners[name] = fn; } },
  });
  vm.runInContext(readFileSync(new URL("../../sw.js", import.meta.url), "utf8"), context);
  async function lifecycle(name) {
    let pending;
    listeners[name]({ waitUntil(promise) { pending = promise; } });
    await pending;
  }
  async function request(path, { mode = "cors", method = "GET" } = {}) {
    let response;
    const pending = [];
    listeners.fetch({ request: { url: new URL(path, origin).href, mode, method },
      respondWith(promise) { response = promise; }, waitUntil(promise) { pending.push(promise); } });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { lifecycle, request, caches, setOffline(value) { offline = value; } };
}

test("an installed app never mixes newer network HTML with its cached modules", async () => {
  const w = worker();
  await w.lifecycle("install");
  assert.equal(await (await w.request("/", { mode: "navigate" })).text(), "installed-html");
  assert.equal(await (await w.request("/core/latin-scansion.js")).text(), "installed-asset");
  w.setOffline(true);
  assert.equal(await (await w.request("/", { mode: "navigate" })).text(), "installed-html");
  assert.equal(await (await w.request("/core/latin-scansion.js")).text(), "installed-asset");
  const response = await w.request("/api/analyze", { method: "POST" });
  assert.equal(response.status, 503);
  assert.match((await response.json()).reject_reason, /offline/);
});

test("activation removes only obsolete Porphyrii caches", async () => {
  const w = worker();
  await w.caches.open("precache-porphyrii-cache-6");
  await w.caches.open("unrelated-cache");
  await w.lifecycle("install");
  await w.lifecycle("activate");
  const keys = await w.caches.keys();
  assert.ok(!keys.includes("precache-porphyrii-cache-6"));
  assert.ok(keys.includes("unrelated-cache"));
});
