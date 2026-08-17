/**
 * Unit tests for core/espeak-wasm-driver.js — the W7 recitation seam.
 *
 * Three layers:
 *   1. chunkIpa() — pure chunking logic (line/word boundaries, vendor cap).
 *   2. playChunks() — the sequential playback loop with injected stages
 *      (stop semantics without WebAudio).
 *   3. Integration smoke against the REAL vendored artifacts (Node):
 *      importing the module starts the engine init; playIPA() in Node gets
 *      all the way through init + mapping + synthesis and only stops at the
 *      (absent) AudioContext — proving the vendored wasm/data/la.json work
 *      from the integrated layout. The vendored driver itself is additionally
 *      exercised directly for a non-silence assertion on golden IPA.
 *
 * Run: node --test tests/unit/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunkIpa,
  playChunks,
  playIPA,
  stop,
} from "../../core/espeak-wasm-driver.js";
import {
  init as vendorInit,
  synthesize as vendorSynthesize,
} from "../../vendor/espeak-ng/espeak-wasm-driver.js";
import { fileURLToPath } from "node:url";

const GOLD_LINE1 =
  "ˈar.ma wɪ.ˈrʊm.kʷɛ ˈka.noː ˈtrɔj.jaɪ̯ kʷiː ˈpriː.mʊ.sa.ˈboː.riːs";

/* ------------------------------------------------------------- chunkIpa */

test("chunkIpa: one chunk per line, blank lines dropped", () => {
  assert.deepEqual(chunkIpa("a b\n\nc d\n"), ["a b", "c d"]);
});

test("chunkIpa: lines within the limit stay whole even if the total exceeds it", () => {
  const line = "x".repeat(300);
  assert.deepEqual(chunkIpa(`${line}\n${line}`), [line, line]);
});

test("chunkIpa: an over-long line splits at word boundaries, never over the cap", () => {
  const words = Array.from({ length: 40 }, (_, i) => `w${String(i).padStart(2, "0")}${"a".repeat(20)}`);
  const chunks = chunkIpa(words.join(" "), 100);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok([...c].length <= 100, `chunk too long: ${c.length}`);
  assert.equal(chunks.join(" "), words.join(" ")); // lossless modulo re-joining
});

test("chunkIpa: defensive hard-split for a single word over the cap", () => {
  const chunks = chunkIpa("z".repeat(950), 450);
  assert.deepEqual(chunks.map((c) => c.length), [450, 450, 50]);
});

test("chunkIpa: empty and whitespace input yields no chunks", () => {
  assert.deepEqual(chunkIpa(""), []);
  assert.deepEqual(chunkIpa(" \n \n"), []);
  assert.deepEqual(chunkIpa(null), []);
});

test("chunkIpa: suprasegmentals (stress marks, syllable dots) survive chunking", () => {
  const chunks = chunkIpa(GOLD_LINE1);
  assert.deepEqual(chunks, [GOLD_LINE1]);
});

/* ------------------------------------------------------------ playChunks */

const fakePcm = { pcm: new Int16Array([0, 1]), sampleRate: 22050 };

test("playChunks: chunks synthesize and play in order", async () => {
  const synthCalls = [];
  const playCalls = [];
  const done = await playChunks(["a", "b", "c"], {
    synthesize: async (c) => {
      synthCalls.push(c);
      return fakePcm;
    },
    play: async () => playCalls.push(1),
    isStopped: () => false,
  });
  assert.equal(done, true);
  assert.deepEqual(synthCalls, ["a", "b", "c"]);
  assert.equal(playCalls.length, 3);
});

test("playChunks: stopped before the first chunk does no work", async () => {
  let synthCalls = 0;
  const done = await playChunks(["a"], {
    synthesize: async () => {
      synthCalls++;
      return fakePcm;
    },
    play: async () => {},
    isStopped: () => true,
  });
  assert.equal(done, false);
  assert.equal(synthCalls, 0);
});

test("playChunks: stop during playback cancels the remaining queue", async () => {
  let stopped = false;
  const played = [];
  const done = await playChunks(["a", "b", "c"], {
    synthesize: async () => fakePcm,
    play: async () => {
      played.push(1);
      stopped = true; // stop() lands while the first chunk sounds
    },
    isStopped: () => stopped,
  });
  assert.equal(done, false);
  assert.equal(played.length, 1);
});

/* ------------------------------------------- integration smoke (real wasm)
 *
 * Importing core/espeak-wasm-driver.js already kicked off the engine init
 * (module side effect, by design). In Node, playIPA() therefore runs the
 * full pipeline — init from the vendor/ layout, mapping load, golden-IPA
 * synthesis — and only fails at WebAudio playback, which does not exist in
 * Node. Anything earlier in the chain failing would surface as a different
 * error, so asserting the DriverStateError proves the integrated pipeline.
 */

test("integration: playIPA in Node reaches playback (init + synthesis OK)", async () => {
  await assert.rejects(playIPA(GOLD_LINE1), {
    name: "DriverStateError",
    message: /no AudioContext/,
  });
});

test("integration: vendored driver synthesizes non-silent PCM from golden IPA", async () => {
  const base = new URL("../../vendor/espeak-ng/", import.meta.url);
  await vendorInit({
    wasmURL: fileURLToPath(new URL("espeak-ng.wasm", base)),
    dataURL: fileURLToPath(new URL("espeak-ng.data", base)),
  });
  const { pcm, sampleRate, durationMs } = await vendorSynthesize(GOLD_LINE1);
  assert.equal(sampleRate, 22050);
  assert.ok(pcm.length > 1000, `suspiciously short utterance: ${pcm.length} samples`);
  assert.ok(durationMs > 100, `suspiciously short duration: ${durationMs} ms`);
  const peak = pcm.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
  assert.ok(peak > 500, `utterance looks silent (peak ${peak})`);
});

test("integration: stop() with nothing playing is a safe no-op", () => {
  assert.doesNotThrow(() => stop());
});
