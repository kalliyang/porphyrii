/**
 * app/audio.js — recitation state machine (the recitation behavior).
 *
 *   unloaded ──first click──▶ loading ──▶ ready ──play──▶ playing ──▶ ready
 *                               │
 *                               ▼
 *                          load-error (Retry)
 *
 * DOM-free: the orchestrator (main.js) subscribes to state changes and
 * renders the three button states. This module is the seam to the eSpeak
 * WASM driver (core/espeak-wasm-driver.js + vendor/espeak-ng/): `loadDriver`
 * is injected, defaults to a dynamic
 * import of the recitation module, and a missing driver degrades loudly into
 * load-error instead of breaking the page.
 */

export const AUDIO_STATES = ["unloaded", "loading", "ready", "playing", "load-error"];
export const DEFAULT_READING_RATE = 110;

export class AudioController {
  /**
   * @param {object} [deps]
   * @param {() => Promise<object>} [deps.loadDriver] resolves to the driver
   *   module (must expose playIPA / stop). Default: dynamic import of the
   *   recitation driver module.
   */
  constructor(deps = {}) {
    this.state = "unloaded";
    this.driver = null;
    this.error = null;
    this._listeners = new Set();
    this._playGeneration = 0;
    this._loadDriver =
      deps.loadDriver ??
      (() =>
        import("../core/espeak-wasm-driver.js").then(async (m) => {
          // Await the engine's one-time download/compile so the "loading"
          // state spans the real engine wait, not just the module fetch.
          await m.ready();
          return m;
        }));
  }

  /** @param {(state:string, controller:AudioController) => void} fn */
  onStateChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _set(state, error = null) {
    if (!AUDIO_STATES.includes(state)) throw new Error(`bad audio state ${state}`);
    this.state = state;
    this.error = error;
    for (const fn of this._listeners) fn(state, this);
  }

  /** Load the driver (idempotent). Safe to call from the play handler. */
  async load() {
    if (this.state === "ready" || this.state === "playing") return true;
    if (this.state === "loading") return false;
    this._set("loading");
    try {
      this.driver = await this._loadDriver();
      this._set("ready");
      return true;
    } catch (err) {
      this.driver = null;
      this._set("load-error", err);
      return false;
    }
  }

  /**
   * Play an IPA string. Loads the driver on first use (the recitation behavior).
   * @param {string} ipa
   */
  async play(ipa, options = {}) {
    if (this.state === "playing") {
      this.stop();
      return;
    }
    if (this.state === "loading") return;
    const generation = ++this._playGeneration;
    const loaded = await this.load();
    if (!loaded || generation !== this._playGeneration) return;
    this._set("playing");
    try {
      const rate = Number(options.rate ?? DEFAULT_READING_RATE);
      if (!Number.isFinite(rate) || rate < 80 || rate > 175) throw new Error("Reading rate must be between 80 and 175.");
      await this.driver.playIPA(ipa, { ...options, rate });
    } catch (err) {
      if (generation === this._playGeneration) this._set("load-error", err);
      return;
    }
    if (generation === this._playGeneration) this._set("ready");
  }

  stop() {
    this._playGeneration++;
    try {
      this.driver?.stop?.();
    } finally {
      if (this.state === "playing") this._set("ready");
    }
  }
}
