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
