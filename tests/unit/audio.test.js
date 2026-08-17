/**
 * Unit tests for app/audio.js — the recitation state machine seam
 * (UI.md §3.3). The eSpeak driver itself lands in C7; these tests pin the
 * state transitions against a stubbed loader.
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioController } from "../../app/audio.js";

function trace(c) {
  const seen = [];
  c.onStateChange((s) => seen.push(s));
  return seen;
}

test("initial state is unloaded", () => {
  assert.equal(new AudioController().state, "unloaded");
});

test("default loader (C7 module absent) degrades to load-error, never throws", async () => {
  const c = new AudioController(); // core/espeak-wasm-driver.js does not exist yet
  const seen = trace(c);
  const ok = await c.load();
  assert.equal(ok, false);
  assert.equal(c.state, "load-error");
  assert.ok(c.error);
  assert.deepEqual(seen, ["loading", "load-error"]);
});

test("load-error is retryable: a later successful load reaches ready", async () => {
  let attempts = 0;
  const c = new AudioController({
    loadDriver: async () => {
      attempts++;
      if (attempts === 1) throw new Error("wasm not vendored yet");
      return { playIPA: async () => {}, stop: () => {} };
    },
  });
  assert.equal(await c.load(), false);
  assert.equal(c.state, "load-error");
  assert.equal(await c.load(), true);
  assert.equal(c.state, "ready");
  assert.equal(attempts, 2);
});

test("play(): first click loads, then plays; end of playback returns to ready", async () => {
  const played = [];
  const c = new AudioController({
    loadDriver: async () => ({ playIPA: async (ipa) => played.push(ipa), stop: () => {} }),
  });
  const seen = trace(c);
  await c.play("ˈar.ma");
  assert.deepEqual(played, ["ˈar.ma"]);
  assert.equal(c.state, "ready");
  assert.deepEqual(seen, ["loading", "ready", "playing", "ready"]);
});

test("play() while playing acts as stop (UI.md §3.3 playing -> ready)", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  let stopped = 0;
  const c = new AudioController({
    loadDriver: async () => ({
      playIPA: () => gate,
      stop: () => {
        stopped++;
        release();
      },
    }),
  });
  const p = c.play("kʷiː");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.state, "playing");
  await c.play("kʷiː"); // toggles stop
  await p;
  assert.equal(stopped, 1);
  assert.equal(c.state, "ready");
});

test("play() surfaces driver failure as load-error", async () => {
  const c = new AudioController({
    loadDriver: async () => ({
      playIPA: async () => {
        throw new Error("synth exploded");
      },
    }),
  });
  await c.play("x");
  assert.equal(c.state, "load-error");
  assert.match(String(c.error), /synth exploded/);
});

test("play() on a missing driver stays in load-error (no silent failure)", async () => {
  const c = new AudioController({
    loadDriver: async () => {
      throw new Error("404");
    },
  });
  await c.play("x");
  assert.equal(c.state, "load-error");
});
