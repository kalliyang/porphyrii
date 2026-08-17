/**
 * app/audio.js — recitation state machine (UI.md §3.3).
 *
 *   unloaded ──first click──▶ loading ──▶ ready ──play──▶ playing ──▶ ready
 *                               │
 *                               ▼
 *                          load-error (Retry)
 *
 * DOM-free: the orchestrator (main.js) subscribes to state changes and
 * renders the three button states. The eSpeak WASM driver itself
 * (core/espeak-wasm-driver.js + vendor/espeak-ng/) lands in C7 — this
 * module is the seam: `loadDriver` is injected, defaults to a dynamic
 * import of the C7 module, and a missing driver degrades loudly into
 * load-error instead of breaking the page.
 */

export const AUDIO_STATES = ["unloaded", "loading", "ready", "playing", "load-error"];

export class AudioController {
  /**
   * @param {object} [deps]
   * @param {() => Promise<object>} [deps.loadDriver] resolves to the driver
   *   module (must expose playIPA / stop). Default: dynamic import of the
   *   C7 seam module.
   */
  constructor(deps = {}) {
    this.state = "unloaded";
    this.driver = null;
    this.error = null;
    this._listeners = new Set();
    this._loadDriver =
      deps.loadDriver ??
      (() => import("../core/espeak-wasm-driver.js"));
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
   * Play an IPA string. Loads the driver on first use (UI.md §3.3).
   * @param {string} ipa
   */
  async play(ipa) {
    if (this.state === "playing") {
      this.stop();
      return;
    }
    const loaded = await this.load();
    if (!loaded) return;
    this._set("playing");
    try {
      await this.driver.playIPA(ipa);
    } catch (err) {
      this._set("load-error", err);
      return;
    }
    this._set("ready");
  }

  stop() {
    try {
      this.driver?.stop?.();
    } finally {
      if (this.state === "playing") this._set("ready");
    }
  }
}
