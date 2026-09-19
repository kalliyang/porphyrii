import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

function worker() {
  const origin = "https://porphyrii.org";
  const listeners = {};
  const stores = new Map();
  const storedResponse = (body, redirected = false) => {
    const response = new Response(body);
    Object.defineProperty(response, "redirected", { value: redirected });
    response.clone = () => storedResponse(body, redirected);
    return response;
  };
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
          entries.set(key(request), storedResponse(["/", "/index.html"].includes(path) ? "installed-html" : "installed-asset", path === "/index.html"));
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
  const navigation = await w.request("/", { mode: "navigate" });
  assert.equal(navigation.redirected, false, "Pages' redirected index response must not be replayed as navigation");
  assert.equal(await navigation.text(), "installed-html");
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

test("the new HTML escapes legacy module caches and its complete module graph works offline", async () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const main = html.match(/<script type="module" src="([^"]+)"/)[1];
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  const paths = [main, ...styles, ...Object.values(imports)];
  const origin = "https://porphyrii.org";
  const releases = new Set(paths.map((path) => new URL(path, origin).searchParams.get("release")));
  assert.equal(releases.size, 1);
  assert.ok(!releases.has(null));
  const w = worker();
  const legacy = await w.caches.open("precache-porphyrii-cache-6");
  for (const path of paths) {
    const url = new URL(path, origin);
    await legacy.put(url.pathname, new Response("legacy-module"));
    assert.equal(await legacy.match(path), undefined, "the old worker must miss the release URL");
    if (!url.pathname.endsWith(".js")) continue;
    const source = readFileSync(new URL(`../..${url.pathname}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\(\s*)["']([./][^"']+\.js)["']/g)) {
      const imported = new URL(match[1], url).pathname;
      assert.ok(imports[imported], `unversioned import: ${imported}`);
    }
  }
  await w.lifecycle("install");
  await w.lifecycle("activate");
  w.setOffline(true);
  for (const path of paths) assert.equal(await (await w.request(path)).text(), "installed-asset", path);
});
