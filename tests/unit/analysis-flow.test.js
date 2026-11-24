import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as settle } from "node:timers/promises";

class Element extends EventTarget {
  value = "";
  children = [];
  classList = { toggle() {} };
  get firstChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  setAttribute(name, value) { this[name] = value; }
  after() {}
}

test("cancel and immediately analyze again while verification is pending", async (t) => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }
  const callbacks = [];
  const window = Object.assign(new EventTarget(), {
    turnstile: { render: () => "widget", reset() {}, execute(_el, options) { callbacks.push(options); } },
    matchMedia: () => new EventTarget(),
  });
  const document = Object.assign(new EventTarget(), {
    documentElement: { dataset: { theme: "light" } }, createElement: () => new Element(),
    getElementById: element, querySelector: element,
  });
  for (const [name, value] of Object.entries({ window, document, navigator: { onLine: true } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, JSON.parse(options.body).turnstile_token]);
    return Response.json({ reject_reason: "Selection is too long." }, { status: 413 });
  });
  await import("../../main.js");
  element("input-text").value = "Arma";
  const click = (id) => element(id).dispatchEvent(new Event("click"));
  click("analyze-btn");
  click("cancel-btn");
  click("analyze-btn");
  assert.equal(callbacks.length, 2);
  callbacks[0].callback("stale");
  await settle();
  assert.equal(element("form-alerts").children.length, 0);
  assert.equal(element("analyze-btn").disabled, true);
  assert.deepEqual(calls, []);
  callbacks[1].callback("fresh");
  await settle();
  assert.deepEqual(calls, [["/api/validate", "fresh"]]);
  assert.equal(element("analyze-btn").disabled, false);
  const alerts = element("form-alerts").children;
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].children.map((c) => c.textContent), ["This text can't be analyzed", "Selection is too long."]);
});
