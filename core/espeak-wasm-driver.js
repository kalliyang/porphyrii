/**
 * core/espeak-wasm-driver.js — recitation driver seam (W7).
 *
 * Thin adapter between app/audio.js and the vendored espeak-ng-wasm v0.1.1
 * driver (vendor/espeak-ng/, contract: espeak-ng-wasm INTERFACE.md §3).
 * The audio state machine consumes two functions:
 *
 *   playIPA(ipa)  → Promise<void>  (resolves when playback ends or is stopped)
 *   stop()        → void           (halts current playback; safe anytime)
 *
 * plus ready() → Promise<void>, which the controller's loader awaits so the
 * "loading" state covers the actual engine download/compile (UI.md §3.3).
 *
 * Why a wrapper instead of using the vendored module directly:
 *   1. stop(): the vendor contract has no stop — playback there is a single
 *      fire-and-forget AudioBufferSourceNode. Here we own the playback loop
 *      (synthesize per chunk, queue sources ourselves) so stop() can halt the
 *      current source and cancel the remaining queue via a generation token.
 *   2. Input length: the vendor synthesize() caps input at 500 IPA
 *      characters; a full analysis result is multi-line and can exceed that.
 *      chunkIpa() splits on line boundaries first, then at word boundaries.
 *   3. Wiring: artifact URLs are resolved relative to this module, so callers
 *      never deal with vendor paths.
 *
 * Lifecycle: importing this module starts the one-time engine load
 * immediately — app/audio.js's dynamic import IS the "loading" state
 * (UI.md §3.3), so the wasm/data fetch and compile overlap with it. A failed
 * init clears the in-flight promise so the Retry path re-initializes cleanly
 * (the vendored init is itself re-initializable after failure).
 *
 * Input: IPA strings from app/ipa.js deriveIpa(contract).lines — the G2P
 * engine's output, stress marks and syllable dots included (the vendored
 * driver understands both; INTERFACE.md §4).
 */

import * as vendor from "../vendor/espeak-ng/espeak-wasm-driver.js";

const VENDOR_BASE = new URL("../vendor/espeak-ng/", import.meta.url);
const IS_NODE =
  typeof process !== "undefined" &&
  !!process.versions &&
  !!process.versions.node;

/** Vendor input limit is 500 IPA chars (INTERFACE.md §3); keep margin. */
const MAX_CHUNK_CHARS = 450;

async function artifactURL(name) {
  const url = new URL(name, VENDOR_BASE);
  if (!IS_NODE) return url.href;
  // Node: the Emscripten loader feeds wasm/data paths to readFileSync —
  // plain filesystem paths, not file: URLs (INTERFACE.md §7).
  const { fileURLToPath } = await import("node:url");
  return fileURLToPath(url);
}

/* ------------------------------------------------------------ engine init */

let _initPromise = null;

function ensureInit() {
  if (!_initPromise) {
    _initPromise = (async () => {
      const [wasmURL, dataURL] = await Promise.all([
        artifactURL("espeak-ng.wasm"),
        artifactURL("espeak-ng.data"),
      ]);
      await vendor.init({ wasmURL, dataURL });
    })();
    // A rejected init must not poison retries: clear the cached promise so
    // the next playIPA() starts a fresh init. The .catch also suppresses the
    // otherwise-unhandled rejection from the eager load below.
    _initPromise.catch(() => {
      _initPromise = null;
    });
  }
  return _initPromise;
}

// Eager: the dynamic import of this module is the audio controller's
// "loading" state — start the one-time download/compile now, not on Play.
ensureInit();

/**
 * Resolves when the one-time engine load has finished (or rejects with the
 * init error). app/audio.js's default loader awaits this so the controller's
 * "loading" state spans the REAL download+compile instead of just the module
 * fetch; playIPA() awaits it internally as well.
 */
export function ready() {
  return ensureInit();
}

/* --------------------------------------------------------- IPA chunking */

/**
 * Split an IPA transcription into synthesize()-sized chunks: line boundaries
 * first (one verse line per chunk), then word boundaries for over-long lines
 * (prose). Pure; exported for tests.
 * @param {string} ipa
 * @param {number} [maxChars]
 * @returns {string[]}
 */
export function chunkIpa(ipa, maxChars = MAX_CHUNK_CHARS) {
  const chunks = [];
  for (const rawLine of String(ipa ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if ([...line].length <= maxChars) {
      chunks.push(line);
      continue;
    }
    let current = "";
    for (const word of line.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if ([...candidate].length <= maxChars) {
        current = candidate;
        continue;
      }
      if (current) chunks.push(current);
      // Defensive: a single "word" longer than the limit (never produced by
      // the G2P engine) is hard-split rather than sent over the vendor cap.
      let rest = word;
      while ([...rest].length > maxChars) {
        chunks.push([...rest].slice(0, maxChars).join(""));
        rest = [...rest].slice(maxChars).join("");
      }
      current = rest;
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

/* --------------------------------------------------------- playback loop */

let _audioCtx = null; // shared AudioContext (created on first playback)
let _currentSrc = null; // AudioBufferSourceNode currently sounding
let _playGen = 0; // generation token; stop()/new playIPA() invalidates loops

function playPcm(pcm, sampleRate) {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) {
    return Promise.reject(
      new vendor.DriverStateError("playIPA: no AudioContext in this environment")
    );
  }
  _audioCtx ??= new Ctor();
  const resume =
    _audioCtx.state === "suspended" ? _audioCtx.resume() : Promise.resolve();
  return resume.then(
    () =>
      new Promise((resolve) => {
        const buf = _audioCtx.createBuffer(1, pcm.length, sampleRate);
        const channel = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
        const src = _audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(_audioCtx.destination);
        _currentSrc = src;
        src.onended = () => {
          if (_currentSrc === src) _currentSrc = null;
          resolve();
        };
        src.start();
      })
  );
}

/**
 * Sequential chunk player with injected stages (unit-testable without
 * WebAudio). Returns true if every chunk played, false if stopped early.
 * @param {string[]} chunks
 * @param {object} stages
 * @param {(chunk:string) => Promise<{pcm:Int16Array, sampleRate:number}>} stages.synthesize
 * @param {(pcm:Int16Array, sampleRate:number) => Promise<void>} stages.play
 * @param {() => boolean} stages.isStopped
 */
export async function playChunks(chunks, { synthesize, play, isStopped }) {
  for (const chunk of chunks) {
    if (isStopped()) return false;
    const { pcm, sampleRate } = await synthesize(chunk);
    if (isStopped()) return false;
    await play(pcm, sampleRate);
  }
  return true;
}

/* ------------------------------------------------------------- public API */

/**
 * Synthesize and play an IPA transcription (multi-line OK). Resolves when
 * playback ends — or early, after stop(). The first call must be triggered
 * from a user gesture (browser autoplay policy); the engine load started at
 * import time is awaited here.
 * @param {string} ipa IPA with stress marks/syllable dots (G2P output)
 * @param {object} [options] { rate?: 80–450, pitch?: 0–99 } (vendor contract)
 */
export async function playIPA(ipa, options = {}) {
  await ensureInit();
  const gen = ++_playGen;
  await playChunks(chunkIpa(ipa), {
    synthesize: (chunk) => vendor.synthesize(chunk, options),
    play: playPcm,
    isStopped: () => gen !== _playGen,
  });
}

/** Halt current playback immediately and cancel the remaining queue. */
export function stop() {
  _playGen++;
  const src = _currentSrc;
  _currentSrc = null;
  if (src) {
    try {
      src.stop();
    } catch {
      /* source already ended */
    }
  }
}
