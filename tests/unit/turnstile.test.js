import { test } from "node:test";
import assert from "node:assert/strict";
import { TurnstileManager } from "../../app/turnstile.js";

test("verification runs on demand and resets before each single-use token", async (t) => {
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const calls = [];
  let token = 0;
  globalThis.window = { turnstile: {
    render(_container, options) {
      assert.equal(options.execution, "execute");
      calls.push("render");
      return "widget";
    },
    reset(widget) { assert.equal(widget, "widget"); calls.push("reset"); },
    execute(_container, options) { calls.push("execute"); options.callback(`token-${++token}`); },
  } };
  const manager = new TurnstileManager({ sitekey: "test", container: {} });
  manager.render();
  assert.deepEqual(calls, ["render"]);
  assert.equal(await manager.getToken(), "token-1");
  assert.equal(await manager.getToken(), "token-2");
  assert.deepEqual(calls, ["render", "reset", "execute", "reset", "execute"]);
});

test("aborting a challenge leaves an immediate new challenge independent", async (t) => {
  const callbacks = [];
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  globalThis.window = { turnstile: { render: () => "widget", reset() {},
    execute(_container, options) { callbacks.push(options); } } };
  const manager = new TurnstileManager({ sitekey: "test", container: {} });
  manager.render();
  const controller = new AbortController();
  const first = manager.getToken({ signal: controller.signal });
  controller.abort();
  const second = manager.getToken();
  callbacks[0].callback("stale");
  callbacks[1].callback("fresh");
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(await second, "fresh");
  await assert.rejects(manager.getToken({ signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(manager.getToken({ timeoutMs: 1 }), /timed out/);
});
